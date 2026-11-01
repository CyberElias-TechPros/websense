// ============================================================================
// phase3-modules.test.js — Tests for the "garnish" batch:
//   • domain-rules.js      (robots parsing, opt-outs, per-domain rate limits)
//   • observability.js     (metrics + alert raising)
//   • proxy-manager        (geo-match selection, free-proxy archiving)
//   • profile-manager      (per-profile proxy stickiness)
//   • ai-behavior-director (detection feedback loop → cautious plans)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DomainRulesManager, parseRobots, robotsPathAllowed,
} from '../../core/domain-rules.js';
import ObservabilityHub from '../../core/observability.js';
import ProxyManager from '../../core/proxy-manager.js';
import ProfileManager from '../../core/profile-manager.js';
import AIBehaviorDirector from '../../core/ai-behavior-director.js';
import db from '../../database/db.js';

// ---------------------------------------------------------------------------
describe('domain-rules: robots.txt parsing & path rules', () => {
  it('parses Disallow/Allow for User-agent: *', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /private/',
      'Disallow: /tmp',
      'Allow: /private/public/',
      '',
      'User-agent: Googlebot',
      'Disallow: /', // must NOT apply to our UA group
      '# comment',
    ].join('\n');
    const { disallow, allow } = parseRobots(robots);
    expect(disallow).toEqual(['/private/', '/tmp']);
    expect(allow).toEqual(['/private/public/']);
  });

  it('longest rule wins, tie → Allow wins (RFC 9309)', () => {
    const parsed = { disallow: ['/private/'], allow: ['/private/public/'] };
    expect(robotsPathAllowed('/private/secret', parsed)).toBe(false);
    expect(robotsPathAllowed('/private/public/page', parsed)).toBe(true);
    expect(robotsPathAllowed('/other', parsed)).toBe(true);
    const tie = { disallow: ['/a'], allow: ['/a'] };
    expect(robotsPathAllowed('/a', tie)).toBe(true);
  });

  it('supports * wildcards', () => {
    const parsed = { disallow: ['/cgi-bin/*'], allow: [] };
    expect(robotsPathAllowed('/cgi-bin/foo.cgi', parsed)).toBe(false);
    expect(robotsPathAllowed('/cgi-bin', parsed)).toBe(true);
  });
});

