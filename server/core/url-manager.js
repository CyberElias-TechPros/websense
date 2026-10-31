// ============================================================================
// url-manager.js — Target URL pool.
// Responsibilities:
//   • Weighted-random selection (priority-weighted, organic-looking spread)
//   • Visit tracking per URL (visit_count, success_count, last_visited)
//   • Enable/disable toggles, priority adjustment, add/remove
//   • Health status indicator (last visit outcome)
// ============================================================================

import db, { withTransaction } from '../database/db.js';
import { subdomainOf } from '../config/urls.js';

export class UrlManager {
  constructor(urls) {
    this.urls = urls.map((url) => ({
      url,
      subdomain: subdomainOf(url),
      visitCount: 0,
      successCount: 0,
      lastVisited: null,
      enabled: true,
      priority: 5,
    }));
    this._initDb();
  }

  _initDb() {
    try {
      const upsert = db.prepare(`
        INSERT INTO url_stats (url, subdomain, enabled, priority)
        VALUES (?, ?, 1, 5)
        ON CONFLICT(url) DO NOTHING
      `);
      withTransaction(() => {
        for (const u of this.urls) upsert.run(u.url, u.subdomain);
      });

      // Hydrate from DB
      for (const u of this.urls) {
        const row = db.prepare('SELECT * FROM url_stats WHERE url = ?').get(u.url);
        if (row) {
          u.enabled = !!row.enabled;
          u.priority = row.priority || 5;
          u.visitCount = row.visit_count || 0;
          u.successCount = row.success_count || 0;
          u.lastVisited = row.last_visited;
        }
      }
    } catch { /* DB init failure — non-fatal */ }
  }

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------
  /** Weighted-random by priority — higher priority URLs get more visits. */
  getRandom() {
    const active = this.urls.filter((u) => u.enabled);
    if (active.length === 0) return null;

    const totalWeight = active.reduce((sum, u) => sum + u.priority, 0);
    let random = Math.random() * totalWeight;
    for (const u of active) {
      random -= u.priority;
      if (random <= 0) return u;
    }
    return active[Math.floor(Math.random() * active.length)];
  }

  /** Fisher-Yates shuffle, returns up to `count` URLs (used for sequential sweeps). */
  getShuffled(count = null) {
    const active = [...this.urls.filter((u) => u.enabled)];
    for (let i = active.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [active[i], active[j]] = [active[j], active[i]];
    }
    return count === null ? active : active.slice(0, count);
  }

  /** Least-recently-visited URL — balances distribution across the pool. */
  getLeastRecentlyVisited() {
    const active = this.urls.filter((u) => u.enabled);
    if (active.length === 0) return null;
    active.sort((a, b) => {
      const av = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
      const bv = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
      return av - bv;
    });
    return active[0];
  }

  // -----------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------
  recordVisit(url, success) {
    const entry = this.urls.find((u) => u.url === url);
    if (entry) {
      entry.visitCount++;
      if (success) entry.successCount++;
      entry.lastVisited = new Date().toISOString();
    }
    db.prepare(`
      UPDATE url_stats SET
        visit_count = visit_count + 1,
        success_count = success_count + CASE WHEN ? THEN 1 ELSE 0 END,
        last_visited = datetime('now')
      WHERE url = ?
    `).run(success ? 1 : 0, url);
  }

  // -----------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------
  setPriority(url, priority) {
    const clamped = Math.max(1, Math.min(10, parseInt(priority, 10) || 5));
    const entry = this.urls.find((u) => u.url === url);
    if (entry) entry.priority = clamped;
    db.prepare(`UPDATE url_stats SET priority = ? WHERE url = ?`).run(clamped, url);
  }

  toggleUrl(url, enabled) {
    const entry = this.urls.find((u) => u.url === url);
    if (entry) entry.enabled = enabled;
    db.prepare(`UPDATE url_stats SET enabled = ? WHERE url = ?`).run(enabled ? 1 : 0, url);
  }

  addUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    url = url.trim();
    if (this.urls.some((u) => u.url === url)) return null;
    const entry = {
      url,
      subdomain: subdomainOf(url),
      visitCount: 0,
      successCount: 0,
      lastVisited: null,
      enabled: true,
      priority: 5,
    };
    this.urls.push(entry);
    try {
      db.prepare(`INSERT INTO url_stats (url, subdomain) VALUES (?, ?)`).run(url, entry.subdomain);
    } catch { /* UNIQUE constraint — already in DB, fine */ }
    return entry;
  }

  removeUrl(url) {
    const before = this.urls.length;
    this.urls = this.urls.filter((u) => u.url !== url);
    if (this.urls.length === before) return false;
    db.prepare('DELETE FROM url_stats WHERE url = ?').run(url);
    return true;
  }

  getAll() {
    return this.urls.map((u) => ({
      url: u.url,
      subdomain: u.subdomain,
      visitCount: u.visitCount,
      successCount: u.successCount,
      successRate: u.visitCount > 0 ? Math.round((u.successCount / u.visitCount) * 100) : 0,
      lastVisited: u.lastVisited,
      enabled: u.enabled,
      priority: u.priority,
    }));
  }

  getStats() {
    const enabled = this.urls.filter((u) => u.enabled);
    return {
      total: this.urls.length,
      enabled: enabled.length,
      totalVisits: this.urls.reduce((s, u) => s + u.visitCount, 0),
      visitedUrls: this.urls.filter((u) => u.visitCount > 0).length,
    };
  }
}

export default UrlManager;
