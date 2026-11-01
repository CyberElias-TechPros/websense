// ============================================================================
// index.js — Server entry point.
// Express API + Socket.IO real-time + static client serving.
// Graceful shutdown closes timers, DB, and listeners.
// ============================================================================

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';

import config from './config/default.js';
import { buildProxyList } from './config/proxies.js';
import { TARGET_URLS } from './config/urls.js';
import ProxyManager from './core/proxy-manager.js';
import ProxyEvaluator from './core/proxy-evaluator.js';
import ProxyStrategies from './core/proxy-strategies.js';
import ProxyIntegrations, { fetchProxiesFromProvider, getAvailableProviders } from './core/proxy-integrations.js';
import AIIntegration from './core/ai-integration.js';
import { ProxyHealthMonitor } from './core/proxy-health-monitor.js';
import { ProxyRotationScheduler } from './core/proxy-rotation-scheduler.js';
import { SmartRetry } from './core/smart-retry.js';
import { ProxyGeoRestrictions } from './core/proxy-geo-restrictions.js';
import { ProxyPerformanceTracker } from './core/proxy-performance-tracker.js';
import { ProxyIntelligenceAnalyzer } from './core/proxy-intelligence-analyzer.js';
import { NotificationManager } from './core/notification-manager.js';
import { ProxyAutoRefresh } from './core/proxy-auto-refresh.js';
import { ProxyPoolManager } from './core/proxy-pool-manager.js';
import { PeriodicHealthChecker } from './core/periodic-health-checker.js';
import UrlManager from './core/url-manager.js';
import VisitEngine from './core/visit-engine.js';
import Scheduler from './core/scheduler.js';
import SessionManager from './core/session-manager.js';
import ProfileManager from './core/profile-manager.js';
import UtmManager from './core/utm-manager.js';
import DeviceManager from './core/device-manager.js';
import SearchSimulator from './core/search-simulator.js';
import CaptchaSolver from './core/captcha-solver.js';
import SocialReferralManager from './core/social-referral.js';
import GeoDistributionManager from './core/geo-distribution.js';
import AnalyticsCompatibilityManager from './core/analytics-compatibility.js';
import TrafficPatternManager from './core/traffic-patterns.js';
import WebhookManager from './core/webhooks.js';
import ReportingEngine from './core/reporting.js';
import ContentVerifier from './core/content-verification.js';
import ProxyIntelligence from './core/proxy-intelligence.js';
import AbTestingManager from './core/ab-testing.js';
import AdViewabilitySimulator from './core/ad-viewability.js';
import ScreenshotSystem from './core/screenshot-system.js';
import MultiProjectManager from './core/multi-project.js';
import DistributedWorkerManager from './core/distributed-workers.js';
import NetworkConditionManager from './core/network-condition.js';
import MLBehaviorModel from './core/ml-behavior-model.js';
import DetectionFeedbackLoop from './core/detection-feedback.js';
import VideoMediaInteractor from './core/video-media-interaction.js';
import EcommerceFunnelSimulator from './core/ecommerce-funnel.js';
import FormInteractionSimulator from './core/form-interaction.js';
import CookieConsentManager from './core/cookie-consent.js';
import DnsSimulator from './core/dns-simulation.js';
import CdnEdgeAwareness from './core/cdn-edge-awareness.js';
import ApiAjaxSimulator from './core/api-ajax-simulation.js';
import CompetitorAnalyzer from './core/competitor-analysis.js';
import MultiPlatformSync from './core/multi-platform-sync.js';
import PluginSystem from './core/plugin-system.js';
import CliTool from './core/cli-tool.js';
import DesktopAppManager from './core/desktop-app.js';
import SessionPersistence from './core/session-persistence.js';
import FreeProxyFetcher from './core/free-proxy-fetcher.js';
import AIBehaviorDirector from './core/ai-behavior-director.js';
import createRoutes from './api/routes.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import logger from './utils/logger.js';
import db from './database/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// App + server
// ---------------------------------------------------------------------------
const app = express();
const server = createServer(app);
const io = new SocketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// --- Security & middleware stack ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.server.corsOrigins.includes('*')
      ? true
      : config.server.corsOrigins,
  })
);
app.use(express.json({ limit: '1mb' }));

