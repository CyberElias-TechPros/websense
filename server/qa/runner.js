// ============================================================================
// qa/runner.js — Geo/device QA matrix orchestrator.
//
// A "run" evaluates every combination of {URL × device profile × vantage} at
// an open, low-volume cadence (small concurrency + a fixed delay between
// requests) for sites YOU OWN. Each vantage is a plain descriptor:
//   { code: 'GB', proxy?: {host,port,username,password,type}, extraHeaders?: {} }
// 'DIRECT' is the no-proxy control/baseline vantage.
//
// The runner is deliberately decoupled from ProxyManager — the routes layer
// turns the proxy pool into vantage descriptors — which keeps it trivially
// testable with virtual vantages (no real proxies needed in tests).
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import { getDeviceProfile } from './device-profiles.js';
import { captureHttp } from './capture-http.js';
import { captureBrowser, isBrowserCaptureAvailable } from './capture-browser.js';
import { pickBaselineCell, classifyCell, isFlagged, DEFAULT_SIMILARITY_THRESHOLD } from './compare.js';
import { QA_CLASS } from './signals.js';
import { summarizeExposure, recordFromQaCell } from './exposure.js';
import * as store from './store.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_QA_CONFIG = {
  enabled: true,
  mode: 'http',                    // http | browser | auto (auto = browser if Chrome, else http)
  concurrency: 2,
  requestDelayMs: 1000,            // fixed, honest pacing — no organic-impersonation jitter
  timeoutMs: 30000,
  maxCells: 400,                   // per-run cell cap (hard cap 1500 enforced in routes)
  maxResponseBytes: 512 * 1024,
  identifyHeader: true,            // send X-Websense-QA: run:<id> on every request
  screenshotDir: path.join(__dirname, '..', 'data', 'qa-screenshots'),
  sweepIntervalMinutes: 0,         // 0 = manual runs only
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  cleanupDays: 14,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class QaRunner extends EventEmitter {
  /**
   * @param {object} deps
   * @param {object} [deps.io]      socket.io instance (optional — progress events)
   * @param {object} [deps.config]  overrides for DEFAULT_QA_CONFIG
   */
  constructor({ io = null, config = {} } = {}) {
    super();
    this.io = io;
    this.config = { ...DEFAULT_QA_CONFIG, ...config };
    this.activeRuns = new Set();
    this.cancelRequested = new Set();
    this._sweepTimer = null;
  }

  resolveMode(requested) {
    if (requested === 'auto') return isBrowserCaptureAvailable().available ? 'browser' : 'http';
    return requested === 'browser' ? 'browser' : 'http';
  }

  /** Hard cell-count guard. Returns null when ok, or an error message. */
  validateScope(scope) {
    const urls = scope.urls || [];
    const devices = scope.deviceIds || [];
    const vantages = scope.vantages || [];
    if (urls.length === 0) return 'scope.urls must be a non-empty array of URLs';
    if (devices.length === 0) return 'scope.deviceIds must be a non-empty array';
    if (vantages.length === 0) return 'scope.vantages must be a non-empty array';
    for (const d of devices) {
      if (!getDeviceProfile(d)) return `unknown device profile: ${d}`;
    }
    for (const u of urls) {
      if (!/^https?:\/\//i.test(u)) return `invalid URL in scope: ${u}`;
    }
    const cells = urls.length * devices.length * vantages.length;
    const max = Math.min(this.config.maxCells || 400, 1500);
    if (cells > max) {
      return (
        `matrix too large: ${cells} cells (${urls.length} URLs × ${devices.length} devices × ` +
        `${vantages.length} vantages) exceeds the per-run cap of ${max}. ` +
        `Narrow the scope (urls/devices/vantages) or raise QA_MAX_CELLS.`
      );
    }
    return null;
  }

  /**
   * Start a QA run. Returns { runId, totalCells }. Execution proceeds in the
   * background; progress is emitted on 'progress' / socket 'qa:progress'.
   */
  startRun(scope) {
    const problem = this.validateScope(scope);
    if (problem) {
      const err = new Error(problem);
      err.statusCode = 400;
      throw err;
    }
    const mode = this.resolveMode(scope.mode || this.config.mode);
    const runId = store.createRun({ mode, scope, note: scope.note || '' });

    const matrix = [];
    for (const url of scope.urls) {
      for (const deviceId of scope.deviceIds) {
        for (const vantage of scope.vantages) {
          matrix.push({ url, deviceId, vantage });
        }
      }
    }

    store.updateRunProgress(runId, { total: matrix.length, done: 0, ok: 0, flagged: 0, errors: 0 });
    this.activeRuns.add(runId);
    this._execute(runId, mode, matrix, scope).catch((err) => {
      logger.error(`QA run ${runId} failed: ${err.message}`);
      try { store.finishRun(runId, 'failed'); } catch { /* noop */ }
    });
    return { runId, totalCells: matrix.length, mode };
  }

  cancelRun(runId) {
    if (this.activeRuns.has(runId)) {
      this.cancelRequested.add(runId);
      return true;
    }
    return false;
  }

  isActive(runId) {
    return this.activeRuns.has(runId);
  }

  async _captureCell(runId, mode, cellDef, scope) {
    const { url, deviceId, vantage } = cellDef;
    const device = getDeviceProfile(deviceId);
    const capture = mode === 'browser' ? captureBrowser : captureHttp;
    const result = await capture({
      url,
      deviceProfile: device,
      proxy: vantage.proxy || null,
      acceptLanguage: vantage.acceptLanguage || scope.acceptLanguage || 'en-US,en;q=0.9',
      extraHeaders: vantage.extraHeaders || {},
      runId,
      identifyHeader: this.config.identifyHeader,
      timeoutMs: this.config.timeoutMs,
      maxBytes: this.config.maxResponseBytes,
      ...(mode === 'browser'
        ? {
            screenshotDir: path.join(this.config.screenshotDir, runId),
            cellKey: `${deviceId}-${vantage.code}-${Buffer.from(url).toString('base64url').slice(0, 24)}`,
          }
        : {}),
    });

    return {
      url,
      deviceId: device.id,
      deviceLabel: device.shortLabel,
      deviceType: device.type,
      vantage: vantage.code,
      proxyHost: vantage.proxy?.host || null,
      mode,
      ...result,
    };
  }

  async _execute(runId, mode, matrix, scope) {
    const total = matrix.length;
    let done = 0, ok = 0, flagged = 0, errors = 0;
    let idx = 0;
    const concurrency = Math.max(1, Math.min(6, this.config.concurrency || 2));

    const worker = async () => {
      while (idx < matrix.length) {
        if (this.cancelRequested.has(runId)) return;
        const myIdx = idx++;
        const cellDef = matrix[myIdx];

        let captured;
        try {
          captured = await this._captureCell(runId, mode, cellDef, scope);
        } catch (err) {
          captured = {
            url: cellDef.url,
            deviceId: cellDef.deviceId,
            deviceLabel: cellDef.deviceId,
            deviceType: '',
            vantage: cellDef.vantage.code,
            proxyHost: cellDef.vantage.proxy?.host || null,
            mode,
            statusCode: null, finalUrl: cellDef.url, redirectChain: [], headers: {},
            title: '', contentHash: '', textSample: '', similarity: null,
            classification: QA_CLASS.NETWORK_ERROR, signals: [], durationMs: 0,
            error: 'runner-exception', errorMessage: String(err?.message || err).slice(0, 300),
            screenshotPath: null, consoleErrors: 0, failedRequests: 0,
          };
          captured._errorObject = true;
        }

        // Stash normalized text in memory (not the DB) for baseline diffing.
        this._ensureScratch(runId).push({
          ...captured,
          normalized: captured.normalized || '',
          geoBlocked: !!captured.geoBlocked,
          deviceBlocked: !!captured.deviceBlocked,
          redirectLoop: !!captured.redirectLoop,
        });

        done++;
        if (captured.error) errors++;
        this.emitProgress(runId, done, total, { url: cellDef.url, vantage: cellDef.vantage.code, device: cellDef.deviceId, classification: captured.classification });

        if (this.config.requestDelayMs > 0 && idx < matrix.length) {
          await sleep(this.config.requestDelayMs);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    // --- Baseline comparison & final classification -------------------------
    const cells = this._ensureScratch(runId);
    const byUrl = new Map();
    for (const c of cells) {
      const arr = byUrl.get(c.url) || [];
      arr.push(c);
      byUrl.set(c.url, arr);
    }

    for (const [url, urlCells] of byUrl) {
      const baseline = pickBaselineCell(urlCells);
      for (const cell of urlCells) {
        const { classification, similarity } = classifyCell(cell, baseline, {
          threshold: this.config.similarityThreshold,
        });
        cell.classification = classification;
        cell.similarity = similarity;
      }
    }

    // Persist (single pass — we classify before writing so rows are final).
    for (const cell of cells) {
      const { normalized, _errorObject, ...row } = cell;
      try {
        store.insertCell(runId, row);
      } catch (err) {
        logger.warn(`QA cell persist failed (${row.url}): ${err.message}`);
      }
      if (isFlagged(row.classification)) flagged++;
      else if (!row.error) ok++;
    }

    const cancelled = this.cancelRequested.has(runId);
    store.updateRunProgress(runId, { total, done, ok: Math.max(0, ok), flagged, errors });
    store.finishRun(runId, cancelled ? 'cancelled' : 'done');

    // Freeze the exposure view for trend charting (survives cell cleanup).
    if (!cancelled) {
      try {
        const rows = store.getRunCells(runId);
        const exp = summarizeExposure(rows.map(recordFromQaCell));
        store.insertExposureSnapshot({
          runId,
          total: exp.total,
          flaggedRecords: exp.flaggedRecords,
          avgScore: exp.avgScore,
          ruleCounts: exp.ruleCounts,
          severityTotals: exp.severityTotals,
          cohortFlags: exp.cohortFlags,
        });
      } catch (err) {
        logger.warn(`QA exposure snapshot failed: ${err.message}`);
      }
    }

    this.activeRuns.delete(runId);
    this.cancelRequested.delete(runId);
    this._runCells.delete(runId);

    const summary = { runId, status: cancelled ? 'cancelled' : 'done', total, done, ok, flagged, errors };
    this.emit('run_complete', summary);
    if (this.io) this.io.emit('qa:run_complete', summary);
    logger.info(`✅ QA run ${runId.slice(0, 8)} ${summary.status}: ${done}/${total} cells, ${flagged} flagged`);
  }

  // Scratch space for in-flight cell captures (normalized text stays in RAM,
  // never hits the DB — qa_cells keeps only hash + 2KB sample).
  _ensureScratch(runId) {
    if (!this._runCells) this._runCells = new Map();
    if (!this._runCells.has(runId)) this._runCells.set(runId, []);
    return this._runCells.get(runId);
  }

  emitProgress(runId, done, total, cellInfo) {
    const payload = { runId, done, total, cell: cellInfo };
    this.emit('progress', payload);
    if (this.io) this.io.emit('qa:progress', payload);
  }

  /** Optional self-driving cadence: sweepIntervalMinutes > 0 runs a scope periodically. */
  enableAutoSweep(scopeFactory, intervalMinutes) {
    if (this._sweepTimer) clearInterval(this._sweepTimer);
    if (!intervalMinutes || intervalMinutes <= 0) return;
    this._sweepTimer = setInterval(async () => {
      try {
        const scope = await scopeFactory();
        if (scope) {
          const { runId } = this.startRun(scope);
          logger.info(`⏱️ Auto QA sweep started: run ${runId.slice(0, 8)}`);
        }
      } catch (err) {
        logger.warn(`QA auto-sweep skipped: ${err.message}`);
      }
    }, intervalMinutes * 60_000);
    this._sweepTimer.unref?.();
  }

  stop() {
    if (this._sweepTimer) clearInterval(this._sweepTimer);
    this._sweepTimer = null;
  }
}

export default QaRunner;
