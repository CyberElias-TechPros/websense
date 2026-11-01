# 🚀 Proxy Visitor App — Ultra-Granular Implementation Roadmap & Todo List

> **App:** Automated proxy-rotated random page visitor with real-time dashboard (Web + Android)
> **Status:** Web app **ALL TIERS COMPLETE (1-5)** · 35 managers · 146 endpoints · Android **scaffolded + detailed plan**
> **Last updated:** 2026-10-30
>
> 📖 Companion documents: **FEATURES.md** (competitive analysis + full feature arsenal, 41 features, 5 tiers) · **README.md** (master roadmap spec)

---

## 📌 HOW TO READ THIS ROADMAP

Every step follows this structure:

| Field | Meaning |
|-------|---------|
| **Status** | 🟢 Done · 🔵 Next · ⬜ Todo · ⏸️ Blocked |
| **What** | Exactly what gets built |
| **Why** | The reason it exists (prevents feature creep) |
| **Achieves** | The measurable outcome |
| **Uses/Connects To** | Technologies, modules, and dependencies |
| **Acceptance** | Definition of done — how we verify it works |

---

## 📊 LIVE STATUS SUMMARY

| Phase | Steps | Done | Next | Todo | Progress |
|-------|-------|------|------|------|----------|
| 0 — Foundation & Scope | 6 | 6 | 0 | 0 | 100% 🟢 |
| 1 — Backend Core Engine | 11 | 11 | 0 | 0 | 100% 🟢 |
| 2 — REST API Layer | 5 | 5 | 0 | 0 | 100% 🟢 |
| 3 — Frontend Dashboard | 12 | 12 | 0 | 0 | 100% 🟢 |
| 4 — Advanced Engine Features | 8 | 8 | 0 | 0 | 100% 🟢 |
| 5 — Android Application | 14 | 1 | 1 | 12 | 7% 🔵 |
| 6 — Testing | 6 | 0 | 0 | 6 | 0% ⬜ |
| 7 — Deployment & DevOps | 5 | 2 | 0 | 3 | 40% 🟡 |
| 8 — Security & Hardening | 4 | 2 | 0 | 2 | 50% 🟡 |
| 9 — Documentation & Polish | 4 | 1 | 0 | 3 | 25% 🟡 |
| **TOTAL** | **77** | **49** | **1** | **27** | **64%** |

**Next action:** Phase 6 — Testing hardening pass, then Phase 5 — Android.

---

# PHASE 0 — FOUNDATION & SCOPE ✅ COMPLETE

### ✅ STEP 0.1 — Project Definition & Scope Document
- **What:** Defined the app's purpose: automated proxy-rotated visits to 27 target URLs with real-time monitoring dashboard.
- **Why:** Without clear scope, feature creep destroys projects. Single source of truth for all decisions.
- **Achieves:** A spec every subsequent step references.
- **Uses/Connects To:** This document; all phases.
- **Acceptance:** Scope agreed; nothing builds without referencing this step.

### ✅ STEP 0.2 — Target URL Registry
- **What:** Cataloged all 27 target URLs with derived metadata (subdomain, category).
- **Why:** Centralized URL management prevents hardcoding; pool can be modified without code changes.
- **Achieves:** Dynamic URL pool (loop, slams, vidlyric, ke, t7m, agreement, b1, 360, akawo, cif, cloud, live, som, ocean, cell, invibox, smb, prompt, agently, sambet, ngaff, delgra, caption, toolbox, tax, gif, vizier).
- **Uses/Connects To:** `server/config/urls.js` → URL Manager → Visit Engine → Scheduler.
- **Acceptance:** All 27 URLs load at boot; subdomain extraction works.

### ✅ STEP 0.3 — Proxy Registry & Validation Schema
- **What:** Structured all 10 proxies with host/port/location; credentials injected at runtime from env.
- **Why:** Structured proxy data enables rotation algorithms; credentials must not live in code.
- **Achieves:** Proxy pool across 5 countries (🇬🇧🇪🇸🇺🇸🇵🇱🇩🇪) ready for health checking.
- **Uses/Connects To:** `server/config/proxies.js` + `server/config/default.js` (proxyAuth) → Proxy Manager.
- **Acceptance:** 10 proxies load at boot; credentials overridable via env vars.

### ✅ STEP 0.4 — Technology Stack Decision
- **What:** Finalized stacks for web + Android.
- **Why:** Optimal, maintainable, deployable choices; documented rationale.
- **Achieves:** Node 22 + Express + node:sqlite + Socket.IO backend; React 18 + Vite + Tailwind + Recharts frontend; Kotlin + Compose + OkHttp + Room for Android.
- **Uses/Connects To:** Every subsequent phase.
- **Acceptance:** All chosen libs install and run in this environment.

