// ============================================================================
// ai-free-proxy-modules.test.js — Tests for the free-proxy fetcher (parser,
// geo map, dedupe, caps) and the AI behavior director (plan clamping,
// heuristic determinism, LLM JSON extraction).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseProxyLine,
  parseProxyList,
  buildGeoMap,
  FreeProxyFetcher,
} from '../../core/free-proxy-fetcher.js';
import AIBehaviorDirector from '../../core/ai-behavior-director.js';

describe('free-proxy line parser', () => {
  it('parses protocol://ip:port lines', () => {
    expect(parseProxyLine('socks5://208.102.51.6:58208')).toEqual({
      host: '208.102.51.6', port: 58208, type: 'socks5',
    });
    expect(parseProxyLine('http://124.106.116.34:1337', 'http')).toEqual({
      host: '124.106.116.34', port: 1337, type: 'http',
    });
  });

  it('parses bare ip:port with the source default type', () => {
    expect(parseProxyLine('1.2.3.4:8080', 'http').type).toBe('http');
    expect(parseProxyLine('1.2.3.4:1080', 'socks5').type).toBe('socks5');
  });

  it('normalizes socks → socks5 and https → http', () => {
    expect(parseProxyLine('socks://1.2.3.4:1080').type).toBe('socks5');
    expect(parseProxyLine('https://1.2.3.4:443').type).toBe('http');
  });

  it('rejects garbage, comments, credentials lines and invalid ports', () => {
    expect(parseProxyLine('')).toBeNull();
    expect(parseProxyLine('# comment')).toBeNull();
    expect(parseProxyLine('not a proxy')).toBeNull();
    expect(parseProxyLine('1.2.3.4:99999')).toBeNull();
    expect(parseProxyLine('1.2.3.4:0000')).toBeNull();
    expect(parseProxyLine('domain.com:8080')).toBeNull(); // IPv4 only
  });

  it('drops credential suffixes on ip:port:user:pass', () => {
    // Only when exactly 4 colon-parts (IPv4 heuristic)
    expect(parseProxyLine('1.2.3.4:8080:user:pass')).toEqual({
      host: '1.2.3.4', port: 8080, type: 'http',
    });
  });
});

describe('free-proxy list parsing & dedupe', () => {
  it('dedupes repeated entries across a list body', () => {
    const body = 'http://1.2.3.4:80\nhttp://1.2.3.4:80\n5.6.7.8:3128\nsocks5://1.2.3.4:80';
    const out = parseProxyList(body, 'http');
    expect(out.length).toBe(2); // dup dropped; socks5://1.2.3.4:80 is same host:port
    expect(out[0].port).toBe(80);
  });

  it('builds a geo map from proxifly JSON (tolerant)', () => {
    const json = JSON.stringify([
      { ip: '1.2.3.4', port: 8080, protocol: 'http', country: { code: 'DE' }, city: { name: 'Berlin' } },
      { ip: '5.6.7.8', port: 1080, protocol: 'socks5' }, // skipped — non-http protocol
      { bad: true },
    ]);
    const map = buildGeoMap(json);
    expect(map.get('1.2.3.4:8080')).toEqual({ country: 'DE', city: 'Berlin' });
    expect(map.has('5.6.7.8:1080')).toBe(false);
    expect(buildGeoMap('not json').size).toBe(0);
  });
});

