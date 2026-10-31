/**
 * Proxy Geo Restrictions — Control which countries proxies can be selected from
 * Allow-list, block-list, and geographic distribution control
 */

export class ProxyGeoRestrictions {
  constructor(options = {}) {
    this.config = {
      allowCountries: [], // Empty = allow all
      blockCountries: [], // Always blocked
      preferredCountries: [], // Preferred but not required
      enforceDistribution: false, // Enforce geographic diversity
      ...options,
    };

    this.usageStats = new Map(); // country -> usage count
    this.distributionTarget = options.distributionTarget || 0.1; // 10% per country max
  }

  // -----------------------------------------------------------------------
  // Check if a proxy from a country is allowed
  // -----------------------------------------------------------------------
  isAllowed(country) {
    // Always blocked countries
    if (this.config.blockCountries.includes(country)) return false;

    // If allow-list is set, only allow listed countries
    if (this.config.allowCountries.length > 0) {
      return this.config.allowCountries.includes(country);
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Check if a proxy from a country is preferred
  // -----------------------------------------------------------------------
  isPreferred(country) {
    return this.config.preferredCountries.includes(country);
  }

  // -----------------------------------------------------------------------
  // Get weight for a proxy based on geo restrictions
  // -----------------------------------------------------------------------
  getWeight(country, totalProxies = 1) {
    if (!this.isAllowed(country)) return 0;

    let weight = 1;

    // Preferred countries get higher weight
    if (this.isPreferred(country)) {
      weight *= 2;
    }

    // Enforce distribution limits
    if (this.config.enforceDistribution) {
      const usage = this.usageStats.get(country) || 0;
      const usageRatio = totalProxies > 0 ? usage / totalProxies : 0;
      if (usageRatio > this.distributionTarget) {
        weight *= Math.max(0.1, 1 - usageRatio);
      }
    }

    return weight;
  }

  // -----------------------------------------------------------------------
  // Record proxy usage
  // -----------------------------------------------------------------------
  recordUsage(country) {
    const count = (this.usageStats.get(country) || 0) + 1;
    this.usageStats.set(country, count);
  }

  // -----------------------------------------------------------------------
  // Filter proxies by geo restrictions
  // -----------------------------------------------------------------------
  filterProxies(proxies) {
    return proxies.filter((p) => this.isAllowed(p.country));
  }

  // -----------------------------------------------------------------------
  // Sort proxies by geo preference
  // -----------------------------------------------------------------------
  sortByPreference(proxies) {
    return [...proxies].sort((a, b) => {
      const weightA = this.getWeight(a.country);
      const weightB = this.getWeight(b.country);
      if (weightA !== weightB) return weightB - weightA;
      return 0;
    });
  }

  // -----------------------------------------------------------------------
  // Get usage stats
  // -----------------------------------------------------------------------
  getUsageStats() {
    const stats = {};
    for (const [country, count] of this.usageStats.entries()) {
      stats[country] = count;
    }
    return stats;
  }

  // -----------------------------------------------------------------------
  // Get country distribution
  // -----------------------------------------------------------------------
  getDistribution() {
    const total = Array.from(this.usageStats.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return {};

    const distribution = {};
    for (const [country, count] of this.usageStats.entries()) {
      distribution[country] = {
        count,
        percentage: Math.round((count / total) * 100),
      };
    }
    return distribution;
  }

  // -----------------------------------------------------------------------
  // Reset usage stats
  // -----------------------------------------------------------------------
  reset() {
    this.usageStats.clear();
  }

  // -----------------------------------------------------------------------
  // Update config
  // -----------------------------------------------------------------------
  updateConfig(config) {
    if (config.allowCountries !== undefined) this.config.allowCountries = config.allowCountries;
    if (config.blockCountries !== undefined) this.config.blockCountries = config.blockCountries;
    if (config.preferredCountries !== undefined) this.config.preferredCountries = config.preferredCountries;
    if (config.enforceDistribution !== undefined) this.config.enforceDistribution = config.enforceDistribution;
  }

  // -----------------------------------------------------------------------
  // Get config
  // -----------------------------------------------------------------------
  getConfig() {
    return {
      allowCountries: [...this.config.allowCountries],
      blockCountries: [...this.config.blockCountries],
      preferredCountries: [...this.config.preferredCountries],
      enforceDistribution: this.config.enforceDistribution,
      distributionTarget: this.distributionTarget,
      usageStats: this.getUsageStats(),
      distribution: this.getDistribution(),
    };
  }

  // -----------------------------------------------------------------------
  // Get summary
  // -----------------------------------------------------------------------
  getSummary() {
    return {
      allowCountries: this.config.allowCountries.length,
      blockCountries: this.config.blockCountries.length,
      preferredCountries: this.config.preferredCountries.length,
      enforceDistribution: this.config.enforceDistribution,
      countriesUsed: this.usageStats.size,
      totalUsage: Array.from(this.usageStats.values()).reduce((a, b) => a + b, 0),
    };
  }
}

