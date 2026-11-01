// ============================================================================
// ai-behavior-director.js — AI-directed human behavior for every visit.
//
// Mission: make window-level interaction indistinguishable from a real user
// by generating a per-visit "behavior plan" (persona, dwell, scroll style,
// hover intensity, reading pauses, click intent) and feeding it to the
// browser-mode human-behavior engine.
//
// Providers (in priority order, selected via AI_PROVIDER):
//   1. omniroute — OmniRoute gateway (OpenAI-compatible, default
//      http://localhost:20128/v1, models like "openai/gpt-4o-mini").
//      Free/open-source local AI router fronting 300+ providers.
//   2. ollama    — local Ollama (via existing AIIntegration).
//   3. openai    — any OpenAI-compatible endpoint (OpenRouter, vLLM, LM Studio…)
//   4. heuristic — deterministic persona engine (always available).
//
// The director NEVER blocks a visit: LLM calls are time-capped (8s), cached
// per page+device for 30 min, and the heuristic fallback guarantees a plan.
// ============================================================================

import axios from 'axios';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Personas (heuristic engine) — each models a population slice of real users
// ---------------------------------------------------------------------------
const PERSONAS = [
  { name: 'content_reader', weight: 0.22, dwellScale: 1.8, scrollDepth: 0.85, scrollSteps: 9, hover: 0.5, clickIntent: 0.25, pauseScale: 1.6 },
  { name: 'comparison_shopper', weight: 0.18, dwellScale: 1.2, scrollDepth: 0.7, scrollSteps: 7, hover: 0.8, clickIntent: 0.45, pauseScale: 1.1 },
  { name: 'quick_bouncer', weight: 0.20, dwellScale: 0.45, scrollDepth: 0.25, scrollSteps: 2, hover: 0.3, clickIntent: 0.08, pauseScale: 0.6 },
  { name: 'bored_scroller', weight: 0.16, dwellScale: 0.8, scrollDepth: 1.0, scrollSteps: 12, hover: 0.4, clickIntent: 0.15, pauseScale: 0.9 },
  { name: 'deal_hunter', weight: 0.12, dwellScale: 1.0, scrollDepth: 0.55, scrollSteps: 6, hover: 0.9, clickIntent: 0.6, pauseScale: 0.8 },
  { name: 'lost_doer', weight: 0.07, dwellScale: 1.1, scrollDepth: 0.4, scrollSteps: 4, hover: 0.6, clickIntent: 0.35, pauseScale: 1.3 },
  { name: 'watcher', weight: 0.05, dwellScale: 2.0, scrollDepth: 0.6, scrollSteps: 5, hover: 0.35, clickIntent: 0.05, pauseScale: 2.0 },
];

// Deterministic 32-bit hash for stable persona selection per URL+seed
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, lo, hi, fallback) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Deterministic heuristic plan from a session seed + URL + profile.
 * Same visitor on same page → same persona tendency (returning visitors act
 * consistently, like real people do).
 */
