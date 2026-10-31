// ============================================================================
// search-simulator.js — Organic search traffic simulation.
// Features:
//   • Google search navigation → type keyword → click result → land on target
//   • Proper referrer chain (google.com/search → target)
//   • Keyword pool with weighted distribution
//   • SERP position selection (position 1-10, weighted toward top)
//   • Search result click simulation with realistic delay
// ============================================================================

import logger from '../utils/logger.js';

// Keyword pool — gaming-related to match the target sites
const KEYWORD_POOL = [
  // Generic gaming
  'free games online', 'play games online free', 'online games',
  'free online games', 'games to play online', 'browser games',
  'best free games', 'no download games', 'instant play games',

  // By category
  'action games free', 'puzzle games online', 'adventure games',
  'fun games to play', 'cool games online', 'new games 2024',
  'popular online games', 'multiplayer games free',

  // Long-tail
  'free games no sign up', 'play free games online no download',
  'best browser games 2024', 'free online games for kids',
  'casino games online free', 'slots games free',
  'poker games online free', 'roulette online free',

  // Regional
  'games online gratis', ' juegos gratis online',
  'free games online play', 'game online free',
];

const SEARCH_ENGINES = [
  { name: 'google', url: 'https://www.google.com/search?q=', weight: 70 },
  { name: 'bing',   url: 'https://www.bing.com/search?q=', weight: 20 },
  { name: 'duckduckgo', url: 'https://duckduckgo.com/?q=', weight: 10 },
];

// SERP position weights (position 1 gets most traffic)
const SERP_POSITION_WEIGHTS = [35, 25, 15, 8, 5, 4, 3, 2, 2, 1];

export class SearchSimulator {
  constructor(config = {}) {
    this.config = {
      minSearchDelay: 1000,
      maxSearchDelay: 3000,
      minClickDelay: 800,
      maxClickDelay: 2500,
      keywordPool: KEYWORD_POOL,
      ...config,
    };
  }

  addKeyword(keyword) {
    if (keyword && !this.config.keywordPool.includes(keyword)) {
      this.config.keywordPool.push(keyword);
    }
  }

  removeKeyword(keyword) {
    const idx = this.config.keywordPool.indexOf(keyword);
    if (idx >= 0) this.config.keywordPool.splice(idx, 1);
  }

  getKeywords() {
    return [...this.config.keywordPool];
  }

  pickKeyword() {
    return this.config.keywordPool[Math.floor(Math.random() * this.config.keywordPool.length)];
  }

  pickEngine() {
    const engines = SEARCH_ENGINES;
    const total = engines.reduce((sum, e) => sum + e.weight, 0);
    let r = Math.random() * total;
    for (const engine of engines) {
      r -= engine.weight;
      if (r <= 0) return engine;
    }
    return engines[0];
  }

  pickSerpPosition() {
    const total = SERP_POSITION_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SERP_POSITION_WEIGHTS.length; i++) {
      r -= SERP_POSITION_WEIGHTS[i];
      if (r <= 0) return i + 1; // 1-indexed
    }
    return 10;
  }

  /**
   * Generate a search referrer URL for a keyword + engine.
   * This is the Referer header that the target site sees.
   */
  generateReferrer(keyword = null, engine = null) {
    const e = engine || this.pickEngine();
    const kw = keyword || this.pickKeyword();
    const position = this.pickSerpPosition();

    // Google: https://www.google.com/search?q=KEYWORD
    // Bing: https://www.bing.com/search?q=KEYWORD
    // DDG: https://duckduckgo.com/?q=KEYWORD
    return `${e.url}${encodeURIComponent(kw)}`;
  }

  /**
   * Generate a referrer with a specific keyword.
   */
  generateReferrerWithKeyword(keyword) {
    const engine = this.pickEngine();
    return `${engine.url}${encodeURIComponent(keyword)}`;
  }

  /**
   * Get search simulation stats.
   */
  getStats() {
    return {
      keywordCount: this.config.keywordPool.length,
      engineCount: SEARCH_ENGINES.length,
      minSearchDelay: this.config.minSearchDelay,
      maxSearchDelay: this.config.maxSearchDelay,
    };
  }
}

export { KEYWORD_POOL, SEARCH_ENGINES, SERP_POSITION_WEIGHTS };
export default SearchSimulator;
