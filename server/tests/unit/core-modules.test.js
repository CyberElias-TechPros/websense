// ============================================================================
// core-modules.test.js — Unit tests for utility managers.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import UtmManager from '../../core/utm-manager.js';
import DeviceManager from '../../core/device-manager.js';
import SearchSimulator from '../../core/search-simulator.js';
import CaptchaSolver from '../../core/captcha-solver.js';
import SocialReferralManager from '../../core/social-referral.js';
import GeoDistributionManager from '../../core/geo-distribution.js';
import AnalyticsCompatibilityManager from '../../core/analytics-compatibility.js';
import TrafficPatternManager from '../../core/traffic-patterns.js';
import ContentVerifier from '../../core/content-verification.js';
import ProxyIntelligence from '../../core/proxy-intelligence.js';
import AbTestingManager from '../../core/ab-testing.js';
import AdViewabilitySimulator from '../../core/ad-viewability.js';
import MultiProjectManager from '../../core/multi-project.js';
import DistributedWorkerManager from '../../core/distributed-workers.js';
import NetworkConditionManager from '../../core/network-condition.js';
import DnsSimulator from '../../core/dns-simulation.js';
import CdnEdgeAwareness from '../../core/cdn-edge-awareness.js';
import CompetitorAnalyzer from '../../core/competitor-analysis.js';
import PluginSystem from '../../core/plugin-system.js';
import CliTool from '../../core/cli-tool.js';
import DesktopAppManager from '../../core/desktop-app.js';
import DetectionFeedbackLoop from '../../core/detection-feedback.js';
import MLBehaviorModel from '../../core/ml-behavior-model.js';
import EcommerceFunnelSimulator from '../../core/ecommerce-funnel.js';
import FormInteractionSimulator from '../../core/form-interaction.js';
import CookieConsentManager from '../../core/cookie-consent.js';
import ApiAjaxSimulator from '../../core/api-ajax-simulation.js';

describe('UtmManager', () => {
  let um;
  beforeEach(() => { um = new UtmManager({ enabled: true }); });

  it('should build params with UTM', () => {
    const url = um.buildParams('https://example.com');
    expect(url).toContain('utm_source');
  });

  it('should add campaign', () => {
    const c = um.addCampaign({ source: 'google', medium: 'cpc' });
    expect(c).toBeDefined();
  });

  it('should remove campaign', () => {
    um.addCampaign({ source: 'google', medium: 'cpc' });
    const removed = um.removeCampaign('google', 'cpc');
    expect(removed).toBeDefined();
  });

  it('should get stats', () => {
    const stats = um.getStats();
    expect(stats).toBeDefined();
  });
});

describe('DeviceManager', () => {
  let dm;
  beforeEach(() => { dm = new DeviceManager({ enabled: true, desktopWeight: 55, mobileWeight: 40, tabletWeight: 5 }); });

  it('should get device profile', () => {
    const profile = dm.getDeviceProfile();
    expect(profile).toBeDefined();
    expect(profile.userAgent).toBeDefined();
  });

  it('should get stats', () => {
    const stats = dm.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    dm.updateConfig({ desktopWeight: 60 });
    expect(dm.config.desktopWeight).toBe(60);
  });
});

describe('SearchSimulator', () => {
  let ss;
  beforeEach(() => { ss = new SearchSimulator({ enabled: true }); });

  it('should generate referrer', () => {
    const ref = ss.generateReferrer();
    expect(ref).toBeDefined();
  });

  it('should add keyword', () => {
    ss.addKeyword('test keyword');
    const kws = ss.getKeywords();
    expect(kws).toContain('test keyword');
  });

  it('should remove keyword', () => {
    ss.addKeyword('test');
    ss.removeKeyword('test');
    expect(ss.getKeywords()).not.toContain('test');
  });

  it('should get stats', () => {
    const stats = ss.getStats();
    expect(stats).toBeDefined();
  });
});

describe('CaptchaSolver', () => {
  let cs;
  beforeEach(() => { cs = new CaptchaSolver({ enabled: true, provider: '2captcha', apiKey: 'test' }); });

  it('should check if enabled', () => {
    expect(cs.isEnabled()).toBe(true);
  });

  it('should be disabled without API key', () => {
    const cs2 = new CaptchaSolver({ enabled: true, apiKey: '' });
    expect(cs2.isEnabled()).toBe(false);
  });

  it('should get stats', () => {
    const stats = cs.getStats();
    expect(stats).toBeDefined();
  });
});

