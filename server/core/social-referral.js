// ============================================================================
// social-referral.js — Social referral traffic simulation.
// Features:
//   • Full platform set: Facebook, Twitter, Reddit, YouTube, LinkedIn, Pinterest
//   • Tracking param generation (fbclid, gclid, msclkid, utm_*)
//   • Referer URL construction for each platform
//   • Weighted platform distribution
// ============================================================================

const SOCIAL_PLATFORMS = [
  {
    name: 'facebook',
    weight: 25,
    refererBase: 'https://www.facebook.com/',
    trackingParams: ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign'],
    refererPaths: ['/', '/feed/', '/watch/', '/groups/'],
  },
  {
    name: 'twitter',
    weight: 20,
    refererBase: 'https://twitter.com/',
    trackingParams: ['utm_source', 'utm_medium'],
    refererPaths: ['/', '/home', '/explore', '/notifications'],
  },
  {
    name: 'reddit',
    weight: 15,
    refererBase: 'https://www.reddit.com/',
    trackingParams: ['utm_source', 'utm_medium'],
    refererPaths: ['/', '/r/games/', '/r/webgames/', '/r/onlinegaming/'],
  },
  {
    name: 'youtube',
    weight: 15,
    refererBase: 'https://www.youtube.com/',
    trackingParams: ['utm_source', 'utm_medium', 'utm_campaign'],
    refererPaths: ['/', '/watch?v=', '/feed/'],
  },
  {
    name: 'linkedin',
    weight: 10,
    refererBase: 'https://www.linkedin.com/',
    trackingParams: ['utm_source', 'utm_medium'],
    refererPaths: ['/', '/feed/', '/posts/'],
  },
  {
    name: 'pinterest',
    weight: 5,
    refererBase: 'https://www.pinterest.com/',
    trackingParams: ['utm_source', 'utm_medium'],
    refererPaths: ['/', '/pins/', '/search/'],
  },
  {
    name: 'instagram',
    weight: 10,
    refererBase: 'https://www.instagram.com/',
    trackingParams: ['fbclid', 'utm_source'],
    refererPaths: ['/', '/explore/', '/p/'],
  },
];

function generateTrackingParam(type) {
  switch (type) {
    case 'fbclid':
      return 'EAAb' + Math.random().toString(36).slice(2, 28);
    case 'gclid':
      return 'Cj0KEAQjqL3-BIAodSSAoAaABAE' + Math.random().toString(36).slice(2, 14);
    case 'msclkid':
      return 'a' + Math.random().toString(36).slice(2, 16).toUpperCase();
    case 'igshid':
      return Math.random().toString(36).slice(2, 20);
    default:
      return Math.random().toString(36).slice(2, 24);
  }
}

export class SocialReferralManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      paramChance: 0.6, // 60% chance to include tracking params
      ...config,
    };
    this.platforms = [...SOCIAL_PLATFORMS];
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  _pickPlatform() {
    const total = this.platforms.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * total;
    for (const platform of this.platforms) {
      r -= platform.weight;
      if (r <= 0) return platform;
    }
    return this.platforms[0];
  }

  /**
   * Generate a social referral referer URL with tracking params.
   */
  generateReferer() {
    const platform = this._pickPlatform();
    const path = platform.refererPaths[Math.floor(Math.random() * platform.refererPaths.length)];

    let referer = platform.refererBase + path;

    // Add tracking params based on platform
    if (Math.random() < this.config.paramChance) {
      const params = [];
      for (const param of platform.trackingParams) {
        if (param === 'fbclid' && Math.random() < 0.5) {
          params.push(`fbclid=${generateTrackingParam('fbclid')}`);
        } else if (param === 'gclid' && Math.random() < 0.3) {
          params.push(`gclid=${generateTrackingParam('gclid')}`);
        } else if (param === 'msclkid' && Math.random() < 0.2) {
          params.push(`msclkid=${generateTrackingParam('msclkid')}`);
        } else if (param.startsWith('utm_')) {
          const val = param === 'utm_source' ? platform.name
            : param === 'utm_medium' ? 'social'
            : 'social-campaign';
          params.push(`${param}=${val}`);
        }
      }
      if (params.length > 0) {
        referer += '?' + params.join('&');
      }
    }

    return referer;
  }

  /**
   * Get platform-specific tracking params for a URL.
   */
  getTrackingParams(platformName) {
    const platform = this.platforms.find((p) => p.name === platformName);
    if (!platform) return {};
    const params = {};
    for (const param of platform.trackingParams) {
      if (param === 'fbclid') {
        params.fbclid = generateTrackingParam('fbclid');
      } else if (param === 'gclid') {
        params.gclid = generateTrackingParam('gclid');
      } else if (param === 'msclkid') {
        params.msclkid = generateTrackingParam('msclkid');
      } else if (param.startsWith('utm_')) {
        params[param] = param === 'utm_source' ? platformName : param === 'utm_medium' ? 'social' : 'social-campaign';
      }
    }
    return params;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      platformCount: this.platforms.length,
      paramChance: this.config.paramChance,
    };
  }

  getPlatforms() {
    return this.platforms.map((p) => ({ name: p.name, weight: p.weight }));
  }
}

export { SOCIAL_PLATFORMS };
export default SocialReferralManager;
