// ============================================================================
// free-proxy-fetcher.js — Aggregates FREE proxies from regularly-updated
// GitHub repos and merges them into the ProxyManager alongside the paid
// Webshare pool.
//
//   Sources (all plain raw.githubusercontent.com files, no auth needed):
//     • proxifly/free-proxy-list            (all protocols + JSON w/ geo data)
//     • TheSpeedX/PROXY-LIST                (http / socks4 / socks5)
//     • monosans/proxy-list                 (http / socks4 / socks5)
//     • clarketm/proxy-list                 (http)
//
// Free proxies are credential-less (username/password = null) and tagged
// `source: 'free:<repo>'` so they never inherit Webshare credentials, can be
// distinguished in stats, and are never removed by paid-provider refreshes.
// ============================================================================

import axios from 'axios';
import logger from '../utils/logger.js';

// Raw list endpoints. Each entry: { name, url, type (default protocol), geo (JSON endpoint for country metadata) }
const PROXY_SOURCES = [
  {
    name: 'proxifly',
    url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt',
    // data.json carries country/anonymity metadata for geo-matching
    geo: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json',
  },
  { name: 'thespeedx-http', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/http.txt', type: 'http' },
  { name: 'thespeedx-socks4', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/socks4.txt', type: 'socks4' },
  { name: 'thespeedx-socks5', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/socks5.txt', type: 'socks5' },
  { name: 'monosans-http', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', type: 'http' },
  { name: 'monosans-socks5', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', type: 'socks5' },
  { name: 'clarketm-http', url: 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt', type: 'http' },
  { name: 'zloi-user-http', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/http.txt', type: 'http' },
  { name: 'zloi-user-socks4', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/socks4.txt', type: 'socks4' },
  { name: 'zloi-user-socks5', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/socks5.txt', type: 'socks5' },
  { name: 'roosterkid-openproxy', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt', type: 'http' },
  { name: 'roosterkid-openproxy-socks4', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt', type: 'socks4' },
  { name: 'roosterkid-openproxy-socks5', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', type: 'socks5' },
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse one list line into a proxy descriptor, or null if unparseable.
 * Supported shapes: `protocol://ip:port`, `ip:port`, and trailing
 * `user:pass` (dropped — free lists with creds are unreliable/security risk).
 */
export function parseProxyLine(line, defaultType = 'http') {
  if (!line) return null;
  let text = String(line).trim();
  if (!text || text.startsWith('#') || text.startsWith('//')) return null;

  // Strip trailing credential segments ("ip:port:user:pass" or "ip:port@user:pass")
  let type = defaultType;
  const protoMatch = text.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (protoMatch) {
    type = protoMatch[1].toLowerCase();
    text = text.slice(protoMatch[0].length);
  }
  // Drop "@user:pass" suffix if present
  const atIdx = text.indexOf('@');
  if (atIdx !== -1) text = text.slice(0, atIdx);
  // Drop trailing ":user:pass" only if there are 4+ colon-separated parts
  const parts = text.split(':');
  if (parts.length > 2) {
    // ip:port:user:pass → keep first two, but not IPv6 (heuristic: IPv6 has many colons)
    if (parts.length === 4) text = `${parts[0]}:${parts[1]}`;
  }

  const m = text.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$/);
  if (!m) return null; // IPv6 / domains rejected — engine targets IPv4 HTTP proxies
  const port = parseInt(m[2], 10);
  if (port < 1 || port > 65535) return null;

  // Normalize the type the network layer understands
  let normalized = type;
  if (normalized === 'socks') normalized = 'socks5';
  if (!['http', 'https', 'socks4', 'socks5'].includes(normalized)) return null;
  // Chrome treats https:// proxies fine via the http CONNECT scheme; normalize to http-type handling
  if (normalized === 'https') normalized = 'http';

  return { host: m[1], port, type: normalized };
}

/**
 * Parse an entire list body into unique host:port descriptors.
 */
export function parseProxyList(body, defaultType = 'http') {
  const seen = new Set();
  const out = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    const p = parseProxyLine(line, defaultType);
    if (!p) continue;
    const key = `${p.host}:${p.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Build a host:port → {country, city} map from proxifly's data.json.
 * Tolerant parsing — schema may evolve; unknown shapes are skipped.
 */
export function buildGeoMap(jsonBody) {
  const map = new Map();
  let data;
  try {
    data = JSON.parse(jsonBody);
  } catch {
    return map;
  }
  if (!Array.isArray(data)) return map;
  for (const e of data) {
    if (!e || !e.ip || !e.port) continue;
    const protocol = (e.protocol || e.protocols?.[0] || '').toLowerCase();
    // Only annotate HTTP(S) entries — socks4/socks5 type comes from the text lists
    if (protocol && !['http', 'https'].includes(protocol)) continue;
    const country = e.country?.code || e.country?.iso_code || e.countryCode || null;
    const city = e.city?.name || e.city || null;
    map.set(`${e.ip}:${e.port}`, { country, city });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export class FreeProxyFetcher {
  constructor(proxyManager, options = {}) {
    this.proxyManager = proxyManager;
    this.config = {
      enabled: process.env.FREE_PROXIES !== '0',
      max: parseInt(process.env.FREE_PROXY_MAX || '5000', 10), // cap so rotation stays workable
      refreshHours: parseFloat(process.env.FREE_PROXY_REFRESH_HOURS || '6'),
      fetchTimeoutMs: parseInt(process.env.FREE_PROXY_TIMEOUT_MS || '45000', 10),
      perSourceCap: parseInt(process.env.FREE_PROXY_PER_SOURCE_CAP || '2000', 10),
      ...options,
    };
    this.history = [];
    this.active = false;
    this.timer = null;
  }

  /** Fetch every source (parallel, tolerant) and return merged unique proxies. */
  async fetchAll() {
    const results = await Promise.allSettled(
      PROXY_SOURCES.map(async (src) => {
        const resp = await axios.get(src.url, {
          timeout: this.config.fetchTimeoutMs,
          maxContentLength: 20 * 1024 * 1024, // some lists are several MB
          responseType: 'text',
          transformResponse: [(d) => d], // keep raw text regardless of content-type
        });
        const parsed = parseProxyList(resp.data, src.type || 'http').slice(0, this.config.perSourceCap);
        let geoMap = null;
        if (src.geo) {
          try {
            const geoResp = await axios.get(src.geo, {
              timeout: this.config.fetchTimeoutMs,
              maxContentLength: 20 * 1024 * 1024,
              responseType: 'text',
              transformResponse: [(d) => d],
            });
            geoMap = buildGeoMap(geoResp.data);
          } catch { /* geo data is optional */ }
        }
        // Merge geo metadata where available
        for (const p of parsed) {
          const g = geoMap?.get(`${p.host}:${p.port}`);
          if (g) {
            p.country = g.country || null;
            p.city = g.city || null;
          }
        }
        return { source: src.name, proxies: parsed };
      })
    );

    // Merge, dedupe across sources (first source wins — proxifly first, since it has geo)
    const merged = [];
    const seen = new Set();
    const bySource = {};
    for (const r of results) {
      if (r.status !== 'fulfilled') {
        logger.warn(`Free proxy source failed: ${r.reason?.message || r.reason}`);
        bySource['failed'] = (bySource['failed'] || 0) + 1;
        continue;
      }
      const { source, proxies } = r.value;
      let added = 0;
      for (const p of proxies) {
        const key = `${p.host}:${p.port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(p);
        added++;
        if (merged.length >= this.config.max) break;
      }
      bySource[source] = added;
      if (merged.length >= this.config.max) break;
    }

    return { proxies: merged, bySource };
  }

  /** Fetch + merge into the ProxyManager. Returns a full report. */
  async refreshAndApply() {
    const start = Date.now();
    logger.info('🌐 Free proxy refresh starting (GitHub sources)...');
    const existing = new Set(this.proxyManager.getAll().map((p) => `${p.host}:${p.port}`));
    const { proxies, bySource } = await this.fetchAll();

    let added = 0;
    for (const p of proxies) {
      if (existing.has(`${p.host}:${p.port}`)) continue;
      const rec = this.proxyManager.addProxy({
        host: p.host,
        port: p.port,
        country: p.country || null,
        city: p.city || null,
        flag: '🌐',
        type: p.type,
        source: 'free',
        username: null,
        password: null,
      });
      if (rec) added++;
    }

    const report = {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      fetched: proxies.length,
      added,
      bySource,
      totalInPool: this.proxyManager.getAll().length,
    };
    this.history.push(report);
    if (this.history.length > 50) this.history.shift();
    logger.info(
      `🌐 Free proxies: fetched ${report.fetched}, added ${added} ` +
      `(paid+free pool now ${report.totalInPool}) in ${(report.durationMs / 1000).toFixed(1)}s`
    );
    return report;
  }

  /** Background loop: initial refresh after boot, then every refreshHours. */
  startAutoRefresh() {
    if (!this.config.enabled || this.active) return;
    this.active = true;
    // Initial refresh delayed so server boot isn't blocked
    setTimeout(() => {
      this.refreshAndApply().catch((e) => logger.warn(`Free proxy initial refresh failed: ${e.message}`));
    }, 15000);
    this.timer = setInterval(() => {
      this.refreshAndApply().catch((e) => logger.warn(`Free proxy refresh failed: ${e.message}`));
    }, Math.max(0.5, this.config.refreshHours) * 3600 * 1000);
    logger.info(`🌐 Free proxy auto-refresh enabled (every ${this.config.refreshHours}h, cap ${this.config.max})`);
  }

  stopAutoRefresh() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Snapshot of paid vs free composition + last refreshes. */
  getStats() {
    const all = this.proxyManager.getAll();
    const bySource = {};
    for (const p of all) {
      const s = p.source || 'webshare-legacy';
      bySource[s] = (bySource[s] || 0) + 1;
    }
    return {
      enabled: this.config.enabled,
      active: this.active,
      max: this.config.max,
      refreshHours: this.config.refreshHours,
      poolTotal: all.length,
      bySource,
      recentRefreshes: [...this.history].reverse().slice(0, 5),
    };
  }

  updateConfig(conf = {}) {
    if (conf.enabled !== undefined) this.config.enabled = conf.enabled;
    if (conf.max !== undefined) this.config.max = parseInt(conf.max, 10);
    if (conf.refreshHours !== undefined) this.config.refreshHours = parseFloat(conf.refreshHours);
    if (conf.perSourceCap !== undefined) this.config.perSourceCap = parseInt(conf.perSourceCap, 10);
  }
}

export default FreeProxyFetcher;