describe('SocialReferralManager', () => {
  let sr;
  beforeEach(() => { sr = new SocialReferralManager({ enabled: true }); });

  it('should generate referer', () => {
    const ref = sr.generateReferer();
    expect(ref).toBeDefined();
  });

  it('should get platforms', () => {
    const platforms = sr.getPlatforms();
    expect(platforms.length).toBeGreaterThan(0);
  });

  it('should get stats', () => {
    const stats = sr.getStats();
    expect(stats).toBeDefined();
  });
});

describe('GeoDistributionManager', () => {
  let gm;
  beforeEach(() => { gm = new GeoDistributionManager({ enabled: true }); });

  it('should generate headers', () => {
    const headers = gm.generateHeaders('US');
    expect(headers).toBeDefined();
  });

  it('should update country weights', () => {
    gm.updateCountryWeights({ US: 50, GB: 30, DE: 20 });
    const stats = gm.getStats();
    expect(stats).toBeDefined();
  });

  it('should get stats', () => {
    const stats = gm.getStats();
    expect(stats).toBeDefined();
  });
});

describe('AnalyticsCompatibilityManager', () => {
  let am;
  beforeEach(() => { am = new AnalyticsCompatibilityManager({ enabled: true, consentMode: 'v2' }); });

  it('should generate consent payload', () => {
    const consent = am.generateConsentPayload('v2');
    expect(consent).toBeDefined();
  });

  it('should get stats', () => {
    const stats = am.getStats();
    expect(stats).toBeDefined();
  });
});

describe('TrafficPatternManager', () => {
  let tp;
  beforeEach(() => { tp = new TrafficPatternManager({ enabled: true, currentPattern: 'gaming' }); });

  it('should get hourly weight', () => {
    const weight = tp.getHourlyWeight();
    expect(weight).toBeGreaterThan(0);
  });

  it('should set pattern', () => {
    expect(tp.setPattern('blog')).toBe(true);
    expect(tp.setPattern('nonexistent')).toBe(false);
  });

  it('should start ramp-up', () => {
    tp.startRampUp(7, 'linear');
    expect(tp.config.rampUpEnabled).toBe(true);
  });

  it('should stop ramp-up', () => {
    tp.startRampUp(7, 'linear');
    tp.stopRampUp();
    expect(tp.config.rampUpEnabled).toBe(false);
  });

  it('should get schedule', () => {
    const schedule = tp.getSchedule();
    expect(schedule).toBeDefined();
  });

  it('should get stats', () => {
    const stats = tp.getStats();
    expect(stats).toBeDefined();
  });
});

describe('ContentVerifier', () => {
  let cv;
  beforeEach(() => { cv = new ContentVerifier({ enabled: true, checkTitle: true, checkImages: true, minContentLength: 100 }); });

  it('should verify HTTP response', () => {
    const result = cv.verifyHTTP('<html><title>Test</title><body>Hello world this is test content</body></html>', 200);
    expect(result).toBeDefined();
  });

  it('should get stats', () => {
    const stats = cv.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    cv.updateConfig({ checkTitle: false });
    expect(cv.config.checkTitle).toBe(false);
  });
});

  describe('ProxyIntelligence', () => {
    let pm, pi;
    beforeEach(() => {
      pm = { proxies: [{ host: 'proxy1.com', country: 'US', successCount: 0, failCount: 0 }], getAll: () => [{ host: 'proxy1.com', country: 'US' }] };
      pi = new ProxyIntelligence(pm, { enabled: true, minTrustScore: 30 });
    });

  it('should update trust score', () => {
    pi.updateTrustScore({ host: 'proxy1.com', country: 'US', latency: 500 }, { latency: 500, success: 1 });
    const stats = pi.getStats();
    expect(stats).toBeDefined();
  });

  it('should flag detection', () => {
    pi.flagDetection({ host: 'proxy1.com' }, 'proxy');
    const stats = pi.getStats();
    expect(stats).toBeDefined();
  });

  it('should get config', () => {
    const config = pi.getConfig();
    expect(config).toBeDefined();
  });
});

