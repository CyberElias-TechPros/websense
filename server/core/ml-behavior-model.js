// ============================================================================
// ml-behavior-model.js — ML behavior model (F4.1).
// Per FEATURES.md note: rule-based simulation achieves most value at 10% cost.
// Features:
//   • Behavior pattern library (rule-based)
//   • Pattern matching for site types
//   • Adaptive behavior profiles
//   • Behavior score calculation
//   • Realism scoring
// ============================================================================

import logger from '../utils/logger.js';

export class MLBehaviorModel {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      modelVersion: '1.0-rulebased',
      useML: false, // rule-based per FEATURES.md guidance
      ...config,
    };
    this.behaviorProfiles = new Map(); // profileId -> { pattern, weights, rules }
    this.stats = { profilesEvaluated: 0, bestProfileSelected: 0, behaviorScores: 0, patternsMatched: 0 };

    // Default behavior profiles
    this._initDefaultProfiles();
  }

  updateConfig(config) { Object.assign(this.config, config); }

  _initDefaultProfiles() {
    // Casual browser: short dwell, minimal scroll, no interactions
    this.behaviorProfiles.set('casual', {
      name: 'casual',
      dwellMin: 1,
      dwellMax: 4,
      scrollDepth: 0.2,
      scrollSteps: 2,
      interactionChance: 0.1,
      pageViews: 1,
    });

    // Researcher: longer dwell, full scroll, some interactions
    this.behaviorProfiles.set('researcher', {
      name: 'researcher',
      dwellMin: 4,
      dwellMax: 12,
      scrollDepth: 0.8,
      scrollSteps: 8,
      interactionChance: 0.4,
      pageViews: 3,
    });

    // Shopper: medium dwell, scroll to products, cart interactions
    this.behaviorProfiles.set('shopper', {
      name: 'shopper',
      dwellMin: 3,
      dwellMax: 8,
      scrollDepth: 0.6,
      scrollSteps: 6,
      interactionChance: 0.5,
      pageViews: 2,
    });

    // Content consumer: long dwell, full scroll, video interaction
    this.behaviorProfiles.set('content-consumer', {
      name: 'content-consumer',
      dwellMin: 6,
      dwellMax: 20,
      scrollDepth: 1.0,
      scrollSteps: 10,
      interactionChance: 0.3,
      pageViews: 4,
    });
  }

  /**
   * Select the best behavior profile for a URL/page type.
   */
  selectProfile(url, pageType = null) {
    this.stats.profilesEvaluated++;

    // Heuristic: match page type to profile
    if (pageType === 'ecommerce' || (url && url.includes('shop'))) {
      this.stats.bestProfileSelected++;
      this.stats.patternsMatched++;
      return this.behaviorProfiles.get('shopper');
    }
    if (pageType === 'video' || (url && url.includes('video'))) {
      this.stats.bestProfileSelected++;
      this.stats.patternsMatched++;
      return this.behaviorProfiles.get('content-consumer');
    }
    if (pageType === 'article' || (url && url.includes('blog'))) {
      this.stats.bestProfileSelected++;
      this.stats.patternsMatched++;
      return this.behaviorProfiles.get('content-consumer');
    }

    // Default: pick randomly weighted
    const profiles = [...this.behaviorProfiles.values()];
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    this.stats.bestProfileSelected++;
    return profile;
  }

  /**
   * Calculate a realism score (0-100) based on behavior parameters.
   */
  calculateRealismScore(behavior) {
    let score = 50;
    if (behavior.dwellTime && behavior.dwellTime >= 2000 && behavior.dwellTime <= 8000) score += 15;
    if (behavior.scrollDepth && behavior.scrollDepth > 0.3 && behavior.scrollDepth < 0.9) score += 10;
    if (behavior.interactions > 0 && behavior.interactions < 5) score += 10;
    if (behavior.mouseMovement && behavior.mouseMovement > 3) score += 10;
    if (behavior.referrer && behavior.referrer !== 'direct') score += 5;
    this.stats.behaviorScores++;
    return Math.min(100, score);
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      modelVersion: this.config.modelVersion,
      useML: this.config.useML,
      profileCount: this.behaviorProfiles.size,
      profileNames: [...this.behaviorProfiles.keys()],
      ...this.stats,
    };
  }
}

export default MLBehaviorModel;