### ✅ STEP 0.5 — Repository Structure & Tooling
- **What:** Created `server/`, `client/` structure; `.gitignore`; Node 22 tooling.
- **Why:** Clean architecture from day one prevents refactoring debt.
- **Achieves:** Organized codebase, dependency isolation, ignored artifacts (node_modules, data, logs, dist).
- **Uses/Connects To:** Git, npm, Vite, Docker.
- **Acceptance:** `git status` clean; no artifacts committed.

### ✅ STEP 0.6 — Configuration Management System
- **What:** Centralized config with env overrides (`server/config/default.js`).
- **Why:** No hardcoded values; environment-specific settings.
- **Achieves:** Single config source; `PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`, `DEMO_MODE`, `MIN_INTERVAL_MS`, etc. all env-driven.
- **Uses/Connects To:** Every module reads from config.
- **Acceptance:** Changing `.env` changes behavior without code edits.

---

# PHASE 1 — BACKEND CORE ENGINE ✅ COMPLETE

### ✅ STEP 1.1 — Project Scaffolding (Server)
- **What:** Node 22 ESM project with folder structure (config, core, database, api, middleware, utils).
- **Why:** Modular organization; clear import graph.
- **Achieves:** Codebase ready for modular development.
- **Uses/Connects To:** npm, ESM imports.
- **Acceptance:** `npm start` boots the server.

### ✅ STEP 1.2 — Zero-Native-Dependency Database Layer
- **What:** Built on Node 22 built-in `node:sqlite` (DatabaseSync) instead of better-sqlite3.
- **Why:** Eliminates node-gyp/native compilation — deploys anywhere with Node 22+, no toolchain needed.
- **Achieves:** Tables (visits, proxy_stats, url_stats, system_config) with indexes; WAL mode; sync transaction helper; date-format helper.
- **Uses/Connects To:** `server/database/db.js` → all managers + API.
- **Acceptance:** DB created on first boot; concurrent writes safe (WAL); no native install errors.

### ✅ STEP 1.3 — Proxy Manager Module
- **What:** Proxy pool with TCP + HTTP health checks, 4 rotation strategies, circuit breaker, per-proxy metrics.
- **Why:** Core infrastructure — everything flows through proxies.
- **Achieves:** Reliable rotation with automatic failover; circuit opens after N consecutive failures, cools down, half-opens, probes, closes.
- **Uses/Connects To:** axios + proxy agents; `proxy-manager.js` → Visit Engine, Dashboard, Analytics.
- **Acceptance:** `getRandom()`, `getWeighted()`, `getGeoSpread()`, `getNext()` all functional; health checks never throw.

### ✅ STEP 1.4 — URL Manager Module
- **What:** URL pool with priority-weighted random selection, Fisher-Yates shuffle, least-recently-visited balancing, visit tracking.
- **Why:** Random selection must appear organic, not sequential.
- **Achieves:** Natural-looking visit patterns across all 27 URLs.
- **Uses/Connects To:** `url-manager.js` → Visit Engine, Scheduler, Dashboard.
- **Acceptance:** Weighted distribution; add/remove/toggle/priority all work.

### ✅ STEP 1.5 — Visit Engine (HTTP Mode)
- **What:** Core HTTP visit execution: proxy agent, UA rotation, referrer simulation, retry with exponential backoff + jitter, error classification.
- **Why:** Lightweight visits with high throughput; robust failure handling.
- **Achieves:** 2xx/3xx/4xx treated as success; 5xx and network errors classified as proxy/target/network; retries with backoff; metrics captured (status, latency, size, attempts).
- **Uses/Connects To:** axios + https-proxy-agent/http-proxy-agent → Proxy Manager, URL Manager, Logger, DB.
- **Acceptance:** Visits record; retries observable in logs; error types correct.

### ✅ STEP 1.6 — Visit Engine (Demo Mode)
- **What:** Simulated successful visits without network.
- **Why:** Lets users see the full dashboard working even when proxies/targets are unreachable (testing, demos, sandbox).
- **Achieves:** Full pipeline exercised (proxy pick → URL pick → record → persist → broadcast) with zero network.
- **Uses/Connects To:** Same pipeline as real visits.
- **Acceptance:** `DEMO_MODE=1` produces visits with realistic latency/status.

### ✅ STEP 1.7 — Scheduler Engine
- **What:** Randomized intervals, N concurrent slots, state machine (stopped/running/paused), live WebSocket emission.
- **Why:** Predictable patterns are detectable; randomization is essential.
- **Achieves:** Natural visit cadence; pause/resume/stop controls.
- **Uses/Connects To:** `scheduler.js` → Visit Engine, Proxy Manager, Socket.IO.
- **Acceptance:** Engine starts/pauses/resumes/stops; intervals random within range.

