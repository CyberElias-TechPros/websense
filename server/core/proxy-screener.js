// ============================================================================
// proxy-screener.js — Pre-flight proxy screening gate.
//
// NOTHING is sent to a target site through a proxy until that proxy has
// passed a screen. A screen checks, in order:
//   1. PROTOCOL   — actually detect what the port speaks: SOCKS5 (greeting,
//                   incl. username/password auth) → HTTP CONNECT → SOCKS4.
//                   The detected protocol is stored on the proxy (proxy.type),
//                   because lists lie about it (a "http" entry that is really
//                   socks5 fails every request).
//   2. TUNNEL     — real request through the detected protocol to an IP-echo
//                   endpoint → exit IP + latency. Also proves credentials work
//                   (407 → auth failure, reported distinctly).
//   3. ANONYMITY  — headers echo endpoint: does the proxy leak our real IP /
//                   add X-Forwarded-For / Via? elite > anonymous > transparent.
//   4. GEO        — exit IP geolocated (ip-api, fail-open) and compared to the
//                   proxy's declared country → countryMatch.
//   5. BLACKLIST  — local blacklist table (persisted) + optional DNSBL lookups.
//   6. STABILITY  — success rate, avg latency, consecutive failures, circuit
//                   breaker, archived flag → quality score.
// The report is scored 0-100 and PASS/FAIL against minScore; persisted to the
// proxy_screens table and cached on the proxy for ttlMs. Selection prefers
// freshly-passed proxies; visit-engine re-screens on demand before use.
// ============================================================================

import net from 'node:net';
import dns from 'node:dns/promises';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import db from '../database/db.js';
import logger from '../utils/logger.js';

const LEAK_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'via', 'proxy-connection', 'x-proxy-id'];

export class ProxyScreener {
  constructor(proxyManager, config = {}) {
    this.proxyManager = proxyManager;
    this.config = {
      enabled: true,
      ttlMs: 30 * 60 * 1000,
      timeoutMs: 8000,
      minScore: 40,
      requirePass: true,
      targets: ['https://api.ipify.org?format=json', 'https://ifconfig.me/ip', 'https://httpbin.org/ip'],
      headersTarget: 'https://httpbin.org/headers',
      geoIpUrl: 'http://ip-api.com/json/{ip}?fields=status,countryCode,message',
      geoIpEnabled: true,
      dnsbl: false,
      dnsblLists: ['zen.spamhaus.org'],
      dnsblTimeoutMs: 3000,
      ...config,
    };
    this._initDb();
  }

  _initDb() {
    db.prepare(`CREATE TABLE IF NOT EXISTS proxy_screens (
      host TEXT PRIMARY KEY,
      port INTEGER,
      protocol TEXT,
      exit_ip TEXT,
      exit_country TEXT,
      declared_country TEXT,
      country_match INTEGER,
      anonymity TEXT,
      latency_ms INTEGER,
      blacklisted INTEGER DEFAULT 0,
      quality_score INTEGER,
      score INTEGER,
      pass INTEGER,
      details TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS proxy_blacklist (
      host TEXT PRIMARY KEY,
      reason TEXT,
      source TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    )`).run();
  }

