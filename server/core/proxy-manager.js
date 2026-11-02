// ============================================================================
// proxy-manager.js — Proxy pool management.
// Responsibilities:
//   • Health checking (TCP connect + HTTP probe through the proxy)
//   • Rotation strategies: round-robin, random, weighted, geo-spread
//   • Per-proxy metrics (success/fail counts, latency, success rate)
//   • Circuit breaker: cool down after consecutive failures, half-open probe
//   • Enable/disable toggles, last-used tracking
// ============================================================================

import axios from 'axios';
import net from 'node:net';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import db, { withTransaction } from '../database/db.js';
import logger from '../utils/logger.js';

export class ProxyManager {
  constructor(proxies, healthConfig = {}) {
    this.proxies = proxies.map((p) => ({
      ...p,
      id: `${p.host}:${p.port}`,
      enabled: true,
      status: 'unknown',
      successCount: 0,
      failCount: 0,
      totalLatency: 0,
      avgLatency: 0,
      lastUsed: null,
      lastChecked: null,
      consecutiveFailures: 0,
      circuitOpen: false,
      circuitOpenUntil: null,
      archived: false, // free proxies only — archived after repeated failures
      toJSON() {
        const { username, password, ...rest } = this;
        return rest;
      },
    }));
    this.currentIndex = 0;
    this.healthConfig = {
      timeout: 10000,
      circuitOpenAfter: 5,
      circuitCooldownMs: 60000,
      // Free proxies (source === 'free') that fail this many times in a row
      // are ARCHIVED (disabled + flagged) instead of just circuit-broken.
      // Paid (Webshare) proxies are never archived. 0 disables.
      archiveFreeAfterFailures: 0,
      ...healthConfig,
    };
    this._initDbStats();
  }

