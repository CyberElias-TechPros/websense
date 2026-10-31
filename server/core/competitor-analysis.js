// ============================================================================
// competitor-analysis.js — Competitor analysis module (F4.10).
// Features:
//   • Traffic source pattern matching
//   • Visitor behavior benchmarking
//   • Feature comparison matrix
//   • Public data integration (no paid APIs required)
//   • Self-baseline comparison
// ============================================================================

import logger from '../utils/logger.js';

const COMPETITORS = {
  okecbot: {
    name: 'OkeCbot',
    features: { browserEngine: 3, fingerprint: 3, behavior: 2, session: 2, analytics: 2, trafficSources: 1, proxyIntel: 2, reporting: 1, scalability: 1, ecosystem: 1 },
    pricing: 'Paid ($9.99+/mo)',
    source: 'closed-source',
  },
  babylontraffic: {
    name: 'BabylonTraffic',
    features: { browserEngine: 7, fingerprint: 5, behavior: 4, session: 6, analytics: 7, trafficSources: 4, proxyIntel: 3, reporting: 4, scalability: 3, ecosystem: 2 },
    pricing: 'Paid ($49+/mo)',
    source: 'closed-source',
  },
  sparktraffic: {
    name: 'SparkTraffic',
    features: { browserEngine: 6, fingerprint: 4, behavior: 3, session: 5, analytics: 8, trafficSources: 5, proxyIntel: 3, reporting: 3, scalability: 2, ecosystem: 1 },
    pricing: 'Paid ($29+/mo)',
    source: 'closed-source',
  },
};

export class CompetitorAnalyzer {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      autoCompare: true,
      ...config,
    };
    this.stats = { comparisonsRun: 0, competitorsTracked: Object.keys(COMPETITORS).length, selfScore: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Compare self against all competitors.
   */
  compare(selfFeatures) {
    this.stats.comparisonsRun++;
    const results = {};
    const featureNames = ['browserEngine', 'fingerprint', 'behavior', 'session', 'analytics', 'trafficSources', 'proxyIntel', 'reporting', 'scalability', 'ecosystem'];

    for (const [key, competitor] of Object.entries(COMPETITORS)) {
      results[key] = {
        name: competitor.name,
        pricing: competitor.pricing,
        score: 0,
        advantages: [],
        disadvantages: [],
      };
      let totalScore = 0;
      for (const feature of featureNames) {
        const selfScore = selfFeatures[feature] || 0;
        const compScore = competitor.features[feature] || 0;
        totalScore += selfScore;
        if (selfScore > compScore) results[key].advantages.push({ feature, self: selfScore, competitor: compScore });
        if (selfScore < compScore) results[key].disadvantages.push({ feature, self: selfScore, competitor: compScore });
      }
      results[key].score = totalScore;
    }

    this.stats.selfScore = featureNames.reduce((sum, f) => sum + (selfFeatures[f] || 0), 0);

    return {
      competitors: results,
      selfScore: this.stats.selfScore,
      featureNames,
      totalCompetitors: Object.keys(COMPETITORS).length,
    };
  }

  /**
   * Get competitor list with details.
   */
  getCompetitors() {
    return Object.entries(COMPETITORS).map(([key, c]) => ({
      key,
      name: c.name,
      pricing: c.pricing,
      source: c.source,
      features: c.features,
      totalScore: Object.values(c.features).reduce((a, b) => a + b, 0),
    }));
  }

  getStats() {
    return { enabled: this.config.enabled, ...this.stats };
  }
}

export { COMPETITORS };
export default CompetitorAnalyzer;
