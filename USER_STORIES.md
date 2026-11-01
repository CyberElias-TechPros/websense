# WebSense — User Stories & Business Logic

## Overview
WebSense is a stealth traffic engine that automates website visits through residential/datacenter proxies with browser fingerprinting, anti-detection, and AI-powered recommendations.

---

## User Story 1: First-Time Setup
**As a** new user
**I want** a simple wizard to set up proxies and start traffic
**So that** I can get started quickly without manual configuration

### Steps
1. Open the Setup Wizard (/wizard)
2. See system overview (proxy count, URL count, countries, AI status)
3. Fetch proxies from Webshare API
4. Evaluate proxy quality
5. Choose a proxy selection strategy
6. Check AI availability (optional)
7. Click "Start Engine"

### Acceptance Criteria
- Wizard loads within 2 seconds
- All steps show current status
- One-click actions for each step
- Final step starts the engine automatically

---

## User Story 2: Proxy Management
**As a** user with Webshare proxies
**I want** to manage my proxies easily
**So that** I can see which proxies are working and which need replacement

### Features
- View all loaded proxies with country, city, flag, status
- Enable/disable individual proxies
- Add custom proxies manually
- Remove proxies
- Check proxy health (latency, success rate)
- Filter by country, status, health score

### API Endpoints
- GET /api/proxies — List all proxies
- POST /api/proxies — Add proxy
- DELETE /api/proxies/:host — Remove proxy
- PATCH /api/proxies/:host/toggle — Enable/disable
- POST /api/proxies/check — Health check all

---

## User Story 3: Proxy Evaluation
**As a** user
**I want** to evaluate proxy quality automatically
**So that** I can use the best proxies for my traffic

### Evaluation Criteria
1. **Speed**: Latency to target URL
2. **Anonymity**: Real IP leak detection, header leaks
3. **Safety**: HTTPS support, authentication, DNS leaks, WebRTC leaks
4. **Reliability**: Success rate over multiple checks

### Scoring
- Each criterion scored 0-100
- Overall score = weighted average
- Categorized: excellent (80+), good (60+), fair (40+), poor (<40)

### API Endpoints
- POST /api/proxy-evaluator/evaluate-all — Evaluate all proxies
- POST /api/proxy-evaluator/evaluate — Evaluate specific proxy
- GET /api/proxy-evaluator/recommend — Get recommendations by strategy

---

## User Story 4: Proxy Rotation
**As a** user with many proxies
**I want** automatic proxy rotation
**So that** my traffic doesn't come from the same IP repeatedly

### Rotation Modes
1. **Scheduled**: Rotate every N minutes
2. **On Failure**: Rotate when a proxy fails
3. **On High Latency**: Rotate when latency exceeds threshold
4. **Manual**: Force rotation at any time

### Rate Limiting
- Max 20 rotations per hour
- Min 30 seconds between rotations

### API Endpoints
- GET /api/proxy-rotation/stats — Rotation stats
- POST /api/proxy-rotation/rotate — Force rotation
- POST /api/proxy-rotation/start — Start auto-rotation
- POST /api/proxy-rotation/stop — Stop auto-rotation

---

## User Story 5: AI-Powered Recommendations
**As a** user
**I want** AI to recommend the best proxies and strategies
**So that** I can maximize traffic quality without manual analysis

### AI Features
1. **Analyze Proxies**: AI analyzes proxy performance data
2. **Recommend Proxy**: AI suggests best proxy based on requirements
3. **Generate Report**: AI generates natural language reports
4. **Analyze Content**: AI analyzes page content for detection risks
5. **Recommend Behavior**: AI suggests behavioral patterns

### AI Backend
- Ollama (free, local, no API keys)
- Default model: llama3.1
- Runs at http://localhost:11434

### API Endpoints
- GET /api/ai/status — Check AI availability
- GET /api/ai/models — List available models
- POST /api/ai/analyze-proxies — AI proxy analysis
- POST /api/ai/recommend-proxy — AI proxy recommendation

---

