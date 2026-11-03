# 📱 WebSense Android App

The WebSense dashboard as a **native Android app** (Capacitor 8 wrapping the
React client). The app bundles the dashboard UI locally and talks to your
websense server over HTTP(S) for the API and live Socket.IO updates — so the
server keeps running wherever you deploy it (VPS, home LAN, laptop), while the
phone gets a launcher icon, offline app shell, and full-screen dark UI.

```
phone app (bundled UI)  ──HTTP/WS──►  websense server (your host)
   capacitor://…                          /api + socket.io
```

## Prerequisites

- **Node.js 20+** (22 recommended)
- **JDK 17+**
- **Android Studio** (easiest) *or* Android SDK + build-tools on PATH
- Internet access on the build machine for Gradle dependencies
  (Google Maven / Maven Central — one-time download)

> The APK **cannot** be compiled inside the Arena sandbox (no access to
  Google's Maven repos) — build it on your machine or CI with the steps below.

## Build the APK

```bash
cd client
npm install                 # installs @capacitor/* + web deps
npm run build               # vite build → dist/
npx cap sync android        # copies dist/ + config into android/

cd android
./gradlew assembleDebug     # Windows: gradlew.bat assembleDebug
```

APK output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a device: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
or copy the APK over and open it (allow unknown sources).

**Release build:** `./gradlew assembleRelease` — unsigned release APK needs a
signing config (or sign it with `apksigner`) before installing anywhere.

**Android Studio route:** `File → Open → client/android`, let it sync, hit ▶ Run.

## First launch — point the app at your server

1. Open **WebSense** → the app lands on **Settings** (setup banner).
2. Enter your server URL under **Server connection**, e.g.:
   - Hosted: `https://your-server.example.com:3111`
   - Emulator talking to your machine: `http://10.0.2.2:3111`
   - Same Wi-Fi/LAN: `http://192.168.1.50:3111`
3. **Save & reconnect** — the app reloads and connects (API + live feed).

The URL persists in the app (`localStorage websense_server_origin`). Leave it
empty to use same-origin (the normal web deployment behavior).

### Server-side requirements

- The server must be reachable from the phone (open port / reverse proxy).
- Default CORS already allows the app's WebView origin
  (`https://localhost`, `capacitor://localhost`). If you override
  `CORS_ORIGINS`, include them.
- Optional API token: set `API_TOKEN` on the server and store the same value
  in the app's `websense_api_token` localStorage key (or bake
  `VITE_API_TOKEN` at build time).
- Cleartext HTTP to LAN addresses is enabled in the app
  (`android:usesCleartextTraffic="true"`) — prefer HTTPS on the public
  internet.

## Project layout

```
client/
├── capacitor.config.json      # appId com.cyberelias.websense, appName WebSense
├── dist/                      # vite build (webDir)
├── assets-src/app-icon-1024.png   # icon source artwork
└── android/                   # generated native project (committed)
    └── app/src/main/
        ├── AndroidManifest.xml     # INTERNET + cleartext for LAN
        └── res/mipmap-*/           # launcher icons (all densities)
```

Generated web assets inside `android/app/src/main/assets/public/` are
gitignored — always run `npm run build && npx cap sync android` before
`gradlew` so the APK contains the current UI.

## Customizing

- **Name / package:** edit `client/capacitor.config.json` (`appName`,
  `appId`), then `npx cap sync android`. Update
  `android/app/src/main/res/values/strings.xml` if needed (the sync keeps
  `app_name` from `appName`).
- **Icon:** replace `client/assets-src/app-icon-1024.png` (square, ≥1024px),
  regenerate the densities (ImageMagick):

  ```bash
  cd client && SRC=assets-src/app-icon-1024.png && RES=android/app/src/main/res
  for pair in "mdpi 48 108" "hdpi 72 162" "xhdpi 96 216" "xxhdpi 144 324" "xxxhdpi 192 432"; do
    set -- $pair; D=$1; S=$2; F=$3
    convert "$SRC" -resize ${S}x${S} "$RES/mipmap-$D/ic_launcher.png"
    convert "$SRC" -resize ${S}x${S} \( -size ${S}x${S} xc:none -fill white \
      -draw "circle $((S/2)),$((S/2)) $((S/2)),0" \) -alpha off \
      -compose CopyOpacity -composite "$RES/mipmap-$D/ic_launcher_round.png"
    I=$((F*72/100))
    convert "$SRC" -resize ${I}x${I} \( -size ${F}x${F} xc:none \) +swap \
      -gravity center -composite "$RES/mipmap-$D/ic_launcher_foreground.png"
  done
  ```
  Then match `res/values/ic_launcher_background.xml` to the artwork's corner
  color and `npx cap sync android`.

## Behavior notes

- **First launch with no server:** the app redirects to Settings with a
  setup banner instead of hammering dead endpoints.
- **Live feed:** Socket.IO connects to the configured origin with
  websocket→polling fallback; the header dot shows connection state.
- **Mobile layout:** the sidebar collapses into a drawer behind the
  hamburger menu below `lg` breakpoints; every dashboard page is reachable.
- **Engine pages** (start/stop visits, proxies, QA matrix) control the
  *server's* engine — the phone is a remote, not a runner.
