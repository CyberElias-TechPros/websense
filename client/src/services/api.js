import axios from 'axios';

// In dev, Vite proxies /api + /socket.io to the backend. In production the
// client is served by the backend (same origin), so relative URLs work.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Optional API token when the backend runs with API_TOKEN set.
// Build-time: VITE_API_TOKEN; runtime fallback: localStorage websense_api_token.
const getApiToken = () =>
  import.meta.env.VITE_API_TOKEN || localStorage.getItem('websense_api_token') || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token to every request when one is configured
api.interceptors.request.use((config) => {
  const token = getApiToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// -------------------------------------------------------------------------
// Engine
// -------------------------------------------------------------------------
export const startEngine = (strategy = 'random') => api.post('/engine/start', { strategy });
export const stopEngine = () => api.post('/engine/stop');
export const pauseEngine = () => api.post('/engine/pause');
export const resumeEngine = () => api.post('/engine/resume');
export const getEngineStatus = () => api.get('/engine/status');
export const manualVisit = () => api.post('/visit/manual');

// -------------------------------------------------------------------------
// Stats & analytics
// -------------------------------------------------------------------------
export const getOverview = () => api.get('/stats/overview');
export const getTimeline = (hours = 24) => api.get('/analytics/timeline', { params: { hours } });
export const getByUrl = () => api.get('/analytics/by-url');
export const getByProxy = () => api.get('/analytics/by-proxy');
export const getByCountry = () => api.get('/analytics/by-country');
export const getDashboard = (days) => api.get('/analytics/dashboard', { params: { days } });
export const getHourlyPattern = (days) => api.get('/analytics/hourly-pattern', { params: { days } });
export const getProxyComparison = (days) => api.get('/analytics/proxy-comparison', { params: { days } });

// -------------------------------------------------------------------------
// Visits
// -------------------------------------------------------------------------
export const getVisits = (params) => api.get('/visits', { params });
export const getRecentVisits = (limit = 20) => api.get('/visits/recent', { params: { limit } });

// -------------------------------------------------------------------------
// Proxies
// -------------------------------------------------------------------------
export const getProxies = () => api.get('/proxies');
export const checkAllProxies = () => api.post('/proxies/check');
export const checkProxy = (host) => api.post(`/proxies/${host}/check`);
export const toggleProxy = (host, enabled) => api.patch(`/proxies/${host}/toggle`, { enabled });
export const addProxy = (proxy) => api.post('/proxies', proxy);
export const removeProxy = (host) => api.delete(`/proxies/${host}`);

// -------------------------------------------------------------------------
// URLs
// -------------------------------------------------------------------------
export const getUrls = () => api.get('/urls');
export const addUrl = (url) => api.post('/urls', { url });
export const removeUrl = (url) => api.delete('/urls', { data: { url } });
export const setUrlPriority = (url, priority) => api.patch('/urls/priority', { url, priority });
export const toggleUrl = (url, enabled) => api.patch('/urls/toggle', { url, enabled });

// -------------------------------------------------------------------------
// Config & maintenance
// -------------------------------------------------------------------------
export const getConfig = () => api.get('/config');
export const updateConfig = (config) => api.patch('/config', config);
export const cleanupDb = (days) => api.post('/db/cleanup', { days });
export const getLogs = (params) => api.get('/logs', { params });

// -------------------------------------------------------------------------
// Wizard — guided setup
// -------------------------------------------------------------------------
export const getWizardStatus = () => api.get('/wizard/status');
export const wizardSetup = (action, data = {}) => api.post('/wizard/setup', { action, ...data });

// -------------------------------------------------------------------------
// Proxy integrations
// -------------------------------------------------------------------------
export const getProxyIntegrations = () => api.get('/proxy-integrations');
export const fetchProxyIntegration = (provider, apiUrl) => api.post('/proxy-integrations/fetch', { provider, apiUrl });
export const quickFetchWebshare = (apiUrl) => api.post('/proxy-integrations/quick-fetch-webshare', { apiUrl });
export const getProxyIntegrationsHistory = () => api.get('/proxy-integrations/history');
export const getWebshareDownloadUrl = () => api.get('/proxy-integrations/webshare-url');

// -------------------------------------------------------------------------
// Proxy evaluator
// -------------------------------------------------------------------------
export const evaluateProxies = () => api.post('/proxy-evaluator/evaluate-all');
export const evaluateProxy = (host, port) => api.post('/proxy-evaluator/evaluate', { host, port });
export const getProxyRecommendations = (strategy) => api.get('/proxy-evaluator/recommend', { params: { strategy } });
export const getProxyEvaluationStats = () => api.get('/proxy-evaluator/stats');

// -------------------------------------------------------------------------
// Proxy strategies
// -------------------------------------------------------------------------
export const getProxyStrategies = () => api.get('/proxy-strategies');
export const selectProxyStrategy = (strategy) => api.post('/proxy-strategies/select', { strategy });
export const getProxyStrategyStats = () => api.get('/proxy-strategies/stats');

// -------------------------------------------------------------------------
// Proxy health
// -------------------------------------------------------------------------
export const getProxyHealthSummary = () => api.get('/proxy-health/summary');
export const getProxyHealthStats = () => api.get('/proxy-health/stats');
export const getUnhealthyProxies = () => api.get('/proxy-health/unhealthy');
export const getHealthyProxies = () => api.get('/proxy-health/healthy');
export const recordProxyHealth = (host, port, success, latency, error) => api.post('/proxy-health/record', { host, port, success, latency, error });

// -------------------------------------------------------------------------
// Proxy rotation
// -------------------------------------------------------------------------
export const getRotationStats = () => api.get('/proxy-rotation/stats');
export const forceRotate = (reason) => api.post('/proxy-rotation/rotate', { reason });
export const startRotation = () => api.post('/proxy-rotation/start');
export const stopRotation = () => api.post('/proxy-rotation/stop');
export const getRotationHistory = (limit) => api.get('/proxy-rotation/history', { params: { limit } });

// -------------------------------------------------------------------------
// AI integration
// -------------------------------------------------------------------------
export const getAIStatus = () => api.get('/ai/status');
export const getAIModels = () => api.get('/ai/models');
export const analyzeProxiesAI = (criteria) => api.post('/ai/analyze-proxies', { criteria });
export const recommendProxyAI = (requirements) => api.post('/ai/recommend-proxy', { requirements });
export const generateReportAI = (params) => api.post('/ai/generate-report', params);

// -------------------------------------------------------------------------
// Proxy performance
// -------------------------------------------------------------------------
export const getProxyPerformanceSummary = () => api.get('/proxy-performance/summary');
export const getProxyPerformanceMetrics = () => api.get('/proxy-performance/metrics');
export const getProxyPerformanceRankings = (limit = 10) => api.get(`/proxy-performance/rankings/${limit}`);

// -------------------------------------------------------------------------
// Proxy pool
// -------------------------------------------------------------------------
export const getPoolSummary = () => api.get('/proxy-pool/summary');
export const getPoolHealthReport = () => api.get('/proxy-pool/health-report');
export const selectProxy = (strategy) => api.post('/proxy-pool/select', { strategy });
export const recordPoolResult = (host, port, success, latency, error, url) => api.post('/proxy-pool/record', { host, port, success, latency, error, url });

// -------------------------------------------------------------------------
// Proxy intelligence
// -------------------------------------------------------------------------
export const getIntelSummary = () => api.get('/proxy-intel/summary');
export const getIntelAnomalies = (limit = 20) => api.get('/proxy-intel/anomalies', { params: { limit } });

// -------------------------------------------------------------------------
// Auto-refresh
// -------------------------------------------------------------------------
export const getAutoRefreshStats = () => api.get('/proxy-auto-refresh/stats');
export const forceRefresh = () => api.post('/proxy-auto-refresh/refresh');

// -------------------------------------------------------------------------
// Notifications
// -------------------------------------------------------------------------
export const getRecentNotifications = (limit = 50) => api.get('/notifications/recent', { params: { limit } });
export const getNotificationStats = () => api.get('/notifications/stats');

// -------------------------------------------------------------------------
// Health checker
// -------------------------------------------------------------------------
export const getHealthCheckerStats = () => api.get('/health-checker/stats');
export const getHealthCheckerResults = (limit) => api.get('/health-checker/results', { params: { limit } });
export const startHealthChecker = () => api.post('/health-checker/start');
export const stopHealthChecker = () => api.post('/health-checker/stop');

// -------------------------------------------------------------------------
// AI behavior director (OmniRoute / Ollama / heuristic)
// -------------------------------------------------------------------------
export const getAIDirectorStatus = () => api.get('/ai/director/status');
export const recheckAIDirector = () => api.post('/ai/director/recheck');
export const previewAIDirectorPlan = (payload) => api.post('/ai/director/plan', payload);

// -------------------------------------------------------------------------
// Free proxy pool (GitHub sources next to paid Webshare)
// -------------------------------------------------------------------------
export const getFreeProxyStats = () => api.get('/proxies/free/stats');
export const refreshFreeProxies = () => api.post('/proxies/free/refresh');
export const updateFreeProxyConfig = (conf) => api.put('/proxies/free/config', conf);
export const getProxySources = () => api.get('/proxies/sources');

// -------------------------------------------------------------------------
// Observability — metrics & alerts
// -------------------------------------------------------------------------
export const getMetrics = () => api.get('/metrics');
export const getAlerts = () => api.get('/alerts');
export const ackAlert = (id) => api.post(`/alerts/${id}/ack`);

// -------------------------------------------------------------------------
// Domain rules — opt-outs, per-domain rate limits, robots.txt
// -------------------------------------------------------------------------
export const getDomainRules = () => api.get('/domain-rules');
export const updateDomainRules = (patch) => api.patch('/domain-rules', patch);
export const setDomainRule = (domain, rule) => api.put(`/domain-rules/${encodeURIComponent(domain)}`, rule);
export const addDomainOptOut = (domain) => api.post('/domain-rules/opt-out', { domain });
export const removeDomainOptOut = (domain) => api.delete(`/domain-rules/opt-out/${encodeURIComponent(domain)}`);
export const refreshRobots = (domain) => api.post(`/domain-rules/${encodeURIComponent(domain)}/robots/refresh`);
export const checkDomainRule = (domain, url) => api.get(`/domain-rules/${encodeURIComponent(domain)}/check`, { params: { url } });

export default api;
