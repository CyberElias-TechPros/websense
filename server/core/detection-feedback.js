// ============================================================================
// detection-feedback.js — Detection feedback loop (F4.2).
// Detects CAPTCHA/403/429/blocked-content → auto-adjust strategy,
// blacklist proxies, slow down, adjust referrer mix, switch mode.
// ============================================================================

import logger from '../utils/logger.js';

export class DetectionFeedbackLoop {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      autoBlacklist: true,
      autoSlowdown: true,
      autoModeSwitch: true,
      adjustmentInterval: 60000, // 60s
      ...config,
    };
    this.recentSignals = []; // Detection signals in last 5 min
    this.autoAdjustments = { referrerMixShift: 0, modeSwitchRequested: false, slowdownFactor: 1 };
    this.stats = { signalsDetected: 0, proxiesBlacklisted: 0, slowdownsTriggered: 0, modeSwitches: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Record a detection signal and trigger auto-adjustment.
   */
  recordSignal(signal, details = {}) {
    this.recentSignals.push({ signal, details, timestamp: Date.now() });
    this.stats.signalsDetected++;

    // Keep only last 5 minutes
    const cutoff = Date.now() - 300000;
    this.recentSignals = this.recentSignals.filter((s) => s.timestamp > cutoff);

    // Auto-blacklist proxy if too many detection signals
    if (this.config.autoBlacklist && details.proxyHost) {
      const signalsForProxy = this.recentSignals.filter(
        (s) => s.details.proxyHost === details.proxyHost
      );
      if (signalsForProxy.length >= 3) {
        this.stats.proxiesBlacklisted++;
        logger.warn(`⛔ Auto-blacklisted ${details.proxyHost} after ${signalsForProxy.length} detection signals`);
      }
    }

    // Auto-slowdown if detection rate is high
    if (this.config.autoSlowdown && this.recentSignals.length >= 5) {
      if (this.autoAdjustments.slowdownFactor === 1) {
        this.autoAdjustments.slowdownFactor = 2; // Double the delay between visits
        this.stats.slowdownsTriggered++;
        logger.warn('🐢 Detection feedback: slowing down visit rate (2x delay)');
      }
    }

    // Auto mode switch: HTTP → browser if detection is persistent
    if (this.config.autoModeSwitch && this.recentSignals.length >= 8) {
      if (!this.autoAdjustments.modeSwitchRequested) {
        this.autoAdjustments.modeSwitchRequested = true;
        this.stats.modeSwitches++;
        logger.warn('🔄 Detection feedback: requesting mode switch HTTP→browser');
      }
    }

    return {
      signal,
      adjustments: this.getAdjustments(),
      shouldBlacklist: this._shouldBlacklist(details.proxyHost),
    };
  }

  _shouldBlacklist(proxyHost) {
    if (!proxyHost) return false;
    const signals = this.recentSignals.filter((s) => s.details.proxyHost === proxyHost);
    return signals.length >= 3;
  }

  getAdjustments() {
    return {
      referrerMixShift: this.autoAdjustments.referrerMixShift,
      modeSwitchRequested: this.autoAdjustments.modeSwitchRequested,
      slowdownFactor: this.autoAdjustments.slowdownFactor,
    };
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      recentSignalCount: this.recentSignals.length,
      ...this.stats,
      adjustments: this.getAdjustments(),
    };
  }

  reset() {
    this.recentSignals = [];
    this.autoAdjustments = { referrerMixShift: 0, modeSwitchRequested: false, slowdownFactor: 1 };
  }
}

export default DetectionFeedbackLoop;