### ✅ STEP 1.8 — User-Agent & Referrer Rotation
- **What:** 20-UA pool (Chrome/Firefox/Safari/Edge × Win/Mac/Linux/iOS/Android) + referrer simulation (search engines, social, direct).
- **Why:** Same fingerprint across visits is a bot-detection signal.
- **Achieves:** Each visit appears from a different browser/OS; referrer chains look organic.
- **Uses/Connects To:** `user-agents.js` → Visit Engine.
- **Acceptance:** Random UA per visit; referrer header set appropriately.

### ✅ STEP 1.9 — Logging & Monitoring System
- **What:** Winston structured logging: console (colorized) + rotating files (error.log, combined.log).
- **Why:** Debugging, audit trail, performance monitoring.
- **Achieves:** Searchable logs; rotation at 5MB × 5 files.
- **Uses/Connects To:** All modules → Logger → Console/File.
- **Acceptance:** Log files created; `GET /api/logs` returns entries.

### ✅ STEP 1.10 — Optional Browser Mode (Puppeteer)
- **What:** Lazy-loaded Puppeteer rendering with proxy + random viewport + simulated dwell/scroll.
- **Why:** Some targets require JS execution; README roadmap calls for browser mode.
- **Achieves:** `VISIT_MODE=browser|mixed` works when Puppeteer is installed; app runs fine without it (graceful degradation).
- **Uses/Connects To:** `browser-mode.js` → Puppeteer (optional dependency).
- **Acceptance:** Missing Puppeteer → clean warning, HTTP mode unaffected.

### ✅ STEP 1.11 — Error Classification & Retry Engine
- **What:** Error taxonomy (proxy vs target vs network vs unknown) + retry with exponential backoff + jitter.
- **Why:** Distinguishes "proxy is dead" from "target is down" — critical for correct failover.
- **Achieves:** Proxy errors retry through the same proxy (or failover), target 5xx fail fast.
- **Uses/Connects To:** `VisitEngine.classifyError()` → retry loop.
- **Acceptance:** Classifications verified in logs; retry attempts visible.

---

# PHASE 2 — REST API LAYER ✅ COMPLETE

### ✅ STEP 2.1 — Express Server Setup
- **What:** Express + Helmet + CORS + rate limiting + JSON body parsing.
- **Why:** API gateway for the frontend.
- **Achieves:** Secure, rate-limited HTTP server on port 3001.
- **Uses/Connects To:** Express, helmet, express-rate-limit.
- **Acceptance:** Server boots; security headers present.

### ✅ STEP 2.2 — API Endpoints
- **What:** 25+ endpoints: engine controls, stats, visits, analytics, proxies, URLs, config, logs, maintenance, manual visit.
- **Why:** Full programmatic control of the engine.
- **Achieves:** Dashboard + external integrations can control everything.
- **Uses/Connects To:** `server/api/routes.js` → all managers + DB.
- **Acceptance:** Every endpoint tested via curl.

### ✅ STEP 2.3 — WebSocket Real-Time Layer
- **What:** Socket.IO events: `visit:complete`, `stats:update`, `engine:state`.
- **Why:** Push-based updates are instant; polling is wasteful.
- **Achieves:** Live dashboard feed, live stats, live engine state.
- **Uses/Connects To:** socket.io → frontend `useSocket` hook.
- **Acceptance:** Socket handshake 200; live feed updates on visit.

### ✅ STEP 2.4 — Server-Sent Events (SSE) Live Stream
- **What:** `GET /api/visits/live` SSE endpoint as WebSocket alternative.
- **Why:** Some environments/proxies handle SSE more predictably.
- **Achieves:** Event-stream fallback for live visits.
- **Uses/Connects To:** `routes.js` → Socket.IO event bus.
- **Acceptance:** SSE connection streams visit events.

### ✅ STEP 2.5 — Graceful Shutdown & Health Endpoint
- **What:** SIGINT/SIGTERM handling; `/health` endpoint.
- **Why:** Clean restarts; orchestrators can health-check.
- **Achieves:** Timer cleanup, DB close, listener close on shutdown.
- **Uses/Connects To:** `index.js` → Scheduler, DB, server.
- **Acceptance:** SIGTERM exits cleanly within 5s.

---

# PHASE 3 — FRONTEND DASHBOARD ✅ COMPLETE

### ✅ STEP 3.1 — React + Vite + Tailwind Setup
- **What:** React 18 + Vite 5 + Tailwind 3 + PostCSS + React Router 6.
- **Why:** Fast HMR, modern tooling, production-ready.
- **Achieves:** Dev server on :3000 with `/api` + `/socket.io` proxy to backend.
- **Uses/Connects To:** Vite dev proxy → backend :3001.
- **Acceptance:** `npm run dev` + `npm run build` both succeed.

