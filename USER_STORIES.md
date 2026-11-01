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
