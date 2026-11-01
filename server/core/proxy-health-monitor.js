/**
 * Proxy Health Monitor — Tracks proxy performance over time
 * Records: success/failure rates, latency trends, cooldown periods
 */

export class ProxyHealthMonitor {
  constructor(options = {}) {
    this.config = {
      maxHistory: 1000,
      failureThreshold: 5,
      cooldownMinutes: 10,
      healthCheckInterval: 60000, // 1 minute
      ...options,
    };

    this.stats = new Map(); // proxyId -> stats
    this.checkHistory = []; // Recent health check results
    this.cooldowns = new Map(); // proxyId -> cooldownUntil timestamp
  }

  // -----------------------------------------------------------------------
  // Initialize / register proxies
  // -----------------------------------------------------------------------
  register(proxy) {
    const id = `${proxy.host}:${proxy.port}`;
    if (!this.stats.has(id)) {
      this.stats.set(id, {
        proxy,
        totalChecks: 0,
        successes: 0,
        failures: 0,
        latencyHistory: [],
        lastCheck: null,
        lastSuccess: null,
        lastFailure: null,
        consecutiveFailures: 0,
        healthScore: 100,
      });
    }
    return id;
  }

  registerAll(proxies) {
    const ids = [];
    for (const proxy of proxies) {
      ids.push(this.register(proxy));
    }
    return ids;
  }

  // -----------------------------------------------------------------------
  // Record a check result
  // -----------------------------------------------------------------------
  recordCheck(proxy, result) {
    const id = `${proxy.host}:${proxy.port}`;
    const stats = this.stats.get(id);
    if (!stats) return null;

    stats.totalChecks++;
    stats.lastCheck = Date.now();

    if (result.success) {
      stats.successes++;
      stats.consecutiveFailures = 0;
      stats.lastSuccess = Date.now();
      if (result.latency) {
        stats.latencyHistory.push(result.latency);
        if (stats.latencyHistory.length > this.config.maxHistory) {
          stats.latencyHistory.shift();
        }
      }
    } else {
      stats.failures++;
      stats.consecutiveFailures++;
      stats.lastFailure = Date.now();
    }

    // Update health score
    stats.healthScore = this._calculateHealthScore(stats);

    // Check if proxy should be cooled down
    if (stats.consecutiveFailures >= this.config.failureThreshold) {
      this._cooldown(id, this.config.cooldownMinutes);
    }

    return stats;
  }

  // -----------------------------------------------------------------------
  // Calculate health score (0-100)
  // -----------------------------------------------------------------------
  _calculateHealthScore(stats) {
    if (stats.totalChecks === 0) return 100;

    const successRate = stats.successes / stats.totalChecks;
    const avgLatency = this.getAvgLatency(stats);

    let score = successRate * 100; // Base score from success rate

    // Penalize high latency
    if (avgLatency > 5000) score -= 20;
    else if (avgLatency > 3000) score -= 10;
    else if (avgLatency > 1000) score -= 5;

    // Bonus for consistent performance
    if (stats.consecutiveFailures === 0 && stats.totalChecks > 3) {
      score += 5;
    }

    // Penalize consecutive failures
    if (stats.consecutiveFailures > 0) {
      score -= stats.consecutiveFailures * 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // -----------------------------------------------------------------------
  // Get average latency
  // -----------------------------------------------------------------------
  getAvgLatency(stats) {
    if (!stats.latencyHistory || stats.latencyHistory.length === 0) return 0;
    const sum = stats.latencyHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / stats.latencyHistory.length);
  }

  // -----------------------------------------------------------------------
  // Get health stats for a proxy
  // -----------------------------------------------------------------------
  getStats(proxy) {
    const id = `${proxy.host}:${proxy.port}`;
    const stats = this.stats.get(id);
    if (!stats) return null;

    return {
      ...stats,
      proxy: undefined,
      latencyHistory: undefined,
      avgLatency: this.getAvgLatency(stats),
      isCooldown: this.isCoolingDown(proxy),
      healthStatus: this.getHealthStatus(stats),
    };
  }

  // -----------------------------------------------------------------------
  // Health status label
  // -----------------------------------------------------------------------
  getHealthStatus(stats) {
    if (stats.healthScore >= 80) return 'excellent';
    if (stats.healthScore >= 60) return 'good';
    if (stats.healthScore >= 40) return 'fair';
    if (stats.healthScore >= 20) return 'poor';
    return 'critical';
  }

  // -----------------------------------------------------------------------
  // Check if proxy is in cooldown
  // -----------------------------------------------------------------------
  isCoolingDown(proxy) {
    const id = `${proxy.host}:${proxy.port}`;
    const cooldownUntil = this.cooldowns.get(id);
    if (!cooldownUntil) return false;
    return Date.now() < cooldownUntil;
  }

  // -----------------------------------------------------------------------
  // Cooldown a proxy
  // -----------------------------------------------------------------------
  _cooldown(id, minutes) {
    const cooldownUntil = Date.now() + minutes * 60 * 1000;
    this.cooldowns.set(id, cooldownUntil);
  }

  // -----------------------------------------------------------------------
  // Clear cooldown for a proxy
  // -----------------------------------------------------------------------
  clearCooldown(proxy) {
    const id = `${proxy.host}:${proxy.port}`;
    this.cooldowns.delete(id);
  }

  // -----------------------------------------------------------------------
  // Get all stats (sorted by health)
  // -----------------------------------------------------------------------
  getAllStats() {
    const all = [];
    for (const [id, stats] of this.stats.entries()) {
      const s = this.getStats(stats.proxy);
      if (s) all.push(s);
    }
    return all.sort((a, b) => b.healthScore - a.healthScore);
  }

  // -----------------------------------------------------------------------
  // Get unhealthy proxies
  // -----------------------------------------------------------------------
  getUnhealthyProxies() {
    return this.getAllStats().filter(
      (s) => s.healthScore < 50 || s.isCooldown
    );
  }

  // -----------------------------------------------------------------------
  // Get healthy proxies
  // -----------------------------------------------------------------------
  getHealthyProxies() {
    return this.getAllStats().filter(
      (s) => s.healthScore >= 60 && !s.isCooldown
    );
  }

  // -----------------------------------------------------------------------
  // Remove cooldown from all expired cooldowns
  // -----------------------------------------------------------------------
  cleanupExpiredCooldowns() {
    const now = Date.now();
    for (const [id, cooldownUntil] of this.cooldowns.entries()) {
      if (now >= cooldownUntil) {
        this.cooldowns.delete(id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Get monitoring summary
  // -----------------------------------------------------------------------
  getSummary() {
    const all = this.getAllStats();
    const total = all.length;
    const healthy = all.filter((s) => s.healthScore >= 60 && !s.isCooldown).length;
    const unhealthy = all.filter((s) => s.healthScore < 50 || s.isCooldown).length;
    const inCooldown = all.filter((s) => s.isCooldown).length;

    return {
      total: total,
      healthy: healthy,
      unhealthy: unhealthy,
      inCooldown: inCooldown,
      healthRate: total > 0 ? Math.round((healthy / total) * 100) : 0,
    };
  }
}