### ✅ STEP 3.2 — App Shell, Sidebar & Navigation
- **What:** Fixed sidebar with 7 routes; connection status indicator.
- **Why:** Professional dashboard navigation.
- **Achieves:** Dashboard, Proxies, URLs, History, Analytics, Logs, Settings.
- **Uses/Connects To:** React Router, lucide-react icons.
- **Acceptance:** Routes navigate; sidebar active states correct.

### ✅ STEP 3.3 — Dashboard Overview Page
- **What:** Stats cards (Total Visits, Success Rate, Active Proxies, Uptime), live feed, engine controls, quick info, world map.
- **Why:** Main control center with key metrics at a glance.
- **Achieves:** Real-time monitoring with instant control.
- **Uses/Connects To:** `useSocket` hook, StatsCard, LiveFeed, EngineControls, WorldMap.
- **Acceptance:** Stats update live; start/pause/stop work.

### ✅ STEP 3.4 — Live Visit Feed
- **What:** Scrolling feed of visits with flag, subdomain, latency, status badge, HTTP code.
- **Why:** Visual proof visits are happening, live.
- **Achieves:** 100-visit buffer, newest-first, color-coded success/failure.
- **Uses/Connects To:** `visit:complete` socket event.
- **Acceptance:** New visit appears at top within a second.

### ✅ STEP 3.5 — Engine Controls Panel
- **What:** Start/Pause/Stop/Resume buttons + one-off "Visit Now" + live config summary.
- **Why:** Operators need immediate control.
- **Achieves:** Full engine lifecycle control from the UI.
- **Uses/Connects To:** `api.js` engine endpoints.
- **Acceptance:** Buttons reflect state; toasts confirm actions.

### ✅ STEP 3.6 — Proxy Management Page
- **What:** Proxy table (location, host, port, status, success/fail counts, rate, latency), health-check (all + one), enable/disable toggle, add/remove, world map.
- **Why:** Operators must monitor and manage the proxy pool.
- **Achieves:** Full proxy lifecycle management with live health.
- **Uses/Connects To:** `api.js` proxy endpoints → Proxy Table + WorldMap.
- **Acceptance:** Toggle/check/add/remove all verified.

### ✅ STEP 3.7 — URL Management Page
- **What:** URL table (subdomain, visits, success, rate, priority slider, last visit), add/remove, bulk import, toggle.
- **Why:** Manage target pool without restart.
- **Achieves:** Dynamic URL pool management with priority weighting.
- **Uses/Connects To:** `api.js` URL endpoints → UrlTable.
- **Acceptance:** Priority slider persists; bulk import works.

### ✅ STEP 3.8 — Visit History Page
- **What:** Paginated table with filters (all/success/failed), URL search, CSV export, pagination controls.
- **Why:** Complete audit trail of every visit.
- **Achieves:** Searchable, exportable history.
- **Uses/Connects To:** `api.js` visits endpoints → History page.
- **Acceptance:** Pagination + filters + CSV export verified.

### ✅ STEP 3.9 — Analytics Page
- **What:** Timeline chart (visits over time), latency chart, URL distribution, proxy distribution pie, time range selector (1h/24h/3d).
- **Why:** Understand trends and spot problems.
- **Achieves:** Visual analytics across time and dimensions.
- **Uses/Connects To:** Recharts → analytics endpoints.
- **Acceptance:** Charts render with real data.

### ✅ STEP 3.10 — Settings Page
- **What:** Interval sliders, concurrency, timeout, retries, mode selector, presets (stealth/moderate/aggressive/maximum), DB cleanup.
- **Why:** Tunable engine behavior without code changes.
- **Achieves:** Runtime-configurable engine.
- **Uses/Connects To:** `api.js` config endpoints → Settings page.
- **Acceptance:** Saved config applies; presets work.

### ✅ STEP 3.11 — Logs Viewer Page
- **What:** Auto-refreshing log viewer with level filtering and text search.
- **Why:** Debugging and operational visibility.
- **Achieves:** Live system logs in the UI.
- **Uses/Connects To:** `api.js` logs endpoint → Logs page.
- **Acceptance:** Logs stream; filter works.

### ✅ STEP 3.12 — Toast Notifications & Dark Theme
- **What:** Sonner toasts for all actions; dark-themed responsive design.
- **Why:** Professional appearance, accessibility, feedback.
- **Achieves:** Consistent UX with instant feedback.
- **Uses/Connects To:** sonner, Tailwind dark mode.
- **Acceptance:** Toasts on every action; responsive layout.

---

# PHASE 4 — ADVANCED ENGINE FEATURES 🟡 IN PROGRESS (62%)

### ✅ STEP 4.1 — Anti-Detection Header Rotation
- **What:** Full realistic header sets per visit (UA, Accept, Accept-Language, Sec-Fetch, Cache-Control, Referer).
- **Why:** Headers must match a real browser session.
- **Achieves:** Visits look like genuine browser navigation.
- **Uses/Connects To:** Visit Engine headers.
- **Acceptance:** Header set reviewed against real Chrome traffic.

