// ============================================================================
// network-condition.js — Network condition simulation controller.
// Features:
//   • Per-visit network throttling (CDP emulation)
//   • Save-Data header injection
//   • Latency injection (random delay on responses)
//   • Connection type presets (2G/3G/4G/slow-2G)
//   • Per-URL network conditions
// ============================================================================

import logger from '../utils/logger.js';

const CONNECTION_PRESETS = {
  'slow-2g': { download: 50 * 1024, upload: 20 * 1024, latency: 4000, saveData: true },
  '2g': { download: 250 * 1024, upload: 50 * 1024, latency: 3000, saveData: true },
  '3g-slow': { download: 400 * 1024, upload: 400 * 1024, latency: 1500, saveData: false },
  '3g': { download: 1.6 * 1024 * 1024, upload: 750 * 1024, latency: 500, saveData: false },
  '4g': { download: 4 * 1024 * 1024, upload: 3 * 1024 * 1024, latency: 200, saveData: false },
  'wifi': { download: 100 * 1024 * 1024, upload: 50 * 1024 * 1024, latency: 0, saveData: false },
};

export class NetworkConditionManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      defaultConnection: null, // null = no throttling
      saveDataHeader: true,
      latencyInjection: true,
      ...config,
    };
    this.perUrlConditions = new Map(); // url -> connectionType
    this.stats = { visitsThrottled: 0, saveDataHeaders: 0, latencyInjected: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  setConnectionForUrl(url, connectionType) {
    this.perUrlConditions.set(url, connectionType);
  }

  removeUrlCondition(url) {
    return this.perUrlConditions.delete(url);
  }

  /**
   * Get connection type for a URL (or default).
   */
  getConnectionForUrl(url) {
    return this.perUrlConditions.get(url) || this.config.defaultConnection;
  }

  /**
   * Generate HTTP headers for a connection type (Save-Data).
   */
  generateHeaders(connectionType) {
    if (!this.config.saveDataHeader) return {};
    const preset = CONNECTION_PRESETS[connectionType];
    if (preset?.saveData) {
      this.stats.saveDataHeaders++;
      return { 'Save-Data': 'on' };
    }
    return {};
  }

  /**
   * Inject latency (random delay) for a connection type.
   */
  async injectLatency(connectionType) {
    if (!this.config.latencyInjection) return;
    const preset = CONNECTION_PRESETS[connectionType];
    if (preset) {
      const delay = preset.latency * (0.5 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, delay));
      this.stats.latencyInjected++;
    }
  }

  /**
   * Get connection presets for display.
   */
  getPresets() {
    return Object.entries(CONNECTION_PRESETS).map(([name, preset]) => ({
      name,
      downloadKBps: Math.round(preset.download / 1024),
      uploadKBps: Math.round(preset.upload / 1024),
      latencyMs: preset.latency,
      saveData: preset.saveData,
    }));
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      defaultConnection: this.config.defaultConnection,
      perUrlRules: this.perUrlConditions.size,
      ...this.stats,
      presets: this.getPresets(),
    };
  }
}

export { CONNECTION_PRESETS };
export default NetworkConditionManager;