function heuristicPlan(seed, url, profile, pageStats = {}) {
  const rand = (() => {
    let a = hashStr(`${seed}|${new URL(url).hostname}`);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 16), 2246822507)) ^ 0;
      return ((t ^ (t >>> 13)) >>> 0) / 4294967296;
    };
  })();

  // Weighted persona pick
  let roll = rand() * PERSONAS.reduce((s, p) => s + p.weight, 0);
  let persona = PERSONAS[PERSONAS.length - 1];
  for (const p of PERSONAS) {
    roll -= p.weight;
    if (roll <= 0) { persona = p; break; }
  }

  // Mobile users scroll faster, read less; desktop readers read more
  const deviceScale = profile?.isMobile ? 0.8 : 1.0;

  return {
    source: 'heuristic',
    persona: persona.name,
    description: `Behavior plan (heuristic persona)`,
    dwellScale: clamp(persona.dwellScale * deviceScale * (0.85 + rand() * 0.3), 0.3, 3.0),
    scroll: {
      steps: Math.round(clamp(persona.scrollSteps * deviceScale, 1, 14)),
      depth: clamp(persona.scrollDepth, 0.15, 1.0),
    },
    hover: { intensity: clamp(persona.hover, 0.1, 1.0) },
    clickIntent: clamp(persona.clickIntent, 0, 0.8),
    pauseScale: clamp(persona.pauseScale, 0.4, 2.5),
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// LLM prompt → plan
// ---------------------------------------------------------------------------
function buildPrompt(url, profile, pageStats) {
  return `You are a user-behavior simulation engine. Given this page and visitor, output ONLY a JSON object (no prose, no markdown) describing realistic human browsing behavior.

Page: title="${(pageStats.title || '').slice(0, 80)}", words=${pageStats.words || 0}, links=${pageStats.links || 0}, images=${pageStats.images || 0}, video=${pageStats.hasVideo ? 'yes' : 'no'}
Visitor device: ${profile?.isMobile ? (profile?.isTablet ? 'tablet' : 'mobile') : 'desktop'}, locale=${profile?.locale || 'en-US'}

JSON schema:
{"persona":"one_or_two_words","dwellScale":0.3-3.0,"scroll":{"steps":1-14,"depth":0.15-1.0},"hover":{"intensity":0.1-1.0},"clickIntent":0-0.8,"pauseScale":0.4-2.5,"reason":"one short sentence"}
JSON:`;
}

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------
export class AIBehaviorDirector {
  constructor(options = {}) {
    this.aiIntegration = options.aiIntegration || null;
    this.config = {
      // auto → omniroute, then ollama; off → heuristic only
      provider: process.env.AI_PROVIDER || process.env.AI_BEHAVIOR_PROVIDER || 'auto',
      // OmniRoute: open-source local AI gateway (OpenAI-compatible)
      omnirouteUrl: process.env.OMNIROUTE_URL || process.env.OPENAI_COMPAT_URL || process.env.AI_OPENAI_BASE_URL || 'http://localhost:20128/v1',
      omnirouteModel: process.env.OMNIROUTE_MODEL || process.env.OPENAI_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini',
      omnirouteKey: process.env.OMNIROUTE_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',
      timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '8000', 10),
      cacheTTLms: 30 * 60 * 1000,
      enabled: process.env.AI_BEHAVIOR !== '0',
      ...options.config,
    };
    this.activeProvider = null; // 'omniroute' | 'ollama' | 'openai' | 'heuristic' | null
    this.cache = new Map(); // key → {plan, expires}
    this.stats = { llmPlans: 0, heuristicPlans: 0, cacheHits: 0, llmErrors: 0, lastProvider: null };
  }

  // -- Provider probing ---------------------------------------------------
  async init() {
    await this._probeProviders();
    if (this.activeProvider) {
      logger.info(`🤖 AI behavior director active — provider: ${this.activeProvider}`);
    } else {
      logger.info('🤖 AI behavior director: no LLM provider reachable — using heuristic personas');
    }
  }

  async _probeProviders() {
    const order = this.config.provider === 'auto'
      ? ['omniroute', 'ollama', 'openai']
      : [this.config.provider];
    for (const p of order) {
      try {
        if (p === 'omniroute') {
          const r = await axios.get(`${this.config.omnirouteUrl}/models`, {
            timeout: 4000,
            headers: this._omniHeaders(),
          });
          if (Array.isArray(r.data?.data) && r.data.data.length > 0) {
            this.activeProvider = 'omniroute';
            this.models = r.data.data.map((m) => m.id).slice(0, 50);
            return;
          }
        } else if (p === 'openai') {
          try {
            const r = await axios.get(`${this.config.omnirouteUrl}/models`, { timeout: 4000, headers: this._omniHeaders() });
            if (Array.isArray(r.data?.data) && r.data.data.length > 0) {
              this.activeProvider = 'openai';
              this.models = r.data.data.map((m) => m.id).slice(0, 50);
              return;
            }
          } catch {
            // Try without auth
            try {
              const r2 = await axios.get(`${this.config.omnirouteUrl}/models`, { timeout: 4000 });
              if (Array.isArray(r2.data?.data) && r2.data.data.length > 0) {
                this.activeProvider = 'openai';
                this.models = r2.data.data.map((m) => m.id).slice(0, 50);
                return;
              }
            } catch {}
          }
        } else if (p === 'ollama') {
          if (this.aiIntegration && await this.aiIntegration.checkAvailable()) {
            this.activeProvider = 'ollama';
            this.models = this.aiIntegration.models || [];
            return;
          }
        }
      } catch { /* not available — try next */ }
    }
    this.activeProvider = null;
  }

  _omniHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.config.omnirouteKey) h.Authorization = `Bearer ${this.config.omnirouteKey}`;
    return h;
  }

  /** OpenAI-compatible chat completion (works for omniroute + generic openai). */
  async _openAiChat(messages, timeoutMs) {
    const resp = await axios.post(
      `${this.config.omnirouteUrl}/chat/completions`,
      {
        model: this.config.omnirouteModel,
        messages,
        temperature: 0.9,
        max_tokens: 320,
      },
      { timeout: timeoutMs, headers: this._omniHeaders() }
    );
    return resp.data?.choices?.[0]?.message?.content || null;
  }

  /** Extract + validate the first JSON object in LLM output. */
  _parsePlan(text, seed, url, profile, pageStats) {
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const raw = JSON.parse(m[0]);
      return {
        source: `llm:${this.activeProvider}`,
        persona: String(raw.persona || 'ai_visitor').slice(0, 40),
        description: String(raw.reason || 'Behavior plan (LLM)').slice(0, 200),
        dwellScale: clamp(raw.dwellScale, 0.3, 3.0, 1.0),
        scroll: {
          steps: Math.round(clamp(raw.scroll?.steps, 1, 14, 6)),
          depth: clamp(raw.scroll?.depth, 0.15, 1.0, 0.7),
        },
        hover: { intensity: clamp(raw.hover?.intensity, 0.1, 1.0, 0.5) },
        clickIntent: clamp(raw.clickIntent, 0, 0.8, 0.2),
        pauseScale: clamp(raw.pauseScale, 0.4, 2.5, 1.0),
        createdAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Build the behavior plan for one visit. Always resolves (never throws,
   * never blocks beyond the LLM timeout) — heuristic on any failure.
   */
  async buildPlan({ url, profile, pageStats = {}, seed }) {
    if (!this.config.enabled || !url) return heuristicPlan(seed || 0, url || 'about:blank', profile, pageStats);

    // Cache: same page+persona-window reuses the plan (a returning visitor
    // keeps their habit — and we don't burn LLM tokens every visit)
    const cacheKey = `${hashStr(String(seed))}|${new URL(url).host}|${profile?.isMobile ? 'm' : 'd'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      this.stats.cacheHits++;
      return cached.plan;
    }

    let plan = null;
    if (this.activeProvider === null) await this._probeProviders();

    if (this.activeProvider === 'omniroute' || this.activeProvider === 'openai') {
      try {
        const out = await this._openAiChat(
          [{ role: 'user', content: buildPrompt(url, profile, pageStats) }],
          this.config.timeoutMs
        );
        plan = this._parsePlan(out, seed, url, profile, pageStats);
        if (plan) this.stats.llmPlans++;
      } catch (e) {
        this.stats.llmErrors++;
        logger.warn(`AI behavior plan via ${this.activeProvider} failed, falling back to heuristic: ${e.message}`);
      }
    } else if (this.activeProvider === 'ollama' && this.aiIntegration) {
      try {
        const out = await this.aiIntegration.generate(buildPrompt(url, profile, pageStats), null, this.config.timeoutMs);
        plan = this._parsePlan(out, seed, url, profile, pageStats);
        if (plan) this.stats.llmPlans++;
      } catch (e) {
        this.stats.llmErrors++;
        logger.warn(`AI behavior plan via ollama failed, falling back to heuristic: ${e.message}`);
      }
    }

    if (!plan) {
      plan = heuristicPlan(seed, url, profile, pageStats);
      this.stats.heuristicPlans++;
    }
    this.stats.lastProvider = plan.source;
    this.cache.set(cacheKey, { plan, expires: Date.now() + this.config.cacheTTLms });
    if (this.cache.size > 2000) {
      // Prune expired entries
      const now = Date.now();
      for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
    }
    return plan;
  }

  /** Re-probe providers (e.g., after the user starts OmniRoute/Ollama). */
  async recheck() {
    await this._probeProviders();
    return this.getStatus();
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      provider: this.activeProvider || 'heuristic',
      configuredProvider: this.config.provider,
      omniroute: {
        url: this.config.omnirouteUrl,
        model: this.config.omnirouteModel,
        authSet: !!this.config.omnirouteKey,
      },
      models: this.models || [],
      stats: { ...this.stats },
      cacheSize: this.cache.size,
    };
  }
}

export default AIBehaviorDirector;
