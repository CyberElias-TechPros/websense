// ============================================================================
// default.js — Central configuration.
// Every module reads from here. Environment variables override defaults.
// Credentials NEVER live in code: proxies.* come from env (see .env.example).
// ============================================================================

export default {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    // Comma-separated allowed origins for CORS (dashboard origin, dev server, etc.)
    corsOrigins: (process.env.CORS_ORIGINS || '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
    },
  },

  // -------------------------------------------------------------------------
  // Proxy credentials: ENV ONLY — never hardcoded in source (secrets hygiene).
  // Set PROXY_USERNAME / PROXY_PASSWORD in server/.env (see .env.example).
  // -------------------------------------------------------------------------
  proxyAuth: {
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || '',
  },

  // -------------------------------------------------------------------------
  // Visit engine behaviour.
  // -------------------------------------------------------------------------
  engine: {
    minInterval: parseInt(process.env.MIN_INTERVAL_MS || '5000', 10),
    maxInterval: parseInt(process.env.MAX_INTERVAL_MS || '30000', 10),
    concurrency: parseInt(process.env.CONCURRENCY || '3', 10),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '2', 10),
    retryBackoffBase: parseInt(process.env.RETRY_BACKOFF_BASE_MS || '500', 10),
    mode: process.env.VISIT_MODE || 'http', // http | browser | mixed
    headless: process.env.HEADLESS !== '0', // HEADLESS=0 → visible browser window
    autoStart: process.env.AUTO_START === '1',
    demoMode: process.env.DEMO_MODE === '1', // simulate visits without network
    sessionMode: process.env.SESSION_MODE === '1', // multi-page sessions
    screenshotOnVisit: process.env.SCREENSHOT === '1',
    // Match proxy country to the visitor fingerprint's locale country (default on)
    geoMatchProxies: process.env.GEO_MATCH_PROXIES !== '0',
  },

  // -------------------------------------------------------------------------
  // Free proxy aggregation (GitHub repos: proxifly, TheSpeedX, monosans, …)
  // Merged into the pool alongside the paid Webshare proxies.
  // -------------------------------------------------------------------------
  freeProxies: {
    enabled: process.env.FREE_PROXIES !== '0',
    max: parseInt(process.env.FREE_PROXY_MAX || '5000', 10),
    refreshHours: parseFloat(process.env.FREE_PROXY_REFRESH_HOURS || '6'),
  },

  // -------------------------------------------------------------------------
  // AI behavior director — decides HOW each visit behaves like a human.
  // provider: auto | omniroute | ollama | openai | off
  // OmniRoute: open-source local AI gateway, OpenAI-compatible at :20128.
  // -------------------------------------------------------------------------
  aiBehavior: {
    provider: process.env.AI_PROVIDER || 'auto',
    ai: { enabled: process.env.AI_ENABLED !== '0' },
  },

  // -------------------------------------------------------------------------
  // Session simulation (multi-page visits, bounce rate control, return visitors)
  // -------------------------------------------------------------------------
  session: {
    enabled: process.env.SESSION_MODE === '1',
    maxPagesPerSession: parseInt(process.env.MAX_PAGES_PER_SESSION || '5', 10),
    targetBounceRate: parseInt(process.env.TARGET_BOUNCE_RATE || '55', 10), // percent
    returnVisitorRate: parseInt(process.env.RETURN_VISITOR_RATE || '35', 10), // percent
    profileTTL: parseInt(process.env.PROFILE_TTL_MS || '2592000000', 10), // 30 days
    profilePoolSize: parseInt(process.env.PROFILE_POOL_SIZE || '500', 10),
  },

  // -------------------------------------------------------------------------
  // Device & platform distribution (F2.6)
  // -------------------------------------------------------------------------
  device: {
    desktopWeight: parseInt(process.env.DESKTOP_WEIGHT || '55', 10),
    mobileWeight: parseInt(process.env.MOBILE_WEIGHT || '40', 10),
    tabletWeight: parseInt(process.env.TABLET_WEIGHT || '5', 10),
  },

  // -------------------------------------------------------------------------
  // UTM parameters & campaign tracking (F2.7)
  // -------------------------------------------------------------------------
  utm: {
    enabled: process.env.UTM_ENABLED !== '0',
    clickIdChance: parseFloat(process.env.UTM_CLICK_ID_CHANCE || '0.4'),
  },

  // -------------------------------------------------------------------------
  // Organic search simulation (F2.1)
  // -------------------------------------------------------------------------
  search: {
    enabled: process.env.SEARCH_SIM === '1',
    minSearchDelay: parseInt(process.env.SEARCH_MIN_DELAY_MS || '1000', 10),
    maxSearchDelay: parseInt(process.env.SEARCH_MAX_DELAY_MS || '3000', 10),
  },

  // -------------------------------------------------------------------------
  // Captcha solving (F2.9)
  // -------------------------------------------------------------------------
  captcha: {
    provider: process.env.CAPTCHA_PROVIDER || '2captcha',
    apiKey: process.env.CAPTCHA_API_KEY || '',
    timeout: parseInt(process.env.CAPTCHA_TIMEOUT || '120', 10),
    pollInterval: parseInt(process.env.CAPTCHA_POLL_INTERVAL || '3', 10),
  },

  // -------------------------------------------------------------------------
  // Social referral simulation (F2.2)
  // -------------------------------------------------------------------------
  social: {
    enabled: process.env.SOCIAL_SIM !== '0',
    paramChance: 0.6,
  },

  // -------------------------------------------------------------------------
  // Geographic distribution control (F2.5)
  // -------------------------------------------------------------------------
  geo: {
    enabled: process.env.GEO_MATCH !== '0',
    matchLanguage: process.env.GEO_MATCH_LANG !== '0',
    matchTimezone: true,
    matchCurrency: true,
  },

  // -------------------------------------------------------------------------
  // Analytics compatibility (F2.8)
  // -------------------------------------------------------------------------
  analytics: {
    enabled: process.env.ANALYTICS_ENABLED !== '0',
    platforms: ['ga4', 'clarity', 'pixel'],
    // 'advanced' = what a real user gets after clicking "Accept all" on the
    // consent banner (the cookie-consent module accepts banners too). 'basic'
    // denies ad_user_data/ad_personalization, which makes AdSense fall back to
    // non-personalized ads (or none) in GDPR regions — bad for ad verification.
    consentMode: process.env.ANALYTICS_CONSENT || 'advanced',
    enhancedMeasurement: true,
  },

  // -------------------------------------------------------------------------
  // Traffic pattern templates (F2.10)
  // -------------------------------------------------------------------------
  traffic: {
    enabled: process.env.TRAFFIC_PATTERNS !== '0',
    currentPattern: process.env.TRAFFIC_PATTERN || 'gaming',
    rampUpEnabled: process.env.RAMPUP_ENABLED === '1',
    rampUpDays: parseInt(process.env.RAMPUP_DAYS || '7', 10),
    rampUpType: process.env.RAMPUP_TYPE || 'linear',
  },

  // -------------------------------------------------------------------------
  // Webhooks & integrations (F3.8)
  // -------------------------------------------------------------------------
  webhooks: {
    enabled: process.env.WEBHOOKS_ENABLED !== '0',
    retryAttempts: parseInt(process.env.WEBHOOK_RETRIES || '3', 10),
    retryBackoffBase: parseInt(process.env.WEBHOOK_BACKOFF_MS || '1000', 10),
  },

  // -------------------------------------------------------------------------
  // Reporting engine (F3.8)
  // -------------------------------------------------------------------------
  reporting: {
    enabled: process.env.REPORTING_ENABLED !== '0',
  },

  // -------------------------------------------------------------------------
  // Content verification (F3.3)
  // -------------------------------------------------------------------------
  contentVerification: {
    enabled: process.env.CONTENT_VERIFY !== '0',
    checkTitle: true,
    checkImages: true,
    minContentLength: 100,
  },

  // -------------------------------------------------------------------------
  // Proxy intelligence layer (F3.5)
  // -------------------------------------------------------------------------
  proxyIntelligence: {
    enabled: process.env.PROXY_INTELLIGENCE !== '0',
    minTrustScore: 30,
    stickySessionChance: 0.3,
    stickySessionDuration: 1800000,
  },

  // -------------------------------------------------------------------------
  // Proxy evaluator — quality assessment
  // -------------------------------------------------------------------------
  proxyEvaluator: {
    timeout: 10000,
    testTargets: [
      'https://httpbin.org/ip',
      'https://api.ipify.org?format=json',
      'https://ifconfig.me/ip',
    ],
    anonymityCheckUrl: 'https://httpbin.org/headers',
    dnsCheckUrl: 'https://httpbin.org/ip',
  },

  // -------------------------------------------------------------------------
  // Proxy strategies — advanced selection
  // -------------------------------------------------------------------------
  proxyStrategies: {
    defaultStrategy: 'best-first',
    fallbackStrategy: 'round-robin',
    maxConsecutiveUses: 10,
    cooldownAfterFailure: 60000,
  },

  // -------------------------------------------------------------------------
  // AI Integration — Ollama (free, local AI)
  // -------------------------------------------------------------------------
  ai: {
    enabled: process.env.AI_ENABLED !== '0',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'llama3.1',
    timeout: 30000,
  },

  // -------------------------------------------------------------------------
  // A/B testing (F3.2)
  // -------------------------------------------------------------------------
  abTesting: {
    enabled: process.env.AB_TESTING !== '0',
  },

  // -------------------------------------------------------------------------
  // Ad viewability (F3.1)
  // -------------------------------------------------------------------------
  adViewability: {
    enabled: process.env.AD_VIEWABILITY !== '0',
    minViewDuration: 1000,
    hoverChance: 0.2,
  },

  // -------------------------------------------------------------------------
  // Screenshot system (F3.4)
  // -------------------------------------------------------------------------
  screenshots: {
    enabled: process.env.SCREENSHOTS !== '0',
    captureOnError: true,
    captureOnSuccess: false,
    maxGallerySize: 100,
  },

  // -------------------------------------------------------------------------
  // Multi-project (F3.7)
  // -------------------------------------------------------------------------
  multiProject: {
    enabled: process.env.MULTI_PROJECT !== '0',
    maxProjects: 10,
  },

  // -------------------------------------------------------------------------
  // Distributed workers (F3.10)
  // -------------------------------------------------------------------------
  distributedWorkers: {
    enabled: process.env.DISTRIBUTED_WORKERS !== '0',
    maxWorkers: 5,
    autoScale: process.env.WORKER_AUTOSCALE === '1',
  },

  // -------------------------------------------------------------------------
  // Network conditions (F3.9)
  // -------------------------------------------------------------------------
  networkCondition: {
    enabled: process.env.NETWORK_CONDITION !== '0',
    defaultConnection: null,
    saveDataHeader: true,
    latencyInjection: true,
  },

  // -------------------------------------------------------------------------
  // Tier 4 — Advanced Features
  // -------------------------------------------------------------------------
  // F4.1 ML Behavior Model (rule-based)
  mlBehavior: {
    enabled: process.env.ML_BEHAVIOR !== '0',
    useML: false,
  },
  // F4.2 Detection Feedback Loop
  detectionFeedback: {
    enabled: process.env.DETECTION_FEEDBACK !== '0',
    autoBlacklist: true,
    autoSlowdown: true,
    autoModeSwitch: true,
  },
  // F4.3 Video/Media Interaction
  videoMedia: {
    enabled: process.env.VIDEO_MEDIA !== '0',
    watchTimeMin: 30,
    watchTimeMax: 120,
  },
  // F4.4 E-commerce Funnel
  ecommerceFunnel: {
    enabled: process.env.ECOMMERCE_FUNNEL !== '0',
    cartChance: 0.3,
  },
  // F4.5 Form Interaction
  formInteraction: {
    enabled: process.env.FORM_INTERACTION !== '0',
    neverSubmit: true,
  },
  // F4.6 Cookie Consent/GDPR
  cookieConsent: {
    enabled: process.env.COOKIE_CONSENT !== '0',
    acceptChance: 0.7,
  },
  // F4.7 DNS-Level Simulation
  dnsSimulation: {
    enabled: process.env.DNS_SIMULATION !== '0',
    resolverRotation: true,
  },
  // F4.8 CDN/Edge Awareness
  cdnEdge: {
    enabled: process.env.CDN_EDGE !== '0',
    cacheBust: true,
  },
  // F4.9 API/AJAX Simulation
  apiAjax: {
    enabled: process.env.API_AJAX !== '0',
    ajaxChance: 0.3,
  },
  // F4.10 Competitor Analysis
  competitorAnalysis: {
    enabled: process.env.COMPETITOR_ANALYSIS !== '0',
    autoCompare: true,
  },

  // -------------------------------------------------------------------------
  // Tier 5 — Ecosystem Features
  // -------------------------------------------------------------------------
  // F5.1 Multi-Platform Sync
  multiPlatformSync: {
    enabled: process.env.MULTI_PLATFORM_SYNC !== '0',
    provider: 'supabase',
    syncInterval: 60000,
  },
  // F5.2 Plugin/Extension System
  pluginSystem: {
    enabled: process.env.PLUGIN_SYSTEM !== '0',
    sandboxEnabled: true,
    maxPlugins: 50,
  },
  // F5.3 CLI Tool
  cliTool: {
    enabled: process.env.CLI_TOOL !== '0',
    jsonOutput: true,
  },
  // F5.4 Desktop App (Electron)
  desktopApp: {
    enabled: process.env.DESKTOP_APP !== '0',
    autoStart: false,
    trayIcon: true,
    notifications: true,
  },
  // F5.5 Reporting Engine (extended with PDF)
  reporting: {
    enabled: process.env.REPORTING !== '0',
    reportDir: null, // uses default data/reports/
  },

  // -------------------------------------------------------------------------
  // Proxy health checking.
  // -------------------------------------------------------------------------
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10),
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '10000', 10),
    // What to ping through the proxy to verify it works.
    // Default: a stable public endpoint that returns JSON with the caller IP.
    target: process.env.HEALTH_CHECK_TARGET || 'https://api.ipify.org?format=json',
    // Circuit-breaker thresholds (consecutive failures before cooling down).
    circuitOpenAfter: parseInt(process.env.CIRCUIT_OPEN_AFTER || '5', 10),
    circuitCooldownMs: parseInt(process.env.CIRCUIT_COOLDOWN_MS || '60000', 10),
    // Free proxies (source='free') failing this many times in a row are
    // ARCHIVED (out of rotation, kept in pool, re-activated if a fresh list
    // shows them again). Paid Webshare proxies are never archived. 0 = off.
    archiveFreeAfterFailures: parseInt(process.env.FREE_PROXY_ARCHIVE_AFTER_FAILURES || '5', 10),
    // Background sweep is batched: each interval probes only a rotating window
    // of the pool (instead of all 5k at once) with bounded concurrency.
    batchSize: parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || '100', 10),
    batchConcurrency: parseInt(process.env.HEALTH_CHECK_BATCH_CONCURRENCY || '25', 10),
  },

  // -------------------------------------------------------------------------
  // Per-target-domain rules: opt-outs, rate limits, robots.txt respect.
  // -------------------------------------------------------------------------
  domainRules: {
    enabled: process.env.DOMAIN_RULES_ENABLED !== '0',
    respectRobots: process.env.RESPECT_ROBOTS !== '0',
    defaultMinIntervalMs: parseInt(process.env.DOMAIN_MIN_INTERVAL_MS || '60000', 10),
    defaultMaxVisitsPerHour: parseInt(process.env.DOMAIN_MAX_VISITS_PER_HOUR || '20', 10),
    optOuts: (process.env.DOMAIN_OPT_OUTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  },

  // -------------------------------------------------------------------------
  // Observability: metrics + alerts (free-refresh failures, LLM fallback
  // rate, visit error rate, detection signals).
  // -------------------------------------------------------------------------
  observability: {
    enabled: process.env.OBSERVABILITY !== '0',
  },

  database: {
    // data/visits.db inside the server dir; WAL journal for concurrent reads.
    path: process.env.DB_PATH || 'data/visits.db',
    wal: process.env.DB_WAL !== '0',
    cleanupDays: parseInt(process.env.DB_CLEANUP_DAYS || '30', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/combined.log',
  },
};
