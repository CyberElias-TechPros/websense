// ============================================================================
// browser-mode.js — Full browser rendering engine via Puppeteer + stealth.
// Features:
//   • Comprehensive stealth: CDP protection, WebDriver detection, window.chrome,
//     canvas/WebGL/audio fingerprint randomization, plugins, mimeTypes,
//     permissions, WebRTC leak prevention, proper timezone spoofing
//   • Browser fingerprint consistency: UA ↔ clientHints ↔ WebGL ↔ screen ↔ platform
//   • Human behavior simulation (scroll, dwell, mouse curves, clicks, typing)
//   • Session persistence (cookies, localStorage across visits)
//   • Resource loading control
//   • Screenshot capture for verification
//   • Analytics injection (GA4, Clarity, Pixel)
//   • CAPTCHA detection & solving
//   • Content verification
//   • Network condition simulation
//   • Memory management (close pages, recycle browsers)
// ============================================================================

import logger from '../utils/logger.js';
import {
  getRandomFingerprint, getClientHintsHeaders, getPlugins, getMimeTypes,
  getAcceptEncoding, getTimezoneForProfile,
} from './user-agents.js';

let puppeteerModule = null;
let stealthPlugin = null;
let puppeteerLoadError = null;

async function loadPuppeteer() {
  if (puppeteerModule) return puppeteerModule;
  if (puppeteerLoadError) return null;
  try {
    puppeteerModule = await import('puppeteer');
    return puppeteerModule;
  } catch (err) {
    puppeteerLoadError = err;
    logger.warn(
      'Puppeteer not available — browser mode disabled. Install it with `npm i puppeteer` or use HTTP mode.'
    );
    return null;
  }
}

async function loadStealth() {
  if (stealthPlugin) return stealthPlugin;
  try {
    stealthPlugin = await import('puppeteer-extra-plugin-stealth');
    return stealthPlugin;
  } catch {
    logger.warn('Stealth plugin not available — using custom stealth patches.');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Seedable random (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Human behavior simulation
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

<<<<<<< HEAD
// Extract page demographics once — reused by the behavior director (AI plan)
// and by the dwell simulation.
async function getPageStats(page) {
  return page.evaluate(() => ({
    title: document.title || '',
    contentLength: document.body?.innerText?.length || 0,
    headings: document.querySelectorAll('h1, h2, h3').length,
    images: document.querySelectorAll('img').length,
    links: document.querySelectorAll('a').length,
    paragraphs: document.querySelectorAll('p').length,
    words: document.body?.innerText?.split(/\s+/).filter(w => w.length > 0).length || 0,
    hasVideo: document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0,
  })).catch(() => ({ title: '', words: 0, links: 0, images: 0, hasVideo: false }));
}

async function simulateScroll(page, totalSteps = 6, plan = null) {
  const current = await page.evaluate(() => window.scrollY);
  const maxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  const depth = clampNum(plan?.scroll?.depth, 0.15, 1.0, 0.55);
  const target = Math.floor(maxScroll * (0.15 + Math.random() * 0.2 + depth * 0.65));
=======
async function simulateScroll(page, totalSteps = 6) {
  const current = await page.evaluate(() => window.scrollY);
  const maxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  const target = Math.floor(maxScroll * (0.3 + Math.random() * 0.6));
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
  const steps = Math.floor(target / 100) || 1;

  // Acceleration/deceleration: fast in middle, slow at edges
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

<<<<<<< HEAD
  for (let i = 0; i < Math.min(steps, Math.max(1, totalSteps)); i++) {
    const progress = (i + 1) / Math.min(steps, Math.max(1, totalSteps));
=======
  for (let i = 0; i < Math.min(steps, totalSteps); i++) {
    const progress = (i + 1) / Math.min(steps, totalSteps);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    const easedProgress = easeInOut(progress);
    const y = current + Math.floor((target - current) * easedProgress);
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await sleep(150 + Math.random() * 400);
    if (Math.random() < 0.15) await sleep(300 + Math.random() * 800);
  }

  // Sometimes scroll back up slightly (users often re-read)
<<<<<<< HEAD
  if (Math.random() < 0.2 + 0.2 * clampNum(plan?.hover?.intensity, 0.1, 1.0, 0.5)) {
=======
  if (Math.random() < 0.2) {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    const backTarget = Math.floor(target * 0.7);
    await page.evaluate((y) => window.scrollTo(0, y), backTarget);
    await sleep(200 + Math.random() * 400);
  }
}

<<<<<<< HEAD
// Tiny local clamp (avoids importing the director's helpers)
function clampNum(v, lo, hi, fallback) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
async function simulateMouse(page) {
  const startX = Math.random() * 400;
  const startY = Math.random() * 300;
  for (let i = 0; i < 4; i++) {
    const x = startX + Math.random() * 600 - 300;
    const y = startY + Math.random() * 400 - 200;
    await page.mouse.move(Math.max(0, x), Math.max(0, y), { steps: 5 + Math.floor(Math.random() * 10) });
    await sleep(100 + Math.random() * 300);
  }
}

// Bezier curve mouse movement for natural trajectories
function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return Math.round(mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3);
}

async function simulateMouseBezier(page, startX, startY, endX, endY) {
  const cp1x = startX + (Math.random() * 200 - 100);
  const cp1y = startY + (Math.random() * 200 - 100);
  const cp2x = endX + (Math.random() * 200 - 100);
  const cp2y = endY + (Math.random() * 200 - 100);
  const steps = 20 + Math.floor(Math.random() * 15);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bezierPoint(startX, cp1x, cp2x, endX, t);
    const y = bezierPoint(startY, cp1y, cp2y, endY, t);
    await page.mouse.move(x, y);
    await sleep(2 + Math.random() * 8);
  }
}

async function simulateClick(page, selector) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    const box = await el.boundingBox();
    if (!box) return false;
    const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
    const y = box.y + box.height / 2 + (Math.random() * 10 - 5);
    await simulateMouseBezier(page, 100 + Math.random() * 200, 100 + Math.random() * 200, x, y);
    await sleep(50 + Math.random() * 100);
    await page.mouse.click(x, y);
    return true;
  } catch {
    return false;
  }
}

<<<<<<< HEAD
async function simulateDwell(page, minMs = 2000, maxMs = 8000, plan = null) {
  const pageData = await getPageStats(page);
=======
async function simulateDwell(page, minMs = 2000, maxMs = 8000) {
  const pageData = await page.evaluate(() => {
    return {
      contentLength: document.body?.innerText?.length || 0,
      headings: document.querySelectorAll('h1, h2, h3').length,
      images: document.querySelectorAll('img').length,
      links: document.querySelectorAll('a').length,
      paragraphs: document.querySelectorAll('p').length,
      words: document.body?.innerText?.split(/\s+/).filter(w => w.length > 0).length || 0,
    };
  });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

  // Base dwell time scales with content complexity
  const wordFactor = Math.min(pageData.words / 500, 3);
  const imageFactor = Math.min(pageData.images / 10, 1);
  const linkFactor = Math.min(pageData.links / 20, 1);

<<<<<<< HEAD
  // Realistic dwell: users spend more time on content-heavy pages.
  // The behavior plan scales this like a real persona would (a
  // 'quick_bouncer' leaves fast; a 'content_reader' lingers).
  const dwellScale = clampNum(plan?.dwellScale, 0.3, 3.0, 1.0);
  const baseDwell = (minMs + Math.random() * (maxMs * (1 + wordFactor * 0.5))) * dwellScale;
=======
  // Realistic dwell: users spend more time on content-heavy pages
  const baseDwell = minMs + Math.random() * (maxMs * (1 + wordFactor * 0.5));
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
  const dwell = baseDwell + (imageFactor * 500) + (linkFactor * 200);

  await sleep(dwell);
}

// Content-aware mouse movement: move towards interesting elements
<<<<<<< HEAD
async function simulateContentMouse(page, plan = null) {
  // Hover intensity from the behavior plan: how many elements we explore and
  // how often we hover purposefully before moving on.
  const intensity = clampNum(plan?.hover?.intensity, 0.1, 1.0, 0.5);
  const maxTargets = Math.max(1, Math.round(1 + intensity * 4)); // 1..5 targets
  const elements = await page.evaluate(() => {
    const interesting = document.querySelectorAll('a, button, input, [role="button"], .btn, .card, [class*="hero"], [class*="feature"]');
    return Array.from(interesting).slice(0, 6).map(el => {
=======
async function simulateContentMouse(page) {
  const elements = await page.evaluate(() => {
    const interesting = document.querySelectorAll('a, button, input, [role="button"], .btn, .card, [class*="hero"], [class*="feature"]');
    return Array.from(interesting).slice(0, 5).map(el => {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        tag: el.tagName,
        text: el.innerText?.slice(0, 50) || '',
      };
    }).filter(e => e.x > 0 && e.y > 0);
  });

  if (elements.length === 0) {
    return simulateMouse(page);
  }

  // Move towards interesting elements with bezier curves
<<<<<<< HEAD
  for (let i = 0; i < Math.min(elements.length, maxTargets); i++) {
=======
  for (let i = 0; i < Math.min(elements.length, 3); i++) {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    const el = elements[i];
    const startX = 100 + Math.random() * 200;
    const startY = 100 + Math.random() * 200;
    await simulateMouseBezier(page, startX, startY, el.x, el.y);
    await sleep(100 + Math.random() * 300);
<<<<<<< HEAD
    // Hover without clicking — high-intensity personas read hover states
    if (Math.random() < 0.2 + intensity * 0.5) {
=======
    // Sometimes hover without clicking
    if (Math.random() < 0.3) {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      await sleep(200 + Math.random() * 500);
    }
  }
}

<<<<<<< HEAD
/**
 * Click-through: with `clickIntent` probability, follow a visible SAME-ORIGIN
 * link the way a real user would (bezier approach → click → land on the
 * destination → brief dwell). Staying same-origin keeps verification honest —
 * it's the same site the visit is meant to read.
 */
async function clickSameOriginLink(page) {
  try {
    const base = page.url();
    if (!base.startsWith('http')) return false;
    const target = await page.evaluate((baseHref) => {
      const links = Array.from(document.querySelectorAll('a')).filter((a) => {
        try {
          const u = new URL(a.href, baseHref);
          if (!u.origin || u.origin !== new URL(baseHref).origin) return false;
          const r = a.getBoundingClientRect();
          return r.width > 8 && r.height > 8 && r.x >= 0 && r.y >= 0 && r.y < window.innerHeight && !a.download;
        } catch { return false; }
      }).map((a) => a.href);
      if (!links.length) return null;
      return links[Math.floor(Math.random() * Math.min(links.length, 30))];
    }, base).catch(() => null);
    if (!target) return false;

    // Bezier approach to the element then click (never page.click — real
    // pointer paths leave traceable event streams)
    const handle = await page.evaluateHandle(
      (href) => Array.from(document.querySelectorAll('a')).find((a) => a.href === href) || null,
      target
    );
    const el = handle.asElement();
    if (!el) return false;
    const box = await el.boundingBox().catch(() => null);
    if (!box) return false;
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.4 + Math.random() * 0.2);
    // If the element is below the fold, scroll it into view first
    if (box.y > 800 || box.y < 0) {
      await page.evaluate((t) => document.querySelector(`a[href="${t}"]`)?.scrollIntoView({ block: 'center' }), target).catch(() => {});
      await sleep(300 + Math.random() * 400);
    }
    await simulateMouseBezier(page, 100 + Math.random() * 200, 200 + Math.random() * 200, x, y);
    await sleep(60 + Math.random() * 120);
    await page.mouse.click(x, y);

    // Wait for the destination page (2.5s cap — clicks may be intercepted by
    // consent overlays or do nothing; both are fine, we just continue)
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
      sleep(2500),
    ]);
    // Dwell on the destination like a user who chose to go there
    await sleep(1200 + Math.random() * 2800);
    return true;
  } catch {
    return false;
  }
}

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
// Typing simulation with variable speed and typos
async function simulateTyping(page, selector, text) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    await el.click();
    await sleep(100 + Math.random() * 200);

    // Type with realistic timing
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      // 10% chance of typo
      if (Math.random() < 0.1 && char.match(/[a-z]/)) {
        const typo = String.fromCharCode(char.charCodeAt(0) + Math.floor(Math.random() * 3 - 1));
        await page.keyboard.type(typo);
        await sleep(150 + Math.random() * 300);
        await page.keyboard.press('Backspace');
        await sleep(100 + Math.random() * 200);
      }
      await page.keyboard.type(char);
      // Variable typing speed
      const delay = 50 + Math.random() * 150 + (Math.random() < 0.05 ? 500 : 0); // occasional pause
      await sleep(delay);
    }
    return true;
  } catch {
    return false;
  }
}

// Page visibility handling (simulate user switching tabs)
async function simulatePageVisibility(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    });
  });
}

