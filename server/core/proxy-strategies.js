// ============================================================================
// proxy-strategies.js — Advanced proxy selection strategies.
// Extends the base ProxyManager with intelligent proxy selection
// based on evaluation scores, performance history, and user preferences.
// ============================================================================

import logger from '../utils/logger.js';

export class ProxyStrategies {
  constructor(proxyManager, evaluator, config = {}) {
    this.proxyManager = proxyManager;
    this.evaluator = evaluator;
    this.config = {
      defaultStrategy: 'best-first',
      fallbackStrategy: 'round-robin',
      maxConsecutiveUses: 10,
      cooldownAfterFailure: 60000,
      ...config,
    };
    this.usageCounts = new Map(); // proxyId → consecutive uses
    this.cooldownUntil = new Map(); // proxyId → timestamp
  }

  /**
   * Best-first: use proxies with highest evaluation scores first.
   */
  getBestFirst() {
    const results = this.evaluator?.getResultsByDimension('overallScore');
    if (results && results.length > 0) {
      // Find the best proxy that isn't in cooldown
      for (const result of results) {
        const proxyId = result.proxyId;
        if (this._isInCooldown(proxyId)) continue;
        if (this._exceedsMaxUses(proxyId)) continue;

        const proxy = this.proxyManager.proxies.find(
          (p) => `${p.host}:${p.port}` === proxyId
        );
        if (proxy && proxy.enabled && !proxy.circuitOpen) {
          this._recordUsage(proxyId);
          proxy.lastUsed = new Date().toISOString();
          return proxy;
        }
      }
    }

    // Fallback to round-robin if no evaluated proxies available
    return this.proxyManager.getNext();
  }