### ✅ STEP 4.2 — Circuit Breaker Pattern
- **What:** Proxy cools down after consecutive failures; half-open probe; auto-restore.
- **Why:** Don't keep hammering a dead proxy.
- **Achieves:** Self-healing proxy pool.
- **Uses/Connects To:** Proxy Manager circuit logic.
- **Acceptance:** Dead proxy removed from rotation for cooldown window.

### ✅ STEP 4.3 — Geo-Spread Rotation
- **What:** Selection strategy that balances visits across countries (least-recently-used per country).
- **Why:** Concentrated geo traffic is a detection signal.
- **Achieves:** Natural geographic distribution.
- **Uses/Connects To:** `ProxyManager.getGeoSpread()` → Scheduler.
- **Acceptance:** Country distribution stays balanced over time.

### ✅ STEP 4.4 — Visit Verification
- **What:** Status-code check (<500 = received), response-size capture, mode tagging.
- **Why:** Verify visits actually reached the target.
- **Achieves:** Trustworthy success metrics.
- **Uses/Connects To:** Visit Engine outcome capture.
- **Acceptance:** Success = valid response received through proxy.

### ✅ STEP 4.5 — Manual One-Off Visit
- **What:** `POST /api/visit/manual` + "Visit Now" button.
- **Why:** Operators want instant verification of a single visit.
- **Achieves:** On-demand visit execution from UI.
- **Uses/Connects To:** Visit Engine → UI button.
- **Acceptance:** Manual visit executes and appears in feed.

### ⬜ STEP 4.6 — Browser-Mode Stealth & Behavior Simulation
- **What:** (Planned) Extend Puppeteer mode: stealth plugins, scroll depth, mouse movement, dwell time, tab focus.
- **Why:** Advanced bot detection requires behavioral realism.
- **Achieves:** Browser visits indistinguishable from humans.
- **Uses/Connects To:** puppeteer-extra-plugin-stealth, browser-mode.js.
- **Acceptance:** Browser visits pass bot-detection tests.

### ⬜ STEP 4.7 — Schedule Presets (Persistent)
- **What:** (Planned) Save preset schedules server-side; apply from dashboard.
- **Why:** Common configurations should be one click.
- **Achieves:** Predefined operating modes.
- **Uses/Connects To:** system_config table + config API.
- **Acceptance:** Presets persist across restarts.

### ⬜ STEP 4.8 — Visit Rate Limiting & Burst Prevention
- **What:** (Planned) Max visits/minute cap; burst smoothing.
- **Why:** Prevents hammering targets/proxies.
- **Achieves:** Adaptive pacing.
- **Uses/Connects To:** Scheduler + Proxy Manager.
- **Acceptance:** Hard cap enforced per minute.

---

# PHASE 5 — ANDROID APPLICATION 🔵 SCAFFOLDED (7%)

> **Environment note:** Android Studio SDK / Gradle are not available in this sandbox.
> The Kotlin project structure is scaffolded; building APKs requires Android SDK.
> The Android app can either (A) control the web backend remotely, or
> (B) run a standalone engine with its own proxies. Both are detailed below.

### ✅ STEP 5.1 — Android Project Structure & Architecture Decision
- **What:** Decided: Android app = remote control + standalone engine hybrid. Kotlin + Jetpack Compose + MVVM.
- **Why:** Mobile operators need on-the-go monitoring; standalone engine gives offline capability.
- **Achieves:** Clear Android architecture before code.
- **Uses/Connects To:** Web API (option A) + Room-based standalone engine (option B).
- **Acceptance:** Architecture documented; gradle files scaffolded.

### 🔵 STEP 5.2 — Android Gradle Project Scaffold
- **What:** (Next) `android/` Gradle project: settings.gradle.kts, app/build.gradle.kts, AndroidManifest, Kotlin source tree, Compose + Hilt + OkHttp + Room + WorkManager deps.
- **Why:** Buildable project skeleton before feature code.
- **Achieves:** `./gradlew assembleDebug` compiles.
- **Uses/Connects To:** Android SDK 34+, Gradle 8, Compose BOM.
- **Acceptance:** Gradle sync succeeds; empty app installs.

### ⬜ STEP 5.3 — Android Network Layer (OkHttp + Proxy)
- **What:** OkHttp client factory with proxy + proxy authenticator; interceptors for UA/header rotation; SSL/TLS config; Retrofit for backend API.
- **Why:** Native proxy support with auth; same rotation semantics as web.
- **Achieves:** Proxied requests from Android match web behavior.
- **Uses/Connects To:** OkHttp, Retrofit, proxy pool config.
- **Acceptance:** Manual visit via Android works through a proxy.

