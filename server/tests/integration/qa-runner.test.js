// ============================================================================
// qa-runner.test.js — End-to-end integration for the Geo/Device QA subsystem.
//
// A local fixture "site" varies its responses by User-Agent (device blocks),
// by an x-test-country header (geo blocks / locale variation) and serves loops
// + redirects. The QA runner executes a real URL × device × vantage matrix
// against it using virtual vantages (no real proxies), then we assert the
// stored classifications and the REST /api/qa surface (via supertest).
//
// DB isolation: DB_PATH is pointed at a temp file BEFORE any module that
// opens the DB is imported (dynamic imports inside beforeAll).
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must run before db.js is imported anywhere in this test process.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'websense-qa-test-'));
process.env.DB_PATH = path.join(tmpDir, 'qa-test.db');

let QaRunner, createQaRouter, store, captureHttpMod;

const pageHtml = (title, body) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;

const FULL_CONTENT =
  'Welcome to Fun Arcade. Play hundreds of free casual games instantly in your ' +
  'browser: puzzles, racing, cards, word games and more. No download needed, ' +
  'just click and play with friends across the world today.';

function buildFixtureApp(seenHeaders) {
  const app = express();
  app.use((req, res, next) => { seenHeaders.push(req.headers); next(); });

  const isMobileUA = (ua = '') => /Mobile|iPhone|Android/i.test(ua);

  // Identical everywhere — control page.
  app.get('/same', (req, res) => res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT)));

  // Device-gated: mobile/tablet get an app wall.
  app.get('/by-device', (req, res) => {
    if (isMobileUA(req.headers['user-agent'])) {
      return res.type('html').send(pageHtml('Get our app', 'Download our app to continue playing! Not supported on this browser.'));
    }
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });

  // Hard geo gate for GB: 451 + copy.
  app.get('/geo-451', (req, res) => {
    if (req.headers['x-test-country'] === 'GB') {
      return res.status(451).type('html').send(pageHtml('Unavailable', 'Sorry, this content is not available in your region.'));
    }
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });

  // Soft geo gate for GB: 200 with block interstitial copy.
  app.get('/geo-copy', (req, res) => {
    if (req.headers['x-test-country'] === 'GB') {
      return res.type('html').send(pageHtml('Region block', 'This service is not available in your country.'));
    }
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });

  // Geo gate expressed as a redirect to a block page.
  app.get('/geo-redirect', (req, res) => {
    if (req.headers['x-test-country'] === 'GB') return res.redirect(302, '/geo-blocked');
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });
  app.get('/geo-blocked', (req, res) =>
    res.type('html').send(pageHtml('Blocked', 'This page is blocked in your territory.')));

  // Locale-driven content divergence (Accept-Language determines copy).
  app.get('/locale-vary', (req, res) => {
    if (String(req.headers['accept-language'] || '').startsWith('de')) {
      return res.type('html').send(pageHtml(
        'Spielhalle',
        'Diese Website befindet sich derzeit im Wartungsmodus. Bitte besuchen Sie uns bald wieder. Vielen Dank für Ihr Verständnis und Ihre Geduld.'
      ));
    }
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });

  // Mobile-only redirect loop (two fixed paths ping-ponging).
  app.get('/loop', (req, res) => {
    if (isMobileUA(req.headers['user-agent'])) return res.redirect(302, '/loop-m');
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });
  app.get('/loop-m', (req, res) => {
    if (isMobileUA(req.headers['user-agent'])) return res.redirect(302, '/loop');
    res.type('html').send(pageHtml('Fun Arcade', FULL_CONTENT));
  });

  // Redirect chain ending on the control page (should NOT loop-flag).
  app.get('/bounce', (req, res) => res.redirect(301, '/bounce-2'));
  app.get('/bounce-2', (req, res) => res.redirect(302, '/same'));

  return app;
}

