// ============================================================================
// traffic-patterns.js — Traffic pattern templates & scheduling.
// Features:
//   • Pre-built patterns: blog, news, ecommerce, saas, gaming
//   • Custom hourly/daily/weekly schedule editors
//   • Volume distribution (peak hours, off-peak)
//   • Weekend/holiday adjustments
//   • Linear/exponential/S-curve ramp-up
// ============================================================================

import logger from '../utils/logger.js';

const PATTERN_PRESETS = {
  blog: {
    name: 'blog',
    description: 'Steady traffic with morning and evening peaks',
    hourlyWeights: [
      2, 1, 1, 1, 1, 2, 5, 12, 20, 25, 28, 30, 32, 30, 28, 30, 35, 40, 45, 50, 45, 35, 20, 8,
    ],
    dailyMultiplier: 1,
    weekendMultiplier: 0.7,
  },
  news: {
    name: 'news',
    description: 'Heavy morning spike, sustained daytime',
    hourlyWeights: [
      1, 1, 1, 1, 2, 5, 15, 35, 55, 70, 80, 85, 80, 75, 70, 75, 80, 85, 75, 60, 45, 30, 15, 5,
    ],
    dailyMultiplier: 1,
    weekendMultiplier: 0.6,
  },
  ecommerce: {
    name: 'ecommerce',
    description: 'Lunch break and evening shopping peaks',
    hourlyWeights: [
      1, 0, 0, 0, 1, 3, 8, 15, 25, 30, 35, 45, 55, 40, 30, 35, 45, 60, 75, 80, 70, 50, 25, 10,
    ],
    dailyMultiplier: 1,
    weekendMultiplier: 1.2,
  },
  saas: {
    name: 'saas',
    description: 'Business hours only, strong 9-5 presence',
    hourlyWeights: [
      0, 0, 0, 0, 0, 1, 5, 20, 40, 60, 75, 80, 85, 80, 70, 65, 50, 25, 10, 5, 3, 2, 1, 0,
    ],
    dailyMultiplier: 1,
    weekendMultiplier: 0.3,
  },
  gaming: {
    name: 'gaming',
    description: 'After-school and evening peaks, weekend heavy',
    hourlyWeights: [
      3, 2, 1, 1, 1, 2, 5, 15, 30, 40, 45, 50, 45, 40, 45, 55, 70, 85, 90, 85, 70, 50, 30, 10,
    ],
    dailyMultiplier: 1,
    weekendMultiplier: 1.5,
  },
};

export class TrafficPatternManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      currentPattern: 'gaming',
      rampUpEnabled: false,
      rampUpDays: 7,
      rampUpType: 'linear', // linear | exponential | s-curve
      ...config,
    };
    this.patterns = { ...PATTERN_PRESETS };
    this.customSchedules = {}; // pattern name -> custom schedule
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  setPattern(patternName) {
    if (patternName in this.patterns || patternName in this.customSchedules) {
      this.config.currentPattern = patternName;
      return true;
    }
    return false;
  }

  /**
   * Get the hourly weight for the current hour based on active pattern.
   */
  getHourlyWeight() {
    const pattern = this.patterns[this.config.currentPattern];
    if (!pattern) return 1;

    const hour = new Date().getHours();
    const weekday = new Date().getDay(); // 0=Sun, 6=Sat

    let weight = pattern.hourlyWeights[hour];
    if (weekday === 0 || weekday === 6) {
      weight = Math.round(weight * pattern.weekendMultiplier);
    }

    // Apply ramp-up multiplier
    if (this.config.rampUpEnabled) {
      weight = Math.round(weight * this._getRampUpMultiplier());
    }

    return Math.max(1, weight);
  }

  /**
   * Calculate ramp-up multiplier based on elapsed days.
   */
  _getRampUpMultiplier() {
    const elapsed = Math.floor((Date.now() - this._rampUpStart) / (86400_000));
    const total = this.config.rampUpDays;
    if (elapsed >= total) return 1;

    const progress = elapsed / total;
    switch (this.config.rampUpType) {
      case 'linear':
        return progress;
      case 'exponential':
        return Math.pow(progress, 2);
      case 's-curve':
        // Smoothstep: 3t² - 2t³
        return 3 * progress * progress - 2 * progress * progress * progress;
      default:
        return progress;
    }
  }

  /**
   * Start ramp-up mode.
   */
  startRampUp(days, type) {
    this.config.rampUpEnabled = true;
    this.config.rampUpDays = days;
    this.config.rampUpType = type || this.config.rampUpType;
    this._rampUpStart = Date.now();
    logger.info(`📈 Traffic ramp-up started: ${days} days, ${type || this.config.rampUpType} curve`);
  }

  /**
   * Stop ramp-up mode (full volume).
   */
  stopRampUp() {
    this.config.rampUpEnabled = false;
    logger.info('📊 Traffic ramp-up stopped — full volume');
  }

  /**
   * Get full schedule for a pattern (for dashboard display).
   */
  getSchedule(patternName = null) {
    const name = patternName || this.config.currentPattern;
    const pattern = this.patterns[name];
    if (!pattern) return null;
    return {
      name,
      description: pattern.description,
      hourlyWeights: pattern.hourlyWeights,
      dailyMultiplier: pattern.dailyMultiplier,
      weekendMultiplier: pattern.weekendMultiplier,
      currentHour: new Date().getHours(),
      currentWeight: this.getHourlyWeight(),
      rampUpEnabled: this.config.rampUpEnabled,
      rampUpDays: this.config.rampUpDays,
      rampUpType: this.config.rampUpType,
    };
  }

  /**
   * Add a custom schedule pattern.
   */
  addCustomPattern(name, description, hourlyWeights, options = {}) {
    if (hourlyWeights.length !== 24) return false;
    this.customSchedules[name] = {
      name,
      description,
      hourlyWeights,
      dailyMultiplier: options.dailyMultiplier ?? 1,
      weekendMultiplier: options.weekendMultiplier ?? 1,
    };
    return true;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      currentPattern: this.config.currentPattern,
      availablePatterns: Object.keys(this.patterns).length + Object.keys(this.customSchedules).length,
      patternNames: [...Object.keys(this.patterns), ...Object.keys(this.customSchedules)],
      rampUpEnabled: this.config.rampUpEnabled,
      rampUpDays: this.config.rampUpDays,
      rampUpType: this.config.rampUpType,
      currentHourWeight: this.getHourlyWeight(),
    };
  }
}

export { PATTERN_PRESETS };
export default TrafficPatternManager;
