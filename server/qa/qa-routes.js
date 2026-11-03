// ============================================================================
// qa/qa-routes.js — REST API for the Geo/Device QA testing capability.
//
// Mounted at /api/qa. Turns the proxy pool into "vantage points" (one active
// proxy per country), builds the matrix scope, and serves run results +
// the comparison matrix to the dashboard.
//
// Design notes:
//  - Scoped to the operator's own properties (the target URL registry).
//  - One representative proxy per country per run keeps volume low and
//    results interpretable (QA_VANTAGE_PROXIES can raise it deliberately).
//  - The DIRECT vantage is the no-proxy control/baseline.
// ============================================================================

import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';

import { listDeviceProfiles, languageForCountry } from './device-profiles.js';
import { isBrowserCaptureAvailable } from './capture-browser.js';
import { summarizeExposure, recordFromQaCell, recordFromVisit, EXPOSURE_RULES } from './exposure.js';
import * as store from './store.js';
import db from '../database/db.js';
import logger from '../utils/logger.js';

export default function createQaRouter({ runner, proxyManager = null, urlManager = null }) {
  const router = Router();

  // Same async-wrapper guard as api/routes.js: Express 4 doesn't catch async
  // rejections; wrap so QA route errors hit the error middleware.
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const orig = router[method].bind(router);
    router[method] = (p, ...handlers) =>
      orig(p, ...handlers.map((h) => (h && h.constructor.name === 'AsyncFunction' ? ah(h) : h)));
  }

  // -------------------------------------------------------------------------
  // Capabilities — what the matrix could cover right now
  // -------------------------------------------------------------------------
  router.get('/capabilities', (req, res) => {
    const browser = isBrowserCaptureAvailable();
    const countries = proxyManager ? availableCountries(proxyManager) : [];
    const urls = urlManager ? urlManager.getAll().filter((u) => u.enabled).length : 0;
    res.json({
      enabled: runner.config.enabled !== false,
      devices: listDeviceProfiles(),
      countries,                       // [{ code, proxies }]
      browserAvailable: browser.available,
      browserReason: browser.reason,
      urlCount: urls,
      defaults: {
        mode: runner.config.mode,
        concurrency: runner.config.concurrency,
        requestDelayMs: runner.config.requestDelayMs,
        maxCells: Math.min(runner.config.maxCells, 1500),
        identifyHeader: runner.config.identifyHeader,
        sweepIntervalMinutes: runner.config.sweepIntervalMinutes,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Start a run
  // Body: { urls?: string[], deviceIds?: string[], countries?: string[]|['*'],
  //         includeDirect?: boolean, mode?: 'http'|'browser'|'auto', note?: string }
  // -------------------------------------------------------------------------
  router.post('/runs', (req, res) => {
    const body = req.body || {};

    // --- URLs: default = all enabled target URLs --------------------------
    let urls = Array.isArray(body.urls) && body.urls.length ? body.urls : null;
    if (!urls) {
      if (!urlManager) return res.status(503).json({ error: 'URL registry unavailable' });
      urls = urlManager.getAll().filter((u) => u.enabled).map((u) => u.url);
    }
    urls = urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
    if (urls.length === 0) return res.status(400).json({ error: 'No valid URLs in scope' });

    // --- Devices ------------------------------------------------------------
    const validDeviceIds = listDeviceProfiles().map((d) => d.id);
    let deviceIds =
      Array.isArray(body.deviceIds) && body.deviceIds.length ? body.deviceIds : validDeviceIds;
    deviceIds = deviceIds.filter((id) => validDeviceIds.includes(id));
    if (deviceIds.length === 0) {
      return res.status(400).json({ error: 'No valid devices', validDeviceIds });
    }

    // --- Vantages -----------------------------------------------------------
    const vantages = buildVantages(proxyManager, body);
    if (vantages.length === 0) {
      return res.status(400).json({
        error:
          'No vantage points available. Enable DIRECT (includeDirect: true) or add healthy proxies.',
      });
    }

    const scope = {
      urls,
      deviceIds,
      vantages,
      mode: body.mode || runner.config.mode,
      note: typeof body.note === 'string' ? body.note.slice(0, 200) : '',
    };

    try {
      const result = runner.startRun(scope);
      logger.info(
        `🧪 QA run ${result.runId.slice(0, 8)} started: ${urls.length} URLs × ${deviceIds.length} devices × ${vantages.length} vantages (${result.totalCells} cells, mode=${result.mode})`
      );
      res.status(202).json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------
  router.get('/runs', (req, res) => {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '30', 10)));
    res.json({
      runs: store.listRuns(limit),
      active: [...runner.activeRuns],
    });
  });

  router.get('/runs/:id', (req, res) => {
    const run = store.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ ...run, cells: store.getRunCells(req.params.id), active: runner.isActive(run.id) });
  });

  router.get('/runs/:id/matrix', (req, res) => {
    const run = store.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({
      runId: run.id,
      status: run.status,
      mode: run.mode,
      createdAt: run.created_at,
      finishedAt: run.finished_at,
      ...store.buildMatrix(run.id),
    });
  });

  router.post('/runs/:id/cancel', (req, res) => {
    const cancelled = runner.cancelRun(req.params.id);
    if (!cancelled) return res.status(409).json({ error: 'Run is not active' });
    res.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Detection exposure (blue-hat sensing layer)
  // -------------------------------------------------------------------------

  /** Exposure report for one QA run: which mannerisms give each cell away. */
  router.get('/runs/:id/exposure', (req, res) => {
    const run = store.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const records = store.getRunCells(run.id).map(recordFromQaCell);
    const { results, ...summary } = summarizeExposure(records);
    // Fold per-record results into an id-indexed map to keep payloads slim.
    const byId = {};
    records.forEach((r, i) => {
      byId[r.id] = { score: results[i].score, flags: results[i].flags.map((f) => ({ rule: f.rule, name: f.name, severity: f.severity, why: f.why, detail: f.detail })) };
    });
    res.json({ runId: run.id, ...summary, results: undefined, byId, catalog: exposureCatalog() });
  });

  /** Offline audit of the visit engine's recent output from the DB. */
  router.get('/exposure/visits', (req, res) => {
    const limit = Math.max(10, Math.min(1000, parseInt(req.query.limit || '200', 10)));
    const rows = db
      .prepare(`SELECT * FROM visits ORDER BY created_at DESC LIMIT ?`)
      .all(limit);
    const records = rows.map(recordFromVisit);
    const { results, ...summary } = summarizeExposure(records);
    const byId = {};
    records.forEach((r, i) => {
      byId[r.id] = { score: results[i].score, flags: results[i].flags.map((f) => ({ rule: f.rule, severity: f.severity })) };
    });
    res.json({ scope: 'visits', limit, ...summary, results: undefined, byId, catalog: exposureCatalog() });
  });

  /** Ingest endpoint for sentinel middleware observations from own sites. */
  const sentinelLog = [];
  router.post('/sentinel/ingest', (req, res) => {
    const obs = req.body;
    if (!obs || typeof obs !== 'object') return res.status(400).json({ error: 'observation object required' });
    sentinelLog.push({ ...obs, receivedAt: new Date().toISOString() });
    if (sentinelLog.length > 5000) sentinelLog.splice(0, sentinelLog.length - 5000);
    res.status(202).json({ accepted: true, buffered: sentinelLog.length });
  });

  router.get('/sentinel/observations', (req, res) => {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '100', 10)));
    res.json({ observations: sentinelLog.slice(-limit).reverse(), buffered: sentinelLog.length });
  });

  // -------------------------------------------------------------------------
  // Cell screenshot (browser mode)
  // -------------------------------------------------------------------------
  router.get('/cells/:id/screenshot', (req, res) => {
    const cell = store.getCell(parseInt(req.params.id, 10) || 0);
    if (!cell || !cell.screenshot_path) return res.status(404).json({ error: 'No screenshot' });

    // Path traversal guard: only serve files under the configured dir.
    const root = path.resolve(runner.config.screenshotDir);
    const file = path.resolve(cell.screenshot_path);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      return res.status(404).json({ error: 'Screenshot not available' });
    }
    res.sendFile(file);
  });

  return router;
}