// Sophisticated timing randomization for all interactions
function getRandomDelay(base, variance, jitter = 0.1) {
  return base + Math.random() * variance + (Math.random() - 0.5) * base * jitter;
}

// Human-like pause pattern: short pauses, occasional longer breaks
function getHumanPause() {
  const rand = Math.random();
  if (rand < 0.6) return 50 + Math.random() * 150;       // 50-200ms (common)
  if (rand < 0.85) return 200 + Math.random() * 300;     // 200-500ms (thinking)
  if (rand < 0.95) return 500 + Math.random() * 1000;    // 500-1500ms (reading)
  return 1500 + Math.random() * 3000;                     // 1500-4500ms (distraction)
}

// Sophisticated scroll velocity calculation
function getScrollVelocity(progress, maxScroll) {
  // Ease-in-out: slow at start and end, fast in middle
  const eased = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  return Math.max(1, Math.floor(maxScroll * eased * 0.1));
}

// Comprehensive form interaction simulation
async function simulateFormInteraction(page) {
  try {
    const formData = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, select');
      return Array.from(inputs).slice(0, 5).map(el => ({
        tag: el.tagName,
        type: el.type || 'text',
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        required: el.required,
        value: el.value,
      })).filter(el => el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button');
    });

    if (formData.length === 0) return { interacted: false, fields: 0 };

    const interacted = [];
    for (const field of formData) {
      try {
        let selector = field.id ? `#${field.id}` : field.name ? `[name="${field.name}"]` : `input[type="${field.type}"]`;
        const el = await page.$(selector);
        if (!el) continue;

        await el.click();
        await sleep(getRandomDelay(100, 200));

        // Generate realistic form data based on field type
        let text = '';
        if (field.type === 'email') {
          text = `user${Math.floor(Math.random() * 10000)}@example.com`;
        } else if (field.type === 'tel') {
          text = `+1${Math.floor(Math.random() * 1000000000)}`;
        } else if (field.type === 'number') {
          text = String(Math.floor(Math.random() * 100));
        } else if (field.type === 'password') {
          text = `P@ssw0rd${Math.floor(Math.random() * 1000)}`;
        } else if (field.type === 'search') {
          text = ['games', 'casino', 'news', 'weather', 'sports'][Math.floor(Math.random() * 5)];
        } else {
          text = ['John', 'Jane', 'Smith', 'Doe', 'Test'][Math.floor(Math.random() * 5)];
        }

        await page.keyboard.type(text);
        await sleep(getRandomDelay(100, 300));
        interacted.push({ field: field.name || field.id, value: text });
      } catch {
        // Field interaction failed, continue with next
      }
    }

    return { interacted: interacted.length > 0, fields: interacted.length, data: interacted };
  } catch (err) {
    return { interacted: false, fields: 0, error: err.message };
  }
}

// Sophisticated tab switching simulation
async function simulateTabSwitch(page, duration = 1000) {
  try {
    // Simulate user switching to another tab and coming back
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });
    await sleep(duration + Math.random() * duration);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await sleep(getRandomDelay(200, 500));
  } catch {
    // Tab switch simulation failed
  }
}

// Verify fingerprint consistency across all spoofed APIs
<<<<<<< HEAD
/**
 * Build a CDP UserAgentMetadata that matches the fingerprint profile.
 * Chrome populates navigator.userAgentData from an internal UA-CH record —
 * NOT from the UA string. page.setUserAgent() (and puppeteer's UA override)
 * leaves brands=[] / platform='', which fingerprint scripts treat as an
 * automation tell. This constructs the record Chrome would generate.
 */
