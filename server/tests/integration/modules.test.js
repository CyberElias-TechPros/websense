// ============================================================================
// modules.test.js — Integration tests for module wiring.
// Tests that all managers can be instantiated and wired together.
// ============================================================================

import { describe, it, expect } from 'vitest';

const mockProxies = [
  { host: 'proxy1.com', port: 8000, country: 'US', city: 'New York', flag: '🇺🇸', enabled: true, username: 'user', password: 'pass' },
  { host: 'proxy2.com', port: 8000, country: 'GB', city: 'London', flag: '🇬🇧', enabled: true, username: 'user', password: 'pass' },
];

const mockUrls = ['https://example1.com', 'https://example2.com'];

// Import all modules dynamically to avoid import errors
const modules = await Promise.all([
  import('../../core/proxy-manager.js'),
  import('../../core/url-manager.js'),
  import('../../core/visit-engine.js'),
  import('../../core/scheduler.js'),
  import('../../core/session-manager.js'),
  import('../../core/utm-manager.js'),
  import('../../core/device-manager.js'),
  import('../../core/search-simulator.js'),
  import('../../core/captcha-solver.js'),
  import('../../core/social-referral.js'),
  import('../../core/geo-distribution.js'),
  import('../../core/analytics-compatibility.js'),
  import('../../core/traffic-patterns.js'),
  import('../../core/webhooks.js'),
  import('../../core/reporting.js'),
  import('../../core/content-verification.js'),
  import('../../core/proxy-intelligence.js'),
  import('../../core/ab-testing.js'),
  import('../../core/ad-viewability.js'),
  import('../../core/screenshot-system.js'),
  import('../../core/multi-project.js'),
  import('../../core/distributed-workers.js'),
  import('../../core/network-condition.js'),
  import('../../core/ml-behavior-model.js'),
  import('../../core/detection-feedback.js'),
  import('../../core/video-media-interaction.js'),
  import('../../core/ecommerce-funnel.js'),
  import('../../core/form-interaction.js'),
  import('../../core/cookie-consent.js'),
  import('../../core/dns-simulation.js'),
  import('../../core/cdn-edge-awareness.js'),
  import('../../core/api-ajax-simulation.js'),
  import('../../core/competitor-analysis.js'),
  import('../../core/multi-platform-sync.js'),
  import('../../core/plugin-system.js'),
  import('../../core/cli-tool.js'),
  import('../../core/desktop-app.js'),
]);

const [
  ProxyManager, UrlManager, VisitEngine, Scheduler, SessionManager,
  UtmManager, DeviceManager, SearchSimulator, CaptchaSolver,
  SocialReferralManager, GeoDistributionManager, AnalyticsCompatibilityManager,
  TrafficPatternManager, WebhookManager, ReportingEngine, ContentVerifier,
  ProxyIntelligence, AbTestingManager, AdViewabilitySimulator, ScreenshotSystem,
  MultiProjectManager, DistributedWorkerManager, NetworkConditionManager,
  MLBehaviorModel, DetectionFeedbackLoop, VideoMediaInteractor,
  EcommerceFunnelSimulator, FormInteractionSimulator, CookieConsentManager,
  DnsSimulator, CdnEdgeAwareness, ApiAjaxSimulator, CompetitorAnalyzer,
  MultiPlatformSync, PluginSystem, CliTool, DesktopAppManager,
] = modules.map(m => m.default);