## User Story 6: Smart Retry
**As a** user
**I want** failed visits to be retried automatically
**So that** transient errors don't waste proxy capacity

### Retry Logic
1. **Exponential Backoff**: Delay doubles with each attempt
2. **Max Retries**: 3 (configurable)
3. **Retry On**: HTTP 403/429/500/502/503/504, network errors, timeouts
4. **No Retry On**: 404, 401 (permanent errors)

### API Endpoints
- GET /api/smart-retry/stats — Retry statistics
- POST /api/smart-retry/check — Check if should retry

---

## User Story 7: Geo Restrictions
**As a** user
**I want** to control which countries my traffic comes from
**So that** I can target specific regions or avoid certain regions

### Modes
1. **Allow-list**: Only use listed countries
2. **Block-list**: Never use listed countries
3. **Preferred**: Prefer listed countries (but not required)
4. **Distribution**: Enforce geographic diversity (max % per country)

### API Endpoints
- GET /api/proxy-geo/config — Get geo config
- PATCH /api/proxy-geo/config — Update geo config
- POST /api/proxy-geo/record — Record country usage

---

## User Story 8: Proxy Health Monitoring
**As a** user
**I want** to monitor proxy health over time
**So that** I can identify and replace failing proxies

### Metrics
- Success rate
- Average latency
- Consecutive failures
- Health score (0-100)
- Cooldown status

### Automatic Cooldown
- After 5 consecutive failures, proxy is cooled down for 10 minutes
- Cooldown auto-expires
- Manual cooldown clear available

### API Endpoints
- GET /api/proxy-health/summary — Health summary
- GET /api/proxy-health/stats — All proxy stats
- GET /api/proxy-health/unhealthy — Unhealthy proxies
- GET /api/proxy-health/healthy — Healthy proxies

---

## User Story 9: Comprehensive Reporting
**As a** user
**I want** detailed reports on traffic and proxy performance
**So that** I can analyze and optimize my traffic strategy

### Report Formats
1. **HTML**: Visual report with charts and tables
2. **CSV**: Raw data for spreadsheet analysis
3. **JSON**: Machine-readable for API integration
4. **Markdown**: Human-readable for documentation
5. **PDF**: Printable report

### Report Content
- Total visits, successes, failures
- Success rate
- Average latency
- Device distribution
- Top URLs
- Traffic by country
- Traffic by proxy
- Hourly traffic patterns
- Top errors

### API Endpoints
- POST /api/reporting/generate — Generate HTML report
- POST /api/reporting/generate-json — Generate JSON report
- POST /api/reporting/generate-markdown — Generate Markdown report
- GET /api/reporting/summaries — List recent reports

---

## User Story 10: Multi-Provider Proxy Integration
**As a** user
**I want** to use proxies from multiple providers
**So that** I have backup sources and flexibility

### Supported Providers
1. **Webshare** — API download links
2. **Bright Data** — ip:port:user:pass format
3. **Smartproxy** — Flexible parsing
4. **Apify** — JSON API with Bearer token
5. **ZenRows** — Basic auth
6. **ScrapingBee** — X-Api-Key header
7. **ProxyEmpire** — Bearer token, flexible JSON
8. **ProxyCrawl** — JSON API
9. **Generic** — ip:port or ip:port:user:pass

### Integration Process
1. Get API URL from provider
2. Configure authentication (if needed)
3. Click "Fetch Proxies" in wizard
4. Proxies are parsed and added to pool

### API Endpoints
- GET /api/proxy-integrations — List providers
- POST /api/proxy-integrations/fetch — Fetch from provider
- POST /api/proxy-integrations/quick-fetch-webshare — Quick Webshare fetch

---

## User Story 11: Session Persistence
**As a** user
**I want** to maintain sessions across visits
**So that** I can simulate returning visitors

### Features
- Cookie persistence per proxy
- Session timeout (configurable)
- Returning visitor simulation
- Session ID management

---

## User Story 12: Anti-Detection
**As a** user
**I want** my traffic to be undetectable
**So that** websites don't block or flag my visits