function buildUserAgentMetadata(profile) {
  const hint = profile.clientHints || {};
  const ua = profile.ua || '';
  const isMobile = !!profile.isMobile;
  // UA-CH platform value, derived from navigator.platform when the profile
  // ships no explicit clientHints (Firefox/older profiles).
  const UA_CH_PLATFORM = {
    Win32: 'Windows', MacIntel: 'macOS', 'Linux x86_64': 'Linux',
    'Linux armv8l': 'Android', iPhone: 'iOS', iPad: 'iOS',
  };
  const platform = hint.platform || UA_CH_PLATFORM[profile.platform] || 'Windows';
  const major = String(profile.version || '0').split('.')[0];

  let platformVersion = '';
  let m = ua.match(/Windows NT (\d+)\.(\d+)/);
  if (m) platformVersion = `${m[1]}.${m[2]}.0`;
  m = m || ua.match(/Intel Mac OS X (\d+)_(\d+)(?:_(\d+))?/);
  if (m) platformVersion = `${m[1]}.${m[2]}.${m[3] || '0'}`;
  m = m || ua.match(/Android (\d+)/);
  if (m) platformVersion = `${m[1]}.0.0`;
  if (!platformVersion && platform === 'Linux') platformVersion = '5.15.0';

  const brands = (Array.isArray(hint.brands) && hint.brands.length
    ? hint.brands
    : [
        { brand: 'Google Chrome', version: major },
        { brand: 'Chromium', version: major },
        { brand: 'Not_A Brand', version: '24' },
      ]
  ).map((b) => ({ brand: b.brand, version: String(b.version) }));

  return {
    brands,
    fullVersion: profile.version || null,
    platform,
    platformVersion,
    architecture: /x86_64/.test(ua) ? 'x86' : isMobile ? 'arm' : 'x86',
    model: profile.model || '',
    mobile: isMobile,
    bitness: '64',
    wow64: false,
  };
}

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
async function verifyFingerprintConsistency(page, profile) {
  try {
    const checks = await page.evaluate(async (fp) => {
      const results = { consistent: true, checks: [] };

<<<<<<< HEAD
      // 1. navigator.webdriver — THE automation flag, always critical
      const webdriver = navigator.webdriver;
      results.checks.push({ name: 'webdriver', value: webdriver, expected: false, consistent: webdriver === false, critical: true });
      if (webdriver !== false) results.consistent = false;

      // 2. navigator.platform — identity mismatch is detectable
      const platform = navigator.platform;
      results.checks.push({ name: 'platform', value: platform, expected: fp.platform, consistent: platform === fp.platform, critical: true });
=======
      // 1. navigator.webdriver
      const webdriver = navigator.webdriver;
      results.checks.push({ name: 'webdriver', value: webdriver, expected: false, consistent: webdriver === false });
      if (webdriver !== false) results.consistent = false;

      // 2. navigator.platform
      const platform = navigator.platform;
      results.checks.push({ name: 'platform', value: platform, expected: fp.platform, consistent: platform === fp.platform });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (platform !== fp.platform) results.consistent = false;

      // 3. navigator.languages
      const languages = navigator.languages;
      const expectedLang = fp.locale;
<<<<<<< HEAD
      results.checks.push({ name: 'languages', value: languages, expected: [expectedLang], consistent: languages && languages[0] === expectedLang, critical: true });
=======
      results.checks.push({ name: 'languages', value: languages, expected: [expectedLang], consistent: languages && languages[0] === expectedLang });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (!languages || languages[0] !== expectedLang) results.consistent = false;

      // 4. navigator.hardwareConcurrency
      const hwConcurrency = navigator.hardwareConcurrency;
<<<<<<< HEAD
      results.checks.push({ name: 'hardwareConcurrency', value: hwConcurrency, expected: fp.hardwareConcurrency, consistent: hwConcurrency === fp.hardwareConcurrency, critical: true });
=======
      results.checks.push({ name: 'hardwareConcurrency', value: hwConcurrency, expected: fp.hardwareConcurrency, consistent: hwConcurrency === fp.hardwareConcurrency });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (hwConcurrency !== fp.hardwareConcurrency) results.consistent = false;

      // 5. navigator.deviceMemory
      const deviceMemory = navigator.deviceMemory;
<<<<<<< HEAD
      results.checks.push({ name: 'deviceMemory', value: deviceMemory, expected: fp.deviceMemory, consistent: deviceMemory === fp.deviceMemory, critical: true });
=======
      results.checks.push({ name: 'deviceMemory', value: deviceMemory, expected: fp.deviceMemory, consistent: deviceMemory === fp.deviceMemory });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (deviceMemory !== fp.deviceMemory) results.consistent = false;

      // 6. screen dimensions
      const screenW = screen.width;
      const screenH = screen.height;
<<<<<<< HEAD
      results.checks.push({ name: 'screen', value: `${screenW}x${screenH}`, expected: `${fp.screen.w}x${fp.screen.h}`, consistent: screenW === fp.screen.w && screenH === fp.screen.h, critical: true });
=======
      results.checks.push({ name: 'screen', value: `${screenW}x${screenH}`, expected: `${fp.screen.w}x${fp.screen.h}`, consistent: screenW === fp.screen.w && screenH === fp.screen.h });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (screenW !== fp.screen.w || screenH !== fp.screen.h) results.consistent = false;

      // 7. window dimensions
      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
<<<<<<< HEAD
      results.checks.push({ name: 'window', value: `${innerW}x${innerH}`, expected: `${fp.screen.w}x${fp.screen.h}`, consistent: innerW === fp.screen.w && innerH === fp.screen.h, critical: true });
=======
      results.checks.push({ name: 'window', value: `${innerW}x${innerH}`, expected: `${fp.screen.w}x${fp.screen.h}`, consistent: innerW === fp.screen.w && innerH === fp.screen.h });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (innerW !== fp.screen.w || innerH !== fp.screen.h) results.consistent = false;

      // 8. timezone
      const tzOffset = new Date().getTimezoneOffset();
      results.checks.push({ name: 'timezoneOffset', value: tzOffset, expected: 'set', consistent: typeof tzOffset === 'number' });

      // 9. window.chrome
      const hasChrome = typeof window.chrome !== 'undefined';
      results.checks.push({ name: 'window.chrome', value: hasChrome, expected: true, consistent: hasChrome });
      if (!hasChrome) results.consistent = false;

      // 10. plugins
      const pluginCount = navigator.plugins ? navigator.plugins.length : 0;
<<<<<<< HEAD
      results.checks.push({ name: 'plugins', value: pluginCount, expected: '>0', consistent: pluginCount > 0, critical: true });
=======
      results.checks.push({ name: 'plugins', value: pluginCount, expected: '>0', consistent: pluginCount > 0 });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (pluginCount === 0) results.consistent = false;

      // 11. mimeTypes
      const mimeCount = navigator.mimeTypes ? navigator.mimeTypes.length : 0;
<<<<<<< HEAD
      results.checks.push({ name: 'mimeTypes', value: mimeCount, expected: '>0', consistent: mimeCount > 0, critical: true });
=======
      results.checks.push({ name: 'mimeTypes', value: mimeCount, expected: '>0', consistent: mimeCount > 0 });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (mimeCount === 0) results.consistent = false;

      // 12. WebGL renderer/vendor
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const renderer = gl.getParameter(gl.RENDERER);
          const vendor = gl.getParameter(gl.VENDOR);
<<<<<<< HEAD
          results.checks.push({ name: 'webgl', value: { renderer, vendor }, expected: 'set', consistent: !!renderer && !!vendor, critical: true });
          if (!renderer || !vendor) results.consistent = false;
        }
      } catch (e) {
        results.checks.push({ name: 'webgl', value: 'error', expected: 'set', consistent: false, critical: true });
=======
          results.checks.push({ name: 'webgl', value: { renderer, vendor }, expected: 'set', consistent: !!renderer && !!vendor });
          if (!renderer || !vendor) results.consistent = false;
        }
      } catch (e) {
        results.checks.push({ name: 'webgl', value: 'error', expected: 'set', consistent: false });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
        results.consistent = false;
      }

      // 13. AudioContext
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const sampleRate = audioCtx.sampleRate;
        results.checks.push({ name: 'audioContext', value: { sampleRate }, expected: 'set', consistent: typeof sampleRate === 'number' });
        audioCtx.close();
      } catch (e) {
        results.checks.push({ name: 'audioContext', value: 'error', expected: 'set', consistent: false });
      }

<<<<<<< HEAD
      // 14. userAgentData (Chromium only)
      if (fp.browser === 'chrome' || fp.browser === 'edge') {
        const uad = navigator.userAgentData;
        const brands = uad ? uad.brands : [];
        const mobile = uad ? uad.mobile : null;
        const platform = uad ? uad.platform : '';
        results.checks.push({ name: 'userAgentData', value: { brands, mobile, platform }, expected: 'set', consistent: !!(uad && brands && brands.length && platform), critical: true });
        if (!uad || !brands || !brands.length || !platform) results.consistent = false;
      } else {
        // Real Firefox/Safari have NO navigator.userAgentData — its presence
        // under a Firefox/Safari UA string is itself a bot tell. Advisory
        // only (the stealth patch removes it when present).
        results.checks.push({ name: 'userAgentData', value: navigator.userAgentData ? 'present' : 'absent', expected: 'absent', consistent: !navigator.userAgentData });
=======
      // 14. userAgentData (Chrome only)
      if (navigator.userAgentData) {
        const brands = navigator.userAgentData.brands;
        const mobile = navigator.userAgentData.mobile;
        const platform = navigator.userAgentData.platform;
        results.checks.push({ name: 'userAgentData', value: { brands, mobile, platform }, expected: 'set', consistent: !!brands && !!platform });
        if (!brands || !platform) results.consistent = false;
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      }

      // 15. Battery API
      if (navigator.getBattery) {
        try {
          const battery = await navigator.getBattery();
          results.checks.push({ name: 'battery', value: { level: battery.level, charging: battery.charging }, expected: 'set', consistent: typeof battery.level === 'number' });
        } catch (e) {
          results.checks.push({ name: 'battery', value: 'error', expected: 'set', consistent: false });
        }
      }

      // 16. Storage API
      if (navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          results.checks.push({ name: 'storage', value: { quota: estimate.quota, usage: estimate.usage }, expected: 'set', consistent: typeof estimate.quota === 'number' });
        } catch (e) {
          results.checks.push({ name: 'storage', value: 'error', expected: 'set', consistent: false });
        }
      }

      // 17. Touch support
      const maxTouchPoints = navigator.maxTouchPoints;
<<<<<<< HEAD
      results.checks.push({ name: 'touchPoints', value: maxTouchPoints, expected: fp.isMobile ? '>0' : 0, consistent: fp.isMobile ? maxTouchPoints > 0 : maxTouchPoints === 0, critical: true });
