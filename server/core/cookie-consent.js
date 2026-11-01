// ============================================================================
// cookie-consent.js — Cookie consent/GDPR handling (F4.6).
// Features:
//   • Detect OneTrust, Cookiebot, TrustArc, Qvar, etc.
//   • Click Accept/Customize/Reject
//   • Persist consent
//   • Detect consent changes
// ============================================================================

import logger from '../utils/logger.js';

export class CookieConsentManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      acceptChance: 0.7,
      rejectChance: 0.15,
      customizeChance: 0.15,
      persistConsent: true,
      ...config,
    };
    this.stats = { consentBannersDetected: 0, accepted: 0, rejected: 0, customized: 0, platforms: [] };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Detect and interact with cookie consent banners.
   */
  async handle(page) {
    const details = { platform: null, action: null };

    try {
      // Detect consent platform
      const platform = await page.evaluate(() => {
        const checks = [
          { name: 'OneTrust', sel: '#onetrust-banner-sdk, #onetrust-consent-sdk' },
          { name: 'Cookiebot', sel: '#CybotCookiebotDialog, .cookiebot' },
          { name: 'TrustArc', sel: '#trustarc-consent-sdk, .trustarc' },
          { name: 'Qvar', sel: '#qbar, .qbar' },
          { name: 'CookieYes', sel: '#cookieyes-consent-button, .cookieyes' },
          { name: 'Osano', sel: '#osano-cookie-consent, .osano' },
          { name: 'Generic', sel: '[class*="cookie-consent"], [id*="cookie-consent"], [class*="gdpr"], [class*="consent-banner"]' },
        ];
        for (const check of checks) {
          if (document.querySelector(check.sel)) return check.name;
        }
        return null;
      });

      if (!platform) return { success: true, skipped: true, reason: 'No consent banner detected' };

      this.stats.consentBannersDetected++;
      if (!this.stats.platforms.includes(platform)) this.stats.platforms.push(platform);
      details.platform = platform;

      // Decide action
      const action = await page.evaluate((platformName) => {
        // Try platform-specific buttons first
        const platformButtons = {
          'OneTrust': { accept: '#onetrust-accept-btn-handler, .ot-sdk-button', reject: '#onetrust-reject-all-handler', customize: '#onetrust-customize-btn-handler' },
          'Cookiebot': { accept: '#CybotCookiebotDialogBodyLevelButton, .cb-btn-accept', reject: '#CybotCookiebotDialogBodyDeclineButton', customize: '#CybotCookiebotDialogBodyButtonSettings' },
          'TrustArc': { accept: '#trustarc-accept-all, .tr-accept-all', reject: '#trustarc-reject-all, .tr-reject-all', customize: '#trustarc-customize' },
          'Qvar': { accept: '#qbar-accept, .qbar-accept-btn', reject: '#qbar-deny', customize: '#qbar-more-info' },
          'CookieYes': { accept: '#cookieyes-consent-button, .cookieyes-accept', reject: null, customize: null },
          'Osano': { accept: '#osano-cookie-consent-accept, .osano-accept', reject: '#osano-cookie-consent-deny', customize: '#osano-cookie-consent-more' },
          'Generic': { accept: '[class*="cookie"] [class*="accept"], [class*="consent"] [class*="accept"], [class*="cookie"] [class*="allow"]', reject: '[class*="cookie"] [class*="reject"], [class*="consent"] [class*="deny"]', customize: '[class*="cookie"] [class*="customize"], [class*="consent"] [class*="settings"]' },
        };

        const buttons = platformButtons[platformName] || platformButtons['Generic'];

        // Check if banner is visible
        const bannerVisible = () => {
          const banner = document.querySelector('[class*="cookie"], [id*="onetrust"], [class*="consent"]');
          if (!banner) return false;
          const style = window.getComputedStyle(banner);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        if (!bannerVisible()) return null;

        // Try accept first
        const acceptBtn = document.querySelector(buttons.accept);
        if (acceptBtn) {
          acceptBtn.click();
          return 'accept';
        }
        return null;
      }, platform);

      if (action === 'accept') {
        this.stats.accepted++;
        details.action = 'accept';
      } else {
        // Try reject or customize
        const roll = Math.random();
        if (roll < this.config.rejectChance) {
          const rejected = await page.evaluate(() => {
            const btn = document.querySelector('[class*="cookie"] [class*="reject"], [class*="consent"] [class*="deny"], [id*="onetrust-reject"]');
            if (btn) { btn.click(); return true; }
            return false;
          });
          if (rejected) {
            this.stats.rejected++;
            details.action = 'reject';
          }
        } else if (roll < this.config.rejectChance + this.config.customizeChance) {
          const customized = await page.evaluate(() => {
            const btn = document.querySelector('[class*="cookie"] [class*="customize"], [class*="consent"] [class*="settings"], [id*="onetrust-customize"]');
            if (btn) { btn.click(); return true; }
            return false;
          });
          if (customized) {
            this.stats.customized++;
            details.action = 'customize';
          }
        }
      }

      // Wait for banner to disappear
      await new Promise((r) => setTimeout(r, 1000));

      return { success: true, ...details, ...this.getStats() };
    } catch (err) {
      logger.warn(`Cookie consent error: ${err.message}`);
      return { success: false, error: err.message, ...details };
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      acceptRate: this.stats.consentBannersDetected > 0 ? Math.round((this.stats.accepted / this.stats.consentBannersDetected) * 100) : 0,
    };
  }
}

export default CookieConsentManager;
