// ============================================================================
// session-manager.js — Multi-page session simulation.
// Features:
//   • Session lifecycle: 1-N page visits per session (bounce vs engaged)
//   • Cookie/localStorage persistence per session (return visitors)
//   • Bounce rate control engine (configurable 0-100%)
//   • Return visitor profiles (stable fingerprints, proxy affinity)
//   • Internal link discovery for natural navigation
// ============================================================================

import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------
export class SessionManager {
  constructor(config = {}, profileManager = null) {
    this.config = {
      maxPagesPerSession: 5,
      targetBounceRate: 55, // percent
      sessionTimeoutMs: 30 * 60 * 1000, // 30 min
      profilePoolSize: 200,
      ...config,
    };
    this.profileManager = profileManager;
    this.activeSessions = new Map(); // sessionId -> session object
    this.visitorProfiles = []; // return-visitor profiles
    this._initProfiles();
  }

  setProfileManager(pm) {
    this.profileManager = pm;
  }

  _initProfiles() {
    // If a profile manager is available, use it for return-visitor logic.
    // Otherwise, fall back to a simple in-memory pool.
    if (this.profileManager) return;
    for (let i = 0; i < this.config.profilePoolSize; i++) {
      this.visitorProfiles.push({
        id: `profile-${i}`,
        fingerprintSeed: Math.floor(Math.random() * 1e9),
        preferredProxyCountry: null,
        createdAt: Date.now(),
        lastVisit: null,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Create a new session
  // ---------------------------------------------------------------------------
  createSession({ url, proxy, userAgent, visitEngine, referrer }) {
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isReturning = Math.random() * 100 < this.config.returnVisitorRate || false;
    const profile = isReturning
      ? this._pickReturnProfile(proxy.country)
      : null;

    const session = {
      id: sessionId,
      url,
      proxy,
      userAgent: profile?.user_agent || userAgent,
      referrer,
      isReturning,
      profile,
      pages: [{ url, visitedAt: Date.now() }],
      startedAt: Date.now(),
      // Bounce vs engage decision (pre-rolled)
      willBounce: Math.random() * 100 < this.config.targetBounceRate,
      maxPages: this.willBounce ? 1 : Math.floor(Math.random() * this.config.maxPagesPerSession) + 2,
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  // ---------------------------------------------------------------------------
  // Determine if this session should be a return visitor (stable fingerprint)
  // Delegates to ProfileManager when available.
  // ---------------------------------------------------------------------------
  async shouldReturnVisitor(country) {
    if (this.profileManager && this.profileManager.shouldReturnVisitor) {
      return this.profileManager.shouldReturnVisitor(country);
    }
    return null;
  }

  _pickReturnProfile(country) {
    if (this.profileManager) {
      return this.profileManager.getRandomReturnProfile();
    }
    const fresh = this.visitorProfiles.filter((p) => !p.lastVisit || Date.now() - p.lastVisit > 3600_000);
    const pool = fresh.length > 0 ? fresh : this.visitorProfiles;
    const profile = pool[Math.floor(Math.random() * pool.length)];
    return { ...profile, lastVisit: Date.now() };
  }

  // ---------------------------------------------------------------------------
  // Execute a multi-page visit
  // ---------------------------------------------------------------------------
  async executeSession(visitEngine, options = {}) {
    const proxy = options.proxy;
    const userAgent = options.userAgent;
    const referrer = options.referrer;

    // Start a session
    const session = this.createSession({
      url: options.url,
      proxy,
      userAgent,
      visitEngine,
      referrer,
    });

    const results = [];
    let currentUrl = options.url;

    for (let pageIdx = 0; pageIdx < session.maxPages; pageIdx++) {
      const visitResult = await visitEngine.executeVisit({
        proxy,
        url: currentUrl,
        userAgent,
        referrer: pageIdx === 0 ? referrer : null,
        sessionSeed: session.profile?.fingerprintSeed,
        screenshot: options.screenshot,
      });

      results.push({
        page: pageIdx + 1,
        url: currentUrl,
        result: visitResult,
      });

      // Non-bounce sessions navigate to another page
      if (!session.willBounce && pageIdx < session.maxPages - 1) {
        currentUrl = this._pickNextUrl(visitEngine, session);
      }
    }

    // Record the session in the profile manager (visit count, recency)
    if (session.profile?.id && this.profileManager?.recordVisit) {
      await this.profileManager.recordVisit(session.profile.id, {
        url: options.url,
        pages: results.length,
        latency: Date.now() - session.startedAt,
      });
    }

    // Clean up session
    this.activeSessions.delete(session.id);

    return {
      sessionId: session.id,
      isReturning: session.isReturning,
      willBounce: session.willBounce,
      pagesVisited: results.length,
      results,
      totalTime: Date.now() - session.startedAt,
    };
  }

  _pickNextUrl(visitEngine, session) {
    // Prefer another target URL from the pool (organic-looking navigation)
    const pool = visitEngine.urlManager.urls.filter((u) => u.enabled && u.url !== session.url);
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)].url;
    }
    return session.url; // stay on same page
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      totalProfiles: this.visitorProfiles.length,
      targetBounceRate: this.config.targetBounceRate,
      maxPagesPerSession: this.config.maxPagesPerSession,
    };
  }

  updateConfig(config) {
    Object.assign(this.config, config);
  }
}

export default SessionManager;
