// ============================================================================
// dns-simulation.js — DNS-level simulation (F4.7).
// Note: Full DNS-level simulation needs root/system access. This module
// provides header-level simulation and resolver awareness without root.
// Features:
//   • DNS resolver awareness (header simulation)
//   • DoH (DNS over HTTPS) simulation
//   • DNS query timing simulation
//   • Resolver rotation (header-based)
// ============================================================================

import logger from '../utils/logger.js';

const RESOLVERS = [
  '8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1',
  '9.9.9.9', '208.67.222.222', '4.2.2.1', '64.6.64.6',
];

export class DnsSimulator {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      resolverRotation: true,
      simulateLatency: true,
      needsRoot: false,
      ...config,
    };
    this.stats = { queriesSimulated: 0, resolversRotated: 0, latencySimulated: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Get a random DNS resolver.
   */
  getRandomResolver() {
    return RESOLVERS[Math.floor(Math.random() * RESOLVERS.length)];
  }

  /**
   * Simulate DNS query latency.
   */
  async simulateQueryLatency(domain) {
    if (!this.config.simulateLatency) return 0;
    const latency = 10 + Math.random() * 100; // 10-110ms
    this.stats.latencySimulated++;
    await new Promise((r) => setTimeout(r, Math.min(latency, 50)));
    this.stats.queriesSimulated++;
    return latency;
  }

  /**
   * Generate DNS-related headers (for HTTP mode).
   */
  generateDnsHeaders() {
    if (!this.config.resolverRotation) return {};
    this.stats.resolversRotated++;
    const resolver = this.getRandomResolver();
    return {
      'X-DNS-Resolver': resolver,
      'X-DNS-Latency': String(Math.floor(10 + Math.random() * 50)),
    };
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      needsRoot: this.config.needsRoot,
      resolverCount: RESOLVERS.length,
      resolvers: RESOLVERS,
      ...this.stats,
    };
  }
}

export { RESOLVERS };
export default DnsSimulator;
