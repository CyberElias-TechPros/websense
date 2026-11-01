/**
 * Proxy Performance Tracker — Detailed performance metrics tracking
 * Tracks: latency trends, success rates, usage patterns, efficiency metrics
 */

export class ProxyPerformanceTracker {
  constructor(options = {}) {
    this.config = {
      maxHistory: 5000,
      trackLatency: true,
      trackSuccessRate: true,
      trackUsage: true,
      ...options,
    };

    this.metrics = new Map(); // proxyId -> metrics
  }

  // -----------------------------------------------------------------------
  // Record a visit result
  // -----------------------------------------------------------------------
  record(proxy, result) {
    const id = this._getId(proxy);
    const m = this._getMetrics(id, proxy);

    m.totalVisits++;
    if (result.success) {
      m.successfulVisits++;
      m.latencyHistory.push(result.latency);
      if (m.latencyHistory.length > this.config.maxHistory) {
        m.latencyHistory.shift();
      }
    } else {
      m.failedVisits++;
      if (result.error) {
        m.errorHistory.push({ timestamp: Date.now(), error: result.error });
        if (m.errorHistory.length > 100) m.errorHistory.shift();
      }
    }

    // Update rolling metrics
    m.successRate = m.totalVisits > 0 ? (m.successfulVisits / m.totalVisits) * 100 : 0;
    m.avgLatency = this._avg(m.latencyHistory);
    m.minLatency = m.latencyHistory.length > 0 ? Math.min(...m.latencyHistory) : 0;
    m.maxLatency = m.latencyHistory.length > 0 ? Math.max(...m.latencyHistory) : 0;
    m.lastVisit = Date.now();
    m.lastSuccess = result.success ? Date.now() : m.lastSuccess;
    m.lastFailure = !result.success ? Date.now() : m.lastFailure;

    // Track streaks
    if (result.success) {
      m.currentStreak = (m.currentStreak || 0) + 1;
      m.bestStreak = Math.max(m.bestStreak || 0, m.currentStreak);
    } else {
      m.currentStreak = 0;
      m.worstStreak = Math.max(m.worstStreak || 0, (m.failedStreak || 0) + 1);
      m.failedStreak = (m.failedStreak || 0) + 1;
    }

    return m;
  }

  // -----------------------------------------------------------------------
  // Get metrics for a proxy
  // -----------------------------------------------------------------------
  getMetrics(proxy) {
    const id = this._getId(proxy);
    const m = this.metrics.get(id);
    if (!m) return null;
    return { ...m, proxy: undefined, latencyHistory: undefined, errorHistory: undefined };
  }

  // -----------------------------------------------------------------------
  // Get all metrics (sorted by performance score)
  // -----------------------------------------------------------------------
  getAllMetrics() {
    const all = [];
    for (const [id, m] of this.metrics.entries()) {
      const score = this._calculateScore(m);
      all.push({ ...this.getMetrics(m.proxy), performanceScore: score });
    }
    return all.sort((a, b) => b.performanceScore - a.performanceScore);
  }

  // -----------------------------------------------------------------------
  // Calculate performance score (0-100)
  // -----------------------------------------------------------------------
  _calculateScore(m) {
    if (m.totalVisits === 0) return 100;

    const successScore = m.successRate; // 0-100
    const latencyScore = m.avgLatency > 0
      ? Math.max(0, Math.min(100, 100 - (m.avgLatency / 100)))
      : 50;
    const consistencyScore = m.currentStreak > 0
      ? Math.min(100, 50 + m.currentStreak * 5)
      : 20;
    const volumeScore = Math.min(100, (m.totalVisits / 100) * 100);

    return Math.round(
      successScore * 0.4 +
      latencyScore * 0.3 +
      consistencyScore * 0.2 +
      volumeScore * 0.1
    );
  }

  // -----------------------------------------------------------------------
  // Get performance ranking
  // -----------------------------------------------------------------------
  getRankings(limit = 10) {
    const all = this.getAllMetrics();
    return {
      top: all.slice(0, limit),
      bottom: all.slice(-limit).reverse(),
    };
  }

  // -----------------------------------------------------------------------
  // Get latency trend for a proxy
  // -----------------------------------------------------------------------
  getLatencyTrend(proxy, window = 50) {
    const id = this._getId(proxy);
    const m = this.metrics.get(id);
    if (!m || !m.latencyHistory || m.latencyHistory.length === 0) return null;

    const recent = m.latencyHistory.slice(-window);
    return {
      window,
      current: recent[recent.length - 1],
      average: this._avg(recent),
      trend: this._calculateTrend(recent),
      history: recent,
    };
  }

  // -----------------------------------------------------------------------
  // Calculate trend (increasing/decreasing/stable)
  // -----------------------------------------------------------------------
  _calculateTrend(data) {
    if (data.length < 2) return 'stable';
    const half = Math.floor(data.length / 2);
    const firstHalfAvg = this._avg(data.slice(0, half));
    const secondHalfAvg = this._avg(data.slice(half));
    const diff = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    if (diff > 10) return 'increasing';
    if (diff < -10) return 'decreasing';
    return 'stable';
  }

  // -----------------------------------------------------------------------
  // Reset metrics for a proxy
  // -----------------------------------------------------------------------
  reset(proxy) {
    const id = this._getId(proxy);
    this.metrics.delete(id);
  }

  // -----------------------------------------------------------------------
  // Clear all metrics
  // -----------------------------------------------------------------------
  clearAll() {
    this.metrics.clear();
  }

  // -----------------------------------------------------------------------
  // Get summary statistics
  // -----------------------------------------------------------------------
  getSummary() {
    const all = this.getAllMetrics();
    const total = all.length;
    const totalVisits = all.reduce((sum, m) => sum + (m.totalVisits || 0), 0);
    const totalSuccesses = all.reduce((sum, m) => sum + (m.successfulVisits || 0), 0);
    const totalFailures = all.reduce((sum, m) => sum + (m.failedVisits || 0), 0);
    const avgLatency = all.length > 0
      ? this._avg(all.map(m => m.avgLatency).filter(l => l > 0))
      : 0;

    return {
      totalProxies: total,
      totalVisits,
      totalSuccesses,
      totalFailures,
      overallSuccessRate: totalVisits > 0 ? Math.round((totalSuccesses / totalVisits) * 100) : 0,
      overallAvgLatency: Math.round(avgLatency),
      topProxy: all[0]?.proxy ? `${all[0].proxy.host}:${all[0].proxy.port}` : null,
    };
  }

  // -----------------------------------------------------------------------
  // Helper: get proxy ID
  // -----------------------------------------------------------------------
  _getId(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }

  // -----------------------------------------------------------------------
  // Helper: get or create metrics
  // -----------------------------------------------------------------------
  _getMetrics(id, proxy) {
    if (!this.metrics.has(id)) {
      this.metrics.set(id, {
        proxy,
        totalVisits: 0,
        successfulVisits: 0,
        failedVisits: 0,
        latencyHistory: [],
        errorHistory: [],
        successRate: 0,
        avgLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        lastVisit: null,
        lastSuccess: null,
        lastFailure: null,
        currentStreak: 0,
        bestStreak: 0,
        worstStreak: 0,
        failedStreak: 0,
      });
    }
    return this.metrics.get(id);
  }

  // -----------------------------------------------------------------------
  // Helper: calculate average
  // -----------------------------------------------------------------------
  _avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
}

