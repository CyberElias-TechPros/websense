// ============================================================================
// profile-manager.js — Return visitor profile management.
// Features:
//   • Persistent visitor profiles (stable fingerprints, cookies, proxy affinity)
//   • Geographic affinity (visitor returns to same country/proxy)
//   • Visit history per profile (recency, frequency, actions)
//   • Cookie/session persistence across runs
// ============================================================================

import logger from '../utils/logger.js';

export class ProfileManager {
  constructor(store, config = {}) {
    this.store = store;
    this.config = {
      maxProfiles: 10000,
      returnRate: 0.35, // 35% of sessions are return visitors
      profileTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
      ...config,
    };
    this.cache = new Map();
  }

  async init() {
    // Schema evolution: proxy stickiness columns (guarded, added once).
    for (const col of [
      'ALTER TABLE visitor_profiles ADD COLUMN proxy_host TEXT',
      'ALTER TABLE visitor_profiles ADD COLUMN proxy_port INTEGER',
    ]) {
      try { this.store.db.exec(col); } catch { /* already exists */ }
    }
    // Preload existing profiles into cache
    const stmt = this.store.db.prepare('SELECT * FROM visitor_profiles ORDER BY last_visited_at DESC LIMIT ?');
    const profiles = stmt.all(500);
    for (const p of profiles) {
      this.cache.set(p.id, p);
    }
    logger.info(`[ProfileManager] Loaded ${profiles.length} visitor profiles into cache`);
  }

  /**
   * Bind a proxy to a visitor profile — a returning visitor should come back
   * through the same egress IP (cookies/consent/identity stay consistent).
   */
  async bindProxy(profileId, proxy) {
    if (!profileId || !proxy) return;
    const profile = this.cache.get(profileId) || await this.getProfile(profileId);
    if (!profile) return;
    profile.proxy_host = proxy.host;
    profile.proxy_port = proxy.port;
    this.cache.set(profileId, profile);
    try {
      this.store.db.prepare(
        'UPDATE visitor_profiles SET proxy_host = ?, proxy_port = ? WHERE id = ?'
      ).run(proxy.host, proxy.port, profileId);
    } catch { /* column missing on old DBs — cache still holds it */ }
  }

  /**
   * Return the profile's bound proxy if it's still in the pool and active,
   * otherwise null (caller falls back to normal selection and re-binds).
   */
  getBoundProxy(profileId, proxyManager) {
    const profile = this.cache.get(profileId);
    if (!profile?.proxy_host || !proxyManager) return null;
    const bound = proxyManager.proxies.find(
      (p) => p.host === profile.proxy_host && p.port === profile.proxy_port
    );
    if (!bound) return null;
    if (!bound.enabled || bound.archived) return null;
    if (bound.circuitOpen && bound.circuitOpenUntil > Date.now()) return null;
    return bound;
  }

  async createProfile({ proxy, userAgent, fingerprintSeed, country }) {
    const id = `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const profile = {
      id,
      proxy_country: country,
      user_agent: userAgent,
      fingerprint_seed: fingerprintSeed,
      created_at: Date.now(),
      last_visited_at: Date.now(),
      visit_count: 1,
      total_pages_visited: 0,
    };
    const stmt = this.store.db.prepare(
      `INSERT OR REPLACE INTO visitor_profiles (id, proxy_country, user_agent, fingerprint_seed, created_at, last_visited_at, visit_count, total_pages_visited)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(profile.id, profile.proxy_country, profile.user_agent, profile.fingerprint_seed, profile.created_at, profile.last_visited_at, profile.visit_count, profile.total_pages_visited);
    this.cache.set(id, profile);
    return profile;
  }

  async getProfile(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const stmt = this.store.db.prepare('SELECT * FROM visitor_profiles WHERE id = ?');
    const profile = stmt.get(id);
    if (profile) this.cache.set(id, profile);
    return profile;
  }

  async getRandomReturnProfile() {
    // Pick a profile that's been visited before and is within TTL
    const profiles = this.cache.values().filter((p) => Date.now() - p.last_visited_at < this.config.profileTTL);
    if (profiles.length === 0) return null;
    const fresh = profiles.filter((p) => Date.now() - p.last_visited_at > 3600_000);
    const pool = fresh.length > 0 ? fresh : profiles;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async recordVisit(profileId, { url, pages, latency }) {
    const profile = this.cache.get(profileId) || await this.getProfile(profileId);
    if (!profile) return;
    profile.last_visited_at = Date.now();
    profile.visit_count = (profile.visit_count || 0) + 1;
    profile.total_pages_visited = (profile.total_pages_visited || 0) + pages;
    const stmt = this.store.db.prepare(
      'UPDATE visitor_profiles SET last_visited_at = ?, visit_count = ?, total_pages_visited = ? WHERE id = ?'
    );
    stmt.run(profile.last_visited_at, profile.visit_count, profile.total_pages_visited, profileId);
    this.cache.set(profileId, profile);
  }

  async shouldReturnVisitor(proxyCountry) {
    if (Math.random() * 100 > this.config.returnRate * 100) return null;
    const all = [...this.cache.values()].filter((p) => Date.now() - p.last_visited_at < this.config.profileTTL);
    // No country constraint (undefined) → any profile; otherwise prefer same-country
    const matching = proxyCountry
      ? all.filter((p) => p.proxy_country === proxyCountry)
      : all;
    const pool = matching.length > 0 ? matching : all;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async getStats() {
    const totalStmt = this.store.db.prepare('SELECT COUNT(*) as count FROM visitor_profiles');
    const total = totalStmt.get();
    const recentStmt = this.store.db.prepare(
      'SELECT COUNT(*) as count FROM visitor_profiles WHERE last_visited_at > ?'
    );
    const recent = recentStmt.get(Date.now() - this.config.profileTTL);
    return {
      totalProfiles: total?.count || 0,
      activeProfiles: recent?.count || 0,
      cacheSize: this.cache.size,
      returnRate: this.config.returnRate,
      profileTTL: this.config.profileTTL,
    };
  }
}

export default ProfileManager;