describe('qa runner integration (local fixture, virtual vantages)', () => {
  let fixtureServer;
  let baseUrl;
  let runner;
  let scopeOverride;
  const seenHeaders = [];

  beforeAll(async () => {
    ({ QaRunner } = await import('../../qa/runner.js'));
    ({ default: createQaRouter } = await import('../../qa/qa-routes.js'));
    store = await import('../../qa/store.js');
    captureHttpMod = await import('../../qa/capture-http.js');

    const app = buildFixtureApp(seenHeaders);
    await new Promise((resolve) => {
      fixtureServer = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${fixtureServer.address().port}`;

    runner = new QaRunner({
      config: {
        mode: 'http',
        concurrency: 3,
        requestDelayMs: 0,
        timeoutMs: 5000,
        maxCells: 200,
        identifyHeader: true,
      },
    });

    // Two virtual vantages: DIRECT (control) + simulated GB.
    scopeOverride = (paths) => ({
      urls: paths.map((p) => `${baseUrl}${p}`),
      deviceIds: ['desktop-chrome-win', 'mobile-iphone-safari'],
      vantages: [
        { code: 'DIRECT', proxy: null, acceptLanguage: 'en-US,en;q=0.9' },
        { code: 'GB', proxy: null, acceptLanguage: 'en-GB,en;q=0.9', extraHeaders: { 'x-test-country': 'GB' } },
        { code: 'DE', proxy: null, acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8' },
      ],
      mode: 'http',
    });
  });

  afterAll(async () => {
    runner?.stop();
    await new Promise((r) => fixtureServer?.close(r));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects oversized matrices', () => {
    // 40 URLs × 3 devices × 2 vantages = 240 cells > configured 200 cap.
    const urls = Array.from({ length: 40 }, (_, i) => `${baseUrl}/p${i}`);
    expect(() =>
      runner.startRun({
        urls,
        deviceIds: ['desktop-chrome-win', 'mobile-iphone-safari', 'tablet-ipad-safari'],
        vantages: [{ code: 'DIRECT', proxy: null }, { code: 'GB', proxy: null }],
      })
    ).toThrow(/matrix too large/i);
  });

  it('rejects unknown device profiles and bad URLs', () => {
    expect(() =>
      runner.startRun({ urls: [`${baseUrl}/same`], deviceIds: ['holodeck-9000'], vantages: [{ code: 'DIRECT' }] })
    ).toThrow(/unknown device profile/);
    expect(() =>
      runner.startRun({ urls: ['javascript:alert(1)'], deviceIds: ['desktop-chrome-win'], vantages: [{ code: 'DIRECT' }] })
    ).toThrow(/invalid URL/);
  });

  it('runs the full matrix and classifies geo/device blocks + divergence', async () => {
    const scope = scopeOverride(['/same', '/by-device', '/geo-451', '/geo-copy', '/geo-redirect', '/locale-vary', '/bounce']);
    const { runId, totalCells } = runner.startRun(scope);
    expect(totalCells).toBe(7 * 2 * 3);

    const summary = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for run_complete')), 30_000);
      runner.once('run_complete', (s) => { clearTimeout(t); resolve(s); });
    });
    expect(summary.status).toBe('done');
    expect(summary.done).toBe(totalCells);

    const run = store.getRun(runId);
    expect(run.status).toBe('done');

    const cells = store.getRunCells(runId);
    const find = (urlPath, vantage, deviceId) =>
      cells.find((c) => c.url.endsWith(urlPath) && c.vantage === vantage && c.device_id === deviceId);

    // Control page: identical everywhere.
    for (const v of ['DIRECT', 'GB', 'DE']) {
      for (const d of ['desktop-chrome-win', 'mobile-iphone-safari']) {
        expect(find('/same', v, d)?.classification).toBe('identical');
      }
    }

    // Geo gates: GB blocked on all three gate styles, others fine.
    expect(find('/geo-451', 'GB', 'desktop-chrome-win')?.classification).toBe('geo_blocked');
    expect(find('/geo-copy', 'GB', 'desktop-chrome-win')?.classification).toBe('geo_blocked');
    expect(find('/geo-redirect', 'GB', 'desktop-chrome-win')?.classification).toBe('geo_blocked');
    expect(['identical', 'similar']).toContain(find('/geo-451', 'DIRECT', 'desktop-chrome-win')?.classification);

    // Device gate: app wall for the iPhone profile on both vantages.
    expect(find('/by-device', 'DIRECT', 'mobile-iphone-safari')?.classification).toBe('device_blocked');
    expect(find('/by-device', 'GB', 'mobile-iphone-safari')?.classification).toBe('device_blocked');
    expect(['identical', 'similar']).toContain(find('/by-device', 'DIRECT', 'desktop-chrome-win')?.classification);

    // Locale divergence: DE vantage on /locale-vary should diverge (German maintenance text vs English).
    expect(find('/locale-vary', 'DE', 'desktop-chrome-win')?.classification).toBe('divergent');

    // Redirect chain recorded (both redirect hops + final 200 page).
    const bounce = find('/bounce', 'DIRECT', 'desktop-chrome-win');
    expect(bounce.redirectChain.length).toBe(3);
    expect(bounce.final_url).toMatch(/\/same$/);
    expect(bounce.classification).toBe('identical');

    // Identify header really went out.
    expect(seenHeaders.some((h) => h['x-websense-qa']?.startsWith('run:'))).toBe(true);
  }, 45_000);

  it('detects device redirect loops (loop caps at maxRedirects)', async () => {
    const scope = scopeOverride(['/loop']);
    const { runId } = runner.startRun(scope);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 30_000);
      runner.once('run_complete', (s) => { clearTimeout(t); resolve(s); });
    });
    const cells = store.getRunCells(runId);
    const mobileDirect = cells.find((c) => c.device_id === 'mobile-iphone-safari' && c.vantage === 'DIRECT');
    const desktopDirect = cells.find((c) => c.device_id === 'desktop-chrome-win' && c.vantage === 'DIRECT');
    expect(desktopDirect.classification).toBe('identical');
    expect(['redirect_loop', 'device_blocked']).toContain(mobileDirect.classification);
    expect(mobileDirect.redirectChain.length).toBeGreaterThanOrEqual(3);
  }, 45_000);

  it('exposes the REST surface: runs, run detail, matrix', async () => {
    const scope = scopeOverride(['/same', '/geo-451']);
    const app = express();
    app.use(express.json());
    app.use('/api/qa', createQaRouter({ runner, proxyManager: null, urlManager: null }));

    const request = (await import('supertest')).default;

    // Router-level run via virtual scope path (urls/devices/countries resolved
    // against no proxy pool → DIRECT vantage only).
    const startRes = await request(app)
      .post('/api/qa/runs')
      .send({ urls: scope.urls.slice(0, 2), deviceIds: ['desktop-chrome-win'], includeDirect: true });
    expect(startRes.status).toBe(202);
    expect(startRes.body.totalCells).toBe(2);

    const runId = startRes.body.runId;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 20_000);
      runner.once('run_complete', (s) => { clearTimeout(t); resolve(s); });
    });

    const listRes = await request(app).get('/api/qa/runs');
    expect(listRes.status).toBe(200);
    expect(listRes.body.runs.find((r) => r.id === runId)).toBeTruthy();

    const detailRes = await request(app).get(`/api/qa/runs/${runId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.cells.length).toBe(2);

    const matrixRes = await request(app).get(`/api/qa/runs/${runId}/matrix`);
    expect(matrixRes.status).toBe(200);
    expect(matrixRes.body.total).toBe(2);
    expect(matrixRes.body.rows.length).toBe(2);
    expect(matrixRes.body.columns.length).toBe(1); // DIRECT × desktop
    expect(matrixRes.body.counts.identical).toBeGreaterThanOrEqual(1);

    const missing = await request(app).get('/api/qa/runs/does-not-exist');
    expect(missing.status).toBe(404);
  }, 40_000);

  it('rejects router runs with no vantage points and oversized scopes', async () => {
    const app = express();
    app.use(express.json());
    // No proxy manager and includeDirect:false → zero vantages → 400.
    app.use('/api/qa', createQaRouter({ runner, proxyManager: null, urlManager: null }));
    const request = (await import('supertest')).default;

    const noVantage = await request(app)
      .post('/api/qa/runs')
      .send({ urls: [`${baseUrl}/same`], deviceIds: ['desktop-chrome-win'], includeDirect: false });
    expect(noVantage.status).toBe(400);
    expect(noVantage.body.error).toMatch(/vantage/i);

    const tooBig = await request(app)
      .post('/api/qa/runs')
      .send({
        urls: Array.from({ length: 210 }, (_, i) => `${baseUrl}/p${i}`),
        deviceIds: ['desktop-chrome-win'],
        includeDirect: true,
      });
    expect(tooBig.status).toBe(400);
  }, 20_000);
});