describe('FreeProxyFetcher.refreshAndApply', () => {
  it('adds unique credential-less free proxies and reports stats', async () => {
    const fakeManager = {
      getAll: () => [
        { host: '9.9.9.9', port: 80, source: 'webshare' },
      ],
      addProxy: (p) => ({ ...p, ok: true }),
    };
    const fetcher = new FreeProxyFetcher(fakeManager, { max: 500, perSourceCap: 500 });
    // Stub the network
    fetcher.fetchAll = async () => ({
      proxies: [
        { host: '1.1.1.1', port: 8080, type: 'http', country: 'US', city: null },
        { host: '9.9.9.9', port: 80, type: 'http' }, // duplicate of existing paid
        { host: '2.2.2.2', port: 1080, type: 'socks5' },
      ],
      bySource: { proxifly: 3 },
    });

    const report = await fetcher.refreshAndApply();
    expect(report.added).toBe(2); // duplicate skipped
    expect(report.bySource.proxifly).toBe(3);
    expect(report.totalInPool).toBe(1);

    const stats = fetcher.getStats();
    expect(stats.poolTotal).toBe(1);
  });
});

describe('AIBehaviorDirector.heuristicPlan (via buildPlan, heuristic mode)', () => {
  const director = new AIBehaviorDirector({ config: { provider: 'off', enabled: true } });
  // Force heuristic-only path without probing providers
  director.activeProvider = null;

  const profile = {
    isMobile: false, isTablet: false, platform: 'Win32', locale: 'en-US', screen: { w: 1920, h: 1080 },
  };

  it('produces a clamped, valid plan for a visit', async () => {
    const plan = await director.buildPlan({
      url: 'https://example.com/page?a=1',
      profile,
      pageStats: { title: 'T', words: 800, links: 40, images: 12, hasVideo: false },
      seed: 'seed-1',
    });
    expect(plan.dwellScale).toBeGreaterThanOrEqual(0.3);
    expect(plan.dwellScale).toBeLessThanOrEqual(3.0);
    expect(plan.scroll.steps).toBeGreaterThanOrEqual(1);
    expect(plan.scroll.steps).toBeLessThanOrEqual(14);
    expect(plan.scroll.depth).toBeGreaterThanOrEqual(0.15);
    expect(plan.scroll.depth).toBeLessThanOrEqual(1.0);
    expect(plan.hover.intensity).toBeGreaterThanOrEqual(0.1);
    expect(plan.clickIntent).toBeGreaterThanOrEqual(0);
    expect(plan.clickIntent).toBeLessThanOrEqual(0.8);
    expect(plan.source).toBe('heuristic');
    expect(typeof plan.persona).toBe('string');
  });

  it('is deterministic for the same seed + host (returning-visitor consistency)', async () => {
    const p1 = await director.buildPlan({ url: 'https://a.com/x', profile, seed: 's7', pageStats: {} });
    const p2 = await director.buildPlan({ url: 'https://a.com/x', profile, seed: 's7', pageStats: {} });
    expect(p1.persona).toBe(p2.persona);
    expect(p1.dwellScale).toBeCloseTo(p2.dwellScale, 10);
  });

  it('different seeds on the same host can produce different personas', async () => {
    const personas = new Set();
    for (let i = 0; i < 40; i++) {
      const p = await director.buildPlan({ url: 'https://multi.com/y', profile, seed: `s${i}`, pageStats: {} });
      personas.add(p.persona);
    }
    expect(personas.size).toBeGreaterThan(1);
  });

  it('parses and clamps LLM JSON output', () => {
    const llmText = 'Sure! {"persona":"research_reader","dwellScale":99,"scroll":{"steps":-5,"depth":2.5},"hover":{"intensity":0.9},"clickIntent":0.6,"pauseScale":1.2,"reason":"r"}';
    const plan = director._parsePlan(llmText, 's', 'https://x.com', profile, {});
    expect(plan).not.toBeNull();
    expect(plan.persona).toBe('research_reader');
    expect(plan.dwellScale).toBe(3.0);        // clamped high
    expect(plan.scroll.steps).toBe(1);         // clamped low
    expect(plan.scroll.depth).toBe(1.0);       // clamped high
    expect(plan.source).toMatch(/^llm:/);
  });

  it('returns null for non-JSON LLM output', () => {
    expect(director._parsePlan('no json here mea culpa', 's', 'https://x.com', profile, {})).toBeNull();
  });
});
