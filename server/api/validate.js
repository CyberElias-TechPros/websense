// ============================================================================
// validate.js — Input validation for the REST API + engine-config patches.
// Pure functions (unit-testable, no express deps).
// ============================================================================

const PROXY_TYPES = ['http', 'https', 'socks4', 'socks5', 'socks'];
const PROXY_SOURCES = ['manual', 'webshare', 'free', 'import'];
const HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

function isValidHost(host) {
  if (typeof host !== 'string' || !host || host.length > 253) return false;
  if (!HOST_RE.test(host)) return false;
  if (host.includes('.')) {
    // IPv4 octets must be 0-255
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return host.split('.').every((o) => parseInt(o, 10) <= 255);
    }
  }
  return true;
}

/**
 * Validate a proxy payload (POST /api/proxies).
 * Returns { ok, errors[], value? } — value is the sanitized object.
 */
export function validateProxyInput(body) {
  const errors = [];
  const b = body || {};
  const host = typeof b.host === 'string' ? b.host.trim() : '';
  if (!isValidHost(host)) errors.push('host must be a valid IPv4 address or hostname');

  const port = parseInt(b.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('port must be an integer 1-65535');

  let type = typeof b.type === 'string' ? b.type.toLowerCase() : 'http';
  if (!PROXY_TYPES.includes(type)) errors.push(`type must be one of ${PROXY_TYPES.join(', ')}`);
  if (type === 'socks') type = 'socks5';
  if (type === 'https') type = 'http'; // normalized by the network layer

  let source = typeof b.source === 'string' && b.source ? b.source.toLowerCase() : 'manual';
  if (!PROXY_SOURCES.includes(source)) source = 'manual';

  const username = b.username != null && b.username !== '' ? String(b.username) : null;
  const password = b.password != null && b.password !== '' ? String(b.password) : null;
  if ((username === null) !== (password === null)) errors.push('username and password must be provided together');

  const country = b.country ? String(b.country).toUpperCase().slice(0, 2) : null;
  if (country && !/^[A-Z]{2}$/.test(country)) errors.push('country must be a 2-letter ISO code');

  const city = b.city ? String(b.city).slice(0, 100) : null;
  const flag = b.flag ? String(b.flag).slice(0, 8) : '🌐';

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { host, port, type, source, username, password, country, city, flag } };
}

/**
 * Validate a target URL (POST /api/urls). Only http/https allowed.
 * Returns { ok, errors[], value? } — value is the normalized URL string.
 */
export function validateUrlInput(body) {
  const errors = [];
  const raw = typeof (body?.url) === 'string' ? body.url.trim() : '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, errors: ['url must be a valid absolute URL'] };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    errors.push('only http:// and https:// URLs are allowed');
  }
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
    errors.push('url must have a real hostname');
  }
  if (raw.length > 2048) errors.push('url too long (max 2048 chars)');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: parsed.toString() };
}

// ---------------------------------------------------------------------------
// Engine config patch schema (PATCH /api/config)
// ---------------------------------------------------------------------------
const int = (v, lo, hi) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

export const ENGINE_CONFIG_SCHEMA = {
  minInterval: (v) => int(v, 500, 3600000),
  maxInterval: (v) => int(v, 500, 3600000),
  concurrency: (v) => int(v, 1, 20),
  requestTimeout: (v) => int(v, 1000, 300000),
  retryAttempts: (v) => int(v, 0, 10),
  mode: (v) => (['http', 'browser', 'mixed'].includes(v) ? v : null),
  headless: (v) => (typeof v === 'boolean' ? v : null),
};

/**
 * Validate/sanitize a PATCH /api/config body.
 * `current` = the live config's schema keys, so cross-field rules (e.g.
 * maxInterval >= minInterval) are checked against the MERGED result, not just
 * the keys present in the patch.
 * Returns { ok, errors[], value? } — value contains only valid known keys.
 */
export function validateEngineConfigPatch(body, current = {}) {
  const errors = [];
  const value = {};
  const b = body || {};
  for (const [key, validate] of Object.entries(ENGINE_CONFIG_SCHEMA)) {
    if (b[key] === undefined) continue;
    const v = validate(b[key]);
    if (v === null) errors.push(`${key}: invalid value`);
    else value[key] = v;
  }
  const unknown = Object.keys(b).filter((k) => !(k in ENGINE_CONFIG_SCHEMA));
  if (unknown.length) errors.push(`unknown config keys: ${unknown.join(', ')}`);
  const mergedMin = value.minInterval ?? current.minInterval;
  const mergedMax = value.maxInterval ?? current.maxInterval;
  if (mergedMin !== undefined && mergedMax !== undefined && mergedMax < mergedMin) {
    errors.push('maxInterval must be >= minInterval');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value };
}
