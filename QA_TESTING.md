# 🧪 Geo/Device QA Testing

> **Purpose:** Verify how *your own* properties behave for users in different countries and on different devices — detect geo-blocks, device blocks (app walls), redirect loops, and content divergence — using your proxy pool as vantage points and a device-profile matrix.
>
> **Status:** ✅ Implemented & tested (34 automated tests green + live smoke verified). Dashboard page: **Geo/Device QA** (`/qa`).

---

## What this is (and what it deliberately is not)

| | |
|---|---|
| **It IS** | A QA/testing tool for properties **you own or operate**. Run a URL × device × country matrix, get a heatmap of what real users in each cell would see. |
| **It is NOT** | A traffic generator. QA runs are **low-volume** (small concurrency + fixed delay + per-run cell cap), **manual or interval-scheduled** (no organic-impersonation randomization), and **openly identified**: every request carries the header `X-Websense-QA: run:<runId>` so you can whitelist it in your WAF and filter it out of GA4. |
| **Deliberately absent** | Stealth plugins, fingerprint spoofing, fake referrers, GA session shaping, captcha solving. You own the sites — you never need to evade your own defenses; whitelist the QA header instead. |

---

## The matrix model

A **run** evaluates every combination of:

```
URL (default: all 27 enabled targets, or a scoped subset)
  × device profile (desktop Chrome/Firefox/Safari, iPhone, Android, iPad)
  × vantage point (one active proxy per country — e.g. GB, ES, US, PL, DE — plus DIRECT, the no-proxy control)
```

Each resulting **cell** captures:

- Final HTTP status + full **redirect chain** (loops and block-redirects included)
- Final URL + curated response headers (`content-type`, `content-language`, `server`, `cf-*`, …)
- Page title + normalized visible-text **content hash** (sha256, volatile tokens like timestamps redacted)
- **Restriction signals** (see below)
- In **browser mode**: rendered DOM text, screenshot, console-error count, failed-request count

### Restriction signals detected per cell

| Signal | Detected by |
|---|---|
| `geo_blocked` | HTTP **451**, 403 + geo block copy, block phrases on a 200 interstitial ("not available in your region/country…"), redirect to a geo-block page |
| `device_blocked` | App-wall / unsupported-device copy ("download our app", "not supported on this device/browser"…), device-specific redirect loops |
| `redirect_loop` | Same URL appearing twice in the redirect chain |
| `http_error` / `network_error` | 4xx/5xx not otherwise classified; DNS/timeout/TLS/proxy failures (with reason) |

### Baseline comparison

Per URL, the runner picks the **modal good capture** as the baseline (the content group most cells agree on, preferring desktop+DIRECT), then classifies every cell against it:

| Class | Meaning |
|---|---|
| `identical` | Same normalized content as baseline |
| `similar` | Similarity ≥ 0.72 — minor drift (ads, timestamps), usually fine |
| `divergent` | Similarity < 0.72 — **different content served to this cell** (locale variant, A/B, misconfiguration) |
| `geo_blocked` / `device_blocked` / `redirect_loop` | Restriction detected (see signals) |
| `http_error` / `network_error` / `unavailable` | Infra problems (unreachable vantage, no Chrome, …) |

---

## REST API (`/api/qa`)

| Endpoint | What it does |
|---|---|
| `GET /api/qa/capabilities` | Device profiles, countries covered by your active proxy pool, browser-mode availability, config defaults |
| `POST /api/qa/runs` | Start a run. Body (all optional): `urls[]`, `deviceIds[]`, `countries[] \| ["*"]`, `includeDirect` (default true), `mode: http\|browser\|auto`, `note`. Returns `202 {runId, totalCells, mode}` |
| `GET /api/qa/runs` | Recent runs + active run ids |
| `GET /api/qa/runs/:id` | Run detail + all cells |
| `GET /api/qa/runs/:id/matrix` | Pivoted heatmap structure (rows=URLs, columns=vantage×device, counts) |
| `POST /api/qa/runs/:id/cancel` | Cancel a running sweep |
| `GET /api/qa/runs/:id/exposure` | Per-cell detectability scores + rule catalog (blue-hat view) |
| `GET /api/qa/exposure/visits?limit=N` | Offline exposure audit of the engine's recent `visits` |
| `GET /api/qa/exposure/trends?limit=N` | Cross-run detectability snapshots (powers the trend chart) |
| `POST /api/qa/sentinel/ingest` / `GET /api/qa/sentinel/observations` | Bridge for sentinel middleware observations from your own sites |
| `GET /api/qa/cells/:id/screenshot` | Cell screenshot (browser mode; path-traversal-guarded) |

