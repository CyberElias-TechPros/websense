// ============================================================================
// qa-exposure.test.js — Detection-exposure analyzer + sentinel middleware.
// Blue-hat sensing layer: which observable mannerisms give behavior away.
// ============================================================================

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  analyzeExposure,
  summarizeExposure,
  cohortContext,
  interarrivalCV,
  recordFromQaCell,
  recordFromVisit,
  EXPOSURE_RULES,
} from '../../qa/exposure.js';
import createSentinel, { scoreRequest } from '../../qa/sentinel.js';
import { QA_CLASS } from '../../qa/signals.js';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const flagIds = (r) => r.flags.map((f) => f.rule);

// ---------------------------------------------------------------------------
// analyzeExposure — single records
// ---------------------------------------------------------------------------
describe('exposure: single-record heuristics', () => {
  it('HTTP-mode fetch is instantly exposed (no JS + no fetch metadata)', () => {
    const r = analyzeExposure({
      mode: 'http',
      userAgent: DESKTOP_UA,
      acceptLanguage: 'en-US,en;q=0.9',
      deviceType: 'desktop',
      headers: {},
      durationMs: 2100,
      referrer: null,
    });
    expect(flagIds(r)).toContain('no-js-execution');
    expect(flagIds(r)).toContain('missing-fetch-metadata');
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('browser-mode record with consistent identity scores low', () => {
    const r = analyzeExposure({
      mode: 'browser',
      userAgent: MOBILE_UA,
      acceptLanguage: 'en-US,en;q=0.9',
      deviceType: 'mobile',
      viewportW: 390,
      headers: { 'sec-fetch-mode': 'navigate' },
      durationMs: 4500,
      referrer: null,
    });
    expect(flagIds(r)).not.toContain('no-js-execution');
    expect(flagIds(r)).not.toContain('ua-device-mismatch');
    expect(r.score).toBeLessThan(30);
  });

  it('flags UA ⇄ device-class and UA ⇄ viewport mismatches', () => {
    const r = analyzeExposure({
      mode: 'browser',
      userAgent: MOBILE_UA,
      acceptLanguage: 'en-US',
      deviceType: 'desktop',
      viewportW: 1920,
      headers: { 'sec-fetch-dest': 'document' },
    });
    expect(flagIds(r)).toContain('ua-device-mismatch');
    expect(flagIds(r)).toContain('ua-viewport-mismatch');
  });

  it('flags missing Accept-Language on browser UAs', () => {
    const r = analyzeExposure({ mode: 'http', userAgent: DESKTOP_UA, acceptLanguage: null, headers: {} });
    expect(flagIds(r)).toContain('no-accept-language');
  });

  it('flags sub-300ms “visits”', () => {
    const r = analyzeExposure({ mode: 'http', userAgent: DESKTOP_UA, acceptLanguage: 'en', headers: { 'sec-fetch-site': 'none' }, durationMs: 120 });
    expect(flagIds(r)).toContain('impossible-speed');
  });

  it('empty referrer is a low-severity corroborator; null referrer does not fire', () => {
    const empty = analyzeExposure({ mode: 'browser', referrer: '', headers: {}, userAgent: DESKTOP_UA, acceptLanguage: 'en' });
    expect(flagIds(empty)).toContain('direct-landing-no-referrer');
    const unset = analyzeExposure({ mode: 'browser', referrer: null, headers: {}, userAgent: DESKTOP_UA, acceptLanguage: 'en' });
    expect(flagIds(unset)).not.toContain('direct-landing-no-referrer');
  });

  it('score is capped at 100', () => {
    const r = analyzeExposure({
      mode: 'http', userAgent: MOBILE_UA, acceptLanguage: null,
      deviceType: 'desktop', viewportW: 1920, headers: {}, durationMs: 50, referrer: '',
    });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Cohort-level analysis
// ---------------------------------------------------------------------------
describe('exposure: cohort patterns', () => {
  it('metronome timing (CV≈0) raises a cohort flag', () => {
    const t0 = Date.parse('2026-11-03T00:00:00Z');
    const records = Array.from({ length: 12 }, (_, i) => ({
      mode: 'browser', headers: {}, userAgent: DESKTOP_UA, acceptLanguage: 'en',
      createdAt: new Date(t0 + i * 5000).toISOString(), // exactly every 5s
    }));
    const s = summarizeExposure(records);
    expect(s.cohortFlags.map((f) => f.rule)).toContain('timing-uniform');
    expect(s.interarrivalCV).toBeLessThan(0.25);
  });

  it('jittered human-like timing does not raise the flag', () => {
    const t0 = Date.parse('2026-11-03T00:00:00Z');
    const gaps = [1, 7, 2, 30, 3, 12, 1, 45, 5, 9, 2, 20]; // seconds
    let t = t0;
    const records = gaps.map((g) => {
      t += g * 1000;
      return { mode: 'browser', headers: {}, createdAt: new Date(t).toISOString() };
    });
    const s = summarizeExposure(records);
    expect(s.cohortFlags.map((f) => f.rule)).not.toContain('timing-uniform');
  });

  it('one UA dominating the cohort is flagged per-record', () => {
    const records = Array.from({ length: 8 }, () => ({ mode: 'browser', headers: {}, userAgent: DESKTOP_UA, acceptLanguage: 'en' }));
    records.push({ mode: 'browser', headers: {}, userAgent: MOBILE_UA, acceptLanguage: 'en' });
    const ctx = cohortContext(records);
    const dominant = analyzeExposure(records[0], ctx);
    const rare = analyzeExposure(records[8], ctx);
    expect(flagIds(dominant)).toContain('ua-reuse-cohort');
    expect(flagIds(rare)).not.toContain('ua-reuse-cohort');
  });

  it('summarizeExposure aggregates rule counts and averages', () => {
    const records = [
      { mode: 'http', userAgent: DESKTOP_UA, acceptLanguage: 'en', headers: {} },
      { mode: 'http', userAgent: MOBILE_UA, acceptLanguage: 'en', deviceType: 'mobile', headers: {} },
    ];
    const s = summarizeExposure(records);
    expect(s.total).toBe(2);
    expect(s.flaggedRecords).toBe(2);
    expect(s.ruleCounts['no-js-execution']).toBe(2);
    expect(s.avgScore).toBeGreaterThan(0);
    expect(s.results.length).toBe(2); // per-record detail preserved for callers
  });

  it('interarrivalCV is null for tiny cohorts', () => {
    expect(interarrivalCV(['2026-11-03T00:00:00Z', '2026-11-03T00:00:05Z'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------
describe('exposure: record adapters', () => {
  it('recordFromQaCell carries identity telemetry', () => {
    const rec = recordFromQaCell({
      id: 5, url: 'https://a.example/', vantage: 'GB', mode: 'http',
      user_agent: DESKTOP_UA, accept_language: 'en-GB,en;q=0.9', device_type: 'desktop',
      viewport_w: 1920, headers: {}, duration_ms: 900, created_at: '2026-11-03 01:00:00',
      status_code: 200, classification: QA_CLASS.IDENTICAL,
    });
    expect(rec.userAgent).toBe(DESKTOP_UA);
    expect(rec.acceptLanguage).toContain('en-GB');
    expect(rec.statusCode).toBe(200);
    const a = analyzeExposure(rec);
    expect(flagIds(a)).toContain('no-js-execution');
  });

  it('recordFromVisit maps engine visit rows', () => {
    const rec = recordFromVisit({
      id: 9, url: 'https://x.example/', proxy_country: 'US', mode: 'http',
      user_agent: DESKTOP_UA, device_type: 'desktop', referrer: 'https://www.google.com/',
      latency_ms: 1400, created_at: '2026-11-03 01:00:00', status_code: 200,
    });
    expect(rec.vantage).toBe('US');
    expect(rec.referrer).toContain('google');
    const a = analyzeExposure(rec);
    expect(flagIds(a)).not.toContain('direct-landing-no-referrer');
    expect(flagIds(a)).toContain('no-accept-language'); // engine doesn't persist request headers
  });
});

// ---------------------------------------------------------------------------
// Sentinel (defensive middleware for own properties)
// ---------------------------------------------------------------------------
describe('sentinel middleware', () => {
  it('scores automation UAs as clearly bot-like', () => {
    const r = scoreRequest({ ua: 'curl/8.5.0', headers: {} });
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it('browser UA without language/fetch-metadata accumulates suspicion', () => {
    const r = scoreRequest({ ua: DESKTOP_UA, headers: { 'user-agent': DESKTOP_UA }, hasCookies: false });
    expect(r.signals.map((s) => s.id)).toContain('no-accept-language');
    expect(r.signals.map((s) => s.id)).toContain('no-fetch-metadata');
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it('a browser-looking request with cookies + full headers scores ~0', () => {
    const r = scoreRequest({
      ua: DESKTOP_UA,
      headers: {
        'user-agent': DESKTOP_UA,
        'accept-language': 'en-US,en;q=0.9',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126"',
      },
      hasCookies: true,
      recentRequestCount: 1,
    });
    expect(r.score).toBeLessThan(10);
    expect(r.signals).toHaveLength(0);
  });

  it('Chromium UA without Client Hints is inconsistent', () => {
    const r = scoreRequest({
      ua: DESKTOP_UA,
      headers: { 'user-agent': DESKTOP_UA, 'accept-language': 'en', 'sec-fetch-mode': 'navigate' },
      hasCookies: true,
    });
    expect(r.signals.map((s) => s.id)).toContain('no-client-hints');
  });

  it('Safari UA (no Client Hints ever) is not flagged for them', () => {
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    const r = scoreRequest({
      ua: safari,
      headers: { 'user-agent': safari, 'accept-language': 'en', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
      hasCookies: true,
    });
    expect(r.signals.map((s) => s.id)).not.toContain('no-client-hints');
    expect(r.score).toBeLessThan(10);
  });

  it('pre-TLS-1.2 transport is a strong tell; unknown protocol is neutral', () => {
    const weak = scoreRequest({ ua: DESKTOP_UA, headers: {}, tlsProtocol: 'TLSv1.0' });
    expect(weak.signals.map((s) => s.id)).toContain('outdated-tls');
    expect(weak.score).toBeGreaterThanOrEqual(50);
    const modern = scoreRequest({ ua: DESKTOP_UA, headers: {}, tlsProtocol: 'TLSv1.3' });
    expect(modern.signals.map((s) => s.id)).not.toContain('outdated-tls');
    const unknown = scoreRequest({ ua: DESKTOP_UA, headers: {}, tlsProtocol: null });
    expect(unknown.signals.map((s) => s.id)).not.toContain('outdated-tls');
  });

  it('explicit zero behavioral events score a behavior gap; absent beacon is neutral', () => {
    const gap = scoreRequest({ ua: DESKTOP_UA, headers: { 'accept-language': 'en', 'sec-fetch-mode': 'navigate' }, hasCookies: true, eventCount: 0 });
    expect(gap.signals.map((s) => s.id)).toContain('behavior-gap');
    const unknown = scoreRequest({ ua: DESKTOP_UA, headers: { 'accept-language': 'en', 'sec-fetch-mode': 'navigate' }, hasCookies: true, eventCount: null });
    expect(unknown.signals.map((s) => s.id)).not.toContain('behavior-gap');
  });

  it('middleware forwards the x-sentinel-events beacon value', async () => {
    const obs = [];
    const app = express();
    app.use(createSentinel({ onObservation: (o) => obs.push(o) }));
    app.get('/', (req, res) => res.end('ok'));
    await request(app).get('/').set('x-sentinel-events', '0');
    expect(obs[0].signals.map((s) => s.id)).toContain('behavior-gap');
    await request(app).get('/').set('x-sentinel-events', '7');
    expect(obs[1].signals.map((s) => s.id)).not.toContain('behavior-gap');
  });

  it('recognizes our own QA probes as self-traffic, not attacks', () => {
    const r = scoreRequest({ ua: DESKTOP_UA, headers: { 'x-websense-qa': 'run:abc' } });
    expect(r.selfProbe).toBe(true);
  });

  it('rate window yields elevated/rapid-fire signals', () => {
    const hi = scoreRequest({ ua: DESKTOP_UA, headers: { 'accept-language': 'en', 'sec-fetch-mode': 'navigate' }, recentRequestCount: 25, windowSeconds: 60 });
    expect(hi.signals.map((s) => s.id)).toContain('rapid-fire');
  });

  it('middleware annotates req.sentinel, sets score header, emits observations', async () => {
    const obs = [];
    const app = express();
    app.use(createSentinel({ onObservation: (o) => obs.push(o) }));
    app.get('/', (req, res) => res.json({ sentinel: req.sentinel }));

    const res = await request(app).get('/').set('user-agent', 'curl/8.5.0');
    expect(res.status).toBe(200);
    expect(Number(res.headers['x-sentinel-score'])).toBeGreaterThanOrEqual(50);
    expect(obs.length).toBe(1);
    expect(obs[0].signals.length).toBeGreaterThan(0);
    expect(obs[0].selfProbe).toBe(false);
  });

  it('catalog documents every rule with a human reason', () => {
    for (const r of EXPOSURE_RULES) {
      expect(r.id).toBeTruthy();
      expect(r.why.length).toBeGreaterThan(20);
      expect(['high', 'medium', 'low']).toContain(r.severity);
    }
  });
});
