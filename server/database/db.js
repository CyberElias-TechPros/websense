// ============================================================================
// db.js — SQLite database layer.
// Uses Node 22+ built-in `node:sqlite` (DatabaseSync) — zero native
// dependencies, no node-gyp, no external binaries.
// Schema: visits, proxy_stats, url_stats, system_config.
// ============================================================================

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'visits.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);

// Performance + durability pragmas.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA cache_size = -64000;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    subdomain TEXT,
    proxy_host TEXT NOT NULL,
    proxy_country TEXT,
    proxy_city TEXT,
    status_code INTEGER,
    latency_ms INTEGER,
    user_agent TEXT,
    referrer TEXT,
    success INTEGER DEFAULT 0,
    error_message TEXT,
    error_type TEXT,
    mode TEXT DEFAULT 'http',
    response_size INTEGER,
    screenshot_path TEXT,
    device_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
  CREATE INDEX IF NOT EXISTS idx_visits_url ON visits(url);
  CREATE INDEX IF NOT EXISTS idx_visits_success ON visits(success);
  CREATE INDEX IF NOT EXISTS idx_visits_proxy ON visits(proxy_host);

  CREATE TABLE IF NOT EXISTS proxy_stats (
    host TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    country TEXT,
    city TEXT,
    flag TEXT,
    enabled INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    total_latency INTEGER DEFAULT 0,
    last_checked TEXT,
    last_used TEXT,
    status TEXT DEFAULT 'unknown'
  );

  CREATE TABLE IF NOT EXISTS url_stats (
    url TEXT PRIMARY KEY,
    subdomain TEXT,
    visit_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_visited TEXT,
    enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 5
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS visitor_profiles (
    id TEXT PRIMARY KEY,
    proxy_country TEXT,
    user_agent TEXT,
    fingerprint_seed INTEGER,
    created_at INTEGER NOT NULL,
    last_visited_at INTEGER NOT NULL,
    visit_count INTEGER DEFAULT 0,
    total_pages_visited INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_profiles_country ON visitor_profiles(proxy_country);
  CREATE INDEX IF NOT EXISTS idx_profiles_last_visited ON visitor_profiles(last_visited_at);
`);

// ---------------------------------------------------------------------------
// Migrations: add columns to existing tables (no-op if already present)
// ---------------------------------------------------------------------------
function addColumnIfMissing(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
addColumnIfMissing('visits', 'device_type', 'TEXT');
addColumnIfMissing('visits', 'screenshot_path', 'TEXT');

// ---------------------------------------------------------------------------
// System config helpers (persisted key/value overrides, e.g. UI settings)
// ---------------------------------------------------------------------------
export function getSystemConfig(key) {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSystemConfig(key, value) {
  db.prepare(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

/**
 * Minimal transaction helper for node:sqlite (DatabaseSync has no
 * db.transaction() like better-sqlite3). Synchronous — matches DatabaseSync.
 * Usage: withTransaction(() => { ...statements... });
 */
export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    throw err;
  }
}

/**
 * Format a Date (or ms timestamp) into SQLite's datetime() string format
 * ('YYYY-MM-DD HH:MM:SS', UTC, second precision) so it string-compares
 * correctly against values stored via datetime('now').
 */
export function toSqliteDateTime(dateOrMs) {
  const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export default db;
