// ============================================================================
// browser-mode.test.js — Puppeteer wiring tests (no real Chrome needed):
//   • puppeteer is vi.mock'ed — launch() returns a fake browser whose page
//     records goto() and returns a marker body
//   • runBrowserVisit: launch options carry --proxy-server with the proxy's
//     OWN scheme (http vs socks5), executablePath from PUPPETEER_EXECUTABLE_PATH,
//     headless fallback arg, nav timeout floored to >=30s even when the engine
//     requestTimeout is 3s, and the visit result carries statusCode + body
//   • isBrowserModeAvailable(): reports { available, reason } shape
//   • clampDwellMs: dwell clamped into [BEHAVIOR_DWELL_MIN_S, MAX_S]
// ============================================================================

// Dwell clamp must not slow the test down — set to 0 BEFORE importing the module.
process.env.BEHAVIOR_DWELL_MIN_S = '0';
process.env.BEHAVIOR_DWELL_MAX_S = '0';
process.env.PUPPETEER_EXECUTABLE_PATH = '/tmp/fake-chrome-for-test';

import { describe, it, expect, vi, beforeAll } from 'vitest';

const MARKER = 'BROWSER_MOCK_MARKER_9876';
const captured = vi.hoisted(() => ({ launchOpts: [], gotoCalls: [] }));

// Universal auto-proxy: absorbs any property access / call, but is NOT thenable.
const auto = new Proxy(function () {}, {
  get: (t, p) => (p === 'then' || p === 'catch' || p === 'finally' ? undefined : auto),
  apply: () => auto,
});

const richEvaluateResult = {
  consistent: true,
  checks: [],
  words: 400,
  images: 3,
  links: [{ href: 'http://127.0.0.1:4555/other', text: 'other page' }],
  title: 'local test',
  href: 'http://127.0.0.1:4555/page',
};

function makeFakePage() {
  const explicit = {
    goto: async (url, opts) => {
      captured.gotoCalls.push({ url, opts });
      return { status: () => 200, headers: () => ({}) };
    },
    content: async () => `<html><body><h1>${MARKER}</h1></body></html>`,
    evaluate: async () => richEvaluateResult,
    evaluateHandle: async () => auto,
    $: async () => null,
    $$: async () => [],
    click: async () => {},
    screenshot: async () => Buffer.from(''),
    setUserAgent: async () => {},
    setViewport: async () => {},
    setExtraHTTPHeaders: async () => {},
    evaluateOnNewDocument: async () => {},
    authenticate: async () => {},
    createCDPSession: async () => ({ send: async () => {}, detach: async () => {} }),
    waitForNavigation: async () => null,
    url: () => 'http://127.0.0.1:4555/page',
    mouse: auto,
    keyboard: auto,
    viewport: async () => ({ width: 1366, height: 768 }),
  };
  return new Proxy(explicit, {
    get: (t, p) => {
      if (p === 'then' || p === 'catch' || p === 'finally') return undefined; // not thenable
      return p in t ? t[p] : async () => auto;
    },
  });
}

vi.mock('puppeteer', () => {
  const launch = async (opts) => {
    captured.launchOpts.push(opts);
    const page = makeFakePage();
    const context = {
      newPage: async () => page,
      setCookie: async () => {},
      close: async () => {},
    };
    return {
      createBrowserContext: async () => context,
      close: async () => {},
      version: async () => '125.0.0.0',
    };
  };
  return { default: { launch }, launch };
});

let runBrowserVisit, isBrowserModeAvailable, clampDwellMs;

beforeAll(async () => {
  const mod = await import('../../core/browser-mode.js');
  runBrowserVisit = mod.runBrowserVisit;
  isBrowserModeAvailable = mod.isBrowserModeAvailable;
  clampDwellMs = mod.clampDwellMs;
});

const baseProxy = {
  host: '127.0.0.1', port: 4557, type: 'http',
  username: null, password: null,
};

describe('runBrowserVisit (mocked puppeteer)', () => {
  it('launches with the proxy scheme, executablePath, and a floored nav timeout; returns status+body', async () => {
    const out = await runBrowserVisit({
      proxy: baseProxy,
      url: 'http://127.0.0.1:4555/page',
      userAgent: 'Mozilla/5.0 TestAgent',
      timeout: 3000, // engine requestTimeout — must NOT be used as nav timeout
      headless: true,
    });

    expect(out.success).toBe(true);
    expect(out.statusCode).toBe(200);
    expect(out.error).toBeNull();

    const opts = captured.launchOpts.at(-1);
    expect(opts.executablePath).toBe('/tmp/fake-chrome-for-test');
    expect(opts.headless).toBe('new');
    expect(opts.args).toContain('--proxy-server=http://127.0.0.1:4557');
    expect(opts.args).not.toContain('--disable-web-security');

    const nav = captured.gotoCalls.at(-1);
    expect(nav.url).toBe('http://127.0.0.1:4555/page');
    expect(nav.opts.timeout).toBeGreaterThanOrEqual(30000); // floored despite timeout:3000
  }, 30000);

  it('uses the socks5 scheme for socks5 proxies (per-proxy type honored)', async () => {
    const out = await runBrowserVisit({
      proxy: { ...baseProxy, type: 'socks5', port: 1080 },
      url: 'http://127.0.0.1:4555/page',
      timeout: 30000,
      headless: true,
    });
    expect(out.success).toBe(true);
    const opts = captured.launchOpts.at(-1);
    expect(opts.args).toContain('--proxy-server=socks5://127.0.0.1:1080');
  }, 30000);

  it('headed mode passes headless:false (and would fall back on launch failure)', async () => {
    const out = await runBrowserVisit({
      proxy: baseProxy,
      url: 'http://127.0.0.1:4555/page',
      timeout: 30000,
      headless: false,
    });
    expect(out.success).toBe(true);
    expect(captured.launchOpts.at(-1).headless).toBe(false);
  }, 30000);
});

describe('isBrowserModeAvailable', () => {
  it('returns { available, reason }', () => {
    const r = isBrowserModeAvailable();
    expect(typeof r.available).toBe('boolean');
    expect(typeof r.reason).toBe('string');
    // puppeteer is installed in this repo's server node_modules (optional dep),
    // and PUPPETEER_EXECUTABLE_PATH is set above -> available with that reason.
    expect(r.available).toBe(true);
    expect(r.reason).toContain('/tmp/fake-chrome-for-test');
  });
});

describe('clampDwellMs', () => {
  it('clamps into [minS, maxS] seconds (env overridden to 0 for tests)', () => {
    expect(clampDwellMs(5 * 60 * 1000, 20, 90)).toBe(90 * 1000);
    expect(clampDwellMs(5 * 1000, 20, 90)).toBe(20 * 1000);
    expect(clampDwellMs(45 * 1000, 20, 90)).toBe(45 * 1000);
    expect(clampDwellMs(60 * 1000, 0, 0)).toBe(0);
  });
});
