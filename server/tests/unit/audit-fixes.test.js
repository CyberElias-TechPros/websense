// ============================================================================
// audit-fixes.test.js — Tests for the expert-audit round of fixes:
//   • api/validate.js            (proxy / URL / engine-config validation)
//   • visit-engine               (options.url / options.proxy passthrough —
//                                 the session-chain bug fix)
//   • proxy-manager              (healthCheckBatch rotating window, archived
//                                 proxies never probed)
//   • api/routes                 (GET /config whitelist — no circular
//                                 sessionManager leak; PATCH /config rejects
//                                 unknown keys; POST /proxies|urls 400s;
//                                 GET /visits?status=skipped)
// ============================================================================

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  validateProxyInput,
  validateUrlInput,
  validateEngineConfigPatch,
  ENGINE_CONFIG_SCHEMA,
} from '../../api/validate.js';
import createRoutes from '../../api/routes.js';
import VisitEngine from '../../core/visit-engine.js';
import ProxyManager from '../../core/proxy-manager.js';

// Random 10.x hosts keep DB writes hermetic across test runs.
const rndHost = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

// ---------------------------------------------------------------------------
describe('validateProxyInput', () => {
  it('accepts a valid credentialed http proxy', () => {
    const v = validateProxyInput({ host: rndHost(), port: 8080, type: 'http', username: 'u', password: 'p', country: 'us' });
    expect(v.ok).toBe(true);
    expect(v.value.country).toBe('US');
    expect(v.value.username).toBe('u');
  });

  it('accepts a hostname and defaults type/source', () => {
    const v = validateProxyInput({ host: `proxy-${rndHost()}.example.com`, port: '3128' });
    expect(v.ok).toBe(true);
    expect(v.value.type).toBe('http');
    expect(v.value.source).toBe('manual');
  });

  it('normalizes https→http and socks→socks5', () => {
    expect(validateProxyInput({ host: rndHost(), port: 1, type: 'https' }).value.type).toBe('http');
    expect(validateProxyInput({ host: rndHost(), port: 1, type: 'socks' }).value.type).toBe('socks5');
  });

  it('rejects bad host / port / type', () => {
    expect(validateProxyInput({ host: '999.1.1.1', port: 80 }).ok).toBe(false);
    expect(validateProxyInput({ host: rndHost(), port: 0 }).ok).toBe(false);
    expect(validateProxyInput({ host: rndHost(), port: 70000 }).ok).toBe(false);
    expect(validateProxyInput({ host: rndHost(), port: 80, type: 'ftp' }).ok).toBe(false);
    expect(validateProxyInput({ port: 80 }).ok).toBe(false);
  });

  it('requires username+password together', () => {
    expect(validateProxyInput({ host: rndHost(), port: 80, username: 'u' }).ok).toBe(false);
    expect(validateProxyInput({ host: rndHost(), port: 80, password: 'p' }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('validateUrlInput', () => {
  it('accepts http/https URLs', () => {
    expect(validateUrlInput({ url: 'https://example.com/a?b=1' }).ok).toBe(true);
    expect(validateUrlInput({ url: 'http://sub.example.org' }).ok).toBe(true);
  });

  it('rejects non-http protocols, junk, and over-long URLs', () => {
    expect(validateUrlInput({ url: 'ftp://example.com' }).ok).toBe(false);
    expect(validateUrlInput({ url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(validateUrlInput({ url: 'not a url' }).ok).toBe(false);
    expect(validateUrlInput({ url: 'https://example.com/' + 'x'.repeat(2100) }).ok).toBe(false);
    expect(validateUrlInput({}).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('validateEngineConfigPatch', () => {
  it('accepts valid known keys and rejects unknown keys', () => {
    expect(validateEngineConfigPatch({ concurrency: 5, mode: 'browser', headless: false }).ok).toBe(true);
    const bad = validateEngineConfigPatch({ concurrency: 5, sessionManager: {} });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/unknown config keys/);
  });

  it('enforces ranges and enum values', () => {
    expect(validateEngineConfigPatch({ minInterval: 100 }).ok).toBe(false); // < 500
    expect(validateEngineConfigPatch({ concurrency: 99 }).ok).toBe(false); // > 20
    expect(validateEngineConfigPatch({ mode: 'turbo' }).ok).toBe(false);
    expect(validateEngineConfigPatch({ headless: 'yes' }).ok).toBe(false);
    expect(validateEngineConfigPatch({ retryAttempts: 3, requestTimeout: 15000 }).ok).toBe(true);
  });

  it('checks maxInterval >= minInterval against the MERGED config', () => {
    // Patch only maxInterval, but current minInterval is higher → must fail.
    const bad = validateEngineConfigPatch({ maxInterval: 1000 }, { minInterval: 5000, maxInterval: 30000 });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/maxInterval/);
    // Same patch against a compatible current config → ok.
    expect(validateEngineConfigPatch({ maxInterval: 1000 }, { minInterval: 500, maxInterval: 30000 }).ok).toBe(true);
    // Both in patch, inverted → fail.
    expect(validateEngineConfigPatch({ minInterval: 5000, maxInterval: 1000 }).ok).toBe(false);
  });

  it('empty patch is valid (no-op)', () => {
    expect(validateEngineConfigPatch({}).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('visit-engine: caller-supplied url/proxy passthrough (session-chain fix)', () => {
  const mkEngine = (pm, um) => new VisitEngine(pm, um, { mode: 'http', requestTimeout: 1000, retryAttempts: 0 });

  it('uses options.url and options.proxy instead of re-rolling random ones', async () => {
    const targetUrl = `https://target-${rndHost()}.example.com/page`;
    const chainProxy = { host: rndHost(), port: 8080, enabled: true, archived: false, country: 'DE', city: 'Berlin', flag: '🇩🇪', source: 'manual' };
    let captured = null;
    const pm = {
      select: () => { throw new Error('select() must NOT be called when options.proxy is given'); },
      recordSuccess() {}, recordFailure() {},
    };
    const um = { getRandom: () => { throw new Error('getRandom() must NOT be called when options.url is given'); }, recordVisit() {} };
    const engine = mkEngine(pm, um);
    engine._httpVisit = async (proxy, urlEntry) => {
      captured = { proxy, urlEntry };
      return { success: true, statusCode: 200, latency: 7, responseSize: 123 };
    };

    const res = await engine.executeVisit({ url: targetUrl, proxy: chainProxy });
    expect(res.success).toBe(true);
    expect(captured.urlEntry.url).toBe(targetUrl);
    expect(captured.urlEntry.subdomain).toBe(new URL(targetUrl).hostname);
    expect(captured.proxy).toBe(chainProxy);
    expect(res.url).toBe(targetUrl);
    expect(res.proxy.host).toBe(chainProxy.host);
  });

  it('re-selects when the caller-supplied proxy was disabled/archived meanwhile', async () => {
    const deadProxy = { host: rndHost(), port: 1, enabled: false, archived: true, source: 'free' };
    const freshProxy = { host: rndHost(), port: 2, enabled: true, archived: false, country: 'US', city: 'NYC', flag: '🇺🇸', source: 'manual' };
    let captured = null;
    let selectCalls = 0;
    const pm = { select: () => { selectCalls++; return freshProxy; }, recordSuccess() {}, recordFailure() {} };
    const um = { getRandom: () => ({ url: `https://um-${rndHost()}.example.com/`, subdomain: 'x' }), recordVisit() {} };
    const engine = mkEngine(pm, um);
    engine._httpVisit = async (proxy, urlEntry) => {
      captured = { proxy, urlEntry };
      return { success: true, statusCode: 200, latency: 3, responseSize: 10 };
    };

    const res = await engine.executeVisit({ proxy: deadProxy });
    expect(res.success).toBe(true);
    expect(selectCalls).toBe(1);
    expect(captured.proxy).toBe(freshProxy);
  });

  it('falls back to random url/proxy when options are absent', async () => {
    const randProxy = { host: rndHost(), port: 3, enabled: true, archived: false, source: 'manual' };
    let captured = null;
    const pm = { getRandom: () => randProxy, select: () => randProxy, recordSuccess() {}, recordFailure() {} };
    const um = { getRandom: () => ({ url: `https://rand-${rndHost()}.example.com/`, subdomain: 'r' }), recordVisit() {} };
    const engine = mkEngine(pm, um);
    engine._httpVisit = async (proxy, urlEntry) => {
      captured = { proxy, urlEntry };
      return { success: true, statusCode: 200, latency: 3, responseSize: 10 };
    };
    const res = await engine.executeVisit({});
    expect(res.success).toBe(true);
    expect(captured.proxy).toBe(randProxy);
    expect(captured.urlEntry.subdomain).toBe('r');
  });
});

// ---------------------------------------------------------------------------
describe('proxy-manager: batched health checks', () => {
  const mkProxies = (n) =>
    Array.from({ length: n }, (_, i) => ({
      host: rndHost(), port: 8000 + i, enabled: true, archived: false,
      country: 'US', city: 'c', flag: '🇺🇸', source: 'free', id: `h${i}`,
    }));

  it('healthCheckBatch probes only a rotating window, never archived proxies', async () => {
    const proxies = mkProxies(6);
    const pm = new ProxyManager(proxies, {});
    const archivedOne = proxies[5];
    pm.archiveProxy(archivedOne.host); // archived → enabled=false
    expect(pm.proxies.find((p) => p.host === archivedOne.host).archived).toBe(true);

    const checked = [];
    pm.healthCheck = async (p) => { checked.push(p.host); return { ok: true }; };

    await pm.healthCheckBatch(2, 2);
    expect(checked.length).toBe(2);
    expect(checked).not.toContain(archivedOne.host);

    await pm.healthCheckBatch(2, 2);
    expect(checked.length).toBe(4);
    expect(checked).not.toContain(archivedOne.host);

    // Rotate through the rest — window wraps, archived still never probed.
    await pm.healthCheckBatch(2, 2);
    await pm.healthCheckBatch(2, 2);
    expect(checked.length).toBe(8);
    expect(checked).not.toContain(archivedOne.host);
    // Every non-archived proxy got probed at least once across the windows.
    for (const p of proxies.slice(0, 5)) expect(checked).toContain(p.host);
  });

  it('healthCheckAll is capped by concurrency and skips archived', async () => {
    const proxies = mkProxies(4);
    const pm = new ProxyManager(proxies, {});
    pm.archiveProxy(proxies[3].host);
    const checked = [];
    pm.healthCheck = async (p) => { checked.push(p.host); return { ok: true }; };
    const results = await pm.healthCheckAll(2);
    expect(checked.length).toBe(3);
    expect(checked).not.toContain(proxies[3].host);
    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
describe('routes: config whitelist, validation 400s, visits skipped filter', () => {
  const buildApp = () => {
    const scheduler = {
      config: {
        minInterval: 5000, maxInterval: 30000, concurrency: 3,
        requestTimeout: 30000, retryAttempts: 2, mode: 'http', headless: true,
        // The circular object that must NEVER leak into GET /config:
        sessionManager: null,
      },
      updateConfig(patch) { Object.assign(this.config, patch); },
      getStatus: () => ({ running: false }),
    };
    // Make sessionManager actually circular to prove serialization safety.
    scheduler.config.sessionManager = scheduler.config;

    const proxyManager = {
      addProxy: (p) => ({ id: `${p.host}:${p.port}`, ...p }),
      getAll: () => [], getActive: () => [],
    };
    const urlManager = {
      addUrl: (u) => ({ url: u, subdomain: new URL(u).hostname, active: true }),
      getAll: () => [],
    };
    const app = express();
    app.use(express.json());
    app.use('/api', createRoutes(scheduler, proxyManager, urlManager, null));
    return app;
  };

  it('GET /api/config returns only schema keys — no circular sessionManager (no 500)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(Object.keys(ENGINE_CONFIG_SCHEMA).sort());
    expect(res.body).not.toHaveProperty('sessionManager');
    expect(res.body.concurrency).toBe(3);
  });

  it('PATCH /api/config rejects unknown keys with 400, accepts valid patch', async () => {
    const app = buildApp();
    const bad = await request(app).patch('/api/config').send({ evil: 'x', sessionManager: {} });
    expect(bad.status).toBe(400);
    expect(bad.body.details.join(' ')).toMatch(/unknown config keys/);

    const ok = await request(app).patch('/api/config').send({ concurrency: 7, mode: 'mixed' });
    expect(ok.status).toBe(200);
    expect(ok.body.config.concurrency).toBe(7);
    expect(ok.body.config.mode).toBe('mixed');
    expect(ok.body.config).not.toHaveProperty('sessionManager');

    const inverted = await request(app).patch('/api/config').send({ maxInterval: 100 });
    expect(inverted.status).toBe(400); // merged: maxInterval 100 < minInterval 5000
  });

  it('POST /api/proxies validates input (400 on bad payload, 200 on good)', async () => {
    const app = buildApp();
    const bad = await request(app).post('/api/proxies').send({ host: '999.9.9.9', port: -1 });
    expect(bad.status).toBe(400);
    expect(Array.isArray(bad.body.details)).toBe(true);

    const ok = await request(app).post('/api/proxies').send({ host: rndHost(), port: 8080, type: 'http' });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
  });

  it('POST /api/urls validates input (400 on non-http, 200 on https)', async () => {
    const app = buildApp();
    const bad = await request(app).post('/api/urls').send({ url: 'ftp://example.com/x' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/urls').send({ url: `https://t-${rndHost()}.example.com/` });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
  });

  it('GET /api/visits?status=skipped returns an array (filter wired)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/visits?status=skipped&limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.visits)).toBe(true);
    for (const v of res.body.visits) expect(Number(v.skipped)).toBe(1);
  });
});