  // -----------------------------------------------------------------------
  // Persistence bootstrap
  // -----------------------------------------------------------------------
  _initDbStats() {
    // Schema evolution: archiving columns (added once, guarded).
    for (const col of [
      'ALTER TABLE proxy_stats ADD COLUMN archived INTEGER DEFAULT 0',
      "ALTER TABLE proxy_stats ADD COLUMN archive_reason TEXT DEFAULT NULL",
    ]) {
      try { db.exec(col); } catch { /* column already exists */ }
    }
    const upsert = db.prepare(`
      INSERT INTO proxy_stats (host, port, country, city, flag, enabled, status)
      VALUES (?, ?, ?, ?, ?, 1, 'unknown')
      ON CONFLICT(host) DO UPDATE SET
        port = excluded.port,
        country = excluded.country,
        city = excluded.city,
        flag = excluded.flag,
        enabled = CASE WHEN proxy_stats.enabled IS NULL THEN 1 ELSE proxy_stats.enabled END
    `);
    withTransaction(() => {
      for (const p of this.proxies) {
        upsert.run(p.host, p.port, p.country, p.city, p.flag);
      }
    });

    // Hydrate live state from DB (enabled flags, counters)
    for (const p of this.proxies) {
      const row = db.prepare('SELECT * FROM proxy_stats WHERE host = ?').get(p.host);
      if (row) {
        p.enabled = !!row.enabled;
        p.successCount = row.success_count || 0;
        p.failCount = row.fail_count || 0;
        p.totalLatency = row.total_latency || 0;
        p.avgLatency =
          p.successCount + p.failCount > 0
            ? Math.round(p.totalLatency / (p.successCount + p.failCount))
            : 0;
        p.archived = !!row.archived;
        if (p.archived) p.enabled = false;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Proxy URL / agent construction
  // -----------------------------------------------------------------------
  createProxyUrl(proxy) {
    const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@` : '';
    const type = proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5' : 'http';
    return `${type}://${auth}${proxy.host}:${proxy.port}`;
  }

  createAgent(proxy, isHttps = true) {
    const isSocks = proxy.type === 'socks5' || proxy.type === 'socks';
    if (isSocks) {
      const proxyUrl = this.createProxyUrl(proxy);
      return new SocksProxyAgent(proxyUrl);
    }
    const proxyUrl = this.createProxyUrl(proxy);
    return isHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
  }

  // -----------------------------------------------------------------------
  // Selection strategies
  // -----------------------------------------------------------------------
  getActiveProxies() {
    const now = Date.now();
    const active = [];
    for (const p of this.proxies) {
      if (!p.enabled) continue;
      if (p.circuitOpen) {
        if (p.circuitOpenUntil > now) continue;
        // Half-open: allow one probe request
        p.circuitOpen = false;
        p.consecutiveFailures = 0;
      }
      active.push(p);
    }
    return active;
  }

  /** Round-robin over active proxies. */
  getNext() {
    const active = this.getActiveProxies();
    if (active.length === 0) return null;
    const proxy = active[this.currentIndex % active.length];
    this.currentIndex = (this.currentIndex + 1) % active.length;
    proxy.lastUsed = new Date().toISOString();
    return proxy;
  }

  /** Uniform random selection. */
  getRandom() {
    const active = this.getActiveProxies();
    if (active.length === 0) return null;
    const proxy = active[Math.floor(Math.random() * active.length)];
    proxy.lastUsed = new Date().toISOString();
    return proxy;
  }

  /** Weighted by success history (successes + 1) — deprioritizes flaky proxies. */
  getWeighted() {
    const active = this.getActiveProxies();
    if (active.length === 0) return null;
    const total = active.reduce((sum, p) => sum + (p.successCount + 1), 0);
    let random = Math.random() * total;
    for (const p of active) {
      random -= p.successCount + 1;
      if (random <= 0) {
        p.lastUsed = new Date().toISOString();
        return p;
      }
    }
    return active[0];
  }

  /**
   * Least-recently-used selection: pick the proxy that hasn't been used
   * longest. Natural distribution without concentration.
   */
  getLeastRecentlyUsed() {
    const active = this.getActiveProxies();
    if (active.length === 0) return null;
    // Sort by lastUsed ascending (null/undefined first), pick the first
    const sorted = [...active].sort((a, b) => {
      const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return aTime - bTime;
    });
    const proxy = sorted[0];
    proxy.lastUsed = new Date().toISOString();
    return proxy;
  }

  /**
   * Geo-spread selection: try to balance visits across countries so no single
   * geo gets all the traffic. Returns null if nothing healthy remains.
   */
  getGeoSpread() {
    const active = this.getActiveProxies();
    if (active.length === 0) return null;

    // Count visits per country in the last hour.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const counts = {};
    for (const row of db
      .prepare(
        `SELECT proxy_country, COUNT(*) as c FROM visits WHERE created_at > ? GROUP BY proxy_country`
      )
      .all(since)) {
      counts[row.proxy_country] = row.c;
    }

    const minCount = Math.min(...Object.values(counts), 0);
    const candidates = active.filter(
      (p) => (counts[p.country] || 0) <= minCount + 1
    );
    const pool = candidates.length > 0 ? candidates : active;
    const proxy = pool[Math.floor(Math.random() * pool.length)];
    proxy.lastUsed = new Date().toISOString();
    return proxy;
  }

  /**
   * Active proxies in a specific country (ISO-3166 alpha-2, case-insensitive).
   */
  getByCountry(country) {
    if (!country) return [];
    const cc = String(country).toUpperCase();
    return this.getActiveProxies().filter((p) => (p.country || '').toUpperCase() === cc);
  }

  /**
   * Geo-match selection: prefer proxies whose country matches the visitor
   * profile's locale country (fingerprint ↔ proxy consistency), falling back
   * to the normal pool when none are available.
   */
  getGeoMatched(preferCountry) {
    if (preferCountry) {
      const pool = this.getByCountry(preferCountry);
      if (pool.length > 0) {
        const proxy = pool[Math.floor(Math.random() * pool.length)];
        proxy.lastUsed = new Date().toISOString();
        return proxy;
      }
    }
    return this.getRandom();
  }

  /** Pick a strategy by name, defaulting to random. */
  select(strategy = 'random', opts = {}) {
    // Soft geo-match: when the caller passes preferCountry (derived from the
    // fingerprint's locale), try to honor it for the common strategies.
    const useGeoMatch = strategy === 'geo-match' || (opts.preferCountry && opts.geoMatch !== false);
    switch (strategy) {
      case 'geo-match':
        return this.getGeoMatched(opts.preferCountry);
      case 'round-robin':
        return useGeoMatch && opts.preferCountry ? (this.getGeoMatched(opts.preferCountry) || this.getNext()) : this.getNext();
      case 'weighted':
        return useGeoMatch && opts.preferCountry ? (this.getGeoMatched(opts.preferCountry) || this.getWeighted()) : this.getWeighted();
      case 'geo':
        return useGeoMatch && opts.preferCountry ? (this.getGeoMatched(opts.preferCountry) || this.getGeoSpread()) : this.getGeoSpread();
      case 'random':
      default:
        return useGeoMatch && opts.preferCountry ? this.getGeoMatched(opts.preferCountry) : this.getRandom();
    }
  }

  // -----------------------------------------------------------------------
  // Metrics recording
  // -----------------------------------------------------------------------
  recordSuccess(proxy, latency) {
    proxy.successCount++;
    proxy.totalLatency += latency;
    proxy.avgLatency = Math.round(
      proxy.totalLatency / (proxy.successCount + proxy.failCount)
    );
    proxy.consecutiveFailures = 0;
    proxy.status = 'healthy';

    db.prepare(`
      UPDATE proxy_stats SET
        success_count = success_count + 1,
        total_latency = total_latency + ?,
        last_used = datetime('now'),
        status = 'healthy'
      WHERE host = ?
    `).run(latency, proxy.host);
  }

  recordFailure(proxy, errorType) {
    proxy.failCount++;
    proxy.consecutiveFailures++;
    proxy.status = proxy.consecutiveFailures >= 3 ? 'degraded' : 'healthy';

    if (proxy.consecutiveFailures >= this.healthConfig.circuitOpenAfter) {
      proxy.circuitOpen = true;
      proxy.circuitOpenUntil = Date.now() + this.healthConfig.circuitCooldownMs;
      proxy.status = 'circuit_open';
      logger.warn(
        `Circuit breaker opened for ${proxy.id} (cooldown ${this.healthConfig.circuitCooldownMs}ms)`
      );
    }

    // Free proxies that keep failing get ARCHIVED (removed from rotation but
    // kept in the pool, re-activatable by the free-proxy fetcher if they show
    // up in a fresh list). Paid/Webshare proxies are NEVER archived — they
    // only get the circuit breaker above.
    const archiveAfter = this.healthConfig.archiveFreeAfterFailures || 0;
    if (
      archiveAfter > 0 &&
      proxy.source === 'free' &&
      proxy.consecutiveFailures >= archiveAfter &&
      !proxy.archived
    ) {
      this.archiveProxy(proxy.host, `consecutive_failures:${proxy.consecutiveFailures}`);
    }

    db.prepare(`
      UPDATE proxy_stats SET
        fail_count = fail_count + 1,
        last_used = datetime('now'),
        status = ?
      WHERE host = ?
    `).run(proxy.status, proxy.host);
  }

  // -----------------------------------------------------------------------
  // Health checking
  // -----------------------------------------------------------------------
  /** TCP connect probe — fast, no TLS, tells us the port is reachable. */
  _tcpProbe(proxy, timeoutMs) {
    return new Promise((resolve) => {
      const socket = net.connect({ host: proxy.host, port: proxy.port });
      const done = (ok) => {
        try { socket.destroy(); } catch { /* noop */ }
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  /** HTTP probe through the proxy — verifies auth + tunnel + egress. */
  async _httpProbe(proxy, target, timeoutMs) {
    const agent = this.createAgent(proxy, target.startsWith('https'));
    const start = Date.now();
    const resp = await axios.get(target, {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0' },
      // Any 2xx/3xx means the proxy tunnel works end-to-end.
      validateStatus: (s) => s >= 200 && s < 400,
    }).catch((err) => {
      // Classify proxy-level auth failures distinctly: 407 means the proxy is
      // ALIVE but rejected our credentials (e.g. paid Webshare proxy while
      // PROXY_USERNAME/PROXY_PASSWORD are unset, or wrong protocol). Free
      // proxies carry no credentials and must never be sent any.
      const status = err.response?.status;
      if (status === 407) {
        const e = new Error(`407 Proxy Authentication Required — proxy alive, credentials missing/rejected (proxy type=${proxy.type || 'http'})`);
        e.proxyStatus = 407;
        throw e;
      }
      if (status) {
        const e = new Error(`proxy returned HTTP ${status}`);
        e.proxyStatus = status;
        throw e;
      }
      throw err;
    });
    return Date.now() - start;
  }

  /**
   * Full health check: TCP first (fast fail), then HTTP probe.
   * Never throws — returns { healthy, latency, stage, error }.
   */
  async healthCheck(proxy) {
    const timeout = this.healthConfig.timeout;

    const tcpOk = await this._tcpProbe(proxy, timeout);
    if (!tcpOk) {
      proxy.status = 'unhealthy';
      proxy.lastChecked = new Date().toISOString();
      db.prepare(`UPDATE proxy_stats SET status = 'unhealthy', last_checked = datetime('now') WHERE host = ?`)
        .run(proxy.host);
      return { healthy: false, stage: 'tcp', error: 'TCP connect failed' };
    }

    try {
      const latency = await this._httpProbe(
        proxy,
        this.healthConfig.target,
        timeout
      );
      proxy.status = 'healthy';
      proxy.lastChecked = new Date().toISOString();
      proxy.consecutiveFailures = 0;
      db.prepare(`UPDATE proxy_stats SET status = 'healthy', last_checked = datetime('now') WHERE host = ?`)
        .run(proxy.host);
      return { healthy: true, latency, stage: 'http' };
    } catch (err) {
      proxy.status = 'unhealthy';
      proxy.lastChecked = new Date().toISOString();
      db.prepare(`UPDATE proxy_stats SET status = 'unhealthy', last_checked = datetime('now') WHERE host = ?`)
        .run(proxy.host);
      return { healthy: false, stage: 'http', error: err.message };
    }
  }

  /** Concurrency-limited map (keeps 5k-proxy health sweeps from melting the CPU/sockets). */
  async _mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
        } catch (e) {
          results[i] = { status: 'rejected', reason: e };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
    return results;
  }

  /** Probe a rotating window of the pool (used by the background loop). */
  async healthCheckBatch(batchSize = 100, concurrency = 25) {
    const candidates = this.proxies.filter((p) => !p.archived);
    if (candidates.length === 0) return [];
    this._healthWindow = this._healthWindow || 0;
    const slice = [];
    for (let i = 0; i < Math.min(batchSize, candidates.length); i++) {
      slice.push(candidates[(this._healthWindow + i) % candidates.length]);
    }
    this._healthWindow = (this._healthWindow + slice.length) % candidates.length;
    const results = await this._mapLimit(slice, concurrency, (p) => this.healthCheck(p));
    return results.map((r, i) => ({
      proxy: slice[i].id,
      healthy: r.status === 'fulfilled' && r.value?.healthy,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));
  }

  async healthCheckAll(concurrency = 25) {
    // Archived proxies are out of rotation — no point probing them.
    const targets = this.proxies.filter((p) => !p.archived);
    const results = await this._mapLimit(targets, concurrency, (p) => this.healthCheck(p));
    return results.map((r, i) => ({
      proxy: targets[i].id,
      healthy: r.status === 'fulfilled' && r.value?.healthy,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));
  }

  // -----------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------
  toggleProxy(host, enabled) {
    const proxy = this.proxies.find((p) => p.host === host);
    if (!proxy) return null;
    proxy.enabled = enabled;
    if (!enabled) {
      proxy.circuitOpen = false;
    }
    db.prepare(`UPDATE proxy_stats SET enabled = ? WHERE host = ?`)
      .run(enabled ? 1 : 0, host);
    return proxy;
  }

  addProxy({ host, port, country, city, flag, username, password, type = 'http', source = 'manual' }) {
    if (this.proxies.some((p) => p.host === host && p.port === port)) return null;
    const proxy = {
      host, port, country, city, flag: flag || '🌐',
      // `type` matters for the network layer: 'http' | 'https' | 'socks4' | 'socks5'.
      // Credentials are ONLY attached when the caller supplies them — free-list
      // proxies must stay credential-less, otherwise page.authenticate() would
      // send Webshare credentials to public proxies (407/ban risk).
      type: type === 'socks' ? 'socks5' : type || 'http',
      source,
      username: username !== undefined && username !== '' ? username : null,
      password: password !== undefined && password !== '' ? password : null,
      id: `${host}:${port}`,
      enabled: true, status: 'unknown',
      successCount: 0, failCount: 0, totalLatency: 0, avgLatency: 0,
      lastUsed: null, lastChecked: null,
      consecutiveFailures: 0, circuitOpen: false, circuitOpenUntil: null,
      archived: false,
    };
    this.proxies.push(proxy);
    try {
      db.prepare(`
        INSERT INTO proxy_stats (host, port, country, city, flag, enabled, status)
        VALUES (?, ?, ?, ?, ?, 1, 'unknown')
      `).run(host, port, country, city, flag);
    } catch { /* UNIQUE constraint — already in DB, fine */ }
    return proxy;
  }

  removeProxy(host) {
    const before = this.proxies.length;
    this.proxies = this.proxies.filter((p) => p.host !== host);
    if (this.proxies.length === before) return false;
    db.prepare('DELETE FROM proxy_stats WHERE host = ?').run(host);
    return true;
  }

  /**
   * Archive a proxy: keep it in the pool but out of rotation (enabled=false,
   * archived=1). Used for free proxies after repeated failures. Paid proxies
   * are never archived (recordFailure guards by source === 'free').
   */
  archiveProxy(host, reason = 'manual') {
    const proxy = this.proxies.find((p) => p.host === host);
    if (!proxy) return null;
    proxy.archived = true;
    proxy.enabled = false;
    proxy.status = 'archived';
    proxy.circuitOpen = false;
    db.prepare(`
      UPDATE proxy_stats SET archived = 1, enabled = 0, status = 'archived',
        archive_reason = ?, last_used = datetime('now') WHERE host = ?
    `).run(reason, host);
    logger.warn(`📦 Archived proxy ${proxy.id} (${reason}) — kept in pool, out of rotation`);
    return proxy;
  }

  /** Re-activate an archived proxy (e.g. it showed up in a fresh free list). */
  unarchiveProxy(host) {
    const proxy = this.proxies.find((p) => p.host === host);
    if (!proxy || !proxy.archived) return null;
    proxy.archived = false;
    proxy.enabled = true;
    proxy.status = 'unknown';
    proxy.consecutiveFailures = 0;
    db.prepare(`
      UPDATE proxy_stats SET archived = 0, enabled = 1, status = 'unknown',
        archive_reason = NULL WHERE host = ?
    `).run(host);
    logger.info(`♻️ Un-archived proxy ${proxy.id}`);
    return proxy;
  }

  getAll() {
    return this.proxies.map((p) => ({
      host: p.host,
      port: p.port,
      country: p.country,
      city: p.city,
      flag: p.flag,
      type: p.type || 'http',
      source: p.source || 'webshare-legacy',
      enabled: p.enabled,
      status: p.status,
      successCount: p.successCount,
      failCount: p.failCount,
      avgLatency: p.avgLatency,
      successRate:
        p.successCount + p.failCount > 0
          ? Math.round((p.successCount / (p.successCount + p.failCount)) * 100)
          : 0,
      lastUsed: p.lastUsed,
      lastChecked: p.lastChecked,
      circuitOpen: p.circuitOpen,
      archived: !!p.archived,
    }));
  }

  getStats() {
    const active = this.proxies.filter(
      (p) => p.enabled && !(p.circuitOpen && p.circuitOpenUntil > Date.now())
    );
    return {
      total: this.proxies.length,
      enabled: this.proxies.filter((p) => p.enabled).length,
      healthy: this.proxies.filter((p) => p.status === 'healthy').length,
      unhealthy: this.proxies.filter((p) => p.status === 'unhealthy').length,
      circuitOpen: this.proxies.filter((p) => p.circuitOpen).length,
      archived: this.proxies.filter((p) => p.archived).length,
      countries: [...new Set(this.proxies.map((p) => p.country))].length,
      active: active.length,
    };
  }
}

export default ProxyManager;
