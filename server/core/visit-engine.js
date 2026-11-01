// ============================================================================
// visit-engine.js — Core visit execution.
// HTTP mode: axios + proxy agents, retry with exponential backoff + jitter,
//           error classification (proxy vs target vs network), per-visit metrics.
// Browser mode: optional Puppeteer rendering (loaded lazily; app runs fine
//           without it in HTTP mode).
// Demo mode: simulates successful visits without any network (for testing /
//           demos when proxies or targets are unreachable).
// Session persistence: cookie jar + persistent fingerprint across visits.
// ============================================================================

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';
import logger from '../utils/logger.js';
import { getRandomFingerprint, getRandomReferrer, generateRefererChain, getImmediateReferer, getClientHintsHeaders, getAcceptEncoding } from './user-agents.js';
import { runBrowserVisit } from './browser-mode.js';

let tlsClientModule = null;
let tlsLoadError = null;

async function loadTlsClient() {
  if (tlsClientModule) return tlsClientModule;
  if (tlsLoadError) return null;
  try {
    const mod = await import('tls-client');
    tlsClientModule = mod.default || mod;
    return tlsClientModule;
  } catch (err) {
    tlsLoadError = err;
    logger.warn('tls-client not available — using axios with standard TLS. Install `tls-client` for JA3/TLS fingerprint spoofing.');
    return null;
  }
}