  // -----------------------------------------------------------------------
  // 1. Protocol detection — talk to the port and see what answers.
  // -----------------------------------------------------------------------
  _withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise,
      new Promise((r) => setTimeout(() => r(fallback), ms)),
    ]);
  }

  /** SOCKS5 greeting (+ RFC1929 user/pass auth when the server asks). */
  _socks5Greet(host, port, username, password, timeoutMs) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let stage = 'greet';
      let buf = Buffer.alloc(0);
      const done = (protocol, detail, authUsed = false) => {
        sock.destroy();
        resolve({ protocol, detail, authUsed });
      };
      const fail = (err) => { sock.destroy(); resolve(null); };
      sock.setTimeout(timeoutMs, () => fail(new Error('timeout')));
      sock.on('error', fail);
      sock.connect(port, host, () => {
        if (username) {
          sock.write(Buffer.from([0x05, 0x02, 0x00, 0x02])); // no-auth + user/pass
        } else {
          sock.write(Buffer.from([0x05, 0x01, 0x00]));
        }
      });
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (stage === 'greet') {
          if (buf.length < 2) return;
          if (buf[0] !== 0x05) return fail(new Error('not socks5'));
          const method = buf[1];
          if (method === 0x00) return done('socks5', 'greet:no-auth');
          if (method === 0x02 && username) {
            stage = 'auth';
            const u = Buffer.from(username, 'utf8');
            const p = Buffer.from(password || '', 'utf8');
            const auth = Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]);
            buf = Buffer.alloc(0);
            sock.write(auth);
            return;
          }
          return fail(new Error(`socks5 method ${method} not acceptable`));
        }
        if (stage === 'auth') {
          if (buf.length < 2) return;
          if (buf[1] === 0x00) return done('socks5', 'greet:userpass-auth', true);
          return fail(new Error('socks5 auth rejected'));
        }
      });
    });
  }

  /** HTTP CONNECT probe — proves an HTTP(S) proxy tunnel to target host:port. */
  _httpConnectProbe(host, port, targetHost, targetPort, username, password, timeoutMs) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let buf = '';
      const done = (ok, detail) => { sock.destroy(); resolve(ok ? { protocol: 'http', detail } : null); };
      sock.setTimeout(timeoutMs, () => done(false, 'timeout'));
      sock.on('error', () => done(false, 'error'));
      sock.connect(port, host, () => {
        let req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
        if (username) {
          req += `Proxy-Authorization: Basic ${Buffer.from(`${username}:${password || ''}`).toString('base64')}\r\n`;
        }
        req += '\r\n';
        sock.write(req);
      });
      sock.on('data', (chunk) => {
        buf += chunk.toString('latin1');
        const line = buf.split('\r\n')[0] || '';
        if (/^HTTP\/\d\.\d \d{3}/.test(line)) {
          done(/ 200 /.test(line), line.trim());
        }
      });
    });
  }

  /** SOCKS4 CONNECT to a target IP (best-effort; many lists mislabel socks4). */
  _socks4Probe(host, port, targetIp, targetPort, timeoutMs) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      const done = (ok, detail) => { sock.destroy(); resolve(ok ? { protocol: 'socks4', detail } : null); };
      sock.setTimeout(timeoutMs, () => done(false, 'timeout'));
      sock.on('error', () => done(false, 'error'));
      sock.connect(port, host, () => {
        const ipParts = targetIp.split('.').map((o) => parseInt(o, 10));
        const req = Buffer.from([0x04, 0x01, (targetPort >> 8) & 0xff, targetPort & 0xff, ...ipParts, 0x00]);
        sock.write(req);
      });
      sock.on('data', (chunk) => {
        if (chunk.length >= 2 && chunk[0] === 0x00 && chunk[1] === 0x5a) done(true, 'socks4:granted');
        else done(false, 'socks4:denied');
      });
    });
  }

  /**
   * Detect the real protocol of a proxy port. Tries SOCKS5 → HTTP CONNECT →
   * SOCKS4 against the first screen target. Returns
   * { protocol, detail, authUsed, latencyMs } or null if nothing answered.
   */
  async detectProtocol(proxy, timeoutMs = this.config.timeoutMs) {
    const start = Date.now();
    let targetHost = 'api.ipify.org';
    let targetPort = 443;
    try {
      const u = new URL(this.config.targets[0]);
      targetHost = u.hostname;
      targetPort = parseInt(u.port || (u.protocol === 'https:' ? 443 : 80), 10);
    } catch { /* keep defaults */ }
    const targetIp = net.isIP(targetHost) ? targetHost : '93.184.216.34'; // fallback for socks4 (needs IP)

    const socks5 = await this._withTimeout(
      this._socks5Greet(proxy.host, proxy.port, proxy.username, proxy.password, timeoutMs),
      timeoutMs, null
    );
    if (socks5) return { ...socks5, latencyMs: Date.now() - start };

    const http = await this._withTimeout(
      this._httpConnectProbe(proxy.host, proxy.port, targetHost, targetPort, proxy.username, proxy.password, timeoutMs),
      timeoutMs, null
    );
    if (http) return { ...http, latencyMs: Date.now() - start };

    const socks4 = await this._withTimeout(
      this._socks4Probe(proxy.host, proxy.port, targetIp, targetPort, timeoutMs),
      timeoutMs, null
    );
    if (socks4) return { ...socks4, latencyMs: Date.now() - start };

    return null;
  }

  // -----------------------------------------------------------------------
  // Agent for a DETECTED protocol (not the list's claim).
  // -----------------------------------------------------------------------
  _agentFor(proxy, protocol) {
    const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@` : '';
    const url = `${protocol}://${auth}${proxy.host}:${proxy.port}`;
    if (protocol === 'socks5' || protocol === 'socks') return new SocksProxyAgent(url);
    if (protocol === 'socks4') return new SocksProxyAgent(url.replace('socks4://', 'socks4://'));
    return url.startsWith('https') ? new HttpsProxyAgent(url) : new HttpProxyAgent(url);
  }

  // -----------------------------------------------------------------------
  // 2. Tunnel probe through the detected protocol → exit IP + latency.
  // -----------------------------------------------------------------------
  async _probeIp(proxy, protocol, timeoutMs) {
    for (const target of this.config.targets) {
      const isHttps = target.startsWith('https');
      const agent = protocol === 'http' && !isHttps
        ? this._agentFor(proxy, 'http')
        : this._agentFor(proxy, protocol === 'http' ? 'https' : protocol);
      try {
        const resp = await axios.get(target, {
          httpAgent: agent,
          httpsAgent: agent,
          timeout: timeoutMs,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0' },
        });
        if (resp.status === 407) {
          const e = new Error('407 Proxy Authentication Required (credentials missing/rejected)');
          e.proxyStatus = 407;
          throw e;
        }
        if (resp.status >= 200 && resp.status < 300) {
          const body = typeof resp.data === 'string' ? resp.data.trim() : JSON.stringify(resp.data);
          let ip = null;
          try { ip = JSON.parse(body)?.ip || null; } catch { /* plain text */ }
          if (!ip && net.isIP(body)) ip = body;
          if (!ip && body.includes('"ip"')) {
            const m = body.match(/"ip"\s*:\s*"([^"]+)"/);
            if (m) ip = m[1];
          }
          return { ok: true, exitIp: ip, status: resp.status, target };
        }
      } catch (err) {
        if (err.proxyStatus) throw err;
        // try next target
      }
    }
    return { ok: false, exitIp: null };
  }

  // -----------------------------------------------------------------------
  // 3. Anonymity — headers echo through the proxy; look for leaks.
  // -----------------------------------------------------------------------
  async _probeHeaders(proxy, protocol, timeoutMs) {
    try {
      const agent = this._agentFor(proxy, protocol);
      const resp = await axios.get(this.config.headersTarget, {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      if (resp.status < 200 || resp.status >= 300) return { anonymity: 'unknown', leaks: [], status: resp.status };
      const headers = resp.data?.headers || {};
      const leaks = [];
      for (const h of LEAK_HEADERS) {
        if (headers[h] !== undefined) leaks.push({ header: h, value: String(headers[h]).slice(0, 120) });
      }
      // X-Forwarded-For / X-Real-IP / Forwarded → the proxy reveals the client
      // IP (transparent). Via alone → anonymous. Neither → elite.
      const revealsIp = leaks.some((l) => ['x-forwarded-for', 'x-real-ip', 'forwarded'].includes(l.header));
      const anonymity = revealsIp ? 'transparent' : (leaks.some((l) => l.header === 'via') ? 'anonymous' : 'elite');
      return { anonymity, leaks, status: resp.status };
    } catch (err) {
      return { anonymity: 'unknown', leaks: [], error: err.message };
    }
  }

  // -----------------------------------------------------------------------
  // 4. Geo — geolocate the exit IP, compare with the declared country.
  // -----------------------------------------------------------------------
  async _geoLookup(exitIp, timeoutMs = 5000) {
    if (!this.config.geoIpEnabled || !exitIp || !net.isIP(exitIp)) return { countryCode: null, skipped: true };
    try {
      const url = this.config.geoIpUrl.replace('{ip}', exitIp);
      const resp = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
      if (resp.status === 200 && resp.data?.status === 'success') {
        return { countryCode: resp.data.countryCode || null, skipped: false };
      }
      return { countryCode: null, skipped: true, raw: resp.data?.message || `status ${resp.status}` };
    } catch (err) {
      return { countryCode: null, skipped: true, error: err.message };
    }
  }

  // -----------------------------------------------------------------------
  // 5. Blacklist — local table + optional DNSBL.
  // -----------------------------------------------------------------------
  isBlacklisted(host) {
    return !!db.prepare('SELECT 1 FROM proxy_blacklist WHERE host = ?').get(host);
  }

  blacklist(host, reason = 'manual', source = null) {
    db.prepare("INSERT OR REPLACE INTO proxy_blacklist (host, reason, source, added_at) VALUES (?, ?, ?, datetime('now'))")
      .run(host, reason, source);
    const p = this.proxyManager?.proxies.find((x) => x.host === host);
    if (p) { p.blacklisted = true; p.enabled = false; p.status = 'blacklisted'; }
    logger.warn(`🚫 Blacklisted proxy ${host} (${reason})`);
    return true;
  }

  unblacklist(host) {
    db.prepare('DELETE FROM proxy_blacklist WHERE host = ?').run(host);
    const p = this.proxyManager?.proxies.find((x) => x.host === host);
    if (p) { p.blacklisted = false; p.enabled = true; p.status = 'unknown'; }
    return true;
  }

  listBlacklist() {
    return db.prepare('SELECT * FROM proxy_blacklist ORDER BY added_at DESC').all();
  }

  async _dnsblCheck(host, timeoutMs) {
    if (!this.config.dnsbl || !net.isIP(host)) return { listed: false, skipped: !this.config.dnsbl };
    const reversed = host.split('.').reverse().join('.');
    for (const list of this.config.dnsblLists) {
      try {
        const answers = await this._withTimeout(
          dns.resolve4(`${reversed}.${list}`),
          timeoutMs, null
        );
        if (answers && answers.length) return { listed: true, list, answers };
      } catch { /* NXDOMAIN = not listed */ }
    }
    return { listed: false, skipped: false };
  }

  // -----------------------------------------------------------------------
  // 6. Stability / quality from the proxy manager's own stats.
  // -----------------------------------------------------------------------
  _stabilityScore(proxy) {
    const total = (proxy.successCount || 0) + (proxy.failCount || 0);
    const successRate = total > 0 ? (proxy.successCount / total) * 100 : 50; // unknown → neutral
    const latencyScore = proxy.avgLatency ? Math.max(0, 100 - proxy.avgLatency / 100) : 50;
    const failurePenalty = Math.min((proxy.consecutiveFailures || 0) * 20, 80);
    const circuitPenalty = proxy.circuitOpen ? 50 : 0;
    const archivedPenalty = proxy.archived ? 100 : 0;
    return Math.max(0, Math.round(successRate * 0.5 + latencyScore * 0.3 + 100 - failurePenalty - circuitPenalty - archivedPenalty) / 1);
  }

  /** Pure scoring of a screen report → { score, pass, reasons[] }. */
  scoreReport({ protocolOk, tunnelOk, authRejected, blacklisted, anonymity, countryMatch, stability, probeLatencyMs }, minScore) {
    const reasons = [];
    let score = 0;
    if (protocolOk) score += 15; else reasons.push('protocol undetectable');
    if (tunnelOk) score += 30; else reasons.push(authRejected ? 'proxy auth rejected (407)' : 'tunnel probe failed');
    if (authRejected) reasons.push('credentials rejected (407)');
    if (blacklisted) { reasons.push('blacklisted'); return { score: 0, pass: false, reasons }; }
    const hardFail = [];
    if (anonymity === 'elite') score += 20;
    else if (anonymity === 'anonymous') score += 12;
    else if (anonymity === 'transparent') { hardFail.push('leaks client IP (transparent)'); }
    else score += 8; // unknown → neutral-ish
    if (countryMatch === true) score += 10;
    else if (countryMatch === false) { hardFail.push('exit country ≠ declared country'); }
    else score += 5; // geo skipped
    score += Math.round((stability || 0) * 0.25);
    if (probeLatencyMs > 5000) { score -= 10; reasons.push('slow probe'); }
    score = Math.max(0, Math.min(100, score));
    // Hard gates: a proxy that leaks our IP or lies about its country is a
    // BAD proxy — never used, regardless of score.
    const pass = protocolOk && tunnelOk && !authRejected && !blacklisted && hardFail.length === 0 && score >= minScore;
    reasons.push(...hardFail);
    if (!pass && hardFail.length === 0 && score >= minScore) reasons.push('hard gate failed');
    return { score, pass, reasons };
  }

  // -----------------------------------------------------------------------
  // Full screen of one proxy. Persists + caches on the proxy object.
  // -----------------------------------------------------------------------
  async screen(proxy, opts = {}) {
    const timeoutMs = opts.timeoutMs || this.config.timeoutMs;
    const minScore = opts.minScore ?? this.config.minScore;
    const started = Date.now();

    const report = {
      host: proxy.host,
      port: proxy.port,
      declaredCountry: proxy.country || null,
      source: proxy.source || 'manual',
      checkedAt: new Date().toISOString(),
      protocol: null,
      protocolDetail: null,
      authUsed: false,
      exitIp: null,
      exitCountry: null,
      countryMatch: null,
      anonymity: 'unknown',
      leaks: [],
      latencyMs: null,
      blacklisted: this.isBlacklisted(proxy.host),
      dnsbl: null,
      stability: this._stabilityScore(proxy),
      score: 0,
      pass: false,
      reasons: [],
      durationMs: 0,
    };

    try {
      // 1. Protocol detection — and correct the stored type if the list lied.
      const det = await this.detectProtocol(proxy, timeoutMs);
      if (det) {
        report.protocol = det.protocol === 'socks' ? 'socks5' : det.protocol;
        report.protocolDetail = det.detail;
        report.authUsed = !!det.authUsed;
        if (proxy.type !== report.protocol) {
          proxy.type = report.protocol; // self-heal mislabeled entries
          try {
            db.prepare('UPDATE proxy_stats SET type = ? WHERE host = ?').run(report.protocol, proxy.host);
          } catch { /* column may not exist yet */ }
        }
      }

      // 2. Tunnel probe through the DETECTED protocol.
      let tunnel = { ok: false };
      let authRejected = false;
      if (det) {
        try {
          tunnel = await this._probeIp(proxy, report.protocol, timeoutMs);
          report.exitIp = tunnel.exitIp;
          report.tunnelTarget = tunnel.target || null;
        } catch (err) {
          if (err.proxyStatus === 407) authRejected = true;
          report.tunnelError = err.message;
        }
      }
      report.latencyMs = Date.now() - started;

      // 3. Anonymity / header leaks (only if tunnel works).
      if (tunnel.ok && det) {
        const h = await this._probeHeaders(proxy, report.protocol, timeoutMs);
        report.anonymity = h.anonymity;
        report.leaks = h.leaks;
      }

      // 4. Geo verification of the exit IP.
      if (tunnel.ok && report.exitIp) {
        const geo = await this._geoLookup(report.exitIp);
        report.exitCountry = geo.countryCode;
        report.geoSkipped = !!geo.skipped;
        if (geo.countryCode && proxy.country) {
          report.countryMatch = geo.countryCode.toUpperCase() === String(proxy.country).toUpperCase();
        }
      }

      // 5. Blacklist (local + DNSBL).
      report.blacklisted = this.isBlacklisted(proxy.host);
      report.dnsbl = await this._dnsblCheck(proxy.host, this.config.dnsblTimeoutMs);
      if (report.dnsbl?.listed) {
        report.blacklisted = true;
        this.blacklist(proxy.host, `dnsbl:${report.dnsbl.list}`, proxy.source);
      }

      // 6+score. Hard gate + score.
      const scored = this.scoreReport({
        protocolOk: !!det,
        tunnelOk: tunnel.ok,
        authRejected,
        blacklisted: report.blacklisted,
        anonymity: report.anonymity,
        countryMatch: report.countryMatch,
        stability: report.stability,
        probeLatencyMs: report.latencyMs,
      }, minScore);
      report.score = scored.score;
      report.pass = scored.pass;
      report.reasons = scored.reasons;
      report.durationMs = Date.now() - started;

      // Persist + cache on the proxy object.
      proxy.screen = report;
      proxy.screenedAt = Date.now();
      proxy.status = report.pass ? 'verified' : (authRejected ? 'auth_failed' : 'unverified');
      this._persistScreen(report);
      return report;
    } catch (err) {
      report.pass = false;
      report.reasons = [`screen error: ${err.message}`];
      report.durationMs = Date.now() - started;
      proxy.screen = report;
      proxy.screenedAt = Date.now();
      this._persistScreen(report);
      return report;
    }
  }

  /**
   * Screen every proxy in the pool (concurrency-limited). Intended for
   * "test all on startup" workflows; results are cached/persisted.
   */
  async screenAll(proxies, concurrency = 10) {
    if (!this.config.enabled) return [];
    const list = Array.isArray(proxies) ? proxies : [];
    const results = [];
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const i = idx++;
        try {
          const r = await this.screen(list[i]);
          results[i] = r;
        } catch (e) {
          results[i] = { host: list[i]?.host, port: list[i]?.port, pass: false, reasons: [e.message] };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker));
    return results;
  }

  _persistScreen(report) {
    try {
      db.prepare(`INSERT OR REPLACE INTO proxy_screens
        (host, port, protocol, exit_ip, exit_country, declared_country, country_match,
         anonymity, latency_ms, blacklisted, quality_score, score, pass, details, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(
          report.host, report.port, report.protocol, report.exitIp, report.exitCountry,
          report.declaredCountry, report.countryMatch === null ? null : (report.countryMatch ? 1 : 0),
          report.anonymity, report.latencyMs, report.blacklisted ? 1 : 0, report.stability,
          report.score, report.pass ? 1 : 0, JSON.stringify({ reasons: report.reasons, leaks: report.leaks, protocolDetail: report.protocolDetail })
        );
    } catch (err) {
      logger.warn(`Failed to persist screen for ${report.host}: ${err.message}`);
    }
  }

  /** Last persisted screen report for a host (null if never screened). */
  getLastScreen(host) {
    const row = db.prepare('SELECT * FROM proxy_screens WHERE host = ?').get(host);
    if (!row) return null;
    let details = {};
    try { details = JSON.parse(row.details || '{}'); } catch { /* noop */ }
    return {
      host: row.host, port: row.port, protocol: row.protocol, exitIp: row.exit_ip,
      exitCountry: row.exit_country, declaredCountry: row.declared_country,
      countryMatch: row.country_match === null ? null : !!row.country_match,
      anonymity: row.anonymity, latencyMs: row.latency_ms,
      blacklisted: !!row.blacklisted, qualityScore: row.quality_score,
      score: row.score, pass: !!row.pass, checkedAt: row.checked_at,
      reasons: details.reasons || [], leaks: details.leaks || [],
    };
  }
}

export default ProxyScreener;