describe('AbTestingManager', () => {
  let ab;
  beforeEach(() => { ab = new AbTestingManager({ enabled: true }); });

  it('should create test', () => {
    const test = ab.createTest({ testId: 'test1', variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }] });
    expect(test).toBeDefined();
  });

  it('should reject test with <2 variants', () => {
    const test = ab.createTest({ testId: 'test2', variants: [{ name: 'A' }] });
    expect(test).toBeNull();
  });

  it('should get variant', () => {
    ab.createTest({ testId: 'test1', variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }] });
    const variant = ab.getVariant('test1', 'visitor1');
    expect(variant).toBeDefined();
  });

  it('should remove test', () => {
    ab.createTest({ testId: 'test1', variants: [{ name: 'A' }, { name: 'B' }] });
    expect(ab.removeTest('test1')).toBe(true);
  });

  it('should toggle test', () => {
    ab.createTest({ testId: 'test1', variants: [{ name: 'A' }, { name: 'B' }] });
    const test = ab.toggleTest('test1', false);
    expect(test.active).toBe(false);
  });

  it('should get stats', () => {
    const stats = ab.getStats();
    expect(stats).toBeDefined();
  });
});

describe('AdViewabilitySimulator', () => {
  let av;
  beforeEach(() => { av = new AdViewabilitySimulator({ enabled: true }); });

  it('should get stats', () => {
    const stats = av.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    av.updateConfig({ hoverChance: 0.5 });
    expect(av.config.hoverChance).toBe(0.5);
  });
});

describe('MultiProjectManager', () => {
  let mp;
  beforeEach(() => { mp = new MultiProjectManager({ enabled: true, maxProjects: 10 }); });

  it('should create project', () => {
    const project = mp.createProject({ name: 'Test', urls: ['https://example.com'] });
    expect(project).toBeDefined();
  });

  it('should reject project without name', () => {
    const project = mp.createProject({ urls: ['https://example.com'] });
    expect(project).toBeNull();
  });

  it('should remove project', () => {
    const project = mp.createProject({ name: 'Test', urls: ['https://example.com'] });
    expect(mp.removeProject(project.id)).toBe(true);
  });

  it('should toggle project', () => {
    const project = mp.createProject({ name: 'Test', urls: ['https://example.com'] });
    const toggled = mp.toggleProject(project.id, false);
    expect(toggled.enabled).toBe(false);
  });

  it('should record visit', () => {
    const project = mp.createProject({ name: 'Test', urls: ['https://example.com'] });
    mp.recordVisit(project.id, { success: true });
    const stats = mp.getProjectStats(project.id);
    expect(stats.stats.visits).toBe(1);
  });

  it('should get stats', () => {
    const stats = mp.getStats();
    expect(stats).toBeDefined();
  });
});

describe('DistributedWorkerManager', () => {
  let dw;
  beforeEach(() => { dw = new DistributedWorkerManager({ enabled: true, maxWorkers: 5 }); });

  it('should register worker', () => {
    const worker = dw.registerWorker({ host: 'worker1.com', port: 3000, region: 'us-east' });
    expect(worker).toBeDefined();
  });

  it('should heartbeat', () => {
    const worker = dw.registerWorker({ host: 'worker1.com', port: 3000 });
    const result = dw.heartbeat(worker.id);
    expect(result).toBeDefined();
  });

  it('should remove worker', () => {
    const worker = dw.registerWorker({ host: 'worker1.com', port: 3000 });
    expect(dw.removeWorker(worker.id)).toBe(true);
  });

  it('should assign task', () => {
    dw.registerWorker({ host: 'worker1.com', port: 3000 });
    const result = dw.assignTask({ type: 'visit', url: 'https://example.com' });
    expect(result).toBeDefined();
  });

  it('should complete task', () => {
    const worker = dw.registerWorker({ host: 'worker1.com', port: 3000 });
    dw.assignTask({ type: 'visit' });
    dw.completeTask(worker.id);
    expect(worker.load).toBe(0);
  });

  it('should get stats', () => {
    const stats = dw.getStats();
    expect(stats).toBeDefined();
  });
});

describe('NetworkConditionManager', () => {
  let nc;
  beforeEach(() => { nc = new NetworkConditionManager({ enabled: true, saveDataHeader: true, latencyInjection: true }); });

  it('should get presets', () => {
    const presets = nc.getPresets();
    expect(presets.length).toBeGreaterThan(0);
  });

  it('should generate headers for 2G', () => {
    const headers = nc.generateHeaders('2g');
    expect(headers['Save-Data']).toBe('on');
  });

  it('should not generate Save-Data for 4G', () => {
    const headers = nc.generateHeaders('4g');
    expect(headers['Save-Data']).toBeUndefined();
  });

  it('should set connection for URL', () => {
    nc.setConnectionForUrl('https://example.com', '3g');
    expect(nc.getConnectionForUrl('https://example.com')).toBe('3g');
  });

  it('should remove URL condition', () => {
    nc.setConnectionForUrl('https://example.com', '3g');
    expect(nc.removeUrlCondition('https://example.com')).toBe(true);
  });

  it('should get stats', () => {
    const stats = nc.getStats();
    expect(stats).toBeDefined();
  });
});