### ⬜ STEP 5.4 — Android Proxy Manager
- **What:** Port of web ProxyManager: data class, Room repository, health-check coroutine, rotation strategies, StateFlow status.
- **Why:** Same reliability guarantees on mobile.
- **Achieves:** Rotating, health-checked proxy pool on device.
- **Uses/Connects To:** Room, Coroutines, SharedPreferences for proxy list.
- **Acceptance:** Health check updates StateFlow; rotation strategies tested.

### ⬜ STEP 5.5 — Android Visit Engine
- **What:** Visit executor with OkHttp+proxy; optional WebView visits for JS execution; visit result model; Room repository; concurrent dispatch.
- **Why:** Core engine on mobile (standalone mode).
- **Achieves:** Random proxy+URL visits recorded locally.
- **Uses/Connects To:** OkHttp, WebView, Room, Coroutines.
- **Acceptance:** Visits execute + persist; distribution across URLs balanced.

### ⬜ STEP 5.6 — Android Background Service
- **What:** Foreground service with persistent notification; WorkManager health checks; boot receiver; Doze handling.
- **Why:** Android kills background apps; foreground service persists.
- **Achieves:** Continuous background visits with battery-safe scheduling.
- **Uses/Connects To:** ForegroundService, WorkManager, NotificationChannel.
- **Acceptance:** Service survives screen-off; notification visible.

### ⬜ STEP 5.7 — Android Room Database
- **What:** Entities: VisitEntity, ProxyEntity, ConfigEntity; DAOs; migrations.
- **Why:** Local persistence for standalone mode + offline history.
- **Achieves:** Type-safe local storage.
- **Uses/Connects To:** Room, Kotlinx Serialization.
- **Acceptance:** Room schema export + migration tests pass.

### ⬜ STEP 5.8 — Android UI: Dashboard Screen
- **What:** Compose screen: engine status card, FAB start/stop, stats row, live feed LazyColumn, mini chart, pull-to-refresh.
- **Why:** Mobile operators need the same live view.
- **Achieves:** On-the-go monitoring.
- **Uses/Connects To:** Compose, ViewModel, StateFlow.
- **Acceptance:** Dashboard mirrors web live data.

### ⬜ STEP 5.9 — Android UI: Proxy & URL Screens
- **What:** Proxy list with status/health; URL list with priority; add/remove dialogs.
- **Why:** Mobile management of pools.
- **Achieves:** Full pool management on device.
- **Uses/Connects To:** Compose + repositories.
- **Acceptance:** Toggle/priority changes persist.

### ⬜ STEP 5.10 — Android UI: History, Analytics & Settings
- **What:** Visit history list, analytics summary cards, settings (intervals, concurrency, mode, backend URL, data retention).
- **Why:** Complete parity with web for mobile.
- **Achieves:** Mobile-first full control.
- **Uses/Connects To:** Compose + ViewModels + Room.
- **Acceptance:** Settings saved; history exportable.

### ⬜ STEP 5.11 — Android Push Notifications
- **What:** Notifications: engine started/stopped, proxy down, milestone visits, error threshold, all proxies failed.
- **Why:** Proactive alerts without open app.
- **Achieves:** Operators informed in real time.
- **Uses/Connects To:** NotificationManager, WorkManager.
- **Acceptance:** All notification types fire correctly.

### ⬜ STEP 5.12 — Android ↔ Web Sync
- **What:** Sync Android visits to web backend (or vice versa) when both run; conflict resolution by timestamp.
- **Why:** Unified analytics across devices.
- **Achieves:** Cross-device data consistency.
- **Uses/Connects To:** Web API + Room merge logic.
- **Acceptance:** Merge tests pass (no duplicates).

### ⬜ STEP 5.13 — Android Build & Distribution
- **What:** Release signing, ProGuard/R8, APK size optimization, direct APK distribution (no Play Store — automation apps restricted), in-app update check.
- **Why:** Ship Android without policy issues.
- **Achieves:** Signed, optimized APK distribution pipeline.
- **Uses/Connects To:** Gradle signing config, GitHub Releases.
- **Acceptance:** Signed APK < 30MB; update check works.

### ⬜ STEP 5.14 — Android Testing
- **What:** Unit tests (ViewModels, repositories), instrumented tests (Room, network), Compose UI tests.
- **Why:** Mobile crashes are costly; tests prevent regressions.
- **Achieves:** Confidence in Android builds.
- **Uses/Connects To:** JUnit, Robolectric, ComposeTestRule.
- **Acceptance:** Coverage ≥ 60% on core modules.

---

# PHASE 6 — TESTING ⬜ NOT STARTED

### ⬜ STEP 6.1 — Backend Unit Tests
- **What:** Jest/Vitest tests: proxy rotation strategies, URL weighting, error classification, retry logic, config validation.
- **Why:** Core logic must be provably correct.
- **Achieves:** Regression safety for engine internals.
- **Uses/Connects To:** Vitest + supertest.
- **Acceptance:** ≥ 70% coverage on core/.

