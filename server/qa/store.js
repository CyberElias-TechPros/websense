// ============================================================================
// qa/store.js — SQLite persistence for QA runs & cells.
//
// Separate tables alongside the existing schema (nothing here touches the
// visits/proxy_stats tables). Uses the shared node:sqlite handle from
// database/db.js so QA data lives in the same DB file.
// ============================================================================

import { randomUUID } from 'node:crypto';
import db from '../database/db.js';

// ---------------------------------------------------------------------------
// Schema (idempotent)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS qa_runs (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    status TEXT DEFAULT 'running',          -- running | done | cancelled | failed
    mode TEXT DEFAULT 'http',               -- http | browser | auto
    scope_json TEXT,                        -- urls/devices/vantages snapshot
    total_cells INTEGER DEFAULT 0,
    done_cells INTEGER DEFAULT 0,
    ok_cells INTEGER DEFAULT 0,
    flagged_cells INTEGER DEFAULT 0,
    error_cells INTEGER DEFAULT 0,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS qa_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    device_id TEXT,
    device_label TEXT,
    device_type TEXT,
    vantage TEXT,                           -- ISO country code or 'DIRECT'
    proxy_host TEXT,
    mode TEXT,
    status_code INTEGER,
    final_url TEXT,
    redirect_chain TEXT,                    -- JSON [{url,status,location}]
    headers TEXT,                           -- JSON (curated subset)
    title TEXT,
    content_hash TEXT,
    text_sample TEXT,
    similarity REAL,
    classification TEXT DEFAULT 'pending',
    signals TEXT,                           -- JSON string[]
    duration_ms INTEGER,
    error TEXT,
    error_message TEXT,
    screenshot_path TEXT,
    console_errors INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_qa_cells_run ON qa_cells(run_id);
  CREATE INDEX IF NOT EXISTS idx_qa_cells_url ON qa_cells(url);
  CREATE INDEX IF NOT EXISTS idx_qa_cells_class ON qa_cells(classification);
  CREATE INDEX IF NOT EXISTS idx_qa_runs_created ON qa_runs(created_at);
`);

// Schema evolution: identity columns feeding the exposure analyzer.
function qaAddColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
qaAddColumn('qa_cells', 'user_agent', 'TEXT');
qaAddColumn('qa_cells', 'accept_language', 'TEXT');
qaAddColumn('qa_cells', 'viewport_w', 'INTEGER');

const FLAGGED_CLASSES = new Set(['divergent', 'geo_blocked', 'device_blocked', 'redirect_loop', 'http_error']);

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
export function createRun({ mode = 'http', scope = {}, note = '' }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO qa_runs (id, mode, scope_json, note, status) VALUES (?, ?, ?, ?, 'running')`
  ).run(id, mode, JSON.stringify(scope), note);
  return id;
}

export function updateRunProgress(runId, { total, done, ok, flagged, errors }) {
  db.prepare(
    `UPDATE qa_runs SET total_cells=?, done_cells=?, ok_cells=?, flagged_cells=?, error_cells=? WHERE id=?`
  ).run(total, done, ok, flagged, errors, runId);
}

export function finishRun(runId, status = 'done') {
  db.prepare(`UPDATE qa_runs SET status=?, finished_at=datetime('now') WHERE id=?`).run(status, runId);
}

export function getRun(runId) {
  const row = db.prepare(`SELECT * FROM qa_runs WHERE id=?`).get(runId);
  if (row && row.scope_json) {
    try { row.scope = JSON.parse(row.scope_json); } catch { row.scope = {}; }
  }
  return row;
}

