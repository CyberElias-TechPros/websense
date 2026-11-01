// ============================================================================
// analytics-compatibility.js — Analytics tracking compatibility.
// Features:
//   • GA4/gtag.js execution simulation (pageview, session_start, engagement)
//   • Universal Analytics (analytics.js) compatibility
//   • Microsoft Clarity, Meta Pixel event simulation
//   • Enhanced measurement events (scroll, outbound click, form interaction)
//   • Consent mode v2 support
//   • Referrer-based campaign attribution
// ============================================================================

import logger from '../utils/logger.js';

export class AnalyticsCompatibilityManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      platforms: ['ga4', 'clarity', 'pixel'],
      sendPageView: true,
      sendSessionStart: true,
      sendEngagement: true,
      enhancedMeasurement: true,
      consentMode: 'advanced', // none | basic | advanced — 'advanced' matches a real "Accept all" and lets AdSense render normally for verification
      ...config,
    };
    this.eventCount = 0;
    this.sessionEventCount = 0;
    this.engagementEventCount = 0;
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }

  /**
   * Generate GA4 gtag config snippet for a visit.
   */
  generateGtagConfig(visitId, clientId) {
    return {
      gtag: 'GA4',
      config: {
        'GA_MEASUREMENT_ID': 'G-XXXXXXXXXX',
        client_id: clientId,
        page_title: document.title,
        page_location: window.location.href,
        page_referrer: document.referrer,
      },
    };
  }

  /**
   * Generate a GA4 event payload for a visit.
   */
  generatePageViewEvent(url, referrer, clientId) {
    return {
      event: 'page_view',
      page_title: document?.title || 'freegameplay.site',
      page_location: url,
      page_referrer: referrer || '',
      client_id: clientId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate session_start event (GA4).
   */
  generateSessionStartEvent(sessionId, clientId) {
    return {
      event: 'session_start',
      session_id: sessionId,
      engage_time_second: 0,
      client_id: clientId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate engagement events based on session behavior.
   */
  generateEngagementEvents(sessionData, clientId) {
    const events = [];
    const { scrollDepth, dwellTime, pagesVisited, clickEvents } = sessionData;

    // Scroll depth event (GA4 enhanced measurement)
    if (scrollDepth >= 50) {
      events.push({
        event: 'scroll',
        value: scrollDepth,
        client_id: clientId,
        timestamp: new Date().toISOString(),
      });
    }

    // Outbound click (if any)
    if (clickEvents > 0) {
      events.push({
        event: 'outbound_click',
        page_location: sessionData.firstOutboundUrl || '',
        client_id: clientId,
        timestamp: new Date().toISOString(),
      });
    }

    // Engagement time (GA4)
    if (dwellTime >= 10) {
      events.push({
        event: 'engaged_session_event',
        engagement_type: 'first_engagement',
        value: Math.round(dwellTime),
        client_id: clientId,
        timestamp: new Date().toISOString(),
      });
    }

    // Form interaction (if any)
    if (sessionData.formInteractions > 0) {
      events.push({
        event: 'form_submit',
        client_id: clientId,
        timestamp: new Date().toISOString(),
      });
    }

    return events;
  }

  /**
   * Generate consent mode v2 payload.
   */
  generateConsentPayload(consentMode) {
    if (consentMode === 'none') return null;
    if (consentMode === 'basic') {
      return {
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
        functionality_storage: 'granted',
        security_storage: 'granted',
      };
    }
    // advanced
    return {
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
      functionality_storage: 'granted',
      security_storage: 'granted',
      ad_storage: 'granted',
      wait_for_update: 500,
    };
  }

  /**
   * Generate Meta Pixel event payload.
   */
  generateMetaPixelEvent(eventType, url, userAgent) {
    return {
      id: '1029384756',
      event: eventType,
      event_id: `${eventType}_${Date.now()}`,
      action_source: 'website',
      event_source_url: url,
      user_data: {
        fbp: 'fb.1.' + Math.random().toString(36).slice(2),
        fbc: Math.random().toString(36).slice(2),
        ttc: 0,
      },
    };
  }

  /**
   * Generate Microsoft Clarity event payload.
   */
  generateClarityEvent(eventType, url) {
    return {
      $type: 'custom',
      $title: 'freegameplay.site',
      $href: url,
      $timestamp: Date.now(),
      $currentUri: url,
      $referrer: document?.referrer || '',
    };
  }

  /**
   * Get analytics injection snippet for browser mode.
   */
  getBrowserInjectionSnippet(visitConfig) {
    const { gaId, clientId, consentMode } = visitConfig;
    const consent = this.generateConsentPayload(consentMode);

    return `
      // GA4 Consent Mode — dataLayer MUST remain an Array (gtag.js, GTM and
      // third-party tag scripts call dataLayer.push()/forEach on it; assigning
      // an object here breaks them and stops ads from rendering).
      if (!Array.isArray(window.dataLayer)) window.dataLayer = [];
      ${consent ? `window.dataLayer.push(['consent', 'default', ${JSON.stringify(consent)}]); window.dataLayer.push(['consent', 'update', ${JSON.stringify(consent)}]);` : ''}

      // GA4 gtag.js
      (function(w, d, s, l, i) {
        if (!Array.isArray(w[l])) w[l] = [];
        w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
        var f = d.getElementsByTagName(s)[0],
            j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : '';
        j.async = true;
        j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
        f.parentNode.insertBefore(j, f);
      })(window, document, 'script', 'dataLayer', '${gaId}');

      // Page view event
      if (!Array.isArray(window.dataLayer)) window.dataLayer = [];
      function gtag(){ if (!Array.isArray(window.dataLayer)) window.dataLayer = []; window.dataLayer.push(arguments); }
      gtag('js', new Date());
      gtag('config', '${gaId}', { client_id: '${clientId}' });
      gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_referrer: document.referrer
      });
    `;
  }

  recordEvent(type) {
    this.eventCount++;
    if (type === 'session_start') this.sessionEventCount++;
    if (type === 'engagement') this.engagementEventCount++;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      platforms: this.config.platforms,
      consentMode: this.config.consentMode,
      enhancedMeasurement: this.config.enhancedMeasurement,
      totalEvents: this.eventCount,
      sessionEvents: this.sessionEventCount,
      engagementEvents: this.engagementEventCount,
    };
  }
}

export default AnalyticsCompatibilityManager;