export class VisitEngine {
  constructor(proxyManager, urlManager, config = {}, sessionManager = null, sessionPersistence = null) {
    this.proxyManager = proxyManager;
    this.urlManager = urlManager;
    this.sessionManager = sessionManager;
    this.sessionPersistence = sessionPersistence;
    this.config = {
      requestTimeout: 30000,
      retryAttempts: 2,
      retryBackoffBase: 500,
      mode: 'http',
<<<<<<< HEAD
      headless: true,
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
      demoMode: false,
      sessionMode: false,
      screenshotOnVisit: false,
      ...config,
    };
    this.visitCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.sessionCount = 0;
    this.startTime = null;
<<<<<<< HEAD
    this.behaviorDirector = null; // AI/human behavior director (optional)
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

    this.insertVisit = db.prepare(`
      INSERT INTO visits (visit_id, url, subdomain, proxy_host, proxy_country, proxy_city,
        status_code, latency_ms, user_agent, referrer, success, error_message, error_type,
        mode, response_size, screenshot_path, device_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
  }

<<<<<<< HEAD
  /** Wire the AI behavior director (call after construction). */
  setBehaviorDirector(director) {
    this.behaviorDirector = director;
  }

  /**
   * Map fingerprint browser+version to a tls-client client identifier.
   * The installed tls-client@0.0.5 only ships a fixed set of presets
   * (see node_modules/tls-client/README.md: chrome_103..chrome_108,
   * firefox_102..firefox_106, opera_89..opera_91, safari_15_6_1, safari_16_0,
   * safari_ios_*). We pick the newest preset that does not exceed the
   * fingerprint's major version so the JA3 handshake matches the User-Agent.
   */
  _getTlsFingerprint(fp) {
    const browser = (fp.browser || 'chrome').toLowerCase();
    const major = parseInt(String(fp.version || '').split(/[._]/)[0], 10) || 0;

    let presets;
    if (browser === 'firefox') {
      presets = [[106, 'firefox_106'], [105, 'firefox_105'], [104, 'firefox_104'], [102, 'firefox_102']];
    } else if (browser === 'safari' || browser === 'ios') {
      presets = [[16, 'safari_16_0'], [15.6, 'safari_15_6_1']];
    } else if (browser === 'opera') {
      presets = [[91, 'opera_91'], [90, 'opera_90'], [89, 'opera_89']];
    } else {
      presets = [[108, 'chrome_108'], [107, 'chrome_107'], [106, 'chrome_106'], [105, 'chrome_105'], [104, 'chrome_104'], [103, 'chrome_103']];
    }

    const match = presets.find(([v]) => !major || major >= v);
    return (match || presets[presets.length - 1])[1];
=======
  /**
   * Map fingerprint browser+version to a tls-client fingerprint name.
   * tls-client supports: chrome120, chrome121, chrome123, chrome124, chrome125, chrome126, chrome131, chrome133a, firefox133, firefox135, safari17_0_0, safari17_2_1, safari18_0_0, edge101, edge106, edge122, etc.
   */
  _getTlsFingerprint(fp) {
    const browser = (fp.browser || 'chrome').toLowerCase();
    const version = parseInt((fp.version || '120').replace(/[^0-9]/g, '').slice(0, 3)) || 120;

    if (browser === 'firefox') return `firefox${version}`;
    if (browser === 'safari') return `safari${String(version).replace('.', '_').replace(/_(\d)$/, '_${1}_0')}`;
    if (browser === 'edge') return `edge${version}`;
    if (browser === 'chrome') return `chrome${version}`;
    return `chrome${version}`;
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
  }

  /**
   * Order headers to match browser behavior.
   * Chrome/Firefox send headers in a specific order that can be fingerprinted.
   */
  _orderHeaders(headers, browser) {
    const order = browser === 'firefox'
      ? ['User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding', 'Referer', 'Origin', 'Connection', 'Upgrade-Insecure-Requests', 'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User', 'Sec-Fetch-Storage-Access', 'Cache-Control', 'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 'Cookie']
      : ['User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding', 'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 'Referer', 'Origin', 'Connection', 'Upgrade-Insecure-Requests', 'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User', 'Sec-Fetch-Storage-Access', 'Cache-Control', 'Cookie'];

    const ordered = {};
    const seen = new Set();
    for (const key of order) {
      if (headers[key] !== undefined && !seen.has(key.toLowerCase())) {
        ordered[key] = headers[key];
        seen.add(key.toLowerCase());
      }
    }
    // Add any remaining headers not in the standard order
    for (const [key, value] of Object.entries(headers)) {
      if (!seen.has(key.toLowerCase())) {
        ordered[key] = value;
      }
    }
    return ordered;
  }

  // -----------------------------------------------------------------------
  // Classify an axios error: proxy-side vs target-side vs network
  // -----------------------------------------------------------------------
  static classifyError(err) {
    if (!err) return { type: 'unknown', message: 'Unknown error' };

    const code = err.code || '';
    if (code.startsWith('ECONN') || code.startsWith('ETIMEDOUT') ||
        code.startsWith('ENOTFOUND') || code.startsWith('EAUTH') ||
        code.startsWith('ERR_SOCKET') || code.startsWith('ERR_NETWORK')) {
      return { type: 'proxy', message: err.message || code };
    }

    if (err.response) {
      return { type: 'target', message: `HTTP ${err.response.status}` };
    }

    if (err.request) {
      return { type: 'network', message: err.message || 'No response' };
    }

    return { type: 'unknown', message: err.message || 'Unknown error' };
  }

  // -----------------------------------------------------------------------
  // HTTP visit with retry + exponential backoff
  // -----------------------------------------------------------------------
  async _httpVisit(proxy, urlEntry, options = {}) {
    const start = Date.now();
    const timeout = options.timeout || this.config.requestTimeout;
    const maxRetries = this.config.retryAttempts;

    // Get or create persistent fingerprint
    const sessionFp = this.sessionPersistence ? await this.sessionPersistence.getOrCreateFingerprint(options.fingerprintId) : null;
    const fp = sessionFp?.profile || options.fingerprint || getRandomFingerprint();
    const userAgent = options.userAgent || fp.ua;
    const referrer = options.referrer || getRandomReferrer();

    // Get session cookies
    let cookieHeader = '';
    if (this.sessionPersistence) {
      const domain = new URL(urlEntry.url).hostname;
      cookieHeader = this.sessionPersistence.getCookies(domain);
    }

    // Geo-matched Accept-Language header (F2.5)
    const geoHeaders = this.geoManager?.generateHeaders(proxy.country) || {};
    const acceptLanguage = geoHeaders['Accept-Language'] || (fp.locale ? `${fp.locale}, ${fp.locale.split('-')[0]};q=0.9` : 'en-US,en;q=0.9');

    // A/B testing URL transformation (F3.2)
    const visitorId = options.visitorId || `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const abResult = this.abTesting ? this.abTesting.applyTests(urlEntry.url, visitorId) : { url: urlEntry.url, applied: [] };
    const targetUrl = abResult.url;

    // Network condition: Save-Data header (F3.9)
    const connectionType = this.networkCondition?.getConnectionForUrl(targetUrl) || options.connectionType || null;
    const netHeaders = this.networkCondition?.generateHeaders(connectionType) || {};

    // Network condition: latency injection (F3.9)
    if (this.networkCondition && connectionType) {
      await this.networkCondition.injectLatency(connectionType);
    }

    // Client hints headers (Sec-CH-UA) for fingerprint consistency
    const clientHints = getClientHintsHeaders(fp);
    const acceptEncoding = getAcceptEncoding(fp);

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Try tls-client for JA3/TLS fingerprint spoofing, fallback to axios
        const tlsClient = await loadTlsClient();
        if (tlsClient && tlsClient.Session) {
          // --- tls-client path: real browser TLS fingerprint ---
<<<<<<< HEAD
          // NOTE: tls-client@0.0.5 exposes Session({clientIdentifier}) +
          //       executeRequest(method, url, opts). The proxy is passed per
          //       request (with credentials) — not in the constructor.
          const proxyUrl = this.proxyManager.createProxyUrl(proxy);
          const session = new tlsClient.Session({
            clientIdentifier: this._getTlsFingerprint(fp),
          });

          // Session cookies must be passed as an option: the library
          // overwrites any Cookie header with its own jar contents.
          const cookieObj = cookieHeader
            ? Object.fromEntries(
                cookieHeader.split(';')
                  .map((pair) => pair.split('='))
                  .filter(([k]) => k && k.trim())
                  .map(([k, ...v]) => [k.trim(), v.join('=').trim()])
              )
            : null;

          const response = await session.executeRequest('GET', targetUrl, {
=======
          const proxyUrl = `${proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5' : 'http'}://${proxy.host}:${proxy.port}`;
          const session = new tlsClient.Session({
            fingerprint: this._getTlsFingerprint(fp),
            proxy: proxyUrl,
          });

          const response = await session.execute({
            url: targetUrl,
            method: 'GET',
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
            headers: this._orderHeaders({
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': acceptLanguage,
              'Accept-Encoding': acceptEncoding,
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': referrer ? 'cross-site' : 'none',
              'Sec-Fetch-User': '?1',
              'Sec-Fetch-Storage-Access': 'none',
              'Cache-Control': 'max-age=0',
              ...clientHints,
<<<<<<< HEAD
              ...netHeaders,
              ...(referrer && { 'Referer': referrer }),
            }, fp.browser),
            ...(cookieObj && Object.keys(cookieObj).length ? { cookies: cookieObj } : {}),
            proxy: proxyUrl,
            timeoutSeconds: Math.max(1, Math.ceil(timeout / 1000)),
            allowRedirects: true,
          });

          // 5xx → throw so the retry/backoff path and target-error
          // classification run exactly like they do on the axios path.
          if (response.status >= 500) {
            const httpErr = new Error(`HTTP ${response.status}`);
            httpErr.response = { status: response.status };
            throw httpErr;
          }

          // Store response cookies for session persistence
          const setCookies = response.headers?.['Set-Cookie'] || response.headers?.['set-cookie'];
=======
              ...(cookieHeader && { 'Cookie': cookieHeader }),
              ...netHeaders,
              ...(referrer && { 'Referer': referrer }),
            }, fp.browser),
            timeout,
          });

          // Store response cookies for session persistence
          const setCookies = response.headers?.['set-cookie'];
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
          if (this.sessionPersistence && setCookies) {
            const domain = new URL(urlEntry.url).hostname;
            const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
            this.sessionPersistence.storeCookies(domain, cookies);
          }

          const latency = Date.now() - start;
<<<<<<< HEAD
          const responseSize = response.content?.length ||
            Buffer.byteLength(String(response.text ?? '')) ||
            parseInt(response.headers?.['content-length'] || '0', 10);

          if (typeof session.close === 'function') await session.close();
=======
          const responseSize = parseInt(response.headers?.['content-length'] || '0', 10) ||
            (response.body ? Buffer.byteLength(String(response.body)) : 0);

          await session.close();
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a

          return {
            success: true,
            statusCode: response.status,
            latency,
            responseSize,
            userAgent,
            referrer,
            attempts: attempt + 1,
            fingerprint: {
              platform: fp.platform,
              webgl: fp.webgl,
              hardwareConcurrency: fp.hardwareConcurrency,
              deviceMemory: fp.deviceMemory,
              language: fp.locale,
              isMobile: fp.isMobile,
              browser: fp.browser,
              version: fp.version,
              device: fp.device,
            },
            sessionFingerprintId: sessionFp?.fingerprintId,
          };
        } else {
          // --- axios fallback path ---
          const agent = this.proxyManager.createAgent(
            proxy,
            targetUrl.startsWith('https')
          );
          const response = await axios.get(targetUrl, {
            httpsAgent: agent,
            httpAgent: agent,
            timeout,
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': acceptLanguage,
              'Accept-Encoding': acceptEncoding,
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': referrer ? 'cross-site' : 'none',
              'Sec-Fetch-User': '?1',
              'Sec-Fetch-Storage-Access': 'none',
              'Cache-Control': 'max-age=0',
              ...clientHints,
              ...(cookieHeader && { 'Cookie': cookieHeader }),
              ...netHeaders,
              ...(referrer && { 'Referer': referrer }),
            },
          });

