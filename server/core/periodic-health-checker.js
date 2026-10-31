/**
 * Periodic Health Checker — Runs scheduled health checks on all proxies
 * Configurable intervals, batch processing, and automatic reporting
 */

export class PeriodicHealthChecker {
  constructor(options = {}) {
    this.config = {
      enabled: false,
      interval: 300000, // 5 minutes
      batchSize: 20, // Check 20 proxies per batch
      batchDelay: 1000, // 1 second between batches
      checkTimeout: 10000, // 10 second per proxy check
      minHealthyRatio: 0.5, // Alert if less than 50% healthy
      autoRotateOnLowHealth: true,
      ...options,
    };

    this.active = false;
    this.timer = null;
    this.currentBatch = null;
    this.results = [];
    this.proxyManager = null;
    this.healthMonitor = null;
    this.performanceTracker = null;
    this.notificationManager = null;
    this.rotationScheduler = null;
    this.intelligenceAnalyzer = null;
  }

  // -----------------------------------------------------------------------
  // Set dependencies
  // -----------------------------------------------------------------------
  setDependencies(proxyManager, healthMonitor, performanceTracker, notificationManager, rotationScheduler, intelligenceAnalyzer) {
    this.proxyManager = proxyManager;
    this.healthMonitor = healthMonitor;
    this.performanceTracker = performanceTracker;
    this.notificationManager = notificationManager;
    this.rotationScheduler = rotationScheduler;
    this.intelligenceAnalyzer = intelligenceAnalyzer;
  }

  // -----------------------------------------------------------------------
  // Start periodic health checking
  // -----------------------------------------------------------------------
  start() {
    if (this.active) return;
    this.active = true;

    // Initial check after 2 seconds
    setTimeout(() => this._runCheck(), 2000);

    // Scheduled checks
    this.timer = setInterval(() => this._runCheck(), this.config.interval);
  }

  // -----------------------------------------------------------------------
  // Stop periodic health checking
  // -----------------------------------------------------------------------
  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Run a health check cycle
  // -----------------------------------------------------------------------
  async _runCheck() {
    if (this.currentBatch) return; // Don't overlap checks
    this.currentBatch = true;

    try {
      const proxies = this.proxyManager.getAll();
      const total = proxies.length;
      const batches = Math.ceil(total / this.config.batchSize);

      let checked = 0;
      let healthy = 0;
      let unhealthy = 0;

      for (let i = 0; i < batches; i++) {
        const batch = proxies.slice(i * this.config.batchSize, (i + 1) * this.config.batchSize);

        for (const proxy of batch) {
          const result = await this._checkProxy(proxy);
          checked++;
          if (result.success) healthy++;
          else unhealthy++;

          // Update all trackers
          if (this.healthMonitor) {
            this.healthMonitor.recordCheck(proxy, {
              success: result.success,
              latency: result.latency,
              error: result.error,
            });
          }

          if (this.performanceTracker) {
            this.performanceTracker.record(proxy, {
              success: result.success,
              latency: result.latency,
              error: result.error,
            });
          }

          if (this.intelligenceAnalyzer) {
            this.intelligenceAnalyzer.recordVisit(proxy, {
              success: result.success,
              latency: result.latency,
            });
          }

          // Notify on failure
          if (!result.success && this.notificationManager) {
            this.notificationManager.notifyProxyFailure(proxy, result.error || 'Unknown error');
          }
        }

        // Delay between batches
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.batchDelay));
        }
      }

      // Record results
      this.results.push({
        timestamp: Date.now(),
        total,
        checked,
        healthy,
        unhealthy,
        healthyRatio: total > 0 ? healthy / total : 0,
      });

      if (this.results.length > 100) this.results.shift();

      // Check if pool health is low
      if (this.config.autoRotateOnLowHealth && total > 0) {
        const healthyRatio = healthy / total;
        if (healthyRatio < this.config.minHealthyRatio) {
          // Force rotation
          if (this.rotationScheduler) {
            this.rotationScheduler.rotate('low_health');
          }
          if (this.notificationManager) {
            this.notificationManager.notifyLowProxyCount(healthy);
          }
        }
      }
    } catch (err) {
      if (this.notificationManager) {
        this.notificationManager.notifyError(err.message, 'periodic-health-checker');
      }
    } finally {
      this.currentBatch = false;
    }
  }

  // -----------------------------------------------------------------------
  // Check a single proxy
  // -----------------------------------------------------------------------
  async _checkProxy(proxy) {
    const start = Date.now();
    try {
      const result = await this.proxyManager.checkProxy(proxy);
      const latency = Date.now() - start;
      return {
        success: result.statusCode === 200 || result.statusCode === 301 || result.statusCode === 302,
        latency,
        statusCode: result.statusCode,
        error: result.error,
      };
    } catch (err) {
      return {
        success: false,
        latency: Date.now() - start,
        error: err.message,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Get latest results
  // -----------------------------------------------------------------------
  getResults(limit = 20) {
    return [...this.results].reverse().slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Get stats
  // -----------------------------------------------------------------------
  getStats() {
    const last = this.results[this.results.length - 1];
    return {
      enabled: this.config.enabled,
      active: this.active,
      interval: this.config.interval,
      batchSize: this.config.batchSize,
      totalChecks: this.results.length,
      lastCheck: last || null,
      currentBatch: this.currentBatch,
    };
  }

  // -----------------------------------------------------------------------
  // Update config
  // -----------------------------------------------------------------------
  updateConfig(config) {
    if (config.interval !== undefined) this.config.interval = config.interval;
    if (config.batchSize !== undefined) this.config.batchSize = config.batchSize;
    if (config.batchDelay !== undefined) this.config.batchDelay = config.batchDelay;
    if (config.checkTimeout !== undefined) this.config.checkTimeout = config.checkTimeout;
    if (config.minHealthyRatio !== undefined) this.config.minHealthyRatio = config.minHealthyRatio;
    if (config.autoRotateOnLowHealth !== undefined) this.config.autoRotateOnLowHealth = config.autoRotateOnLowHealth;
  }
}

