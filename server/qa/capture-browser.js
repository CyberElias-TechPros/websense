// ============================================================================
// qa/capture-browser.js — Optional rendered capture for QA cells (Puppeteer).
//
// Deliberately PLAIN puppeteer: this QA tool emulates device form factors to
// observe what your own site serves — it does NOT use stealth plugins, does
// NOT hide navigator.webdriver, does NOT spoof fingerprints. Because you own
// the properties under test, detection avoidance is unnecessary: whitelist
// the X-Websense-QA header (or the runner IPs) in your WAF/analytics instead.
//
// Browser mode is optional and degrades gracefully: without Chrome, cells are
// marked 'unavailable' and the HTTP capture path still answers most geo/device
// questions.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { normalizeText, contentHash } from './compare.js';
import { analyzeCell, QA_CLASS } from './signals.js';
import logger from '../utils/logger.js';

/** Is a usable Chromium available without downloading anything? */
export function isBrowserCaptureAvailable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return { available: true, reason: `executable: ${envPath}` };
  try {
    const home = process.env.HOME || '/home/user';
    const cache = path.join(home, '.cache', 'puppeteer');
    if (fs.existsSync(cache) && fs.readdirSync(cache).length > 0) {
      return { available: true, reason: 'puppeteer cache present' };
    }
  } catch { /* noop */ }
  return {
    available: false,
    reason:
      'no Chrome found — set PUPPETEER_EXECUTABLE_PATH / CHROME_PATH or install Chrome ' +
      '(npm i puppeteer downloads it where storage.googleapis.com is reachable). HTTP capture still works.',
  };
}

async function loadPuppeteer() {
  const mod = await import('puppeteer');
  return mod.default || mod;
}

/** proxy descriptor → Chrome --proxy-server flag value (scheme from type). */
export function chromeProxyArg(proxy) {
  if (!proxy) return null;
  const type = String(proxy.type || 'http').toLowerCase();
  const scheme = type.startsWith('socks') ? (type === 'socks4' ? 'socks4' : 'socks5') : 'http';
  return `${scheme}://${proxy.host}:${proxy.port}`;
}

/**
 * Capture one URL in browser mode (rendered DOM + screenshot).
 * Signature mirrors captureHttp so the runner can treat modes uniformly.
 */
export async function captureBrowser({
  url,
  deviceProfile,
  proxy = null,
  acceptLanguage = 'en-US,en;q=0.9',
  extraHeaders = {},
  runId = '',
  identifyHeader = true,
  timeoutMs = 45000,
  screenshotDir = '',
  cellKey = 'cell',
}) {
  const started = Date.now();
  const navTimeout = Math.max(30000, timeoutMs); // page loads through proxies need headroom
  let browser = null;

  const unavailable = (reason) => ({
    requestedUrl: url, finalUrl: url, statusCode: null, headers: {}, title: '',
    text: '', normalized: '', contentHash: '', textSample: '', redirectChain: [],
    durationMs: Date.now() - started, error: 'browser-unavailable', errorMessage: reason,
    classification: QA_CLASS.UNAVAILABLE,
    signals: [], geoBlocked: false, deviceBlocked: false, redirectLoop: false,
    screenshotPath: null, consoleErrors: 0, failedRequests: 0,
  });

  try {
    const puppeteer = await loadPuppeteer();
    const proxyArg = chromeProxyArg(proxy);
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined;

    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        ...(proxyArg ? [`--proxy-server=${proxyArg}`] : []),
      ],
    });

    const page = await browser.newPage();

    // Proxy credentials: Chrome can't take them in --proxy-server.
    if (proxy && proxy.username) {
      await page.authenticate({ username: proxy.username, password: proxy.password || '' });
    }

    // Declared device emulation: real UA + viewport + touch, nothing hidden.
    await page.emulate({
      viewport: deviceProfile.viewport,
      userAgent: deviceProfile.userAgent,
    });
    await page.setExtraHTTPHeaders({
      'Accept-Language': acceptLanguage,
      ...(identifyHeader && runId ? { 'X-Websense-QA': `run:${runId}` } : {}),
      ...extraHeaders,
    });

    let consoleErrors = 0;
    let failedRequests = 0;
    const redirectChain = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors++; });
    page.on('requestfailed', () => { failedRequests++; });
    page.on('response', (r) => {
      if (r.request().isNavigationRequest() && [301, 302, 303, 307, 308].includes(r.status())) {
        redirectChain.push({ url: r.url(), status: r.status(), location: r.headers()?.location || null });
      }
    });

    let resp = null;
    try {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      // Give client-rendered content a moment, capped — this is QA, not browsing.
      await page.waitForNetworkIdle({ idleTime: 700, timeout: 8000 }).catch(() => {});
    } catch (navErr) {
      return {
        requestedUrl: url, finalUrl: page.url() || url, statusCode: resp?.status() ?? null,
        headers: {}, title: '', text: '', normalized: '', contentHash: '', textSample: '',
        redirectChain, durationMs: Date.now() - started,
        error: /timeout/i.test(navErr.message) ? 'timeout' : 'navigation-failed',
        errorMessage: navErr.message.slice(0, 300),
        classification: QA_CLASS.NETWORK_ERROR,
        signals: [], geoBlocked: false, deviceBlocked: false, redirectLoop: false,
        screenshotPath: null, consoleErrors, failedRequests,
      };
    }

    const title = (await page.title()).slice(0, 300);
    const text = await page.evaluate(() => (document.body?.innerText || '').slice(0, 30000));
    const normalized = normalizeText(text);
    const hash = contentHash(normalized);

    let screenshotPath = null;
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      screenshotPath = path.join(screenshotDir, `${cellKey}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    const statusCode = resp?.status() ?? null;
    const respHeaders = {};
    for (const [k, v] of Object.entries(resp?.headers?.() || {})) {
      if (/^(content-type|content-language|server|location|cf-|x-cache)/i.test(k)) respHeaders[k] = String(v).slice(0, 500);
    }

    const analysis = analyzeCell({
      statusCode, title, text: normalized, redirectChain,
      requestedUrl: url, finalUrl: page.url() || url, headers: respHeaders,
      deviceType: deviceProfile.type,
    });

    return {
      requestedUrl: url,
      finalUrl: page.url() || url,
      statusCode,
      headers: respHeaders,
      title,
      text: '',
      normalized,
      contentHash: hash,
      textSample: normalized.slice(0, 2000),
      redirectChain,
      durationMs: Date.now() - started,
      error: null,
      errorMessage: null,
      classification: QA_CLASS.PENDING,
      ...analysis,
      screenshotPath,
      consoleErrors,
      failedRequests,
      userAgent: deviceProfile.userAgent,
      acceptLanguage,
      viewportW: deviceProfile.viewport?.width ?? null,
    };
  } catch (err) {
    if (/Could not find Chrome|puppeteer.*not.*install|Cannot find package 'puppeteer'/i.test(String(err?.message || err))) {
      logger.warn(`QA browser capture unavailable: ${err.message}`);
      return unavailable(String(err.message).slice(0, 250));
    }
    return {
      requestedUrl: url, finalUrl: url, statusCode: null, headers: {}, title: '',
      text: '', normalized: '', contentHash: '', textSample: '', redirectChain: [],
      durationMs: Date.now() - started, error: 'browser-error',
      errorMessage: String(err?.message || err).slice(0, 300),
      classification: QA_CLASS.NETWORK_ERROR,
      signals: [], geoBlocked: false, deviceBlocked: false, redirectLoop: false,
      screenshotPath: null, consoleErrors: 0, failedRequests: 0,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export default captureBrowser;
