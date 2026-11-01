// ============================================================================
// ai-integration.js — AI-powered features using Ollama (free, local AI).
// Provides AI-powered proxy evaluation, smart recommendations,
// content analysis, and natural language reporting.
// Ollama runs locally — no API keys needed, completely free.
// ============================================================================

import axios from 'axios';
import logger from '../utils/logger.js';

export class AIIntegration {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.AI_ENABLED !== '0',
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      defaultModel: process.env.OLLAMA_MODEL || 'llama3.1',
      timeout: 30000,
      // OmniRoute / OpenAI-compatible support
      provider: process.env.AI_PROVIDER || process.env.OMNIROUTE_PROVIDER || 'ollama',
      openaiUrl: process.env.OPENAI_COMPAT_URL || process.env.OMNIROUTE_URL || 'http://localhost:20128/v1',
      openaiKey: process.env.OPENAI_API_KEY || process.env.OMNIROUTE_API_KEY || process.env.AI_API_KEY || '',
      openaiModel: process.env.OPENAI_MODEL || process.env.OMNIROUTE_MODEL || 'openai/gpt-4o-mini',
      ...config,
    };
    this.models = [];
    this.available = false;
  }

  /**
   * Check if Ollama is available.
   */
  async checkAvailable() {
    // Try OpenAI-compatible first if configured
    if (this.config.provider === 'openai' || this.config.provider === 'omniroute') {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.openaiKey) headers.Authorization = `Bearer ${this.config.openaiKey}`;
        const response = await axios.get(`${this.config.openaiUrl}/models`, { timeout: 5000, headers });
        if (Array.isArray(response.data?.data) || Array.isArray(response.data)) {
          this.models = (response.data?.data || response.data).map(m => m.id || m.name).slice(0, 100);
          this.available = true;
          logger.info(`🤖 OpenAI-compatible (${this.config.provider}) available with ${this.models.length} models`);
          return true;
        }
      } catch (err) {
        logger.warn(`OpenAI-compatible not available at ${this.config.openaiUrl}: ${err.message}`);
      }
    }
    // Fall back to Ollama
    try {
      const response = await axios.get(`${this.config.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });
      this.models = response.data?.models?.map((m) => m.name) || [];
      this.available = this.models.length > 0;
      if (this.available) {
        logger.info(`🤖 Ollama available with ${this.models.length} models: ${this.models.join(', ')}`);
      }
      return this.available;
    } catch (err) {
      this.available = false;
      logger.warn(`Ollama not available: ${err.message}`);
      return false;
    }
  }

  /**
   * Generate a response from Ollama.
   */
  async generate(prompt, model = null, timeout = null) {
    if (!this.available) await this.checkAvailable();
    if (!this.available) return null;

    // Use OpenAI-compatible if that's the active provider
    if (this.config.provider === 'openai' || this.config.provider === 'omniroute') {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.openaiKey) headers.Authorization = `Bearer ${this.config.openaiKey}`;
        const response = await axios.post(
          `${this.config.openaiUrl}/chat/completions`,
          {
            model: model || this.config.openaiModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 512,
          },
          { timeout: timeout || this.config.timeout, headers }
        );
        return response.data?.choices?.[0]?.message?.content || null;
      } catch (err) {
        logger.error(`OpenAI-compatible generate failed: ${err.message}`);
        // Fall through to ollama
      }
    }

    try {
      const response = await axios.post(
        `${this.config.ollamaUrl}/api/generate`,
        {
          model: model || this.config.defaultModel,
          prompt,
          stream: false,
        },
        { timeout: timeout || this.config.timeout }
      );
      return response.data?.response || null;
    } catch (err) {
      logger.error(`Ollama generate failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Chat with Ollama.
   */
  async chat(messages, model = null, timeout = null) {
    if (!this.available) await this.checkAvailable();
    if (!this.available) return null;

    // Use OpenAI-compatible if that's the active provider
    if (this.config.provider === 'openai' || this.config.provider === 'omniroute') {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.openaiKey) headers.Authorization = `Bearer ${this.config.openaiKey}`;
        const response = await axios.post(
          `${this.config.openaiUrl}/chat/completions`,
          {
            model: model || this.config.openaiModel,
            messages,
            temperature: 0.9,
          },
          { timeout: timeout || this.config.timeout, headers }
        );
        return response.data?.choices?.[0]?.message?.content || null;
      } catch (err) {
        logger.error(`OpenAI-compatible chat failed: ${err.message}`);
        // Fall through to ollama
      }
    }

    try {
      const response = await axios.post(
        `${this.config.ollamaUrl}/api/chat`,
        {
          model: model || this.config.defaultModel,
          messages,
          stream: false,
        },
        { timeout: timeout || this.config.timeout }
      );
      return response.data?.message?.content || null;
    } catch (err) {
      logger.error(`Ollama chat failed: ${err.message}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // AI-powered proxy evaluation
  // -----------------------------------------------------------------------

  /**
   * Get AI-powered proxy analysis and recommendations.
   */
  async analyzeProxies(proxyResults) {
    const summary = this._summarizeProxyResults(proxyResults);
    const prompt = `You are a proxy network expert. Analyze the following proxy evaluation results and provide:
1. Overall network health assessment
2. Top 3 best proxies and why
3. Top 3 worst proxies and why
4. Recommendations for improvement
5. Any security concerns

Proxy results:
${JSON.stringify(summary, null, 2)}

Provide a concise, actionable analysis.`;

    const analysis = await this.generate(prompt);
    if (analysis) {
      logger.info('🤖 AI proxy analysis generated');
    }
    return analysis;
  }

  /**
   * Get AI-powered proxy selection recommendation.
   */
  async recommendProxy(proxyResults, strategy) {
    const topProxies = proxyResults.slice(0, 10).map((p) => ({
      host: p.host,
      port: p.port,
      country: p.country,
      city: p.city,
      score: p.overallScore,
      grade: p.grade,
      speed: p.scores.speed,
      anonymity: p.scores.anonymity,
      safety: p.scores.safety,
      reliability: p.scores.reliability,
    }));

    const prompt = `You are a proxy selection expert. Given the following top proxies and the selection strategy "${strategy}", recommend the best proxy to use.

Strategy: ${strategy}

Top proxies:
${JSON.stringify(topProxies, null, 2)}

Provide a brief recommendation with reasoning.`;

    return await this.generate(prompt);
  }

  // -----------------------------------------------------------------------
  // AI-powered content analysis
  // -----------------------------------------------------------------------

  /**
   * Analyze page content for bot detection risks.
   */
  async analyzeContent(content, url) {
    const prompt = `You are a web scraping expert. Analyze the following page content for potential bot detection risks.

URL: ${url}
Content preview: ${content.slice(0, 2000)}

Identify:
1. Potential bot detection mechanisms on this page
2. Recommended bypass strategies
3. Any CAPTCHA or challenge indicators
4. Overall risk level (low/medium/high)`;

    return await this.generate(prompt);
  }

  // -----------------------------------------------------------------------
  // AI-powered reporting
  // -----------------------------------------------------------------------

  /**
   * Generate a natural language summary of visit stats.
   */
  async generateReportSummary(stats) {
    const prompt = `You are a reporting expert. Generate a concise, professional summary of the following proxy visitor statistics.

Stats:
${JSON.stringify(stats, null, 2)}

Include:
1. Overall performance assessment
2. Key metrics highlights
3. Any areas for improvement
4. Recommendations for next steps`;

    return await this.generate(prompt);
  }

  // -----------------------------------------------------------------------
  // AI-powered smart behavior simulation
  // -----------------------------------------------------------------------

  /**
   * Get AI-powered behavior recommendations for a specific page.
   */
  async recommendBehavior(pageContext) {
    const prompt = `You are a human behavior simulation expert. Based on the following page context, recommend realistic user behavior patterns.

Page context:
${JSON.stringify(pageContext, null, 2)}

Provide:
1. Recommended dwell time
2. Recommended scroll pattern
3. Recommended click targets
4. Recommended mouse movement pattern
5. Any page-specific considerations`;

    return await this.generate(prompt);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  _summarizeProxyResults(results) {
    if (!results || results.length === 0) return { count: 0 };

    const byCountry = {};
    const byGrade = {};
    let totalScore = 0;

    for (const r of results) {
      if (!byCountry[r.country]) byCountry[r.country] = 0;
      byCountry[r.country]++;

      if (!byGrade[r.grade]) byGrade[r.grade] = 0;
      byGrade[r.grade]++;

      totalScore += r.overallScore;
    }

    return {
      totalProxies: results.length,
      averageScore: Math.round(totalScore / results.length),
      byCountry,
      byGrade,
      topProxy: results[0],
      worstProxy: results[results.length - 1],
    };
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  getStatus() {
    return {
      enabled: this.config.enabled,
      available: this.available,
      ollamaUrl: this.config.ollamaUrl,
      defaultModel: this.config.defaultModel,
      models: this.models,
    };
  }
}

export default AIIntegration;
