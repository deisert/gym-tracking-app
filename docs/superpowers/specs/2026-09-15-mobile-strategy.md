# GymTrack on the iPhone — Strategy & Decisions

**Date:** 2026-09-15 (revised same day: native client is now an open RN-vs-Swift fork)
**Status:** Decided for Phases 1–2; the native client is a deferred fork
**Plan:** `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md`

## Problem

GymTrack today is a mobile-first web app (Next.js 16 on Vercel, Supabase with
RLS). Dominik wants it on his iPhone 15 Pro as an app. He has no app-development
experience. React Native was the initial assumption; **going fully native with
Swift/SwiftUI is now equally on the table**, and that choice is not yet made.

## Decisions

| # | Decision | Rationale |
| - | -------- | --------- |
| D1 | **PWA first, native client later** | The app is already mobile-first web. Installability costs ~1 day and EUR 0/yr vs. a second codebase and a ~$99/yr Apple fee. An undecided RN-vs-Swift fork is a further reason to ship the PWA first: it buys the information needed to decide. |
| D2 | **Monorepo now — but justified on asymmetric cost, not on code sharing** | See "The D2 re-justification" below. The original rationale assumed React Native and does not survive the Swift branch. |
| D3 | **npm workspaces, no Turborepo/Nx** | Two directories and one package. npm workspaces ships with the installed npm. A build orchestrator here is unjustified. |
| D4 | **One Supabase project, one database** | This is one tenant (Dominik) with multiple clients, not multi-tenancy. Existing per-`user_id` RLS makes concurrent web + native access correct with no schema change. |
| D5 | **The native client talks to Supabase directly; Server Actions are not an API** | Path-independent: `supabase-js` and `supabase-swift` are both first-party and both authenticate against the same RLS policies. Server Actions are a Next.js-private RPC protocol. RLS, not the actions, is the authorization boundary — so a device calling Supabase directly is exactly as safe, with no new public API surface. |
| D6 | **Apple Developer Program deferred** | Phases 1–2 need no Apple account at all. Both native paths need the same ~$99/yr for a long-lived device install, so this is not a differentiator between them. |
| D7 | **Native v1 scope = full parity with web** | Login, workout logging, and the Verlauf/history screen. Applies to whichever client ships. |
| D8 | **No offline writes in this plan** | Bidirectional sync is a distributed-systems problem. `experimental.useOffline` (Next 16) covers the actual gym-basement failure mode without inventing a sync engine. |
| **D9** | **React Native vs. Swift is deferred to the Phase 3 gate** | Deciding now means deciding without the one input that matters: which native capability the PWA turns out to lack. See "The native fork" below. |

## The D2 re-justification

The original rationale — "extract shared logic so the mobile app can import it" —
**assumed React Native and is void on the Swift branch.** Swift cannot import a
TypeScript package. Honesty requires re-deriving the decision rather than keeping
the conclusion and quietly changing the reason.

The restructure is still correct, on two grounds that hold regardless of the fork:

1. **Asymmetric cost.** Doing it now and later choosing Swift wastes roughly an
   hour of directory structure — one extra `package.json`, one `tsconfig`, one
   `transpilePackages` line. *Not* doing it and later choosing React Native means
   migrating a shared package out from under a running second app. A small certain
   cost against a large conditional one.
2. **It is right for the web app alone.** Separating pure business rules from
   framework code is good structure with one app. `packages/core` runs its 75
   tests in milliseconds without booting Next, and the rules live in one auditable
   place instead of being spread through `src/lib/`.

Note that purity alone is not the admission criterion — **portability** is.
`swipe-gesture.ts` has zero imports and is perfectly pure, but it is web
pointer-event math (rubber-banding, tap slop, commit thresholds). Gesture
handling on either native path is platform-native, so it stays in `apps/web`
with its 22 tests.

What changes is only what `packages/core` *is* on each branch:

- **React Native:** a directly imported dependency. Metro resolves the workspace
  symlink the same way Next does. Full reuse.
- **Swift:** an executable specification. The Epley formula, ghost-value index
  mapping, German decimal formatting, the Europe/Berlin date handling, and the
  validation bounds are stated once and covered by 75 tests. A Swift port reads
  from it, and those tests become the conformance checklist for the port.

The second is genuinely weaker than the first. It is not nothing.

## The native fork (D9)

**Both paths need Xcode. Both need the same ~$99/yr for a long-lived device
install. Both rebuild every screen** — React Native shares this app's *logic*,
never its components, since `src/components/` is JSX over DOM elements and
Tailwind classes. Those three are not differentiators; discard them.

