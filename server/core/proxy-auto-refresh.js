/**
 * Proxy Auto-Refresh — Periodically fetch new proxies and rotate out old ones
 * Maintains a fresh proxy pool by checking providers on a schedule
 */

import logger from '../utils/logger.js';

export class ProxyAutoRefresh {
  constructor(options = {}) {
    this.config = {
      enabled: false,
      interval: 3600000, // 1 hour
      maxProxies: 200,
      minProxies: 50,
      staleThreshold: 1800000, // 30 minutes without successful visit = stale
      replacementRatio: 0.2, // Replace 20% of pool on each refresh
      provider: 'webshare',
      apiUrl: null,
      ...options,
    };

    this.refreshHistory = [];
    this.active = false;
    this.timer = null;
    this.integrations = null;
    this.proxyManager = null;
    this.healthMonitor = null;
    this.notificationManager = null;
  }

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------
  init(integrations, proxyManager, healthMonitor, notificationManager) {
    this.integrations = integrations;
    this.proxyManager = proxyManager;
    this.healthMonitor = healthMonitor;
    this.notificationManager = notificationManager;
  }

  // -----------------------------------------------------------------------
  // Start auto-refresh
  // -----------------------------------------------------------------------
  start() {
    if (this.active) return;
    this.active = true;

    // Initial refresh after 5 seconds
    setTimeout(() => this.refresh(), 5000);

    // Scheduled refresh
    this.timer = setInterval(() => this.refresh(), this.config.interval);
  }

  // -----------------------------------------------------------------------
  // Stop auto-refresh
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
  // Run a refresh cycle
  // -----------------------------------------------------------------------
  async refresh() {
    const start = Date.now();
    logger.info(`🔄 Proxy auto-refresh starting...`);

    try {
      // Get current proxy count
      const currentProxies = this.proxyManager.getAll();
      const currentCount = currentProxies.length;

      // Check if we need to refresh
      if (currentCount >= this.config.maxProxies && currentCount < this.config.minProxies * 2) {
        logger.info(`Proxy count is ${currentCount}, no refresh needed`);
        return { refreshed: false, reason: 'enough_proxies' };
      }

      // Fetch new proxies from provider
      let newProxies = [];
      if (this.config.provider === 'webshare') {
        const apiUrl = this.config.apiUrl || await this.integrations.getWebshareDownloadUrl();
        newProxies = await this.integrations.fetchAndAdd(apiUrl);
      } else {
        newProxies = await this.integrations.fetchAndAdd(null, this.config.provider);
      }

      // Identify stale proxies (no recent successful visits)
      const staleProxies = this._identifyStaleProxies(currentProxies);

      // Calculate how many to replace
      const replaceCount = Math.min(
        Math.floor(currentProxies.length * this.config.replacementRatio),
        newProxies.length,
        staleProxies.length
      );

      // Remove stale proxies
      const removed = [];
      for (let i = 0; i < replaceCount; i++) {
        const proxy = staleProxies[i];
        if (proxy) {
          this.proxyManager.remove(`${proxy.host}:${proxy.port}`);
          removed.push(`${proxy.host}:${proxy.port}`);
        }
      }

      // Add new proxies (only up to the replacement count)
      const added = [];
      for (let i = 0; i < replaceCount; i++) {
        const proxy = newProxies[i];
        if (proxy) {
          added.push(`${proxy.host}:${proxy.port}`);
        }
      }

      // Record refresh history
      const refresh = {
        timestamp: start,
        duration: Date.now() - start,
        currentCount,
        fetched: newProxies.length,
        replaced: removed.length,
        added: added.length,
        removed,
        added,
      };
      this.refreshHistory.push(refresh);
      if (this.refreshHistory.length > 100) this.refreshHistory.shift();

      // Notify
      if (this.notificationManager) {
        this.notificationManager.notifyMilestone(
          `Proxy refresh: ${added.length} added, ${removed.length} removed (total: ${currentProxies.length - removed.length + added.length})`
        );
      }

      logger.info(`🔄 Proxy auto-refresh complete: ${added.length} added, ${removed.length} removed`);
      return refresh;
    } catch (err) {
      logger.error(`Proxy auto-refresh failed: ${err.message}`);
      if (this.notificationManager) {
        this.notificationManager.notifyError(err.message, 'proxy-auto-refresh');
      }
      return { refreshed: false, error: err.message };
    }
  }

  // -----------------------------------------------------------------------
  // Identify stale proxies
  // -----------------------------------------------------------------------
  _identifyStaleProxies(proxies) {
    const now = Date.now();
    const stale = [];

    for (const proxy of proxies) {
      if (this.healthMonitor) {
        const stats = this.healthMonitor.getStats(proxy);
        if (stats) {
          // Stale if no successful visit in staleThreshold or health score is poor
          if (stats.lastSuccess && (now - stats.lastSuccess) > this.config.staleThreshold) {
            stale.push(proxy);
          } else if (stats.healthScore < 30 && stats.totalChecks > 5) {
            stale.push(proxy);
          }
        }
      } else {
        // Without health monitor, use random selection
        if (Math.random() < this.config.replacementRatio * 0.1) {
          stale.push(proxy);
        }
      }
    }

    // Sort by staleness (oldest first)
    stale.sort((a, b) => {
      const aTime = this.healthMonitor?.getStats(a)?.lastSuccess || 0;
      const bTime = this.healthMonitor?.getStats(b)?.lastSuccess || 0;
      return aTime - bTime;
    });

    return stale;
  }

  // -----------------------------------------------------------------------
  // Get refresh history
  // -----------------------------------------------------------------------
  getHistory(limit = 20) {
    return [...this.refreshHistory].reverse().slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Get stats
  // -----------------------------------------------------------------------
  getStats() {
    return {
      enabled: this.config.enabled,
      active: this.active,
      provider: this.config.provider,
      interval: this.config.interval,
      maxProxies: this.config.maxProxies,
      minProxies: this.config.minProxies,
      totalRefreshes: this.refreshHistory.length,
      lastRefresh: this.refreshHistory.length > 0
        ? this.refreshHistory[this.refreshHistory.length - 1]
        : null,
    };
  }

  // -----------------------------------------------------------------------
  // Update config
  // -----------------------------------------------------------------------
  updateConfig(config) {
    if (config.provider !== undefined) this.config.provider = config.provider;
    if (config.apiUrl !== undefined) this.config.apiUrl = config.apiUrl;
    if (config.interval !== undefined) this.config.interval = config.interval;
    if (config.maxProxies !== undefined) this.config.maxProxies = config.maxProxies;
    if (config.minProxies !== undefined) this.config.minProxies = config.minProxies;
    if (config.replacementRatio !== undefined) this.config.replacementRatio = config.replacementRatio;
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
  }
}

