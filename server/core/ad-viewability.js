// ============================================================================
// ad-viewability.js — Ad viewability simulation.
// Features:
//   • Ad render detection in viewport
//   • Impression counting
//   • Hover-no-click simulation (verification only — NO click fraud)
//   • Viewability duration tracking
// ============================================================================

import logger from '../utils/logger.js';

export class AdViewabilitySimulator {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      checkInterval: 500, // ms between viewport checks
      minViewDuration: 1000, // ms for ad to count as viewed
      hoverChance: 0.2, // 20% chance of hover (no click)
      ...config,
    };
    this.stats = { adsDetected: 0, impressions: 0, views: 0, hovers: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Check for ads in viewport and simulate viewability.
   * Returns { adsFound, impressions, views, hovers, details }.
   */
  async simulate(page) {
    const details = [];
    try {
      // Detect ad elements in viewport
      const adElements = await page.evaluate(() => {
        const adSelectors = [
          '[class*="ad"]', '[id*="ad"]', '[class*="advertisement"]',
          '[data-ad]', '[data-ad-slot]', '.adsbygoogle', 'ins.adsbygoogle',
          '[class*="banner"]', '[class*="sponsor"]',
        ];
        const found = [];
        for (const sel of adSelectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50 &&
                rect.top >= 0 && rect.top < window.innerHeight &&
                rect.bottom >= 0 && rect.bottom < window.innerHeight) {
              found.push({ selector: sel, width: rect.width, height: rect.height, top: rect.top });
            }
          }
        }
        return found;
      });

      this.stats.adsDetected += adElements.length;

      // Simulate viewing each ad
      for (const ad of adElements) {
        details.push({
          selector: ad.selector,
          size: `${Math.round(ad.width)}x${Math.round(ad.height)}`,
          position: Math.round(ad.top),
        });

        // Count impression
        this.stats.impressions++;

        // Simulate dwell time on ad
        await new Promise((r) => setTimeout(r, this.config.minViewDuration + Math.random() * 2000));
        this.stats.views++;

        // Simulate hover (no click — verification only)
        if (Math.random() < this.config.hoverChance) {
          const x = ad.width / 2;
          const y = ad.height / 2;
          try {
            await page.mouse.move(x, y, { steps: 3 });
            await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));
            this.stats.hovers++;
          } catch { /* noop */ }
        }
      }

      return {
        adsFound: adElements.length,
        impressions: this.stats.impressions,
        views: this.stats.views,
        hovers: this.stats.hovers,
        details,
      };
    } catch (err) {
      logger.warn(`Ad viewability simulation error: ${err.message}`);
      return { adsFound: 0, impressions: 0, views: 0, hovers: 0, details: [], error: err.message };
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      viewRate: this.stats.impressions > 0 ? Math.round((this.stats.views / this.stats.impressions) * 100) : 0,
      hoverRate: this.stats.impressions > 0 ? Math.round((this.stats.hovers / this.stats.impressions) * 100) : 0,
    };
  }
}

export default AdViewabilitySimulator;
