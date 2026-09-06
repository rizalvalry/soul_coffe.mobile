# Soul Coffeemate — Mobile (Expo / React Native)

Internal field-operations app for the electric-motorbike coffee-cart fleet.
Business specification: [`../docs/02-context-business-process.md`](../docs/02-context-business-process.md)
Task plan: [`../docs/03-task-breakdown.md`](../docs/03-task-breakdown.md)

## Stack (as installed, verified)

| Package | Version |
|---|---|
| expo | 57.0.18 |
| react-native | 0.86.3 |
| react | 19.2.3 |
| typescript | 6.0.3 |
| expo-router | 57.0.17 |
| @tanstack/react-query | 5.102.8 |
| zustand | 5.0.15 |
| react-hook-form | 7.87.0 |
| zod | 4.5.4 |

`@hookform/resolvers` is deliberately **not** installed — it pulls a `react-dom` peer chain that
conflicts with the React version Expo SDK 57 pins. `src/lib/zodResolver.ts` replaces it in 20
lines. Do not add it back with `--legacy-peer-deps`; that hides a real conflict in the lockfile.

## Run

```bash
npm start            # Metro; press 'a' for Android
npm run android      # straight to a connected device/emulator
npm run typecheck    # tsc --noEmit — must stay clean
```

## Real backend

`app.json`'s `extra.demoMode` is `false` and `extra.apiBaseUrl` points at
`https://soulcoffee.rafancloud.com/api/v1` (soul_coffe.backend, Cloudflare-proxied). As of this
writing that domain answers **HTTP 525** — Cloudflare cannot TLS-handshake the origin — on every
path, including `/api/v1/auth/login`. That is a hosting-side problem, not something this app
works around; confirm the fix with `curl -I https://soulcoffee.rafancloud.com/api/v1/auth/login`
before assuming a build against it will actually authenticate.

This app had never been run against a real backend before demoMode was flipped off — every
screen, and the whole `RefillRequest`/`Allocation` shape in `domain/types.ts`, had only ever been
validated against `src/features/demo/router.ts`'s in-memory fixtures. Comparing the real Laravel
resources (soul_coffe.backend `app/Http/Resources/*.php`) against that assumed contract surfaced
real gaps, reconciled in `src/lib/mappers.ts` (full rationale in its docblock) rather than in
every screen:

- **`POST /auth/login`'s response was never unwrapped.** `features/auth/api.ts` read
  `body.token`/`body.user` directly; the real API wraps every response in `{ data: ... }` like
  every other endpoint. Login against a real backend failed 100% of the time with "Respons
  server tidak valid." before this was fixed — demo mode's login path bypasses this entirely, so
  nothing had ever exercised it.
- **`RefillRequestResource` nests relations as objects** (`cart: {id, code}`,
  `staff: {id, name}`, `finance`/`barista`/`rider: {id, name} | null`); every screen reads flat
  strings (`cart_code`, `staff_name`, ...). `mappers.ts`'s `toRefillRequest` flattens these; demo
  mode's serializer was updated to emit the same nested shape so it stays a faithful fixture.
- **Two fields the real API genuinely never returns, at all:** `RefillRequest.location_name`
  (a refill request has no location relation on the backend) and `Allocation.barista_name` (the
  `barista` relation is never eager-loaded by `AllocationController`, and `AllocationResource`
  has no key for it even if it were). Both are mapped to `null` — every render site already had
  a "tidak diketahui" fallback for the first; one was added to `staff/allocation.tsx` for the
  second. Closing this for real needs a change in soul_coffe.backend, not here.
- **`RefillLineResource`/`StockRowResource` never return a product's `unit`**, and
  `StockRowResource` names the on-hand field `qty`, not `on_hand`. Cross-referenced client-side
  against the already-cached `/products` list (`unitLookup()` in `features/refill/queries.ts`).
- **`total_requested`/`total_qty`** are computed client-side from `lines`, matching what
  `demo/router.ts` already did.