describe('domain-rules: check() — opt-outs & rate limits', () => {
  it('blocks opted-out domains', async () => {
    const m = new DomainRulesManager({ enabled: true, respectRobots: false, optOuts: ['never-visit.com'] });
    const chk = await m.check('https://never-visit.com/page');
    expect(chk.allowed).toBe(false);
    expect(chk.reason).toBe('opt-out');
  });

  it('enforces per-domain hourly cap and min interval', async () => {
    const m = new DomainRulesManager({
      enabled: true, respectRobots: false,
      defaultMaxVisitsPerHour: 2, defaultMinIntervalMs: 60000,
    });
    const url = 'https://capped.example/page';
    expect((await m.check(url)).allowed).toBe(true);
    m.recordVisit(url);
    const c2 = await m.check(url);
    expect(c2.allowed).toBe(false);
    expect(c2.reason).toMatch(/min-interval/);
    m.recordVisit(url); // second visit → hits hourly cap on third check
    const c3 = await m.check(url);
    expect(c3.allowed).toBe(false);
    expect(c3.reason).toMatch(/rate-limit/);
  });

  it('persists custom rules', () => {
    const m = new DomainRulesManager({ respectRobots: false });
    m.setRule('custom.example', { maxVisitsPerHour: 99, minIntervalMs: 1000 });
    const rule = m.getRule('custom.example');
    expect(rule.maxVisitsPerHour).toBe(99);
    expect(m.getRules().rules['custom.example'].optOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('observability: metrics & alerts', () => {
  it('raises free_refresh_empty after N zero-add refreshes and free_sources_unreachable', () => {
    const hub = new ObservabilityHub({ zeroRefreshAlerts: 2 });
    hub.recordFreeRefresh({ fetched: 100, added: 0 });
    expect(hub.getAlerts().find((a) => a.id === 'free_refresh_empty')).toBeUndefined();
    hub.recordFreeRefresh({ fetched: 100, added: 0 });
    expect(hub.getAlerts().find((a) => a.id === 'free_refresh_empty')).toBeTruthy();
    hub.recordFreeRefresh({ fetched: 0, added: 0 });
    hub.recordFreeRefresh({ fetched: 0, added: 0 });
    expect(hub.getAlerts().find((a) => a.id === 'free_sources_unreachable')).toBeTruthy();
    expect(hub.getMetrics().counters.free_proxies_fetched_total).toBe(200);
  });

  it('alerts when AI plans fall back to heuristic too often', () => {
    const hub = new ObservabilityHub({ fallbackRateThreshold: 0.8, fallbackMinPlans: 5 });
    hub.recordAIStats({ llmPlans: 0, heuristicPlans: 0, cacheHits: 0 });
    hub.recordAIStats({ llmPlans: 0, heuristicPlans: 8, cacheHits: 2 }); // 8 heuristic, 0 llm
    const alert = hub.getAlerts().find((a) => a.id === 'ai_llm_fallback_high');
    expect(alert).toBeTruthy();
    expect(hub.getMetrics().gauges.plan_fallback_rate).toBe(1);
  });

  it('alerts on high visit error rate and supports ack', () => {
    const hub = new ObservabilityHub({ visitWindow: 10, errorRateThreshold: 0.3 });
    for (let i = 0; i < 10; i++) hub.recordVisit({ success: i < 5, skipped: false });
    const alert = hub.getAlerts().find((a) => a.id === 'visit_error_rate_high');
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe('warning');
    const acked = hub.ackAlert('visit_error_rate_high');
    expect(acked.acked).toBe(true);
    expect(hub.getAlerts().find((a) => a.id === 'visit_error_rate_high').acked).toBe(true);
  });

  it('emits prometheus text format', () => {
    const hub = new ObservabilityHub({});
    hub.recordVisit({ success: true });
    const text = hub.getPrometheusText();
    expect(text).toContain('websense_visits_total 1');
    expect(text).toContain('# TYPE websense_uptime_seconds gauge');
  });

  it('notifies onAlert listeners', () => {
    const hub = new ObservabilityHub({ visitWindow: 4, errorRateThreshold: 0.3 });
    const seen = [];
    hub.onAlert = (a) => seen.push(a.id);
    for (let i = 0; i < 4; i++) hub.recordVisit({ success: false });
    expect(seen).toContain('visit_error_rate_high');
  });
});

// ---------------------------------------------------------------------------
describe('proxy-manager: geo-match + free-proxy archiving', () => {
  // Random hosts per run — proxy_stats persists across runs in the dev DB.
  const mk = (extra = {}) => {
    const r = () => `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
    return new ProxyManager([
      { host: r(), port: 8000, country: 'US', city: 'NYC', flag: '🇺🇸', source: 'webshare', username: 'u', password: 'p' },
      { host: r(), port: 8000, country: 'DE', city: 'Berlin', flag: '🇩🇪', source: 'webshare', username: 'u', password: 'p' },
      { host: r(), port: 8000, country: 'DE', city: 'Berlin', flag: '🌐', source: 'free' },
      { host: r(), port: 8000, country: 'GB', city: 'London', flag: '🌐', source: 'free' },
    ], { circuitOpenAfter: 99, archiveFreeAfterFailures: 3, ...extra });
  };

  it('geo-match prefers the requested country, falls back otherwise', () => {
    const pm = mk();
    const deHosts = pm.proxies.filter((p) => p.country === 'DE').map((p) => p.host);
    for (let i = 0; i < 10; i++) {
      const p = pm.select('geo-match', { preferCountry: 'DE' });
      expect(deHosts).toContain(p.host);
    }
    const p = pm.select('geo-match', { preferCountry: 'JP' }); // no JP proxies
    expect(p).toBeTruthy();
  });

  it('random selection honors preferCountry when geoMatch enabled', () => {
    const pm = mk();
    const gbHost = pm.proxies.find((p) => p.country === 'GB').host;
    for (let i = 0; i < 10; i++) {
      const p = pm.select('random', { preferCountry: 'GB', geoMatch: true });
      expect(p.host).toBe(gbHost);
    }
    // geoMatch disabled → full pool
    const hosts = new Set();
    for (let i = 0; i < 20; i++) hosts.add(pm.select('random', { preferCountry: 'GB', geoMatch: false }).host);
    expect(hosts.size).toBeGreaterThan(1);
  });

  it('archives free proxies after N consecutive failures but never paid ones', () => {
    const pm = mk();
    const free = pm.proxies.find((p) => p.source === 'free');
    const paid = pm.proxies.find((p) => p.source === 'webshare');
    for (let i = 0; i < 3; i++) pm.recordFailure(free, 'proxy');
    expect(free.archived).toBe(true);
    expect(free.enabled).toBe(false);
    expect(pm.getStats().archived).toBe(1);
    for (let i = 0; i < 10; i++) pm.recordFailure(paid, 'proxy');
    expect(paid.archived).toBe(false); // paid pool untouched by archiving
    expect(pm.getActiveProxies().some((p) => p.host === free.host)).toBe(false);
  });

  it('unarchiveProxy re-activates for backfill', () => {
    const pm = mk();
    const free = pm.proxies.find((p) => p.source === 'free');
    pm.archiveProxy(free.host, 'test');
    expect(free.enabled).toBe(false);
    const rec = pm.unarchiveProxy(free.host);
    expect(rec.enabled).toBe(true);
    expect(rec.archived).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('profile-manager: proxy stickiness', () => {
  it('binds a proxy to a profile and returns it while active', async () => {
    const host = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`; // random — DB persists enabled flags across runs
    const pm = new ProfileManager({ db }, { returnRate: 1 });
    await pm.init();
    const proxyManager = new ProxyManager([
      { host, port: 8080, country: 'US', city: 'NYC', flag: '🇺🇸', source: 'webshare', username: 'u', password: 'p' },
    ], { circuitOpenAfter: 99 });
    const profile = await pm.createProfile({ proxy: proxyManager.proxies[0], userAgent: 'UA', fingerprintSeed: 1, country: 'US' });
    await pm.bindProxy(profile.id, proxyManager.proxies[0]);
    const bound = pm.getBoundProxy(profile.id, proxyManager);
    expect(bound?.host).toBe(host);
    // disable the proxy → bound no longer returned
    proxyManager.toggleProxy(host, false);
    expect(pm.getBoundProxy(profile.id, proxyManager)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('ai-behavior-director: detection feedback loop', () => {
  it('recordOutcome tracks detections per host; cautious heuristic plans follow', async () => {
    const d = new AIBehaviorDirector({ config: { provider: 'off', enabled: true } });
    d.activeProvider = null;
    const url = 'https://flagged.example/article';
    // baseline plan (no detections)
    const base = await d.buildPlan({ url, profile: { isMobile: false, locale: 'en-US' }, pageStats: {}, seed: 's1' });
    // simulate 2 detections on the host
    d.recordOutcome({ url, detected: true, reason: 'HTTP 403' });
    d.recordOutcome({ url, detected: true, reason: 'captcha' });
    expect(d.recentDetectionsFor(url)).toBe(2);
    // new plan (different seed → different cache key) must be more cautious
    const cautious = await d.buildPlan({ url, profile: { isMobile: false, locale: 'en-US' }, pageStats: {}, seed: 's2' });
    expect(cautious.clickIntent).toBeLessThanOrEqual(base.clickIntent + 1e-9);
    expect(cautious.description).toMatch(/cautious/);
    expect(d.getStatus().feedback.detectionsLastHour).toBe(2);
  });

  it('feedback slowdownFactor boosts pauseScale in heuristic plans', async () => {
    const d = new AIBehaviorDirector({ config: { provider: 'off', enabled: true } });
    d.activeProvider = null;
    const p1 = await d.buildPlan({ url: 'https://slow.example/', profile: {}, pageStats: {}, seed: 'a' });
    const p2 = await d.buildPlan({ url: 'https://slow.example/', profile: {}, pageStats: {}, seed: 'b', feedback: { slowdownFactor: 2 } });
    // pauseScale is clamped to 2.5; with a 2x boost p2 should be >= p1
    expect(p2.pauseScale).toBeGreaterThanOrEqual(p1.pauseScale - 1e-9);
  });
});
