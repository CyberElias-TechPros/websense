// ============================================================================
// qa/exposure.js — Detection-exposure analyzer (the "websense" sensing layer).
//
// Blue-hat view: for every generated QA cell OR engine visit already sitting
// in the DB, evaluate the observable evidence the way a bot-detector would —
// WITHOUT changing what was sent. Answers: "which of this request's
// mannerisms would give it away, and how strongly?"
//
// Pure heuristics over captured data. No network, no evasion logic — this
// module only ever *reads* behavior and reports detectability.
// ============================================================================

const SEVERITY_POINTS = { high: 40, medium: 20, low: 10 };

/**
 * Rule catalog. Each rule sees one normalized record plus cohort context and
 * returns a flag {rule, severity, detail} or null. Records:
 *   { mode, userAgent, acceptLanguage, deviceType, viewportW, referrer,
 *     headers: {}, durationMs, createdAt, statusCode }
 * Cohort ctx (per run/visit batch):
 *   { uaCounts: Map, total, interarrivalCV }
 */
export const EXPOSURE_RULES = [
  {
    id: 'no-js-execution',
    name: 'No JS execution (HTTP-mode fetch)',
    severity: 'high',
    why: 'Fetch-level requests execute no JavaScript: analytics tags never fire, no DOM events, no engagement signals. Detectors that correlate server hits with analytics events (or that challenge with JS) classify this instantly.',
    test: (r) => (r.mode === 'http' ? {} : null),
  },
  {
    id: 'missing-fetch-metadata',
    name: 'Missing Fetch-Metadata headers',
    severity: 'medium',
    why: 'Real browsers send Sec-Fetch-Dest/Mode/Site/User on navigations. Their absence on a browser UA is a reliable non-browser tell (and cheap to check).',
    test: (r) => {
      const h = r.headers || {};
      const hasFetchMeta = Object.keys(h).some((k) => k.toLowerCase().startsWith('sec-fetch'));
      return !hasFetchMeta && r.userAgent ? {} : null;
    },
  },
  {
    id: 'no-accept-language',
    name: 'No Accept-Language',
    severity: 'medium',
    why: 'Essentially all browsers send Accept-Language. Missing ≠ human.',
    test: (r) => {
      if (!r.userAgent) return null;
      const lang = r.acceptLanguage ?? r.headers?.['accept-language'];
      return !lang ? {} : null;
    },
  },
  {
    id: 'ua-device-mismatch',
    name: 'UA ⇄ device-class mismatch',
    severity: 'high',
    why: 'UA claims a mobile form factor while the reported device class is desktop (or vice versa) — internally inconsistent identity.',
    test: (r) => {
      if (!r.userAgent || !r.deviceType) return null;
      const uaMobile = /Mobile|iPhone|Android/i.test(r.userAgent);
      const clsMobile = r.deviceType === 'mobile' || r.deviceType === 'tablet';
      return uaMobile !== clsMobile ? { detail: `uaMobile=${uaMobile} class=${r.deviceType}` } : null;
    },
  },
  {
    id: 'ua-viewport-mismatch',
    name: 'UA ⇄ viewport mismatch',
    severity: 'medium',
    why: 'Mobile UA driving a desktop-sized viewport (or inverse) is a classic emulation slip.',
    test: (r) => {
      if (!r.userAgent || !r.viewportW) return null;
      const uaMobile = /Mobile|iPhone|Android/i.test(r.userAgent);
      const wideViewport = r.viewportW >= 1024;
      if (uaMobile && wideViewport) return { detail: `mobile UA @ ${r.viewportW}px` };
      if (!uaMobile && r.deviceType === 'desktop' && r.viewportW < 700)
        return { detail: `desktop UA @ ${r.viewportW}px` };
      return null;
    },
  },
  {
    id: 'ua-reuse-cohort',
    name: 'Same UA reused across cohort',
    severity: 'medium',
    why: 'N requests sharing one UA string in a short window stand out against natural UA diversity (Chrome alone ships dozens of active versions).',
    test: (r, ctx) => {
      if (!r.userAgent || !ctx?.uaCounts) return null;
      const n = ctx.uaCounts.get(r.userAgent) || 0;
      // Flag when one UA carries >25% of a non-trivial cohort (min 4 hits).
      return n >= 4 && n / ctx.total > 0.25 ? { detail: `${n}/${ctx.total} requests share this UA` } : null;
    },
  },
  {
    id: 'timing-uniform',
    name: 'Inter-request timing too uniform',
    severity: 'high',
    why: 'Fixed-interval schedulers leave a metronome: inter-arrival coefficient of variation near zero. Human browsing has CV well above 1.',
    test: () => null, // cohort-level only (see summarizeExposure)
  },
  {
    id: 'direct-landing-no-referrer',
    name: 'Direct landing, no referrer',
    severity: 'low',
    why: 'A burst of referrer-less direct landings is a mild bot tell — humans arrive via links/search more often than not. (Weak alone; corroborates.)',
    test: (r) => (r.referrer === '' ? {} : null),
  },
  {
    id: 'impossible-speed',
    name: 'Sub-human interaction latency',
    severity: 'medium',
    why: 'Full page “visits” completing in <300ms are not achievable by humans; detectors key off dwell timing where measurable.',
    test: (r) => (r.durationMs != null && r.durationMs > 0 && r.durationMs < 300
      ? { detail: `${r.durationMs}ms` } : null),
  },
];

