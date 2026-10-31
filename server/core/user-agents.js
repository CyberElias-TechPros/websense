// ============================================================================
// user-agents.js — User-Agent & fingerprint pool.
// Re-exports from fingerprint-generator.js (2000+ profiles) and provides
// helper functions for client hints, plugins, MIME types, and encoding.
// ============================================================================

export {
  generateFingerprintPool,
  getRandomFingerprint,
  getFingerprintBySeed,
  getFingerprintPool,
  getFingerprintPoolSize,
} from './fingerprint-generator.js';

// ---------------------------------------------------------------------------
// Plugin & MIME type databases
// ---------------------------------------------------------------------------

const chromePlugins = [
  { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format (PDF) virtual viewer',
    versions: ['2.0.3031.109'] },
  { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format (PDF) virtual viewer',
    versions: ['2.0.3031.109'] },
  { name: 'Native Client', filename: 'internal-nacl-plugin', description: '',
    versions: ['2.0.3031.109'] },
];

const firefoxPlugins = [
  { name: 'PDF Viewer', filename: 'pdfjs-disabled', description: 'Portable Document Format (PDF) virtual viewer' },
  { name: 'Gather', filename: 'gather-plugin@', description: 'Gather' },
];

const safariPlugins = [
  { name: 'QuickTime Plugin', filename: 'quicktimeplugin', description: 'QuickTime' },
];

