// ============================================================================
// proxy-screener.test.js — Pre-flight gate tests:
//   • detectProtocol against local mock servers (socks5 / socks5+auth / http
//     CONNECT / socks4 / silent port)
//   • screen() pipeline: pass scoring, 407 auth rejection, blacklist, geo
//     match, protocol self-heal, persistence
//   • proxy-manager: ensureScreened caching, select() prefers verified,
//     auto-blacklist on repeated detection, screenBatch skips archived
//   • visit-engine: no request leaves without a passed screen (gate), and an
//     all-fail pool yields a persisted skipped visit
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import ProxyScreener from '../../core/proxy-screener.js';
import ProxyManager from '../../core/proxy-manager.js';
import VisitEngine from '../../core/visit-engine.js';

const rndHost = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const mkProxy = (over = {}) => ({
  host: rndHost(), port: 8080, type: 'http', source: 'free', enabled: true, archived: false,
  country: 'US', city: 'c', flag: '🇺🇸', successCount: 10, failCount: 0, consecutiveFailures: 0,
  totalLatency: 2000, avgLatency: 200, circuitOpen: false, ...over,
});

// --- tiny mock proxy servers -------------------------------------------------
function startServer(handler) {
  return new Promise((resolve) => {
    const srv = net.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
const close = (s) => new Promise((r) => { s.srv.closeAllConnections?.(); s.srv.close(() => r()); });

describe('detectProtocol: real protocol detection against mock ports', () => {
  let servers = [];
  afterEach(async () => { for (const s of servers.splice(0)) await close(s).catch(() => {}); });

  it('detects SOCKS5 (no-auth greeting)', async () => {
    const s = await startServer((sock) => {
      sock.on('data', (d) => { if (d[0] === 0x05) sock.write(Buffer.from([0x05, 0x00])); });
    });
    servers.push(s);
    const sc = new ProxyScreener(null, { timeoutMs: 1500 });
    const det = await sc.detectProtocol({ host: '127.0.0.1', port: s.port }, 1500);
    expect(det.protocol).toBe('socks5');
    expect(det.authUsed).toBe(false);
  });

  it('detects SOCKS5 with username/password auth', async () => {
    const s = await startServer((sock) => {
      let stage = 0;
      sock.on('data', (d) => {
        if (stage === 0 && d[0] === 0x05) { stage = 1; sock.write(Buffer.from([0x05, 0x02])); }
        else if (stage === 1) { sock.write(Buffer.from([0x01, 0x00])); }
      });
    });
    servers.push(s);
    const sc = new ProxyScreener(null, { timeoutMs: 1500 });
    const det = await sc.detectProtocol({ host: '127.0.0.1', port: s.port, username: 'u', password: 'p' }, 1500);
    expect(det.protocol).toBe('socks5');
    expect(det.authUsed).toBe(true);
  });

  it('detects HTTP CONNECT proxy', async () => {
    const s = await startServer((sock) => {
      let buf = '';
      sock.on('data', (d) => {
        buf += d.toString('latin1');
        if (buf.includes('\r\n\r\n')) sock.write('HTTP/1.1 200 Connection established\r\n\r\n');
      });
    });
    servers.push(s);
    const sc = new ProxyScreener(null, { timeoutMs: 1500 });
    const det = await sc.detectProtocol({ host: '127.0.0.1', port: s.port }, 1500);
    expect(det.protocol).toBe('http');
  });

  it('detects SOCKS4 when socks5 and http both fail', async () => {
    const s = await startServer((sock) => {
      sock.on('data', (d) => {
        if (d[0] === 0x05) { sock.destroy(); return; }               // not socks5
        const txt = d.toString('latin1');
        if (txt.startsWith('CONNECT')) { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return; } // not http
        if (d[0] === 0x04) sock.write(Buffer.from([0x00, 0x5a, 0, 0, 0, 0, 0, 0])); // socks4 granted
      });
    });
    servers.push(s);
    const sc = new ProxyScreener(null, { timeoutMs: 1500 });
    const det = await sc.detectProtocol({ host: '127.0.0.1', port: s.port }, 1500);
    expect(det.protocol).toBe('socks4');
  });

  it('returns null for a silent port (timeout)', async () => {
    const s = await startServer((sock) => { setTimeout(() => sock.destroy(), 200); });
    servers.push(s);
    const sc = new ProxyScreener(null, { timeoutMs: 300 });
    const det = await sc.detectProtocol({ host: '127.0.0.1', port: s.port }, 300);
    expect(det).toBeNull();
  }, 10000);
});

// ---------------------------------------------------------------------------
describe('screen(): full pre-flight pipeline (stubbed network)', () => {
  const mkScreener = (pm) => {
    const sc = new ProxyScreener(pm, { dnsbl: false, geoIpEnabled: true, timeoutMs: 500, minScore: 40 });
    sc.detectProtocol = async () => ({ protocol: 'socks5', detail: 'greet:no-auth', authUsed: false, latencyMs: 5 });
    sc._probeIp = async () => ({ ok: true, exitIp: '8.8.8.8', status: 200 });
    sc._probeHeaders = async () => ({ anonymity: 'elite', leaks: [] });
    sc._geoLookup = async () => ({ countryCode: 'US' });
    return sc;
  };

  it('passes a healthy socks5 proxy, verifies country, self-heals type, persists', async () => {
    const proxy = mkProxy({ type: 'http' }); // list claimed http, really socks5
    const pm = new ProxyManager([proxy], {});
    const sc = mkScreener(pm);
    pm.setScreener(sc);

    const report = await sc.screen(proxy);
    expect(report.pass).toBe(true);
    expect(report.protocol).toBe('socks5');
    expect(proxy.type).toBe('socks5');               // self-healed
    expect(report.exitIp).toBe('8.8.8.8');
    expect(report.countryMatch).toBe(true);          // US exit vs US declared
    expect(report.anonymity).toBe('elite');
    expect(report.score).toBeGreaterThanOrEqual(40);
    expect(proxy.screen.pass).toBe(true);
    expect(pm.isScreenedOk(proxy)).toBe(true);

    const last = sc.getLastScreen(proxy.host);
    expect(last.pass).toBe(true);
    expect(last.protocol).toBe('socks5');
  });

  it('fails blacklisted proxies with score 0', async () => {
    const proxy = mkProxy();
    const pm = new ProxyManager([proxy], {});
    const sc = mkScreener(pm);
    sc.blacklist(proxy.host, 'test');
    const report = await sc.screen(proxy);
    expect(report.pass).toBe(false);
    expect(report.score).toBe(0);
    expect(report.reasons.join(' ')).toMatch(/blacklisted/);
    expect(pm.proxies[0].enabled).toBe(false); // manager's internal entry disabled
    expect(pm.isScreenedOk(pm.proxies[0])).toBe(false);
  });

  it('reports 407 auth rejection distinctly and fails', async () => {
    const proxy = mkProxy({ source: 'webshare', username: 'u', password: 'wrong' });
    const pm = new ProxyManager([proxy], {});
    const sc = mkScreener(pm);
    sc._probeIp = async () => { const e = new Error('407'); e.proxyStatus = 407; throw e; };
    const report = await sc.screen(proxy);
    expect(report.pass).toBe(false);
    expect(report.reasons.join(' ')).toMatch(/407|auth/i);
  });

  it('fails low-quality proxies when score < minScore (transparent + geo mismatch)', async () => {
    const proxy = mkProxy({ country: 'DE', successCount: 0, failCount: 10, consecutiveFailures: 5, avgLatency: 9000 });
    const pm = new ProxyManager([proxy], {});
    const sc = mkScreener(pm);
    sc._probeHeaders = async () => ({ anonymity: 'transparent', leaks: [{ header: 'x-forwarded-for', value: '1.2.3.4' }] });
    sc._geoLookup = async () => ({ countryCode: 'US' }); // declared DE → mismatch
    const report = await sc.screen(proxy);
    expect(report.countryMatch).toBe(false);
    expect(report.anonymity).toBe('transparent');
    expect(report.pass).toBe(false);
    expect(report.reasons.join(' ')).toMatch(/transparent|country/i);
  });
});

// ---------------------------------------------------------------------------
describe('proxy-manager gate integration', () => {
  it('ensureScreened caches a passing screen within the TTL', async () => {
    const proxy = mkProxy();
    const pm = new ProxyManager([proxy], {});
    let calls = 0;
    const fakeScreener = {
      config: { enabled: true, ttlMs: 60000, autoBlacklistAfter: 0 },
      screen: async (p) => { calls++; p.screen = { pass: true, score: 90 }; p.screenedAt = Date.now(); return p.screen; },
    };
    pm.setScreener(fakeScreener);
    expect(await pm.ensureScreened(proxy)).toBe(true);
    expect(await pm.ensureScreened(proxy)).toBe(true);
    expect(calls).toBe(1); // second call served from cache
    proxy.screenedAt = Date.now() - 120000; // expire
    expect(await pm.ensureScreened(proxy)).toBe(true);
    expect(calls).toBe(2);
  });

  it('select() prefers freshly verified proxies', () => {
    const pm = new ProxyManager([mkProxy(), mkProxy()], {});
    const [verified, unverified] = pm.proxies; // manager clones entries — use internal refs
    verified.screen = { pass: true, score: 95 };
    verified.screenedAt = Date.now();
    pm.setScreener({ config: { enabled: true, ttlMs: 60000, requirePass: true, autoBlacklistAfter: 0 }, screen: async () => ({ pass: true }) });
    for (let i = 0; i < 10; i++) expect(pm.select('random')).toBe(verified);
    expect(pm.select('random')).not.toBe(unverified);
  });

  it('auto-blacklists free proxies after repeated detection failures (never paid)', () => {
    const pm = new ProxyManager([mkProxy({ source: 'free' }), mkProxy({ source: 'webshare' })], {});
    const [free, paid] = pm.proxies; // internal refs (manager clones inputs)
    pm.setScreener(new ProxyScreener(pm, { autoBlacklistAfter: 3, dnsbl: false }));
    for (let i = 0; i < 3; i++) pm.recordFailure(free, 'detection:block');
    expect(free.blacklisted).toBe(true);
    expect(free.enabled).toBe(false);
    for (let i = 0; i < 5; i++) pm.recordFailure(paid, 'detection:block');
    expect(paid.blacklisted).toBeFalsy(); // paid never auto-blacklisted
  });

  it('screenBatch skips archived/blacklisted and never touches the whole pool', async () => {
    const proxies = Array.from({ length: 6 }, () => mkProxy());
    const pm = new ProxyManager(proxies, {});
    pm.archiveProxy(proxies[5].host);
    const screened = [];
    pm.setScreener({
      config: { enabled: true, ttlMs: 60000, autoBlacklistAfter: 0 },
      screen: async (p) => { screened.push(p.host); p.screen = { pass: true, score: 90 }; p.screenedAt = Date.now(); return p.screen; },
    });
    const res = await pm.screenBatch(2, 2);
    expect(res).toHaveLength(2);
    expect(screened).toHaveLength(2);
    expect(screened).not.toContain(proxies[5].host); // archived skipped
  });
});

// ---------------------------------------------------------------------------
describe('visit-engine pre-flight gate: no request through an unscreened proxy', () => {
  const mkEngine = (pm, um) => new VisitEngine(pm, um, { mode: 'http', requestTimeout: 500, retryAttempts: 0 });

  it('replaces a failing proxy and only sends the request through a verified one', async () => {
    const bad = mkProxy(); const good = mkProxy();
    let captured = null;
    let selectCalls = 0;
    const failures = [];
    const pm = {
      proxies: [bad, good],
      select: () => (selectCalls++ === 0 ? bad : good),
      ensureScreened: async (p) => p === good,
      recordFailure: (p, t) => failures.push([p.host, t]),
      recordSuccess() {},
    };
    const um = { getRandom: () => ({ url: `https://g-${rndHost()}.example.com/`, subdomain: 'g' }), recordVisit() {} };
    const engine = mkEngine(pm, um);
    engine._httpVisit = async (proxy) => { captured = proxy; return { success: true, statusCode: 200, latency: 5, responseSize: 10 }; };

    const res = await engine.executeVisit({});
    expect(res.success).toBe(true);
    expect(captured).toBe(good);               // request went through the VERIFIED proxy
    expect(failures).toEqual([[bad.host, 'screen_failed']]); // bad one recorded
  });

  it('skips the visit (persisted, reason no_verified_proxy) when no proxy passes', async () => {
    const bad = mkProxy();
    const pm = {
      proxies: [bad],
      select: () => bad,
      ensureScreened: async () => false,
      recordFailure() {}, recordSuccess() {},
    };
    const um = { getRandom: () => ({ url: `https://s-${rndHost()}.example.com/`, subdomain: 's' }), recordVisit() {} };
    const engine = mkEngine(pm, um);
    let httpCalled = false;
    engine._httpVisit = async () => { httpCalled = true; return { success: true, statusCode: 200 }; };

    const res = await engine.executeVisit({});
    expect(httpCalled).toBe(false);            // NO request was made
    expect(res.success).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_verified_proxy');
  });
});
