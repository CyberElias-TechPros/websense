/**
 * Proxy Pool Manager — Unified proxy lifecycle management
 * Integrates: health monitor, performance tracker, intelligence analyzer,
 * geo restrictions, strategies, rotation, and auto-refresh into one pool
 */

export class ProxyPoolManager {
  constructor(options = {}) {
    this.config = {
      enabled: true,
      defaultStrategy: 'best-first',
      poolSize: 200,
      minHealthyRatio: 0.6, // At least 60% healthy
      fallbackToAny: true,
      ...options,
    };

    this.proxies = new Map(); // proxyId -> proxy data
    this.active = new Map(); // proxyId -> activity data
    this.healthMonitor = null;
    this.performanceTracker = null;
    this.intelligenceAnalyzer = null;
    this.geoRestrictions = null;
    this.strategies = null;
    this.rotationScheduler = null;
    this.autoRefresh = null;
    this.notificationManager = null;
  }

  // -----------------------------------------------------------------------
  // Set dependencies
  // -----------------------------------------------------------------------
  setDependencies(healthMonitor, performanceTracker, intelligenceAnalyzer, geoRestrictions, strategies, rotationScheduler, autoRefresh, notificationManager) {
    this.healthMonitor = healthMonitor;
    this.performanceTracker = performanceTracker;
    this.intelligenceAnalyzer = intelligenceAnalyzer;
    this.geoRestrictions = geoRestrictions;
    this.strategies = strategies;
    this.rotationScheduler = rotationScheduler;
    this.autoRefresh = autoRefresh;
    this.notificationManager = notificationManager;
  }

  // -----------------------------------------------------------------------
  // Add proxies to the pool
  // -----------------------------------------------------------------------
  add(proxies) {
    let added = 0;
    for (const proxy of proxies) {
      const id = this._getId(proxy);
      if (!this.proxies.has(id)) {
        this.proxies.set(id, {
          ...proxy,
          addedAt: Date.now(),
          lastUsed: null,
          totalUsed: 0,
          successCount: 0,
          failCount: 0,
        });
        added++;
      }
    }
    return added;
  }

  // -----------------------------------------------------------------------
  // Remove a proxy from the pool
  // -----------------------------------------------------------------------
  remove(proxy) {
    const id = this._getId(proxy);
    return this.proxies.delete(id);
  }

  // -----------------------------------------------------------------------
  // Get all proxies in the pool
  // -----------------------------------------------------------------------
  getAll() {
    return Array.from(this.proxies.values());
  }

  // -----------------------------------------------------------------------
  // Get pool statistics
  // -----------------------------------------------------------------------
  getPoolStats() {
    const all = this.getAll();
    const total = all.length;
    const healthy = all.filter(p => {
      const stats = this.healthMonitor?.getStats(p);
      return !stats || (stats.healthScore >= 60 && !stats.isCooldown);
    }).length;
    const unhealthy = total - healthy;
    const healthyRatio = total > 0 ? healthy / total : 0;

    return {
      total,
      healthy,
      unhealthy,
      healthyRatio: Math.round(healthyRatio * 100),
      meetsMinimum: healthyRatio >= this.config.minHealthyRatio,
      poolSizeTarget: this.config.poolSize,
      strategy: this.config.defaultStrategy,
    };
  }

  // -----------------------------------------------------------------------
  // Get healthy proxies from the pool
  // -----------------------------------------------------------------------
  getHealthyProxies() {
    const all = this.getAll();
    return all.filter(p => {
      if (this.geoRestrictions && !this.geoRestrictions.isAllowed(p.country)) return false;
      const stats = this.healthMonitor?.getStats(p);
      if (stats && (stats.healthScore < 60 || stats.isCooldown)) return false;
      return true;
    });
  }

  // -----------------------------------------------------------------------
  // Select a proxy using the configured strategy
  // -----------------------------------------------------------------------
  select(strategy = this.config.defaultStrategy) {
    // Filter by geo restrictions first
    let candidates = this.getAll();
    if (this.geoRestrictions) {
      candidates = this.geoRestrictions.filterProxies(candidates);
    }

    // Filter out unhealthy proxies
    const healthy = candidates.filter(p => {
      const stats = this.healthMonitor?.getStats(p);
      if (stats && (stats.healthScore < 40 || stats.isCooldown)) return false;
      return true;
    });

    // If no healthy proxies and fallback is enabled, use all candidates
    if (healthy.length === 0 && this.config.fallbackToAny && candidates.length > 0) {
      healthy.push(...candidates);
    }

    if (healthy.length === 0) return null;

    // Apply strategy
    let selected = null;
    if (this.strategies) {
      selected = this.strategies.select(strategy, healthy);
    } else {
      // Default: random from healthy
      selected = healthy[Math.floor(Math.random() * healthy.length)];
    }

    if (selected) {
      this._recordUsage(selected);
    }

    return selected;
  }

