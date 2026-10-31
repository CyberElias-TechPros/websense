/**
 * Proxy Rotation Scheduler — Automatic proxy rotation based on health & performance
 * Rotates on: failure threshold, latency threshold, or scheduled intervals
 */

export class ProxyRotationScheduler {
  constructor(options = {}) {
    this.config = {
      rotationInterval: 300000, // 5 minutes
      failureThreshold: 3,
      latencyThreshold: 10000, // 10 seconds
      maxRotationsPerHour: 20,
      minIntervalBetweenRotations: 30000, // 30 seconds
      ...options,
    };

    this.rotationHistory = []; // Recent rotation events
    this.rotationCount = 0;
    this.lastRotation = null;
    this.currentProxy = null;
    this.onRotation = null; // callback
    this.active = false;
    this.timer = null;
  }

  // -----------------------------------------------------------------------
  // Start rotation scheduler
  // -----------------------------------------------------------------------
  start(proxyList, options = {}) {
    if (this.active) return;
    this.active = true;
    this.proxies = proxyList;
    this.currentProxy = this.proxies[0];

    if (options.onRotation) {
      this.onRotation = options.onRotation;
    }

    this.timer = setInterval(() => {
      this._rotate();
    }, this.config.rotationInterval);
  }

  // -----------------------------------------------------------------------
  // Stop rotation scheduler
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
  // Get current proxy
  // -----------------------------------------------------------------------
  getCurrent() {
    return this.currentProxy;
  }

  // -----------------------------------------------------------------------
  // Force rotation
  // -----------------------------------------------------------------------
  rotate(reason = 'manual') {
    if (!this.proxies || this.proxies.length < 2) return null;

    // Check rate limit
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const recentRotations = this.rotationHistory.filter(
      (r) => r.timestamp > hourAgo
    ).length;
    if (recentRotations >= this.config.maxRotationsPerHour) {
      return null;
    }

    // Check min interval
    if (this.lastRotation && now - this.lastRotation < this.config.minIntervalBetweenRotations) {
      return null;
    }

    const currentIndex = this.proxies.indexOf(this.currentProxy);
    const nextIndex = (currentIndex + 1) % this.proxies.length;
    const previous = this.currentProxy;
    this.currentProxy = this.proxies[nextIndex];

    const rotation = {
      timestamp: now,
      reason,
      from: previous,
      to: this.currentProxy,
    };
    this.rotationHistory.push(rotation);
    this.rotationCount++;
    this.lastRotation = now;

    // Keep history bounded
    if (this.rotationHistory.length > 200) {
      this.rotationHistory.shift();
    }

    // Notify
    if (this.onRotation) {
      this.onRotation(rotation);
    }

    return rotation;
  }

  // -----------------------------------------------------------------------
  // Automatic rotation tick
  // -----------------------------------------------------------------------
  _rotate() {
    // Check if current proxy has failed recently
    const lastRotation = this.rotationHistory[this.rotationHistory.length - 1];
    if (lastRotation) {
      const timeSinceRotation = Date.now() - lastRotation.timestamp;
      if (timeSinceRotation < this.config.minIntervalBetweenRotations) {
        return;
      }
    }
    this.rotate('scheduled');
  }

  // -----------------------------------------------------------------------
  // Get rotation stats
  // -----------------------------------------------------------------------
  getStats() {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const recentRotations = this.rotationHistory.filter(
      (r) => r.timestamp > hourAgo
    );

    const reasons = {};
    for (const r of recentRotations) {
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    }

    return {
      active: this.active,
      currentProxy: this.currentProxy ? {
        host: this.currentProxy.host,
        port: this.currentProxy.port,
        country: this.currentProxy.country,
      } : null,
      rotationCount: this.rotationCount,
      rotationsLastHour: recentRotations.length,
      lastRotation: this.lastRotation ? {
        timestamp: this.lastRotation,
        timeAgo: Math.round((now - this.lastRotation) / 1000),
      } : null,
      reasons,
    };
  }

  // -----------------------------------------------------------------------
  // Get rotation history
  // -----------------------------------------------------------------------
  getHistory(limit = 50) {
    return this.rotationHistory.slice(-limit);
  }

  // -----------------------------------------------------------------------
  // Check if proxy should be rotated out
  // -----------------------------------------------------------------------
  shouldRotate(proxy, lastResult) {
    if (!lastResult) return false;

    // Rotate on failure
    if (!lastResult.success) {
      return true;
    }

    // Rotate on high latency
    if (lastResult.latency && lastResult.latency > this.config.latencyThreshold) {
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Get proxies that need rotation
  // -----------------------------------------------------------------------
  getRotationCandidates(results) {
    const candidates = [];
    for (const result of results) {
      if (this.shouldRotate(result.proxy, result.result)) {
        candidates.push(result);
      }
    }
    return candidates;
  }
}

