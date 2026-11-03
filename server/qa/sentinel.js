// ============================================================================
// qa/sentinel.js — REFERENCE middleware for YOUR OWN properties.
//
// This is the other half of the blue-hat loop: websense generates behavior;
// sentinel (mounted on the sites you operate) tries to DETECT it. Copy this
// middleware into your site's Node/Express stack (or reimplement the rules in
// your CDN/WAF of choice) and watch which generated patterns get scored.
//
// It never blocks by itself — it annotates requests and emits observations so
// you can calibrate thresholds without impacting real users.
//
//   import createSentinel from './sentinel.js';
//   app.use(createSentinel({
//     onObservation: (obs) => fetch('https://your-websense/api/qa/sentinel/ingest', {...}),
//   }));
//
// Defensive-only design: reads request telemetry, produces a bot-score and
// human-readable signals. Requests carrying our own X-Websense-QA header are
// tagged as 'self-probe' so calibration traffic is separable from real users.
// ============================================================================

const KNOWN_BOT_UA = [
  /bot\b|crawler|spider|slurp|crawling/i,
  /headlesschrome|phantomjs|puppeteer|playwright/i,
  /curl|wget|python-requests|aiohttp|httpie|axios\//i,
  /uptime|pingdom|statuscake/i,
];

/**
 * Score one request's telemetry. Returns { score(0-100, higher=bot-like),
 * signals[], selfProbe }.
 */
export function scoreRequest({
  ip = '',
  ua = '',
  headers = {},
  hasCookies = false,
  recentRequestCount = 0,   // requests from this ip/ua in the trailing window
  windowSeconds = 60,
}) {
  const signals = [];
  let score = 0;

  // 1. Our own QA probes are tagged, not scored as attacks.
  const selfProbe = !!headers['x-websense-qa'];

  // 2. Reputation-by-shape: known automation UAs.
  if (KNOWN_BOT_UA.some((re) => re.test(ua))) {
    signals.push({ id: 'automation-ua', points: 50 });
    score += 50;
  }

  // 3. Browser-dressing gaps on browser UAs.
  const isBrowserUA = /mozilla\/5\.0/i.test(ua);
  if (isBrowserUA) {
    if (!headers['accept-language']) { signals.push({ id: 'no-accept-language', points: 20 }); score += 20; }
    if (!Object.keys(headers).some((k) => k.startsWith('sec-fetch'))) {
      signals.push({ id: 'no-fetch-metadata', points: 15 });
      score += 15;
    }
    if (!hasCookies) { signals.push({ id: 'no-cookies-on-revisit', points: 10 }); score += 10; }
  }

  // 4. Burstiness from one identity.
  if (recentRequestCount >= 20 && windowSeconds <= 60) {
    signals.push({ id: 'rapid-fire', points: 30, detail: `${recentRequestCount}/${windowSeconds}s` });
    score += 30;
  } else if (recentRequestCount >= 8 && windowSeconds <= 60) {
    signals.push({ id: 'elevated-rate', points: 10 });
    score += 10;
  }

  return { score: Math.min(100, score), signals, selfProbe };
}

/**
 * Express middleware factory. Keeps a small in-memory rate window per
 * ip+ua identity, annotates req.sentinel = observation, and forwards every
 * observation to opts.onObservation (if provided).
 */
export default function createSentinel({ onObservation = null, windowMs = 60_000, verbose = false } = {}) {
  const hits = new Map(); // identity -> number[] (timestamps)

  return function sentinel(req, res, next) {
    const now = Date.now();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const identity = `${ip}|${ua.slice(0, 120)}`;

    const cutoff = now - windowMs;
    const list = (hits.get(identity) || []).filter((t) => t >= cutoff);
    list.push(now);
    hits.set(identity, list);
    if (hits.size > 5000) {
      // bound memory: drop stale identities
      for (const [k, v] of hits) if (!v.length || v[v.length - 1] < cutoff) hits.delete(k);
    }

    const obs = scoreRequest({
      ip,
      ua,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
      hasCookies: !!req.headers.cookie,
      recentRequestCount: list.length,
      windowSeconds: Math.round(windowMs / 1000),
    });

    const observation = {
      at: new Date(now).toISOString(),
      path: req.originalUrl || req.url,
      ip,
      ...obs,
    };
    req.sentinel = observation;
    res.setHeader('X-Sentinel-Score', String(observation.score)); // visible in devtools — helps calibration

    if (verbose && (observation.score >= 40 || observation.selfProbe)) {
      // eslint-disable-next-line no-console
      console.log('[sentinel]', JSON.stringify(observation));
    }
    if (onObservation) {
      try { onObservation(observation, req); } catch { /* never block the app */ }
    }
    next();
  };
}
