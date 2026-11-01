// ============================================================================
// session-persistence.js — Session cookie & fingerprint persistence.
// Maintains a cookie jar and consistent fingerprint across visits so
// sessions look like real returning users, not isolated bot visits.
// ============================================================================

import logger from '../utils/logger.js';

export class SessionPersistence {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      cookieTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxCookiesPerDomain: 50,
      fingerprintTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
      storeInMemory: true, // In-memory for dev; can be extended to SQLite
      ...config,
    };
    this.cookieJars = new Map(); // domain → [{ name, value, expires, path, domain, secure, httpOnly }]
    this.fingerprints = new Map(); // fingerprintId → { profile, created, lastUsed, visitCount }
    this.stats = { sessionsCreated: 0, cookiesStored: 0, fingerprintsCreated: 0, fingerprintsReused: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Get or create a persistent fingerprint for a visit.
   * Returns { profile, isNew } — profile is the full fingerprint, isNew is true if just created.
   */
  async getOrCreateFingerprint(fingerprintId = null) {
    if (fingerprintId && this.fingerprints.has(fingerprintId)) {
      const fp = this.fingerprints.get(fingerprintId);
      fp.lastUsed = Date.now();
      fp.visitCount++;
      this.stats.fingerprintsReused++;
      return { profile: { ...fp.profile, canvasSeed: fp.canvasSeed }, isNew: false, fingerprintId };
    }

    // Create new fingerprint
    const newId = `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const profile = await this._generateProfile();
    const canvasSeed = Math.floor(Math.random() * 1000000);
    this.fingerprints.set(newId, {
      profile,
      canvasSeed,
      created: Date.now(),
      lastUsed: Date.now(),
      visitCount: 1,
    });
    this.stats.fingerprintsCreated++;
    this.stats.sessionsCreated++;

    return { profile, isNew: true, fingerprintId: newId, canvasSeed };
  }

  /**
   * Generate a new fingerprint profile (internal).
   */
  async _generateProfile() {
    const { getRandomFingerprint } = await import('./user-agents.js');
    return getRandomFingerprint();
  }

  /**
   * Store cookies from a response.
   */
  storeCookies(domain, setCookieHeaders) {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return;

    if (!this.cookieJars.has(domain)) {
      this.cookieJars.set(domain, []);
    }

    const jar = this.cookieJars.get(domain);

    for (const cookieStr of setCookieHeaders) {
      try {
        const parts = cookieStr.split(';').map(s => s.trim());
        const [nameValue] = parts;
        const eqIdx = nameValue.indexOf('=');
        if (eqIdx === -1) continue;

        const name = nameValue.slice(0, eqIdx).trim();
        const value = nameValue.slice(eqIdx + 1).trim();

        const cookie = {
          name,
          value,
          expires: Date.now() + this.config.cookieTtl,
          path: '/',
          domain,
          secure: false,
          httpOnly: false,
        };

        // Parse attributes
        for (let i = 1; i < parts.length; i++) {
          const [key, ...rest] = parts[i].split('=');
          const val = rest.join('=').trim();
          if (key.toLowerCase() === 'expires') {
            cookie.expires = new Date(val).getTime() || Date.now() + this.config.cookieTtl;
          } else if (key.toLowerCase() === 'max-age') {
            cookie.expires = Date.now() + parseInt(val, 10) * 1000;
          } else if (key.toLowerCase() === 'domain') {
            cookie.domain = val;
          } else if (key.toLowerCase() === 'path') {
            cookie.path = val;
          } else if (key.toLowerCase() === 'secure') {
            cookie.secure = true;
          } else if (key.toLowerCase() === 'httponly') {
            cookie.httpOnly = true;
          }
        }

        // Remove expired cookies
        const filtered = jar.filter(c => c.expires > Date.now());
        filtered.push(cookie);

        // Cap cookies per domain
        if (filtered.length > this.config.maxCookiesPerDomain) {
          filtered.splice(0, filtered.length - this.config.maxCookiesPerDomain);
        }

        this.cookieJars.set(domain, filtered);
        this.stats.cookiesStored++;
      } catch (err) {
        logger.warn(`Failed to parse cookie: ${err.message}`);
      }
    }
  }

  /**
   * Get cookies for a domain as Cookie header string.
   */
  getCookies(domain) {
    const jar = this.cookieJars.get(domain);
    if (!jar) return '';
    return jar
      .filter(c => c.expires > Date.now())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
  }

  /**
   * Get cookies as array (for browser mode Cookie header).
   */
  getCookieArray(domain) {
    const jar = this.cookieJars.get(domain);
    if (!jar) return [];
    return jar.filter(c => c.expires > Date.now());
  }

  /**
   * Clear all cookies for a domain.
   */
  clearCookies(domain) {
    this.cookieJars.delete(domain);
  }

  /**
   * Get fingerprint stats.
   */
  getFingerprintStats() {
    return {
      total: this.fingerprints.size,
      active: [...this.fingerprints.values()].filter(f => Date.now() - f.lastUsed < this.config.fingerprintTtl).length,
      expired: [...this.fingerprints.values()].filter(f => Date.now() - f.lastUsed > this.config.fingerprintTtl).length,
    };
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      fingerprintStats: this.getFingerprintStats(),
      cookieDomains: this.cookieJars.size,
    };
  }
}

export default SessionPersistence;
