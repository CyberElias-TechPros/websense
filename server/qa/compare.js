// ============================================================================
// qa/compare.js — Content normalization, hashing, similarity & classification.
//
// Given the cells captured for one URL across vantages/devices, this module
// decides which cells agree (identical/similar) and which diverge — and picks
// a representative BASELINE cell per URL (the modal content group) to compare
// everyone else against. Pure functions; no I/O.
// ============================================================================

import { createHash } from 'node:crypto';
import { QA_CLASS } from './signals.js';

/** Default similarity threshold: below this, a cell is "divergent". */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.72;
/** Above this we call it "identical" even if a few bytes differ. */
export const IDENTICAL_SIMILARITY = 0.985;

/**
 * Normalize rendered HTML (or already-extracted text) into a canonical text
 * form for comparison:
 *   - strip <script>/<style>/<noscript>/<svg> payloads
 *   - strip tags, decode a handful of common entities
 *   - collapse whitespace
 *   - redact volatile tokens (long digit runs, UUIDs, ISO timestamps, quotable
 *     cache-busters) which legitimately differ between two identical pages
 */
export function normalizeText(input, { stripVolatile = true } = {}) {
  if (!input) return '';
  let s = String(input);

  // If it looks like HTML, drop non-content subtrees and tags.
  if (/<[a-z][\s\S]*>/i.test(s)) {
    s = s
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ');
  }

  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

  if (stripVolatile) {
    s = s
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '«uuid»')
      .replace(/\b\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?\b/g, '«ts»')
      .replace(/\b\d{13,}\b/g, '«epoch»')       // epoch millis
      .replace(/\b\d{6,12}\b/g, '«num»');        // long digit runs (ids, counters)
  }

  return s.replace(/\s+/g, ' ').trim();
}

/** sha256 hex of normalized content. */
export function contentHash(normalizedText) {
  return createHash('sha256').update(normalizedText, 'utf8').digest('hex');
}

/**
 * Similarity between two normalized texts: Jaccard index over WORD SHINGLES
 * (default 3-grams). Shingles are far less sensitive than raw sets to word
 * re-ordering and small insertions, so ads/timestamps don't tank the score.
 * Falls back to 1-gram set when either side is tiny (< shingleSize words).
 */
export function textSimilarity(a, b, shingleSize = 3) {
  const wa = String(a || '').split(' ').filter(Boolean);
  const wb = String(b || '').split(' ').filter(Boolean);
  if (wa.length === 0 && wb.length === 0) return 1;
  if (wa.length === 0 || wb.length === 0) return 0;

  const toShingles = (words) => {
    if (words.length < shingleSize) return new Set(words);
    const out = new Set();
    for (let i = 0; i + shingleSize <= words.length; i++) {
      out.add(words.slice(i, i + shingleSize).join(' '));
    }
    return out;
  };

  const A = toShingles(wa);
  const B = toShingles(wb);
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Pick the baseline cell for one URL: the MODAL good capture — the hash group
 * with the most successful cells wins (ties prefer desktop, then DIRECT/US —
 * a stable, deterministic choice). Error/blocked cells never become baseline.
 *
 * @param {Array} cells rows for one URL (must have .classification/.contentHash/.deviceType/.vantage)
 * @returns {object|null} the baseline cell row, or null if no ok cells
 */
export function pickBaselineCell(cells) {
  const candidates = cells.filter(
    (c) =>
      c.contentHash &&
      ![QA_CLASS.NETWORK_ERROR, QA_CLASS.HTTP_ERROR, QA_CLASS.UNAVAILABLE].includes(c.classification) &&
      !c.geoBlocked &&
      !c.deviceBlocked
  );
  if (candidates.length === 0) return null;

  const groups = new Map(); // hash -> {count, cells}
  for (const c of candidates) {
    const g = groups.get(c.contentHash) || { count: 0, cells: [] };
    g.count++;
    g.cells.push(c);
    groups.set(c.contentHash, g);
  }
  const winners = [...groups.values()].sort((a, b) => b.count - a.count);
  const top = winners[0].count;
  const tied = winners.filter((g) => g.count === top);

  const rank = (c) => {
    let r = 0;
    if (c.deviceType === 'desktop') r -= 2;
    if (c.vantage === 'DIRECT') r -= 1;
    else if (c.vantage === 'US') r -= 0.5;
    return r;
  };
  tied.sort((a, b) => rank(a.cells[0]) - rank(b.cells[0]));
  return tied[0].cells[0];
}

/**
 * Classify one cell against its URL baseline.
 * Gating signals (geo/device/loop) trump content diffing. Content cells get
 * identical/similar/divergent by similarity to the baseline's normalized text.
 */
export function classifyCell(cell, baselineCell, { threshold = DEFAULT_SIMILARITY_THRESHOLD } = {}) {
  if (cell.error) return { classification: QA_CLASS.NETWORK_ERROR, similarity: 0 };
  if (cell.geoBlocked) return { classification: QA_CLASS.GEO_BLOCKED, similarity: 0 };
  if (cell.deviceBlocked) {
    return {
      classification: cell.redirectLoop ? QA_CLASS.REDIRECT_LOOP : QA_CLASS.DEVICE_BLOCKED,
      similarity: 0,
    };
  }
  if (cell.statusCode && cell.statusCode >= 400) {
    return { classification: QA_CLASS.HTTP_ERROR, similarity: 0 };
  }
  if (cell.classification === QA_CLASS.UNAVAILABLE) {
    return { classification: QA_CLASS.UNAVAILABLE, similarity: 0 };
  }
  if (!baselineCell || !baselineCell.normalized) {
    // No trustworthy baseline (everything failed) — surface raw status only.
    return { classification: cell.statusCode === 200 ? QA_CLASS.IDENTICAL : QA_CLASS.PENDING, similarity: null };
  }
  if (cell.id != null && baselineCell.id != null && cell.id === baselineCell.id) {
    return { classification: QA_CLASS.IDENTICAL, similarity: 1 };
  }
  if (cell.contentHash && cell.contentHash === baselineCell.contentHash) {
    return { classification: QA_CLASS.IDENTICAL, similarity: 1 };
  }
  const sim = textSimilarity(cell.normalized || '', baselineCell.normalized || '');
  if (sim >= IDENTICAL_SIMILARITY) return { classification: QA_CLASS.IDENTICAL, similarity: sim };
  if (sim >= threshold) return { classification: QA_CLASS.SIMILAR, similarity: sim };
  return { classification: QA_CLASS.DIVERGENT, similarity: sim };
}

/** Is this classification a "flag" the site owner should look at? */
export function isFlagged(classification) {
  return [
    QA_CLASS.DIVERGENT,
    QA_CLASS.GEO_BLOCKED,
    QA_CLASS.DEVICE_BLOCKED,
    QA_CLASS.REDIRECT_LOOP,
    QA_CLASS.HTTP_ERROR,
    QA_CLASS.NETWORK_ERROR,
  ].includes(classification);
}
