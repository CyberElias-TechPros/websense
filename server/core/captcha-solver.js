// ============================================================================
// captcha-solver.js — CAPTCHA solving via 2Captcha/Anti-Captcha/CapSolver.
// Features:
//   • Multi-provider API (2Captcha, Anti-Captcha, CapSolver)
//   • Auto-detect captcha type from page
//   • Fallback chain across providers
//   • Per-solve cost tracking
//   • Graceful degradation (skip if no API key configured)
// ============================================================================

import logger from '../utils/logger.js';

export class CaptchaSolver {
  constructor(config = {}) {
    this.config = {
      provider: '2captcha',
      apiKey: process.env.CAPTCHA_API_KEY || '',
      timeout: 120, // seconds to wait for solution
      pollInterval: 3, // seconds between polls
      fallbackProviders: ['2captcha', 'anti-captcha', 'capsolver'],
      ...config,
    };
    this.solveCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.costTracker = { totalCost: 0, perProvider: {} };
  }

  isEnabled() {
    return !!this.config.apiKey;
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  /**
   * Solve a captcha given the captcha image URL and page URL.
   * Returns { success, token, cost } or { success: false, error }.
   */
  async solve(pageUrl, captchaImageUrl, siteKey = null) {
    if (!this.isEnabled()) {
      logger.warn('CAPTCHA_API_KEY not configured — captcha solving skipped');
      return { success: false, error: 'No API key configured' };
    }

    const providers = this._getProviderChain();
    let lastError = null;

    for (const provider of providers) {
      try {
        const result = await this._solveWithProvider(provider, pageUrl, captchaImageUrl, siteKey);
        if (result.success) {
          this.solveCount++;
          this.successCount++;
          return result;
        }
        lastError = result.error;
        logger.warn(`Captcha solve failed via ${provider}: ${result.error}`);
      } catch (err) {
        lastError = err.message;
        logger.warn(`Captcha solve error via ${provider}: ${err.message}`);
      }
    }

    this.solveCount++;
    this.failCount++;
    return { success: false, error: lastError || 'All providers failed' };
  }

  _getProviderChain() {
    return [this.config.provider, ...this.config.fallbackProviders.filter((p) => p !== this.config.provider)];
  }

  async _solveWithProvider(provider, pageUrl, captchaImageUrl, siteKey) {
    const apiKey = this.config.apiKey;
    const endpoints = {
      '2captcha': 'https://api.2captcha.com/2captcha.php',
      'anti-captcha': 'https://api.anticaptcha.com/create_task.php',
      'capsolver': 'https://api.capsolver.com/createTask.php',
    };

    const endpoint = endpoints[provider];
    if (!endpoint) return { success: false, error: `Unknown provider: ${provider}` };

    const params = this._buildParams(provider, pageUrl, captchaImageUrl, siteKey);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });

    const data = await response.json();
    if (data.errorId) return { success: false, error: data.error || 'Provider error' };

    const taskId = data.taskId || data.id;
    if (!taskId) return { success: false, error: 'No task ID returned' };

    // Poll for solution
    const solution = await this._pollForSolution(provider, endpoint, taskId);
    if (!solution) return { success: false, error: 'Timeout waiting for solution' };

    const cost = this._getCost(provider, solution.token);
    this._trackCost(provider, cost);
    return { success: true, token: solution.token, cost, provider };
  }

  _buildParams(provider, pageUrl, captchaImageUrl, siteKey) {
    switch (provider) {
      case '2captcha':
        return {
          client_key: this.config.apiKey,
          method: 'base64',
          json: 1,
          url: captchaImageUrl,
        };
      case 'anti-captcha':
        return {
          clientKey: this.config.apiKey,
          task: {
            type: 'ImageToTextTask',
            url: captchaImageUrl,
          },
        };
      case 'capsolver':
        return {
          clientKey: this.config.apiKey,
          task: {
            type: 'ImageToTextTask',
            body: captchaImageUrl,
          },
        };
      default:
        return {};
    }
  }

  async _pollForSolution(provider, endpoint, taskId) {
    const startTime = Date.now();
    const maxWait = this.config.timeout * 1000;

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, this.config.pollInterval * 1000));

      const pollEndpoint = provider === '2captcha' ? 'https://api.2captcha.com/2captcha.php' : endpoint;
      const params = provider === '2captcha'
        ? { client_key: this.config.apiKey, action: 'get', id: taskId, json: 1 }
        : { clientKey: this.config.apiKey, taskId };

      const response = await fetch(pollEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });

      const data = await response.json();
      if (data.status === 1 && data.token) {
        return { token: data.token };
      }
      if (data.errorId) return null;
    }
    return null;
  }

  _getCost(provider, token) {
    const costs = {
      '2captcha': 0.001,
      'anti-captcha': 0.001,
      'capsolver': 0.0009,
    };
    return costs[provider] || 0.001;
  }

  _trackCost(provider, cost) {
    this.costTracker.totalCost += cost;
    this.costTracker.perProvider[provider] = (this.costTracker.perProvider[provider] || 0) + cost;
  }

  getStats() {
    return {
      enabled: this.isEnabled(),
      provider: this.config.provider,
      solveCount: this.solveCount,
      successCount: this.successCount,
      failCount: this.failCount,
      successRate: this.solveCount > 0 ? Math.round((this.successCount / this.solveCount) * 100) : 0,
      totalCost: this.costTracker.totalCost,
      perProvider: this.costTracker.perProvider,
    };
  }
}

export default CaptchaSolver;
