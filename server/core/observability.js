// ============================================================================
// observability.js — Metrics registry + alerting hub.
//
//   • Counters/gauges: visits, errors, skips, free-proxy refreshes, AI plan
//     sources (llm vs heuristic), detection signals.
//   • Alerts (auto-raised, ack-able):
//       - free_refresh_empty        — 2+ consecutive refreshes added 0 proxies
//       - free_sources_unreachable  — 2+ consecutive refreshes fetched 0
//       - ai_llm_fallback_high      — >80% of recent plans came from the
//                                     heuristic fallback (LLM gateway down)
//       - visit_error_rate_high     — >30% errors over the last 50 visits
//       - detection_signals_high    — many detection signals in the window
//   • Endpoints: GET /api/metrics (JSON or ?format=prometheus), GET /api/alerts
// ============================================================================

import logger from '../utils/logger.js';

export class ObservabilityHub {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.OBSERVABILITY !== '0',
      visitWindow: parseInt(process.env.METRICS_VISIT_WINDOW || '50', 10),
      errorRateThreshold: parseFloat(process.env.ALERT_ERROR_RATE || '0.30'),
      fallbackRateThreshold: parseFloat(process.env.ALERT_FALLBACK_RATE || '0.8'),
      fallbackMinPlans: parseInt(process.env.ALERT_FALLBACK_MIN_PLANS || '10', 10),
      zeroRefreshAlerts: parseInt(process.env.ALERT_ZERO_REFRESHES || '2', 10),
      detectionSignalThreshold: parseInt(process.env.ALERT_DETECTION_SIGNALS || '8', 10),
      ...config,
    };
    this.startedAt = Date.now();
    this.counters = {
      visits_total: 0,
      visits_success: 0,
      visits_failed: 0,
      visits_skipped: 0,
      free_refreshes: 0,
      free_proxies_added_total: 0,
      free_proxies_fetched_total: 0,
      plans_total: 0,
      plans_llm: 0,
      plans_heuristic: 0,
      detection_signals_total: 0,
    };
    this.visitWindow = []; // booleans: success?
    this.planWindow = [];  // 'llm' | 'heuristic'
    this.alerts = new Map(); // id → { id, severity, message, details, count, firstAt, lastAt, acked }
    this._consecZeroAdd = 0;
    this._consecZeroFetch = 0;
    this._lastAIStats = null;
    this.onAlert = null; // (alert) => void — wired to socket.io in index.js
  }

  // -----------------------------------------------------------------------
  recorders
  // -----------------------------------------------------------------------
  recordVisit(result) {
    this.counters.visits_total++;
    if (result?.skipped) {
      this.counters.visits_skipped++;
      return;
    }
    if (result?.success) this.counters.visits_success++;
    else this.counters.visits_failed++;
    this.visitWindow.push(!!result?.success);
    if (this.visitWindow.length > 500) this.visitWindow.shift();
    this.checkAlerts();
  }

  recordFreeRefresh(report) {
    this.counters.free_refreshes++;
    this.counters.free_proxies_added_total += report?.added || 0;
    this.counters.free_proxies_fetched_total += report?.fetched || 0;
    if ((report?.added || 0) === 0) this._consecZeroAdd++; else this._consecZeroAdd = 0;
    if ((report?.fetched || 0) === 0) this._consecZeroFetch++; else this._consecZeroFetch = 0;
    this.checkAlerts();
  }

  /** Called periodically with the director's cumulative stats snapshot. */
  recordAIStats(stats) {
    if (!stats) return;
    const prev = this._lastAIStats;
    this._lastAIStats = { ...stats };
    if (!prev) return;
    const dLlm = (stats.llmPlans || 0) - (prev.llmPlans || 0);
    const dHeur = (stats.heuristicPlans || 0) - (prev.heuristicPlans || 0);
    const dCache = (stats.cacheHits || 0) - (prev.cacheHits || 0);
    const dTotal = dLlm + dHeur;
    this.counters.plans_total += dTotal;
    this.counters.plans_llm += dLlm;
    this.counters.plans_heuristic += dHeur;
    for (let i = 0; i < dLlm; i++) this.planWindow.push('llm');
    for (let i = 0; i < dHeur; i++) this.planWindow.push('heuristic');
    if (this.planWindow.length > 500) this.planWindow.splice(0, this.planWindow.length - 500);
    // cache hits are not new plans — track separately as a gauge
    this.gauges = { plans_cache_hits: stats.cacheHits || 0 };
    this.checkAlerts();
  }

  recordDetectionSignals(count) {
    this.counters.detection_signals_total += count;
    this._recentDetection = this._recentDetection || [];
    const now = Date.now();
    this._recentDetection.push({ ts: now, count });
    this._recentDetection = this._recentDetection.filter((e) => now - e.ts < 300_000);
    this.checkAlerts();
  }

  // -----------------------------------------------------------------------
  alerts
  // -----------------------------------------------------------------------
  _raise(id, severity, message, details = {}) {
    const existing = this.alerts.get(id);
    const now = Date.now();
    if (existing) {
      existing.count++;
      existing.lastAt = now;
      existing.details = details;
      return existing;
    }
    const alert = { id, severity, message, details, count: 1, firstAt: now, lastAt: now, acked: false };
    this.alerts.set(id, alert);
    logger.warn(`🚨 Alert [${severity}] ${id}: ${message}`);
    if (typeof this.onAlert === 'function') {
      try { this.onAlert(alert); } catch { /* noop */ }
    }
    return alert;
  }

  checkAlerts() {
    if (!this.config.enabled) return;
    const w = this.visitWindow.slice(-this.config.visitWindow);
    if (w.length >= this.config.visitWindow) {
      const errRate = 1 - w.filter(Boolean).length / w.length;
      if (errRate > this.config.errorRateThreshold) {
        this._raise('visit_error_rate_high', 'warning',
          `Error rate ${(errRate * 100).toFixed(1)}% over last ${w.length} visits (threshold ${this.config.errorRateThreshold * 100}%)`,
          { errorRate: errRate, window: w.length });
      }
    }
    if (this._consecZeroAdd >= this.config.zeroRefreshAlerts) {
      this._raise('free_refresh_empty', 'warning',
        `${this._consecZeroAdd} consecutive free-proxy refreshes added 0 new proxies`,
        { consecutive: this._consecZeroAdd });
    }
    if (this._consecZeroFetch >= this.config.zeroRefreshAlerts) {
      this._raise('free_sources_unreachable', 'critical',
        `${this._consecZeroFetch} consecutive free-proxy refreshes fetched 0 proxies — all GitHub sources unreachable`,
        { consecutive: this._consecZeroFetch });
    }
    const pw = this.planWindow.slice(-50);
    const plans = pw.length;
    if (plans >= this.config.fallbackMinPlans) {
      const fallbackRate = pw.filter((s) => s === 'heuristic').length / plans;
      if (fallbackRate > this.config.fallbackRateThreshold) {
        this._raise('ai_llm_fallback_high', 'warning',
          `AI behavior director: ${(fallbackRate * 100).toFixed(0)}% of last ${plans} plans used heuristic fallback — LLM gateway (OmniRoute/Ollama) likely down`,
          { fallbackRate, plans });
      }
    }
    const det = (this._recentDetection || []).reduce((s, e) => s + e.count, 0);
    if (det >= this.config.detectionSignalThreshold) {
      this._raise('detection_signals_high', 'critical',
        `${det} detection signals (CAPTCHA/403/429/block) in the last 5 min`,
        { signals: det });
    }
  }

  getAlerts() {
    return [...this.alerts.values()].sort((a, b) => (a.acked - b.acked) || (b.lastAt - a.lastAt));
  }

  ackAlert(id) {
    const a = this.alerts.get(id);
    if (!a) return null;
    a.acked = true;
    a.ackedAt = Date.now();
    return a;
  }

  // -----------------------------------------------------------------------
  metrics
  // -----------------------------------------------------------------------
  getMetrics() {
    const w = this.visitWindow.slice(-this.config.visitWindow);
    const pw = this.planWindow.slice(-50);
    const errRate = w.length ? 1 - w.filter(Boolean).length / w.length : 0;
    const fallbackRate = pw.length ? pw.filter((s) => s === 'heuristic').length / pw.length : 0;
    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      counters: { ...this.counters },
      gauges: {
        visit_window: w.length,
        visit_error_rate: Number(errRate.toFixed(4)),
        plan_fallback_rate: Number(fallbackRate.toFixed(4)),
        active_alerts: [...this.alerts.values()].filter((a) => !a.acked).length,
        ...(this.gauges || {}),
      },
      alerts: this.getAlerts(),
    };
  }

  /** Prometheus text exposition format. */
  getPrometheusText() {
    const m = this.getMetrics();
    const lines = [
      '# HELP websense_uptime_seconds Server uptime',
      '# TYPE websense_uptime_seconds gauge',
      `websense_uptime_seconds ${m.uptimeSeconds}`,
    ];
    for (const [k, v] of Object.entries(m.counters)) {
      lines.push(`# TYPE websense_${k} counter`, `websense_${k} ${v}`);
    }
    for (const [k, v] of Object.entries(m.gauges)) {
      if (typeof v !== 'number') continue;
      lines.push(`# TYPE websense_${k} gauge`, `websense_${k} ${v}`);
    }
    lines.push(`# TYPE websense_alerts_active gauge`, `websense_alerts_active ${m.gauges.active_alerts}`);
    return lines.join('\n') + '\n';
  }
}

export default ObservabilityHub;
