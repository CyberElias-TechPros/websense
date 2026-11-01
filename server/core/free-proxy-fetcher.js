// ============================================================================
// free-proxy-fetcher.js — Aggregates FREE proxies from regularly-updated
// GitHub repos and merges them into the ProxyManager alongside the paid
// Webshare pool.
//
//   Sources (GitHub repos, no auth needed):
//     • proxifly/free-proxy-list            (all protocols + JSON w/ geo data)
//     • TheSpeedX/PROXY-LIST                (http / socks4 / socks5)
//     • monosans/proxy-list                 (http / socks4 / socks5)
//     • clarketm/proxy-list                 (http)
//     • ZloiUser/hideip.me                  (http / socks4 / socks5)
//     • roosterkid/openproxylist            (https / socks4 / socks5)
//
//   Fetch strategy per source:
//     1. raw.githubusercontent.com/<repo>/<branch>/<path>   (fast, primary)
//     2. codeload.github.com/<repo>/zip/refs/heads/<branch> (fallback — works
//        even where raw.githubusercontent.com is blocked; the zip is fetched
//        once per repo and the needed files are extracted locally)
//     Set FREE_PROXY_USE_CODELOAD=1 to skip raw and always use codeload.
//
// Free proxies are credential-less (username/password = null) and tagged
// `source: 'free'` so they never inherit Webshare credentials, can be
// distinguished in stats, and are never removed by paid-provider refreshes.
// ============================================================================

import axios from 'axios';
import zlib from 'zlib';
import net from 'net';
import https from 'https';
import logger from '../utils/logger.js';

// Optional: tolerate self-signed/MITM CA certs (e.g. corporate proxies or
// sandboxes) via FREE_PROXY_INSECURE_TLS=1. Off by default.
const INSECURE_TLS = process.env.FREE_PROXY_INSECURE_TLS === '1' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
const httpsAgent = INSECURE_TLS ? new https.Agent({ rejectUnauthorized: false }) : undefined;