### ⬜ STEP 6.2 — API Integration Tests
- **What:** Supertest suites for all endpoints: start/stop, proxy toggle, URL add/remove, config patch, visits pagination, analytics queries.
- **Why:** API contract must be stable for web + Android clients.
- **Achieves:** Verified endpoint contracts.
- **Uses/Connects To:** Supertest + Express test harness.
- **Acceptance:** All endpoints pass contract tests.

### ⬜ STEP 6.3 — E2E Tests (Frontend)
- **What:** Playwright tests: dashboard loads, start engine, live feed updates, proxy toggle, URL add, settings save.
- **Why:** UI flows must work end-to-end.
- **Achieves:** Confidence in the dashboard.
- **Uses/Connects To:** Playwright + demo mode backend.
- **Acceptance:** 10 core flows pass in CI.

### ⬜ STEP 6.4 — Real Proxy Validation
- **What:** With real network: verify each proxy works against target URLs; confirm IP differs per proxy (ipinfo check); benchmark latency; find concurrent-connection limits.
- **Why:** The proxy pool is the app's lifeline.
- **Achieves:** Validated, characterized proxy pool.
- **Uses/Connects To:** Health-check endpoints + manual scripts.
- **Acceptance:** Pool status documented; dead proxies flagged.

### ⬜ STEP 6.5 — Load Testing
- **What:** Sustained concurrency test; browser-pool memory profiling; DB performance at 100K+ records; WebSocket with 10+ dashboards.
- **Why:** Prove production-grade capacity.
- **Achieves:** Capacity numbers for scaling decisions.
- **Uses/Connects To:** k6/autocannon + profiling.
- **Acceptance:** Targets met at 2× expected load.

### ⬜ STEP 6.6 — Security Testing
- **What:** Pen-test pass: auth, rate limiting, input injection, CORS, header security, secret leakage scan.
- **Why:** The dashboard exposes control of a traffic engine.
- **Achieves:** Hardened public surface.
- **Uses/Connects To:** OWASP checks + secret scanners.
- **Acceptance:** No high/critical findings.

---

# PHASE 7 — DEPLOYMENT & DEVOPS 🟡 IN PROGRESS (40%)

### ✅ STEP 7.1 — Docker Containerization
- **What:** Multi-stage Dockerfiles for server (node:22-alpine, non-root, healthcheck) + client (Vite build → nginx, API/Socket proxy).
- **Why:** Consistent deployment anywhere.
- **Achieves:** One-command deployment.
- **Uses/Connects To:** Docker, nginx.conf.
- **Acceptance:** `docker compose up` serves dashboard.

### ✅ STEP 7.2 — Docker Compose Orchestration
- **What:** `docker-compose.yml` with backend + frontend, volumes for data/logs, env passthrough, restart policies.
- **Why:** Full-stack local/production parity.
- **Achieves:** Backend + frontend + persistence in one command.
- **Uses/Connects To:** Docker Compose, .env.
- **Acceptance:** Compose stack healthy end-to-end.

### ⬜ STEP 7.3 — CI/CD Pipeline
- **What:** GitHub Actions: lint → test → build → docker push → deploy.
- **Why:** Automated, repeatable releases.
- **Achieves:** Push-to-deploy.
- **Uses/Connects To:** GitHub Actions, Docker registry.
- **Acceptance:** Pipeline green on merge.