- **Realtime moved from self-hosted Reverb to Pusher Channels** (`pusherKey`/`pusherCluster` in
  `app.json`, `useRealtime.ts`). Confirmed directly against this host that self-hosted Reverb
  cannot work here: a raw WebSocket upgrade to the API domain returned Laravel's own 404 page
  (nothing proxies it to a Reverb process — shared hosting has no way to add that reverse-proxy
  rule), and the raw Reverb port (8080) timed out (host firewall). Pusher is a hosted service, so
  the mobile client only needs a public `key` + `cluster` — no host/port to keep in sync between
  environments, and `App Secret` never leaves the Laravel `.env`.
  **This does not by itself make notifications arrive**: `PublishOutboxEvent` — the job that
  actually calls the broadcaster — is a queued job (`QUEUE_CONNECTION=database`), and nothing on
  this shared hosting processes that queue (no cron entry, no `supervisorctl`/`systemd` for a
  persistent `queue:work`). Until that's added on the backend, events never reach Pusher either;
  `useRealtime()` degrades to its documented 10s-refetch fallback and an honest "Mode luring"
  banner rather than failing silently either way.

None of the above was guesswork — every gap was confirmed by reading the actual PHP resource
source in soul_coffe.backend before writing the corresponding mapper or fallback.

## Sign-in: password first, then PIN only

The login screen has two forms and the SERVER decides which one this account may use:

- **No PIN yet** → phone + password. `POST /auth/login-pin` answers `409 PIN_NOT_SET`, and the app
  switches back to the password form when it sees that.
- **PIN created** → phone + 6-digit PIN. `POST /auth/login` answers `409 PIN_REQUIRED` *after*
  checking the password, so a correct password moves the user to the PIN pad with a plain
  explanation rather than a red error.

The device remembers, in AsyncStorage, which of the two the last account used (`lastPhone` +
`pinAvailable`), so a returning user lands on the right form without a round trip. That hint is a
convenience only — it holds a phone number, never a credential, and the server re-decides
everything.

**Creating a PIN signs you out, on purpose.** `POST /me/login-pin` revokes every token for the
account, so `app/(app)/settings.tsx` confirms the three consequences first (all sessions end, the
password stops signing in, only an Administrator can recover a forgotten PIN), then shows a
non-dismissable dialog whose only button takes the user to the PIN pad. They prove the PIN works
while they still remember typing it. `endRevokedSession()` is used instead of `signOut()` — the
server already revoked the token, so the usual revoke call would just 401.

**Forgot the PIN.** There is no password fallback once a PIN exists, so `ForgotPinSheet` submits
phone + email + password to `POST /auth/pin-reset-requests`. It always reports success, because
the server answers an identical 202 for every input — an unauthenticated form must not reveal who
has an account here. An Administrator then issues a new password from the panel, which clears the
PIN and revokes every session.

## Push notifications

Registration is automatic and tied to the session: on sign-in (and on every return to foreground,
and whenever Android rotates the token) the app asks for `POST_NOTIFICATIONS`, fetches the native
FCM token with `getDevicePushTokenAsync()`, and upserts it via `POST /me/devices`. Sign-out
deletes that registration **before** revoking the session — after the revoke the call could no
longer authenticate, and the next person on this handset would inherit the previous user's alerts.

The token is the native FCM one, not an Expo push token: the Laravel side talks to Firebase
directly, so there is no Expo relay and no Expo account in the path of an operational alert.

Push and the Pusher socket carry the same `event_id`, and `src/features/realtime/seen.ts` is the
single dedupe set both go through. Whichever arrives first refreshes the screen; the second is
dropped, and a foreground banner is suppressed for an event the socket already applied. That set
lives outside the hook deliberately — the push handler is not a hook and fires with nothing
mounted.

