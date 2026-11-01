// ============================================================================
// domain-rules.js — Per-target-domain rules: rate limits, opt-outs, and
// robots.txt respect.
//
//   • Opt-out list: domains we must NEVER visit (added via API/config).
//   • Per-domain rate limiting: minimum interval between visits to the same
//     domain + max visits per domain per rolling hour.
//   • robots.txt: fetched once per domain (24 h cache), Disallow rules for
//     User-agent: * are honored for every visited path. If a target's
//     robots.txt disallows our path, the visit is skipped (allowed=false).
//
// Rules persist in the `domain_rules` table; the visit log is in-memory.
// ============================================================================

import axios from 'axios';
import db from '../database/db.js';
import logger from '../utils/logger.js';

const HOUR = 3600_000;

/** Parse a robots.txt body → { disallow: string[], allow: string[] } for UA "*". */
export function parseRobots(text) {
  const disallow = [];
  const allow = [];
  let inStarGroup = false;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      inStarGroup = value === '*';
    } else if (inStarGroup && field === 'disallow') {
      if (value) disallow.push(value);
    } else if (inStarGroup && field === 'allow') {
      if (value) allow.push(value);
    }
  }
  return { disallow, allow };
}

/** Robots path match per RFC 9309: prefix match, `*` wildcard, `$` end anchor.
 *  Longest matching rule wins; tie → Allow wins. */
export function robotsPathAllowed(path, { disallow = [], allow = [] }) {
  let best = null; // { len, allowed }
  const test = (rule, allowed) => {
    const endAnchor = rule.endsWith('$');
    const body = endAnchor ? rule.slice(0, -1) : rule;
    const rx = new RegExp(
      '^' + body.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (endAnchor ? '$' : '')
    );
    if (rx.test(path) && (!best || rule.length > best.len || (rule.length === best.len && allowed))) {
      best = { len: rule.length, allowed };
    }
  };
  for (const d of disallow) test(d, false);
  for (const a of allow) test(a, true);
  return best ? best.allowed : true;
}

