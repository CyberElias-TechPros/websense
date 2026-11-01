// ============================================================================
// urls.js — Target URL registry.
// All 27 target URLs. Centralized here so the pool can be modified without
// touching engine code. Each URL gets a derived `subdomain` metadata field.
// ============================================================================

export const TARGET_URLS = [
  'https://loop.freegameplay.site/',
  'https://slams.freegameplay.site/',
  'https://vidlyric.freegameplay.site/',
  'https://ke.freegameplay.site/',
  'https://t7m.freegameplay.site/',
  'https://agreement.freegameplay.site/',
  'https://b1.freegameplay.site/',
  'https://360.freegameplay.site/',
  'https://akawo.freegameplay.site/',
  'https://cif.freegameplay.site/',
  'https://cloud.freegameplay.site/',
  'https://live.freegameplay.site/',
  'https://som.freegameplay.site/',
  'https://ocean.freegameplay.site/',
  'https://cell.freegameplay.site/',
  'https://invibox.freegameplay.site/',
  'https://smb.freegameplay.site/',
  'https://prompt.freegameplay.site/',
  'https://agently.freegameplay.site/',
  'https://sambet.freegameplay.site/',
  'https://ngaff.freegameplay.site/',
  'https://delgra.freegameplay.site/',
  'https://caption.freegameplay.site/',
  'https://toolbox.freegameplay.site/',
  'https://tax.freegameplay.site/',
  'https://gif.freegameplay.site/',
  'https://vizier.freegameplay.site/',
];

/** Extract the subdomain from a URL (first label of the hostname). */
export function subdomainOf(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return url;
  }
}
