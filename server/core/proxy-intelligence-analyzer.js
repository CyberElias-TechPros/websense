/**
 * Proxy Intelligence Analyzer — Deep proxy analysis and pattern detection
 * Analyzes: performance patterns, anomaly detection, predictive scoring, optimization suggestions
 */

export class ProxyIntelligenceAnalyzer {
  constructor(options = {}) {
    this.config = {
      anomalyThreshold: 2, // std deviations for anomaly detection
      predictionWindow: 100, // visits to predict over
      patternsToTrack: ['time_of_day', 'day_of_week', 'url_preference', 'latency_distribution'],
      ...options,
    };

    this.patterns = new Map(); // proxyId -> patterns
    this.anomalies = []; // Detected anomalies
    this.predictions = new Map(); // proxyId -> predictions
  }

  // -----------------------------------------------------------------------
  // Record visit data for analysis
  // -----------------------------------------------------------------------
  recordVisit(proxy, result) {
    const id = this._getId(proxy);
    const p = this._getPatterns(id, proxy);

    const visit = {
      timestamp: Date.now(),
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      url: result.url || 'unknown',
      success: result.success,
      latency: result.latency || 0,
    };

    p.visits.push(visit);
    if (p.visits.length > this.config.predictionWindow) {
      p.visits.shift();
    }

    // Update time-of-day pattern
    if (!p.timeOfDay[visit.hour]) p.timeOfDay[visit.hour] = { total: 0, successes: 0, latency: [] };
    p.timeOfDay[visit.hour].total++;
    if (visit.success) {
      p.timeOfDay[visit.hour].successes++;
      p.timeOfDay[visit.hour].latency.push(visit.latency);
    }

    // Update day-of-week pattern
    if (!p.dayOfWeek[visit.dayOfWeek]) p.dayOfWeek[visit.dayOfWeek] = { total: 0, successes: 0, latency: [] };
    p.dayOfWeek[visit.dayOfWeek].total++;
    if (visit.success) {
      p.dayOfWeek[visit.dayOfWeek].successes++;
      p.dayOfWeek[visit.dayOfWeek].latency.push(visit.latency);
    }

    // Update URL preference
    if (!p.urlPreference[visit.url]) p.urlPreference[visit.url] = { total: 0, successes: 0 };
    p.urlPreference[visit.url].total++;
    if (visit.success) p.urlPreference[visit.url].successes++;

    // Detect anomalies
    this._detectAnomalies(proxy, p);

    return p;
  }