=======
      results.checks.push({ name: 'touchPoints', value: maxTouchPoints, expected: fp.isMobile ? '>0' : 0, consistent: fp.isMobile ? maxTouchPoints > 0 : maxTouchPoints === 0 });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (fp.isMobile && maxTouchPoints === 0) results.consistent = false;
      if (!fp.isMobile && maxTouchPoints > 0) results.consistent = false;

      // 18. Notification permission
      if (typeof Notification !== 'undefined') {
        results.checks.push({ name: 'notificationPermission', value: Notification.permission, expected: 'denied', consistent: Notification.permission === 'denied' });
        if (Notification.permission !== 'denied') results.consistent = false;
      }

      // 19. Permissions API
      if (navigator.permissions) {
        try {
          const permissions = await navigator.permissions.query({ name: 'geolocation' });
          results.checks.push({ name: 'geolocationPermission', value: permissions.state, expected: 'prompt', consistent: permissions.state === 'prompt' });
        } catch (e) {
          results.checks.push({ name: 'geolocationPermission', value: 'error', expected: 'prompt', consistent: false });
        }
      }

      // 20. Clipboard API
      if (navigator.clipboard) {
        results.checks.push({ name: 'clipboard', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'clipboard', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 21. Geolocation API
      if (navigator.geolocation) {
        results.checks.push({ name: 'geolocation', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'geolocation', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 22. Performance API
      if (performance) {
        const perfEntries = performance.getEntriesByType('navigation');
        results.checks.push({ name: 'performance', value: { entries: perfEntries.length }, expected: '>0', consistent: perfEntries.length > 0 });
      }

      // 23. Memory API (Chrome)
      if (performance.memory) {
        results.checks.push({ name: 'memory', value: { used: performance.memory.usedJSHeapSize }, expected: 'set', consistent: typeof performance.memory.usedJSHeapSize === 'number' });
      }

      // 24. Intl API
      if (Intl) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        results.checks.push({ name: 'intl', value: { timeZone: tz }, expected: fp.timezone || 'set', consistent: !!tz });
      }

      // 25. window.chrome completeness
      const chromeChecks = [];
      if (window.chrome) {
        chromeChecks.push('runtime' in window.chrome);
        chromeChecks.push('app' in window.chrome);
        chromeChecks.push('csi' in window.chrome);
        chromeChecks.push('loadTimes' in window.chrome);
      }
      const chromeScore = chromeChecks.filter(Boolean).length / chromeChecks.length;
<<<<<<< HEAD
      results.checks.push({ name: 'chromeObject', value: { score: chromeScore, checks: chromeChecks }, expected: 1, consistent: chromeScore === 1, critical: true });
=======
      results.checks.push({ name: 'chromeObject', value: { score: chromeScore, checks: chromeChecks }, expected: 1, consistent: chromeScore === 1 });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      if (chromeScore < 1) results.consistent = false;

      // 26. Permissions completeness
      if (navigator.permissions) {
        const permissionChecks = ['geolocation', 'notifications', 'clipboard-read', 'clipboard-write', 'camera', 'microphone'];
        const results_perm = await Promise.all(permissionChecks.map(p =>
          navigator.permissions.query({ name: p }).then(r => r.state).catch(() => 'unsupported')
        ));
        results.checks.push({ name: 'permissions', value: results_perm, expected: 'set', consistent: true });
      }

      // 27. WebRTC leak check
      try {
        const hasWebRTC = typeof RTCPeerConnection !== 'undefined';
        results.checks.push({ name: 'webrtc', value: { available: hasWebRTC }, expected: 'available', consistent: true });
      } catch (e) {
        results.checks.push({ name: 'webrtc', value: 'error', expected: 'available', consistent: false });
      }

      // 28. Canvas fingerprint
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 280, 60);
        ctx.fillStyle = '#069';
        ctx.fillText('WebSense, <canvas>', 4, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('WebSense, <canvas>', 5, 17);
        const canvasData = canvas.toDataURL();
<<<<<<< HEAD
        results.checks.push({ name: 'canvasFingerprint', value: { length: canvasData.length }, expected: '>0', consistent: canvasData.length > 100, critical: true });
      } catch (e) {
        results.checks.push({ name: 'canvasFingerprint', value: 'error', expected: '>0', consistent: false, critical: true });
=======
        results.checks.push({ name: 'canvasFingerprint', value: { length: canvasData.length }, expected: '>0', consistent: canvasData.length > 100 });
      } catch (e) {
        results.checks.push({ name: 'canvasFingerprint', value: 'error', expected: '>0', consistent: false });
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      }

      // 29. MediaDevices API
      if (navigator.mediaDevices) {
        results.checks.push({ name: 'mediaDevices', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'mediaDevices', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 30. Contacts API
      if (navigator.contacts) {
        results.checks.push({ name: 'contacts', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'contacts', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 31. Screen orientation
      if (screen.orientation) {
        const orientation = screen.orientation.type;
        results.checks.push({ name: 'screenOrientation', value: orientation, expected: 'set', consistent: !!orientation });
      }

      // 32. Device orientation
      if (window.DeviceOrientationEvent) {
        results.checks.push({ name: 'deviceOrientation', value: 'available', expected: fp.isMobile ? 'available' : 'available', consistent: true });
      } else {
        results.checks.push({ name: 'deviceOrientation', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 33. CSS support check
      const cssSupport = {
        cssGrid: typeof CSS !== 'undefined' && CSS.supports && CSS.supports('display', 'grid'),
        cssFlex: typeof CSS !== 'undefined' && CSS.supports && CSS.supports('display', 'flex'),
        cssVariables: typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', 'var(--test)'),
      };
      results.checks.push({ name: 'cssSupport', value: cssSupport, expected: 'set', consistent: true });

      // 34. Speech synthesis
      if ('speechSynthesis' in window) {
        const voices = speechSynthesis.getVoices();
        results.checks.push({ name: 'speechSynthesis', value: { voices: voices.length }, expected: '>0', consistent: voices.length > 0 });
      } else {
        results.checks.push({ name: 'speechSynthesis', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 35. Crypto API
      if (window.crypto) {
        const hasGetRandomValues = typeof crypto.getRandomValues === 'function';
        results.checks.push({ name: 'crypto', value: { getRandomValues: hasGetRandomValues }, expected: true, consistent: hasGetRandomValues });
        if (!hasGetRandomValues) results.consistent = false;
      } else {
        results.checks.push({ name: 'crypto', value: 'unavailable', expected: true, consistent: false });
        results.consistent = false;
      }

      // 36. Lock API
      if ('locks' in navigator) {
        results.checks.push({ name: 'locks', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'locks', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 37. Push API
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        results.checks.push({ name: 'push', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'push', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 38. Background sync
      if ('serviceWorker' in navigator && 'BackgroundSyncManager' in window) {
        results.checks.push({ name: 'backgroundSync', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'backgroundSync', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 39. SharedWorker
      if ('SharedWorker' in window) {
        results.checks.push({ name: 'sharedWorker', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'sharedWorker', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 40. Bluetooth API
      if ('bluetooth' in navigator) {
        results.checks.push({ name: 'bluetooth', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'bluetooth', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 41. USB API
      if ('usb' in navigator) {
        results.checks.push({ name: 'usb', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'usb', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 42. Serial API
      if ('serial' in navigator) {
        results.checks.push({ name: 'serial', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'serial', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 43. HID API
      if ('hid' in navigator) {
        results.checks.push({ name: 'hid', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'hid', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 44. XR API
      if ('xr' in navigator) {
        results.checks.push({ name: 'xr', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'xr', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 45. Storage Manager
      if (navigator.storageManager) {
        results.checks.push({ name: 'storageManager', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'storageManager', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 46. Presentation API
      if (navigator.presentation) {
        results.checks.push({ name: 'presentation', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'presentation', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 47. Media Session API
      if ('mediaSession' in navigator) {
        results.checks.push({ name: 'mediaSession', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'mediaSession', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 48. Wake Lock API
      if ('wakeLock' in navigator) {
        results.checks.push({ name: 'wakeLock', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'wakeLock', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 49. Clipboard Read API
      if (navigator.clipboard && navigator.clipboard.read) {
        results.checks.push({ name: 'clipboardRead', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'clipboardRead', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 50. Clipboard Write API
      if (navigator.clipboard && navigator.clipboard.write) {
        results.checks.push({ name: 'clipboardWrite', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'clipboardWrite', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 51. Clipboard Service API
      if (navigator.clipboard && navigator.clipboard.hasReadPermission) {
        results.checks.push({ name: 'clipboardService', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'clipboardService', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 52. Screen Capture API
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        results.checks.push({ name: 'screenCapture', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'screenCapture', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 53. Clipboard Sanitizer API
      if (navigator.sanitizer) {
        results.checks.push({ name: 'clipboardSanitizer', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'clipboardSanitizer', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 54. Presentation Request API
      if (navigator.presentation && navigator.presentation.requestPresentation) {
        results.checks.push({ name: 'presentationRequest', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'presentationRequest', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 55. Device Posture API
      if (navigator.devicePosture) {
        results.checks.push({ name: 'devicePosture', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'devicePosture', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 56. Web Share API
      if (navigator.share) {
        results.checks.push({ name: 'webShare', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'webShare', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 57. Web Share Target API
      if (navigator.canShare) {
        results.checks.push({ name: 'webShareTarget', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'webShareTarget', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 58. Screen Wake Lock API
      if ('wakeLock' in navigator && navigator.wakeLock.request) {
        results.checks.push({ name: 'screenWakeLock', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'screenWakeLock', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 59. Gamepad API
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      results.checks.push({ name: 'gamepad', value: { count: gamepads.length }, expected: 'available', consistent: typeof navigator.getGamepads === 'function' });

      // 60. Pointer Lock API
      if (document.pointerLockElement !== undefined) {
        results.checks.push({ name: 'pointerLock', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'pointerLock', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 61. Fullscreen API
      if (document.fullscreenEnabled !== undefined) {
        results.checks.push({ name: 'fullscreen', value: document.fullscreenEnabled, expected: 'available', consistent: typeof document.fullscreenEnabled === 'boolean' });
      } else {
        results.checks.push({ name: 'fullscreen', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 62. Picture-in-Picture API
      if ('pictureInPictureEnabled' in document) {
        results.checks.push({ name: 'pictureInPicture', value: document.pictureInPictureEnabled, expected: 'available', consistent: typeof document.pictureInPictureEnabled === 'boolean' });
      } else {
        results.checks.push({ name: 'pictureInPicture', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 63. Web Audio API
      if (window.AudioContext || window.webkitAudioContext) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        results.checks.push({ name: 'webAudio', value: { binCount: dataArray.length, sampleRate: audioCtx.sampleRate }, expected: 'set', consistent: dataArray.length > 0 });
        audioCtx.close();
      } else {
        results.checks.push({ name: 'webAudio', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 64. OffscreenCanvas API
      if (typeof OffscreenCanvas !== 'undefined') {
        results.checks.push({ name: 'offscreenCanvas', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'offscreenCanvas', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 65. ResizeObserver API
      if (typeof ResizeObserver !== 'undefined') {
        results.checks.push({ name: 'resizeObserver', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'resizeObserver', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 66. IntersectionObserver API
      if (typeof IntersectionObserver !== 'undefined') {
        results.checks.push({ name: 'intersectionObserver', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'intersectionObserver', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 67. MutationObserver API
      if (typeof MutationObserver !== 'undefined') {
        results.checks.push({ name: 'mutationObserver', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'mutationObserver', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 68. PerformanceObserver API
      if (typeof PerformanceObserver !== 'undefined') {
        results.checks.push({ name: 'performanceObserver', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'performanceObserver', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 69. ReportingObserver API
      if (typeof ReportingObserver !== 'undefined') {
        results.checks.push({ name: 'reportingObserver', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'reportingObserver', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 70. CSS Houdini APIs
      const houdiniChecks = {
        cssPaint: typeof CSS !== 'undefined' && 'paintWorklet' in CSS,
        cssTypedOM: typeof CSS !== 'undefined' && 'registerProperty' in CSS,
        cssLayout: typeof CSS !== 'undefined' && 'layoutWorklet' in CSS,
        cssAnimation: typeof CSS !== 'undefined' && 'animationWorklet' in CSS,
      };
      results.checks.push({ name: 'cssHoudini', value: houdiniChecks, expected: 'set', consistent: true });

      // 71. WebAssembly
      if (typeof WebAssembly !== 'undefined') {
        results.checks.push({ name: 'webAssembly', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'webAssembly', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 72. Web Worker
      if (typeof Worker !== 'undefined') {
        results.checks.push({ name: 'webWorker', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'webWorker', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 73. Service Worker
      if ('serviceWorker' in navigator) {
        results.checks.push({ name: 'serviceWorker', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'serviceWorker', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 74. Cache API
      if ('caches' in window) {
        results.checks.push({ name: 'cacheApi', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'cacheApi', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 75. IndexedDB
      if ('indexedDB' in window) {
        results.checks.push({ name: 'indexedDB', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'indexedDB', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 76. WebSQL
      if ('openDatabase' in window) {
        results.checks.push({ name: 'webSQL', value: 'available', expected: 'unavailable', consistent: true });
      } else {
        results.checks.push({ name: 'webSQL', value: 'unavailable', expected: 'unavailable', consistent: true });
      }

      // 77. LocalStorage
      try {
        const testKey = '__websense_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        results.checks.push({ name: 'localStorage', value: 'available', expected: 'available', consistent: true });
      } catch (e) {
        results.checks.push({ name: 'localStorage', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 78. SessionStorage
      try {
        const testKey = '__websense_test__';
        sessionStorage.setItem(testKey, 'test');
        sessionStorage.removeItem(testKey);
        results.checks.push({ name: 'sessionStorage', value: 'available', expected: 'available', consistent: true });
      } catch (e) {
        results.checks.push({ name: 'sessionStorage', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 79. WebSocket
      if (typeof WebSocket !== 'undefined') {
        results.checks.push({ name: 'webSocket', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'webSocket', value: 'unavailable', expected: 'available', consistent: false });
      }

      // 80. EventSource (SSE)
      if (typeof EventSource !== 'undefined') {
        results.checks.push({ name: 'eventSource', value: 'available', expected: 'available', consistent: true });
      } else {
        results.checks.push({ name: 'eventSource', value: 'unavailable', expected: 'available', consistent: false });
      }

<<<<<<< HEAD
      // Final verdict: only detection-critical signals gate the visit.
      // The rest (clipboard/storage/notification permission states, API
      // availability, etc.) legitimately varies between machines — failing
      // a visit because Notification.permission is 'default' or a
      // clipboard-read permission is absent would reject most REAL users
      // too. All checks stay recorded as advisory data.
      const criticalChecks = results.checks.filter((c) => c.critical);
      results.consistent = criticalChecks.length > 0
        ? criticalChecks.every((c) => c.consistent)
        : results.consistent;

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      return results;
    }, profile);

    return checks;
  } catch (err) {
    logger.warn(`Fingerprint consistency check failed: ${err.message}`);
    return { consistent: false, checks: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Analytics injection
// ---------------------------------------------------------------------------
async function injectAnalytics(page, analyticsManager, clientId) {
  if (!analyticsManager?.config?.enabled) return;

  const gaId = 'G-XXXXXXXXXX';
  const consent = analyticsManager.generateConsentPayload(analyticsManager.config.consentMode);

  await page.evaluateOnNewDocument((gaId, clientId, consentJson) => {
    if (consentJson) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer = { consent: JSON.parse(consentJson) };
    }

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', gaId, { client_id: clientId });

    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_referrer: document.referrer
    });

    gtag('event', 'session_start', {
      session_id: `sess-${Date.now()}`,
      engage_time_second: 0,
    });
  }, gaId, clientId, consent ? JSON.stringify(consent) : null);

  logger.info(`📊 Analytics injected (GA4, consent: ${analyticsManager.config.consentMode})`);
}

// ---------------------------------------------------------------------------
// CAPTCHA detection & solving
// ---------------------------------------------------------------------------
async function detectCaptcha(page) {
  return await page.evaluate(() => {
    const selectors = [
      '#g-recaptcha', '.g-recaptcha', '#h-captcha', '.h-captcha',
      '[class*="captcha"]', '[id*="captcha"]', 'iframe[src*="captcha"]',
      'form[action*="captcha"]', '.cf-browser-verification',
      '#cf-challenge', '.cf-jackson-wrap',
    ];
    return selectors.some((sel) => document.querySelector(sel));
  });
}

async function solveCaptcha(page, captchaSolver, pageUrl) {
  if (!captchaSolver?.isEnabled()) {
    logger.warn('CAPTCHA detected but no API key configured — skipping solve');
    return { solved: false, error: 'No API key' };
  }

  let captchaImageUrl = null;
  try {
    captchaImageUrl = await page.evaluate(() => {
      const img = document.querySelector('img[src*="captcha"], canvas[data-src], #g-recaptcha iframe');
      return img?.src || img?.getAttribute('data-src') || null;
    });
  } catch { /* noop */ }

  const result = await captchaSolver.solve(pageUrl, captchaImageUrl || pageUrl);
  if (result.success) {
    const tokenInput = await page.$('#g-recaptcha-response, #h-captcha-response, input[name="captcha"]');
    if (tokenInput) {
      await tokenInput.type(result.token);
    }
    logger.info(`🔐 CAPTCHA solved via ${result.provider}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Content verification
// ---------------------------------------------------------------------------
async function verifyContent(page, contentVerifier) {
  if (!contentVerifier) return { valid: true, errors: [], warnings: [], details: {}, hasCaptcha: false };
  return contentVerifier.verify(page);
}

// ---------------------------------------------------------------------------
// Network condition simulation
// ---------------------------------------------------------------------------
async function setNetworkCondition(page, connectionType) {
  const conditions = {
    'slow-2g': { download: 50 * 1024, upload: 20 * 1024, latency: 4000 },
    '2g': { download: 250 * 1024, upload: 50 * 1024, latency: 3000 },
    '3g-slow': { download: 400 * 1024, upload: 400 * 1024, latency: 1500 },
    '3g': { download: 1.6 * 1024 * 1024, upload: 750 * 1024, latency: 500 },
    '4g': { download: 4 * 1024 * 1024, upload: 3 * 1024 * 1024, latency: 200 },
  };

  const cond = conditions[connectionType];
  if (!cond) return;

  try {
<<<<<<< HEAD
    const client = await page.createCDPSession(); // target-level session (BrowserContext has no newCDPSession here)
=======
    const client = await page.context().newCDPSession(page);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: cond.latency,
      downloadThroughput: cond.download,
      uploadThroughput: cond.upload,
    });
    logger.info(`📶 Network condition: ${connectionType} (${cond.download} B/s down, ${cond.latency}ms)`);
  } catch (err) {
    logger.warn(`Network condition simulation failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Canvas fingerprint randomization
// ---------------------------------------------------------------------------
function getCanvasSpoofScript(seed) {
  const rand = mulberry32(seed);
  const noise = Math.floor(rand() * 100);

  return () => {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
      const ctx = this.getContext('2d');
      if (ctx && !this.__spoofed) {
        this.__spoofed = true;
        ctx.fillStyle = `rgba(${noise}, ${Math.floor(rand() * 255)}, ${Math.floor(rand() * 255)}, 0.01)`;
        ctx.fillRect(0, 0, 1, 1);
      }
      return origToDataURL.call(this, type, quality);
    };

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId, ...args) {
      const ctx = origGetContext.call(this, contextId, ...args);
      if (ctx && contextId === '2d' && !this.__noiseAdded) {
        this.__noiseAdded = true;
        const origFillRect = ctx.fillRect;
        ctx.fillRect = function (x, y, w, h) {
          origFillRect.call(this, x, y, w, h);
          const imgData = this.getImageData(0, 0, this.canvas.width, this.canvas.height);
          for (let i = 0; i < imgData.data.length; i += 40) {
            imgData.data[i] = (imgData.data[i] + noise) % 256;
          }
          this.putImageData(imgData, 0, 0);
        };
      }
      return ctx;
    };
  };
}

// ---------------------------------------------------------------------------
// WebGL fingerprint randomization
// ---------------------------------------------------------------------------
function getWebGLSpoofScript(fingerprint) {
  return (fp) => {
    const renderer = fp.webgl || 'Intel Inc.';
    const vendor = renderer.includes('NVIDIA') ? 'Google Inc. (NVIDIA)' :
                   renderer.includes('Apple') ? 'Apple Inc.' :
                   renderer.includes('AMD') ? 'Google Inc. (AMD)' :
                   renderer.includes('Intel') ? 'Google Inc. (Intel)' :
                   'Google Inc.';

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return renderer;
      if (param === 37446) return vendor;
      if (param === 37448) return fp.version;
      return getParameter.call(this, param);
    };

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return renderer;
        if (param === 37446) return vendor;
        if (param === 37448) return fp.version;
        return getParameter2.call(this, param);
      };
    }
  };
}

// ---------------------------------------------------------------------------
// AudioContext fingerprint randomization
// ---------------------------------------------------------------------------
function getAudioSpoofScript(seed) {
  const rand = mulberry32(seed);
  const noise = rand();

  return () => {
    if (typeof AudioContext !== 'undefined') {
      const origCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const osc = origCreateOscillator.call(this);
        const origStart = osc.start;
        osc.start = function (...args) {
          osc.frequency.value = (osc.frequency.value || 0) + noise * 0.01;
          return origStart.apply(this, args);
        };
        return osc;
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Comprehensive stealth injection script
// ---------------------------------------------------------------------------
function getStealthScript(fingerprint, seed) {
<<<<<<< HEAD
=======
  const rand = mulberry32(seed);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
  const fp = fingerprint;
  const plugins = getPlugins(fp);
  const mimeTypes = getMimeTypes(fp);
  const canvasSpoof = getCanvasSpoofScript(seed);
  const webglSpoof = getWebGLSpoofScript(fp);
  const audioSpoof = getAudioSpoofScript(seed);

<<<<<<< HEAD
  return (fp, tz, plugins, mimeTypes, seed, canvasSpoofFn, webglSpoofFn, audioSpoofFn) => {
=======
  return (fp, tz, plugins, mimeTypes, seed) => {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    // 1. WebDriver detection
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    });

    // 2. window.chrome object
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: function() { return { postMessage: function(){}, disconnect: function(){} }; },
        sendMessage: function() {},
      };
    }
    if (!window.chrome.app) {
      window.chrome.app = { isInstalled: false, InstallState: {}, RunningState: {}, getDetails: function(){ return null; }, getInstalledApps: function(){ return []; } };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function() { return {}; };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function() { return {}; };
    }

    // 3. Permissions API
    if (typeof Notification !== 'undefined') {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true,
      });
    }
    if (typeof Permissions !== 'undefined' && Permissions.prototype) {
      Permissions.prototype.query = function (permissions) {
        const p = permissions?.name || permissions;
        if (p === 'notifications') return Promise.resolve({ state: Notification.permission });
        if (p === 'geolocation') return Promise.resolve({ state: 'prompt' });
        if (p === 'midi' || p === 'clipboard-read' || p === 'clipboard-write') return Promise.resolve({ state: 'granted' });
        return Promise.resolve({ state: 'denied' });
      };
    }

    // 4. Plugins & MimeTypes
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = plugins.map(p => ({
          name: p.name,
          filename: p.filename,
          description: p.description,
          length: 1,
          0: { type: mimeTypes[0]?.type || 'application/pdf' },
        }));
        arr.length = plugins.length;
        arr.item = (i) => arr[i] || null;
        arr.namedItem = (name) => arr.find((p) => p.name === name) || null;
        arr.refresh = () => {};
        return arr;
      },
      configurable: true,
    });

    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const arr = mimeTypes.map(mt => ({
          type: mt.type,
          suffixes: mt.suffixes,
          description: mt.description,
          enabledPlugin: plugins[0],
        }));
        arr.length = mimeTypes.length;
        arr.item = (i) => arr[i] || null;
        arr.namedItem = (type) => arr.find((m) => m.type === type) || null;
        return arr;
      },
      configurable: true,
    });

    // 5. Languages consistency
    const languages = [fp.locale, fp.locale.split('-')[0]];
    Object.defineProperty(navigator, 'languages', {
      get: () => [...languages],
      configurable: true,
    });

    // 6. Platform consistency
    Object.defineProperty(navigator, 'platform', {
      get: () => fp.platform,
      configurable: true,
    });

    // 7. HardwareConcurrency & DeviceMemory
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => fp.hardwareConcurrency || 8,
      configurable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => fp.deviceMemory || 8,
      configurable: true,
    });

    // 8. Touch points
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => fp.isMobile ? 5 : 0,
      configurable: true,
    });

    // 9. Timezone spoofing (comprehensive)
    Date.prototype.getTimezoneOffset = function () {
      const now = new Date();
      const tzString = now.toLocaleString('en-US', { timeZone: tz });
      const realTzOffset = (new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })) - new Date(tzString)) / 60000;
      return -Math.round(realTzOffset);
    };

    const origDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function (locales, options) {
      if (options?.timeZone === undefined && !options?.timeZone) {
        options = { ...options, timeZone: tz };
      }
      return new origDateTimeFormat(locales, options);
    };
    Intl.DateTimeFormat.prototype = origDateTimeFormat.prototype;
    Intl.DateTimeFormat.polyfilled = true;

    const origResolvedOptions = origDateTimeFormat.prototype.resolvedOptions;
    origDateTimeFormat.prototype.resolvedOptions = function () {
      const opts = origResolvedOptions.call(this);
      opts.timeZone = tz;
      return opts;
    };

    // 10. Screen properties
    Object.defineProperty(screen, 'availWidth', { get: () => fp.screen.w, configurable: true });
    Object.defineProperty(screen, 'availHeight', { get: () => fp.screen.h, configurable: true });
    Object.defineProperty(screen, 'width', { get: () => fp.screen.w, configurable: true });
    Object.defineProperty(screen, 'height', { get: () => fp.screen.h, configurable: true });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });

    // 11. Window outer dimensions
    Object.defineProperty(window, 'outerWidth', { get: () => fp.screen.w, configurable: true });
    Object.defineProperty(window, 'outerHeight', { get: () => fp.screen.h, configurable: true });
    Object.defineProperty(window, 'innerWidth', { get: () => fp.screen.w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: () => fp.screen.h, configurable: true });

    // 12. CDP detection protection
    delete window.cdc_;
    delete window.__cdc_;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_;

    // 13. Canvas fingerprint randomization
<<<<<<< HEAD
    if (typeof canvasSpoofFn === 'function') {
      canvasSpoofFn(seed);
    }

    // 14. WebGL fingerprint randomization
    if (typeof webglSpoofFn === 'function') {
      webglSpoofFn(fp);
    }

    // 15. AudioContext fingerprint randomization
    if (typeof audioSpoofFn === 'function') {
      audioSpoofFn(seed);
    }
=======
    canvasSpoof(seed);

    // 14. WebGL fingerprint randomization
    webglSpoof(fp);

    // 15. AudioContext fingerprint randomization
    audioSpoof(seed);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

    // 16. WebRTC leak prevention (comprehensive + STUN blocking)
    try {
      // Block RTCPeerConnection entirely
      window.RTCPeerConnection = function () {
        throw new Error('WebRTC is disabled');
      };
      window.RTCPeerConnection = undefined;
      if (typeof webkitRTCPeerConnection !== 'undefined') {
        window.webkitRTCPeerConnection = undefined;
      }
      if (typeof RTCSessionDescription !== 'undefined') {
        window.RTCSessionDescription = undefined;
      }
      if (typeof RTCIceCandidate !== 'undefined') {
        window.RTCIceCandidate = undefined;
      }
      // Block WebRTC-related APIs
      Object.defineProperty(navigator, 'mediaDevices', {
        get: () => undefined,
        configurable: true,
      });
      // Block WebRTC DataChannel
      if (typeof RTCDataChannel !== 'undefined') {
        window.RTCDataChannel = undefined;
      }
      // Block WebRTC MediaStream
      if (typeof MediaStream !== 'undefined') {
        // Only block if it's WebRTC-related (has getTracks)
        try {
          window.MediaStream = function () {
            throw new Error('MediaStream is disabled');
          };
        } catch (e) { /* MediaStream may already be blocked */ }
      }
    } catch (e) { /* WebRTC may not be available */ }

    // 16b. DNS leak prevention via WebRTC
    try {
      // Block common STUN servers that could reveal real IP
      const stunServers = ['stun.l.google.com', 'stun1.l.google.com', 'stun2.l.google.com',
        'stun.cloudflare.com', 'stun.services.mozilla.com', 'stun.ff.yandex.net',
        'stun.android.google.com', 'stun.gaia.chromeos.com'];

      // Block WebSocket connections to STUN servers
      if (typeof WebSocket !== 'undefined') {
        const origWebSocket = WebSocket;
        window.WebSocket = function (url) {
          if (url && stunServers.some(s => url.includes(s))) {
            throw new Error('STUN server connection blocked');
          }
          return new origWebSocket(url);
        };
        window.WebSocket.prototype = origWebSocket.prototype;
      }

      // Block fetch to STUN servers
      if (typeof fetch !== 'undefined') {
        const origFetch = fetch;
        window.fetch = function (url, options) {
          if (url && stunServers.some(s => String(url).includes(s))) {
            return Promise.reject(new Error('STUN server connection blocked'));
          }
          return origFetch(url, options);
        };
      }

      // Block XHR to STUN servers
      if (typeof XMLHttpRequest !== 'undefined') {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
          if (url && stunServers.some(s => String(url).includes(s))) {
            throw new Error('STUN server connection blocked');
          }
          return origOpen.apply(this, arguments);
        };
      }
    } catch (e) { /* STUN blocking may not be available */ }

    // 16b. MediaDevices API spoofing (when WebRTC is partially available)
    try {
      if (navigator.mediaDevices) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async function (constraints) {
          throw new DOMException('NotAllowedError: Permission denied', 'NotAllowedError');
        };
        Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
          value: () => Promise.resolve([]),
          configurable: true,
        });
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
          value: async () => { throw new DOMException('NotAllowedError', 'NotAllowedError'); },
          configurable: true,
        });
      }
    } catch (e) { /* MediaDevices may not be available */ }

    // 16c. Notifications API spoofing (comprehensive)
    try {
      if (typeof Notification !== 'undefined') {
        Object.defineProperty(Notification, 'permission', {
          get: () => 'denied',
          configurable: true,
        });
        Object.defineProperty(Notification, 'requestPermission', {
          value: () => Promise.resolve('denied'),
          configurable: true,
        });
      }
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'Notification', {
          get: () => Notification,
          configurable: true,
        });
      }
    } catch (e) { /* Notifications may not be available */ }

<<<<<<< HEAD
    // 17. userAgentData API — real Firefox/Safari have none at all, so for
    // those profiles REMOVE it (presence under a non-Chromium UA is a tell).
    if (fp.browser === 'firefox' || fp.browser === 'safari') {
      try {
        delete navigator.userAgentData;
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => undefined,
          configurable: true,
        });
      } catch (e) { /* non-configurable — leave as-is */ }
    } else if (navigator.userAgentData) {
=======
    // 17. userAgentData API
    if (navigator.userAgentData) {
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: fp.clientHints?.brands || [{ brand: 'Google Chrome', version: '126' }],
          mobile: fp.isMobile || false,
          platform: fp.clientHints?.platform || fp.platform,
          getHighEntropyValues: (hints) => {
            return Promise.resolve({
              architecture: 'x86',
              bitness: '64',
              brands: fp.clientHints?.brands || [{ brand: 'Google Chrome', version: '126' }],
              fullVersionList: fp.clientHints?.brands?.map(b => ({ brand: b.brand, version: b.version + '.0.0' })) || [],
              mobile: fp.isMobile || false,
              model: fp.device || '',
              platform: fp.clientHints?.platform || fp.platform,
              platformVersion: '10.0.0',
              uaFullVersion: fp.version + '.0.0',
              wow64: false,
            });
          },
          toJSON: function() { return { brands: this.brands, mobile: this.mobile, platform: this.platform }; },
        }),
        configurable: true,
      });
    }

    // 18. Battery API
    if (typeof Battery !== 'undefined') {
      Object.defineProperty(navigator, 'getBattery', {
        value: () => Promise.resolve({
          charging: true, chargingTime: 0, dischargeTime: 3600, level: 1,
          onchargingchange: null, onchargingtimechange: null,
          ondischargingtimechange: null, onlevelchange: null,
        }),
        configurable: true,
      });
    }

    // 19. Clipboard API spoofing
    try {
      if (navigator.clipboard) {
        Object.defineProperty(navigator.clipboard, 'readText', {
          value: () => Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError')),
          configurable: true,
        });
        Object.defineProperty(navigator.clipboard, 'writeText', {
          value: () => Promise.resolve(),
          configurable: true,
        });
        Object.defineProperty(navigator.clipboard, 'read', {
          value: () => Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError')),
          configurable: true,
        });
        Object.defineProperty(navigator.clipboard, 'write', {
          value: () => Promise.resolve(),
          configurable: true,
        });
      }
    } catch (e) { /* Clipboard may not be available */ }

    // 20. Geolocation API spoofing
    try {
      if (navigator.geolocation) {
        Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
          value: (success, error) => {
            // Simulate a realistic geolocation based on timezone
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
            const coords = { latitude: 0, longitude: 0, accuracy: 100 };
            // Generate coordinates based on timezone
            const lat = Math.random() * 180 - 90;
            const lon = Math.random() * 360 - 180;
            success({
              coords: { latitude: lat, longitude: lon, accuracy: 100, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
              timestamp: Date.now(),
            });
          },
          configurable: true,
        });
        Object.defineProperty(navigator.geolocation, 'watchPosition', {
          value: () => 0,
          configurable: true,
        });
        Object.defineProperty(navigator.geolocation, 'clearWatch', {
          value: () => {},
          configurable: true,
        });
      }
    } catch (e) { /* Geolocation may not be available */ }

    // 21. Performance API enhancements
    try {
      const origNow = performance.now;
      performance.now = function () {
        return origNow.call(performance) + Math.random() * 5; // Add tiny jitter
      };
    } catch (e) { /* Performance may not be available */ }

    // 22. Memory API (Chrome-specific)
    try {
      if (performance.memory) {
        performance.memory = {
          usedJSHeapSize: Math.floor(Math.random() * 50000000 + 10000000),
          totalJSHeapSize: Math.floor(Math.random() * 100000000 + 20000000),
          jsHeapSizeLimit: 4000000000,
        };
      }
    } catch (e) { /* Memory API may not be available */ }

    // 23. Storage API comprehensive spoofing
    try {
      if (navigator.storage) {
        Object.defineProperty(navigator.storage, 'estimate', {
          value: () => Promise.resolve({
            quota: 60397977600,
            usage: Math.floor(Math.random() * 50000000 + 1000000),
            usageDetails: {
              indexedDB: Math.floor(Math.random() * 10000000 + 100000),
              caches: Math.floor(Math.random() * 5000000 + 10000),
            },
          }),
          configurable: true,
        });
        Object.defineProperty(navigator.storage, 'persist', {
          value: () => Promise.resolve(true),
          configurable: true,
        });
        Object.defineProperty(navigator.storage, 'persisted', {
          value: () => Promise.resolve(true),
          configurable: true,
        });
      }
    } catch (e) { /* Storage may not be available */ }

    // 24. More comprehensive timezone spoofing
    try {
      // Override Date.prototype.getTimezoneOffset for consistency
      const tzOffset = (() => {
        const d = new Date();
        const localOffset = d.getTimezoneOffset();
        const utcOffset = -localOffset;
        return utcOffset * 60000;
      })();

      Date.prototype.getTimezoneOffset = function () {
        return Math.round(-tzOffset / 60000);
      };
    } catch (e) { /* Timezone may already be spoofed */ }

    // 25. More comprehensive language spoofing
    try {
      Object.defineProperty(navigator, 'language', {
        get: () => fp.locale,
        configurable: true,
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => [fp.locale, fp.locale.split('-')[0]],
        configurable: true,
      });
    } catch (e) { /* Languages may already be spoofed */ }

    // 26. More comprehensive screen spoofing
    try {
      Object.defineProperty(screen, 'availLeft', { get: () => 0, configurable: true });
      Object.defineProperty(screen, 'availTop', { get: () => 0, configurable: true });
      Object.defineProperty(screen, 'left', { get: () => 0, configurable: true });
      Object.defineProperty(screen, 'top', { get: () => 0, configurable: true });
    } catch (e) { /* Screen properties may already be spoofed */ }

    // 27. More comprehensive window dimension spoofing
    try {
      Object.defineProperty(window, 'screenX', { get: () => 0, configurable: true });
      Object.defineProperty(window, 'screenY', { get: () => 0, configurable: true });
      Object.defineProperty(window, 'pageXOffset', { get: () => 0, configurable: true });
      Object.defineProperty(window, 'pageYOffset', { get: () => 0, configurable: true });
    } catch (e) { /* Window dimensions may already be spoofed */ }

    // 19. Storage quota
    if (navigator.storage) {
      Object.defineProperty(navigator.storage, 'estimate', {
        value: () => Promise.resolve({
          quota: 60397977600, usage: 1048576,
          usageDetails: { indexedDB: 1048576 },
        }),
        configurable: true,
      });
    }

    // 20. HTMLElement.prototype.draggable
    Object.defineProperty(HTMLElement.prototype, 'draggable', {
      get: function() { return this.getAttribute('draggable') === 'true'; },
      set: function(v) { this.setAttribute('draggable', v ? 'true' : 'false'); },
      configurable: true,
    });

    // 28. More comprehensive WebGL spoofing (vendor/renderer consistency)
    try {
      const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        // UNMASKED_RENDERER_WEBGL = 37445
        // UNMASKED_VENDOR_WEBGL = 37446
        if (param === 37445) return fp.webgl || 'Intel Inc.';
        if (param === 37446) return fp.webglVendor || 'Google Inc.';
        return getParameterOrig.call(this, param);
      };
    } catch (e) { /* WebGL may not be available */ }

    // 29. More comprehensive canvas spoofing (getImageData)
    try {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
        const imageData = origGetImageData.call(this, x, y, w, h);
        // Add subtle noise to pixel data
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 40) {
          data[i] = (data[i] + Math.floor(Math.random() * 3)) % 256;
        }
        return imageData;
      };
    } catch (e) { /* Canvas may not be available */ }

    // 30. More comprehensive AudioContext spoofing
    try {
      if (typeof AudioContext !== 'undefined') {
        const origCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function () {
          const analyser = origCreateAnalyser.call(this);
          const origGetFloatFrequencyData = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function (array) {
            origGetFloatFrequencyData.call(this, array);
            // Add subtle noise to frequency data
            for (let i = 0; i < array.length; i++) {
              array[i] += (Math.random() - 0.5) * 0.01;
            }
          };
          return analyser;
        };
      }
    } catch (e) { /* AudioContext may not be available */ }

    // 31. More comprehensive navigator.webdriver spoofing
    try {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true,
      });
      // Also spoof for Chrome-specific checks
      if (navigator.userAgent.includes('Chrome')) {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });
      }
    } catch (e) { /* webdriver may already be spoofed */ }

    // 32. More comprehensive chrome object spoofing
    try {
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          connect: function() { return { postMessage: function(){}, disconnect: function(){} }; },
          sendMessage: function() {},
          id: undefined,
        };
      }
      if (!window.chrome.app) {
        window.chrome.app = {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          getDetails: function() { return null; },
          getInstalledApps: function() { return []; },
        };
      }
      if (!window.chrome.csi) window.chrome.csi = function() { return {}; };
      if (!window.chrome.loadTimes) window.chrome.loadTimes = function() { return {}; };
    } catch (e) { /* chrome object may already be spoofed */ }

    // 33. More comprehensive permissions API spoofing
    try {
      if (typeof Permissions !== 'undefined' && Permissions.prototype) {
        const origQuery = Permissions.prototype.query;
        Permissions.prototype.query = function (permissions) {
          const p = permissions?.name || permissions;
          if (p === 'notifications') return Promise.resolve({ state: 'denied' });
          if (p === 'geolocation') return Promise.resolve({ state: 'prompt' });
          if (p === 'midi' || p === 'clipboard-read' || p === 'clipboard-write') return Promise.resolve({ state: 'denied' });
          if (p === 'camera' || p === 'microphone') return Promise.resolve({ state: 'denied' });
          return Promise.resolve({ state: 'denied' });
        };
      }
    } catch (e) { /* Permissions may not be available */ }

    // 34. More comprehensive Intl API spoofing
    try {
      const origIntl = Intl;
      const spoofedIntl = {
        DateTimeFormat: origIntl.DateTimeFormat,
        NumberFormat: origIntl.NumberFormat,
        Collator: origIntl.Collator,
        PluralRules: origIntl.PluralRules,
        RelativeTimeFormat: origIntl.RelativeTimeFormat,
        ListFormat: origIntl.ListFormat,
        getCanonicalLocales: (locales) => origIntl.getCanonicalLocales(locales),
        resolvedOptions: () => ({ timeZone: tz }),
      };
      spoofedIntl.DateTimeFormat = function (locales, options) {
        if (options?.timeZone === undefined) {
          options = { ...options, timeZone: tz };
        }
        return new origIntl.DateTimeFormat(locales, options);
      };
      spoofedIntl.DateTimeFormat.prototype = origIntl.DateTimeFormat.prototype;
      Object.defineProperty(window, 'Intl', { value: spoofedIntl, configurable: true });
    } catch (e) { /* Intl may already be spoofed */ }
  };
}

// ---------------------------------------------------------------------------
// Full browser visit with all stealth + Sprint 3 integrations
// ---------------------------------------------------------------------------
export async function runBrowserVisit({
  proxy, url, userAgent, timeout = 30000, sessionSeed = null, screenshot = false,
  analyticsManager = null, captchaSolver = null, contentVerifier = null,
  connectionType = null, clientId = null, adViewability = null,
  screenshotSystem = null, fingerprint = null, sessionPersistence = null,
<<<<<<< HEAD
  headless = true, // false → visible window so the visit can be watched
  behaviorDirector = null, // AI/human behavior director (multi-provider)
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
}) {
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) return { success: false, error: 'Puppeteer not installed' };

  const stealth = await loadStealth();
  const seed = sessionSeed || Date.now();
  const fp = fingerprint || getRandomFingerprint();

<<<<<<< HEAD
  // Build proxy URL with SOCKS5 support.
  // NOTE: Chrome's --proxy-server flag does NOT support credentials
  // (userinfo → net::ERR_NO_SUPPORTED_PROXIES). Credentials are applied
  // after launch via page.authenticate() instead.
  const proxyType = proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5' : 'http';
  const proxyServerUrl = `${proxyType}://${proxy.host}:${proxy.port}`;
=======
  // Build proxy URL with SOCKS5 support
  const proxyAuth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@` : '';
  const proxyType = proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5' : 'http';
  const proxyUrl = `${proxyType}://${proxyAuth}${proxy.host}:${proxy.port}`;
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

  // Get or create persistent fingerprint
  const sessionFp = sessionPersistence ? await sessionPersistence.getOrCreateFingerprint(seed) : { profile: fp, isNew: true };
  const profile = sessionFp.profile || fp;
  const canvasSeed = sessionFp.canvasSeed || seed;
<<<<<<< HEAD
  const visitId = crypto.randomUUID(); // used by the screenshot system

  // Launch options — NO --disable-web-security (detectable + insecure)
  const launchOptions = {
    headless: headless === false ? false : 'new',
=======

  // Launch options — NO --disable-web-security (detectable + insecure)
  const launchOptions = {
    headless: 'new',
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
<<<<<<< HEAD
      ...(headless === false ? [] : ['--disable-gpu']),
=======
      '--disable-gpu',
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--disable-component-extensions-with-background-pages',
      '--mute-audio',
      '--autoplay-policy=user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--enable-features=NetworkServiceInProcess2',
<<<<<<< HEAD
      `--proxy-server=${proxyServerUrl}`,
      ...(headless === false ? [`--window-size=${profile.screen.w},${profile.screen.h}`] : []),
=======
      `--proxy-server=${proxyUrl}`,
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    ],
  };

  if (stealth?.default) {
    const { default: stealthPluginFn } = stealth;
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = stealthPluginFn;
    puppeteerExtra.use(StealthPlugin());
    var browser = await puppeteerExtra.launch(launchOptions);
  } else {
    var browser = await puppeteer.launch(launchOptions);
  }

  const start = Date.now();
  let screenshotPath = null;

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

<<<<<<< HEAD
    // Proxy credentials (Chrome's --proxy-server can't carry user:pass)
    if (proxy.username) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    // Set fingerprint-consistent viewport
    await page.setViewport({
      width: profile.screen.w,
      height: profile.screen.h,
      deviceScaleFactor: profile.isMobile ? 2 : 1,
      isMobile: profile.isMobile,
      hasTouch: profile.isMobile,
    });
<<<<<<< HEAD
    // Set identity. For Chrome/Edge use a full CDP override (UA + UA-CH
    // metadata) so navigator.userAgentData stays consistent — a plain
    // page.setUserAgent() resets brands to [] / platform to '', which real
    // fingerprint scripts detect instantly. Applied for every Chromium-family
    // profile, even when profile.clientHints is null (metadata is derived).
    if (profile.browser === 'chrome' || profile.browser === 'edge') {
      try {
        const cdp = await page.createCDPSession();
        await cdp.send('Network.setUserAgentOverride', {
          userAgent: profile.ua,
          platform: profile.clientHints?.platform
            || ({ Win32: 'Windows', MacIntel: 'macOS', 'Linux x86_64': 'Linux', 'Linux armv8l': 'Android', iPhone: 'iOS', iPad: 'iOS' })[profile.platform]
            || 'Windows',
          userAgentMetadata: buildUserAgentMetadata(profile),
        });
        await cdp.detach();
      } catch (err) {
        logger.warn(`UA-CH override failed, falling back to setUserAgent: ${err.message}`);
        await page.setUserAgent(profile.ua);
      }
    } else {
      await page.setUserAgent(profile.ua);
    }
=======
    await page.setUserAgent(profile.ua);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

    // Get the stealth script and inject it
    const stealthFn = getStealthScript(profile, canvasSeed);

    // Inject comprehensive stealth overrides before every page load
<<<<<<< HEAD
    await page.evaluateOnNewDocument(stealthFn, profile, getTimezoneForProfile(profile), getPlugins(profile), getMimeTypes(profile), canvasSeed, getCanvasSpoofScript(canvasSeed), getWebGLSpoofScript(profile), getAudioSpoofScript(canvasSeed));
=======
    await page.evaluateOnNewDocument(stealthFn, profile, getTimezoneForProfile(profile), getPlugins(profile), getMimeTypes(profile), canvasSeed);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

    // Inject analytics (Sprint 3 — F2.8)
    const visitClientId = clientId || `client-${seed}`;
    await injectAnalytics(page, analyticsManager, visitClientId);

    // Set network condition (Sprint 3 — F3.9)
    if (connectionType) {
      await setNetworkCondition(page, connectionType);
    }

    // Add extra headers for client hints consistency
<<<<<<< HEAD
    // NOTE: setExtraHTTPHeaders is a Page API — BrowserContext has no such method.
    const clientHints = getClientHintsHeaders(profile);
    await page.setExtraHTTPHeaders({
=======
    const clientHints = getClientHintsHeaders(profile);
    await context.setExtraHTTPHeaders({
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      ...clientHints,
      'Accept-Encoding': getAcceptEncoding(profile),
    });

    // Inject session cookies if available
    if (sessionPersistence) {
      const domain = new URL(url).hostname;
      const cookies = sessionPersistence.getCookieArray(domain);
      if (cookies.length > 0) {
        await context.setCookie(...cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expires: Math.floor(c.expires / 1000),
        })));
      }
    }

    // Navigate
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    // Store response cookies for session persistence
    if (sessionPersistence) {
      const domain = new URL(url).hostname;
      const setCookies = response?.headers()?.['set-cookie'] || [];
      sessionPersistence.storeCookies(domain, setCookies);
    }

<<<<<<< HEAD
    // ── Human behavior simulation, directed by the behavior plan ────────
    // The AI behavior director (OmniRoute / Ollama / heuristic personas)
    // decides HOW this user behaves on THIS page: how long they stay, how
    // deep they scroll, how much they hover, whether they click through.
    await simulateMouse(page);

    let behaviorPlan = null;
    if (behaviorDirector) {
      try {
        const pageStats = await getPageStats(page);
        behaviorPlan = await behaviorDirector.buildPlan({ url, profile, pageStats, seed });
      } catch (e) {
        logger.warn(`Behavior plan failed, using defaults: ${e.message}`);
      }
    }
    const plan = behaviorPlan || {
      persona: 'default', source: 'baseline', dwellScale: 1.0,
      scroll: { steps: 6, depth: 0.55 }, hover: { intensity: 0.5 },
      clickIntent: 0.2, pauseScale: 1.0,
    };

    await simulateDwell(page, 2000, 6000, plan);
    await simulateScroll(page, plan.scroll?.steps ?? 6, plan);
    // Content-aware mouse movement
    await simulateContentMouse(page, plan);
    // Reading pause after scrolling (humans re-read; humanPause:200ms–4.5s)
    await sleep(getHumanPause() * clampNum(plan.pauseScale, 0.4, 2.5, 1.0));
    if (Math.random() < 0.4) await simulateDwell(page, 1000, 3000, plan);

    // Click-through: personas with real click intent follow an interesting
    // same-origin link (bezier approach → click → land → brief dwell)
    let clickedThrough = false;
    if (typeof plan.clickIntent === 'number' && plan.clickIntent > 0 && Math.random() * 0.8 < plan.clickIntent) {
      clickedThrough = await clickSameOriginLink(page);
    }
=======
    // Human behavior simulation
    await simulateMouse(page);
    await simulateDwell(page, 2000, 6000);
    await simulateScroll(page);
    // Content-aware mouse movement
    await simulateContentMouse(page);
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

    // CAPTCHA detection & solving (Sprint 3 — F2.9)
    const captchaDetected = await detectCaptcha(page);
    if (captchaDetected && captchaSolver) {
      await solveCaptcha(page, captchaSolver, url);
    }

    // Content verification (Sprint 3 — F3.3)
    const verification = await verifyContent(page, contentVerifier);

    // Fingerprint consistency verification (stealth check)
    const fingerprintCheck = await verifyFingerprintConsistency(page, profile);

    // Ad viewability simulation (Sprint 3 — F3.1)
    const adViewabilityResult = adViewability ? await adViewability.simulate(page) : { adsFound: 0, impressions: 0, views: 0, hovers: 0, clicks: 0, engagements: 0, details: [] };

    // Screenshot system (Sprint 3 — F3.4)
    if (screenshotSystem) {
      const shotResult = await screenshotSystem.capture(page, {
        url,
        type: verification.valid ? 'fullpage' : 'viewport',
        visitId,
        success: verification.valid,
        error: verification.errors.length > 0 ? verification.errors.join('; ') : null,
      });
      screenshotPath = shotResult?.path || null;
    } else if (screenshot) {
      const fs = await import('node:fs');
      fs.mkdirSync('./screenshots', { recursive: true });
      const path = `./screenshots/visit-${Date.now()}.png`;
      await page.screenshot({ path, fullPage: verification.valid });
      screenshotPath = path;
    }

    const statusCode = response?.status() || 0;
    const latency = Date.now() - start;

<<<<<<< HEAD
    // Explain any failed success-gate instead of returning a bare false
    const failureReasons = [];
    if (!(statusCode > 0 && statusCode < 500)) failureReasons.push(`status ${statusCode}`);
    if (verification.errors.length) failureReasons.push(`content: ${verification.errors.join('; ')}`);
    if (!fingerprintCheck.consistent) {
      const bad = (fingerprintCheck.checks || []).filter((c) => !c.consistent).map((c) => `${c.name}=${JSON.stringify(c.value)} expected ${JSON.stringify(c.expected)}`);
      failureReasons.push(`fingerprint: ${bad.length ? bad.join(', ') : 'inconsistent (no details)'}`);
    }
    if (fingerprintCheck.error) failureReasons.push(`fingerprint check error: ${fingerprintCheck.error}`);

=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    return {
      success: statusCode > 0 && statusCode < 500 && !verification.errors.length && fingerprintCheck.consistent,
      statusCode,
      latency,
      userAgent: profile.ua,
      screenshotPath,
      fingerprint: {
        viewport: `${profile.screen.w}x${profile.screen.h}`,
        platform: profile.platform,
        webgl: profile.webgl,
        hardwareConcurrency: profile.hardwareConcurrency,
        deviceMemory: profile.deviceMemory,
        timezone: getTimezoneForProfile(profile),
        language: profile.locale,
        isMobile: profile.isMobile,
        browser: profile.browser,
        version: profile.version,
        device: profile.device,
      },
      verification,
      captchaSolved: captchaDetected,
<<<<<<< HEAD
      error: failureReasons.length ? failureReasons.join(' | ') : null,
      adViewability: adViewabilityResult,
      behavior: behaviorPlan
        ? {
            persona: behaviorPlan.persona,
            source: behaviorPlan.source,
            clickIntent: plan.clickIntent,
            clickedThrough,
            dwellScale: plan.dwellScale,
          }
        : null,
=======
      adViewability: adViewabilityResult,
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      sessionFingerprintId: sessionFp?.fingerprintId,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function isBrowserModeAvailable() {
  const puppeteer = await loadPuppeteer();
  return !!puppeteer;
}

export { getStealthScript, detectCaptcha };