// API rate limiting
const limiter = rateLimit({
  windowMs: config.server.rateLimit.windowMs,
  max: config.server.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ---------------------------------------------------------------------------
// Core engine bootstrap
// ---------------------------------------------------------------------------
const proxies = buildProxyList(config.proxyAuth);
const proxyManager = new ProxyManager(proxies, config.healthCheck);
const proxyEvaluator = new ProxyEvaluator(proxyManager, config.proxyEvaluator);
const proxyStrategies = new ProxyStrategies(proxyManager, proxyEvaluator, config.proxyStrategies);
const proxyIntegrations = new ProxyIntegrations(proxyManager, proxyEvaluator);
const proxyHealthMonitor = new ProxyHealthMonitor({
  failureThreshold: config.proxyEvaluator?.failureThreshold || 5,
  cooldownMinutes: config.proxyEvaluator?.cooldownMinutes || 10,
  healthCheckInterval: 60000,
});
proxyHealthMonitor.registerAll(proxies);
const proxyRotationScheduler = new ProxyRotationScheduler({
  rotationInterval: config.proxyEvaluator?.rotationInterval || 300000,
  failureThreshold: config.proxyEvaluator?.failureThreshold || 3,
  latencyThreshold: config.proxyEvaluator?.latencyThreshold || 10000,
});
const smartRetry = new SmartRetry({
  maxRetries: config.engine?.retryAttempts || 3,
  retryDelay: config.engine?.retryDelay || 1000,
});
const geoRestrictions = new ProxyGeoRestrictions({
  allowCountries: config.geo?.allowedCountries || [],
  blockCountries: config.geo?.blockedCountries || [],
  preferredCountries: config.geo?.preferredCountries || [],
  enforceDistribution: config.geo?.enforceDistribution || false,
});
const proxyPerformanceTracker = new ProxyPerformanceTracker();
const proxyIntelligenceAnalyzer = new ProxyIntelligenceAnalyzer();
const notificationManager = new NotificationManager();
const proxyAutoRefresh = new ProxyAutoRefresh({
  enabled: config.proxyEvaluator?.autoRefresh || false,
  interval: config.proxyEvaluator?.refreshInterval || 3600000,
  maxProxies: config.proxyEvaluator?.maxProxies || 200,
  minProxies: config.proxyEvaluator?.minProxies || 50,
  provider: 'webshare',
});
proxyAutoRefresh.init(proxyIntegrations, proxyManager, proxyHealthMonitor, notificationManager);
const proxyPoolManager = new ProxyPoolManager({
  defaultStrategy: config.proxyStrategies?.defaultStrategy || 'best-first',
  poolSize: config.proxyEvaluator?.maxProxies || 200,
});
proxyPoolManager.setDependencies(proxyHealthMonitor, proxyPerformanceTracker, proxyIntelligenceAnalyzer, geoRestrictions, proxyStrategies, proxyRotationScheduler, proxyAutoRefresh, notificationManager);
proxyPoolManager.add(proxies);
const periodicHealthChecker = new PeriodicHealthChecker({
  enabled: config.proxyEvaluator?.periodicHealthCheck || false,
  interval: config.proxyEvaluator?.healthCheckInterval || 300000,
  batchSize: config.proxyEvaluator?.batchSize || 20,
});
periodicHealthChecker.setDependencies(proxyManager, proxyHealthMonitor, proxyPerformanceTracker, notificationManager, proxyRotationScheduler, proxyIntelligenceAnalyzer);
const aiIntegration = new AIIntegration(config.ai);
const behaviorDirector = new AIBehaviorDirector({
  aiIntegration,
  config: config.aiBehavior,
});
// Provider probe in background — never blocks boot; heuristic personas cover
// the gap until OmniRoute/Ollama/etc. come online.
behaviorDirector.init().catch(() => {});
// Re-probe every 10 min so a newly started OmniRoute/Ollama is picked up.
setInterval(() => { behaviorDirector.init().catch(() => {}); }, 10 * 60 * 1000);
const freeProxyFetcher = new FreeProxyFetcher(proxyManager, config.freeProxies);
freeProxyFetcher.startAutoRefresh(); // delayed initial fetch + periodic refresh
const urlManager = new UrlManager(TARGET_URLS);
const sessionPersistence = new SessionPersistence(config.sessionPersistence);
const visitEngine = new VisitEngine(proxyManager, urlManager, config.engine, null, sessionPersistence);
visitEngine.setBehaviorDirector(behaviorDirector); // AI-directed human mannerisms
const profileManager = new ProfileManager({ db }, config.session);
const sessionManager = new SessionManager(config.session, profileManager);
const utmManager = new UtmManager(config.utm);
const deviceManager = new DeviceManager(config.device);
const searchSimulator = new SearchSimulator(config.search);
const captchaSolver = new CaptchaSolver(config.captcha);
const socialReferral = new SocialReferralManager(config.social);
const geoManager = new GeoDistributionManager(config.geo);
const analyticsManager = new AnalyticsCompatibilityManager(config.analytics);
const trafficPatterns = new TrafficPatternManager(config.traffic);
const webhookManager = new WebhookManager(config.webhooks);
notificationManager.setWebhookManager(webhookManager);
const reportingEngine = new ReportingEngine(config.reporting);
const contentVerifier = new ContentVerifier(config.contentVerification);
const proxyIntelligence = new ProxyIntelligence(proxyManager, config.proxyIntelligence);
const scheduler = new Scheduler(visitEngine, { ...config.engine, sessionManager }, io);

// Sprint 3 completion managers.
const abTesting = new AbTestingManager(config.abTesting);
const adViewability = new AdViewabilitySimulator(config.adViewability);
const screenshotSystem = new ScreenshotSystem(config.screenshots);
const multiProject = new MultiProjectManager(config.multiProject);
const distributedWorkers = new DistributedWorkerManager(config.distributedWorkers);
const networkCondition = new NetworkConditionManager(config.networkCondition);

// Tier 4 — Advanced features.
const mlBehavior = new MLBehaviorModel(config.mlBehavior);
const detectionFeedback = new DetectionFeedbackLoop(config.detectionFeedback);
const videoMedia = new VideoMediaInteractor(config.videoMedia);
const ecommerceFunnel = new EcommerceFunnelSimulator(config.ecommerceFunnel);
const formInteraction = new FormInteractionSimulator(config.formInteraction);
const cookieConsent = new CookieConsentManager(config.cookieConsent);
const dnsSimulation = new DnsSimulator(config.dnsSimulation);
const cdnEdge = new CdnEdgeAwareness(config.cdnEdge);
const apiAjax = new ApiAjaxSimulator(config.apiAjax);
const competitorAnalysis = new CompetitorAnalyzer(config.competitorAnalysis);

// Tier 5 — Ecosystem features.
const multiPlatformSync = new MultiPlatformSync(config.multiPlatformSync);
const pluginSystem = new PluginSystem(config.pluginSystem);
const cliTool = new CliTool(config.cliTool);
const desktopApp = new DesktopAppManager(config.desktopApp);

// Link session manager into the visit engine for session-mode execution.
visitEngine.sessionManager = sessionManager;

// Link Sprint 2 managers into the visit engine.
visitEngine.utmManager = utmManager;
visitEngine.deviceManager = deviceManager;
visitEngine.searchSimulator = searchSimulator;
visitEngine.captchaSolver = captchaSolver;

// Link Sprint 2 completion managers into the visit engine.
visitEngine.socialReferral = socialReferral;
visitEngine.geoManager = geoManager;
visitEngine.analyticsManager = analyticsManager;
visitEngine.trafficPatterns = trafficPatterns;

// Link Sprint 3 managers.
visitEngine.webhookManager = webhookManager;
visitEngine.reportingEngine = reportingEngine;
visitEngine.contentVerifier = contentVerifier;
visitEngine.proxyIntelligence = proxyIntelligence;
visitEngine.abTesting = abTesting;
visitEngine.adViewability = adViewability;
visitEngine.screenshotSystem = screenshotSystem;
visitEngine.multiProject = multiProject;
visitEngine.distributedWorkers = distributedWorkers;
visitEngine.networkCondition = networkCondition;
visitEngine.mlBehavior = mlBehavior;
visitEngine.detectionFeedback = detectionFeedback;
visitEngine.videoMedia = videoMedia;
visitEngine.ecommerceFunnel = ecommerceFunnel;
visitEngine.formInteraction = formInteraction;
visitEngine.cookieConsent = cookieConsent;
visitEngine.dnsSimulation = dnsSimulation;
visitEngine.cdnEdge = cdnEdge;
visitEngine.apiAjax = apiAjax;
visitEngine.competitorAnalysis = competitorAnalysis;
visitEngine.multiPlatformSync = multiPlatformSync;
visitEngine.pluginSystem = pluginSystem;
visitEngine.cliTool = cliTool;
visitEngine.desktopApp = desktopApp;

// Initialize geo weights from actual proxy pool.
geoManager.initFromProxies(proxies);

await profileManager.init();
sessionManager.profileManager = profileManager;

logger.info(`📡 Loaded ${proxies.length} proxies across ${[...new Set(proxies.map((p) => p.country))].length} countries`);
logger.info(`🔗 Loaded ${TARGET_URLS.length} target URLs`);
logger.info(`🖥️ Session mode: ${config.session.enabled ? 'ENABLED (bounce rate ' + config.session.targetBounceRate + '%)' : 'disabled'}`);
logger.info(`📱 Device dist: ${deviceManager.config.desktopWeight}% desktop / ${deviceManager.config.mobileWeight}% mobile / ${deviceManager.config.tabletWeight}% tablet`);
logger.info(`🔍 Search sim: ${config.search.enabled ? 'ENABLED' : 'disabled'} | UTM: ${config.utm.enabled ? 'ENABLED' : 'disabled'} | Captcha: ${captchaSolver.isEnabled() ? 'ENABLED' : 'disabled'}`);
logger.info(`🌐 Social referral: ${config.social.enabled ? 'ENABLED' : 'disabled'} | Geo match: ${config.geo.enabled ? 'ENABLED' : 'disabled'} | Analytics: ${config.analytics.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`📊 Traffic pattern: ${trafficPatterns.config.currentPattern} | Ramp-up: ${trafficPatterns.config.rampUpEnabled ? 'ENABLED' : 'disabled'}`);
logger.info(`🔗 Webhooks: ${config.webhooks.enabled ? 'ENABLED' : 'disabled'} | Reporting: ${config.reporting.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`👤 Visitor profiles: ${profileManager.cache.size} loaded, return rate ${config.session.returnVisitorRate}%`);
logger.info(`🧪 A/B testing: ${config.abTesting.enabled ? 'ENABLED' : 'disabled'} | Ad viewability: ${config.adViewability.enabled ? 'ENABLED' : 'disabled'} | Screenshots: ${config.screenshots.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`📂 Multi-project: ${config.multiProject.enabled ? 'ENABLED' : 'disabled'} | Distributed workers: ${config.distributedWorkers.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`📶 Network condition: ${config.networkCondition.enabled ? 'ENABLED' : 'disabled'} | Default: ${config.networkCondition.defaultConnection || 'none'}`);
logger.info(`🧠 Tier 4 — ML behavior: ${config.mlBehavior.enabled ? 'ENABLED' : 'disabled'} | Detection feedback: ${config.detectionFeedback.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`🎬 Video/Media: ${config.videoMedia.enabled ? 'ENABLED' : 'disabled'} | E-commerce: ${config.ecommerceFunnel.enabled ? 'ENABLED' : 'disabled'} | Forms: ${config.formInteraction.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`🍪 Cookie consent: ${config.cookieConsent.enabled ? 'ENABLED' : 'disabled'} | DNS sim: ${config.dnsSimulation.enabled ? 'ENABLED' : 'disabled'} | CDN/Edge: ${config.cdnEdge.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`🔌 API/AJAX: ${config.apiAjax.enabled ? 'ENABLED' : 'disabled'} | Competitor analysis: ${config.competitorAnalysis.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`🌐 Tier 5 — Cloud sync: ${config.multiPlatformSync.enabled ? 'ENABLED' : 'disabled'} | Plugins: ${config.pluginSystem.enabled ? 'ENABLED' : 'disabled'} | CLI: ${config.cliTool.enabled ? 'ENABLED' : 'disabled'}`);
logger.info(`💻 Desktop app: ${config.desktopApp.enabled ? 'ENABLED' : 'disabled'} | Reporting (PDF): ${config.reporting.enabled ? 'ENABLED' : 'disabled'}`);

logger.info(`📡 Loaded ${proxies.length} proxies across ${[...new Set(proxies.map((p) => p.country))].length} countries`);
logger.info(`🔗 Loaded ${TARGET_URLS.length} target URLs`);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', createRoutes(scheduler, proxyManager, urlManager, io, sessionManager, profileManager, utmManager, deviceManager, searchSimulator, captchaSolver, socialReferral, geoManager, analyticsManager, trafficPatterns, webhookManager, reportingEngine, contentVerifier, proxyIntelligence, abTesting, adViewability, screenshotSystem, multiProject, distributedWorkers, networkCondition, mlBehavior, detectionFeedback, videoMedia, ecommerceFunnel, formInteraction, cookieConsent, dnsSimulation, cdnEdge, apiAjax, competitorAnalysis, multiPlatformSync, pluginSystem, cliTool, desktopApp, proxyEvaluator, proxyStrategies, aiIntegration, proxyHealthMonitor, proxyRotationScheduler, smartRetry, geoRestrictions, proxyPerformanceTracker, proxyIntelligenceAnalyzer, notificationManager, proxyAutoRefresh, proxyPoolManager, periodicHealthChecker, freeProxyFetcher, behaviorDirector));

// --- Health check endpoint ---
app.get('/health', (req, res) =>
  res.json({ status: 'ok', uptime: process.uptime(), mode: config.engine.mode })
);

// --- Serve built frontend in production ---
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/socket\.io|\/health).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  logger.info(`🖥️ Serving client from ${clientDist}`);
}

// --- 404 + error handlers (must be last) ---
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// WebSocket real-time layer
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  logger.info(`Dashboard connected: ${socket.id}`);
  socket.emit('engine:state', { state: scheduler.state });
  socket.emit('stats:update', visitEngine.getStats());

  socket.on('disconnect', () => {
    logger.info(`Dashboard disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Periodic health checks + auto-start
// ---------------------------------------------------------------------------
if (config.healthCheck.interval > 0) {
  setInterval(() => {
    proxyManager.healthCheckAll().catch((err) =>
      logger.warn(`Background health check failed: ${err.message}`)
    );
  }, config.healthCheck.interval);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal) {
  logger.info(`${signal} received — shutting down...`);
  scheduler.stop();
  io.close();
  server.close(() => {
    try { db.close(); } catch { /* noop */ }
    logger.info('Shutdown complete');
    process.exit(0);
  });
  // Force exit if something hangs.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) =>
  logger.error('Unhandled rejection:', reason)
);
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(config.server.port, config.server.host, () => {
  logger.info(`🚀 Proxy Visitor Server on http://${config.server.host}:${config.server.port}`);
  if (config.engine.autoStart) {
    logger.info('⚡ Auto-starting visit engine (AUTO_START=1)');
    scheduler.start();
  }
});