export function listRuns(limit = 30) {
  return db
    .prepare(`SELECT * FROM qa_runs ORDER BY created_at DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, limit)));
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------
export function insertCell(runId, cell) {
  const info = db
    .prepare(
      `INSERT INTO qa_cells (
        run_id, url, device_id, device_label, device_type, vantage, proxy_host, mode,
        status_code, final_url, redirect_chain, headers, title, content_hash, text_sample,
        similarity, classification, signals, duration_ms, error, error_message,
        screenshot_path, console_errors, failed_requests, user_agent, accept_language, viewport_w
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      runId,
      cell.url,
      cell.deviceId,
      cell.deviceLabel,
      cell.deviceType,
      cell.vantage,
      cell.proxyHost || null,
      cell.mode,
      cell.statusCode ?? null,
      cell.finalUrl || null,
      JSON.stringify(cell.redirectChain || []),
      JSON.stringify(cell.headers || {}),
      cell.title || '',
      cell.contentHash || '',
      cell.textSample || '',
      cell.similarity ?? null,
      cell.classification || 'pending',
      JSON.stringify(cell.signals || []),
      cell.durationMs ?? null,
      cell.error || null,
      cell.errorMessage || null,
      cell.screenshotPath || null,
      cell.consoleErrors ?? 0,
      cell.failedRequests ?? 0,
      cell.userAgent || null,
      cell.acceptLanguage || null,
      cell.viewportW ?? null
    );
  return Number(info.lastInsertRowid);
}

/** Update just the classification fields after baseline comparison. */
export function updateCellClassification(cellId, { classification, similarity }) {
  db.prepare(`UPDATE qa_cells SET classification=?, similarity=? WHERE id=?`).run(
    classification,
    similarity,
    cellId
  );
}

const hydrate = (row) => {
  if (!row) return row;
  try { row.redirectChain = JSON.parse(row.redirect_chain || '[]'); } catch { row.redirectChain = []; }
  try { row.headers = JSON.parse(row.headers || '{}'); } catch { row.headers = {}; }
  try { row.signals = JSON.parse(row.signals || '[]'); } catch { row.signals = []; }
  delete row.redirect_chain;
  return row;
};

export function getCell(cellId) {
  return hydrate(db.prepare(`SELECT * FROM qa_cells WHERE id=?`).get(cellId));
}

export function getRunCells(runId) {
  return db
    .prepare(`SELECT * FROM qa_cells WHERE run_id=? ORDER BY url, vantage, device_id`)
    .all(runId)
    .map(hydrate);
}

/**
 * Delete QA data older than `days` (used by the daily DB cleanup cadence).
 */
export function cleanupOldRuns(days = 14) {
  const cutoff = new Date(Date.now() - days * 86400_000)
    .toISOString().replace('T', ' ').slice(0, 19);
  const runs = db.prepare(`DELETE FROM qa_runs WHERE created_at < ?`).run(cutoff);
  return runs.changes || 0;
}

// ---------------------------------------------------------------------------
// Matrix pivot for the heatmap UI
// ---------------------------------------------------------------------------
export function buildMatrix(runId) {
  const cells = getRunCells(runId);
  const urls = [...new Set(cells.map((c) => c.url))];
  const columns = [
    ...new Map(
      cells.map((c) => [
        `${c.vantage}::${c.device_id}`,
        { vantage: c.vantage, deviceId: c.device_id, deviceLabel: c.device_label, deviceType: c.device_type },
      ])
    ).values(),
  ].sort((a, b) => a.vantage.localeCompare(b.vantage) || String(a.deviceId).localeCompare(String(b.deviceId)));

  const byKey = new Map(cells.map((c) => [`${c.url}::${c.vantage}::${c.device_id}`, c]));
  const rows = urls.map((url) => ({
    url,
    cells: columns.map((col) => {
      const cell = byKey.get(`${url}::${col.vantage}::${col.deviceId}`);
      return cell
        ? {
            id: cell.id,
            classification: cell.classification,
            similarity: cell.similarity,
            statusCode: cell.status_code,
            durationMs: cell.duration_ms,
            signals: cell.signals,
            flagged: FLAGGED_CLASSES.has(cell.classification) || cell.classification === 'network_error',
          }
        : null;
    }),
  }));

  const counts = {};
  for (const c of cells) counts[c.classification] = (counts[c.classification] || 0) + 1;

  return { columns, rows, counts, total: cells.length };
}

export default {
  createRun,
  updateRunProgress,
  finishRun,
  getRun,
  listRuns,
  insertCell,
  updateCellClassification,
  getCell,
  getRunCells,
  cleanupOldRuns,
  buildMatrix,
};