Socket.IO live events: `qa:progress` `{runId, done, total, cell}` and `qa:run_complete` `{runId, status, flagged, …}`.

Validation: unknown device profiles, non-HTTP(S) URLs and oversized matrices are rejected with `400` (`QA_MAX_CELLS` bounds the run; hard cap 1500).

---

## Configuration (env / `server/.env`)

| Var | Default | Effect |
|---|---|---|
| `QA_ENABLED` | `1` | Master switch (mounts `/api/qa` + dashboard page) |
| `QA_CAPTURE_MODE` | `http` | `http` (fast, structural), `browser` (rendered DOM + screenshots, needs Chrome), `auto` |
| `QA_CONCURRENCY` | `2` | Parallel cell captures (bounded ≤ 6) |
| `QA_REQUEST_DELAY_MS` | `1000` | Fixed pacing between captures |
| `QA_MAX_CELLS` | `400` | Per-run cell cap |
| `QA_TIMEOUT_MS` | `30000` | Per-request timeout |
| `QA_IDENTIFY_HEADER` | `1` | Send `X-Websense-QA: run:<id>` on every request — whitelist/filter on your side |
| `QA_SWEEP_INTERVAL_MIN` | `0` | >0 = automatic full-matrix sweeps on this cadence |
| `QA_SIMILARITY_THRESHOLD` | `0.72` | Below → `divergent` |
| `QA_VANTAGE_PROXIES` | `1` | Proxies per country per run (1–3; raise only if you need proxy-level triangulation) |
| `QA_CLEANUP_DAYS` | `14` | QA run retention (daily cleanup) |
| `QA_SCREENSHOT_DIR` | `server/data/qa-screenshots` | Browser-mode screenshots |

Browser mode needs Chrome: install `puppeteer` where its download host is reachable, or set `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` to a system Chrome. Without it, browser cells report `unavailable` and HTTP mode still covers status/redirect/copy-based detection.

---

## How to read results (recommended workflow)

1. **Run the full matrix** (dashboard → Geo/Device QA → *Start matrix run*), or a scoped one while iterating.
2. **Scan the heatmap rows** — every cell should be green (`identical`/`similar`). Anything else is a finding:
   - **Red (`geo_blocked`)** → that country is gated: check CDN/WAF country rules, `Vary`/locale logic, or intentional regionalization.
   - **Orange (`device_blocked`)** → app-wall or UA-sniffing path triggering for that form factor.
   - **Amber (`divergent`)** → different content served — expected for localization, unexpected for canonical pages.
   - **Gray** → vantage/proxy health, not your site.
3. **Click a flagged cell** for the redirect chain, signals, headers, text sample and (browser mode) screenshot.
4. **Schedule sweeps** (`QA_SWEEP_INTERVAL_MIN=360`) as a regression tripwire: when a deploy changes geo/device behavior, the next sweep flags it.

### Because you own the sites

- Whitelist the `X-Websense-QA` header in Cloudflare/your WAF so bot rules don't 403 your own runs (403-without-copy shows as `http-403-ambiguous`).
- Filter the header (or your runner IPs) out of GA4 so QA sweeps never pollute analytics — no consent-mode tricks needed or wanted.

---

## 👁 Detection exposure — the blue-hat sensing layer

Beyond *"what does each cell receive?"*, websense answers **"what would a bot-detector notice about how this request behaves?"** — the observability half of the loop. Two surfaces:

### 1. `GET /api/qa/runs/:id/exposure` (dashboard: "Detection exposure" panel)

Every cell of a run is scored against a documented catalog of detector heuristics:

| Rule | Severity | The tell |
|---|---|---|
| `no-js-execution` | high | HTTP-mode fetches execute no JS — analytics tags never fire; detectors correlating hits with events see a ghost |
| `timing-uniform` | high | Cohort inter-arrival CV < 0.25 = metronome scheduling; human browsing has CV ≳ 1 |
| `ua-device-mismatch` | high | Mobile UA with desktop device class (or vice versa) — internally inconsistent identity |
| `missing-fetch-metadata` | medium | Browser UA without `Sec-Fetch-*` headers isn't a real browser navigation |
| `no-accept-language` | medium | Real browsers always send one |
| `ua-viewport-mismatch` | medium | Mobile UA on a 1920px viewport, etc. |
| `ua-reuse-cohort` | medium | One UA string carrying >25 % of a cohort |
| `impossible-speed` | medium | Full "visits" completing in < 300 ms |
| `direct-landing-no-referrer` | low | Referrer-less direct landings (weak alone; corroborates) |