describe('DnsSimulator', () => {
  let ds;
  beforeEach(() => { ds = new DnsSimulator({ enabled: true, resolverRotation: true }); });

  it('should get random resolver', () => {
    const resolver = ds.getRandomResolver();
    expect(resolver).toBeDefined();
  });

  it('should generate DNS headers', () => {
    const headers = ds.generateDnsHeaders();
    expect(headers['X-DNS-Resolver']).toBeDefined();
  });

  it('should get stats', () => {
    const stats = ds.getStats();
    expect(stats).toBeDefined();
  });
});

describe('CdnEdgeAwareness', () => {
  let ce;
  beforeEach(() => { ce = new CdnEdgeAwareness({ enabled: true, cacheBust: true }); });

  it('should detect Cloudflare', () => {
    const result = ce.detectFromHeaders({ server: 'cloudflare', 'cf-ray': 'abc123' });
    expect(result.cdn).toBe('Cloudflare');
  });

  it('should detect Akamai', () => {
    const result = ce.detectFromHeaders({ server: 'AkamaiGHost' });
    expect(result.cdn).toBe('Akamai');
  });

  it('should generate cache-bust URL', () => {
    const url = ce.generateCacheBust('https://example.com');
    expect(url).toContain('_cb=');
  });

  it('should detect challenge page', () => {
    expect(ce.isChallengePage('Checking your browser before accessing')).toBe(true);
  });

  it('should get stats', () => {
    const stats = ce.getStats();
    expect(stats).toBeDefined();
  });
});

describe('CompetitorAnalyzer', () => {
  let ca;
  beforeEach(() => { ca = new CompetitorAnalyzer({ enabled: true }); });

  it('should get competitors', () => {
    const competitors = ca.getCompetitors();
    expect(competitors.length).toBeGreaterThan(0);
  });

  it('should compare', () => {
    const result = ca.compare({
      browserEngine: 10, fingerprint: 9, behavior: 9, session: 9, analytics: 9,
      trafficSources: 10, proxyIntel: 10, reporting: 8, scalability: 7, ecosystem: 5,
    });
    expect(result.competitors).toBeDefined();
    expect(result.selfScore).toBeGreaterThan(0);
  });

  it('should get stats', () => {
    const stats = ca.getStats();
    expect(stats).toBeDefined();
  });
});

describe('PluginSystem', () => {
  let ps;
  beforeEach(() => { ps = new PluginSystem({ enabled: true, sandboxEnabled: true }); });

  it('should have builtin plugins', () => {
    expect(ps.plugins.size).toBeGreaterThan(0);
  });

  it('should install plugin', () => {
    const plugin = ps.installPlugin({ id: 'test-plugin', name: 'Test', hooks: {} });
    expect(plugin).toBeDefined();
  });

  it('should uninstall plugin', () => {
    ps.installPlugin({ id: 'test-plugin', name: 'Test', hooks: {} });
    expect(ps.uninstallPlugin('test-plugin')).toBe(true);
  });

  it('should toggle plugin', () => {
    const plugin = ps.installPlugin({ id: 'test-plugin', name: 'Test', hooks: {} });
    const toggled = ps.togglePlugin('test-plugin', false);
    expect(toggled.enabled).toBe(false);
  });

  it('should get marketplace', () => {
    const marketplace = ps.getMarketplace();
    expect(marketplace.length).toBeGreaterThan(0);
  });

  it('should get stats', () => {
    const stats = ps.getStats();
    expect(stats).toBeDefined();
  });
});

describe('CliTool', () => {
  let cli;
  beforeEach(() => { cli = new CliTool({ enabled: true, jsonOutput: true }); });

  it('should execute status', async () => {
    const result = await cli.execute('status', [], { json: true });
    expect(result.success).toBe(true);
  });

  it('should execute help', async () => {
    const result = await cli.execute('help', []);
    expect(result.commands).toBeDefined();
  });

  it('should execute version', async () => {
    const result = await cli.execute('version', []);
    expect(result.version).toBeDefined();
  });

  it('should execute add-url', async () => {
    const result = await cli.execute('add-url', ['https://example.com']);
    expect(result.url).toBe('https://example.com');
  });

  it('should execute export', async () => {
    const result = await cli.execute('export', ['csv']);
    expect(result.format).toBe('csv');
  });

  it('should throw on unknown command', async () => {
    await expect(cli.execute('unknown', [])).rejects.toThrow();
  });

  it('should get stats', () => {
    const stats = cli.getStats();
    expect(stats).toBeDefined();
  });
});

