// ============================================================================
// utm-manager.js — UTM parameter & campaign tracking.
// Features:
//   • Weighted campaign distribution (utm_source/medium/campaign)
//   • gclid/fbclid/msclkid tracking parameter injection
//   • Per-campaign click-id generation
//   • Campaign pool management
// ============================================================================

const CAMPAIGN_PRESETS = [
  { source: 'google',     medium: 'cpc',      campaign: 'brand-search' },
  { source: 'google',     medium: 'organic',  campaign: 'seo-terms' },
  { source: 'facebook',   medium: 'social',   campaign: 'fb-ads' },
  { source: 'twitter',    medium: 'social',   campaign: 'twitter-ads' },
  { source: 'reddit',     medium: 'social',   campaign: 'reddit-community' },
  { source: 'bing',       medium: 'cpc',      campaign: 'bing-brand' },
  { source: 'direct',     medium: 'none',     campaign: 'direct-traffic' },
  { source: 'referral',   medium: 'referral', campaign: 'partner-links' },
];

const CLICK_ID_TYPES = ['gclid', 'fbclid', 'msclkid'];

function generateClickId(type) {
  switch (type) {
    case 'gclid':
      // Google Click ID format: base64-ish, 24 chars
      return 'Cj0KEAQjqL3-BIAodSSAoAaABAE' + Math.random().toString(36).slice(2, 14);
    case 'fbclid':
      return 'EAAb' + Math.random().toString(36).slice(2, 28);
    case 'msclkid':
      return 'a' + Math.random().toString(36).slice(2, 16).toUpperCase();
    default:
      return Math.random().toString(36).slice(2, 24);
  }
}

export class UtmManager {
  constructor(config = {}) {
    this.config = {
      weightedCampaigns: true,
      clickIdChance: 0.4, // 40% chance to add a click-id
      ...config,
    };
    this.campaigns = [...CAMPAIGN_PRESETS];
  }

  addCampaign(campaign) {
    if (!campaign || typeof campaign !== 'object') return null;
    if (typeof campaign.source !== 'string' || !campaign.source.trim()) return null;
    if (typeof campaign.medium !== 'string' || !campaign.medium.trim()) return null;
    this.campaigns.push({
      source: campaign.source.trim(),
      medium: campaign.medium.trim(),
      campaign: typeof campaign.campaign === 'string' && campaign.campaign.trim() ? campaign.campaign.trim() : 'custom',
    });
    return this.campaigns[this.campaigns.length - 1];
  }

  removeCampaign(source, medium) {
    const idx = this.campaigns.findIndex(
      (c) => c.source === source && c.medium === medium
    );
    if (idx >= 0) return this.campaigns.splice(idx, 1)[0];
    return null;
  }

  getCampaigns() {
    return [...this.campaigns];
  }

  /**
   * Pick a weighted random campaign.
   * Google/Facebook get higher weight (more realistic traffic mix).
   */
  pickCampaign() {
    const weights = this.campaigns.map((c) => {
      if (c.source === 'google') return 3;
      if (c.source === 'facebook') return 2;
      if (c.source === 'bing') return 2;
      if (c.source === 'twitter') return 1;
      if (c.source === 'reddit') return 1;
      if (c.source === 'direct') return 2;
      if (c.source === 'referral') return 1;
      return 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < this.campaigns.length; i++) {
      r -= weights[i];
      if (r <= 0) return this.campaigns[i];
    }
    return this.campaigns[this.campaigns.length - 1];
  }

  /**
   * Build UTM params string for a URL.
   */
  buildParams(url, { campaign = null, includeClickId = true } = {}) {
    const c = campaign || this.pickCampaign();
    const params = new URLSearchParams({
      utm_source: c.source,
      utm_medium: c.medium,
      utm_campaign: c.campaign,
    });

    // Optionally add a click-id tracking parameter
    if (includeClickId && Math.random() < this.config.clickIdChance) {
      const clickType = CLICK_ID_TYPES[Math.floor(Math.random() * CLICK_ID_TYPES.length)];
      params.set(clickType, generateClickId(clickType));
    }

    // Also add a random gclid sometimes (Google ad clicks always have it)
    if (c.source === 'google' && c.medium === 'cpc' && Math.random() < 0.8) {
      params.set('gclid', generateClickId('gclid'));
    }
    if (c.source === 'facebook' && Math.random() < 0.7) {
      params.set('fbclid', generateClickId('fbclid'));
    }
    if (c.source === 'bing' && Math.random() < 0.6) {
      params.set('msclkid', generateClickId('msclkid'));
    }

    const paramStr = params.toString();
    if (!paramStr) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${paramStr}`;
  }

  getStats() {
    return {
      totalCampaigns: this.campaigns.length,
      clickIdChance: this.config.clickIdChance,
    };
  }
}

export { CAMPAIGN_PRESETS, generateClickId };
export default UtmManager;
