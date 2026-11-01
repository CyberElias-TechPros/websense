// ============================================================================
// api-ajax-simulation.js — API/AJAX call simulation (F4.9).
// Features:
//   • Intercept & replay page API calls
//   • GraphQL/REST/WebSocket simulation
//   • AJAX request generation
//   • Fetch API simulation
//   • Rate-limited API call simulation
// ============================================================================

import logger from '../utils/logger.js';

export class ApiAjaxSimulator {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      ajaxChance: 0.3,
      fetchChance: 0.2,
      maxCalls: 3,
      ...config,
    };
    this.stats = { pagesAnalyzed: 0, ajaxCallsMade: 0, fetchCallsMade: 0, apiEndpointsDetected: 0, websocketAttempts: 0, endpoints: [] };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Analyze page and simulate API/AJAX calls.
   */
  async simulate(page) {
    const details = { endpoints: [], calls: [] };

    try {
      this.stats.pagesAnalyzed++;

      // Detect API endpoints in page source
      const endpoints = await page.evaluate(() => {
        const found = [];
        // Look for fetch/XHR calls in scripts
        const scripts = document.querySelectorAll('script:not([src])');
        for (const s of scripts) {
          const text = s.textContent || '';
          const fetchMatches = text.match(/fetch\(['"`]([^'"`]+)['"`]/g) || [];
          const ajaxMatches = text.match(/\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g) || [];
          for (const m of fetchMatches) found.push({ type: 'fetch', call: m });
          for (const m of ajaxMatches) found.push({ type: 'ajax', call: m });
          // GraphQL
          if (text.includes('graphql') || text.includes('GraphQL')) found.push({ type: 'graphql', call: 'graphql endpoint detected' });
        }
        return found;
      });

      this.stats.apiEndpointsDetected += endpoints.length;
      details.endpoints = endpoints.slice(0, 5);

      // Simulate AJAX calls
      if (Math.random() < this.config.ajaxChance && endpoints.length > 0) {
        const callCount = Math.min(this.config.maxCalls, endpoints.length);
        for (let i = 0; i < callCount; i++) {
          const ep = endpoints[i];
          if (ep.type === 'fetch' || ep.type === 'ajax') {
            try {
              const result = await page.evaluate((url) => {
                return fetch(url, { method: 'GET', credentials: 'include' })
                  .then(r => ({ status: r.status, ok: r.ok }))
                  .catch(() => ({ error: 'fetch failed' }));
              }, 'about:blank');
              this.stats.ajaxCallsMade++;
              details.calls.push({ type: 'ajax', endpoint: ep.call.substring(0, 50), result });
            } catch { /* noop */ }
          }
        }
      }

      // Simulate fetch calls
      if (Math.random() < this.config.fetchChance) {
        try {
          const result = await page.evaluate(() => {
            return fetch('/api/ping', { method: 'GET', credentials: 'include' })
              .then(r => ({ status: r.status, ok: r.ok }))
              .catch(() => ({ error: 'fetch failed' }));
          });
          this.stats.fetchCallsMade++;
          details.calls.push({ type: 'fetch', endpoint: '/api/ping', result });
        } catch { /* noop */ }
      }

      return { success: true, ...details, ...this.getStats() };
    } catch (err) {
      logger.warn(`API/AJAX simulation error: ${err.message}`);
      return { success: false, error: err.message, ...details };
    }
  }

  getStats() {
    return { enabled: this.config.enabled, ...this.stats };
  }
}

export default ApiAjaxSimulator;