**`google-services.json` is required for delivery and is not in git.** Download it from the
Firebase console for an Android app registered as `id.soulcoffeemate.ops.demo`, and drop it in
this directory before `prebuild`. `app.config.js` adds `android.googleServicesFile` only when the
file is present, so a build without it still succeeds: the app logs that push is unavailable once
and keeps using the socket and its 10-second poll. Nothing else degrades.

## Build an APK locally

This is the primary release path, and per task 0.12 it must be proven **before** feature work.
No Expo account, no cloud queue, no per-build quota.

**One-time prerequisites**

- JDK 17 (`java -version` → 17.x)
- Android SDK with platform-tools; `ANDROID_HOME` set
- On Windows, Android Studio's SDK Manager is the simplest way to get both

**Build**

```bash
npm run prebuild       # expo prebuild -p android --clean  → generates android/
npm run apk:debug      # android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release    # android/app/build/outputs/apk/release/app-release.apk
```

`android/` is generated and git-ignored. Re-run `prebuild` after changing `app.json`,
adding a native module, or upgrading the Expo SDK.

**Release signing** — `apk:release` uses the debug keystore until a real one is configured.
Before distributing anything, generate an upload keystore and wire it into
`android/app/build.gradle`. A release APK signed with the debug key must never be handed out.

**Cloud alternative** — `eas build -p android --profile preview` (or `--local`) once `eas.json`
exists. Adopt this for CI and store releases; the local Gradle path stays the fastest loop for
day-to-day APKs.

## APK size

Every setting that controls release size lives in the `expo-build-properties` block of
`app.json`, never in `android/` — that directory is generated and `prebuild --clean` throws
away anything edited there by hand.

```bash
npm run apk:release        # arm64-v8a + armeabi-v7a  → 22.7 MB
npm run apk:release:arm64  # arm64-v8a only           → 17.1 MB
npm run apk:size           # compressed breakdown by group
npm run apk:verify         # asserts nothing needed was stripped
```

Measured on this project, release build, same commit:

| Configuration | APK |
| --- | --- |
| Expo defaults (4 ABIs, no R8) | 95.5 MB |
| Published `v1.0.0` demo (2 ABIs, no R8) | 56 MB |
| **Published `v1.0.1` demo — current settings (2 ABIs)** | **22.7 MB** |
| Current settings, `apk:release:arm64` | 17.1 MB |

What each setting is worth, largest first:

- **`buildArchs`** — the default bundles four ABIs into one universal APK. `x86` and `x86_64`
  are emulator-only and were **40 MB of the 95 MB baseline**: 42% of the download, unusable on
  every real phone. Dropping them is the single biggest win.
- **`useLegacyPackaging: true`** — stores `.so` DEFLATEd instead of STORED. Native code is
  still ~55% of what remains, so this roughly halves it. Costs a little first-launch time as
  the libraries are extracted at install.
- **`enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`** — R8. Took dex
  from 14.5 MB to 6.0 MB.
- **`enableBundleCompression: true`** — compresses the Hermes bundle in `assets/` (off by
  default since RN 0.79, which favours startup time over size).

`metro.config.js` additionally aliases away `@expo-google-fonts/material-symbols`. `expo-router`
pulls in `expo-symbols` for its NativeTabs icons, and that reads the 963 KB Material Symbols
font at module-evaluation time, so Metro — which has no tree shaking — bundles it even though
this app uses `<Stack>` only and draws every icon with MaterialCommunityIcons. See
`stubs/material-symbols-font.js` for the invariant that keeps the alias safe.

**Verify after changing any of this.** R8 and `shrinkResources` are the risky half: React
Native resolves fonts and images by name through `Resources.getIdentifier()`, which the
resource shrinker cannot see, so a stripped font shows up as blank icons at runtime rather
than as a build error. `npm run apk:verify` reads the built APK and checks the assets by
content — the shrinker renames `res/raw/…MaterialCommunityIcons.ttf` to `res/oI.ttf`, so
matching on path gives false failures.


## Where the built APK lives

