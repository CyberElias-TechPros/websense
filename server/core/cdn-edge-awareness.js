// ============================================================================
// cdn-edge-awareness.js — CDN/edge awareness (F4.8).
// Features:
//   • CDN detection (Cloudflare, Akamai, Fastly, CloudFront, etc.)
//   • POP detection
//   • Cache-busting
//   • Challenge page handling
//   • Edge-specific header injection
// ============================================================================

import logger from '../utils/logger.js';

export class CdnEdgeAwareness {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      cacheBust: true,
      handleChallenges: true,
      ...config,
    };
    this.stats = { cdnsDetected: 0, cloudflare: 0, akamai: 0, fastly: 0, cloudfront: 0, other: 0, challengesHandled: 0, cacheBusts: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Detect CDN from response headers.
   */
  detectFromHeaders(headers) {
    const server = (headers['server'] || '').toLowerCase();
    const cfRay = headers['cf-ray'];
    const xCdn = headers['x-cdn'];
    const xServedBy = headers['x-served-by'];
    const via = headers['via'];

    let cdn = null;
    if (cfRay || server.includes('cloudflare')) {
      cdn = 'Cloudflare';
      this.stats.cloudflare++;
    } else if (server.includes('akamai') || xServedBy?.includes('akamai')) {
      cdn = 'Akamai';
      this.stats.akamai++;
    } else if (server.includes('fastly') || xServedBy?.includes('cache-') || xServedBy?.includes('fastly')) {
      cdn = 'Fastly';
      this.stats.fastly++;
    } else if (xServedBy?.includes('cloudfront') || via?.includes('cloudfront')) {
      cdn = 'CloudFront';
      this.stats.cloudfront++;
    } else if (server.includes('cdn') || xCdn) {
      cdn = xCdn || 'Unknown CDN';
      this.stats.other++;
    }

    if (cdn) this.stats.cdnsDetected++;
    return { cdn, server, cfRay, xServedBy, via };
  }

  /**
   * Generate cache-busting URL.
   */
  generateCacheBust(url) {
    if (!this.config.cacheBust) return url;
    const buster = `_cb=${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const sep = url.includes('?') ? '&' : '?';
    this.stats.cacheBusts++;
    return `${url}${sep}${buster}`;
  }

  /**
   * Check if response is a challenge page (Cloudflare, etc.).
   */
  isChallengePage(body) {
    if (!this.config.handleChallenges) return false;
    const challengeIndicators = [
      'cf-challenge', 'challenge-platform', 'Checking your browser',
      'DDoS protection', 'Attention Required', 'Access denied',
      'Incapsula', 'Please wait...', 'Loading... Please wait',
    ];
    return challengeIndicators.some((ind) => body.includes(ind));
  }

  /**
   * Generate edge-appropriate headers.
   */
  generateEdgeHeaders(cdn) {
    const headers = {};
    if (cdn === 'Cloudflare') {
      headers['CF-Connecting-IP'] = '';
      headers['X-Forwarded-For'] = '';
    } else if (cdn === 'CloudFront') {
      headers['X-Amz-Cf-Id'] = '';
    }
    return headers;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      ...this.stats,
      cacheBustEnabled: this.config.cacheBust,
    };
  }
}

export default CdnEdgeAwareness;