### Detection Countermeasures
1. **Browser Fingerprinting**: 26+ consistency checks
   - UserAgent, Platform, WebGL, Canvas, Audio, Screen
   - Clipboard, Geolocation, Performance, Memory, Intl
   - window.chrome, Permissions
2. **Proxy Stealth**: Real IP leak detection
3. **Header Rotation**: Varied headers per visit
4. **Behavioral Patterns**: Natural mouse movements, scroll patterns
5. **Referrer Spoofing**: Realistic referrer chains
6. **Timezone Matching**: Timezone matches proxy location
7. **Language Matching**: Browser language matches proxy country

---

## User Story 13: Analytics Dashboard
**As a** user
**I want** to see real-time analytics of my traffic
**So that** I can monitor performance and detect issues

### Dashboard Metrics
- Total visits (today, week, month)
- Success rate
- Average latency
- Active proxies
- Traffic by country (map)
- Traffic over time (chart)
- Top performing URLs
- Recent visits feed

### API Endpoints
- GET /api/stats/overview — Overview stats
- GET /api/analytics/timeline — Time series data
- GET /api/analytics/by-url — Breakdown by URL
- GET /api/analytics/by-country — Breakdown by country

---

## User Story 14: AI-Directed Human Behavior (OmniRoute / Ollama / heuristic)
**As a** user
**I want** each visit to behave like a distinct real human, directed by AI
**So that** dwell time, scrolling, hovering, pauses and click-throughs look organic

### Flow
1. Browser loads page → page stats extracted (title, words, links, images, video)
2. AI Behavior Director builds a per-visit **behavior plan** (persona + dwellScale + scroll + hover + clickIntent + pauseScale)
3. Provider priority: OmniRoute (`:20128`, OpenAI-compatible) → Ollama → any OpenAI-compatible endpoint → deterministic heuristic personas
4. Plan is cached per page+device (30 min), time-capped (8 s), never blocks the visit
5. Browser-mode engine applies the plan to dwell, scroll, mouse, reading pauses, same-origin click-through
6. Plan recorded in the visit result (`behavior` field) for analytics

### Acceptance Criteria
- No LLM reachable → heuristic persona plan still produced (visit never blocked)
- Same visitor + same page → consistent persona (returning-visitor consistency)
- LLM output is JSON-extracted and clamped to safe ranges
- `AI_BEHAVIOR=0` disables the director

### API Endpoints
- GET /api/ai/director/status — active provider, models, stats
- POST /api/ai/director/recheck — re-probe providers (e.g. after starting OmniRoute)
- POST /api/ai/director/plan — preview the plan for a URL (no visit made)

---

## User Story 15: Free Proxy Pool on top of paid Webshare proxies
**As a** user with ~100 paid Webshare proxies
**I want** thousands of additional free proxies from regularly-updated GitHub repos
**So that** the ~10k unique browser profiles each get a matching proxy (wider geo/type range)

### Flow
1. Every 6 h (and 15 s after boot) the fetcher pulls lists from proxifly, TheSpeedX, monosans, clarketm, ZloiUser, roosterkid
2. Raw files via raw.githubusercontent.com; **codeload.github.com zip fallback** (one zip per repo, extracted locally) — force with `FREE_PROXY_USE_CODELOAD=1`
3. Lines parsed (`protocol://ip:port` / `ip:port`, credential suffixes stripped), deduped, capped (`FREE_PROXY_MAX`)
4. proxifly `data.json` adds country/city geo metadata
5. Merged into ProxyManager as `source: 'free'`, **credential-less** (never Webshare creds)
6. A sample of new proxies is TCP-probed; dead ones are **disabled, never deleted**
7. Paid Webshare proxies are never removed or modified by free-source operations

### API Endpoints
- POST /api/proxies/free/refresh — manual refresh (returns report)
- GET /api/proxies/free/stats — config, pool composition, recent refreshes
- PUT /api/proxies/free/config — change max / refreshHours / probe settings at runtime
- GET /api/proxies/sources — paid vs free counts

---

