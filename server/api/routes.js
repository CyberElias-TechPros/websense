// ============================================================================
// routes.js — REST API layer.
// Engine controls, stats, visits, analytics, proxy & URL management,
// config, logs (SSE), database maintenance.
// ============================================================================

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import db, { toSqliteDateTime } from '../database/db.js';
import logger from '../utils/logger.js';
import { getAvailableProviders, fetchProxiesFromProvider } from '../core/proxy-integrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function createRoutes(scheduler, proxyManager, urlManager, io, sessionManager = null, profileManager = null, utmManager = null, deviceManager = null, searchSimulator = null, captchaSolver = null, socialReferral = null, geoManager = null, analyticsManager = null, trafficPatterns = null, webhookManager = null, reportingEngine = null, contentVerifier = null, proxyIntelligence = null, abTesting = null, adViewability = null, screenshotSystem = null, multiProject = null, distributedWorkers = null, networkCondition = null, mlBehavior = null, detectionFeedback = null, videoMedia = null, ecommerceFunnel = null, formInteraction = null, cookieConsent = null, dnsSimulation = null, cdnEdge = null, apiAjax = null, competitorAnalysis = null, multiPlatformSync = null, pluginSystem = null, cliTool = null, desktopApp = null, proxyEvaluator = null, proxyStrategies = null, aiIntegration = null, proxyHealthMonitor = null, proxyRotationScheduler = null, smartRetry = null, geoRestrictions = null, proxyPerformanceTracker = null, proxyIntelligenceAnalyzer = null, notificationManager = null, proxyAutoRefresh = null, proxyPoolManager = null, periodicHealthChecker = null, freeProxyFetcher = null, behaviorDirector = null) {
  const router = Router();

  // -----------------------------------------------------------------------
  // Engine controls
  // -----------------------------------------------------------------------
  router.post('/engine/start', (req, res) => {
    const strategy = req.body?.strategy || 'random';
    scheduler.start(strategy);
    res.json({ success: true, state: 'running' });
  });

  router.post('/engine/pause', (req, res) => {
    scheduler.pause();
    res.json({ success: true, state: 'paused' });
  });

  router.post('/engine/resume', (req, res) => {
    scheduler.resume();
    res.json({ success: true, state: 'running' });
  });

  router.post('/engine/stop', (req, res) => {
    scheduler.stop();
    res.json({ success: true, state: 'stopped' });
  });

  router.get('/engine/status', (req, res) => {
    res.json(scheduler.getState());
  });

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------
  router.get('/stats/overview', (req, res) => {
    const stats = scheduler.getState();

    const hourAgo = toSqliteDateTime(Date.now() - 3600_000);
    const recent = db
      .prepare(
        `SELECT COUNT(*) as count, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
         FROM visits WHERE created_at > ?`
      )
      .get(hourAgo);

    const avgLatency = db
      .prepare(
        `SELECT AVG(latency_ms) as avg FROM visits WHERE success = 1 AND created_at > ?`
      )
      .get(hourAgo);

    res.json({
      ...stats,
      recentVisits: recent.count || 0,
      recentSuccessRate:
        recent.count > 0 ? Math.round((recent.successes / recent.count) * 100) : 0,
      avgLatency: Math.round(avgLatency.avg || 0),
      proxyStats: proxyManager.getStats(),
      urlStats: urlManager.getStats(),
    });
  });

  // -----------------------------------------------------------------------
  // Visits
  // -----------------------------------------------------------------------
  router.get('/visits', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;
    const { status, url, proxy, mode } = req.query;

    let where = '1=1';
    const params = [];
    if (status === 'success') where += ' AND success = 1';
    if (status === 'failed') where += ' AND success = 0';
    if (url) { where += ' AND url LIKE ?'; params.push(`%${url}%`); }
    if (proxy) { where += ' AND proxy_host = ?'; params.push(proxy); }
    if (mode) { where += ' AND mode = ?'; params.push(mode); }

    const total = db
      .prepare(`SELECT COUNT(*) as count FROM visits WHERE ${where}`)
      .get(...params).count;
    const visits = db
      .prepare(
        `SELECT * FROM visits WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    res.json({
      visits,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  });

  router.get('/visits/recent', (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const visits = db
      .prepare('SELECT * FROM visits ORDER BY created_at DESC LIMIT ?')
      .all(limit);
    res.json(visits);
  });

  // Live visit stream over Server-Sent Events (WebSocket alternative).
  router.get('/visits/live', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    const onVisit = (visit) => {
      res.write(`event: visit\ndata: ${JSON.stringify(visit)}\n\n`);
    };
    const onStats = (stats) => {
      res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
    };

    io.on('visit:complete', onVisit);
    io.on('stats:update', onStats);

    req.on('close', () => {
      io.off('visit:complete', onVisit);
      io.off('stats:update', onStats);
    });
  });

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------
  router.get('/analytics/timeline', (req, res) => {
    const hours = Math.min(168, Math.max(1, parseInt(req.query.hours || '24', 10)));
    const since = toSqliteDateTime(Date.now() - hours * 3600_000);
    const data = db
      .prepare(`
        SELECT
          strftime('%Y-%m-%d %H:00:00', created_at) as hour,
          COUNT(*) as total,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
          AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
        FROM visits
        WHERE created_at > ?
        GROUP BY hour
        ORDER BY hour
      `)
      .all(since);
    res.json(data);
  });

  router.get('/analytics/by-url', (req, res) => {
    const data = db
      .prepare(`
        SELECT url, subdomain,
          COUNT(*) as total,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
        FROM visits
        GROUP BY url
        ORDER BY total DESC
      `)
      .all();
    res.json(data);
  });

  router.get('/analytics/by-proxy', (req, res) => {
    const data = db
      .prepare(`
        SELECT proxy_host, proxy_country, proxy_city,
          COUNT(*) as total,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
        FROM visits
        GROUP BY proxy_host
        ORDER BY total DESC
      `)
      .all();
    res.json(data);
  });

  router.get('/analytics/by-country', (req, res) => {
    const data = db
      .prepare(`
        SELECT proxy_country, COUNT(*) as total
        FROM visits
        GROUP BY proxy_country
        ORDER BY total DESC
      `)
      .all();
    res.json(data);
  });

  // Comprehensive analytics dashboard
  router.get('/analytics/dashboard', (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '7', 10)));
    const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency,
        AVG(CASE WHEN success = 1 THEN (julianday('now') - julianday(created_at)) * 86400 END) as avg_time_to_visit
      FROM visits WHERE created_at > ?
    `).get(since);

    const byUrl = db.prepare(`
      SELECT subdomain, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
      GROUP BY subdomain ORDER BY total DESC LIMIT 20
    `).all(since);

    const byProxy = db.prepare(`
      SELECT proxy_host, proxy_country, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
      GROUP BY proxy_host ORDER BY total DESC LIMIT 20
    `).all(since);

    const byCountry = db.prepare(`
      SELECT proxy_country, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY proxy_country ORDER BY total DESC
    `).all(since);

    const byDevice = db.prepare(`
      SELECT device_type, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY device_type ORDER BY total DESC
    `).all(since);

    const byHour = db.prepare(`
      SELECT strftime('%H', created_at) as hour, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY hour ORDER BY hour
    `).all(since);

    const byDay = db.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
      GROUP BY day ORDER BY day
    `).all(since);

    const topErrors = db.prepare(`
      SELECT error_message, COUNT(*) as count
      FROM visits WHERE created_at > ? AND error_message IS NOT NULL AND error_message != ''
      GROUP BY error_message ORDER BY count DESC LIMIT 10
    `).all(since);

    const recentVisits = db.prepare(`
      SELECT id, url, subdomain, proxy_host, proxy_country, status_code, latency_ms, success, created_at
      FROM visits WHERE created_at > ?
      ORDER BY created_at DESC LIMIT 10
    `).all(since);

    res.json({
      period: { days, since },
      totals: {
        ...totals,
        successRate: totals.total > 0 ? Math.round((totals.successes / totals.total) * 100) : 0,
      },
      byUrl,
      byProxy,
      byCountry,
      byDevice,
      byHour,
      byDay,
      topErrors,
      recentVisits,
    });
  });

  // Hourly traffic pattern analysis
  router.get('/analytics/hourly-pattern', (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '7', 10)));
    const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);

    const pattern = db.prepare(`
      SELECT
        strftime('%H', created_at) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
      GROUP BY hour ORDER BY hour
    `).all(since);

    // Calculate peak hours
    const sorted = [...pattern].sort((a, b) => b.total - a.total);
    const peakHours = sorted.slice(0, 3).map(h => h.hour);
    const lowHours = sorted.slice(-3).map(h => h.hour);

    res.json({ pattern, peakHours, lowHours });
  });

  // Proxy performance comparison
  router.get('/analytics/proxy-comparison', (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '7', 10)));
    const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);

    const comparison = db.prepare(`
      SELECT
        proxy_host,
        proxy_country,
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency,
        MIN(CASE WHEN success = 1 THEN latency_ms END) as min_latency,
        MAX(CASE WHEN success = 1 THEN latency_ms END) as max_latency,
        COUNT(DISTINCT subdomain) as unique_urls_visited
      FROM visits WHERE created_at > ?
      GROUP BY proxy_host
      ORDER BY total DESC
    `).all(since);

    // Calculate performance scores
    const scored = comparison.map((p) => {
      const successRate = p.total > 0 ? (p.successes / p.total) * 100 : 0;
      const latencyScore = p.avg_latency ? Math.max(0, 100 - (p.avg_latency / 100)) : 0;
      const consistencyScore = p.total > 0 ? Math.min(100, (p.unique_urls_visited / 20) * 100) : 0;
      const score = Math.round(successRate * 0.5 + latencyScore * 0.3 + consistencyScore * 0.2);
      return { ...p, successRate: Math.round(successRate), performanceScore: score };
    });

    res.json(scored);
  });

  // -----------------------------------------------------------------------
  // Proxies
  // -----------------------------------------------------------------------
  router.get('/proxies', (req, res) => {
    res.json(proxyManager.getAll());
  });

  router.post('/proxies/check', async (req, res) => {
    try {
      const results = await proxyManager.healthCheckAll();
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/proxies/:host/check', async (req, res) => {
    const proxy = proxyManager.proxies.find((p) => p.host === req.params.host);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    const result = await proxyManager.healthCheck(proxy);
    res.json(result);
  });

  router.patch('/proxies/:host/toggle', (req, res) => {
    const proxy = proxyManager.toggleProxy(req.params.host, req.body?.enabled);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ success: true, proxy: proxyManager.getAll().find((p) => p.host === req.params.host) });
  });

  router.post('/proxies', (req, res) => {
    const proxy = proxyManager.addProxy(req.body || {});
    if (!proxy) return res.status(409).json({ error: 'Proxy already exists' });
    res.json({ success: true, proxy });
  });

  router.delete('/proxies/:host', (req, res) => {
    const ok = proxyManager.removeProxy(req.params.host);
    if (!ok) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Proxy Evaluator — quality assessment
  // -----------------------------------------------------------------------
  router.get('/proxy-evaluator/results', (req, res) => {
    if (!proxyEvaluator) return res.json({ enabled: false });
    const results = Array.from(proxyEvaluator.results.values());
    res.json({ enabled: true, count: results.length, results });
  });

  router.get('/proxy-evaluator/summary', (req, res) => {
    if (!proxyEvaluator) return res.json({ enabled: false });
    res.json({ enabled: true, summary: proxyEvaluator.getSummary() });
  });

  router.get('/proxy-evaluator/best', (req, res) => {
    if (!proxyEvaluator) return res.json({ enabled: false });
    const dimension = req.query.dimension || 'overallScore';
    const best = proxyEvaluator.getBestProxyByDimension(dimension);
    res.json({ enabled: true, best });
  });

  router.post('/proxy-evaluator/evaluate', async (req, res) => {
    if (!proxyEvaluator) return res.status(404).json({ error: 'Proxy evaluator not available' });
    try {
      const { host } = req.body || {};
      if (host) {
        const proxy = proxyManager.proxies.find((p) => p.host === host);
        if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
        const result = await proxyEvaluator.evaluateProxy(proxy);
        res.json({ success: true, result });
      } else {
        const results = await proxyEvaluator.evaluateAll();
        res.json({ success: true, count: results.length, results });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Evaluate the whole pool at once (client: evaluateProxies()).
  router.post('/proxy-evaluator/evaluate-all', async (req, res) => {
    if (!proxyEvaluator) return res.status(404).json({ error: 'Proxy evaluator not available' });
    try {
      const results = await proxyEvaluator.evaluateAll();
      res.json({ success: true, count: results.length, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/proxy-evaluator/stats', (req, res) => {
    if (!proxyEvaluator) return res.json({ enabled: false });
    res.json({
      enabled: true,
      count: proxyEvaluator.results?.size || 0,
      summary: proxyEvaluator.getSummary(),
    });
  });

  router.get('/proxy-evaluator/recommend', (req, res) => {
    if (!proxyEvaluator) return res.json({ enabled: false, recommendations: [] });
    const strategy = req.query.strategy || 'overallScore';
    const results = Array.from(proxyEvaluator.results?.values?.() || []);
    const rank = (r) => (typeof r?.[strategy] === 'number' ? r[strategy] : r?.overallScore ?? 0);
    const recommendations = [...results].sort((a, b) => rank(b) - rank(a)).slice(0, 10);
    res.json({
      enabled: true,
      strategy,
      best: proxyEvaluator.getBestProxyByDimension(strategy),
      recommendations,
    });
  });

  // -----------------------------------------------------------------------
  // Proxy Strategies — advanced selection
  // -----------------------------------------------------------------------
  router.get('/proxy-strategies', (req, res) => {
    if (!proxyStrategies) return res.json({ enabled: false });
    res.json({ enabled: true, strategies: proxyStrategies.getAvailableStrategies() });
  });

  router.post('/proxy-strategies/select', (req, res) => {
    if (!proxyStrategies) return res.status(404).json({ error: 'Proxy strategies not available' });
    const { strategy } = req.body || {};
    const proxy = proxyStrategies.select(strategy || 'best-first');
    if (!proxy) return res.status(404).json({ error: 'No proxy available' });
    res.json({ success: true, strategy: strategy || 'best-first', proxy: { host: proxy.host, port: proxy.port, country: proxy.country, city: proxy.city, flag: proxy.flag } });
  });

  router.get('/proxy-strategies/stats', (req, res) => {
    if (!proxyStrategies) return res.json({ enabled: false });
    const now = Date.now();
    const inCooldown = [...proxyStrategies.cooldownUntil.values()].filter((t) => t > now).length;
    res.json({
      enabled: true,
      defaultStrategy: proxyStrategies.config?.defaultStrategy,
      fallbackStrategy: proxyStrategies.config?.fallbackStrategy,
      maxConsecutiveUses: proxyStrategies.config?.maxConsecutiveUses,
      trackedProxies: proxyStrategies.usageCounts.size,
      inCooldown,
      strategies: proxyStrategies.getAvailableStrategies(),
    });
  });

  // -----------------------------------------------------------------------
  // Proxy Integrations — multi-source proxy fetching
  // -----------------------------------------------------------------------
  router.get('/proxy-integrations', (req, res) => {
    const results = Array.from(proxyEvaluator?.results.values() || []);
    res.json({
      enabled: true,
      providers: getAvailableProviders(),
      evaluated: results.length,
      history: results.slice(-20).reverse(),
    });
  });

  router.get('/proxy-integrations/providers', (req, res) => {
    res.json({ providers: getAvailableProviders() });
  });

  router.post('/proxy-integrations/fetch', async (req, res) => {
    try {
      const { provider, apiUrl, username, password } = req.body || {};
      if (!provider || !apiUrl) {
        return res.status(400).json({ error: 'Provider and API URL required' });
      }

      const credentials = { username, password };
      const proxies = await fetchProxiesFromProvider(provider, apiUrl, credentials);

      if (proxies.length === 0) {
        return res.status(404).json({ error: 'No proxies found' });
      }

      // Add proxies to the manager
      const added = [];
      for (const p of proxies) {
        const result = proxyManager.addProxy(p);
        if (result) added.push(result);
      }

      logger.info(`📡 Fetched ${added.length} proxies from ${provider} (${proxies.length} total parsed)`);
      res.json({ success: true, added: added.length, total: proxies.length, proxies: added });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/proxy-integrations/fetch-and-evaluate', async (req, res) => {
    try {
      const { provider, apiUrl, username, password } = req.body || {};
      if (!provider || !apiUrl) {
        return res.status(400).json({ error: 'Provider and API URL required' });
      }

      const credentials = { username, password };
      const proxies = await fetchProxiesFromProvider(provider, apiUrl, credentials);

      if (proxies.length === 0) {
        return res.status(404).json({ error: 'No proxies found' });
      }

      // Add proxies
      const added = [];
      for (const p of proxies) {
        const result = proxyManager.addProxy(p);
        if (result) added.push(result);
      }

      // Evaluate the new proxies
      const evaluations = await proxyEvaluator.evaluateAll();

      logger.info(`📡 Fetched ${added.length} proxies from ${provider} and evaluated ${evaluations.length}`);
      res.json({ success: true, added: added.length, evaluated: evaluations.length, evaluations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // Proxy Preferences — user-configurable proxy settings
  // -----------------------------------------------------------------------
  router.get('/proxy-preferences', (req, res) => {
    if (!proxyStrategies) return res.json({ enabled: false });
    const strategies = proxyStrategies.getAvailableStrategies();
    const evaluatorResults = proxyEvaluator ? Array.from(proxyEvaluator.results.values()) : [];

    // Sort proxies by evaluation score
    const sortedProxies = proxyManager.getAll().map(p => {
      const result = evaluatorResults.find(r => r.proxyId === `${p.host}:${p.port}`);
      return { ...p, score: result?.overallScore || 0, grade: result?.grade || 'F' };
    }).sort((a, b) => b.score - a.score);

    res.json({
      enabled: true,
      strategies,
      sortedProxies,
      summary: proxyEvaluator?.getSummary(),
    });
  });

  router.post('/proxy-preferences/apply', (req, res) => {
    if (!proxyStrategies) return res.status(404).json({ error: 'Proxy strategies not available' });
    const { strategy } = req.body || {};
    const proxy = proxyStrategies.select(strategy || 'best-first');
    if (!proxy) return res.status(404).json({ error: 'No proxy available' });
    res.json({ success: true, strategy: strategy || 'best-first', proxy: { host: proxy.host, port: proxy.port, country: proxy.country, city: proxy.city, flag: proxy.flag } });
  });

  // -----------------------------------------------------------------------
  // Quick Webshare fetch — uses default download URL
  // -----------------------------------------------------------------------
  router.post('/proxy-integrations/quick-fetch-webshare', async (req, res) => {
    try {
      if (!proxyEvaluator) return res.status(404).json({ error: 'Proxy evaluator not available' });
      const { username, password } = req.body || {};
      const credentials = { username, password };
      const entry = await proxyEvaluator.constructor; // placeholder
      // Use proxyIntegrations if available, otherwise use fetchProxiesFromProvider directly
      const proxies = await fetchProxiesFromProvider('webshare', null, credentials);

      if (proxies.length === 0) {
        return res.status(404).json({ error: 'No proxies found' });
      }

      const added = [];
      for (const p of proxies) {
        const result = proxyManager.addProxy(p);
        if (result) added.push(result);
      }

      const evaluations = await proxyEvaluator.evaluateAll();
      res.json({ success: true, added: added.length, total: proxies.length, evaluated: evaluations.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // Proxy Integrations — history and webshare URL
  // -----------------------------------------------------------------------
  router.get('/proxy-integrations/history', (req, res) => {
    // Return recent fetch history from evaluator results
    const results = Array.from(proxyEvaluator?.results.values() || []);
    res.json({ history: results.slice(-20).reverse() });
  });

  router.get('/proxy-integrations/webshare-url', (req, res) => {
    res.json({
      url: 'https://proxy.webshare.io/api/v2/proxy/list/download/ekschevofwhleyrtfngyavtlqgfmrshvrzutugpd/-/any/username/direct/-/?plan_id=14716067',
      description: 'Webshare proxy list download URL. Paste this in the fetch dialog.'
    });
  });

  // -----------------------------------------------------------------------
  // URLs
  // -----------------------------------------------------------------------
  router.get('/urls', (req, res) => {
    res.json(urlManager.getAll());
  });

  router.post('/urls', (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL required' });
    const entry = urlManager.addUrl(url);
    if (!entry) return res.status(409).json({ error: 'URL already exists' });
    res.json({ success: true, url: entry });
  });

  router.delete('/urls', (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL required' });
    const ok = urlManager.removeUrl(url);
    if (!ok) return res.status(404).json({ error: 'URL not found' });
    res.json({ success: true });
  });

  router.patch('/urls/priority', (req, res) => {
    const { url, priority } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL required' });
    urlManager.setPriority(url, Math.max(1, Math.min(10, parseInt(priority, 10) || 5)));
    res.json({ success: true });
  });

  router.patch('/urls/toggle', (req, res) => {
    const { url, enabled } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL required' });
    urlManager.toggleUrl(url, enabled);
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------
  router.get('/config', (req, res) => {
    res.json(scheduler.config);
  });

  router.patch('/config', (req, res) => {
    scheduler.updateConfig(req.body || {});
    res.json({ success: true, config: scheduler.config });
  });

  // -----------------------------------------------------------------------
  // Session simulation & bounce rate control
  // -----------------------------------------------------------------------
  router.get('/session/stats', (req, res) => {
    if (!sessionManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...sessionManager.getStats() });
  });

  router.patch('/session/config', (req, res) => {
    if (!sessionManager) return res.status(404).json({ error: 'Session manager not available' });
    sessionManager.updateConfig(req.body || {});
    // Also propagate session mode flag to the engine + scheduler
    if (req.body?.enabled !== undefined) {
      scheduler.engine.configure({ sessionMode: !!req.body.enabled });
    }
    res.json({ success: true, config: sessionManager.config, sessionMode: scheduler.engine.config.sessionMode });
  });

  router.get('/session/profiles', async (req, res) => {
    if (!profileManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...(await profileManager.getStats()) });
  });

  // -----------------------------------------------------------------------
  // Manual session trigger (dashboard "Run Session" button)
  // -----------------------------------------------------------------------
  router.post('/session/manual', async (req, res) => {
    try {
      const result = await scheduler.engine.executeSession({});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // UTM parameters & campaign tracking (F2.7)
  // -----------------------------------------------------------------------
  router.get('/utm/campaigns', (req, res) => {
    if (!utmManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...utmManager.getStats(), campaigns: utmManager.getCampaigns() });
  });

  router.post('/utm/campaigns', (req, res) => {
    if (!utmManager) return res.status(404).json({ error: 'UTM manager not available' });
    const campaign = utmManager.addCampaign(req.body || {});
    if (!campaign) return res.status(400).json({ error: 'Invalid campaign (require source + medium)' });
    res.json({ success: true, campaign });
  });

  router.delete('/utm/campaigns', (req, res) => {
    if (!utmManager) return res.status(404).json({ error: 'UTM manager not available' });
    const { source, medium } = req.body || {};
    if (!source || !medium) return res.status(400).json({ error: 'source and medium required' });
    const removed = utmManager.removeCampaign(source, medium);
    if (!removed) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true, removed });
  });

  // -----------------------------------------------------------------------
  // Device & platform distribution (F2.6)
  // -----------------------------------------------------------------------
  router.get('/device/stats', (req, res) => {
    if (!deviceManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...deviceManager.getStats() });
  });

  router.patch('/device/config', (req, res) => {
    if (!deviceManager) return res.status(404).json({ error: 'Device manager not available' });
    deviceManager.updateConfig(req.body || {});
    res.json({ success: true, config: deviceManager.getStats() });
  });

  // -----------------------------------------------------------------------
  // Organic search simulation (F2.1)
  // -----------------------------------------------------------------------
  router.get('/search/stats', (req, res) => {
    if (!searchSimulator) return res.json({ enabled: false });
    res.json({ enabled: true, ...searchSimulator.getStats(), keywords: searchSimulator.getKeywords() });
  });

  router.post('/search/keywords', (req, res) => {
    if (!searchSimulator) return res.status(404).json({ error: 'Search simulator not available' });
    const { keyword } = req.body || {};
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    searchSimulator.addKeyword(keyword);
    res.json({ success: true, keyword });
  });

  router.delete('/search/keywords', (req, res) => {
    if (!searchSimulator) return res.status(404).json({ error: 'Search simulator not available' });
    const { keyword } = req.body || {};
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    searchSimulator.removeKeyword(keyword);
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Captcha solving (F2.9)
  // -----------------------------------------------------------------------
  router.get('/captcha/stats', (req, res) => {
    if (!captchaSolver) return res.json({ enabled: false });
    res.json({ enabled: true, ...captchaSolver.getStats() });
  });

  router.patch('/captcha/config', (req, res) => {
    if (!captchaSolver) return res.status(404).json({ error: 'Captcha solver not available' });
    captchaSolver.updateConfig(req.body || {});
    res.json({ success: true, ...captchaSolver.getStats() });
  });

  // -----------------------------------------------------------------------
  // Sprint 2 combined stats (dashboard uses this for the new panel)
  // -----------------------------------------------------------------------
  router.get('/sprint2/overview', (req, res) => {
    res.json({
      utm: utmManager ? utmManager.getStats() : { enabled: false },
      device: deviceManager ? deviceManager.getStats() : { enabled: false },
      search: searchSimulator ? searchSimulator.getStats() : { enabled: false },
      captcha: captchaSolver ? captchaSolver.getStats() : { enabled: false },
      social: socialReferral ? socialReferral.getStats() : { enabled: false },
      geo: geoManager ? geoManager.getStats() : { enabled: false },
      analytics: analyticsManager ? analyticsManager.getStats() : { enabled: false },
      traffic: trafficPatterns ? trafficPatterns.getStats() : { enabled: false },
    });
  });

  // -----------------------------------------------------------------------
  // Social referral simulation (F2.2)
  // -----------------------------------------------------------------------
  router.get('/social/stats', (req, res) => {
    if (!socialReferral) return res.json({ enabled: false });
    res.json({ enabled: true, ...socialReferral.getStats(), platforms: socialReferral.getPlatforms() });
  });

  router.patch('/social/config', (req, res) => {
    if (!socialReferral) return res.status(404).json({ error: 'Social referral not available' });
    socialReferral.updateConfig(req.body || {});
    res.json({ success: true, ...socialReferral.getStats() });
  });

  // -----------------------------------------------------------------------
  // Geographic distribution control (F2.5)
  // -----------------------------------------------------------------------
  router.get('/geo/stats', (req, res) => {
    if (!geoManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...geoManager.getStats() });
  });

  router.patch('/geo/config', (req, res) => {
    if (!geoManager) return res.status(404).json({ error: 'Geo manager not available' });
    geoManager.updateConfig(req.body || {});
    res.json({ success: true, ...geoManager.getStats() });
  });

  router.patch('/geo/weights', (req, res) => {
    if (!geoManager) return res.status(404).json({ error: 'Geo manager not available' });
    const { weights } = req.body || {};
    if (!weights) return res.status(400).json({ error: 'weights object required' });
    geoManager.updateCountryWeights(weights);
    res.json({ success: true, ...geoManager.getStats() });
  });

  // -----------------------------------------------------------------------
  // Analytics compatibility (F2.8)
  // -----------------------------------------------------------------------
  router.get('/analytics/stats', (req, res) => {
    if (!analyticsManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...analyticsManager.getStats() });
  });

  router.patch('/analytics/config', (req, res) => {
    if (!analyticsManager) return res.status(404).json({ error: 'Analytics manager not available' });
    analyticsManager.updateConfig(req.body || {});
    res.json({ success: true, ...analyticsManager.getStats() });
  });

  // -----------------------------------------------------------------------
  // Traffic pattern templates (F2.10)
  // -----------------------------------------------------------------------
  router.get('/traffic/stats', (req, res) => {
    if (!trafficPatterns) return res.json({ enabled: false });
    res.json({ enabled: true, ...trafficPatterns.getStats() });
  });

  router.get('/traffic/schedule', (req, res) => {
    if (!trafficPatterns) return res.json({ enabled: false });
    res.json({ enabled: true, schedule: trafficPatterns.getSchedule() });
  });

  router.patch('/traffic/config', (req, res) => {
    if (!trafficPatterns) return res.status(404).json({ error: 'Traffic patterns not available' });
    trafficPatterns.updateConfig(req.body || {});
    res.json({ success: true, ...trafficPatterns.getStats() });
  });

  router.post('/traffic/rampup', (req, res) => {
    if (!trafficPatterns) return res.status(404).json({ error: 'Traffic patterns not available' });
    const { days, type } = req.body || {};
    trafficPatterns.startRampUp(parseInt(days, 10) || 7, type);
    res.json({ success: true, ...trafficPatterns.getStats() });
  });

  router.post('/traffic/stop-rampup', (req, res) => {
    if (!trafficPatterns) return res.status(404).json({ error: 'Traffic patterns not available' });
    trafficPatterns.stopRampUp();
    res.json({ success: true, ...trafficPatterns.getStats() });
  });

  // -----------------------------------------------------------------------
  // Logs (read recent file lines)
  // -----------------------------------------------------------------------
  router.get('/logs', (req, res) => {
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit || '100', 10)));
    const level = req.query.level;
    try {
      const logFile = path.join(__dirname, '..', 'logs', 'combined.log');
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      let filtered = lines;
      if (level) {
        filtered = lines.filter((l) => l.toLowerCase().includes(String(level).toLowerCase()));
      }
      res.json({ logs: filtered.slice(-limit).reverse(), total: filtered.length });
    } catch (err) {
      res.json({ logs: [], total: 0, error: 'Log file not available yet' });
    }
  });

  // -----------------------------------------------------------------------
  // Database maintenance
  // -----------------------------------------------------------------------
  router.post('/db/cleanup', (req, res) => {
    const days = Math.max(1, Math.min(3650, parseInt(req.body?.days || '30', 10)));
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const result = db
      .prepare('DELETE FROM visits WHERE created_at < ?')
      .run(cutoff);
    db.exec('VACUUM');
    logger.info(`DB cleanup: deleted ${result.changes} visits older than ${days} days`);
    res.json({ success: true, deleted: result.changes });
  });

  // -----------------------------------------------------------------------
  // One-off manual visit (used by dashboard "Visit Now" button)
  // -----------------------------------------------------------------------
  router.post('/visit/manual', async (req, res) => {
    try {
      const result = await scheduler.engine.executeVisit({});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // Webhooks & integrations (F3.8)
  // -----------------------------------------------------------------------
  router.get('/webhooks/stats', (req, res) => {
    if (!webhookManager) return res.json({ enabled: false });
    res.json({ enabled: true, ...webhookManager.getStats() });
  });

  router.get('/webhooks', (req, res) => {
    if (!webhookManager) return res.json({ enabled: false });
    res.json({ enabled: true, hooks: webhookManager.getWebhooks(), channels: webhookManager.getNotificationChannels() });
  });

  router.post('/webhooks', (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const hook = webhookManager.addWebhook(req.body || {});
    if (!hook) return res.status(400).json({ error: 'URL required' });
    res.json({ success: true, hook });
  });

  router.delete('/webhooks/:id', (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const removed = webhookManager.removeWebhook(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ success: true });
  });

  router.patch('/webhooks/:id/toggle', (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const hook = webhookManager.toggleWebhook(req.params.id, req.body?.enabled);
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ success: true, hook });
  });

  router.post('/webhooks/test', async (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const { url, headers = {} } = req.body || {};
    const hook = webhookManager.addWebhook({ url, events: ['test'], headers });
    const result = await webhookManager.testWebhook(hook);
    webhookManager.removeWebhook(hook.id);
    res.json(result);
  });

  router.post('/webhooks/channels', (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const channel = webhookManager.addNotificationChannel(req.body || {});
    if (!channel) return res.status(400).json({ error: 'Invalid channel' });
    res.json({ success: true, channel });
  });

  router.delete('/webhooks/channels/:id', (req, res) => {
    if (!webhookManager) return res.status(404).json({ error: 'Webhook manager not available' });
    const removed = webhookManager.removeNotificationChannel(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Channel not found' });
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Reporting engine (F3.8)
  // -----------------------------------------------------------------------
  router.get('/reporting/stats', (req, res) => {
    if (!reportingEngine) return res.json({ enabled: false });
    res.json({ enabled: true, ...reportingEngine.getStats() });
  });

  router.get('/reporting/schedules', (req, res) => {
    if (!reportingEngine) return res.json({ enabled: false });
    res.json({ enabled: true, schedules: reportingEngine.listSchedules() });
  });

  router.post('/reporting/generate', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const { type = 'daily', format = 'html' } = req.body || {};
    if (format === 'csv') {
      const csv = reportingEngine.exportVisitsCSV(type === 'daily' ? 1 : type === 'weekly' ? 7 : 30);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="visits-${type}-${Date.now()}.csv"`);
      return res.send(csv);
    }
    const result = reportingEngine.generateHTMLReport(type);
    res.json({ success: true, ...result });
  });

  router.post('/reporting/generate-json', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const { type = 'daily' } = req.body || {};
    const result = reportingEngine.generateJSONReport(type);
    res.json({ success: true, ...result });
  });

  router.post('/reporting/generate-markdown', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const { type = 'daily' } = req.body || {};
    const result = reportingEngine.generateMarkdownReport(type);
    res.json({ success: true, ...result });
  });

  router.get('/reporting/summaries', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const limit = parseInt(req.query.limit) || 20;
    res.json({ enabled: true, summaries: reportingEngine.getReportSummaries(limit) });
  });

  router.post('/reporting/schedules', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const schedule = reportingEngine.addSchedule(req.body || {});
    res.json({ success: true, schedule });
  });

  router.delete('/reporting/schedules/:id', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const removed = reportingEngine.removeSchedule(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // CSV export (F3.8)
  // -----------------------------------------------------------------------
  router.get('/export/visits.csv', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const days = Math.min(3650, Math.max(1, parseInt(req.query.days || '30', 10)));
    const csv = reportingEngine.exportVisitsCSV(days);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="visits-last-${days}d.csv"`);
    res.send(csv);
  });

  router.get('/export/proxies.csv', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const csv = reportingEngine.exportProxiesCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="proxies.csv"');
    res.send(csv);
  });

  router.get('/export/urls.csv', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const csv = reportingEngine.exportUrlsCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="urls.csv"');
    res.send(csv);
  });

  // -----------------------------------------------------------------------
  // Content verification (F3.3)
  // -----------------------------------------------------------------------
  router.get('/content-verification/stats', (req, res) => {
    if (!contentVerifier) return res.json({ enabled: false });
    res.json({ enabled: true, ...contentVerifier.getStats() });
  });

  router.patch('/content-verification/config', (req, res) => {
    if (!contentVerifier) return res.status(404).json({ error: 'Content verifier not available' });
    contentVerifier.updateConfig(req.body || {});
    res.json({ success: true, ...contentVerifier.getStats() });
  });

  // -----------------------------------------------------------------------
  // Proxy intelligence layer (F3.5)
  // -----------------------------------------------------------------------
  router.get('/proxy-intelligence/stats', (req, res) => {
    if (!proxyIntelligence) return res.json({ enabled: false });
    res.json({ enabled: true, config: proxyIntelligence.getConfig() });
  });

  router.get('/proxy-intelligence/proxies', (req, res) => {
    if (!proxyIntelligence) return res.json({ enabled: false });
    res.json({ enabled: true, proxies: proxyIntelligence.getStats() });
  });

  router.post('/proxy-intelligence/blacklist', (req, res) => {
    if (!proxyIntelligence) return res.status(404).json({ error: 'Proxy intelligence not available' });
    const { host, reason } = req.body || {};
    if (!host) return res.status(400).json({ error: 'host required' });
    proxyIntelligence.autoBlacklist(host, reason || 'manual');
    res.json({ success: true });
  });

  router.post('/proxy-intelligence/clear-blacklist', (req, res) => {
    if (!proxyIntelligence) return res.status(404).json({ error: 'Proxy intelligence not available' });
    const { host } = req.body || {};
    if (!host) return res.status(400).json({ error: 'host required' });
    proxyIntelligence.clearBlacklist(host);
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // A/B testing (F3.2)
  // -----------------------------------------------------------------------
  router.get('/ab-testing/stats', (req, res) => {
    if (!abTesting) return res.json({ enabled: false });
    res.json({ enabled: true, ...abTesting.getStats() });
  });

  router.get('/ab-testing/tests', (req, res) => {
    if (!abTesting) return res.json({ enabled: false });
    res.json({ enabled: true, tests: abTesting.getStats().tests });
  });

  router.post('/ab-testing/tests', (req, res) => {
    if (!abTesting) return res.status(404).json({ error: 'A/B testing not available' });
    const test = abTesting.createTest(req.body || {});
    if (!test) return res.status(400).json({ error: 'Invalid test (require name + variants)' });
    res.json({ success: true, test });
  });

  router.delete('/ab-testing/tests/:id', (req, res) => {
    if (!abTesting) return res.status(404).json({ error: 'A/B testing not available' });
    const removed = abTesting.removeTest(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Test not found' });
    res.json({ success: true });
  });

  router.post('/ab-testing/tests/:id/toggle', (req, res) => {
    if (!abTesting) return res.status(404).json({ error: 'A/B testing not available' });
    const test = abTesting.toggleTest(req.params.id, req.body?.enabled);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json({ success: true, test });
  });

  // -----------------------------------------------------------------------
  // Ad viewability (F3.1)
  // -----------------------------------------------------------------------
  router.get('/ad-viewability/stats', (req, res) => {
    if (!adViewability) return res.json({ enabled: false });
    res.json({ enabled: true, ...adViewability.getStats() });
  });

  router.patch('/ad-viewability/config', (req, res) => {
    if (!adViewability) return res.status(404).json({ error: 'Ad viewability not available' });
    adViewability.updateConfig(req.body || {});
    res.json({ success: true, ...adViewability.getStats() });
  });

  // -----------------------------------------------------------------------
  // Screenshot system (F3.4)
  // -----------------------------------------------------------------------
  router.get('/screenshots/stats', (req, res) => {
    if (!screenshotSystem) return res.json({ enabled: false });
    res.json({ enabled: true, ...screenshotSystem.getStats() });
  });

  router.get('/screenshots/gallery', (req, res) => {
    if (!screenshotSystem) return res.json({ enabled: false });
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '20', 10)));
    res.json({ enabled: true, screenshots: screenshotSystem.getGallery(limit) });
  });

  router.get('/screenshots/:id', (req, res) => {
    if (!screenshotSystem) return res.status(404).json({ error: 'Screenshot system not available' });
    const shot = screenshotSystem.getById(req.params.id);
    if (!shot) return res.status(404).json({ error: 'Screenshot not found' });
    res.json(shot);
  });

  router.post('/screenshots/compare', (req, res) => {
    if (!screenshotSystem) return res.status(404).json({ error: 'Screenshot system not available' });
    const { id1, id2 } = req.body || {};
    if (!id1 || !id2) return res.status(400).json({ error: 'id1 and id2 required' });
    res.json(screenshotSystem.compare(id1, id2));
  });

  // -----------------------------------------------------------------------
  // Multi-project (F3.7)
  // -----------------------------------------------------------------------
  router.get('/multi-project/stats', (req, res) => {
    if (!multiProject) return res.json({ enabled: false });
    res.json({ enabled: true, ...multiProject.getStats() });
  });

  router.post('/multi-project/projects', (req, res) => {
    if (!multiProject) return res.status(404).json({ error: 'Multi-project not available' });
    const project = multiProject.createProject(req.body || {});
    if (!project) return res.status(400).json({ error: 'Invalid project (require name + urls)' });
    res.json({ success: true, project });
  });

  router.delete('/multi-project/projects/:id', (req, res) => {
    if (!multiProject) return res.status(404).json({ error: 'Multi-project not available' });
    const removed = multiProject.removeProject(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  });

  router.patch('/multi-project/projects/:id', (req, res) => {
    if (!multiProject) return res.status(404).json({ error: 'Multi-project not available' });
    const updated = multiProject.updateProject(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, project: updated });
  });

  // -----------------------------------------------------------------------
  // Distributed workers (F3.10)
  // -----------------------------------------------------------------------
  router.get('/distributed-workers/stats', (req, res) => {
    if (!distributedWorkers) return res.json({ enabled: false });
    res.json({ enabled: true, ...distributedWorkers.getStats() });
  });

  router.post('/distributed-workers/register', (req, res) => {
    if (!distributedWorkers) return res.status(404).json({ error: 'Distributed workers not available' });
    const worker = distributedWorkers.registerWorker(req.body || {});
    if (!worker) return res.status(400).json({ error: 'Invalid worker (require host + port)' });
    res.json({ success: true, worker });
  });

  router.post('/distributed-workers/:id/heartbeat', (req, res) => {
    if (!distributedWorkers) return res.status(404).json({ error: 'Distributed workers not available' });
    const worker = distributedWorkers.heartbeat(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ success: true, worker });
  });

  router.delete('/distributed-workers/:id', (req, res) => {
    if (!distributedWorkers) return res.status(404).json({ error: 'Distributed workers not available' });
    const removed = distributedWorkers.removeWorker(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Worker not found' });
    res.json({ success: true });
  });

  router.patch('/distributed-workers/config', (req, res) => {
    if (!distributedWorkers) return res.status(404).json({ error: 'Distributed workers not available' });
    distributedWorkers.updateConfig(req.body || {});
    res.json({ success: true, ...distributedWorkers.getStats() });
  });

  // -----------------------------------------------------------------------
  // Network conditions (F3.9)
  // -----------------------------------------------------------------------
  router.get('/network-condition/stats', (req, res) => {
    if (!networkCondition) return res.json({ enabled: false });
    res.json({ enabled: true, ...networkCondition.getStats() });
  });

  router.patch('/network-condition/config', (req, res) => {
    if (!networkCondition) return res.status(404).json({ error: 'Network condition not available' });
    networkCondition.updateConfig(req.body || {});
    res.json({ success: true, ...networkCondition.getStats() });
  });

  router.post('/network-condition/url', (req, res) => {
    if (!networkCondition) return res.status(404).json({ error: 'Network condition not available' });
    const { url, connectionType } = req.body || {};
    if (!url || !connectionType) return res.status(400).json({ error: 'url and connectionType required' });
    networkCondition.setConnectionForUrl(url, connectionType);
    res.json({ success: true });
  });

  router.delete('/network-condition/url', (req, res) => {
    if (!networkCondition) return res.status(404).json({ error: 'Network condition not available' });
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const removed = networkCondition.removeUrlCondition(url);
    if (!removed) return res.status(404).json({ error: 'URL condition not found' });
    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Tier 4 — Advanced Features
  // -----------------------------------------------------------------------

  // F4.1 ML Behavior Model
  router.get('/ml-behavior/stats', (req, res) => {
    if (!mlBehavior) return res.json({ enabled: false });
    res.json({ enabled: true, ...mlBehavior.getStats() });
  });

  router.get('/ml-behavior/profiles', (req, res) => {
    if (!mlBehavior) return res.json({ enabled: false });
    res.json({ enabled: true, profiles: mlBehavior.getStats().profileNames });
  });

  // F4.2 Detection Feedback Loop
  router.get('/detection-feedback/stats', (req, res) => {
    if (!detectionFeedback) return res.json({ enabled: false });
    res.json({ enabled: true, ...detectionFeedback.getStats() });
  });

  router.post('/detection-feedback/signal', (req, res) => {
    if (!detectionFeedback) return res.status(404).json({ error: 'Detection feedback not available' });
    const { signal, proxyHost } = req.body || {};
    const result = detectionFeedback.recordSignal(signal || 'unknown', { proxyHost });
    res.json({ success: true, ...result });
  });

  router.post('/detection-feedback/reset', (req, res) => {
    if (!detectionFeedback) return res.status(404).json({ error: 'Detection feedback not available' });
    detectionFeedback.reset();
    res.json({ success: true });
  });

  // F4.3 Video/Media Interaction
  router.get('/video-media/stats', (req, res) => {
    if (!videoMedia) return res.json({ enabled: false });
    res.json({ enabled: true, ...videoMedia.getStats() });
  });

  router.patch('/video-media/config', (req, res) => {
    if (!videoMedia) return res.status(404).json({ error: 'Video/media not available' });
    videoMedia.updateConfig(req.body || {});
    res.json({ success: true, ...videoMedia.getStats() });
  });

  // F4.4 E-commerce Funnel
  router.get('/ecommerce-funnel/stats', (req, res) => {
    if (!ecommerceFunnel) return res.json({ enabled: false });
    res.json({ enabled: true, ...ecommerceFunnel.getStats() });
  });

  router.patch('/ecommerce-funnel/config', (req, res) => {
    if (!ecommerceFunnel) return res.status(404).json({ error: 'E-commerce funnel not available' });
    ecommerceFunnel.updateConfig(req.body || {});
    res.json({ success: true, ...ecommerceFunnel.getStats() });
  });

  // F4.5 Form Interaction
  router.get('/form-interaction/stats', (req, res) => {
    if (!formInteraction) return res.json({ enabled: false });
    res.json({ enabled: true, ...formInteraction.getStats() });
  });

  router.patch('/form-interaction/config', (req, res) => {
    if (!formInteraction) return res.status(404).json({ error: 'Form interaction not available' });
    formInteraction.updateConfig(req.body || {});
    res.json({ success: true, ...formInteraction.getStats() });
  });

  // F4.6 Cookie Consent/GDPR
  router.get('/cookie-consent/stats', (req, res) => {
    if (!cookieConsent) return res.json({ enabled: false });
    res.json({ enabled: true, ...cookieConsent.getStats() });
  });

  router.patch('/cookie-consent/config', (req, res) => {
    if (!cookieConsent) return res.status(404).json({ error: 'Cookie consent not available' });
    cookieConsent.updateConfig(req.body || {});
    res.json({ success: true, ...cookieConsent.getStats() });
  });

  // F4.7 DNS-Level Simulation
  router.get('/dns-simulation/stats', (req, res) => {
    if (!dnsSimulation) return res.json({ enabled: false });
    res.json({ enabled: true, ...dnsSimulation.getStats() });
  });

  router.patch('/dns-simulation/config', (req, res) => {
    if (!dnsSimulation) return res.status(404).json({ error: 'DNS simulation not available' });
    dnsSimulation.updateConfig(req.body || {});
    res.json({ success: true, ...dnsSimulation.getStats() });
  });

  // F4.8 CDN/Edge Awareness
  router.get('/cdn-edge/stats', (req, res) => {
    if (!cdnEdge) return res.json({ enabled: false });
    res.json({ enabled: true, ...cdnEdge.getStats() });
  });

  router.post('/cdn-edge/detect', (req, res) => {
    if (!cdnEdge) return res.status(404).json({ error: 'CDN/Edge not available' });
    const { headers } = req.body || {};
    const result = cdnEdge.detectFromHeaders(headers || {});
    res.json({ success: true, ...result });
  });

  router.patch('/cdn-edge/config', (req, res) => {
    if (!cdnEdge) return res.status(404).json({ error: 'CDN/Edge not available' });
    cdnEdge.updateConfig(req.body || {});
    res.json({ success: true, ...cdnEdge.getStats() });
  });

  // F4.9 API/AJAX Simulation
  router.get('/api-ajax/stats', (req, res) => {
    if (!apiAjax) return res.json({ enabled: false });
    res.json({ enabled: true, ...apiAjax.getStats() });
  });

  router.patch('/api-ajax/config', (req, res) => {
    if (!apiAjax) return res.status(404).json({ error: 'API/AJAX not available' });
    apiAjax.updateConfig(req.body || {});
    res.json({ success: true, ...apiAjax.getStats() });
  });

  // F4.10 Competitor Analysis
  router.get('/competitor-analysis/stats', (req, res) => {
    if (!competitorAnalysis) return res.json({ enabled: false });
    res.json({ enabled: true, ...competitorAnalysis.getStats() });
  });

  router.get('/competitor-analysis/competitors', (req, res) => {
    if (!competitorAnalysis) return res.json({ enabled: false });
    res.json({ enabled: true, competitors: competitorAnalysis.getCompetitors() });
  });

  router.post('/competitor-analysis/compare', (req, res) => {
    if (!competitorAnalysis) return res.status(404).json({ error: 'Competitor analysis not available' });
    const features = req.body?.features || {
      browserEngine: 10, fingerprint: 9, behavior: 9, session: 9, analytics: 9,
      trafficSources: 10, proxyIntel: 10, reporting: 8, scalability: 7, ecosystem: 5,
    };
    res.json({ success: true, ...competitorAnalysis.compare(features) });
  });

  // -----------------------------------------------------------------------
  // Tier 5 — Ecosystem Features
  // -----------------------------------------------------------------------

  // F5.1 Multi-Platform Sync
  router.get('/multi-platform-sync/stats', (req, res) => {
    if (!multiPlatformSync) return res.json({ enabled: false });
    res.json({ enabled: true, ...multiPlatformSync.getStats() });
  });

  router.post('/multi-platform-sync/connect', async (req, res) => {
    if (!multiPlatformSync) return res.status(404).json({ error: 'Cloud sync not available' });
    const result = await multiPlatformSync.connect();
    res.json({ success: true, ...result });
  });

  router.post('/multi-platform-sync/disconnect', (req, res) => {
    if (!multiPlatformSync) return res.status(404).json({ error: 'Cloud sync not available' });
    const result = multiPlatformSync.disconnect();
    res.json({ success: true, ...result });
  });

  router.post('/multi-platform-sync/flush', async (req, res) => {
    if (!multiPlatformSync) return res.status(404).json({ error: 'Cloud sync not available' });
    const result = await multiPlatformSync.flushQueue();
    res.json({ success: true, ...result });
  });

  router.post('/multi-platform-sync/accounts', (req, res) => {
    if (!multiPlatformSync) return res.status(404).json({ error: 'Cloud sync not available' });
    const { email, role } = req.body || {};
    const account = multiPlatformSync.registerAccount({ email, role });
    if (!account) return res.status(400).json({ error: 'Invalid account (require email)' });
    res.json({ success: true, account });
  });

  // F5.2 Plugin/Extension System
  router.get('/plugin-system/stats', (req, res) => {
    if (!pluginSystem) return res.json({ enabled: false });
    res.json({ enabled: true, ...pluginSystem.getStats() });
  });

  router.get('/plugin-system/marketplace', (req, res) => {
    if (!pluginSystem) return res.json({ enabled: false });
    res.json({ enabled: true, marketplace: pluginSystem.getMarketplace() });
  });

  router.post('/plugin-system/install', (req, res) => {
    if (!pluginSystem) return res.status(404).json({ error: 'Plugin system not available' });
    const plugin = pluginSystem.installPlugin(req.body || {});
    if (!plugin) return res.status(400).json({ error: 'Invalid plugin or plugin already exists' });
    res.json({ success: true, plugin });
  });

  router.delete('/plugin-system/:id', (req, res) => {
    if (!pluginSystem) return res.status(404).json({ error: 'Plugin system not available' });
    const removed = pluginSystem.uninstallPlugin(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Plugin not found' });
    res.json({ success: true });
  });

  router.patch('/plugin-system/:id/toggle', (req, res) => {
    if (!pluginSystem) return res.status(404).json({ error: 'Plugin system not available' });
    const plugin = pluginSystem.togglePlugin(req.params.id, req.body?.enabled);
    if (!plugin) return res.status(404).json({ error: 'Plugin not found' });
    res.json({ success: true, plugin });
  });

  router.patch('/plugin-system/:id/config', (req, res) => {
    if (!pluginSystem) return res.status(404).json({ error: 'Plugin system not available' });
    const plugin = pluginSystem.updatePluginConfig(req.params.id, req.body || {});
    if (!plugin) return res.status(404).json({ error: 'Plugin not found' });
    res.json({ success: true, plugin });
  });

  // F5.3 CLI Tool
  router.get('/cli-tool/stats', (req, res) => {
    if (!cliTool) return res.json({ enabled: false });
    res.json({ enabled: true, ...cliTool.getStats() });
  });

  router.post('/cli-tool/execute', async (req, res) => {
    if (!cliTool) return res.status(404).json({ error: 'CLI tool not available' });
    const { command, args } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command required' });
    try {
      const result = await cliTool.execute(command, args || []);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // F5.4 Desktop App
  router.get('/desktop-app/stats', (req, res) => {
    if (!desktopApp) return res.json({ enabled: false });
    res.json({ enabled: true, ...desktopApp.getStats() });
  });

  router.post('/desktop-app/window/create', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    res.json({ success: true, ...desktopApp.createWindow() });
  });

  router.post('/desktop-app/window/minimize', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    res.json({ success: true, ...desktopApp.minimize() });
  });

  router.post('/desktop-app/window/maximize', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    res.json({ success: true, ...desktopApp.maximize() });
  });

  router.post('/desktop-app/window/close', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    res.json({ success: true, ...desktopApp.close() });
  });

  router.post('/desktop-app/notification', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    const { title, body } = req.body || {};
    const result = desktopApp.sendNotification(title, body);
    res.json({ success: true, ...result });
  });

  router.post('/desktop-app/auto-start', (req, res) => {
    if (!desktopApp) return res.status(404).json({ error: 'Desktop app not available' });
    res.json({ success: true, ...desktopApp.registerAutoStart() });
  });

  // F5.5 Reporting Engine — PDF generation
  router.post('/reporting/generate-pdf', (req, res) => {
    if (!reportingEngine) return res.status(404).json({ error: 'Reporting engine not available' });
    const { type = 'daily' } = req.body || {};
    const result = reportingEngine.generatePDFReport(type);
    res.json({ success: true, ...result });
  });

  // -----------------------------------------------------------------------
  // AI Integration — Ollama (free, local AI)
  // -----------------------------------------------------------------------
  router.get('/ai/status', async (req, res) => {
    if (!aiIntegration) return res.json({ enabled: false });
    const available = await aiIntegration.checkAvailable();
    res.json({ enabled: true, available, ...aiIntegration.getStatus() });
  });

  router.get('/ai/models', async (req, res) => {
    if (!aiIntegration) return res.json({ enabled: false });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available' });
    res.json({ models: aiIntegration.models });
  });

  router.post('/ai/analyze-proxies', async (req, res) => {
    if (!aiIntegration) return res.status(404).json({ error: 'AI integration not available' });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available. Install Ollama: https://ollama.com' });

    try {
      const proxyResults = Array.from(proxyEvaluator?.results.values() || []);
      if (proxyResults.length === 0) {
        return res.status(400).json({ error: 'No proxy evaluation results. Run evaluation first.' });
      }
      const analysis = await aiIntegration.analyzeProxies(proxyResults);
      res.json({ success: true, analysis });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai/recommend-proxy', async (req, res) => {
    if (!aiIntegration) return res.status(404).json({ error: 'AI integration not available' });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available' });

    try {
      const { strategy } = req.body || {};
      const proxyResults = Array.from(proxyEvaluator?.results.values() || []);
      if (proxyResults.length === 0) {
        return res.status(400).json({ error: 'No proxy evaluation results' });
      }
      const recommendation = await aiIntegration.recommendProxy(proxyResults, strategy || 'best-first');
      res.json({ success: true, recommendation });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai/generate-report', async (req, res) => {
    if (!aiIntegration) return res.status(404).json({ error: 'AI integration not available' });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available' });

    try {
      const stats = {
        totalVisits: scheduler?.state?.visitCount || 0,
        successRate: scheduler?.state?.successRate || 0,
        proxyStats: proxyManager?.getStats(),
      };
      const summary = await aiIntegration.generateReportSummary(stats);
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai/analyze-content', async (req, res) => {
    if (!aiIntegration) return res.status(404).json({ error: 'AI integration not available' });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available' });

    try {
      const { url, content } = req.body || {};
      if (!url || !content) return res.status(400).json({ error: 'URL and content required' });
      const analysis = await aiIntegration.analyzeContent(content, url);
      res.json({ success: true, analysis });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai/recommend-behavior', async (req, res) => {
    if (!aiIntegration) return res.status(404).json({ error: 'AI integration not available' });
    const available = await aiIntegration.checkAvailable();
    if (!available) return res.status(503).json({ error: 'Ollama not available' });

    try {
      const { pageContext } = req.body || {};
      if (!pageContext) return res.status(400).json({ error: 'Page context required' });
      const recommendation = await aiIntegration.recommendBehavior(pageContext);
      res.json({ success: true, recommendation });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // AI Behavior Director — plans HOW each visit behaves (persona, dwell,
  // scroll, hover, click intent). Providers: omniroute | ollama | openai
  // model gateways, with a deterministic heuristic fallback.
  // -----------------------------------------------------------------------
  router.get('/ai/director/status', (req, res) => {
    if (!behaviorDirector) return res.status(404).json({ error: 'Behavior director not wired' });
    res.json(behaviorDirector.getStatus());
  });

  router.post('/ai/director/recheck', async (req, res) => {
    if (!behaviorDirector) return res.status(404).json({ error: 'Behavior director not wired' });
    res.json(await behaviorDirector.recheck());
  });

  // Preview the plan a given URL/visitor would get (no visit made)
  router.post('/ai/director/plan', async (req, res) => {
    if (!behaviorDirector) return res.status(404).json({ error: 'Behavior director not wired' });
    try {
      const { url, seed, profile, pageStats } = req.body || {};
      if (!url) return res.status(400).json({ error: 'url required' });
      const plan = await behaviorDirector.buildPlan({
        url, seed: seed || Date.now().toString(), profile: profile || null, pageStats: pageStats || {},
      });
      res.json({ success: true, plan });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // Free proxy aggregation (GitHub sources: proxifly, TheSpeedX, monosans,
  // clarketm) — merges credential-less free proxies next to the paid pool.
  // -----------------------------------------------------------------------
  router.post('/proxies/free/refresh', async (req, res) => {
    if (!freeProxyFetcher) return res.status(404).json({ error: 'Free proxy fetcher not wired' });
    try {
      const report = await freeProxyFetcher.refreshAndApply();
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/proxies/free/stats', (req, res) => {
    if (!freeProxyFetcher) return res.status(404).json({ error: 'Free proxy fetcher not wired' });
    res.json(freeProxyFetcher.getStats());
  });

  router.put('/proxies/free/config', (req, res) => {
    if (!freeProxyFetcher) return res.status(404).json({ error: 'Free proxy fetcher not wired' });
    freeProxyFetcher.updateConfig(req.body || {});
    res.json({ success: true, stats: freeProxyFetcher.getStats() });
  });

  // Paid vs free composition snapshot
  router.get('/proxies/sources', (req, res) => {
    const stats = freeProxyFetcher ? freeProxyFetcher.getStats() : { enabled: false };
    res.json({
      ...stats,
      paid: (proxyManager?.getAll() || []).filter((p) => (p.source || 'webshare-legacy') !== 'free').length,
      free: (proxyManager?.getAll() || []).filter((p) => (p.source || 'webshare-legacy') === 'free').length,
    });
  });

  // -----------------------------------------------------------------------
  // Wizard / Setup API — for easy configuration
  // -----------------------------------------------------------------------
  router.get('/wizard/status', (req, res) => {
    const status = {
      server: {
        port: process.env.PORT || 3001,
        mode: scheduler?.state?.state || 'stopped',
        uptime: process.uptime(),
      },
      proxies: {
        total: proxyManager?.getStats()?.total || 0,
        enabled: proxyManager?.getStats()?.enabled || 0,
        healthy: proxyManager?.getStats()?.healthy || 0,
        countries: proxyManager?.getStats()?.countries || 0,
      },
      evaluator: {
        enabled: !!proxyEvaluator,
        evaluated: proxyEvaluator?.results?.size || 0,
        summary: proxyEvaluator?.getSummary(),
      },
      strategies: {
        enabled: !!proxyStrategies,
        available: proxyStrategies?.getAvailableStrategies()?.length || 0,
      },
      ai: {
        enabled: aiIntegration?.config?.enabled || false,
        available: false, // checked on demand
      },
      integrations: {
        providers: getAvailableProviders(),
        webshareUrl: 'https://proxy.webshare.io/api/v2/proxy/list/download/ekschevofwhleyrtfngyavtlqgfmrshvrzutugpd/-/any/username/direct/-/?plan_id=14716067',
      },
    };
    res.json(status);
  });

  router.post('/wizard/setup', async (req, res) => {
    try {
      const { action } = req.body || {};

      switch (action) {
        case 'fetch-webshare': {
          const { username, password } = req.body || {};
          const proxies = await fetchProxiesFromProvider('webshare', null, { username, password });
          const added = [];
          for (const p of proxies) {
            const result = proxyManager.addProxy(p);
            if (result) added.push(result);
          }
          return res.json({ success: true, added: added.length, total: proxies.length });
        }

        case 'evaluate-proxies': {
          if (!proxyEvaluator) return res.status(404).json({ error: 'Evaluator not available' });
          const results = await proxyEvaluator.evaluateAll();
          return res.json({ success: true, evaluated: results.length, results });
        }

        case 'set-strategy': {
          if (!proxyStrategies) return res.status(404).json({ error: 'Strategies not available' });
          const { strategy } = req.body || {};
          const proxy = proxyStrategies.select(strategy || 'best-first');
          if (!proxy) return res.status(404).json({ error: 'No proxy available' });
          return res.json({ success: true, strategy, proxy: { host: proxy.host, port: proxy.port, country: proxy.country, city: proxy.city, flag: proxy.flag } });
        }

        case 'check-ai': {
          if (!aiIntegration) return res.json({ enabled: false });
          const available = await aiIntegration.checkAvailable();
          return res.json({ success: true, available, models: aiIntegration.models });
        }

        default:
          return res.status(400).json({ error: 'Unknown action' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // Proxy health monitoring
  // -----------------------------------------------------------------------
  if (proxyHealthMonitor) {
    // Get health summary
    router.get('/proxy-health/summary', (req, res) => {
      res.json(proxyHealthMonitor.getSummary());
    });

    // Get health stats for all proxies
    router.get('/proxy-health/stats', (req, res) => {
      const stats = proxyHealthMonitor.getAllStats();
      res.json({ total: stats.length, stats });
    });

    // Get health stats for a specific proxy
    router.get('/proxy-health/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const proxy = { host, port: parseInt(port) };
      const stats = proxyHealthMonitor.getStats(proxy);
      if (!stats) return res.status(404).json({ error: 'Proxy not registered' });
      res.json(stats);
    });

    // Record a check result
    router.post('/proxy-health/record', (req, res) => {
      const { host, port, success, latency, error } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      const proxy = { host, port: parseInt(port) };
      const stats = proxyHealthMonitor.recordCheck(proxy, { success, latency, error });
      if (!stats) return res.status(404).json({ error: 'Proxy not registered' });
      res.json({ success: true, stats });
    });

    // Get unhealthy proxies
    router.get('/proxy-health/unhealthy', (req, res) => {
      const unhealthy = proxyHealthMonitor.getUnhealthyProxies();
      res.json({ total: unhealthy.length, proxies: unhealthy });
    });

    // Get healthy proxies
    router.get('/proxy-health/healthy', (req, res) => {
      const healthy = proxyHealthMonitor.getHealthyProxies();
      res.json({ total: healthy.length, proxies: healthy });
    });

    // Clear cooldown for a proxy
    router.post('/proxy-health/clear-cooldown', (req, res) => {
      const { host, port } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      const proxy = { host, port: parseInt(port) };
      proxyHealthMonitor.clearCooldown(proxy);
      res.json({ success: true });
    });

    // Cleanup expired cooldowns
    router.post('/proxy-health/cleanup', (req, res) => {
      proxyHealthMonitor.cleanupExpiredCooldowns();
      res.json({ success: true });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy rotation scheduler
  // -----------------------------------------------------------------------
  if (proxyRotationScheduler) {
    // Get rotation stats
    router.get('/proxy-rotation/stats', (req, res) => {
      res.json(proxyRotationScheduler.getStats());
    });

    // Get rotation history
    router.get('/proxy-rotation/history', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      res.json({ history: proxyRotationScheduler.getHistory(limit) });
    });

    // Force rotation
    router.post('/proxy-rotation/rotate', (req, res) => {
      const reason = req.body?.reason || 'manual';
      const rotation = proxyRotationScheduler.rotate(reason);
      if (!rotation) return res.status(400).json({ error: 'Rotation rate-limited or not enough proxies' });
      res.json({ success: true, rotation });
    });

    // Start rotation
    router.post('/proxy-rotation/start', (req, res) => {
      const proxies = proxyManager ? proxyManager.getAll() : [];
      if (proxies.length < 2) return res.status(400).json({ error: 'Need at least 2 proxies' });
      proxyRotationScheduler.start(proxies, {
        onRotation: (rotation) => logger.info(`Proxy rotation: ${rotation.reason} ${rotation.from?.host} -> ${rotation.to?.host}`),
      });
      res.json({ success: true, active: true });
    });

    // Stop rotation
    router.post('/proxy-rotation/stop', (req, res) => {
      proxyRotationScheduler.stop();
      res.json({ success: true, active: false });
    });

    // Get current proxy
    router.get('/proxy-rotation/current', (req, res) => {
      const current = proxyRotationScheduler.getCurrent();
      if (!current) return res.status(404).json({ error: 'No current proxy' });
      res.json({ host: current.host, port: current.port, country: current.country, city: current.city, flag: current.flag });
    });

    // Check if proxy should be rotated
    router.post('/proxy-rotation/check', (req, res) => {
      const { host, port, success, latency } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      const result = { success, latency };
      const shouldRotate = proxyRotationScheduler.shouldRotate({ host, port }, result);
      res.json({ shouldRotate });
    });
  }

  // -----------------------------------------------------------------------
  // Smart retry logic
  // -----------------------------------------------------------------------
  if (smartRetry) {
    // Get retry stats
    router.get('/smart-retry/stats', (req, res) => {
      res.json(smartRetry.getStats());
    });

    // Get retry history
    router.get('/smart-retry/history', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      res.json({ history: smartRetry.getHistory(limit) });
    });

    // Reset retry stats
    router.post('/smart-retry/reset', (req, res) => {
      smartRetry.reset();
      res.json({ success: true });
    });

    // Check if result should be retried
    router.post('/smart-retry/check', (req, res) => {
      const { success, statusCode, error } = req.body || {};
      const attempt = req.body?.attempt || 0;
      const shouldRetry = smartRetry.shouldRetry({ success, statusCode, error }, attempt);
      const delay = smartRetry.getRetryDelay(attempt);
      res.json({ shouldRetry, retryDelay: shouldRetry ? delay : 0 });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy geo restrictions
  // -----------------------------------------------------------------------
  if (geoRestrictions) {
    // Get config and stats
    router.get('/proxy-geo/config', (req, res) => {
      res.json(geoRestrictions.getConfig());
    });

    // Get summary
    router.get('/proxy-geo/summary', (req, res) => {
      res.json(geoRestrictions.getSummary());
    });

    // Update config
    router.patch('/proxy-geo/config', (req, res) => {
      geoRestrictions.updateConfig(req.body || {});
      res.json({ success: true, config: geoRestrictions.getConfig() });
    });

    // Record usage
    router.post('/proxy-geo/record', (req, res) => {
      const { country } = req.body || {};
      if (!country) return res.status(400).json({ error: 'country required' });
      geoRestrictions.recordUsage(country);
      res.json({ success: true });
    });

    // Check if country is allowed
    router.get('/proxy-geo/check/:country', (req, res) => {
      const { country } = req.params;
      res.json({
        allowed: geoRestrictions.isAllowed(country),
        preferred: geoRestrictions.isPreferred(country),
      });
    });

    // Reset usage stats
    router.post('/proxy-geo/reset', (req, res) => {
      geoRestrictions.reset();
      res.json({ success: true });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy performance tracker
  // -----------------------------------------------------------------------
  if (proxyPerformanceTracker) {
    // Get summary
    router.get('/proxy-performance/summary', (req, res) => {
      res.json(proxyPerformanceTracker.getSummary());
    });

    // Get all metrics
    router.get('/proxy-performance/metrics', (req, res) => {
      const metrics = proxyPerformanceTracker.getAllMetrics();
      res.json({ total: metrics.length, metrics });
    });

    // Get metrics for a specific proxy
    router.get('/proxy-performance/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const proxy = { host, port: parseInt(port) };
      const metrics = proxyPerformanceTracker.getMetrics(proxy);
      if (!metrics) return res.status(404).json({ error: 'Proxy not tracked' });
      res.json(metrics);
    });

    // Get rankings
    router.get('/proxy-performance/rankings/:limit', (req, res) => {
      const limit = parseInt(req.params.limit) || 10;
      res.json(proxyPerformanceTracker.getRankings(limit));
    });

    // Get latency trend
    router.get('/proxy-performance/:host/:port/trend', (req, res) => {
      const { host, port } = req.params;
      const window = parseInt(req.query.window) || 50;
      const proxy = { host, port: parseInt(port) };
      const trend = proxyPerformanceTracker.getLatencyTrend(proxy, window);
      if (!trend) return res.status(404).json({ error: 'No trend data' });
      res.json(trend);
    });

    // Record a visit result
    router.post('/proxy-performance/record', (req, res) => {
      const { host, port, success, latency, error } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      const proxy = { host, port: parseInt(port) };
      const metrics = proxyPerformanceTracker.record(proxy, { success, latency, error });
      res.json({ success: true, metrics });
    });

    // Reset metrics for a proxy
    router.post('/proxy-performance/reset', (req, res) => {
      const { host, port } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      proxyPerformanceTracker.reset({ host, port: parseInt(port) });
      res.json({ success: true });
    });

    // Clear all metrics
    router.post('/proxy-performance/clear', (req, res) => {
      proxyPerformanceTracker.clearAll();
      res.json({ success: true });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy intelligence analyzer
  // -----------------------------------------------------------------------
  if (proxyIntelligenceAnalyzer) {
    // Get summary
    router.get('/proxy-intel/summary', (req, res) => {
      res.json(proxyIntelligenceAnalyzer.getSummary());
    });

    // Get patterns for a proxy
    router.get('/proxy-intel/patterns/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const proxy = { host, port: parseInt(port) };
      const patterns = proxyIntelligenceAnalyzer.getPatterns(proxy);
      if (!patterns) return res.status(404).json({ error: 'No patterns for this proxy' });
      res.json(patterns);
    });

    // Get all patterns
    router.get('/proxy-intel/patterns', (req, res) => {
      res.json({ patterns: proxyIntelligenceAnalyzer.getAllPatterns() });
    });

    // Get anomalies
    router.get('/proxy-intel/anomalies', (req, res) => {
      const limit = parseInt(req.query.limit) || 20;
      res.json({ anomalies: proxyIntelligenceAnalyzer.getAnomalies(limit) });
    });

    // Get predictions
    router.get('/proxy-intel/predict/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const future = parseInt(req.query.future) || 100;
      const proxy = { host, port: parseInt(port) };
      const prediction = proxyIntelligenceAnalyzer.predict(proxy, future);
      if (!prediction) return res.status(400).json({ error: 'Not enough data for prediction' });
      res.json(prediction);
    });

    // Get optimization suggestions
    router.get('/proxy-intel/suggestions/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const proxy = { host, port: parseInt(port) };
      res.json({ suggestions: proxyIntelligenceAnalyzer.getSuggestions(proxy) });
    });

    // Record a visit
    router.post('/proxy-intel/record', (req, res) => {
      const { host, port, url, success, latency } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      const proxy = { host, port: parseInt(port) };
      const patterns = proxyIntelligenceAnalyzer.recordVisit(proxy, { url, success, latency });
      res.json({ success: true, patterns });
    });

    // Reset all data
    router.post('/proxy-intel/reset', (req, res) => {
      proxyIntelligenceAnalyzer.reset();
      res.json({ success: true });
    });
  }

  // -----------------------------------------------------------------------
  // Notification manager
  // -----------------------------------------------------------------------
  if (notificationManager) {
    // Get recent notifications
    router.get('/notifications/recent', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const event = req.query.event || null;
      res.json({ notifications: notificationManager.getRecent(limit, event) });
    });

    // Get unread notifications
    router.get('/notifications/unread', (req, res) => {
      const since = parseInt(req.query.since) || 0;
      res.json({ notifications: notificationManager.getUnread(since) });
    });

    // Get stats
    router.get('/notifications/stats', (req, res) => {
      res.json(notificationManager.getStats());
    });

    // Get available events
    router.get('/notifications/events', (req, res) => {
      res.json({ events: notificationManager.getEvents() });
    });

    // Send a notification
    router.post('/notifications/send', (req, res) => {
      const { event, message, level, source, suppressKey, metadata } = req.body || {};
      if (!event || !message) return res.status(400).json({ error: 'event and message required' });
      const notification = notificationManager.send(event, message, { level, source, suppressKey, metadata });
      if (!notification) return res.status(409).json({ error: 'Notification suppressed (duplicate)' });
      res.json({ success: true, notification });
    });

    // Clear notifications
    router.delete('/notifications', (req, res) => {
      const event = req.query.event || null;
      notificationManager.clear(event);
      res.json({ success: true });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy auto-refresh
  // -----------------------------------------------------------------------
  if (proxyAutoRefresh) {
    // Get stats
    router.get('/proxy-auto-refresh/stats', (req, res) => {
      res.json(proxyAutoRefresh.getStats());
    });

    // Get refresh history
    router.get('/proxy-auto-refresh/history', (req, res) => {
      const limit = parseInt(req.query.limit) || 20;
      res.json({ history: proxyAutoRefresh.getHistory(limit) });
    });

    // Force refresh
    router.post('/proxy-auto-refresh/refresh', async (req, res) => {
      try {
        const result = await proxyAutoRefresh.refresh();
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Start auto-refresh
    router.post('/proxy-auto-refresh/start', (req, res) => {
      proxyAutoRefresh.start();
      res.json({ success: true, active: true });
    });

    // Stop auto-refresh
    router.post('/proxy-auto-refresh/stop', (req, res) => {
      proxyAutoRefresh.stop();
      res.json({ success: true, active: false });
    });

    // Update config
    router.patch('/proxy-auto-refresh/config', (req, res) => {
      proxyAutoRefresh.updateConfig(req.body || {});
      res.json({ success: true, config: proxyAutoRefresh.getStats() });
    });
  }

  // -----------------------------------------------------------------------
  // Proxy pool manager
  // -----------------------------------------------------------------------
  if (proxyPoolManager) {
    // Get pool summary
    router.get('/proxy-pool/summary', (req, res) => {
      res.json(proxyPoolManager.getSummary());
    });

    // Get pool stats
    router.get('/proxy-pool/stats', (req, res) => {
      res.json(proxyPoolManager.getPoolStats());
    });

    // Get pool health report
    router.get('/proxy-pool/health-report', (req, res) => {
      res.json(proxyPoolManager.getHealthReport());
    });

    // Get all proxies in pool
    router.get('/proxy-pool/proxies', (req, res) => {
      res.json({ proxies: proxyPoolManager.getAll() });
    });

    // Get healthy proxies
    router.get('/proxy-pool/healthy', (req, res) => {
      res.json({ proxies: proxyPoolManager.getHealthyProxies() });
    });

    // Select a proxy
    router.post('/proxy-pool/select', (req, res) => {
      const strategy = req.body?.strategy || undefined;
      const proxy = proxyPoolManager.select(strategy);
      if (!proxy) return res.status(404).json({ error: 'No proxy available' });
      res.json({
        success: true,
        proxy: { host: proxy.host, port: proxy.port, country: proxy.country, city: proxy.city, flag: proxy.flag },
      });
    });

    // Record a visit result
    router.post('/proxy-pool/record', (req, res) => {
      const { host, port, success, latency, error, url } = req.body || {};
      if (!host || !port) return res.status(400).json({ error: 'host and port required' });
      proxyPoolManager.recordResult({ host, port: parseInt(port) }, { success, latency, error, url });
      res.json({ success: true });
    });

    // Get proxy details
    router.get('/proxy-pool/:host/:port', (req, res) => {
      const { host, port } = req.params;
      const details = proxyPoolManager.getProxyDetails({ host, port: parseInt(port) });
      if (!details) return res.status(404).json({ error: 'Proxy not in pool' });
      res.json(details);
    });

    // Update pool config
    router.patch('/proxy-pool/config', (req, res) => {
      proxyPoolManager.updateConfig(req.body || {});
      res.json({ success: true, config: proxyPoolManager.getSummary() });
    });
  }

  // -----------------------------------------------------------------------
  // Periodic health checker
  // -----------------------------------------------------------------------
  if (periodicHealthChecker) {
    // Get stats
    router.get('/health-checker/stats', (req, res) => {
      res.json(periodicHealthChecker.getStats());
    });

    // Get results
    router.get('/health-checker/results', (req, res) => {
      const limit = parseInt(req.query.limit) || 20;
      res.json({ results: periodicHealthChecker.getResults(limit) });
    });

    // Start checking
    router.post('/health-checker/start', (req, res) => {
      periodicHealthChecker.start();
      res.json({ success: true, active: true });
    });

    // Stop checking
    router.post('/health-checker/stop', (req, res) => {
      periodicHealthChecker.stop();
      res.json({ success: true, active: false });
    });

    // Update config
    router.patch('/health-checker/config', (req, res) => {
      periodicHealthChecker.updateConfig(req.body || {});
      res.json({ success: true, config: periodicHealthChecker.getStats() });
    });
  }

  return router;
}
