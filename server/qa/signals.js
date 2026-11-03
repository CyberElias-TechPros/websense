// ============================================================================
// qa/signals.js — Restriction signal detection for QA cells.
//
// Pure, testable heuristics that answer two QA questions from a captured page:
//   1. Is this vantage GEO-restricted? (451/403 + block copy, redirect to a
//      block page, abrupt "content unavailable in your region" interstitial)
//   2. Is this DEVICE-restricted? (app-wall, "not supported on this device",
//      mobile redirect loop, empty shell for this form factor)
// No network code lives here — these functions analyze already-captured data.
// ============================================================================

// --- Geo-restriction indicators -------------------------------------------
// Matched case-insensitively against visible page text / title.
export const GEO_BLOCK_PATTERNS = [
  /\bnot available in your (country|region|location|area)\b/i,
  /\bunavailable in your (country|region|location|area)\b/i,
  /\bnot (be )?available (in|for) your region\b/i,
  /\bgeo[- ]?restrict(ed|ion|ions|ing)\b/i,
  /\bregion[- ]?lock(ed)?\b/i,
  /\bblocked in your country\b/i,
  /\bcontent (is )?not available (in|from) your (country|region|location)\b/i,
  /\bthis (content|page|site|video|service) is not available in your\b/i,
  /\bservice is not available in your (country|region)\b/i,
  /\bwe (are|'re) sorry,? but .{0,40}not available\b/i,
  /\byour (country|region|location) is not supported\b/i,
  /\bnot supported in your (country|region|location)\b/i,
  /\baccess denied\b.{0,60}\b(country|region|location)\b/i,
  /\bcountry code\b.{0,20}\bblock(ed)?\b/i,
];

// --- Device-restriction indicators ----------------------------------------
export const DEVICE_BLOCK_PATTERNS = [
  /\bnot supported on (this|your) (device|browser|phone|tablet)\b/i,
  /\bdevice (is )?not supported\b/i,
  /\bunsupported (device|browser)\b/i,
  /\bplease (use|visit (us )?from|switch to) (a|your) (desktop|laptop|computer|mobile device|phone)\b/i,
  /\bdownload our (mobile )?app\b/i,
  /\bget (the|our) app\b/i,
  /\bopen (this|in) (the )?app\b/i,
  /\bonly available on (desktop|mobile|the app)\b/i,
  /\bbest experienced on (a )?(desktop|mobile|larger screen)\b/i,
  /\bscreen (size|is) (too small|not supported)\b/i,
];

// Statuses that, combined with block copy or tiny content, indicate gating.
const BLOCK_STATUSES = new Set([401, 403, 407, 409, 423, 429, 451]);

// Redirect targets that scream "geo gate".
const GEO_REDIRECT_RE = /(geo[-_]?block|not[-_]?available|unsupported[-_]?(country|region)|region[-_]?block|country[-_]?block)/i;

/**
 * Detect redirect loops in a captured chain (same URL appearing twice).
 * Mobile UA → m.example.com → back → … is a classic device bug for QA to catch.
 */
export function detectRedirectLoop(redirectChain = []) {
  const seen = new Set();
  for (const hop of redirectChain) {
    const u = (hop.url || hop.location || '').split('#')[0].replace(/\/+$/, '');
    if (!u) continue;
    if (seen.has(u)) return true;
    seen.add(u);
  }
  return false;
}

/**
 * Analyze a captured cell for geo/device restriction signals.
 *
 * @param {object} input
 * @param {number|null} input.statusCode   final HTTP status (null on network error)
 * @param {string}      input.title        page title
 * @param {string}      input.text         visible/normalized text sample
 * @param {string[]}    input.redirectChain [{url, status}]
 * @param {string}      input.requestedUrl original URL
 * @param {string}      input.finalUrl
 * @param {object}      [input.headers]    response headers (lowercased keys)
 * @param {string}      [input.deviceType] 'desktop' | 'mobile' | 'tablet'
 * @returns {{signals: string[], geoBlocked: boolean, deviceBlocked: boolean, redirectLoop: boolean}}
 */
export function analyzeCell(input) {
  const {
    statusCode = null,
    title = '',
    text = '',
    redirectChain = [],
    requestedUrl = '',
    finalUrl = '',
    headers = {},
    deviceType = '',
  } = input || {};

  const signals = [];
  const haystack = `${title}\n${text}`.slice(0, 20000);

  // --- Geo signals ---------------------------------------------------------
  let geoBlocked = false;
  if (statusCode === 451) {
    geoBlocked = true;
    signals.push('http-451-unavailable-for-legal-reasons');
  }
  if (statusCode === 403) {
    // 403 alone is ambiguous (could be WAF on the test runner too) — need copy.
    const copyHit = GEO_BLOCK_PATTERNS.find((re) => re.test(haystack));
    if (copyHit) {
      geoBlocked = true;
      signals.push(`http-403-plus-geo-copy:${copyHit.source.slice(0, 40)}`);
    } else {
      signals.push('http-403-ambiguous');
    }
  }
  for (const re of GEO_BLOCK_PATTERNS) {
    if (re.test(haystack)) {
      // Block copy on an otherwise-200 page is still a geo gate (JS interstitial).
      if (!geoBlocked || BLOCK_STATUSES.has(statusCode)) geoBlocked = true;
      signals.push(`geo-copy:${re.source.slice(0, 40)}`);
      break;
    }
  }
  const redirectedToBlock =
    GEO_REDIRECT_RE.test(finalUrl) ||
    redirectChain.some((h) => GEO_REDIRECT_RE.test(h.location || ''));
  if (redirectedToBlock && finalUrl && finalUrl !== requestedUrl) {
    geoBlocked = true;
    signals.push('geo-block-redirect');
  }
  // CDN header hints (Cloudflare country challenge etc.) — informational only.
  const cfMitigated = headers['cf-mitigated'] || '';
  if (String(cfMitigated).toLowerCase() === 'challenge') {
    signals.push('cf-challenge-presented');
  }

  // --- Device signals ------------------------------------------------------
  let deviceBlocked = false;
  for (const re of DEVICE_BLOCK_PATTERNS) {
    if (re.test(haystack)) {
      deviceBlocked = true;
      signals.push(`device-copy:${re.source.slice(0, 40)}`);
      break;
    }
  }

  const redirectLoop = detectRedirectLoop(redirectChain);
  if (redirectLoop) {
    deviceBlocked = true; // loops on one form factor only = device handling bug
    signals.push('redirect-loop');
  }

  // Empty shell heuristic: 200 OK but almost no visible text on a mobile
  // profile while the URL is fine elsewhere is caught later by divergence
  // comparison; here we only note suspiciously empty renders.
  if (statusCode === 200 && text.trim().length > 0 && text.trim().length < 40) {
    signals.push('nearly-empty-render');
  }

  return { signals, geoBlocked, deviceBlocked, redirectLoop };
}

/** Classification constants shared by compare.js, runner.js and the client. */
export const QA_CLASS = {
  IDENTICAL: 'identical',     // byte-identical normalized content vs baseline
  SIMILAR: 'similar',         // small drift (ads/timestamps) — sim >= threshold
  DIVERGENT: 'divergent',     // materially different content vs baseline
  GEO_BLOCKED: 'geo_blocked',
  DEVICE_BLOCKED: 'device_blocked',
  REDIRECT_LOOP: 'redirect_loop',
  HTTP_ERROR: 'http_error',   // 4xx/5xx not otherwise classified
  NETWORK_ERROR: 'network_error',
  UNAVAILABLE: 'unavailable', // capture mode not available (e.g. no Chrome)
  PENDING: 'pending',
};

export default analyzeCell;
