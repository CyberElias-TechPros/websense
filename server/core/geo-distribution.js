// ============================================================================
// geo-distribution.js — Geographic distribution control.
// Features:
//   • Country-level allocation percentages
//   • City-level granularity
//   • Accept-Language header matching proxy country
//   • Timezone matching
//   • Currency matching
// ============================================================================

const COUNTRY_PROFILES = {
  // country: { languages: [], timezone: '', currency: '', weight: 0 }
  US: { languages: ['en-US', 'en'], timezone: 'America/New_York', currency: 'USD', weight: 25 },
  GB: { languages: ['en-GB', 'en'], timezone: 'Europe/London', currency: 'GBP', weight: 20 },
  DE: { languages: ['de-DE', 'de'], timezone: 'Europe/Berlin', currency: 'EUR', weight: 15 },
  NL: { languages: ['nl-NL', 'nl'], timezone: 'Europe/Amsterdam', currency: 'EUR', weight: 10 },
  PL: { languages: ['pl-PL', 'pl'], timezone: 'Europe/Warsaw', currency: 'PLN', weight: 10 },
  ES: { languages: ['es-ES', 'es'], timezone: 'Europe/Madrid', currency: 'EUR', weight: 8 },
  FR: { languages: ['fr-FR', 'fr'], timezone: 'Europe/Paris', currency: 'EUR', weight: 5 },
  BR: { languages: ['pt-BR', 'pt'], timezone: 'America/Sao_Paulo', currency: 'BRL', weight: 5 },
  CA: { languages: ['en-CA', 'fr-CA', 'en'], timezone: 'America/Toronto', currency: 'CAD', weight: 5 },
  AU: { languages: ['en-AU', 'en'], timezone: 'Australia/Sydney', currency: 'AUD', weight: 2 },
};

const LANGUAGE_MAP = {
  US: 'en-US,en;q=0.9',
  GB: 'en-GB,en;q=0.9',
  DE: 'de-DE,de;q=0.9,en;q=0.8',
  NL: 'nl-NL,nl;q=0.9,en;q=0.8',
  PL: 'pl-PL,pl;q=0.9,en;q=0.8',
  ES: 'es-ES,es;q=0.9,en;q=0.8',
  FR: 'fr-FR,fr;q=0.9,en;q=0.8',
  BR: 'pt-BR,pt;q=0.9,en;q=0.8',
  CA: 'en-CA,fr-CA;q=0.8,en;q=0.9',
  AU: 'en-AU,en;q=0.9',
};

export class GeoDistributionManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      matchLanguage: true,
      matchTimezone: true,
      matchCurrency: true,
      ...config,
    };
    // Initialize country weights from existing proxies
    this.countryWeights = {};
    for (const [country, profile] of Object.entries(COUNTRY_PROFILES)) {
      this.countryWeights[country] = profile.weight;
    }
  }

  /**
   * Initialize weights based on actual proxy pool.
   */
  initFromProxies(proxies) {
    const counts = {};
    for (const proxy of proxies) {
      counts[proxy.country] = (counts[proxy.country] || 0) + 1;
    }
    // Merge: use actual proxy counts as the primary signal
    for (const [country, count] of Object.entries(counts)) {
      this.countryWeights[country] = count;
    }
  }

  /**
   * Pick a country based on configured weights.
   */
  pickCountry() {
    const countries = Object.entries(this.countryWeights);
    const total = countries.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [country, weight] of countries) {
      r -= weight;
      if (r <= 0) return country;
    }
    return countries[0][0];
  }

  /**
   * Get Accept-Language header for a country.
   */
  getAcceptLanguage(country) {
    return LANGUAGE_MAP[country] || 'en-US,en;q=0.9';
  }

  /**
   * Get timezone for a country.
   */
  getTimezone(country) {
    return COUNTRY_PROFILES[country]?.timezone || 'UTC';
  }

  /**
   * Get currency for a country.
   */
  getCurrency(country) {
    return COUNTRY_PROFILES[country]?.currency || 'USD';
  }

  /**
   * Get full geo profile for a country.
   */
  getCountryProfile(country) {
    const profile = COUNTRY_PROFILES[country];
    return {
      country,
      languages: profile?.languages || ['en'],
      acceptLanguage: LANGUAGE_MAP[country] || 'en-US,en;q=0.9',
      timezone: profile?.timezone || 'UTC',
      currency: profile?.currency || 'USD',
    };
  }

  /**
   * Generate headers matched to a specific proxy country.
   */
  generateHeaders(country) {
    const headers = {};
    if (this.config.matchLanguage) {
      headers['Accept-Language'] = this.getAcceptLanguage(country);
    }
    return headers;
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  updateCountryWeights(weights) {
    Object.assign(this.countryWeights, weights);
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      countryCount: Object.keys(this.countryWeights).length,
      matchLanguage: this.config.matchLanguage,
      matchTimezone: this.config.matchTimezone,
      matchCurrency: this.config.matchCurrency,
      weights: this.countryWeights,
    };
  }
}

export { COUNTRY_PROFILES, LANGUAGE_MAP };
export default GeoDistributionManager;