// ---------------------------------------------------------------------------
// Source registry. Each entry maps a raw file to its place inside the repo
// (used by the codeload zip fallback).
// ---------------------------------------------------------------------------
export const PROXY_SOURCES = [
  {
    name: 'proxifly',
    repo: 'proxifly/free-proxy-list',
    branch: 'main',
    url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt',
    path: 'proxies/all/data.txt',
    // data.json carries country/anonymity metadata for geo-matching
    geo: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json',
    geoPath: 'proxies/all/data.json',
  },
  { name: 'thespeedx-http', repo: 'TheSpeedX/PROXY-LIST', branch: 'master', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/http.txt', path: 'http.txt', type: 'http' },
  { name: 'thespeedx-socks4', repo: 'TheSpeedX/PROXY-LIST', branch: 'master', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/socks4.txt', path: 'socks4.txt', type: 'socks4' },
  { name: 'thespeedx-socks5', repo: 'TheSpeedX/PROXY-LIST', branch: 'master', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-LIST/master/socks5.txt', path: 'socks5.txt', type: 'socks5' },
  { name: 'monosans-http', repo: 'monosans/proxy-list', branch: 'main', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', path: 'proxies/http.txt', type: 'http' },
  { name: 'monosans-socks4', repo: 'monosans/proxy-list', branch: 'main', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt', path: 'proxies/socks4.txt', type: 'socks4' },
  { name: 'monosans-socks5', repo: 'monosans/proxy-list', branch: 'main', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', path: 'proxies/socks5.txt', type: 'socks5' },
  { name: 'clarketm-http', repo: 'clarketm/proxy-list', branch: 'master', url: 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt', path: 'proxy-list-raw.txt', type: 'http' },
  { name: 'zloi-user-http', repo: 'ZloiUser/hideip.me', branch: 'main', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/http.txt', path: 'http.txt', type: 'http' },
  { name: 'zloi-user-socks4', repo: 'ZloiUser/hideip.me', branch: 'main', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/socks4.txt', path: 'socks4.txt', type: 'socks4' },
  { name: 'zloi-user-socks5', repo: 'ZloiUser/hideip.me', branch: 'main', url: 'https://raw.githubusercontent.com/ZloiUser/hideip.me/main/socks5.txt', path: 'socks5.txt', type: 'socks5' },
  { name: 'roosterkid-openproxy', repo: 'roosterkid/openproxylist', branch: 'main', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt', path: 'HTTPS_RAW.txt', type: 'http' },
  { name: 'roosterkid-openproxy-socks4', repo: 'roosterkid/openproxylist', branch: 'main', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt', path: 'SOCKS4_RAW.txt', type: 'socks4' },
  { name: 'roosterkid-openproxy-socks5', repo: 'roosterkid/openproxylist', branch: 'main', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', path: 'SOCKS5_RAW.txt', type: 'socks5' },
];

// ---------------------------------------------------------------------------
// Minimal ZIP reader (no external deps) — extracts one entry from a codeload
// zip archive using zlib. Handles stored (0) and deflated (8) entries.
// ---------------------------------------------------------------------------
export function extractZipEntry(zipBuf, targetPath) {
  try {
    if (!Buffer.isBuffer(zipBuf) || zipBuf.length < 22) return null;
    // End Of Central Directory record
    let eocd = -1;
    const min = Math.max(0, zipBuf.length - 22 - 65536);
    for (let i = zipBuf.length - 22; i >= min; i--) {
      if (zipBuf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return null;
    const count = zipBuf.readUInt16LE(eocd + 10);
    let offset = zipBuf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i++) {
      if (offset + 46 > zipBuf.length || zipBuf.readUInt32LE(offset) !== 0x02014b50) break;
      const method = zipBuf.readUInt16LE(offset + 10);
      const compSize = zipBuf.readUInt32LE(offset + 20);
      const nameLen = zipBuf.readUInt16LE(offset + 28);
      const extraLen = zipBuf.readUInt16LE(offset + 30);
      const commentLen = zipBuf.readUInt16LE(offset + 32);
      const localOffset = zipBuf.readUInt32LE(offset + 42);
      const name = zipBuf.toString('utf8', offset + 46, offset + 46 + nameLen);
      // codeload zips prefix every entry with `<repo>-<branch>/`
      if (name === targetPath || name.endsWith('/' + targetPath)) {
        if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) return null;
        const lNameLen = zipBuf.readUInt16LE(localOffset + 26);
        const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const comp = zipBuf.subarray(dataStart, dataStart + compSize);
        if (method === 0) return Buffer.from(comp);
        if (method === 8) return zlib.inflateRawSync(comp);
        return null;
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

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
      // codeload fallback (zip download + local extraction) — on by default,
      // forced with FREE_PROXY_USE_CODELOAD=1 (e.g. where raw.githubusercontent.com is blocked)
      codeloadFallback: process.env.FREE_PROXY_CODELOAD !== '0',
      useCodeloadOnly: process.env.FREE_PROXY_USE_CODELOAD === '1',
      codeloadTimeoutMs: parseInt(process.env.FREE_PROXY_CODELOAD_TIMEOUT_MS || '60000', 10),
      // Light liveness probe of a random sample of newly added free proxies.
      // Dead ones are DISABLED (never deleted; paid proxies are never touched).
      probeSample: parseInt(process.env.FREE_PROXY_PROBE_SAMPLE || '150', 10), // 0 = skip
      probeTimeoutMs: parseInt(process.env.FREE_PROXY_PROBE_TIMEOUT_MS || '5000', 10),
      probeConcurrency: parseInt(process.env.FREE_PROXY_PROBE_CONCURRENCY || '20', 10),
      ...options,
    };
    this.history = [];
    this.active = false;
    this.timer = null;
    this._zipCache = new Map(); // `${repo}@${branch}` → Promise<Buffer|null>
    this._httpGet = options.httpGet || axios.get.bind(axios); // injectable for tests
    this.lastFetchReal = false; // set by fetchAll itself (stubs leave it false)
    this.observability = null; // optional ObservabilityHub — refresh reports feed alerts
  }

  /** Attach the observability hub so every refresh report feeds metrics/alerts. */
  setObservability(obs) {
    this.observability = obs;
  }

  // -- HTTP helpers ---------------------------------------------------------
  async _getText(url, timeoutMs) {
    const resp = await this._httpGet(url, {
      timeout: timeoutMs,
      maxContentLength: 30 * 1024 * 1024, // some lists are several MB
      responseType: 'text',
      transformResponse: [(d) => d], // keep raw text regardless of content-type
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    return resp.data;
  }

  async _getBuffer(url, timeoutMs) {
    const resp = await this._httpGet(url, {
      timeout: timeoutMs,
      maxContentLength: 60 * 1024 * 1024,
      responseType: 'arraybuffer',
      ...(httpsAgent ? { httpsAgent } : {}),
    });
    return Buffer.from(resp.data);
  }

  /** Fetch a repo zip from codeload (cached per repo for the whole run). */
  _getRepoZip(repo, branch) {
    const key = `${repo}@${branch}`;
    if (!this._zipCache.has(key)) {
      const url = `https://codeload.github.com/${repo}/zip/refs/heads/${branch}`;
      this._zipCache.set(key, this._getBuffer(url, this.config.codeloadTimeoutMs)
        .catch((e) => {
          logger.warn(`Codeload zip failed for ${repo}@${branch}: ${e.message}`);
          return null;
        }));
    }
    return this._zipCache.get(key);
  }

  /** Get one source file's text: raw first, codeload zip fallback. */
  async _getSourceFile(src, timeoutMs) {
    if (!this.config.useCodeloadOnly) {
      try {
        return await this._getText(src.url, timeoutMs);
      } catch { /* fall through to codeload */ }
    }
    if (!this.config.codeloadFallback || !src.repo || !src.path) return null;
    const zip = await this._getRepoZip(src.repo, src.branch);
    if (!zip) return null;
    const entry = extractZipEntry(zip, src.path);
    return entry ? entry.toString('utf8') : null;
  }

  // -- TCP liveness probe ----------------------------------------------------
  _tcpProbe(host, port, timeoutMs) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(timeoutMs);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false));
      sock.once('error', () => finish(false));
      try {
        sock.connect(port, host);
      } catch {
        finish(false);
      }
    });
  }

  /** Probe a sample of newly added free proxies; disable the dead ones. */
  async _probeSample(proxies, report) {
    const n = Math.min(this.config.probeSample, proxies.length);
    if (n <= 0) return;
    // Random sample (shuffle copy)
    const sample = [...proxies].sort(() => Math.random() - 0.5).slice(0, n);
    let alive = 0;
    let idx = 0;
    const worker = async () => {
      while (idx < sample.length) {
        const p = sample[idx++];
        const ok = await this._tcpProbe(p.host, p.port, this.config.probeTimeoutMs);
        if (ok) {
          alive++;
          p.probeResult = 'alive';
        } else {
          p.probeResult = 'dead';
          // Disable, never delete — and only ever free-source proxies.
          if (p.source === 'free' && typeof this.proxyManager.toggleProxy === 'function') {
            try { this.proxyManager.toggleProxy(p.host, false); } catch { /* noop */ }
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.config.probeConcurrency, sample.length) }, worker));
    report.probed = sample.length;
    report.probeAlive = alive;
    report.probeDead = sample.length - alive;
    logger.info(`🌐 Free proxy probe: ${alive}/${sample.length} sampled proxies alive`);
  }

  /** Fetch every source (parallel, tolerant) and return merged unique proxies. */
  async fetchAll() {
    this.lastFetchReal = true;
    const results = await Promise.allSettled(
      PROXY_SOURCES.map(async (src) => {
        const body = await this._getSourceFile(src, this.config.fetchTimeoutMs);
        if (body == null) throw new Error(`unreachable: ${src.name}`);
        const parsed = parseProxyList(body, src.type || 'http').slice(0, this.config.perSourceCap);
        // Geo metadata (proxifly data.json) — raw first, same zip fallback
        let geoMap = null;
        if (src.geo) {
          let geoBody = null;
          if (!this.config.useCodeloadOnly) {
            try { geoBody = await this._getText(src.geo, this.config.fetchTimeoutMs); } catch { /* fallback below */ }
          }
          if (geoBody == null && this.config.codeloadFallback && src.repo && src.geoPath) {
            const zip = await this._getRepoZip(src.repo, src.branch);
            const entry = zip ? extractZipEntry(zip, src.geoPath) : null;
            geoBody = entry ? entry.toString('utf8') : null;
          }
          if (geoBody != null) geoMap = buildGeoMap(geoBody);
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

    const addedList = [];
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
      if (rec) {
        added++;
        addedList.push(rec);
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      fetched: proxies.length,
      added,
      bySource,
      totalInPool: this.proxyManager.getAll().length,
    };

    // Liveness-probe a sample of the newly added free proxies (real fetches only)
    if (this.lastFetchReal && this.config.probeSample > 0 && addedList.length > 0) {
      try {
        await this._probeSample(addedList, report);
      } catch (e) {
        logger.warn(`Free proxy probe failed: ${e.message}`);
      }
    }

    this.history.push(report);
    if (this.history.length > 50) this.history.shift();
    logger.info(
      `🌐 Free proxies: fetched ${report.fetched}, added ${added}` +
      (report.reactivated ? `, reactivated ${report.reactivated}` : '') +
      ` (paid+free pool now ${report.totalInPool}) in ${((Date.now() - start) / 1000).toFixed(1)}s`
    );
    // Feed metrics/alerts (e.g. "free sources unreachable" when all fail)
    if (this.observability && typeof this.observability.recordFreeRefresh === 'function') {
      try { this.observability.recordFreeRefresh(report); } catch { /* noop */ }
    }
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
      probeSample: this.config.probeSample,
      codeloadFallback: this.config.codeloadFallback,
      useCodeloadOnly: this.config.useCodeloadOnly,
      sources: PROXY_SOURCES.map((s) => s.name),
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
    if (conf.probeSample !== undefined) this.config.probeSample = parseInt(conf.probeSample, 10);
    if (conf.probeTimeoutMs !== undefined) this.config.probeTimeoutMs = parseInt(conf.probeTimeoutMs, 10);
    if (conf.codeloadFallback !== undefined) this.config.codeloadFallback = !!conf.codeloadFallback;
    if (conf.useCodeloadOnly !== undefined) this.config.useCodeloadOnly = !!conf.useCodeloadOnly;
  }
}

export default FreeProxyFetcher;