describe('DesktopAppManager', () => {
  let da;
  beforeEach(() => { da = new DesktopAppManager({ enabled: true, trayIcon: true, notifications: true }); });

  it('should create window', () => {
    const result = da.createWindow();
    expect(result.state).toBe('visible');
  });

  it('should minimize window', () => {
    da.createWindow();
    const result = da.minimize();
    expect(result.state).toBe('minimized');
  });

  it('should maximize window', () => {
    da.createWindow();
    const result = da.maximize();
    expect(result.state).toBe('maximized');
  });

  it('should close window', () => {
    da.createWindow();
    const result = da.close();
    expect(result.state).toBe('closed');
  });

  it('should send notification', () => {
    const result = da.sendNotification('Title', 'Body');
    expect(result.success).toBe(true);
  });

  it('should create tray icon', () => {
    const result = da.createTrayIcon();
    expect(result.success).toBe(true);
  });

  it('should register auto-start', () => {
    const result = da.registerAutoStart();
    expect(result.autoStart).toBe(true);
  });

  it('should get stats', () => {
    const stats = da.getStats();
    expect(stats).toBeDefined();
  });
});

describe('DetectionFeedbackLoop', () => {
  let dfl;
  beforeEach(() => { dfl = new DetectionFeedbackLoop({ enabled: true, autoBlacklist: true, autoSlowdown: true, autoModeSwitch: true }); });

  it('should record signal', () => {
    const result = dfl.recordSignal('captcha', { proxyHost: 'proxy1.com' });
    expect(result.signal).toBe('captcha');
  });

  it('should get adjustments', () => {
    const adjustments = dfl.getAdjustments();
    expect(adjustments).toBeDefined();
  });

  it('should reset', () => {
    dfl.recordSignal('captcha', { proxyHost: 'proxy1.com' });
    dfl.reset();
    expect(dfl.recentSignals.length).toBe(0);
  });

  it('should get stats', () => {
    const stats = dfl.getStats();
    expect(stats).toBeDefined();
  });
});

describe('MLBehaviorModel', () => {
  let ml;
  beforeEach(() => { ml = new MLBehaviorModel({ enabled: true, useML: false }); });

  it('should have default profiles', () => {
    expect(ml.behaviorProfiles.size).toBeGreaterThan(0);
  });

  it('should select profile', () => {
    const profile = ml.selectProfile('https://shop.example.com', 'ecommerce');
    expect(profile.name).toBe('shopper');
  });

  it('should calculate realism score', () => {
    const score = ml.calculateRealismScore({ dwellTime: 5000, scrollDepth: 0.5, interactions: 2, mouseMovement: 5, referrer: 'google' });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should get stats', () => {
    const stats = ml.getStats();
    expect(stats).toBeDefined();
  });
});

describe('EcommerceFunnelSimulator', () => {
  let ef;
  beforeEach(() => { ef = new EcommerceFunnelSimulator({ enabled: true }); });

  it('should get stats', () => {
    const stats = ef.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    ef.updateConfig({ cartChance: 0.5 });
    expect(ef.config.cartChance).toBe(0.5);
  });
});

describe('FormInteractionSimulator', () => {
  let fi;
  beforeEach(() => { fi = new FormInteractionSimulator({ enabled: true, neverSubmit: true }); });

  it('should get stats', () => {
    const stats = fi.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    fi.updateConfig({ typeChance: 0.5 });
    expect(fi.config.typeChance).toBe(0.5);
  });
});

describe('CookieConsentManager', () => {
  let cc;
  beforeEach(() => { cc = new CookieConsentManager({ enabled: true, acceptChance: 0.7 }); });

  it('should get stats', () => {
    const stats = cc.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    cc.updateConfig({ acceptChance: 0.9 });
    expect(cc.config.acceptChance).toBe(0.9);
  });
});

describe('ApiAjaxSimulator', () => {
  let aa;
  beforeEach(() => { aa = new ApiAjaxSimulator({ enabled: true }); });

  it('should get stats', () => {
    const stats = aa.getStats();
    expect(stats).toBeDefined();
  });

  it('should update config', () => {
    aa.updateConfig({ ajaxChance: 0.5 });
    expect(aa.config.ajaxChance).toBe(0.5);
  });
});