  /**
   * Round-robin with score weighting.
   */
  getWeightedRoundRobin() {
    const active = this.proxyManager.getActiveProxies();
    if (active.length === 0) return null;

    // Get evaluation scores
    const scored = active.map((p) => {
      const result = this.evaluator?.results.get(`${p.host}:${p.port}`);
      return {
        proxy: p,
        score: result?.overallScore || 50, // Default 50 if not evaluated
      };
    });

    // Sort by score descending, then by usage count ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (this.usageCounts.get(a.proxy.id) || 0) - (this.usageCounts.get(b.proxy.id) || 0);
    });

    // Pick the top one that isn't in cooldown
    for (const item of scored) {
      if (this._isInCooldown(item.proxy.id)) continue;
      if (this._exceedsMaxUses(item.proxy.id)) continue;

      this._recordUsage(item.proxy.id);
      item.proxy.lastUsed = new Date().toISOString();
      return item.proxy;
    }

    return this.proxyManager.getNext();
  }

  /**
   * Fastest-first: prioritize low-latency proxies.
   */
  getFastestFirst() {
    const results = this.evaluator?.getResultsByDimension('speed');
    if (results && results.length > 0) {
      for (const result of results) {
        const proxyId = result.proxyId;
        if (this._isInCooldown(proxyId)) continue;

        const proxy = this.proxyManager.proxies.find(
          (p) => `${p.host}:${p.port}` === proxyId
        );
        if (proxy && proxy.enabled && !proxy.circuitOpen) {
          this._recordUsage(proxyId);
          proxy.lastUsed = new Date().toISOString();
          return proxy;
        }
      }
    }
    return this.proxyManager.getRandom();
  }

  /**
   * Most-anonymous-first: prioritize proxies with best anonymity scores.
   */
  getMostAnonymousFirst() {
    const results = this.evaluator?.getResultsByDimension('anonymity');
    if (results && results.length > 0) {
      for (const result of results) {
        const proxyId = result.proxyId;
        if (this._isInCooldown(proxyId)) continue;

        const proxy = this.proxyManager.proxies.find(
          (p) => `${p.host}:${p.port}` === proxyId
        );
        if (proxy && proxy.enabled && !proxy.circuitOpen) {
          this._recordUsage(proxyId);
          proxy.lastUsed = new Date().toISOString();
          return proxy;
        }
      }
    }
    return this.proxyManager.getRandom();
  }

  /**
   * Safest-first: prioritize proxies with best safety scores.
   */
  getSafestFirst() {
    const results = this.evaluator?.getResultsByDimension('safety');
    if (results && results.length > 0) {
      for (const result of results) {
        const proxyId = result.proxyId;
        if (this._isInCooldown(proxyId)) continue;

        const proxy = this.proxyManager.proxies.find(
          (p) => `${p.host}:${p.port}` === proxyId
        );
        if (proxy && proxy.enabled && !proxy.circuitOpen) {
          this._recordUsage(proxyId);
          proxy.lastUsed = new Date().toISOString();
          return proxy;
        }
      }
    }
    return this.proxyManager.getRandom();
  }

  /**
   * Geo-balanced: ensure geographic diversity across visits.
   */
  getGeoBalanced() {
    const active = this.proxyManager.getActiveProxies();
    if (active.length === 0) return null;

    // Group by country
    const byCountry = {};
    for (const p of active) {
      if (!byCountry[p.country]) byCountry[p.country] = [];
      byCountry[p.country].push(p);
    }

    // Find the country with the least recent usage
    const countryUsage = {};
    for (const p of active) {
      const country = p.country;
      if (!countryUsage[country]) countryUsage[country] = 0;
      countryUsage[country] += this.usageCounts.get(p.id) || 0;
    }

    const sortedCountries = Object.entries(countryUsage)
      .sort((a, b) => a[1] - b[1]);

    // Pick from the least-used country
    for (const [country, count] of sortedCountries) {
      const candidates = byCountry[country].filter((p) => {
        return !this._isInCooldown(p.id) && !this._exceedsMaxUses(p.id);
      });
      if (candidates.length > 0) {
        const proxy = candidates[Math.floor(Math.random() * candidates.length)];
        this._recordUsage(proxy.id);
        proxy.lastUsed = new Date().toISOString();
        return proxy;
      }
    }

    return this.proxyManager.getRandom();
  }

  /**
   * Geo-match: prefer proxies in the visitor profile's country (fingerprint
   * locale ↔ proxy country consistency), falling back to random.
   */
  getGeoMatched(country) {
    if (country) {
      const cc = String(country).toUpperCase();
      const candidates = this.proxyManager.getActiveProxies().filter(
        (p) => (p.country || '').toUpperCase() === cc &&
          !this._isInCooldown(p.id) && !this._exceedsMaxUses(p.id)
      );
      if (candidates.length > 0) {
        const proxy = candidates[Math.floor(Math.random() * candidates.length)];
        this._recordUsage(proxy.id);
        proxy.lastUsed = new Date().toISOString();
        return proxy;
      }
    }
    return this.proxyManager.getRandom();
  }

  /**
   * Select proxy by strategy name.
   */
  select(strategy, opts = {}) {
    switch (strategy) {
      case 'geo-match':
        return this.getGeoMatched(opts.preferCountry);
      case 'best-first':
        return this.getBestFirst();
      case 'weighted-round-robin':
        return this.getWeightedRoundRobin();
      case 'fastest-first':
        return this.getFastestFirst();
      case 'anonymous-first':
        return this.getMostAnonymousFirst();
      case 'safest-first':
        return this.getSafestFirst();
      case 'geo-balanced':
        return this.getGeoBalanced();
      case 'round-robin':
        return this.proxyManager.getNext();
      case 'random':
        return this.proxyManager.getRandom();
      case 'weighted':
        return this.proxyManager.getWeighted();
      case 'geo':
        return this.proxyManager.getGeoSpread();
      case 'least-recently-used':
        return this.proxyManager.getLeastRecentlyUsed();
      default:
        return this.getBestFirst();
    }
  }

  // -----------------------------------------------------------------------
  // Usage tracking
  // -----------------------------------------------------------------------
  _recordUsage(proxyId) {
    this.usageCounts.set(proxyId, (this.usageCounts.get(proxyId) || 0) + 1);
  }

  _isInCooldown(proxyId) {
    const cooldownUntil = this.cooldownUntil.get(proxyId);
    return cooldownUntil && cooldownUntil > Date.now();
  }

  _exceedsMaxUses(proxyId) {
    return (this.usageCounts.get(proxyId) || 0) >= this.config.maxConsecutiveUses;
  }

  /**
   * Mark proxy as failed (trigger cooldown).
   */
  markFailure(proxyId) {
    this.cooldownUntil.set(proxyId, Date.now() + this.config.cooldownAfterFailure);
    this.usageCounts.set(proxyId, 0);
  }

  /**
   * Mark proxy as successful (reset usage count).
   */
  markSuccess(proxyId) {
    this.usageCounts.set(proxyId, 0);
    this.cooldownUntil.delete(proxyId);
  }

  /**
   * Get available strategies.
   */
  getAvailableStrategies() {
    return [
      { id: 'best-first', name: 'Best First', description: 'Use highest-scored proxies first' },
      { id: 'weighted-round-robin', name: 'Weighted Round Robin', description: 'Round-robin weighted by evaluation scores' },
      { id: 'fastest-first', name: 'Fastest First', description: 'Prioritize lowest-latency proxies' },
      { id: 'anonymous-first', name: 'Most Anonymous First', description: 'Prioritize best anonymity scores' },
      { id: 'safest-first', name: 'Safest First', description: 'Prioritize best safety scores' },
      { id: 'geo-balanced', name: 'Geo Balanced', description: 'Ensure geographic diversity' },
      { id: 'round-robin', name: 'Round Robin', description: 'Cycle through proxies in order' },
      { id: 'random', name: 'Random', description: 'Pick random proxy' },
      { id: 'weighted', name: 'Weighted', description: 'Weighted by success history' },
      { id: 'geo', name: 'Geo Spread', description: 'Balance visits across countries' },
      { id: 'geo-match', name: 'Geo Match', description: 'Match proxy country to the visitor profile locale country' },
      { id: 'least-recently-used', name: 'Least Recently Used', description: 'Pick proxy used least recently' },
    ];
  }
}

export default ProxyStrategies;