The demo APK is published in the backend repository, alongside the credentials and install
instructions it needs, so everything a tester opens on their phone is in one place:

**https://github.com/rizalvalry/soul_coffe.backend/tree/main/dist**

- `soul-coffeemate-DEMO-v1.0.1.apk` — 22.7 MB, `id.soulcoffeemate.ops.demo`, Android 7.0+,
  arm64-v8a + armeabi-v7a. Runs with no server, no database, no network. Same signing
  certificate as v1.0.0, so it installs over it in place.
- `soul-coffeemate-DEMO-v1.0.0-legacy.apk` — 56 MB, kept as a rollback: same behaviour, built
  before R8/shrinkResources/native-lib compression were turned on. Prefer v1.0.1; fall back to
  this only if something in it misbehaves, and report what broke before switching.
- `DEMO-ACCESS.md` in that repo has the five login accounts, the staff PIN, the install steps,
  and the 8-step walkthrough.

It is deliberately NOT duplicated here: two copies of a multi-megabyte binary in two public
repos invites the question of which one is current, and the answer would eventually be wrong.

**v1.0.1 has never been executed.** The build machine had no emulator matching either shipped
ABI and no device attached. Its signature, manifest, permissions and bundled contents were all
verified against the file itself — including a byte-for-byte diff of every native module
against the last APK that *was* running in the field — but nobody has yet tapped a button in
this build. R8 is now enabled, which is the one change class of bug that a static diff cannot
rule out: code reached only through reflection can be stripped without any build error. If the
four flows that touch native modules (login, refill photo, signature capture, rider location)
misbehave, that is the first thing to suspect — see "APK size" above for what changed and why.

## Structure

```
app/                        expo-router routes (file = route)
├── _layout.tsx             providers, session restore
├── index.tsx               splash + auth gate
├── (auth)/login.tsx        login for all 5 roles
└── (app)/
    ├── _layout.tsx         authenticated guard (UX only — server authorises)
    ├── menu.tsx            role-driven menu
    └── coming-soon.tsx     honest placeholder naming route + requirement

src/
├── theme/tokens.ts         design tokens — the ONLY place colours are defined
├── domain/roles.ts         the 5 roles, Indonesian labels, business priority
├── features/
│   ├── auth/               api, schema, zustand store (SecureStore-backed)
│   └── navigation/menu.ts  role → menu config, each item traced to a requirement
├── components/ui/          Text, Button, Input, Card, Badge, Screen
├── components/brand/       SoulLogo
└── lib/zodResolver.ts      in-house RHF resolver
```

## Two rules that are not stylistic

**1. Colour.** Brand teal `#00A3AA` was sampled from the official logo. It reaches only
**3.08:1** against white and **fails WCAG AA** for normal-size text in both directions. So:

- `brand[500]` `#00A3AA` → identity only: logo, large headings, icons, borders, accents
- `brand[700]` `#007277` → **5.72:1**; every button fill and any surface with white body text

These users work outdoors, in daylight, on inexpensive Android screens. Never hardcode a hex
outside `tokens.ts`.

**2. Authorisation.** Route guards and hidden menu items are UX, never security. Every
permission is enforced server-side (spec §2.1, R1). In particular, the Barista's *Siapkan*
action must be rejected by the API with `409` when the request is not `APPROVED` — a disabled
button is not an implementation of that rule.

## Verified so far

- `npx tsc --noEmit` — clean
- `npx expo export --platform android` — bundles (3.8 MB Hermes bytecode)
- **Not yet run on a physical device or emulator.** Task 0.12 is not closed until an APK
  installs and opens on real hardware.

## Development login

`app/(auth)/login.tsx` shows a **Mode Demo** panel to enter the app as any of the 5 roles with
no backend. It is guarded by `__DEV__` in both the screen and `features/auth/api.ts`, and throws
on release builds. Production login sends credentials only — **the server decides the role.** A
client-side role picker would be forgeable, which is why there isn't one.
