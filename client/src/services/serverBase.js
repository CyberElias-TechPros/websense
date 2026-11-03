// ---------------------------------------------------------------------------
// Runtime-configurable server origin — the bridge between native (Capacitor)
// builds and the websense backend.
//
// Web (default):  empty string → relative URLs → same origin (unchanged).
// Android app:    bundled assets have no backend, so the user points the app
//                 at their server (hosted or LAN) in Settings → stored here.
// ---------------------------------------------------------------------------

const KEY = 'websense_server_origin';

/** Normalized origin, e.g. "https://demo.example.com:3111" or "" (same origin). */
export function getServerOrigin() {
  const raw = localStorage.getItem(KEY) ?? import.meta.env.VITE_API_ORIGIN ?? '';
  return raw.trim().replace(/\/+$/, '');
}

export function setServerOrigin(origin) {
  localStorage.setItem(KEY, (origin || '').trim().replace(/\/+$/, ''));
}

/** True when running inside a native Capacitor shell (Android/iOS). */
export function isNativeApp() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}