### ⬜ STEP 7.4 — Cloud Deployment Options
- **What:** Document + implement VPS (Docker), Railway/Render (Docker auto-deploy), or self-hosted.
- **Why:** The app must be reachable by the operator.
- **Achieves:** Running production instance.
- **Uses/Connects To:** Docker, HTTPS (Let's Encrypt).
- **Acceptance:** Live dashboard + engine on public host.

### ⬜ STEP 7.5 — Production Monitoring & Alerting
- **What:** Uptime monitoring (health endpoint), disk/memory alerts, error-rate alerts, daily summary reports.
- **Why:** Operate with confidence, not guesswork.
- **Achieves:** Proactive operational awareness.
- **Uses/Connects To:** UptimeRobot, email/Telegram alerts.
- **Acceptance:** Alerts fire on simulated failures.

---

# PHASE 8 — SECURITY & HARDENING 🟡 IN PROGRESS (50%)

### ✅ STEP 8.1 — Credential Security
- **What:** Proxy credentials in env only; `.env` in `.gitignore`; `.env.example` for documentation.
- **Why:** Proxy credentials are valuable; leaking them = stolen bandwidth.
- **Achieves:** No secrets in code or Git history.
- **Uses/Connects To:** dotenv, .gitignore.
- **Acceptance:** `git grep` finds no credentials.

### ✅ STEP 8.2 — Network & Header Security
- **What:** Helmet security headers, CORS restriction, rate limiting, JSON body limits.
- **Why:** Protect the API surface.
- **Achieves:** Reduced attack surface.
- **Uses/Connects To:** helmet, cors, express-rate-limit.
- **Acceptance:** Headers + CORS + limits verified.

### ⬜ STEP 8.3 — Access Control & Authentication
- **What:** Dashboard login (username/password or API key), JWT, session timeout, lockout, audit log.
- **Why:** The dashboard controls a traffic engine — must be access-controlled.
- **Achieves:** Only authorized operators can start/stop visits.
- **Uses/Connects To:** Auth middleware, system_config.
- **Acceptance:** Unauth requests rejected; lockout works.

### ⬜ STEP 8.4 — Data & Traffic Hygiene
- **What:** SQL injection prevention (parameterized queries — already), log redaction of credentials, request size limits, target-side 429 handling (back off when rate-limited).
- **Why:** Stay polite to targets; protect operator data.
- **Achieves:** Safe, respectful operation.
- **Uses/Connects To:** Prepared statements, logger redaction, backoff on 429.
- **Acceptance:** No injection vectors; 429s trigger backoff.

---

# PHASE 9 — DOCUMENTATION & POLISH 🟡 IN PROGRESS (25%)

### ✅ STEP 9.1 — Project README & Quick Start
- **What:** README with purpose, architecture, install, config, API docs, troubleshooting.
- **Why:** Operators must be able to run this without support.
- **Achieves:** Self-serve documentation.
- **Uses/Connects To:** This repo, .env.example.
- **Acceptance:** A fresh clone boots in < 5 minutes.

### ⬜ STEP 9.2 — API Documentation
- **What:** OpenAPI/Swagger spec for all 25+ endpoints.
- **Why:** Web + Android clients + integrations need a contract.
- **Achieves:** Auto-generated, always-current API docs.
- **Uses/Connects To:** swagger-ui-express or OpenAPI yaml.
- **Acceptance:** Spec validates against live endpoints.

### ⬜ STEP 9.3 — In-App Help, Tooltips & Onboarding
- **What:** Tooltips on controls, first-run onboarding tour, status explanations.
- **Why:** Lower the learning curve for operators.
- **Achieves:** Self-explanatory UI.
- **Uses/Connects To:** Dashboard components, tooltip lib.
- **Acceptance:** Onboarding tour completes without guidance.

### ⬜ STEP 9.4 — Performance Optimization
- **What:** Frontend code splitting, DB index review, browser-pool recycling, connection pool sizing, vacuum scheduling.
- **Why:** Long-running engine must stay lean.
- **Achieves:** Sustained performance under continuous load.
- **Uses/Connects To:** Vite lazy loading, SQLite pragmas.
- **Acceptance:** Memory stable over 24h soak test.

---

# 🔄 DEPENDENCY GRAPH (WEB)

```
Phase 0 Foundation ──► Phase 1 Backend ──► Phase 2 API ──► Phase 3 Frontend
                                              │                     │
                                              └──► Phase 4 Advanced ┘
                                                                  │
      Phase 5 Android ──► Phase 6 Testing ──► Phase 7 Deploy ──► Phase 8 Security
         (own engine + sync)                 └────────► Phase 9 Docs
```

---

# 🎯 RECOMMENDED EXECUTION ORDER

1. **Phase 6 — Testing** (harden what's built; verify proxy pool with real network)
2. **Phase 8.3 — Access control** (dashboard is currently open — secure before sharing)
3. **Phase 7.3 — CI/CD** + **7.4 — cloud deploy** (make it run anywhere)
4. **Phase 5 — Android** (mobile operator app)
5. **Phase 9 — Docs & polish** (sustainability)

---

## ✅ WHAT'S DONE (Web)

- ✅ Full backend: proxy manager, URL manager, visit engine, scheduler, DB, API, WebSocket, SSE, logging
- ✅ Real retry/backoff, error classification, circuit breaker, geo-spread rotation
- ✅ React dashboard: live feed, engine controls, proxy/URL management, history, analytics, logs, settings
- ✅ Demo mode for offline testing; optional Puppeteer browser mode
- ✅ Docker (server + client) with nginx reverse proxy
- ✅ Credentials via env; security headers; rate limiting
- ✅ Integration-tested end-to-end (server + built client + live stats)

## 🔜 WHAT'S NEXT

1. **Testing hardening (Phase 6)** — unit/integration/E2E suites
2. **Real proxy validation** — verify the 10 proxies against the 27 targets (requires real network)
3. **Access control (Phase 8.3)** — login on dashboard
4. **Android app (Phase 5)** — Gradle scaffold → network layer → UI
5. **Production deploy (Phase 7.3/7.4)** — CI/CD + cloud

---

*This roadmap is a living document — update statuses as steps complete.*