## User Story 16: Analytics & ad-script integrity on visited pages
**As a** user verifying analytics/ads on my own pages
**I want** the injected GA4/consent code to not break the page's own scripts
**So that** gtag, GTM, AdSense and site scripts run without errors and ads render

### Business rules
- `window.dataLayer` must remain an **Array** at all times; consent is pushed as
  `['consent','default',…]` then `['consent','update',…]` events
- `gtag()` is defensive (re-creates the array if something replaced it)
- Stealth spoof functions are passed explicitly to `evaluateOnNewDocument`
  (no references to page-scope names that don't exist → no `canvasSpoof is not defined`)
- Default consent mode `advanced` (= real "Accept all") so AdSense renders in GDPR regions

---

## User Story 17: Matching, hygiene & observability layer
**As a** operator
**I want** profiles matched to proxies, free proxies self-cleaning, domain rules
respected, and full observability
**So that** traffic stays consistent per visitor, the pool stays healthy, targets'
rules are honored, and I can see problems before they grow

### Flows
1. **Geo-match**: fingerprint locale → expected country → `proxyManager.select(strategy, { preferCountry })` prefers same-country active proxies (`geo-match` strategy forces it; `GEO_MATCH_PROXIES=0` disables)
2. **Stickiness**: return-visitor profile → bound proxy (`proxy_host/proxy_port`) reused while active → re-bound after each session
3. **Archiving**: free proxy hits `FREE_PROXY_ARCHIVE_AFTER_FAILURES` consecutive failures → archived (disabled, persisted); fresh free-list hit → un-archived automatically; paid proxies never archived
4. **Feedback loop**: visit outcome (403/429/captcha) → `behaviorDirector.recordOutcome` + `detectionFeedback.recordSignal` → next plan on that host is cautious (LLM prompt context + heuristic click/pause adjustment)
5. **Domain rules**: before proxy selection, `domainRules.check(url)` enforces opt-outs, per-domain rate limits, robots.txt Disallow; skips don't consume proxies
6. **Observability**: every visit/refresh/AI-stat/detection tick feeds `/api/metrics`; alert rules raise ack-able alerts (also pushed over WebSocket)

### API Endpoints
- GET /api/metrics (`?format=prometheus`) · GET /api/alerts · POST /api/alerts/:id/ack
- GET/PATCH /api/domain-rules · PUT /api/domain-rules/:domain · POST /api/domain-rules/opt-out · DELETE /api/domain-rules/opt-out/:domain · POST /api/domain-rules/:domain/robots/refresh · GET /api/domain-rules/:domain/check
- GET /api/proxy-strategies (includes `geo-match`)

---

## Business Logic Summary

### Proxy Selection Flow
1. Check geo restrictions → filter allowed countries
2. Check health monitor → exclude cooled-down proxies
3. Apply strategy → select proxy based on strategy
4. Record usage → update geo restrictions usage stats
5. Execute visit → through proxy with anti-detection
6. Record result → update health monitor
7. If failure → smart retry → rotation check

### Traffic Flow
1. Scheduler picks next URL
2. Proxy selection (see above)
3. VisitEngine executes visit with:
   - Browser fingerprinting
   - Anti-detection measures
   - Session persistence
   - UTM parameters
4. Result recorded in database
5. Analytics updated
6. If failed → retry logic → health update

### AI Integration Flow
1. Check Ollama availability
2. Send proxy data to AI model
3. AI returns analysis/recommendations
4. Results stored and used for strategy selection

### AI Behavior Director Flow (per visit)
1. VisitEngine passes `behaviorDirector` into browser-mode
2. After page load, extract page stats (title/words/links/images/video)
3. Director builds plan: LLM (OmniRoute → Ollama → OpenAI-compatible) or heuristic persona fallback
4. Plan cached per host+device+seed (30 min TTL), LLM calls capped at 8 s
5. Browser-mode applies plan: dwell × dwellScale, scroll steps/depth, hover intensity, pause × pauseScale, click-through with clickIntent
6. Plan + outcome stored in visit result (`behavior`) for the analytics dashboard

### Free Proxy Pipeline Flow
1. Boot → 15 s later initial refresh; then every `FREE_PROXY_REFRESH_HOURS`
2. Fetch all GitHub sources in parallel (raw first, codeload zip fallback, per-repo zip cached)
3. Parse → dedupe → cap (`FREE_PROXY_MAX`, `FREE_PROXY_PER_SOURCE_CAP`)
4. Skip host:port already in pool (paid included) — archived free ones present in a fresh list are un-archived (backfill) → add the rest as `source: 'free'`, no credentials
5. Probe sample (TCP, concurrency-capped) → disable dead via `toggleProxy(host, false)`
6. Report logged + fed to observability + exposed via `/api/proxies/free/*`; paid pool untouched
7. Visit failures on free proxies: `recordFailure` → circuit breaker; at `FREE_PROXY_ARCHIVE_AFTER_FAILURES` consecutive failures the proxy is archived (paid never)

### Visit Selection Flow (updated)
1. Pick URL → domain-rules check (opt-out / rate-limit / robots.txt) → skip without proxy if blocked
2. Fingerprint → expected country (locale) → geo-match
3. If bound to a visitor profile → reuse profile's proxy while active
4. Otherwise `select(strategy, { preferCountry })` → geo-matched pick
5. Execute visit → record result → domain rules log, observability, proxy stats
6. Failure → recordFailure (archive if free & threshold) → detection feedback + director outcome → retry logic

---

## User Story 18: Hardened, audit-proof operation
**As an** operator
**I want** the whole app audited end-to-end: session chains that actually hold,
bounded background work, validated inputs, safe config endpoints, optional auth,
and no performance traps
**So that** running it at scale (thousands of free proxies, long uptime) is safe and predictable

### Audit findings → fixes
1. **Session chains were broken (critical)**: the session manager passed `{proxy, url}` per page into `executeVisit`, but the engine ignored both and re-rolled a random proxy+URL every page. Now caller-supplied `options.url`/`options.proxy` win; a caller proxy that got disabled/archived meanwhile triggers re-selection; domain-rules checks and persistence use the effective URL
2. **Visits didn't record behavior/skips**: `visits` table gained `behavior`, `skipped`, `skip_reason` columns; engine persists them on every path (success/failure/skip/demo); `GET /api/visits?status=skipped` filters them
3. **Health checks probed the entire pool every 60 s**: background sweep now uses `healthCheckBatch` — a rotating window (`HEALTH_CHECK_BATCH_SIZE`, default 100) with bounded concurrency (25), archived proxies excluded; `healthCheckAll` also capped + archived-skipping
4. **No input validation**: new `api/validate.js` — `POST /api/proxies` and `POST /api/urls` return 400 with per-field details (valid host/port/type, credentials together, http/https only, ≤2048 chars)
5. **Config endpoint unsafe**: `PATCH /api/config` now validates against a whitelist schema (unknown keys → 400; `maxInterval ≥ minInterval` checked against the merged config) and persists via `setSystemConfig`; `GET /api/config` returns only schema keys (previously serialized the whole scheduler config incl. the circular session manager → 500)
6. **Dev-proxy port mismatch**: vite dev proxy now targets `VITE_BACKEND_PORT` (default 3001 = server/docker default) instead of a hardcoded 3002
7. **No tests script / lazy fingerprint pool / no retention job / log slurp**: `npm test` (vitest) added; 10k fingerprint pool pre-warmed at boot; daily `DB_CLEANUP_DAYS` purge job; `/api/logs` tail-reads the last 2 MB
8. **No auth option for exposed dashboards**: opt-in `API_TOKEN` → Bearer auth on `/api` (+`?token=`) and socket.io `auth:{token}`; client sends `VITE_API_TOKEN` / `localStorage.websense_api_token`; docker-compose passes all new env vars through

### API Endpoints
- PATCH /api/config (validated, persisted) · GET /api/config (schema keys only)
- POST /api/proxies · POST /api/urls (400 + details on invalid input)
- GET /api/visits?status=success|failed|skipped · GET /api/logs (tail)