  // -----------------------------------------------------------------------
  // Record a visit result
  // -----------------------------------------------------------------------
  recordResult(proxy, result) {
    const id = this._getId(proxy);
    const data = this.proxies.get(id);
    if (!data) return;

    data.lastUsed = Date.now();
    data.totalUsed++;
    if (result.success) {
      data.successCount++;
    } else {
      data.failCount++;
    }

    // Update health monitor
    if (this.healthMonitor) {
      this.healthMonitor.recordCheck(proxy, {
        success: result.success,
        latency: result.latency,
        error: result.error,
      });
    }

    // Update performance tracker
    if (this.performanceTracker) {
      this.performanceTracker.record(proxy, {
        success: result.success,
        latency: result.latency,
        error: result.error,
      });
    }

    // Update intelligence analyzer
    if (this.intelligenceAnalyzer) {
      this.intelligenceAnalyzer.recordVisit(proxy, {
        url: result.url,
        success: result.success,
        latency: result.latency,
      });
    }

    // Update geo restrictions
    if (this.geoRestrictions && proxy.country) {
      this.geoRestrictions.recordUsage(proxy.country);
    }
  }

  // -----------------------------------------------------------------------
  // Record usage
  // -----------------------------------------------------------------------
  _recordUsage(proxy) {
    const id = this._getId(proxy);
    const data = this.proxies.get(id);
    if (data) {
      data.lastUsed = Date.now();
      data.totalUsed++;
    }
  }

  // -----------------------------------------------------------------------
  // Get proxy details
  // -----------------------------------------------------------------------
  getProxyDetails(proxy) {
    const id = this._getId(proxy);
    const data = this.proxies.get(id);
    if (!data) return null;

    return {
      ...data,
      health: this.healthMonitor?.getStats(proxy) || null,
      performance: this.performanceTracker?.getMetrics(proxy) || null,
      patterns: this.intelligenceAnalyzer?.getPatterns(proxy) || null,
      suggestions: this.intelligenceAnalyzer?.getSuggestions(proxy) || [],
    };
  }

  // -----------------------------------------------------------------------
  // Get pool health report
  // -----------------------------------------------------------------------
  getHealthReport() {
    const all = this.getAll();
    const report = {
      timestamp: Date.now(),
      poolStats: this.getPoolStats(),
      proxies: [],
    };

    for (const proxy of all) {
      const details = this.getProxyDetails(proxy);
      report.proxies.push({
        host: proxy.host,
        port: proxy.port,
        country: proxy.country,
        healthScore: details?.health?.healthScore || 0,
        healthStatus: details?.health?.healthStatus || 'unknown',
        isCooldown: details?.health?.isCooldown || false,
        totalVisits: details?.performance?.totalVisits || 0,
        successRate: details?.performance?.successRate || 0,
        avgLatency: details?.performance?.avgLatency || 0,
        lastUsed: details?.lastUsed || null,
      });
    }

    report.proxies.sort((a, b) => b.healthScore - a.healthScore);
    return report;
  }

  // -----------------------------------------------------------------------
  // Clean up stale proxies
  // -----------------------------------------------------------------------
  cleanupStale(threshold = 3600000) {
    const now = Date.now();
    const removed = [];
    for (const [id, proxy] of this.proxies.entries()) {
      if (proxy.lastUsed && (now - proxy.lastUsed) > threshold) {
        this.proxies.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  // -----------------------------------------------------------------------
  // Get summary
  // -----------------------------------------------------------------------
  getSummary() {
    return {
      enabled: this.config.enabled,
      strategy: this.config.defaultStrategy,
      poolStats: this.getPoolStats(),
      healthyProxies: this.getHealthyProxies().length,
    };
  }

  // -----------------------------------------------------------------------
  // Update config
  // -----------------------------------------------------------------------
  updateConfig(config) {
    if (config.defaultStrategy !== undefined) this.config.defaultStrategy = config.defaultStrategy;
    if (config.poolSize !== undefined) this.config.poolSize = config.poolSize;
    if (config.minHealthyRatio !== undefined) this.config.minHealthyRatio = config.minHealthyRatio;
    if (config.fallbackToAny !== undefined) this.config.fallbackToAny = config.fallbackToAny;
  }

  // -----------------------------------------------------------------------
  // Helper: get proxy ID
  // -----------------------------------------------------------------------
  _getId(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }
}

