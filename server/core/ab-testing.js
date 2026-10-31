// ============================================================================
// ab-testing.js — A/B testing support.
// Features:
//   • Split traffic across variants
//   • Cookie-based assignment
//   • Per-variant stats
//   • Weighted variant distribution
// ============================================================================

import logger from '../utils/logger.js';

export class AbTestingManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      ...config,
    };
    this.tests = new Map(); // testId -> { variants: [{name, weight, url}], active, createdAt }
    this.assignments = new Map(); // visitorId -> { testId, variant }
  }

  updateConfig(config) { Object.assign(this.config, config); }

  createTest({ testId, variants, active = true }) {
    if (!testId || !Array.isArray(variants) || variants.length < 2) return null;
    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
    const normalized = variants.map((v) => ({
      name: v.name,
      url: v.url,
      weight: (v.weight || 1) / totalWeight,
    }));
    this.tests.set(testId, { testId, variants: normalized, active, createdAt: Date.now() });
    return this.tests.get(testId);
  }

  removeTest(testId) {
    return this.tests.delete(testId);
  }

  toggleTest(testId, active) {
    const test = this.tests.get(testId);
    if (test) test.active = !!active;
    return test;
  }

  /**
   * Get the variant for a visitor.
   */
  getVariant(testId, visitorId) {
    const test = this.tests.get(testId);
    if (!test || !test.active) return null;

    // Check existing assignment
    const existing = this.assignments.get(visitorId)?.[testId];
    if (existing) return existing;

    // Pick weighted random variant
    let r = Math.random();
    for (const variant of test.variants) {
      r -= variant.weight;
      if (r <= 0) {
        // Store assignment
        if (!this.assignments.has(visitorId)) this.assignments.set(visitorId, {});
        this.assignments.get(visitorId)[testId] = variant;
        return variant;
      }
    }
    return test.variants[0];
  }

  /**
   * Apply URL transformation for active tests.
   */
  applyTests(url, visitorId) {
    let result = url;
    const applied = [];
    for (const [testId, test] of this.tests) {
      if (!test.active) continue;
      const variant = this.getVariant(testId, visitorId);
      if (variant?.url) {
        result = variant.url;
        applied.push({ testId, variant: variant.name });
      }
    }
    return { url: result, applied };
  }

  /**
   * Record variant stats.
   */
  recordVariant(testId, variantName, success, latency) {
    const test = this.tests.get(testId);
    if (!test) return;
    if (!test.stats) test.stats = {};
    if (!test.stats[variantName]) test.stats[variantName] = { visits: 0, successes: 0, totalLatency: 0 };
    test.stats[variantName].visits++;
    if (success) test.stats[variantName].successes++;
    test.stats[variantName].totalLatency += latency;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      testCount: this.tests.size,
      activeTests: [...this.tests.values()].filter((t) => t.active).length,
      tests: [...this.tests.values()].map((t) => ({
        testId: t.testId,
        active: t.active,
        variants: t.variants.map((v) => v.name),
        stats: t.stats || {},
      })),
    };
  }
}

export default AbTestingManager;
