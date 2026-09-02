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

## Where the built APK lives

The demo APK is published in the backend repository, alongside the credentials and install
instructions it needs, so everything a tester opens on their phone is in one place:

**https://github.com/rizalvalry/soul_coffe.backend/tree/main/dist**

- `soul-coffeemate-DEMO-v1.0.0.apk` — 55 MB, `id.soulcoffeemate.ops.demo`, Android 7.0+,
  arm64-v8a + armeabi-v7a. Runs with no server, no database, no network.
- `DEMO-ACCESS.md` in that repo has the five login accounts, the staff PIN, the install steps,
  and the 8-step walkthrough.

It is deliberately NOT duplicated here: two copies of a 55 MB binary in two public repos invites
the question of which one is current, and the answer would eventually be wrong.

**This APK has never been executed.** The build machine had no emulator and no device attached.
Its signature, manifest, permissions and bundled contents were all verified against the file
itself, and the flow logic was proven by executing the state machine directly — but nobody has
yet tapped a button in it.

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