What actually differs:

| | React Native (Expo) | Swift / SwiftUI |
| - | ------------------- | --------------- |
| Language | TypeScript — already known | Swift — genuinely new: optionals, value types, protocols, ARC |
| `packages/core` | Imported directly | Ported by hand, tests as the checklist |
| Android, ever | Nearly free | Never, without a third codebase |
| Native depth | Good | Maximum — Live Activities, HealthKit, widgets, haptics |
| Toolchain | Expo SDK + Metro + Xcode | Xcode only |
| Ongoing upkeep | Periodic Expo SDK upgrades | Annual iOS release cycle |

**The leaning, stated plainly:** for a single-user, iOS-only gym app,
**Swift/SwiftUI is the stronger destination** — and the "you already know
TypeScript" argument for React Native is weaker than it first appears, because
every screen gets rebuilt either way. The specifically compelling features for
this app are all deeply platform-bound: a rest timer as a Live Activity on the
15 Pro's Dynamic Island, workouts written to Apple Health, real haptics on set
completion. React Native reaches those only through native modules, which is
where its abstraction stops paying and starts costing.

React Native wins decisively on exactly one condition: **Android ever matters.**
If it does, it wins outright and the comparison ends there.

This leaning is explicitly not a decision. It is what to argue against when the
gate opens.

## Answers to the originating questions

**Can I still host on Vercel and use Supabase as my DB?**
Yes to both, unchanged, on every path. Supabase needs no migration and no schema
change; RLS enforces identically for a Next.js server, an Expo app, and a Swift
app. Vercel keeps serving the web app. Vercel cannot host a native binary —
those ship through Apple — but it would serve the `apple-app-site-association`
file if universal links are ever needed.

**New repo or monorepo?**
Monorepo (D2, D3), on the asymmetric-cost grounds above rather than the original
code-sharing grounds. Target layout:

```
gym-tracking-app/
  apps/web/        Next.js (moved wholesale from the repo root)
  apps/mobile/     Expo — only on the React Native branch
  apps/ios/        Xcode project — only on the Swift branch; needs no
                   workspace entry, npm ignores directories with no package.json
  packages/core/   types, validation, sets, dates, exercise-search,
                   workout-summary + their 75 vitest tests
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
invented to solve a problem that does not exist. Whichever native client ships,
two config changes are needed: add its redirect URL to Supabase Auth's allow
list, and keep signups disabled (`shouldCreateUser: false` already works against
the existing confirmed user).

**How do I simulate the app on my Mac?**
For the PWA: Safari and Chrome DevTools device emulation, plus
`next dev --experimental-https` (service workers and install prompts need a
secure context). **Neither requires Xcode.** For a native client later, both
paths use the same iOS Simulator from the same Xcode install — React Native via
an Expo **development build** (not Expo Go, which cannot load the native modules
this app needs), Swift via Xcode's run button. Claude can drive and screenshot
the Simulator directly in-session on either path.

**How do I test on my iPhone 15 Pro?**
For the PWA: open the Vercel production URL in Safari, Share → Add to Home
Screen. Free, permanent, no Apple account. For a native client later — identical
on both paths, because this is Apple's rule and not a framework's: free Apple ID
signing expires every 7 days; the Apple Developer Program at ~$99/yr gives
year-long certs; TestFlight (same fee) gets an app that simply lives on the
phone. There is no free path to a long-lived iOS app on your own device.

## Known hazards this plan must address

1. **iOS standalone PWAs have a cookie jar separate from Safari's.** A magic-link
   email opens in Safari, so the session lands in Safari and the installed PWA
   stays logged out. The existing `loginWithPassword` path avoids the email round
   trip entirely and must be the default inside standalone mode.
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
dashboard (still unbuilt on web too); Android — unless it becomes a requirement,
in which case it decides D9 on its own.

## Gate for Phase 3

Do not start Phase 3 until the PWA has been used for real workouts and a
concrete, named deficiency exists — e.g. "the number pad dismisses between
sets", "I need a rest timer that runs with the screen off". "It feels less
native" is not a reason to maintain a second codebase.

**That named deficiency is also the input that decides D9.** A gap that is
mostly about input handling and screen feel is served well by either path. A gap
that names Live Activities, Apple Health, or widgets argues for Swift. A gap
that arrives alongside "and I want this on an Android phone too" ends the
argument in React Native's favour. Deciding before the gap is named means
deciding without the deciding input.