const chromeMimeTypes = [
  { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
  { type: 'application/x-chrome-extension', suffixes: '', description: '' },
  { type: 'text/pdf', suffixes: 'pdf', description: '' },
  { type: 'application/x-google-chrome-etldc', suffixes: '', description: '' },
];

const firefoxMimeTypes = [
  { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
  { type: 'text/html', suffixes: '', description: 'HTML Document' },
  { type: 'application/x-shockwave-flash', suffixes: 'swf', description: 'Shockwave Flash' },
];

const referrers = [
  'https://www.google.com/',
  'https://www.google.com/search?q=free+games',
  'https://www.google.com/search?q=play+games+online',
  'https://www.google.com/search?q=online+casino',
  'https://www.google.com/search?q=free+slots',
  'https://www.google.com/search?q=best+online+games',
  'https://www.google.com/search?q=free+movies',
  'https://www.google.com/search?q=watch+movies+online',
  'https://www.google.com/search?q=news',
  'https://www.google.com/search?q=weather',
  'https://www.bing.com/',
  'https://www.bing.com/search?q=free+online+games',
  'https://www.bing.com/search?q=online+gambling',
  'https://www.bing.com/search?q=free+movies+online',
  'https://duckduckgo.com/',
  'https://www.facebook.com/',
  'https://www.facebook.com/feed/',
  'https://www.facebook.com/watch/',
  'https://twitter.com/',
  'https://twitter.com/explore',
  'https://www.reddit.com/',
  'https://www.reddit.com/r/games/',
  'https://www.reddit.com/r/webgames/',
  'https://www.reddit.com/r/onlinegaming/',
  'https://www.youtube.com/',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.pinterest.com/',
  'https://www.linkedin.com/',
  'https://www.tiktok.com/',
  'https://www.instagram.com/',
  'https://www.quora.com/',
  'https://news.ycombinator.com/',
  'https://www.tumblr.com/',
  'https://www.twitch.tv/',
  'https://discord.com/',
  'https://www.telegram.org/',
  'https://www.snapchat.com/',
  'https://www.threads.net/',
  'https://www.mastodon.social/',
  'https://www.weibo.com/',
  'https://www.vk.com/',
  'https://www.pinterest.co.uk/',
  '',
  '',
];

export function getRandomReferrer() {
  return referrers[Math.floor(Math.random() * referrers.length)];
}

export function getReferrerPool() {
  return [...referrers];
}

// ---------------------------------------------------------------------------
// Referer chain generation — realistic multi-hop referer paths
// ---------------------------------------------------------------------------
const SEARCH_QUERIES = [
  'free games', 'play games online', 'online casino', 'free slots',
  'best online games', 'free movies', 'watch movies online', 'news',
  'weather', 'how to play poker', 'sports betting', 'crypto casino',
  'live casino', 'roulette online', 'blackjack online', 'slots real money',
  'online bingo', 'lottery online', 'bet365', 'poker online',
];

/**
 * Generate a realistic referer chain: search → social → target
 * Returns array of referer URLs from most recent to oldest.
 */
export function generateRefererChain(depth = 2) {
  const chain = [];
  const searchEngines = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com'];
  const socialSites = ['facebook.com', 'twitter.com', 'reddit.com', 'pinterest.com', 'tumblr.com', 'twitch.tv'];

  for (let i = 0; i < depth; i++) {
    const rand = Math.random();
    if (rand < 0.45) {
      // Search engine
      const engine = searchEngines[Math.floor(Math.random() * searchEngines.length)];
      const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
      const path = engine === 'google.com' ? 'search?q=' :
                    engine === 'bing.com' ? 'search?q=' :
                    engine === 'yahoo.com' ? 'search?p=' : '?q=';
      chain.push(`https://www.${engine}/${path}${encodeURIComponent(query)}`);
    } else if (rand < 0.75) {
      // Social media
      const social = socialSites[Math.floor(Math.random() * socialSites.length)];
      const paths = {
        'facebook.com': ['', '/feed/', '/watch/', '/groups/'],
        'twitter.com': ['', '/explore', '/home', '/i/flow/login'],
        'reddit.com': ['', '/r/games/', '/r/webgames/', '/r/onlinegaming/', '/r/casino/'],
        'pinterest.com': ['', '/pins/', '/search/'],
        'tumblr.com': ['', '/dashboard'],
        'twitch.tv': ['', '/directory', '/following'],
      };
      const pathsFor = paths[social] || [''];
      chain.push(`https://www.${social}/${pathsFor[Math.floor(Math.random() * pathsFor.length)]}`);
    } else {
      // Direct or empty
      chain.push(referrers[Math.floor(Math.random() * referrers.length)]);
    }
  }

  return chain;
}

/**
 * Get the immediate referer (most recent in chain).
 */
export function getImmediateReferer(chain) {
  return chain[0] || '';
}

/**
 * Get client hints headers (Sec-CH-UA) for the given profile.
 */
export function getClientHintsHeaders(profile) {
  if (!profile.clientHints) return {};
  const ch = profile.clientHints;
  const brands = ch.brands.map(b => `${b.brand}=${b.version}`).join(', ');
  return {
    'Sec-CH-UA': `"${brands}"`,
    'Sec-CH-UA-Mobile': String(ch.mobile),
    'Sec-CH-UA-Platform': `"${ch.platform}"`,
  };
}

/**
 * Get realistic plugins for the given profile.
 */
export function getPlugins(profile) {
  if (profile.browser === 'chrome' || profile.browser === 'edge') return chromePlugins;
  if (profile.browser === 'firefox') return firefoxPlugins;
  if (profile.browser === 'safari') return safariPlugins;
  return chromePlugins;
}

/**
 * Get realistic MIME types for the given profile.
 */
export function getMimeTypes(profile) {
  if (profile.browser === 'chrome' || profile.browser === 'edge') return chromeMimeTypes;
  if (profile.browser === 'firefox') return firefoxMimeTypes;
  return chromeMimeTypes;
}

/**
 * Get Accept-Encoding header matching the browser.
 */
export function getAcceptEncoding(profile) {
  if (profile.browser === 'firefox') return 'gzip, deflate, br, zstd';
  if (profile.browser === 'safari') return 'gzip, deflate, br';
  return 'gzip, deflate, br, zstd';
}

/**
 * Get timezone offset for the profile's locale.
 */
export function getTimezoneForProfile(profile) {
  if (profile.timezone) return profile.timezone;
  const tzMap = {
    'en-US': ['America/New_York', 'America/Los_Angeles', 'America/Chicago'],
    'en-GB': ['Europe/London'],
    'de-DE': ['Europe/Berlin'],
    'pl-PL': ['Europe/Warsaw'],
    'es-ES': ['Europe/Madrid'],
    'fr-FR': ['Europe/Paris'],
  };
  const tzs = tzMap[profile.locale] || tzMap['en-US'];
  return tzs[Math.floor(Math.random() * tzs.length)];
}
