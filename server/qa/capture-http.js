// ============================================================================
// qa/capture-http.js — HTTP(S) capture for one QA cell.
//
// Fetches a URL exactly as a QA probe should: declared purpose (X-Websense-QA
// header), the device profile's real UA, the vantage country's natural
// Accept-Language, a manually-followed redirect chain (so loops and block
// redirects are visible), a hard response-size cap, and no stealth of any kind.
// ============================================================================

import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { normalizeText, contentHash } from './compare.js';
import { analyzeCell, QA_CLASS } from './signals.js';

/**
 * Build an axios agent for a proxy descriptor.
 * @param {{host:string, port:number, username?:string, password?:string, type?:string}} proxy
 * @param {boolean} targetIsHttps
 */
export function agentForProxy(proxy, targetIsHttps = true) {
  if (!proxy) return undefined;
  const cred =
    proxy.username != null && proxy.username !== ''
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
      : '';
  const type = String(proxy.type || 'http').toLowerCase();

  if (type.startsWith('socks')) {
    // socks5h = remote DNS through the proxy (so the vantage's resolver is used)
    return new SocksProxyAgent(`socks${type === 'socks4' ? '4' : '5h'}://${cred}${proxy.host}:${proxy.port}`);
  }
  const proxyUrl = `http://${cred}${proxy.host}:${proxy.port}`;
  return targetIsHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
}

/** Classify an axios/network error into a short machine-readable reason. */
export function classifyNetworkError(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  if (code === 'ECONNABORTED' || /timeout/i.test(msg)) return 'timeout';
  if (code === 'ECONNREFUSED') return 'connection-refused';
  if (code === 'ECONNRESET' || code === 'EPIPE') return 'connection-reset';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns-failure';
  if (/407/.test(msg) || /Proxy Authentication Required/i.test(msg)) return 'proxy-auth-407';
  if (/tunnel|CONNECT/i.test(msg)) return 'proxy-tunnel-failed';
  if (/certificate|CERT_|SSL/i.test(code + msg)) return 'tls-error';
  return 'network-error';
}

/**
 * Capture one URL in HTTP mode.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {object} opts.deviceProfile      entry from device-profiles.js
 * @param {object} [opts.proxy]            proxy descriptor or null/undefined for direct
 * @param {string} [opts.acceptLanguage]
 * @param {object} [opts.extraHeaders]     testing hooks (e.g. simulate a country header)
 * @param {string} [opts.runId]            sent as X-Websense-QA when identifyHeader on
 * @param {boolean}[opts.identifyHeader]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxBytes]
 * @param {number} [opts.maxRedirects]
 * @returns {object} cell capture result (see runner for how it's persisted)
 */
export async function captureHttp({
  url,
  deviceProfile,
  proxy = null,
  acceptLanguage = 'en-US,en;q=0.9',
  extraHeaders = {},
  runId = '',
  identifyHeader = true,
  timeoutMs = 30000,
  maxBytes = 512 * 1024,
  maxRedirects = 10,
}) {
  const started = Date.now();
  const redirectChain = [];
  let currentUrl = url;
  let hops = 0;
  let res = null;

  const targetIsHttps = /^https:/i.test(url);
  const agentOpts = proxy
    ? {
        httpAgent: agentForProxy(proxy, false),
        httpsAgent: agentForProxy(proxy, true),
        proxy: false, // never let axios use env proxy vars — vantage is explicit
      }
    : { proxy: false };

  const baseHeaders = {
    'User-Agent': deviceProfile.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': acceptLanguage,
    'Cache-Control': 'no-cache',
    ...(identifyHeader && runId ? { 'X-Websense-QA': `run:${runId}` } : {}),
    ...extraHeaders,
  };

  try {
    // Follow redirects manually so the QA report shows the full chain.
    while (true) {
      res = await axios.get(currentUrl, {
        ...agentOpts,
        timeout: timeoutMs,
        maxRedirects: 0,
        maxContentLength: maxBytes,
        responseType: 'text',
        transformResponse: [(d) => d], // raw string; we parse what we need
        validateStatus: () => true,    // handle every status ourselves
        headers: baseHeaders,
        decompress: true,
      });

      redirectChain.push({
        url: currentUrl,
        status: res.status,
        location: res.headers?.location || null,
      });

      if ([301, 302, 303, 307, 308].includes(res.status) && res.headers?.location && hops < maxRedirects) {
        currentUrl = new URL(res.headers.location, currentUrl).toString();
        hops++;
        continue;
      }
      break;
    }
  } catch (err) {
    return {
      requestedUrl: url,
      finalUrl: currentUrl,
      statusCode: null,
      headers: {},
      title: '',
      text: '',
      normalized: '',
      contentHash: '',
      textSample: '',
      redirectChain,
      durationMs: Date.now() - started,
      error: classifyNetworkError(err),
      errorMessage: String(err?.message || err).slice(0, 300),
      classification: QA_CLASS.NETWORK_ERROR,
      signals: [],
      geoBlocked: false,
      deviceBlocked: false,
      redirectLoop: false,
    };
  }

  const durationMs = Date.now() - started;
  const finalUrl = redirectChain.length
    ? redirectChain[redirectChain.length - 1].location
      ? new URL(redirectChain[redirectChain.length - 1].location, redirectChain[redirectChain.length - 1].url).toString()
      : currentUrl
    : currentUrl;

  const body = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const normalized = normalizeText(body);
  const hash = contentHash(normalized);

  // Keep only response headers that are useful for QA (avoid storing junk).
  const keepHeaders = {};
  for (const [k, v] of Object.entries(res.headers || {})) {
    if (
      /^(content-type|content-language|server|via|x-cache|cf-|x-frame-options|content-security-policy|location|set-cookie)/i.test(k) &&
      typeof v === 'string'
    ) {
      keepHeaders[k.toLowerCase()] = v.slice(0, 500);
    }
  }

  const analysis = analyzeCell({
    statusCode: res.status,
    title,
    text: normalized,
    redirectChain,
    requestedUrl: url,
    finalUrl,
    headers: keepHeaders,
    deviceType: deviceProfile.type,
  });

  return {
    requestedUrl: url,
    finalUrl,
    statusCode: res.status,
    headers: keepHeaders,
    title,
    text: '',
    normalized,
    contentHash: hash,
    textSample: normalized.slice(0, 2000),
    redirectChain,
    durationMs,
    error: null,
    errorMessage: null,
    classification: QA_CLASS.PENDING, // finalize against baseline in runner
    ...analysis,
  };
}

export default captureHttp;
