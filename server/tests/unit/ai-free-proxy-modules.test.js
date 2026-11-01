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
  extractZipEntry,
  FreeProxyFetcher,
  PROXY_SOURCES,
} from '../../core/free-proxy-fetcher.js';
import AIBehaviorDirector from '../../core/ai-behavior-director.js';

// Build a minimal stored (method 0) ZIP archive in-memory for zip tests.
function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(data, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // method = stored
    local.writeUInt32LE(dataBuf.length, 18); // comp size
    local.writeUInt32LE(dataBuf.length, 22); // uncomp size
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, dataBuf);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt32LE(dataBuf.length, 20);
    cd.writeUInt32LE(dataBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cd, nameBuf]));
    offset += 30 + nameBuf.length + dataBuf.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

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

describe('extractZipEntry (codeload fallback)', () => {
  it('extracts a stored entry from a repo-prefixed zip', () => {
    const zip = makeZip([
      { name: 'free-proxy-list-main/README.md', data: 'hello' },
      { name: 'free-proxy-list-main/proxies/all/data.txt', data: '1.2.3.4:8080\n5.6.7.8:3128\n' },
    ]);
    const entry = extractZipEntry(zip, 'proxies/all/data.txt');
    expect(entry).not.toBeNull();
    expect(entry.toString()).toContain('1.2.3.4:8080');
  });

  it('returns null for missing entries / garbage buffers', () => {
    const zip = makeZip([{ name: 'repo-main/a.txt', data: 'x' }]);
    expect(extractZipEntry(zip, 'nope.txt')).toBeNull();
    expect(extractZipEntry(Buffer.from('not a zip'), 'a.txt')).toBeNull();
    expect(extractZipEntry(Buffer.alloc(0), 'a.txt')).toBeNull();
  });
});

describe('FreeProxyFetcher source registry & codeload fallback', () => {
  it('every source has both a raw URL and a codeload path', () => {
    for (const s of PROXY_SOURCES) {
      expect(s.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
      expect(s.repo).toBeTruthy();
      expect(s.path).toBeTruthy();
      expect(s.branch).toBeTruthy();
    }
  });

  it('falls back to the codeload zip when raw is unreachable', async () => {
    const zip = makeZip([
      { name: 'free-proxy-list-main/proxies/all/data.txt', data: 'http://9.9.8.7:8080\n1.2.3.4:3128\n' },
    ]);
    const calls = [];
    const httpGet = async (url, opts) => {
      calls.push(url);
      if (url.includes('codeload.github.com')) {
        return { data: zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length) };
      }
      throw new Error('raw blocked (sandbox)');
    };
    const fetcher = new FreeProxyFetcher({}, { httpGet, codeloadFallback: true });
    const src = PROXY_SOURCES.find((s) => s.name === 'proxifly');
    const body = await fetcher._getSourceFile(src, 1000);
    expect(body).toContain('9.9.8.7:8080');
    expect(calls.some((u) => u.includes('raw.githubusercontent.com'))).toBe(true);
    expect(calls.some((u) => u.includes('codeload.github.com/proxifly/free-proxy-list'))).toBe(true);
  });

  it('useCodeloadOnly skips raw entirely', async () => {
    const zip = makeZip([
      { name: 'PROXY-LIST-master/http.txt', data: '7.7.7.7:8080\n' },
    ]);
    const calls = [];
    const httpGet = async (url) => {
      calls.push(url);
      if (url.includes('codeload.github.com')) return { data: zip };
      throw new Error('should not be called');
    };
    const fetcher = new FreeProxyFetcher({}, { httpGet, useCodeloadOnly: true });
    const src = PROXY_SOURCES.find((s) => s.name === 'thespeedx-http');
    const body = await fetcher._getSourceFile(src, 1000);
    expect(body).toContain('7.7.7.7:8080');
    expect(calls.every((u) => u.includes('codeload.github.com'))).toBe(true);
  });

  it('probeSample disables dead free proxies via toggleProxy, never deletes', async () => {
    const toggled = [];
    const fakeManager = {
      getAll: () => [],
      addProxy: (p) => ({ ...p }),
      toggleProxy: (host, enabled) => toggled.push([host, enabled]),
    };
    const fetcher = new FreeProxyFetcher(fakeManager, { probeSample: 4, probeConcurrency: 4 });
    // Stub the probe: first two alive, rest dead
    let n = 0;
    fetcher._tcpProbe = async () => (n++ < 2);
    const report = {};
    await fetcher._probeSample([
      { host: '1.1.1.1', port: 80, source: 'free' },
      { host: '2.2.2.2', port: 80, source: 'free' },
      { host: '3.3.3.3', port: 80, source: 'free' },
      { host: '4.4.4.4', port: 80, source: 'free' },
    ], report);
    expect(report.probed).toBe(4);
    expect(report.probeAlive + report.probeDead).toBe(4);
    expect(toggled.length).toBe(report.probeDead);
    expect(toggled.every(([, en]) => en === false)).toBe(true); // disabled, not removed
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

describe('AIBehaviorDirector with a live OpenAI-compatible endpoint (OmniRoute-style)', () => {
  it('uses the LLM when the gateway is reachable and parses its JSON plan', async () => {
    const http = await import('http');
    const planJson = JSON.stringify({
      persona: 'night_owl_reader', dwellScale: 2.2,
      scroll: { steps: 11, depth: 0.9 }, hover: { intensity: 0.7 },
      clickIntent: 0.4, pauseScale: 1.8, reason: 'long-form article, evening visit',
    });
    const server = http.createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'openai/gpt-4o-mini' }] }));
      } else if (req.url === '/v1/chat/completions') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: `Here you go: ${planJson}` } }] }));
      } else {
        res.statusCode = 404; res.end('{}');
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    try {
      const d = new AIBehaviorDirector({
        config: {
          provider: 'omniroute',
          omnirouteUrl: `http://127.0.0.1:${port}/v1`,
          omnirouteModel: 'openai/gpt-4o-mini',
          timeoutMs: 3000,
        },
      });
      await d.init();
      expect(d.activeProvider).toBe('omniroute');
      const plan = await d.buildPlan({
        url: 'https://example.com/article', profile: { isMobile: false, locale: 'en-US' },
        pageStats: { title: 'Article', words: 1500, links: 20, images: 4, hasVideo: false },
        seed: 'omni-1',
      });
      expect(plan.source).toBe('llm:omniroute');
      expect(plan.persona).toBe('night_owl_reader');
      expect(plan.dwellScale).toBeCloseTo(2.2);
      expect(plan.scroll.steps).toBe(11);
      expect(d.getStatus().provider).toBe('omniroute');
      expect(d.stats.llmPlans).toBe(1);
    } finally {
      server.close();
    }
  });

  it('falls back to heuristic when the LLM endpoint is down', async () => {
    const d = new AIBehaviorDirector({
      config: {
        provider: 'omniroute',
        omnirouteUrl: 'http://127.0.0.1:1/v1', // nothing listening
        omnirouteModel: 'x',
        timeoutMs: 800,
      },
    });
    await d.init();
    expect(d.activeProvider).toBeNull();
    const plan = await d.buildPlan({ url: 'https://example.com/', profile: {}, pageStats: {}, seed: 'fb1' });
    expect(plan.source).toBe('heuristic');
    expect(d.stats.heuristicPlans).toBe(1);
  });
});
