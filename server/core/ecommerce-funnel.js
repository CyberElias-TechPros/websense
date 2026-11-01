// ============================================================================
// ecommerce-funnel.js — E-commerce funnel simulation (F4.4).
// Features:
//   • Browse → cart → abandon flow
//   • Product comparison
//   • Filter usage
//   • Search box usage
//   • Category navigation
// ============================================================================

import logger from '../utils/logger.js';

export class EcommerceFunnelSimulator {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      browseTimeMin: 5,
      browseTimeMax: 15,
      cartChance: 0.3,
      filterChance: 0.5,
      searchChance: 0.2,
      ...config,
    };
    this.stats = { funnelsStarted: 0, productsBrowsed: 0, cartsFilled: 0, cartsAbandoned: 0, filtersUsed: 0, searchesPerformed: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  async simulate(page) {
    const details = { steps: [], completed: false };

    try {
      // Detect e-commerce features
      const commerce = await page.evaluate(() => {
        return {
          hasProducts: document.querySelectorAll('[class*="product"], [class*="item"], [data-product]').length > 0,
          hasCart: document.querySelectorAll('[class*="cart"], [id*="cart"], [aria-label*="cart" i]').length > 0,
          hasFilters: document.querySelectorAll('[class*="filter"], [class*="sidebar"] select, [class*="category"]').length > 0,
          hasSearch: document.querySelectorAll('input[type="search"], input[name*="search" i], [class*="searchbox"]').length > 0,
          productCount: document.querySelectorAll('[class*="product"], [class*="item"], [data-product]').length,
        };
      });

      if (!commerce.hasProducts) return { success: true, skipped: true, reason: 'No products detected' };

      this.stats.funnelsStarted++;
      details.steps.push('browse_started');

      // Step 1: Browse products
      const browseTime = (this.config.browseTimeMin + Math.random() * (this.config.browseTimeMax - this.config.browseTimeMin)) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(browseTime, 3000)));
      this.stats.productsBrowsed += Math.min(commerce.productCount, 5);
      details.steps.push('products_browsed');

      // Step 2: Use filters
      if (commerce.hasFilters && Math.random() < this.config.filterChance) {
        await page.evaluate(() => {
          const filter = document.querySelector('[class*="filter"] select, [class*="category"] a, [class*="sidebar"] a');
          if (filter) filter.click();
        });
        await new Promise((r) => setTimeout(r, 1500));
        this.stats.filtersUsed++;
        details.steps.push('filter_applied');
      }

      // Step 3: Search
      if (commerce.hasSearch && Math.random() < this.config.searchChance) {
        const searchResult = await page.evaluate(() => {
          const input = document.querySelector('input[type="search"], input[name*="search" i]');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, 'test product');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.form?.submit();
            return true;
          }
          return false;
        });
        if (searchResult) {
          await new Promise((r) => setTimeout(r, 2000));
          this.stats.searchesPerformed++;
          details.steps.push('search_performed');
        }
      }

      // Step 4: Add to cart (without checkout — abandon)
      if (commerce.hasCart && Math.random() < this.config.cartChance) {
        await page.evaluate(() => {
          const addBtn = document.querySelector('[class*="add-to-cart"], [data-add-to-cart], button[class*="add"]');
          if (addBtn) addBtn.click();
        });
        await new Promise((r) => setTimeout(r, 1500));
        this.stats.cartsFilled++;
        details.steps.push('added_to_cart');

        // Step 5: Abandon cart (don't checkout)
        await new Promise((r) => setTimeout(r, 2000));
        this.stats.cartsAbandoned++;
        details.steps.push('cart_abandoned');
      }

      details.completed = details.steps.length >= 3;
      return { success: true, ...details, ...this.getStats() };
    } catch (err) {
      logger.warn(`E-commerce funnel error: ${err.message}`);
      return { success: false, error: err.message, ...details };
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      conversionRate: this.stats.cartsFilled > 0 ? Math.round((this.stats.cartsAbandoned / this.stats.cartsFilled) * 100) : 0,
    };
  }
}

export default EcommerceFunnelSimulator;
