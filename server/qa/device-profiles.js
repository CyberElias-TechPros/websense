// ============================================================================
// qa/device-profiles.js — Declared device emulation profiles for QA testing.
//
// These describe real desktop/mobile/tablet form factors so the QA runner can
// answer "what does a user on device X actually receive from my site?".
// This is standard device emulation (like browser DevTools or Playwright/BrowserStack
// descriptors): consistent UA ↔ viewport ↔ touch per profile. There is no
// stealth/evasion here — the QA runner identifies itself via the X-Websense-QA
// header so operators can whitelist/filter it in their own logs and analytics.
// ============================================================================

export const DEVICE_PROFILES = [
  {
    id: 'desktop-chrome-win',
    label: 'Desktop · Chrome / Windows',
    shortLabel: 'Desktop (Win)',
    type: 'desktop',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
  {
    id: 'desktop-safari-mac',
    label: 'Desktop · Safari / macOS',
    shortLabel: 'Desktop (Mac)',
    type: 'desktop',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
  {
    id: 'desktop-firefox-linux',
    label: 'Desktop · Firefox / Linux',
    shortLabel: 'Desktop (Linux)',
    type: 'desktop',
    userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    viewport: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
  {
    id: 'mobile-iphone-safari',
    label: 'Mobile · iPhone / Safari',
    shortLabel: 'iPhone',
    type: 'mobile',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  },
  {
    id: 'mobile-android-chrome',
    label: 'Mobile · Android / Chrome',
    shortLabel: 'Android',
    type: 'mobile',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  },
  {
    id: 'tablet-ipad-safari',
    label: 'Tablet · iPad / Safari',
    shortLabel: 'iPad',
    type: 'tablet',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  },
];

/**
 * Browser Accept-Language that a typical user in a country would send.
 * Used so a "UK vantage" also looks up UK-locale content — geo-targeted
 * content commonly keys off Accept-Language as much as IP location.
 */
export const LANGUAGE_BY_COUNTRY = {
  US: 'en-US,en;q=0.9',
  GB: 'en-GB,en;q=0.9',
  UK: 'en-GB,en;q=0.9',
  ES: 'es-ES,es;q=0.9,en;q=0.8',
  DE: 'de-DE,de;q=0.9,en;q=0.8',
  PL: 'pl-PL,pl;q=0.9,en;q=0.8',
  FR: 'fr-FR,fr;q=0.9,en;q=0.8',
  IT: 'it-IT,it;q=0.9,en;q=0.8',
  PT: 'pt-PT,pt;q=0.9,en;q=0.8',
  BR: 'pt-BR,pt;q=0.9,en;q=0.8',
  NL: 'nl-NL,nl;q=0.9,en;q=0.8',
  NG: 'en-NG,en;q=0.9',
  CA: 'en-CA,en;q=0.9,fr;q=0.8',
  AU: 'en-AU,en;q=0.9',
  IN: 'en-IN,en;q=0.9,hi;q=0.8',
};
export const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

export function languageForCountry(countryCode) {
  if (!countryCode) return DEFAULT_ACCEPT_LANGUAGE;
  return LANGUAGE_BY_COUNTRY[String(countryCode).toUpperCase()] || DEFAULT_ACCEPT_LANGUAGE;
}

export function getDeviceProfile(id) {
  return DEVICE_PROFILES.find((p) => p.id === id) || null;
}

export function listDeviceProfiles() {
  return DEVICE_PROFILES.map((p) => ({
    id: p.id,
    label: p.label,
    shortLabel: p.shortLabel,
    type: p.type,
    viewport: p.viewport,
  }));
}

export default DEVICE_PROFILES;
