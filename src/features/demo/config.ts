import Constants from 'expo-constants';

/**
 * Single source of truth for whether this build runs the offline demo backend
 * (`src/features/demo/router.ts`) instead of the real Laravel API.
 *
 * Controlled by `extra.demoMode` in app.json — NOT by `__DEV__`. A demo APK that a stakeholder
 * installs and taps through is a release build, so gating this on a development-only flag would
 * make it impossible to ship a demo build at all. See `app.json`'s `_comment_demoMode` for how to
 * turn this off for a build that must talk to the real backend.
 *
 * HONESTY REQUIREMENT — read before touching this file, `router.ts`, or `useRealtime.ts`.
 *
 * Demo mode "feels realtime" only because every screen reads and writes the SAME in-process
 * JavaScript object (`src/features/demo/store.ts`) held in memory on this one device. Two screens
 * on the same phone appear to update instantly because they are the same memory address, not
 * because anything was broadcast to anyone. That is NOT evidence that requirement 3
 * (cross-device realtime over Laravel Reverb) works — proving that needs an actually running
 * Reverb server and two separate devices/sessions talking to it over a socket.
 *
 * `useRealtime()` is deliberately left untouched by demo mode: it still attempts a real
 * WebSocket connection, and — having no Reverb server to reach — never transitions to
 * `connected`. Do not special-case demo mode inside `useRealtime()` to make it report
 * `connected`, and do not add any demo-mode banner or copy that implies cross-device realtime
 * has been demonstrated. What the demo actually proves is the state machine and the guards; what
 * it cannot prove is the transport, and the UI must never blur that line.
 */
export function isDemoMode(): boolean {
  return Constants.expoConfig?.extra?.['demoMode'] === true;
}
