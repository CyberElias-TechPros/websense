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
      ...healthConfig,
    };
    this._initDbStats();
  }

  // -----------------------------------------------------------------------
  // Persistence bootstrap
  // -----------------------------------------------------------------------
  _initDbStats() {
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

  /** Pick a strategy by name, defaulting to random. */
  select(strategy = 'random') {
    switch (strategy) {
      case 'round-robin':
        return this.getNext();
      case 'weighted':
        return this.getWeighted();
      case 'geo':
        return this.getGeoSpread();
      case 'random':
      default:
        return this.getRandom();
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
    await axios.get(target, {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0' },
      // Any HTTP response means the proxy tunnel works.
      validateStatus: () => true,
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

  async healthCheckAll() {
    const results = await Promise.allSettled(
      this.proxies.map((p) => this.healthCheck(p))
    );
    return results.map((r, i) => ({
      proxy: this.proxies[i].id,
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

<<<<<<< HEAD
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
=======
  addProxy({ host, port, country, city, flag, username, password }) {
    if (this.proxies.some((p) => p.host === host && p.port === port)) return null;
    const proxy = {
      host, port, country, city, flag: flag || '🌐',
      username: username || 'hmxpvtyv', password: password || 's56i3b0mmjwv',
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      id: `${host}:${port}`,
      enabled: true, status: 'unknown',
      successCount: 0, failCount: 0, totalLatency: 0, avgLatency: 0,
      lastUsed: null, lastChecked: null,
      consecutiveFailures: 0, circuitOpen: false, circuitOpenUntil: null,
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

  getAll() {
    return this.proxies.map((p) => ({
      host: p.host,
      port: p.port,
      country: p.country,
      city: p.city,
      flag: p.flag,
<<<<<<< HEAD
      type: p.type || 'http',
      source: p.source || 'webshare-legacy',
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
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
      countries: [...new Set(this.proxies.map((p) => p.country))].length,
      active: active.length,
    };
  }
}

export default ProxyManager;