The report returns a 0–100 *detectability score* per cell plus aggregates (rule counts, severity totals, cohort-level flags like timing uniformity). Scores are exposed in the dashboard per run and per cell, with the *why* written out for each rule — the point is to watch behavior, not to hide it.

### 2. `GET /api/qa/exposure/visits?limit=N`

Runs the same analyzer **offline over the engine's own recent `visits` table** — a behavioral audit of existing traffic patterns without generating anything new.

### 3. Trends & regression alerts — `GET /api/qa/exposure/trends?limit=20`

Every finished run freezes a snapshot (`qa_exposure_snapshots`: avg detectability, rule counts, severity totals, cohort flags) that **survives cell retention cleanup**, so detectability is chartable across successive runs. The dashboard plots the sparkline and:

- **Regression alert** when a run's average detectability rises ≥ **10 points** over the previous run, or lands in the *easily detected* band (≥ 60) — surfaced as a red warning in the panel;
- **Improvement notice** when it drops ≥ 10 points;
- Per-rule deltas (`↑3` / `↓2`) for the rules that moved, so you can see *which* mannerism changed.

### 4. Sentinel — the defensive half to mount on your own sites

`server/qa/sentinel.js` is a reference Express middleware that scores inbound requests on your properties:

| Sentinel signal | Points | Source |
|---|---|---|
| `automation-ua` | 50 | curl/wget/python-requests, headless/phantom, known crawlers |
| `outdated-tls` | 50 | connection negotiated TLS < 1.2 (`req.socket.getProtocol()`) — modern browsers don't |
| `rapid-fire` / `elevated-rate` | 30 / 10 | ≥ 20 / ≥ 8 requests per identity in 60 s |
| `no-accept-language` | 20 | browser UA without `Accept-Language` |
| `behavior-gap` | 20 | site's own beacon reports **0** behavioral events (`x-sentinel-events: 0` header) — absence of the header is neutral |
| `no-fetch-metadata` | 15 | browser UA without any `Sec-Fetch-*` |
| `no-client-hints` | 10 | Chromium-family UA without `sec-ch-ua` (Chrome ≥ 89 always sends it; Safari excluded) |
| `no-cookies-on-revisit` | 10 | browser UA, no cookies |

It recognizes `X-Websense-QA` probes as self-traffic (`selfProbe: true`), annotates `req.sentinel`, sets an `X-Sentinel-Score` response header for devtools calibration, and **never blocks**. Mount it on your sites, point `onObservation` at `POST /api/qa/sentinel/ingest`, and read back `/api/qa/sentinel/observations` — closing the loop: **websense generates, sentinel detects, the dashboard shows whether detection worked.**

```
websense QA run ──► your site's sentinel ──► /api/qa/sentinel/ingest
        │                                            │
        └──── run exposure report ◄──── observations ┘
```

Use it to calibrate: if sentinel scores real users ≥ 40, your rules misfire; if QA sweeps score ≈ 0, your rules miss.

---

## Architecture

```
server/qa/
├── device-profiles.js   # declared device emulation descriptors + country→Accept-Language map
├── signals.js           # geo/device restriction heuristics (pure functions)
├── compare.js           # normalize → hash → shingle-Jaccard similarity → baseline → classify
├── capture-http.js      # axios capture: manual redirect chain, size cap, proxy per vantage, error taxonomy
├── capture-browser.js   # optional plain-Puppeteer rendered capture + screenshots (no stealth)
├── store.js             # qa_runs / qa_cells tables, matrix pivot, retention cleanup
├── runner.js            # matrix orchestration: concurrency + pacing, cancel, sweep timer, WS progress
├── exposure.js          # blue-hat sensing: per-request detectability heuristics + cohort analysis
├── sentinel.js          # reference defensive middleware for your own sites (detects the traffic)
└── qa-routes.js         # /api/qa: capabilities, runs, matrix, exposure, sentinel ingest/observations
```

Tests: `server/tests/unit/qa-modules.test.js` (28) + `server/tests/unit/qa-exposure.test.js` (26) + `server/tests/integration/qa-runner.test.js` (7 — real matrix execution against a local fixture site with geo/device gating, REST surface, exposure + trends + sentinel endpoints). Run: `cd server && npm test`.