  // -----------------------------------------------------------------------
  // Detect anomalies in proxy performance
  // -----------------------------------------------------------------------
  _detectAnomalies(proxy, p) {
    if (p.visits.length < 10) return;

    const recentLatencies = p.visits.slice(-10).map(v => v.latency).filter(l => l > 0);
    if (recentLatencies.length < 5) return;

    const avg = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
    const stdDev = Math.sqrt(
      recentLatencies.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / recentLatencies.length
    );

    // Check for latency anomaly
    const lastLatency = recentLatencies[recentLatencies.length - 1];
    if (stdDev > 0 && Math.abs(lastLatency - avg) > stdDev * this.config.anomalyThreshold) {
      const anomaly = {
        timestamp: Date.now(),
        proxy: `${proxy.host}:${proxy.port}`,
        type: 'latency_spike',
        value: lastLatency,
        expected: avg,
        deviation: Math.round(Math.abs(lastLatency - avg) / stdDev),
      };
      this.anomalies.push(anomaly);
      if (this.anomalies.length > 100) this.anomalies.shift();
    }

    // Check for success rate anomaly
    const recentSuccesses = p.visits.slice(-10).filter(v => v.success).length;
    const successRate = recentSuccesses / 10;
    if (successRate < 0.5 && p.visits.length >= 30) {
      const historicalRate = p.visits.filter(v => v.success).length / p.visits.length;
      if (successRate < historicalRate - 0.3) {
        const anomaly = {
          timestamp: Date.now(),
          proxy: `${proxy.host}:${proxy.port}`,
          type: 'success_rate_drop',
          current: Math.round(successRate * 100),
          historical: Math.round(historicalRate * 100),
        };
        this.anomalies.push(anomaly);
        if (this.anomalies.length > 100) this.anomalies.shift();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Get patterns for a proxy
  // -----------------------------------------------------------------------
  getPatterns(proxy) {
    const id = this._getId(proxy);
    const p = this.patterns.get(id);
    if (!p) return null;

    return {
      proxy: `${proxy.host}:${proxy.port}`,
      totalVisits: p.visits.length,
      timeOfDay: this._formatPattern(p.timeOfDay),
      dayOfWeek: this._formatPattern(p.dayOfWeek),
      topUrls: this._formatUrlPreference(p.urlPreference),
    };
  }

  // -----------------------------------------------------------------------
  // Get all patterns
  // -----------------------------------------------------------------------
  getAllPatterns() {
    const all = [];
    for (const [id, p] of this.patterns.entries()) {
      all.push(this.getPatterns(p.proxy));
    }
    return all.filter(Boolean);
  }

  // -----------------------------------------------------------------------
  // Get anomalies
  // -----------------------------------------------------------------------
  getAnomalies(limit = 20) {
    return [...this.anomalies].reverse().slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Generate predictions
  // -----------------------------------------------------------------------
  predict(proxy, futureVisits = 100) {
    const id = this._getId(proxy);
    const p = this.patterns.get(id);
    if (!p || p.visits.length < 20) return null;

    const totalVisits = p.visits.length;
    const successes = p.visits.filter(v => v.success).length;
    const latencies = p.visits.map(v => v.latency).filter(l => l > 0);

    const prediction = {
      proxy: `${proxy.host}:${proxy.port}`,
      predictedVisits: futureVisits,
      predictedSuccessRate: Math.round((successes / totalVisits) * 100),
      predictedAvgLatency: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      bestHour: this._findBestHour(p),
      bestDay: this._findBestDay(p),
      confidence: Math.min(100, Math.round((totalVisits / 100) * 100)),
    };

    this.predictions.set(id, prediction);
    return prediction;
  }

  // -----------------------------------------------------------------------
  // Get optimization suggestions
  // -----------------------------------------------------------------------
  getSuggestions(proxy) {
    const id = this._getId(proxy);
    const p = this.patterns.get(id);
    if (!p || p.visits.length < 20) return [];

    const suggestions = [];
    const pattern = this.getPatterns(proxy);
    if (!pattern) return suggestions;

    // Check for time-of-day optimization
    const hours = Object.entries(pattern.timeOfDay);
    const sortedHours = hours.sort((a, b) => (b[1].successRate || 0) - (a[1].successRate || 0));
    if (sortedHours.length > 0) {
      const bestHour = sortedHours[0];
      const worstHour = sortedHours[sortedHours.length - 1];
      if (bestHour[1].successRate > worstHour[1].successRate + 20) {
        suggestions.push({
          type: 'time_optimization',
          priority: 'high',
          message: `Schedule visits between ${bestHour[0]}:00-${bestHour[0]}:59 for ${bestHour[1].successRate}% success rate (vs ${worstHour[1].successRate}% at ${worstHour[0]}:00)`,
        });
      }
    }

    // Check for URL-specific issues
    const urls = pattern.topUrls.filter(u => u.total >= 5);
    const problematicUrls = urls.filter(u => u.successRate < 50);
    if (problematicUrls.length > 0) {
      suggestions.push({
        type: 'url_issues',
        priority: 'medium',
        message: `URLs with low success rates: ${problematicUrls.map(u => `${u.url} (${u.successRate}%)`).join(', ')}`,
      });
    }

    // Check for latency issues
    const avgLatency = pattern.timeOfDay
      ? Object.values(pattern.timeOfDay).flatMap(h => h.latency)
      : [];
    if (avgLatency.length > 0) {
      const overallAvg = avgLatency.reduce((a, b) => a + b, 0) / avgLatency.length;
      const slowHours = Object.entries(pattern.timeOfDay)
        .filter(([_, h]) => h.latency.length > 0 &&
          h.latency.reduce((a, b) => a + b, 0) / h.latency.length > overallAvg * 1.5);
      if (slowHours.length > 0) {
        suggestions.push({
          type: 'latency_optimization',
          priority: 'medium',
          message: `Latency is ${Math.round(slowHours[0][1].latency.reduce((a, b) => a + b, 0) / slowHours[0][1].latency.length)}ms at ${slowHours[0][0]}:00 vs ${Math.round(overallAvg)}ms average. Consider avoiding this hour.`,
        });
      }
    }

    return suggestions;
  }

  // -----------------------------------------------------------------------
  // Get summary
  // -----------------------------------------------------------------------
  getSummary() {
    return {
      totalProxiesTracked: this.patterns.size,
      totalAnomalies: this.anomalies.length,
      anomalyTypes: {
        latency_spike: this.anomalies.filter(a => a.type === 'latency_spike').length,
        success_rate_drop: this.anomalies.filter(a => a.type === 'success_rate_drop').length,
      },
      predictionsGenerated: this.predictions.size,
    };
  }

  // -----------------------------------------------------------------------
  // Reset all data
  // -----------------------------------------------------------------------
  reset() {
    this.patterns.clear();
    this.anomalies = [];
    this.predictions.clear();
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  _getId(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }

  _getPatterns(id, proxy) {
    if (!this.patterns.has(id)) {
      this.patterns.set(id, {
        proxy,
        visits: [],
        timeOfDay: {},
        dayOfWeek: {},
        urlPreference: {},
      });
    }
    return this.patterns.get(id);
  }

  _formatPattern(pattern) {
    const formatted = {};
    for (const [key, data] of Object.entries(pattern)) {
      formatted[key] = {
        total: data.total,
        successes: data.successes,
        successRate: data.total > 0 ? Math.round((data.successes / data.total) * 100) : 0,
        avgLatency: data.latency.length > 0
          ? Math.round(data.latency.reduce((a, b) => a + b, 0) / data.latency.length)
          : 0,
      };
    }
    return formatted;
  }

  _formatUrlPreference(pref) {
    return Object.entries(pref)
      .map(([url, data]) => ({
        url,
        total: data.total,
        successes: data.successes,
        successRate: data.total > 0 ? Math.round((data.successes / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }

  _findBestHour(p) {
    let best = { hour: null, rate: 0, total: 0 };
    for (const [hour, data] of Object.entries(p.timeOfDay)) {
      const rate = data.total > 0 ? (data.successes / data.total) * 100 : 0;
      if (data.total >= 3 && rate > best.rate) {
        best = { hour: parseInt(hour), rate: Math.round(rate), total: data.total };
      }
    }
    return best;
  }

  _findBestDay(p) {
    let best = { day: null, rate: 0, total: 0 };
    for (const [day, data] of Object.entries(p.dayOfWeek)) {
      const rate = data.total > 0 ? (data.successes / data.total) * 100 : 0;
      if (data.total >= 3 && rate > best.rate) {
        best = { day: parseInt(day), rate: Math.round(rate), total: data.total };
      }
    }
    return best;
  }
}