          // Store response cookies for session persistence
          if (this.sessionPersistence && response.headers['set-cookie']) {
            const domain = new URL(urlEntry.url).hostname;
            this.sessionPersistence.storeCookies(domain, response.headers['set-cookie']);
          }

          const latency = Date.now() - start;
          const responseSize = parseInt(response.headers['content-length'] || '0', 10) ||
            (response.data ? Buffer.byteLength(String(response.data)) : 0);

          return {
            success: true,
            statusCode: response.status,
            latency,
            responseSize,
            userAgent,
            referrer,
            attempts: attempt + 1,
            fingerprint: {
              platform: fp.platform,
              webgl: fp.webgl,
              hardwareConcurrency: fp.hardwareConcurrency,
              deviceMemory: fp.deviceMemory,
              language: fp.locale,
              isMobile: fp.isMobile,
              browser: fp.browser,
              version: fp.version,
              device: fp.device,
            },
            sessionFingerprintId: sessionFp?.fingerprintId,
          };
        }
      } catch (err) {
        lastError = err;
        const classification = VisitEngine.classifyError(err);

        if (classification.type === 'target' && err.response?.status >= 500) {
          throw { ...err, classified: classification };
        }

        if (attempt < maxRetries) {
          const backoff =
            this.config.retryBackoffBase * Math.pow(2, attempt) +
            Math.floor(Math.random() * this.config.retryBackoffBase);
          logger.warn(
            `Retry ${attempt + 1}/${maxRetries} for ${urlEntry.subdomain} in ${backoff}ms (${classification.type}: ${classification.message})`
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    throw lastError;
  }

  // -----------------------------------------------------------------------
  // Execute one full visit: pick proxy + URL, run, record, return result
  // -----------------------------------------------------------------------
  async executeVisit(options = {}) {
    const start = Date.now();
    const visitId = uuidv4();

    // --- Demo mode: simulate a successful visit (no network) ---
    if (this.config.demoMode) {
      const proxy = this.proxyManager.getRandom();
      const urlEntry = this.urlManager.getRandom();
      if (!proxy || !urlEntry) return { success: false, error: 'No proxy or URL available' };

      const latency = Math.floor(Math.random() * 1500) + 200;
      this.visitCount++;
      this.successCount++;
      this.proxyManager.recordSuccess(proxy, latency);
      this.urlManager.recordVisit(urlEntry.url, true);

      const fp = getRandomFingerprint();
      const deviceProfile = this.deviceManager ? this.deviceManager.getDeviceProfile() : null;
      const userAgent = deviceProfile?.userAgent || fp.ua;
      const referrer = this.socialReferral && Math.random() < 0.4
        ? this.socialReferral.generateReferer()
        : (this.searchSimulator ? this.searchSimulator.generateReferrer() : getRandomReferrer());
      const finalUrl = this.utmManager ? this.utmManager.buildParams(urlEntry.url) : urlEntry.url;

      const result = {
        visitId,
        success: true,
        url: finalUrl,
        subdomain: urlEntry.subdomain,
        proxy: { host: proxy.host, country: proxy.country, city: proxy.city, flag: proxy.flag },
        statusCode: 200,
        latency,
        userAgent,
        referrer,
        deviceType: deviceProfile?.deviceType || 'desktop',
        responseSize: Math.floor(Math.random() * 50000) + 5000,
        mode: 'demo',
        timestamp: new Date().toISOString(),
        fingerprint: {
          platform: fp.platform,
          webgl: fp.webgl,
          hardwareConcurrency: fp.hardwareConcurrency,
          deviceMemory: fp.deviceMemory,
          language: fp.locale,
          isMobile: fp.isMobile,
          browser: fp.browser,
          version: fp.version,
          device: fp.device,
        },
      };
      this._persist(result);
      logger.info(`🧪 Demo visit #${this.visitCount}: ${urlEntry.subdomain} via ${proxy.flag}${proxy.city} (${latency}ms) [${result.deviceType}]`);
      return result;
    }

    // --- Real visit ---
    const proxy = this.proxyManager.select(options.proxyStrategy || 'random');
    if (!proxy) {
      logger.error('No active proxy available — visit skipped');
      return { success: false, error: 'No active proxy', visitId, timestamp: new Date().toISOString() };
    }

    const urlEntry = this.urlManager.getRandom();
    if (!urlEntry) {
      logger.error('No active URL available — visit skipped');
      return { success: false, error: 'No active URL', visitId, timestamp: new Date().toISOString() };
    }

    // Get persistent fingerprint
    const sessionFp = this.sessionPersistence ? await this.sessionPersistence.getOrCreateFingerprint(options.fingerprintId) : null;
    const fp = sessionFp?.profile || getRandomFingerprint();

    // Sprint 2 + 3: device-matched UA, mixed referrer (search + social), UTM params
    const deviceProfile = this.deviceManager ? this.deviceManager.getDeviceProfile() : null;
    const userAgent = options.userAgent || deviceProfile?.userAgent || fp.ua;

    // Referrers: mix of search (Google/Bing/DDG) and social (FB/Twitter/Reddit/etc.)
    let referrer;
    if (options.referrer) {
      referrer = options.referrer;
    } else if (this.socialReferral && Math.random() < 0.4) {
      referrer = this.socialReferral.generateReferer();
    } else if (this.searchSimulator) {
      referrer = this.searchSimulator.generateReferrer();
    } else {
      referrer = getRandomReferrer();
    }

    const finalUrl = this.utmManager ? this.utmManager.buildParams(urlEntry.url) : urlEntry.url;

    // Sprint 3: pick network condition for browser mode (F3.9)
    const connectionType = deviceProfile?.connectionType || null;

    let outcome;
    try {
      if (this.config.mode === 'browser' || this.config.mode === 'mixed') {
        outcome = await runBrowserVisit({
          proxy,
          url: finalUrl,
          userAgent,
<<<<<<< HEAD
          headless: options.headless ?? this.config.headless,
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
          timeout: options.timeout || this.config.requestTimeout,
          sessionSeed: options.sessionSeed,
          screenshot: options.screenshot || this.config.screenshotOnVisit,
          analyticsManager: this.analyticsManager,
          captchaSolver: this.captchaSolver,
          contentVerifier: this.contentVerifier,
          connectionType,
          adViewability: this.adViewability,
          screenshotSystem: this.screenshotSystem,
          fingerprint: fp,
          sessionPersistence: this.sessionPersistence,
          clientId: options.clientId,
<<<<<<< HEAD
          behaviorDirector: this.behaviorDirector,
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
        });
        if (!outcome.success) {
          throw new Error(outcome.error || 'Browser visit failed');
        }
      } else {
        outcome = await this._httpVisit(proxy, { ...urlEntry, url: finalUrl }, { ...options, userAgent, referrer, fingerprintId: sessionFp?.fingerprintId });
      }
    } catch (err) {
      const latency = Date.now() - start;
      const classification = VisitEngine.classifyError(err);

      this.visitCount++;
      this.failCount++;
      this.proxyManager.recordFailure(proxy, classification.type);
      this.urlManager.recordVisit(urlEntry.url, false);

      // Sprint 3: flag proxy if detection/block
      if (this.proxyIntelligence && (classification.type === 'proxy' || classification.message.includes('403') || classification.message.includes('blocked'))) {
        this.proxyIntelligence.flagDetection(proxy, classification.type);
      }

      const result = {
        visitId,
        success: false,
        url: finalUrl,
        subdomain: urlEntry.subdomain,
        proxy: { host: proxy.host, country: proxy.country, city: proxy.city, flag: proxy.flag },
        statusCode: err.response?.status || 0,
        latency,
        userAgent,
        referrer,
        deviceType: deviceProfile?.deviceType || 'desktop',
        error: classification.message,
        errorType: classification.type,
        mode: this.config.mode,
        timestamp: new Date().toISOString(),
      };
      this._persist(result);
      logger.warn(
        `❌ Visit #${this.visitCount}: ${urlEntry.subdomain} via ${proxy.flag} ${proxy.city} (${latency}ms) [${classification.type}] ${classification.message}`
      );
      return result;
    }

    // --- Success path ---
    const latency = outcome.latency ?? Date.now() - start;
    this.visitCount++;
    this.successCount++;
    this.proxyManager.recordSuccess(proxy, latency);
    this.urlManager.recordVisit(urlEntry.url, true);

    // Sprint 3: update proxy trust score
    if (this.proxyIntelligence) {
      this.proxyIntelligence.updateTrustScore(proxy, {
        latency,
        success: 1,
      });
    }

    const result = {
      visitId,
      success: true,
      url: finalUrl,
      subdomain: urlEntry.subdomain,
      proxy: { host: proxy.host, country: proxy.country, city: proxy.city, flag: proxy.flag },
      statusCode: outcome.statusCode,
      latency,
      userAgent,
      referrer,
      deviceType: deviceProfile?.deviceType || 'desktop',
      responseSize: outcome.responseSize,
      mode: this.config.mode,
      attempts: outcome.attempts,
      verification: outcome.verification || null,
      captchaSolved: outcome.captchaSolved || false,
      adViewability: outcome.adViewability || null,
      fingerprint: outcome.fingerprint || null,
      sessionFingerprintId: outcome.sessionFingerprintId || sessionFp?.fingerprintId,
      timestamp: new Date().toISOString(),
    };
    this._persist(result);
    logger.info(
      `✅ Visit #${this.visitCount}: ${urlEntry.subdomain} via ${proxy.flag} ${proxy.city} (${latency}ms) [${result.mode} | ${result.deviceType}]`
    );
    return result;
  }

  // -----------------------------------------------------------------------
  // Execute a full session (multi-page visit) via the session manager.
  // -----------------------------------------------------------------------
  async executeSession(options = {}) {
    if (!this.sessionManager) {
      logger.warn('Session mode requested but no session manager available — falling back to single visit');
      return this.executeVisit(options);
    }

    const proxy = this.proxyManager.select(options.proxyStrategy || 'random');
    if (!proxy) {
      return { success: false, error: 'No active proxy', timestamp: new Date().toISOString() };
    }

    const urlEntry = this.urlManager.getRandom();
    if (!urlEntry) {
      return { success: false, error: 'No active URL', timestamp: new Date().toISOString() };
    }

    // Check for a return visitor profile (stable fingerprint, proxy affinity)
    const returnProfile = await this.sessionManager.shouldReturnVisitor?.(proxy.country) || null;
    const fingerprintSeed = returnProfile?.fingerprintSeed || Math.floor(Math.random() * 1e9);

    const sessionResult = await this.sessionManager.executeSession(this, {
      url: urlEntry.url,
      proxy,
      userAgent: returnProfile?.user_agent || getRandomFingerprint().ua,
      referrer: getRandomReferrer(),
      screenshot: this.config.screenshotOnVisit,
    });

    // Persist profile visit if this was a return visitor
    if (returnProfile?.id) {
      await this.sessionManager.profileManager?.recordVisit?.(returnProfile.id, {
        url: urlEntry.url,
        pages: sessionResult.pagesVisited,
        latency: sessionResult.totalTime,
      });
    }

    this.sessionCount++;
    sessionResult.visitId = uuidv4();
    sessionResult.url = urlEntry.url;
    sessionResult.subdomain = urlEntry.subdomain;
    sessionResult.proxy = { host: proxy.host, country: proxy.country, city: proxy.city, flag: proxy.flag };
    sessionResult.isReturning = !!returnProfile;
    sessionResult.mode = this.config.mode;
    sessionResult.timestamp = new Date().toISOString();

    logger.info(
      `🌐 Session #${this.sessionCount}: ${urlEntry.subdomain} → ${sessionResult.pagesVisited} pages ` +
      `[${sessionResult.willBounce ? 'bounce' : 'engaged'}] ${sessionResult.isReturning ? '(returning visitor)' : ''}`
    );

    return sessionResult;
  }

  _persist(result) {
    try {
      this.insertVisit.run(
        result.visitId,
        result.url,
        result.subdomain,
        result.proxy?.host || '',
        result.proxy?.country || '',
        result.proxy?.city || '',
        result.statusCode || 0,
        result.latency || 0,
        result.userAgent || '',
        result.referrer || '',
        result.success ? 1 : 0,
        result.error || null,
        result.errorType || null,
        result.mode || 'http',
        result.responseSize || 0,
        result.screenshotPath || null,
        result.deviceType || null
      );
    } catch (err) {
      logger.error(`Failed to persist visit ${result.visitId}: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------
  getStats() {
    const uptime = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    const rate = uptime > 0 ? Math.round((this.visitCount / uptime) * 3600) : 0;

    return {
      totalVisits: this.visitCount,
      successCount: this.successCount,
      failCount: this.failCount,
      successRate: this.visitCount > 0 ? Math.round((this.successCount / this.visitCount) * 100) : 0,
      visitsPerHour: rate,
      uptime,
      mode: this.config.mode,
      demoMode: this.config.demoMode,
      sessionMode: this.config.sessionMode,
      sessionCount: this.sessionCount || 0,
      activeProxies: this.proxyManager.getActiveProxies().length,
      totalProxies: this.proxyManager.proxies.length,
      activeUrls: this.urlManager.urls.filter((u) => u.enabled).length,
      totalUrls: this.urlManager.urls.length,
    };
  }

  reset() {
    this.visitCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.startTime = null;
  }

  configure(newConfig) {
    Object.assign(this.config, newConfig);
  }
}

export default VisitEngine;