export class DomainRulesManager {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.DOMAIN_RULES_ENABLED !== '0',
      respectRobots: process.env.RESPECT_ROBOTS !== '0',
      robotsCacheTtlMs: parseInt(process.env.ROBOTS_CACHE_TTL_MS || String(24 * HOUR), 10),
      robotsFetchTimeoutMs: parseInt(process.env.ROBOTS_FETCH_TIMEOUT_MS || '8000', 10),
      defaultMinIntervalMs: parseInt(process.env.DOMAIN_MIN_INTERVAL_MS || '60000', 10),
      defaultMaxVisitsPerHour: parseInt(process.env.DOMAIN_MAX_VISITS_PER_HOUR || '20', 10),
      optOuts: (process.env.DOMAIN_OPT_OUTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      ...config,
    };
    this.rules = new Map();      // domain → { minIntervalMs, maxVisitsPerHour, optOut }
    this.visitLog = new Map();   // domain → number[] (timestamps of visits)
    this.robotsCache = new Map(); // domain → { fetchedAt, parsed, fetchError }
    this._initDb();
  }

  _initDb() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS domain_rules (
        domain TEXT PRIMARY KEY,
        min_interval_ms INTEGER,
        max_visits_per_hour INTEGER,
        opt_out INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    for (const row of db.prepare('SELECT * FROM domain_rules').all()) {
      this.rules.set(row.domain, {
        minIntervalMs: row.min_interval_ms,
        maxVisitsPerHour: row.max_visits_per_hour,
        optOut: !!row.opt_out,
      });
    }
    for (const d of this.config.optOuts) this.setOptOut(d, true, { persist: false });
  }

  static domainOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  getRule(domain) {
    const r = this.rules.get(domain) || {};
    return {
      minIntervalMs: r.minIntervalMs ?? this.config.defaultMinIntervalMs,
      maxVisitsPerHour: r.maxVisitsPerHour ?? this.config.defaultMaxVisitsPerHour,
      optOut: r.optOut ?? this.config.optOuts.includes(domain),
    };
  }

  setRule(domain, patch = {}) {
    domain = String(domain).replace(/^www\./, '').toLowerCase();
    const rule = { ...this.getRule(domain), ...patch, optOut: patch.optOut ?? this.getRule(domain).optOut };
    this.rules.set(domain, rule);
    db.prepare(`
      INSERT INTO domain_rules (domain, min_interval_ms, max_visits_per_hour, opt_out, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(domain) DO UPDATE SET
        min_interval_ms = excluded.min_interval_ms,
        max_visits_per_hour = excluded.max_visits_per_hour,
        opt_out = excluded.opt_out,
        updated_at = datetime('now')
    `).run(domain, rule.minIntervalMs, rule.maxVisitsPerHour, rule.optOut ? 1 : 0);
    return rule;
  }

  setOptOut(domain, on = true, { persist = true } = {}) {
    return this.setRule(domain, { optOut: on });
  }

  /** Fetch + cache robots.txt for a domain. Never throws. */
  async fetchRobots(domain, { force = false } = {}) {
    const cached = this.robotsCache.get(domain);
    if (!force && cached && Date.now() - cached.fetchedAt < this.config.robotsCacheTtlMs) return cached;
    const entry = { fetchedAt: Date.now(), parsed: { disallow: [], allow: [] }, fetchError: null };
    try {
      const resp = await axios.get(`https://${domain}/robots.txt`, {
        timeout: this.config.robotsFetchTimeoutMs,
        responseType: 'text',
        transformResponse: [(d) => d],
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebSenseBot/1.0)' },
      });
      if (resp.status === 200 && typeof resp.data === 'string') {
        entry.parsed = parseRobots(resp.data);
      } else {
        entry.fetchError = `HTTP ${resp.status} — treating as no rules`;
      }
    } catch (e) {
      entry.fetchError = e.message; // unreachable robots.txt → allow (convention)
    }
    this.robotsCache.set(domain, entry);
    return entry;
  }

  /** Is this URL allowed right now? → { allowed, reason, retryAfterMs, rule } */
  async check(url) {
    const domain = DomainRulesManager.domainOf(url);
    if (!domain) return { allowed: false, reason: 'invalid-url', retryAfterMs: 0 };
    const rule = this.getRule(domain);

    if (rule.optOut) {
      return { allowed: false, reason: 'opt-out', retryAfterMs: 0, rule };
    }

    let path = '/';
    try { path = new URL(url).pathname || '/'; } catch { /* keep '/' */ }

    if (this.config.respectRobots) {
      const robots = await this.fetchRobots(domain);
      if (robots.parsed.disallow.length || robots.parsed.allow.length) {
        if (!robotsPathAllowed(path, robots.parsed)) {
          return { allowed: false, reason: `robots.txt disallows ${path}`, retryAfterMs: 0, rule };
        }
      }
    }

    const now = Date.now();
    const log = (this.visitLog.get(domain) || []).filter((t) => now - t < HOUR);
    if (rule.maxVisitsPerHour > 0 && log.length >= rule.maxVisitsPerHour) {
      const oldest = log[0];
      return {
        allowed: false,
        reason: `rate-limit: ${log.length}/${rule.maxVisitsPerHour} visits/hour on ${domain}`,
        retryAfterMs: Math.max(0, HOUR - (now - oldest)),
        rule,
      };
    }
    if (rule.minIntervalMs > 0 && log.length > 0) {
      const last = log[log.length - 1];
      const wait = rule.minIntervalMs - (now - last);
      if (wait > 0) {
        return { allowed: false, reason: `min-interval: ${domain} visited ${now - last}ms ago`, retryAfterMs: wait, rule };
      }
    }

    return { allowed: true, reason: null, retryAfterMs: 0, rule };
  }

  /** Record that we attempted a visit to url (call just before executing). */
  recordVisit(url) {
    const domain = DomainRulesManager.domainOf(url);
    if (!domain) return;
    const now = Date.now();
    const log = (this.visitLog.get(domain) || []).filter((t) => now - t < HOUR);
    log.push(now);
    this.visitLog.set(domain, log);
  }

  getRules() {
    const out = {};
    for (const [domain, rule] of this.rules) out[domain] = { ...rule };
    for (const d of this.config.optOuts) if (!out[d]) out[d] = { ...this.getRule(d) };
    const optOuts = new Set(this.config.optOuts);
    for (const [domain, rule] of this.rules) if (rule.optOut) optOuts.add(domain);
    return {
      defaults: {
        minIntervalMs: this.config.defaultMinIntervalMs,
        maxVisitsPerHour: this.config.defaultMaxVisitsPerHour,
      },
      rules: out,
      optOuts: [...optOuts],
    };
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      respectRobots: this.config.respectRobots,
      defaults: { minIntervalMs: this.config.defaultMinIntervalMs, maxVisitsPerHour: this.config.defaultMaxVisitsPerHour },
      customRules: this.rules.size,
      optOuts: this.getRules().optOuts,
      domainsSeen: this.visitLog.size,
      robotsCached: [...this.robotsCache.entries()].map(([d, r]) => ({
        domain: d, rules: r.parsed.disallow.length + r.parsed.allow.length, error: r.fetchError,
      })),
    };
  }

  updateConfig(patch = {}) {
    if (patch.enabled !== undefined) this.config.enabled = !!patch.enabled;
    if (patch.respectRobots !== undefined) this.config.respectRobots = !!patch.respectRobots;
    if (patch.defaultMinIntervalMs !== undefined) this.config.defaultMinIntervalMs = parseInt(patch.defaultMinIntervalMs, 10);
    if (patch.defaultMaxVisitsPerHour !== undefined) this.config.defaultMaxVisitsPerHour = parseInt(patch.defaultMaxVisitsPerHour, 10);
    if (Array.isArray(patch.optOuts)) {
      this.config.optOuts = patch.optOuts.map((s) => String(s).toLowerCase());
      for (const d of this.config.optOuts) this.setOptOut(d, true, { persist: false });
    }
    logger.info('⚙️ Domain rules config updated');
  }
}

export default DomainRulesManager;
