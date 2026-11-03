// ============================================================================
// qa-modules.test.js — Unit tests for the Geo/Device QA subsystem's pure
// modules: device profiles, restriction-signal detection, and the
// normalize/hash/similarity/classify comparison engine.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DEVICE_PROFILES,
  getDeviceProfile,
  listDeviceProfiles,
  languageForCountry,
} from '../../qa/device-profiles.js';
import {
  analyzeCell,
  detectRedirectLoop,
  GEO_BLOCK_PATTERNS,
  DEVICE_BLOCK_PATTERNS,
  QA_CLASS,
} from '../../qa/signals.js';
import {
  normalizeText,
  contentHash,
  textSimilarity,
  pickBaselineCell,
  classifyCell,
  isFlagged,
  DEFAULT_SIMILARITY_THRESHOLD,
} from '../../qa/compare.js';

// ---------------------------------------------------------------------------
// Device profiles
// ---------------------------------------------------------------------------
describe('qa device profiles', () => {
  it('has unique ids and required fields', () => {
    const ids = DEVICE_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of DEVICE_PROFILES) {
      expect(p.userAgent).toBeTruthy();
      expect(p.viewport.width).toBeGreaterThan(100);
      expect(['desktop', 'mobile', 'tablet']).toContain(p.type);
    }
  });

  it('mobile/tablet profiles are touch-enabled, desktops are not', () => {
    for (const p of DEVICE_PROFILES) {
      if (p.type === 'desktop') expect(p.viewport.hasTouch).toBe(false);
      else expect(p.viewport.hasTouch).toBe(true);
    }
  });

  it('lookup by id works; unknown returns null', () => {
    expect(getDeviceProfile('mobile-iphone-safari').type).toBe('mobile');
    expect(getDeviceProfile('nope')).toBeNull();
  });

  it('listDeviceProfiles hides userAgent (summary only)', () => {
    const list = listDeviceProfiles();
    expect(list.length).toBe(DEVICE_PROFILES.length);
    expect(list[0].userAgent).toBeUndefined();
    expect(list[0].viewport).toBeTruthy();
  });

  it('maps countries to natural Accept-Language values', () => {
    expect(languageForCountry('DE')).toContain('de-DE');
    expect(languageForCountry('gb')).toContain('en-GB');
    expect(languageForCountry('XX')).toBe('en-US,en;q=0.9'); // fallback
    expect(languageForCountry('')).toBe('en-US,en;q=0.9');
  });
});