/**
 * Analyze one record. Returns { flags: [...], score (0-100, higher = MORE
 * detectable) }.
 */
export function analyzeExposure(record, ctx = {}) {
  const flags = [];
  for (const rule of EXPOSURE_RULES) {
    try {
      const out = rule.test(record, ctx);
      if (out) flags.push({ rule: rule.id, name: rule.name, severity: rule.severity, why: rule.why, ...(out.detail ? { detail: out.detail } : {}) });
    } catch { /* a broken rule never breaks analysis */ }
  }
  const score = Math.min(100, flags.reduce((s, f) => s + (SEVERITY_POINTS[f.severity] || 0), 0));
  return { flags, score };
}

/** Coefficient of variation of inter-arrival times (ms) from ISO timestamps. */
export function interarrivalCV(timestamps) {
  const ts = timestamps.map((t) => new Date(t).getTime()).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (ts.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return null;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance) / mean;
}

/** Build cohort context shared by analyzeExposure callers. */
export function cohortContext(records) {
  const uaCounts = new Map();
  for (const r of records) {
    if (r.userAgent) uaCounts.set(r.userAgent, (uaCounts.get(r.userAgent) || 0) + 1);
  }
  return {
    total: records.length,
    uaCounts,
    interarrivalCV: interarrivalCV(records.map((r) => r.createdAt).filter(Boolean)),
  };
}

/**
 * Analyze a whole cohort: per-record results + aggregate summary.
 * @param {Array} records normalized records (see rule catalog header)
 */
export function summarizeExposure(records) {
  const ctx = cohortContext(records);
  const results = records.map((record, i) => ({
    index: i,
    ...analyzeExposure(record, ctx),
  }));

  const ruleCounts = {};
  let flaggedAny = 0;
  const severityTotals = { high: 0, medium: 0, low: 0 };
  for (const r of results) {
    if (r.flags.length) flaggedAny++;
    for (const f of r.flags) {
      ruleCounts[f.rule] = (ruleCounts[f.rule] || 0) + 1;
      severityTotals[f.severity] = (severityTotals[f.severity] || 0) + 1;
    }
  }

  const cohortFlags = [];
  if (ctx.interarrivalCV != null && ctx.interarrivalCV < 0.25) {
    const rule = EXPOSURE_RULES.find((x) => x.id === 'timing-uniform');
    cohortFlags.push({ rule: rule.id, name: rule.name, severity: rule.severity, why: rule.why, detail: `inter-arrival CV=${ctx.interarrivalCV.toFixed(3)} (humans ≳ 1)` });
  }

  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  return {
    total: records.length,
    flaggedRecords: flaggedAny,
    avgScore,
    ruleCounts,
    severityTotals,
    cohortFlags,
    interarrivalCV: ctx.interarrivalCV,
    results,
  };
}

// ---------------------------------------------------------------------------
// Input adapters
// ---------------------------------------------------------------------------

/** QA cell row → exposure record. */
export function recordFromQaCell(cell) {
  return {
    id: cell.id,
    url: cell.url,
    vantage: cell.vantage,
    mode: cell.mode,
    userAgent: cell.user_agent || null,
    acceptLanguage: cell.accept_language || null,
    deviceType: cell.device_type || null,
    viewportW: cell.viewport_w || null,
    referrer: null, // QA probes never fake referrers — by design
    headers: cell.headers || {},
    durationMs: cell.duration_ms ?? null,
    createdAt: cell.created_at,
    statusCode: cell.status_code,
  };
}

/** engine `visits` row → exposure record (offline audit of existing traffic). */
export function recordFromVisit(v) {
  return {
    id: v.id,
    url: v.url,
    vantage: v.proxy_country || null,
    mode: v.mode || 'http',
    userAgent: v.user_agent || null,
    acceptLanguage: null, // engine doesn't persist request headers
    deviceType: v.device_type || null,
    viewportW: null,
    referrer: v.referrer ?? null,
    headers: {},
    durationMs: v.latency_ms ?? null,
    createdAt: v.created_at,
    statusCode: v.status_code,
  };
}

export default { analyzeExposure, summarizeExposure, recordFromQaCell, recordFromVisit, EXPOSURE_RULES };