/** Rule catalog for UI legend/labels. */
function exposureCatalog() {
  return EXPOSURE_RULES.map((r) => ({ id: r.id, name: r.name, severity: r.severity, why: r.why }));
}

// ---------------------------------------------------------------------------
// Vantage resolution helpers
// ---------------------------------------------------------------------------

/** Countries currently covered by at least one active proxy. */
export function availableCountries(proxyManager) {
  const active = proxyManager.getActiveProxies ? proxyManager.getActiveProxies() : [];
  const byCountry = new Map();
  for (const p of active) {
    const code = (p.country || '').toUpperCase();
    if (!code) continue;
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code).push(p);
  }
  return [...byCountry.entries()]
    .map(([code, proxies]) => ({ code, proxies: proxies.length }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Turn a request body into vantage descriptors.
 * countries: ['*'] (default) = every country with active proxies
 * includeDirect (default true) adds the no-proxy control vantage 'DIRECT'.
 */
export function buildVantages(proxyManager, body = {}) {
  const perCountry = Math.max(
    1,
    Math.min(3, parseInt(process.env.QA_VANTAGE_PROXIES || '1', 10))
  );
  const vantages = [];

  const requested = Array.isArray(body.countries) ? body.countries.map((c) => String(c).toUpperCase()) : ['*'];
  const allCountries = proxyManager ? availableCountries(proxyManager) : [];
  const chosen = requested.includes('*')
    ? allCountries
    : allCountries.filter((c) => requested.includes(c.code));

  for (const { code } of chosen) {
    const pool = proxyManager.getByCountry(code) || [];
    for (const proxy of pool.slice(0, perCountry)) {
      vantages.push({
        code,
        proxy,
        acceptLanguage: languageForCountry(code),
        proxyHost: proxy.host,
      });
    }
  }
  // Explicitly requested countries with no proxy coverage are reported as gaps.
  const missing = requested.filter(
    (c) => c !== '*' && !chosen.find((x) => x.code === c)
  );

  if (body.includeDirect !== false) {
    vantages.push({ code: 'DIRECT', proxy: null, acceptLanguage: languageForCountry('US') });
  }

  return vantages;
}

/** Exposed for the capabilities endpoint so the UI can warn about gaps. */
export function missingCountries(proxyManager, countries) {
  const have = new Set(availableCountries(proxyManager).map((c) => c.code));
  return (countries || []).map((c) => String(c).toUpperCase()).filter((c) => !have.has(c));
}