describe('Module Integration', () => {
  describe('All managers instantiate', () => {
    it('ProxyManager instantiates', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true, interval: 30000 });
      expect(pm).toBeDefined();
      expect(pm.proxies.length).toBe(2);
    });

    it('UrlManager instantiates', () => {
      const um = new UrlManager(mockUrls);
      expect(um).toBeDefined();
      expect(um.urls.length).toBe(2);
    });

    it('VisitEngine instantiates', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      expect(ve).toBeDefined();
    });

    it('Scheduler instantiates', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      const s = new Scheduler(ve, { mode: 'http', demoMode: true }, { on: () => {}, emit: () => {} });
      expect(s).toBeDefined();
    });

    it('SessionManager instantiates', () => {
      const sm = new SessionManager({ enabled: true }, null);
      expect(sm).toBeDefined();
    });

    it('UtmManager instantiates', () => {
      const u = new UtmManager({ enabled: true });
      expect(u).toBeDefined();
    });

    it('DeviceManager instantiates', () => {
      const d = new DeviceManager({ enabled: true });
      expect(d).toBeDefined();
    });

    it('SearchSimulator instantiates', () => {
      const s = new SearchSimulator({ enabled: true });
      expect(s).toBeDefined();
    });

    it('CaptchaSolver instantiates', () => {
      const c = new CaptchaSolver({ enabled: false });
      expect(c).toBeDefined();
    });

    it('SocialReferralManager instantiates', () => {
      const s = new SocialReferralManager({ enabled: true });
      expect(s).toBeDefined();
    });

    it('GeoDistributionManager instantiates', () => {
      const g = new GeoDistributionManager({ enabled: true });
      expect(g).toBeDefined();
    });

    it('AnalyticsCompatibilityManager instantiates', () => {
      const a = new AnalyticsCompatibilityManager({ enabled: true });
      expect(a).toBeDefined();
    });

    it('TrafficPatternManager instantiates', () => {
      const t = new TrafficPatternManager({ enabled: true });
      expect(t).toBeDefined();
    });

    it('WebhookManager instantiates', () => {
      const w = new WebhookManager({ enabled: true });
      expect(w).toBeDefined();
    });

    it('ReportingEngine instantiates', () => {
      const r = new ReportingEngine({ enabled: true });
      expect(r).toBeDefined();
    });

    it('ContentVerifier instantiates', () => {
      const c = new ContentVerifier({ enabled: true });
      expect(c).toBeDefined();
    });

    it('ProxyIntelligence instantiates', () => {
      const pm = { proxies: [{ host: 'p1' }], getAll: () => [{ host: 'p1' }] };
      const pi = new ProxyIntelligence(pm, { enabled: true });
      expect(pi).toBeDefined();
    });

    it('AbTestingManager instantiates', () => {
      const ab = new AbTestingManager({ enabled: true });
      expect(ab).toBeDefined();
    });

    it('AdViewabilitySimulator instantiates', () => {
      const av = new AdViewabilitySimulator({ enabled: true });
      expect(av).toBeDefined();
    });

    it('ScreenshotSystem instantiates', () => {
      const ss = new ScreenshotSystem({ enabled: true });
      expect(ss).toBeDefined();
    });

    it('MultiProjectManager instantiates', () => {
      const mp = new MultiProjectManager({ enabled: true });
      expect(mp).toBeDefined();
    });

    it('DistributedWorkerManager instantiates', () => {
      const dw = new DistributedWorkerManager({ enabled: true });
      expect(dw).toBeDefined();
    });

    it('NetworkConditionManager instantiates', () => {
      const nc = new NetworkConditionManager({ enabled: true });
      expect(nc).toBeDefined();
    });

    it('MLBehaviorModel instantiates', () => {
      const ml = new MLBehaviorModel({ enabled: true });
      expect(ml).toBeDefined();
    });

    it('DetectionFeedbackLoop instantiates', () => {
      const df = new DetectionFeedbackLoop({ enabled: true });
      expect(df).toBeDefined();
    });

    it('VideoMediaInteractor instantiates', () => {
      const vm = new VideoMediaInteractor({ enabled: true });
      expect(vm).toBeDefined();
    });

    it('EcommerceFunnelSimulator instantiates', () => {
      const ef = new EcommerceFunnelSimulator({ enabled: true });
      expect(ef).toBeDefined();
    });

    it('FormInteractionSimulator instantiates', () => {
      const fi = new FormInteractionSimulator({ enabled: true });
      expect(fi).toBeDefined();
    });

    it('CookieConsentManager instantiates', () => {
      const cc = new CookieConsentManager({ enabled: true });
      expect(cc).toBeDefined();
    });

    it('DnsSimulator instantiates', () => {
      const ds = new DnsSimulator({ enabled: true });
      expect(ds).toBeDefined();
    });

    it('CdnEdgeAwareness instantiates', () => {
      const ce = new CdnEdgeAwareness({ enabled: true });
      expect(ce).toBeDefined();
    });

    it('ApiAjaxSimulator instantiates', () => {
      const aa = new ApiAjaxSimulator({ enabled: true });
      expect(aa).toBeDefined();
    });

    it('CompetitorAnalyzer instantiates', () => {
      const ca = new CompetitorAnalyzer({ enabled: true });
      expect(ca).toBeDefined();
    });

    it('MultiPlatformSync instantiates', () => {
      const mp = new MultiPlatformSync({ enabled: true });
      expect(mp).toBeDefined();
    });

    it('PluginSystem instantiates', () => {
      const ps = new PluginSystem({ enabled: true });
      expect(ps).toBeDefined();
    });

    it('CliTool instantiates', () => {
      const cli = new CliTool({ enabled: true });
      expect(cli).toBeDefined();
    });

    it('DesktopAppManager instantiates', () => {
      const da = new DesktopAppManager({ enabled: true });
      expect(da).toBeDefined();
    });
  });

  describe('Visit engine demo mode', () => {
    it('executes a demo visit successfully', async () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      const result = await ve.executeVisit({});
      expect(result.success).toBe(true);
      expect(result.visitId).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.proxy).toBeDefined();
      expect(result.statusCode).toBe(200);
    });

    it('records visit stats', async () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      await ve.executeVisit({});
      const stats = ve.getStats();
      expect(stats.totalVisits).toBeGreaterThan(0);
      expect(stats.successCount).toBeGreaterThan(0);
    });
  });

  describe('Scheduler integration', () => {
    it('starts and stops', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      const s = new Scheduler(ve, { mode: 'http', demoMode: true }, { on: () => {}, emit: () => {} });
      s.start('random');
      expect(s.state).toBe('running');
      s.stop();
      expect(s.state).toBe('stopped');
    });
  });

  describe('All managers getStats()', () => {
    const allManagers = [
      ['ProxyManager', () => new ProxyManager(mockProxies, { enabled: true })],
      ['UrlManager', () => new UrlManager(mockUrls)],
      ['UtmManager', () => new UtmManager({ enabled: true })],
      ['DeviceManager', () => new DeviceManager({ enabled: true })],
      ['SearchSimulator', () => new SearchSimulator({ enabled: true })],
      ['CaptchaSolver', () => new CaptchaSolver({ enabled: false })],
      ['SocialReferralManager', () => new SocialReferralManager({ enabled: true })],
      ['GeoDistributionManager', () => new GeoDistributionManager({ enabled: true })],
      ['AnalyticsCompatibilityManager', () => new AnalyticsCompatibilityManager({ enabled: true })],
      ['TrafficPatternManager', () => new TrafficPatternManager({ enabled: true })],
      ['WebhookManager', () => new WebhookManager({ enabled: true })],
      ['ReportingEngine', () => new ReportingEngine({ enabled: true })],
      ['ContentVerifier', () => new ContentVerifier({ enabled: true })],
      ['AbTestingManager', () => new AbTestingManager({ enabled: true })],
      ['AdViewabilitySimulator', () => new AdViewabilitySimulator({ enabled: true })],
      ['ScreenshotSystem', () => new ScreenshotSystem({ enabled: true })],
      ['MultiProjectManager', () => new MultiProjectManager({ enabled: true })],
      ['DistributedWorkerManager', () => new DistributedWorkerManager({ enabled: true })],
      ['NetworkConditionManager', () => new NetworkConditionManager({ enabled: true })],
      ['MLBehaviorModel', () => new MLBehaviorModel({ enabled: true })],
      ['DetectionFeedbackLoop', () => new DetectionFeedbackLoop({ enabled: true })],
      ['VideoMediaInteractor', () => new VideoMediaInteractor({ enabled: true })],
      ['EcommerceFunnelSimulator', () => new EcommerceFunnelSimulator({ enabled: true })],
      ['FormInteractionSimulator', () => new FormInteractionSimulator({ enabled: true })],
      ['CookieConsentManager', () => new CookieConsentManager({ enabled: true })],
      ['DnsSimulator', () => new DnsSimulator({ enabled: true })],
      ['CdnEdgeAwareness', () => new CdnEdgeAwareness({ enabled: true })],
      ['ApiAjaxSimulator', () => new ApiAjaxSimulator({ enabled: true })],
      ['CompetitorAnalyzer', () => new CompetitorAnalyzer({ enabled: true })],
      ['MultiPlatformSync', () => new MultiPlatformSync({ enabled: true })],
      ['PluginSystem', () => new PluginSystem({ enabled: true })],
      ['CliTool', () => new CliTool({ enabled: true })],
      ['DesktopAppManager', () => new DesktopAppManager({ enabled: true })],
    ];

    allManagers.forEach(([name, factory]) => {
      it(`${name}.getStats() returns object`, () => {
        const manager = factory();
        const stats = manager.getStats();
        expect(stats).toBeDefined();
        expect(typeof stats).toBe('object');
      });
    });
  });
});
