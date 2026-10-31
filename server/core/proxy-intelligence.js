// ============================================================================
// proxy-intelligence.js — Proxy intelligence layer.
// Features:
//   • Trust score (speed + reliability + detection + freshness)
//   • Provider API auto-refresh
//   • Sticky session support
//   • Proxy type awareness (residential/mobile/ISP/datacenter)
//   • Auto-blacklist on repeated detection
// ============================================================================

import logger from '../utils/logger.js';

export class ProxyIntelligence {
  constructor(proxyManager, config = {}) {
    this.proxyManager = proxyManager;
    this.config = {
      enabled: true,
      trustScoreWeights: { speed: 0.3, reliability: 0.4, freshness: 0.2, detection: 0.1 },
      minTrustScore: 30,
      stickySessionChance: 0.3,
      stickySessionDuration: 30 * 60 * 1000, // 30 min
      ...config,
    };
    this.trustScores = new Map(); // host -> { score, speed, reliability, freshness, detection, lastUsed }
    this.stickySessions = new Map(); // host -> sticky proxy config
    this.blacklist = new Map(); // host -> { reason, until, count }
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  /**
   * Calculate or update trust score for a proxy.
   */
  updateTrustScore(proxy, metrics) {
    const existing = this.trustScores.get(proxy.host) || {
      speed: 50, reliability: 50, freshness: 50, detection: 50, score: 50, lastUsed: Date.now(),
    };

    if (metrics.latency !== undefined) {
      // Lower latency = higher score (map 500ms → 100, 3000ms → 0)
      existing.speed = Math.max(0, Math.min(100, 100 - (metrics.latency / 30)));
    }
    if (metrics.success !== undefined) {
      // Success rate: 1.0 → 100, 0.0 → 0
      existing.reliability = metrics.success * 100;
    }
    existing.freshness = Math.max(0, 100 - (Date.now() - existing.lastUsed) / (86400_000 * 7));
    existing.detection = existing.detection * 0.95; // decay if not flagged
    existing.lastUsed = Date.now();

    existing.score = Math.round(
      existing.speed * this.config.trustScoreWeights.speed +
      existing.reliability * this.config.trustScoreWeights.reliability +
      existing.freshness * this.config.trustScoreWeights.freshness +
      existing.detection * this.config.trustScoreWeights.detection
    );

    this.trustScores.set(proxy.host, existing);
    return existing;
  }

  /**
   * Mark a proxy as detected/blocked.
   */
  flagDetection(proxy, reason = 'unknown') {
    const score = this.trustScores.get(proxy.host);
    if (score) {
      score.detection = 0;
      score.score = Math.round(
        score.speed * this.config.trustScoreWeights.speed +
        score.reliability * this.config.trustScoreWeights.reliability +
        score.freshness * this.config.trustScoreWeights.freshness
      );
      this.trustScores.set(proxy.host, score);
    }
    logger.warn(`⚠️ Proxy ${proxy.host} flagged for detection: ${reason}`);
  }

  /**
   * Get or create a sticky session for a proxy.
   */
  getStickySession(proxy) {
    if (Math.random() > this.config.stickySessionChance) return null;
    const existing = this.stickySessions.get(proxy.host);
    if (existing && Date.now() - existing.created < this.config.stickySessionDuration) {
      return existing;
    }
    const session = {
      host: proxy.host,
      port: proxy.port,
      sessionId: `sess-${proxy.host}-${Math.random().toString(36).slice(2, 10)}`,
      created: Date.now(),
    };
    this.stickySessions.set(proxy.host, session);
    return session;
  }

  /**
   * Select the best proxy based on trust score.
   */
  selectBest() {
    const active = this.proxyManager.getActiveProxies();
    if (active.length === 0) return null;

    const scored = active.map((p) => {
      const score = this.trustScores.get(p.host)?.score ?? 50;
      const blacklisted = this.blacklist.get(p.host);
      if (blacklisted && blacklisted.until > Date.now()) {
        return { proxy: p, score: -1 }; // blacklisted
      }
      return { proxy: p, score };
    }).filter((p) => p.score >= this.config.minTrustScore);

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].proxy;
  }

  /**
   * Get full proxy stats with intelligence.
   */
  getStats() {
    const proxies = this.proxyManager.proxies || [];
    return proxies.map((p) => {
      const score = this.trustScores.get(p.host);
      const blacklisted = this.blacklist.get(p.host);
      return {
        host: p.host,
        port: p.port,
        country: p.country,
        city: p.city,
        flag: p.flag,
        enabled: p.enabled,
        status: p.status,
        successCount: p.successCount,
        failCount: p.failCount,
        avgLatency: p.avgLatency,
        trustScore: score?.score ?? 50,
        speedScore: score?.speed ?? 50,
        reliabilityScore: score?.reliability ?? 50,
        freshnessScore: score?.freshness ?? 50,
        detectionScore: score?.detection ?? 50,
        blacklisted: blacklisted?.until > Date.now(),
        stickySession: this.stickySessions.has(p.host),
      };
    });
  }

  /**
   * Auto-blacklist a proxy after repeated failures.
   */
  autoBlacklist(host, reason = 'repeated_failures') {
    const current = this.blacklist.get(host) || { count: 0, reason, until: 0 };
    current.count++;
    current.reason = reason;
    current.until = Date.now() + 60 * 60 * 1000; // 1 hour cooldown
    this.blacklist.set(host, current);
    logger.warn(`🚫 Proxy ${host} auto-blacklisted (${reason}) for 1 hour (count: ${current.count})`);
  }

  /**
   * Clear blacklist entry.
   */
  clearBlacklist(host) {
    this.blacklist.delete(host);
  }

  getConfig() {
    return {
      enabled: this.config.enabled,
      minTrustScore: this.config.minTrustScore,
      stickySessionChance: this.config.stickySessionChance,
      stickySessionDuration: this.config.stickySessionDuration,
      trustScored: this.trustScores.size,
      blacklisted: this.blacklist.size,
      stickySessions: this.stickySessions.size,
    };
  }
}

export default ProxyIntelligence;
