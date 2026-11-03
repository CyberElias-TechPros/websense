// ============================================================================
// qa-vantages.test.js — Proxy health segregation for QA vantages.
//
// The run-start route must only launch cells through proxies that pass a
// fresh screen ("confirmed working"): verified-first selection, a hard
// ensureScreened() gate at POST /runs, and unhealthy vantages reported back
// instead of silently burning cells on dead exits.
//
// DB isolation: DB_PATH points at a temp file BEFORE any module that opens
// the DB is imported (dynamic imports inside beforeAll).
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'websense-qa-vantages-'));
process.env.DB_PATH = path.join(tmpDir, 'qa.db');
process.env.QA_REQUEST_DELAY_MS = '0';

let QaRunner, createQaRouter, buildVantages, request;

const FIXTURE_URL = 'http://127.0.0.1:4001/same';

const mkProxy = (country, verified) => ({
  host: '127.0.0.1',
  port: 1, // unroutable — captures fail fast, we only assert the gate
  country,
  verified,
  enabled: true,
  blacklisted: false,
  archived: false,
});

/** Fake ProxyManager: pools by country, isScreenedOk = verified flag. */
function fakeProxyManager(pools, { screenOk } = {}) {
  return {
    getActiveProxies: () => Object.values(pools).flat(),
    getByCountry: (c) => pools[String(c).toUpperCase()] || [],
    isScreenedOk: (p) => !!p.verified,
    ensureScreened: async (p) => (screenOk ? !!screenOk(p) : !!p.verified),
  };
}

let fixtureHttp;

beforeAll(async () => {
  QaRunner = (await import('../../qa/runner.js')).default;
  const routesMod = await import('../../qa/qa-routes.js');
  createQaRouter = routesMod.default;
  buildVantages = routesMod.buildVantages;
  request = (await import('supertest')).default;

  const fixtureApp = express();
  fixtureApp.get('/same', (req, res) => res.type('html').send('<title>Fun Arcade</title><h1>Fun Arcade</h1>'));
  fixtureHttp = await new Promise((resolve) => {
    const s = fixtureApp.listen(4001, '127.0.0.1', () => resolve(s));
  });
});

afterAll(async () => {
  if (fixtureHttp) await new Promise((resolve) => fixtureHttp.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp(proxyManager) {
  const runner = new QaRunner({
    io: null,
    config: { requestDelayMs: 0, timeoutMs: 3000, concurrency: 1 },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/qa', createQaRouter({ runner, proxyManager, urlManager: null }));
  return { app, runner };
}

const baseBody = { urls: [FIXTURE_URL], deviceIds: ['desktop-chrome-win'], includeDirect: false };

describe('QA vantage health gate', () => {
  it('verified-first selection: prefers the proxy with a passing screen', () => {
    const dead = mkProxy('DE', false);
    const alive = mkProxy('DE', true);
    const pm = fakeProxyManager({ DE: [dead, alive] });
    const vantages = buildVantages(pm, { countries: ['DE'], includeDirect: false });
    expect(vantages).toHaveLength(1);
    expect(vantages[0].proxy).toBe(alive);
  });

  it('falls back to the raw pool when a country has no verified proxy yet (pre-boot)', () => {
    const only = mkProxy('GB', false);
    const pm = fakeProxyManager({ GB: [only] });
    const vantages = buildVantages(pm, { countries: ['GB'], includeDirect: false });
    expect(vantages).toHaveLength(1);
    expect(vantages[0].proxy).toBe(only); // gate at run start does the hard check
  });

  it('run start segregates proxies that fail ensureScreened and reports them', async () => {
    // DE pool contains a "verified" proxy whose fresh re-screen FAILS — the
    // hard gate must still drop it (stale verification is not enough).
    const de = mkProxy('DE', true);
    const gb = mkProxy('GB', true);
    const pm = fakeProxyManager({ DE: [de], GB: [gb] }, { screenOk: (p) => p.country === 'GB' });
    const { app } = makeApp(pm);

    const res = await request(app).post('/api/qa/runs').send({
      ...baseBody,
      countries: ['DE', 'GB'],
    });
    expect(res.status).toBe(202);
    expect(res.body.unhealthyVantages).toEqual(['DE']);
    expect(res.body.totalCells).toBe(1); // only the GB proxy survived the gate
    await request(app).post(`/api/qa/runs/${res.body.runId}/cancel`);
  }, 20_000);

  it('every proxy failing + no DIRECT → 400 with the unhealthy list', async () => {
    const pm = fakeProxyManager({ XX: [mkProxy('XX', false)] }, { screenOk: () => false });
    const { app } = makeApp(pm);

    const res = await request(app).post('/api/qa/runs').send({
      ...baseBody,
      countries: ['XX'],
    });
    expect(res.status).toBe(400);
    expect(res.body.unhealthyVantages).toEqual(['XX']);
  });

  it('DIRECT control always survives the gate', async () => {
    const pm = fakeProxyManager({ XX: [mkProxy('XX', false)] }, { screenOk: () => false });
    const { app } = makeApp(pm);

    const res = await request(app).post('/api/qa/runs').send({
      ...baseBody,
      countries: ['XX'],
      includeDirect: true,
    });
    expect(res.status).toBe(202);
    expect(res.body.unhealthyVantages).toEqual(['XX']);
    expect(res.body.totalCells).toBe(1); // DIRECT only
    await request(app).post(`/api/qa/runs/${res.body.runId}/cancel`);
  }, 20_000);

  it('no proxy manager wired (tests/demo) keeps legacy behavior', async () => {
    const { app } = makeApp(null);
    const res = await request(app).post('/api/qa/runs').send({
      ...baseBody,
      includeDirect: true,
    });
    expect(res.status).toBe(202);
    expect(res.body.unhealthyVantages).toBeUndefined();
    await request(app).post(`/api/qa/runs/${res.body.runId}/cancel`);
  }, 20_000);
});