// ---------------------------------------------------------------------------
// Restriction signals
// ---------------------------------------------------------------------------
describe('qa restriction signals', () => {
  it('flags HTTP 451 as geo-blocked', () => {
    const r = analyzeCell({ statusCode: 451, text: 'Unavailable For Legal Reasons' });
    expect(r.geoBlocked).toBe(true);
    expect(r.signals.join(' ')).toContain('451');
  });

  it('flags geo block copy on a 200 interstitial', () => {
    const r = analyzeCell({
      statusCode: 200,
      title: 'Not available',
      text: 'Sorry, this content is not available in your region.',
    });
    expect(r.geoBlocked).toBe(true);
  });

  it('403 without geo copy is ambiguous, not conclusive', () => {
    const r = analyzeCell({ statusCode: 403, text: 'Request blocked by security policy.' });
    expect(r.geoBlocked).toBe(false);
    expect(r.signals).toContain('http-403-ambiguous');
  });

  it('403 WITH geo copy is a geo block', () => {
    const r = analyzeCell({ statusCode: 403, text: 'This service is not available in your country.' });
    expect(r.geoBlocked).toBe(true);
  });

  it('detects redirects to a block page', () => {
    const r = analyzeCell({
      statusCode: 200,
      requestedUrl: 'https://x.example/',
      finalUrl: 'https://x.example/geo-blocked',
      redirectChain: [{ url: 'https://x.example/', status: 302, location: '/geo-blocked' }],
      text: 'Page content',
    });
    expect(r.geoBlocked).toBe(true);
    expect(r.signals).toContain('geo-block-redirect');
  });

  it('flags app-wall copy as device-blocked', () => {
    const r = analyzeCell({ statusCode: 200, text: 'Download our app to continue playing!' });
    expect(r.deviceBlocked).toBe(true);
  });

  it('detects redirect loops', () => {
    const chain = [
      { url: 'https://x.example/', status: 302, location: '/m' },
      { url: 'https://x.example/m', status: 302, location: '/' },
      { url: 'https://x.example/', status: 302, location: '/m' },
    ];
    expect(detectRedirectLoop(chain)).toBe(true);
    expect(detectRedirectLoop([{ url: 'https://x.example/a', status: 301, location: '/b' }])).toBe(false);
    const r = analyzeCell({ statusCode: 200, redirectChain: chain, text: 'hello' });
    expect(r.redirectLoop).toBe(true);
    expect(r.deviceBlocked).toBe(true);
  });

  it('clean pages produce no block signals', () => {
    const r = analyzeCell({
      statusCode: 200,
      title: 'Free Games Online — Play Now',
      text: 'Welcome to our game portal. Choose from hundreds of free titles across many genres and enjoy playing instantly in your browser without downloads.',
    });
    expect(r.geoBlocked).toBe(false);
    expect(r.deviceBlocked).toBe(false);
  });

  it('pattern lists are valid regexes with no empty matches', () => {
    for (const re of [...GEO_BLOCK_PATTERNS, ...DEVICE_BLOCK_PATTERNS]) {
      expect(re).toBeInstanceOf(RegExp);
      expect(re.test('')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Normalization / hashing / similarity
// ---------------------------------------------------------------------------
describe('qa compare: normalize & hash', () => {
  it('strips scripts/styles/tags and collapses whitespace', () => {
    const html = '<html><head><style>body{color:red}</style></head>' +
      '<body><h1>Hello   World</h1><script>track()</script><p>Games</p></body></html>';
    const n = normalizeText(html);
    expect(n).toBe('Hello World Games');
  });

  it('redacts volatile tokens so identical pages hash identically', () => {
    const a = normalizeText(`<p>Players online: 1234567890 at 2026-11-03T10:00:00Z id 550e8400-e29b-41d4-a716-446655440000</p>`);
    const b = normalizeText(`<p>Players online: 9876543210 at 2026-11-03T11:30:00Z id 660e8400-e29b-41d4-a716-446655440001</p>`);
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('similarity: identical text = 1, disjoint ≈ 0', () => {
    expect(textSimilarity('the quick brown fox jumps over', 'the quick brown fox jumps over')).toBe(1);
    expect(textSimilarity('alpha beta gamma delta epsilon', 'one two three four five')).toBe(0);
  });

  it('small edits keep high similarity, big rewrites drop it', () => {
    // Realistic page-length bodies: a small ad/timestamp drift barely moves
    // shingle similarity, while a full maintenance-mode rewrite craters it.
    const filler =
      'choose from hundreds of free titles across puzzles racing cards and word games ' +
      'play instantly in your browser with no downloads required and share with friends';
    const base = `Welcome to the game portal. ${filler} ${filler}. Players online: 12345.`;
    const small = `Welcome to the game portal. ${filler} ${filler}. Players online: 67890!`;
    const big = 'Diese Seite ist in Ihrer Region nicht verfügbar bitte besuchen Sie uns später erneut danke für Ihr Verständnis heute';
    expect(textSimilarity(normalizeText(base), normalizeText(small))).toBeGreaterThan(DEFAULT_SIMILARITY_THRESHOLD);
    expect(textSimilarity(normalizeText(base), normalizeText(big))).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('empty vs empty = 1, empty vs text = 0', () => {
    expect(textSimilarity('', '')).toBe(1);
    expect(textSimilarity('', 'some words here ok fine')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Baseline selection & classification
// ---------------------------------------------------------------------------
describe('qa compare: baseline & classify', () => {
  const cell = (over = {}) => ({
    id: 1,
    contentHash: 'h1',
    normalized: 'welcome to the game portal play free online titles now',
    classification: QA_CLASS.PENDING,
    deviceType: 'desktop',
    vantage: 'DIRECT',
    statusCode: 200,
    ...over,
  });

  it('picks the modal content group as baseline', () => {
    const cells = [
      cell({ id: 1, contentHash: 'majority' }),
      cell({ id: 2, contentHash: 'majority', vantage: 'US' }),
      cell({ id: 3, contentHash: 'minority', vantage: 'DE' }),
    ];
    expect(pickBaselineCell(cells).contentHash).toBe('majority');
  });

  it('never picks blocked/error cells as baseline', () => {
    const cells = [
      cell({ id: 1, geoBlocked: true }),
      cell({ id: 2, classification: QA_CLASS.NETWORK_ERROR }),
      cell({ id: 3, contentHash: 'only-good' }),
    ];
    expect(pickBaselineCell(cells).id).toBe(3);
  });

  it('returns null when every cell failed', () => {
    const cells = [
      cell({ id: 1, classification: QA_CLASS.NETWORK_ERROR, contentHash: '' }),
      cell({ id: 2, geoBlocked: true }),
    ];
    expect(pickBaselineCell(cells)).toBeNull();
  });

  it('prefers desktop+DIRECT among tied modal groups', () => {
    const a = { ...cell({ id: 1 }), deviceType: 'mobile', vantage: 'US' };
    const b = cell({ id: 2 });
    const c = cell({ id: 3 });
    // all distinct hashes, single cell each → tie at count 1; desktop DIRECT wins
    a.contentHash = 'a'; b.contentHash = 'b'; c.contentHash = 'c';
    expect(pickBaselineCell([a, b, c]).id).toBe(2);
  });

  it('classification precedence: error > geo > device-loop > http error > content diff', () => {
    const baseline = cell({ id: 99, contentHash: 'base' });
    expect(classifyCell(cell({ error: 'timeout' }), baseline).classification).toBe(QA_CLASS.NETWORK_ERROR);
    expect(classifyCell(cell({ geoBlocked: true }), baseline).classification).toBe(QA_CLASS.GEO_BLOCKED);
    expect(
      classifyCell(cell({ deviceBlocked: true, redirectLoop: true }), baseline).classification
    ).toBe(QA_CLASS.REDIRECT_LOOP);
    expect(classifyCell(cell({ statusCode: 500 }), baseline).classification).toBe(QA_CLASS.HTTP_ERROR);
  });

  it('baseline cell classifies identical (sim 1)', () => {
    const baseline = cell({ id: 7 });
    expect(classifyCell(baseline, baseline)).toEqual({ classification: QA_CLASS.IDENTICAL, similarity: 1 });
  });

  it('hash-equal cells are identical without similarity math', () => {
    const baseline = cell({ id: 1 });
    expect(classifyCell(cell({ id: 2 }), baseline).classification).toBe(QA_CLASS.IDENTICAL);
  });

  it('low-similarity content is divergent & flagged', () => {
    const baseline = cell({ id: 1, normalized: 'welcome players choose games play online free now today' });
    const out = classifyCell(
      cell({ id: 2, contentHash: 'other', normalized: 'completely unrelated words about something else entirely' }),
      baseline
    );
    expect(out.classification).toBe(QA_CLASS.DIVERGENT);
    expect(out.similarity).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
    expect(isFlagged(out.classification)).toBe(true);
    expect(isFlagged(QA_CLASS.IDENTICAL)).toBe(false);
  });

  it('close-but-not-equal content is similar', () => {
    const norm = 'welcome to the portal we have games and fun things to play every day online free';
    const near = 'welcome to the portal we have games and fun things to play every day online free now';
    const baseline = cell({ id: 1, normalized: norm });
    const out = classifyCell(cell({ id: 2, contentHash: 'x', normalized: near }), baseline);
    expect([QA_CLASS.IDENTICAL, QA_CLASS.SIMILAR]).toContain(out.classification);
  });
});
