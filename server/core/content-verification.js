// ============================================================================
// content-verification.js — Content verification & error detection.
// Features:
//   • Title/text/element assertions
//   • Image load checks
//   • Content hash diff
//   • Error page detection (403/429/5xx/blocked pages)
//   • CAPTCHA detection
// ============================================================================

import logger from '../utils/logger.js';

export class ContentVerifier {
  constructor(config = {}) {
    this.config = {
      checkTitle: true,
      checkImages: true,
      minContentLength: 100,
      errorPageKeywords: ['access denied', 'blocked', 'cloudflare', 'captcha', 'rate limited', 'too many requests'],
      ...config,
    };
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  /**
   * Verify page content after load.
   * Returns { valid, errors, warnings, details }.
   */
  async verify(page) {
    const errors = [];
    const warnings = [];
    const details = {};

    try {
      // Check title
      if (this.config.checkTitle) {
        const title = await page.title();
        details.title = title;
        if (!title || title.length < 3) {
          warnings.push('Title is empty or very short');
        }
      }

      // Check content length
      const contentLength = await page.evaluate(() => document.body?.innerText?.length || 0);
      details.contentLength = contentLength;
      if (contentLength < this.config.minContentLength) {
        warnings.push(`Content length below minimum (${contentLength} < ${this.config.minContentLength})`);
      }

      // Check for error pages
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      for (const keyword of this.config.errorPageKeywords) {
        if (bodyText.includes(keyword)) {
          errors.push(`Error page detected: "${keyword}" found in content`);
          break;
        }
      }

      // Check CAPTCHA
      const hasCaptcha = await page.evaluate(() => {
        const captchaSelectors = [
          '#g-recaptcha', '.g-recaptcha', '#h-captcha', '.h-captcha',
          '[class*="captcha"]', '[id*="captcha"]', 'iframe[src*="captcha"]',
          'form[action*="captcha"]', '.cf-browser-verification',
        ];
        return captchaSelectors.some((sel) => document.querySelector(sel));
      });
      if (hasCaptcha) {
        errors.push('CAPTCHA detected on page');
      }

      // Check images loaded
      if (this.config.checkImages) {
        const imageStats = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const total = imgs.length;
          const loaded = imgs.filter((img) => img.complete && img.naturalWidth > 0).length;
          return { total, loaded, failed: total - loaded };
        });
        details.imageStats = imageStats;
        if (imageStats.total > 0 && imageStats.loaded / imageStats.total < 0.5) {
          warnings.push(`Many images failed to load (${imageStats.loaded}/${imageStats.total})`);
        }
      }

      // Check for expected elements (custom selectors)
      if (this.config.expectedSelectors) {
        for (const [name, selector] of Object.entries(this.config.expectedSelectors)) {
          const found = await page.evaluate((sel) => !!document.querySelector(sel), selector);
          if (!found) warnings.push(`Expected element not found: ${name} (${selector})`);
        }
      }

      // Content hash (for diff detection)
      const contentHash = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
          hash = ((hash << 5) - hash) + text.charCodeAt(i);
          hash |= 0;
        }
        return hash;
      });
      details.contentHash = contentHash;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        details,
        hasCaptcha,
      };
    } catch (err) {
      return { valid: false, errors: [`Verification failed: ${err.message}`], warnings: [], details: {}, hasCaptcha: false };
    }
  }

  /**
   * HTTP-mode content verification (from response body).
   */
  verifyHTTP(responseBody, statusCode) {
    const errors = [];
    const warnings = [];
    const details = {};

    details.statusCode = statusCode;
    details.contentLength = responseBody?.length || 0;

    if (statusCode >= 400) {
      errors.push(`HTTP ${statusCode}`);
    }

    const bodyText = (responseBody || '').toLowerCase();
    for (const keyword of this.config.errorPageKeywords) {
      if (bodyText.includes(keyword)) {
        errors.push(`Error page detected: "${keyword}"`);
        break;
      }
    }

    if (details.contentLength < this.config.minContentLength) {
      warnings.push(`Content length below minimum`);
    }

    return { valid: errors.length === 0, errors, warnings, details, hasCaptcha: false };
  }

  getStats() {
    return {
      enabled: true,
      checkTitle: this.config.checkTitle,
      checkImages: this.config.checkImages,
      minContentLength: this.config.minContentLength,
      errorKeywords: this.config.errorPageKeywords.length,
    };
  }
}

export default ContentVerifier;
