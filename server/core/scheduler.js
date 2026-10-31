// ============================================================================
// scheduler.js — Visit scheduler.
// Responsibilities:
//   • Randomized intervals between visits (organic cadence, no fixed pattern)
//   • N concurrent visit slots (independent timers)
//   • Start / Pause / Resume / Stop state machine
//   • Live WebSocket emission of state + stats + visit results
// ============================================================================

import logger from '../utils/logger.js';

export class Scheduler {
  constructor(visitEngine, config, io = null) {
    this.engine = visitEngine;
    this.config = { ...config };
    this.io = io;
    this.state = 'stopped'; // stopped | running | paused
    this.timers = new Map(); // slot -> timeout handle
    this.activeVisits = 0;
    this.proxyStrategy = 'random';
  }

  _randomInterval() {
    const min = this.config.minInterval;
    const max = Math.max(this.config.maxInterval, this.config.minInterval + 1000);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async _scheduleNext(slot) {
    if (this.state !== 'running') return;

    const delay = this._randomInterval();
    const timer = setTimeout(async () => {
      if (this.state !== 'running') return;

      this.activeVisits++;
      try {
        // In session mode, execute a full multi-page session instead of
        // a single visit. The session manager orchestrates bounce vs.
        // engaged sessions, return-visitor profiles, and internal navigation.
        let result;
        if (this.engine.config.sessionMode && this.engine.sessionManager) {
          result = await this.engine.executeSession({
            timeout: this.config.requestTimeout,
            proxyStrategy: this.proxyStrategy,
          });
        } else {
          result = await this.engine.executeVisit({
            timeout: this.config.requestTimeout,
            proxyStrategy: this.proxyStrategy,
          });
        }

        // Dispatch webhooks on visit completion (F3.8)
        if (this.engine.webhookManager) {
          await this.engine.webhookManager.dispatch(
            result.success ? 'visit:complete' : 'visit:error',
            result
          ).catch(() => {});
          if (result.sessionId) {
            await this.engine.webhookManager.dispatch('session:complete', result).catch(() => {});
          }
        }

        if (this.io) {
          this.io.emit('visit:complete', result);
          this.io.emit('stats:update', this.engine.getStats());
        }
      } catch (err) {
        logger.error(`Scheduler slot ${slot} error: ${err.message}`);
      } finally {
        this.activeVisits--;
      }

      this._scheduleNext(slot);
    }, delay);

    this.timers.set(slot, timer);
  }

  start(proxyStrategy = 'random') {
    if (this.state === 'running') return;
    this.proxyStrategy = proxyStrategy || this.proxyStrategy;

    this.state = 'running';
    this.engine.startTime = this.engine.startTime || Date.now();

    const slots = Math.max(1, this.config.concurrency || 1);
    for (let i = 0; i < slots; i++) {
      const initialDelay = Math.floor(Math.random() * 3000);
      const timer = setTimeout(() => this._scheduleNext(i), initialDelay);
      this.timers.set(i, timer);
    }

    // Dispatch webhook (F3.8)
    if (this.engine.webhookManager) {
      this.engine.webhookManager.dispatch('engine:started', {
        concurrency: slots,
        intervalRange: `${this.config.minInterval}-${this.config.maxInterval}ms`,
        mode: this.config.mode,
      }).catch(() => {});
    }

    if (this.io) this.io.emit('engine:state', { state: 'running' });
    logger.info(
      `🚀 Scheduler started — ${slots} concurrent slots, interval ${this.config.minInterval}-${this.config.maxInterval}ms`
    );
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    if (this.io) this.io.emit('engine:state', { state: 'paused' });
    logger.info('⏸️ Scheduler paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.start(this.proxyStrategy);
    logger.info('▶️ Scheduler resumed');
  }

  stop() {
    this.state = 'stopped';
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.engine.reset();
    if (this.engine.webhookManager) {
      this.engine.webhookManager.dispatch('engine:stopped', {}).catch(() => {});
    }
    if (this.io) this.io.emit('engine:state', { state: 'stopped' });
    logger.info('⏹️ Scheduler stopped');
  }

  updateConfig(newConfig) {
    const oldConcurrency = this.config.concurrency;
    Object.assign(this.config, newConfig);

    // If concurrency changed while running, restart slots to match.
    if (this.state === 'running' && newConfig.concurrency !== undefined && newConfig.concurrency !== oldConcurrency) {
      this.pause();
      this.start(this.proxyStrategy);
    }
    logger.info('⚙️ Scheduler config updated', newConfig);
  }

  getState() {
    return {
      state: this.state,
      activeVisits: this.activeVisits,
      concurrency: this.config.concurrency,
      intervalRange: `${Math.round(this.config.minInterval / 1000)}-${Math.round(this.config.maxInterval / 1000)}s`,
      mode: this.config.mode,
      ...this.engine.getStats(),
    };
  }
}

export default Scheduler;
