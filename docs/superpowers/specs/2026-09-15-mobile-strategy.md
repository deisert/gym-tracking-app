# GymTrack on the iPhone — Strategy & Decisions

**Date:** 2026-09-15
**Status:** Decided
**Plan:** `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md`

## Problem

GymTrack today is a mobile-first web app (Next.js 16 on Vercel, Supabase with RLS).
Dominik wants it on his iPhone 15 Pro as an app. He has no app-development
experience and was considering React Native.

## Decisions

| # | Decision | Rationale |
| - | -------- | --------- |
| D1 | **PWA first, React Native later** | The app is already mobile-first web. Installability costs ~1 day and EUR 0/yr vs. a second codebase and a ~$99/yr Apple fee. Prove the PWA is insufficient before paying for native. |
| D2 | **Monorepo now, not later** | Shared logic (`types`, `validation`, `sets`, `dates`) already exists as pure TS. Retrofitting a monorepo after a second app ships means migrating a divergent copy. Cheap today (~35 files), expensive in three months. |
| D3 | **npm workspaces, no Turborepo/Nx** | Two apps and one package. npm workspaces ships with the npm already installed. Adding a build orchestrator here is unjustified complexity. |
| D4 | **One Supabase project, one database** | This is one tenant (Dominik) with multiple clients, not multi-tenancy. Existing per-`user_id` RLS already makes concurrent web + mobile access correct. |
| D5 | **Mobile talks to Supabase directly; Server Actions are not an API** | Server Actions are a Next.js-private RPC protocol. RLS, not the actions, is the authorization boundary — so a native client calling Supabase directly is exactly as safe, with no new public API surface and no Vercel hop between thumb and set. |
| D6 | **Apple Developer Program deferred** | Plan stops at "runs in the iOS Simulator". Device distribution is a separate, clearly-gated phase. |
| D7 | **Mobile v1 scope = full parity with web** | Login, workout logging, and the Verlauf/history screen. No "go to the browser for that" gaps. Applies to whichever client ships. |
| D8 | **No offline writes in this plan** | Bidirectional sync is a distributed-systems problem. `experimental.useOffline` (Next 16) covers the actual gym-basement failure mode — a request that fails mid-set and retries when signal returns — without inventing a sync engine. |

## Answers to the originating questions

**Can I still host on Vercel and use Supabase as my DB?**
Yes to both, unchanged. Supabase needs no migration and no schema change; RLS
enforces identically for a Next.js server and an iPhone. Vercel keeps serving
the web app. Vercel cannot host a native binary — those ship through Apple —
but it would serve the `apple-app-site-association` file if universal links are
ever needed.

**New repo or monorepo?**
Monorepo (D2, D3). Target layout:

```
gym-tracking-app/
  apps/web/        Next.js (moved wholesale from the repo root)
  apps/mobile/     Expo — only if Phase 3 is ever unlocked
  packages/core/   types, validation, sets, dates + their vitest tests
  supabase/        stays at root: one schema, one source of truth
  docs/            stays at root
```

Known cost: Vercel's **Root Directory** must change to `apps/web`. Per project
memory the Vercel MCP is blind to this project, so that is a manual browser
change. The Supabase GitHub integration keeps working dir `.` and is unaffected
because `supabase/` does not move.

**Multi-tenancy, or two DBs kept in sync?**
Neither — one database (D4). Copying and syncing is the worst available option;
conflict resolution, clock skew, and delete tombstones would all have to be
invented to solve a problem that does not exist. Two config changes are needed
if a native client is ever built: add the app's redirect URL to Supabase Auth's
allow list, and keep signups disabled (`shouldCreateUser: false` already works
against the existing confirmed user).

**How do I simulate the app on my Mac?**
For the PWA: Safari and Chrome DevTools device emulation, plus
`next dev --experimental-https` (service workers and install prompts require a
secure context). For React Native later: Xcode from the App Store provides the
iOS Simulator; use an Expo **development build**, not Expo Go, because Expo Go
cannot load the custom native modules this app needs. Claude can drive and
screenshot the Simulator directly in-session.

**How do I test on my iPhone 15 Pro?**
For the PWA: open the Vercel production URL in Safari, Share → Add to Home
Screen. Free, permanent, no Apple account. For React Native later, three tiers:
free Apple ID signing (app expires every 7 days), or the Apple Developer
Program at ~$99/yr for year-long certs, or TestFlight (same $99/yr) for an app
that simply lives on the phone. There is no free path to a long-lived iOS app
on your own device — Apple policy, not an Expo limitation.

## Known hazards this plan must address

1. **iOS standalone PWAs have a cookie jar separate from Safari.** A magic-link
   email opens in Safari, so the session lands in Safari and the installed PWA
   stays logged out. The existing `loginWithPassword` path avoids the email
   round trip entirely and must be the default inside standalone mode.
2. **`viewport-fit: cover` puts content under the home indicator.** The fixed
   `BottomTabs` bar and the `pb-20` on `body` both need `env(safe-area-inset-*)`.
3. **The existing per-set retry logic must survive.** `experimental.useOffline`
   intercepts Server Action *fetch* failures. An action that returns
   `{ ok: false, kind: "transient" }` is a *successful* fetch carrying a DB
   failure — `set-list.tsx` still has to handle it. Do not delete that code.
4. **Service-worker caching of RSC payloads is a stale-data trap.** Cache only
   content-hashed `/_next/static/*` and a static offline fallback.

## Out of scope

Offline writes and sync; push notifications; workout templates; the progress
dashboard (still unbuilt on web too); Android.

## Gate for Phase 3 (React Native)

Do not start Phase 3 until the PWA has been used for real workouts and a
concrete, named deficiency exists — e.g. "the number pad dismisses between
sets", "I need a rest timer that runs with the screen off". "It feels less
native" is not a reason to maintain a second codebase.
