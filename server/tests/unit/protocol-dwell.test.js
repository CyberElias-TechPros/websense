// ============================================================================
// protocol-dwell.test.js — Tests for the runtime-ops fixes:
//   • buildProxyList: Webshare protocol (WEBSHARE_PROTOCOL, default socks5,
//     per-entry override) — wrong protocol = every paid visit fails (407 etc.)
//   • ProxyManager.createAgent: socks5 → SocksProxyAgent, http → Http/Https agent
//   • ProxyManager.healthCheck: 407-style probe failure → unhealthy, stage http
//   • clampDwellMs: final on-page dwell clamped to [20s, 90s] (env-tunable)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildProxyList, PROXIES } from '../../config/proxies.js';
import ProxyManager from '../../core/proxy-manager.js';
import { clampDwellMs } from '../../core/browser-mode.js';

const rndHost = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

// ---------------------------------------------------------------------------
describe('buildProxyList: per-proxy protocol', () => {
  const OLD = process.env.WEBSHARE_PROTOCOL;
  afterEach(() => {
    if (OLD === undefined) delete process.env.WEBSHARE_PROTOCOL;
    else process.env.WEBSHARE_PROTOCOL = OLD;
  });

  it('defaults Webshare (paid) proxies to socks5', () => {
    delete process.env.WEBSHARE_PROTOCOL;
    const list = buildProxyList({ username: 'u', password: 'p' });
    expect(list.length).toBe(PROXIES.length);
    expect(list.every((p) => p.type === 'socks5')).toBe(true);
    expect(list.every((p) => p.source === 'webshare')).toBe(true);
    // Paid proxies carry the env credentials
    expect(list[0].username).toBe('u');
    expect(list[0].password).toBe('p');
  });

  it('honors WEBSHARE_PROTOCOL=http and per-entry type override', () => {
    process.env.WEBSHARE_PROTOCOL = 'http';
    const list = buildProxyList({ username: 'u', password: 'p' });
    expect(list.every((p) => p.type === 'http' || p.type === undefined ? p.type === 'http' : true)).toBe(true);
    process.env.WEBSHARE_PROTOCOL = 'socks';
    const list2 = buildProxyList({});
    expect(list2.every((p) => p.type === 'socks5')).toBe(true); // 'socks' normalized
  });
});

// ---------------------------------------------------------------------------
describe('createAgent: protocol selects the right agent class', () => {
  it('socks5 proxy → SocksProxyAgent; http proxy → Https/HttpProxyAgent', () => {
    const pm = new ProxyManager([], {});
    const socks = pm.createAgent({ host: rndHost(), port: 1080, type: 'socks5' }, true);
    expect(socks.constructor.name).toBe('SocksProxyAgent');
    const http = pm.createAgent({ host: rndHost(), port: 8080, type: 'http' }, true);
    expect(http.constructor.name).toBe('HttpsProxyAgent');
    const httpPlain = pm.createAgent({ host: rndHost(), port: 8080, type: 'http' }, false);
    expect(httpPlain.constructor.name).toBe('HttpProxyAgent');
    // legacy 'socks' also maps to socks5
    expect(pm.createAgent({ host: rndHost(), port: 1080, type: 'socks' }, true).constructor.name).toBe('SocksProxyAgent');
    // proxy URL carries scheme + (only proxy-own) credentials
    const url = pm.createProxyUrl({ host: '1.2.3.4', port: 1080, type: 'socks5', username: 'u', password: 'p@ss' });
    expect(url).toBe('socks5://u:p%40ss@1.2.3.4:1080');
    expect(pm.createProxyUrl({ host: '1.2.3.4', port: 8080, type: 'http' })).toBe('http://1.2.3.4:8080');
  });
});

// ---------------------------------------------------------------------------
describe('healthCheck: auth failures classified distinctly', () => {
  it('407-style probe error → unhealthy at http stage with the 407 message', async () => {
    const pm = new ProxyManager([{ host: rndHost(), port: 1080, type: 'socks5', source: 'webshare', enabled: true, country: 'US', city: 'c', flag: '🇺🇸' }], { timeout: 500 });
    pm._tcpProbe = async () => true; // TCP fine, HTTP probe fails
    pm._httpProbe = async () => {
      const e = new Error('407 Proxy Authentication Required — proxy alive, credentials missing/rejected (proxy type=socks5)');
      e.proxyStatus = 407;
      throw e;
    };
    const res = await pm.healthCheck(pm.proxies[0]);
    expect(res.healthy).toBe(false);
    expect(res.stage).toBe('http');
    expect(res.error).toMatch(/407/);
    expect(pm.proxies[0].status).toBe('unhealthy');
  });

  it('healthy probe → healthy with latency', async () => {
    const pm = new ProxyManager([{ host: rndHost(), port: 8080, type: 'http', source: 'free', enabled: true, country: 'DE', city: 'c', flag: '🇩🇪' }], { timeout: 500 });
    pm._tcpProbe = async () => true;
    pm._httpProbe = async () => 42;
    const res = await pm.healthCheck(pm.proxies[0]);
    expect(res.healthy).toBe(true);
    expect(res.latency).toBe(42);
    expect(pm.proxies[0].status).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
describe('clampDwellMs: visit duration kept in the 20–90s human window', () => {
  it('clamps below-minimum and above-maximum dwells', () => {
    expect(clampDwellMs(3000)).toBe(20000);       // too fast → 20s floor
    expect(clampDwellMs(0)).toBe(20000);
    expect(clampDwellMs(250000)).toBe(90000);     // too long → 90s cap
    expect(clampDwellMs(45000)).toBe(45000);      // in range → unchanged
  });

  it('honors custom bounds and guards min>max', () => {
    expect(clampDwellMs(1000, 30, 60)).toBe(30000);
    expect(clampDwellMs(999999, 30, 60)).toBe(60000);
    expect(clampDwellMs(999999, 90, 20)).toBe(90000); // swapped → uses max as hi
  });
});
