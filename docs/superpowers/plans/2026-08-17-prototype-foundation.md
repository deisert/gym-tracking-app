# GymTrack Prototype Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the GymTrack app (Next.js + Supabase), apply the full database schema with RLS, get password login working for a single seeded test user, and deploy to Vercel (staging → Preview, main → Production).

**Architecture:** Next.js App Router with `@supabase/ssr` for cookie-based auth; middleware redirects unauthenticated requests to `/login`. All data access goes through the Supabase client under RLS. No signup UI — the only user is created manually in the Supabase dashboard. This plan covers phases 1+2 of CONCEPT.md §7 plus Vercel deployment; the core logging loop (phase 3) is a separate follow-up plan.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Supabase CLI (migrations), Vercel (hosting).

**Spec:** `CONCEPT.md` (repo root) — data model §4, stack §5, build plan §7. Plus `FEATURE_BACKLOG.md` ("Schema safeguard worth adding in v1") and `DESIGN_SYSTEM.md` (visual language, tokens, microcopy).

## Global Constraints

- Env var names exactly: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (CONCEPT.md §5). Never commit `.env.local`. The `service_role` key is never used, stored, or pasted anywhere.
- Weight stored in kg as `numeric(6,2)`; `weight_kg = 0` means bodyweight (CONCEPT.md §4, §8.4). kg-only UI for now (§8.2).
- Auth: email/password only. No magic link (§8.1 decided: no, for now), no signup UI, no password reset. Single test user, created manually by Dominik in the Supabase dashboard.
- RLS enabled on every table before any data exists (CONCEPT.md §4).
- Include the nullable `superset_group int` column on `workout_exercises` (FEATURE_BACKLOG.md schema safeguard).
- UI copy in German, informal "du" (DESIGN_SYSTEM.md §7); the English labels in CONCEPT.md §6 are wireframe references, not copy.
- Visual design per DESIGN_SYSTEM.md: dark-first token set (§2) is the only theme in v1 (`:root` and `.dark` identical), Inter via `next/font`, lime reserved for actions/progress. DESIGN_SYSTEM.md §9 assumes Tailwind v3 (`tailwind.config.ts`); the scaffold uses Tailwind v4 — tokens live in `globals.css` (shadcn v4 convention) instead, same values.
- Branch flow: commit on `staging`, merge `staging` → `main` only at the end (production deploy). Never commit directly to `main`.
- Node ≥ 20, npm as package manager.
- No test framework in this plan — nothing here has unit-testable logic yet (it is scaffold, SQL, and config). Every task instead ends with an explicit verification command and expected output. Vitest arrives with the first real logic in the core-loop plan.

## Values handed over by Dominik (filled in during Task 1)

| Placeholder used below | Meaning | Example shape |
|---|---|---|
| `<SUPABASE_URL>` | Project URL | `https://abcdefgh.supabase.co` |
| `<SUPABASE_ANON_KEY>` | Anon/publishable key | `eyJ...` (long JWT) or `sb_publishable_...` |
| `<PROJECT_REF>` | Ref from the URL | `abcdefgh` |
| `<TEST_USER_EMAIL>` | Test user login | `eisertdominik@gmail.com` |

---

### Task 1: Supabase project provisioning (manual — Dominik)

**Files:** none (external setup).

**Interfaces:**
- Consumes: nothing.
- Produces: a live Supabase project; the four values in the table above, pasted into chat (URL, anon key, ref, test user email). The test user's **password stays with Dominik** — it is never shared with the agent.

- [ ] **Step 1: Create the project**

At https://supabase.com/dashboard → **New project**. Name: `gymtrack`. Region: `eu-central-1 (Frankfurt)`. Database password: generate and store in your password manager (needed again in Task 5 for `db push`).

- [ ] **Step 2: Disable public signup**

Dashboard → **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". (The app has no signup UI, this closes the API route too.)

- [ ] **Step 3: Create the test user**

Dashboard → **Authentication → Users → Add user → Create new user**. Email: your address. Password: choose one, keep it to yourself. Check **Auto Confirm User**.

- [ ] **Step 4: Hand over the values**

Dashboard → **Project Settings → API**: copy Project URL and anon/publishable key. Paste into chat: URL, anon key, project ref, test user email. **Not** the DB password, **not** the service_role key, **not** the test user password.

- [ ] **Step 5: Verify**

`curl -s -o /dev/null -w "%{http_code}" <SUPABASE_URL>/rest/v1/ -H "apikey: <SUPABASE_ANON_KEY>"` → Expected: `200`.

---

### Task 2: Next.js scaffold

**Files:**
- Create: entire Next.js app at repo root (`package.json`, `src/app/*`, configs) via create-next-app
- Create: `.gitignore` (rewritten, full content below)

**Interfaces:**
- Consumes: nothing.
- Produces: running Next.js app; `src/` layout with `@/*` import alias that all later tasks use.

- [ ] **Step 1: Scaffold in a scratch directory**

create-next-app refuses non-empty directories (CONCEPT.md, docs/ etc. are not on its allowlist), so scaffold outside and sync in:

```bash
cd "$SCRATCH"   # any empty temp dir outside the repo
npx create-next-app@latest gymtrack-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --yes
```

- [ ] **Step 2: Sync into the repo (keep .git, skip node_modules)**

```bash
rsync -a --exclude .git --exclude node_modules "$SCRATCH/gymtrack-scaffold/" /Users/dominikeisert/__coding/claude/claude_projects/gym-tracking-app/
cd /Users/dominikeisert/__coding/claude/claude_projects/gym-tracking-app
npm install
```

- [ ] **Step 3: Rewrite `.gitignore`** (rsync replaced ours with Next's default; restore the union)

```gitignore
# dependencies
/node_modules
.pnp
.pnp.js

# next.js build output
/.next/
/out/
/build

# misc
.DS_Store
*.pem
*.log
*.tsbuildinfo
next-env.d.ts

# env — commit only the example
.env
.env.*
!.env.example

# vercel
.vercel

# supabase local artifacts
supabase/.branches
supabase/.temp
```

- [ ] **Step 4: Verify dev server and build**

```bash
npm run dev &   # then:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200`. Then stop the dev server and run `npm run build` → Expected: exits 0, "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app (App Router, TS, Tailwind)"
```

---

### Task 3: shadcn/ui

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,input,label,card}.tsx`
- Modify: `src/app/globals.css` (theme variables added by init)

**Interfaces:**
- Consumes: Task 2 scaffold.
- Produces: `Button`, `Input`, `Label`, `Card`/`CardContent`/`CardHeader`/`CardTitle` components imported as `@/components/ui/<name>` in Task 6.

- [ ] **Step 1: Init with defaults and add the four base components**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card
```

- [ ] **Step 2: Apply the GymTrack dark theme (DESIGN_SYSTEM.md §2)**

In `src/app/globals.css`, replace the generated `:root { … }` and `.dark { … }` variable blocks (keep the `@theme inline` mapping shadcn generated) with:

```css
:root {
  --radius: 12px;
  --background: hsl(220 15% 8%);
  --foreground: hsl(220 15% 93%);
  --card: hsl(220 14% 12%);
  --card-foreground: hsl(220 15% 93%);
  --popover: hsl(220 14% 12%);
  --popover-foreground: hsl(220 15% 93%);
  --primary: hsl(84 85% 55%);
  --primary-foreground: hsl(220 15% 8%);
  --secondary: hsl(220 12% 18%);
  --secondary-foreground: hsl(220 15% 93%);
  --muted: hsl(220 12% 18%);
  --muted-foreground: hsl(220 8% 62%);
  --accent: hsl(220 12% 18%);
  --accent-foreground: hsl(220 15% 93%);
  --destructive: hsl(0 72% 55%);
  --destructive-foreground: hsl(220 15% 93%);
  --border: hsl(220 10% 24%);
  --input: hsl(220 12% 18%);
  --ring: hsl(84 85% 55%);
}

/* Dark is the only theme in v1 — .dark mirrors :root (DESIGN_SYSTEM.md §2). */
.dark {
  --background: hsl(220 15% 8%);
  --foreground: hsl(220 15% 93%);
  --card: hsl(220 14% 12%);
  --card-foreground: hsl(220 15% 93%);
  --popover: hsl(220 14% 12%);
  --popover-foreground: hsl(220 15% 93%);
  --primary: hsl(84 85% 55%);
  --primary-foreground: hsl(220 15% 8%);
  --secondary: hsl(220 12% 18%);
  --secondary-foreground: hsl(220 15% 93%);
  --muted: hsl(220 12% 18%);
  --muted-foreground: hsl(220 8% 62%);
  --accent: hsl(220 12% 18%);
  --accent-foreground: hsl(220 15% 93%);
  --destructive: hsl(0 72% 55%);
  --destructive-foreground: hsl(220 15% 93%);
  --border: hsl(220 10% 24%);
  --input: hsl(220 12% 18%);
  --ring: hsl(84 85% 55%);
}
```

- [ ] **Step 3: Switch the app font to Inter (DESIGN_SYSTEM.md §3)**

In `src/app/layout.tsx`: replace the Geist font imports with

```tsx
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
```

apply `${inter.variable} antialiased` as the `<body>` className (remove the Geist classNames), and set the metadata to `title: "GymTrack"`, `description: "Dein Trainings-Log"`.

- [ ] **Step 4: Verify build**

`npm run build` → Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui with GymTrack dark theme and Inter"
```

---

### Task 4: Supabase clients, env plumbing, auth middleware

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, `.env.local` (untracked), `.env.example`

**Interfaces:**
- Consumes: Task 1 values, Task 2 scaffold.
- Produces: `createBrowserSupabase(): SupabaseClient` from `@/lib/supabase/client`; `createServerSupabase(): Promise<SupabaseClient>` from `@/lib/supabase/server`; middleware that redirects every unauthenticated request (except `/login` and static assets) to `/login`.

- [ ] **Step 1: Install packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write env files**

`.env.local` (untracked — real values from Task 1):
```
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

`.env.example` (committed):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Write `src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Write `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component; session refresh is handled
            // by the middleware, so this can be safely ignored.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Write `src/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and auth.getUser() —
  // it can cause random logouts (token refresh happens here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Verify redirect**

```bash
npm run dev &   # then:
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/
```
Expected: `307 http://localhost:3000/login` (the home page is now gated). Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase clients, env plumbing, and auth middleware"
```

---

### Task 5: Database schema migration with RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20260817000001_init.sql`, `supabase/seed_prototype.sql`
- Modify: `package.json` (devDependency `supabase`)

**Interfaces:**
- Consumes: Task 1 project (`<PROJECT_REF>`, DB password held by Dominik).
- Produces: tables `profiles`, `exercises`, `workouts`, `workout_exercises`, `sets` with RLS; a profile row + 5 seeded exercises for the test user.

- [ ] **Step 1: Install and init the Supabase CLI**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Write `supabase/migrations/20260817000001_init.sql`**

Schema exactly per CONCEPT.md §4, plus `superset_group` (FEATURE_BACKLOG.md) and all RLS policies:

```sql
-- GymTrack initial schema (CONCEPT.md §4)
-- Units: weight stored in kg; display conversion is a UI concern.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  unit text not null default 'kg' check (unit in ('kg','lb')),
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text,
  attribute_options jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null default current_date,
  category text,
  note text,
  created_at timestamptz not null default now()
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null default 0,
  note text,
  effort smallint check (effort between 1 and 5),
  attributes jsonb not null default '{}'::jsonb,
  superset_group int,  -- v1 unused; safeguard for v2 supersets (FEATURE_BACKLOG.md)
  created_at timestamptz not null default now()
);

create table sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  position int not null default 0,
  weight_kg numeric(6,2) not null check (weight_kg >= 0),  -- 0 = bodyweight
  reps int not null check (reps > 0),
  is_warmup boolean not null default false,
  created_at timestamptz not null default now()
);

create index on workouts (user_id, performed_on desc);
create index on workout_exercises (workout_id, position);
create index on workout_exercises (exercise_id);
create index on sets (workout_exercise_id, position);

-- Row Level Security (CONCEPT.md §4)
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table sets enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own exercises" on exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own workouts" on workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own workout_exercises" on workout_exercises
  for all
  using (exists (
    select 1 from workouts w
    where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from workouts w
    where w.id = workout_id and w.user_id = auth.uid()));

create policy "own sets" on sets
  for all
  using (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()));
```

- [ ] **Step 3: Write `supabase/seed_prototype.sql`** (run once via dashboard SQL editor, NOT a migration — it references a concrete user)

```sql
-- One-off prototype seed. Run in the Supabase SQL editor AFTER the
-- test user exists (Task 1). Idempotent.

insert into profiles (id, display_name)
select id, 'Dominik' from auth.users where email = '<TEST_USER_EMAIL>'
on conflict (id) do nothing;

insert into exercises (user_id, name, note, attribute_options)
select u.id, e.name, e.note, e.attribute_options::jsonb
from auth.users u
cross join (values
  ('Bench Press',    null,              '{}'),
  ('Squat',          null,              '{}'),
  ('Deadlift',       null,              '{}'),
  ('Lat Pulldown',   'seat position 4', '{"grip": ["wide","narrow","neutral"]}'),
  ('Overhead Press', null,              '{}')
) as e(name, note, attribute_options)
where u.email = '<TEST_USER_EMAIL>'
on conflict (user_id, name) do nothing;
```

- [ ] **Step 4: Link and push (Dominik runs these — browser login + DB password prompt)**

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```
Expected: `db push` lists `20260817000001_init.sql` and finishes with "Finished supabase db push."

- [ ] **Step 5: Dominik runs the seed**

Paste `supabase/seed_prototype.sql` (with the real email) into Dashboard → SQL Editor → Run. Expected: "Success. No rows returned".

- [ ] **Step 6: Verify RLS locks anonymous access**

```bash
curl -s "<SUPABASE_URL>/rest/v1/exercises?select=name" \
  -H "apikey: <SUPABASE_ANON_KEY>" -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```
Expected: `[]` — the table exists (no error) but RLS returns zero rows without a user session. Anything else (an error, or seeded rows visible) is a failure.

- [ ] **Step 7: Commit**

```bash
git add supabase package.json package-lock.json
git commit -m "feat: add initial schema migration with RLS and prototype seed"
```

---

### Task 6: Login page, protected home, logout

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Modify: `src/app/page.tsx` (replace scaffold home)

**Interfaces:**
- Consumes: `createServerSupabase` (Task 4), shadcn components (Task 3), seeded profile (Task 5).
- Produces: server actions `login(formData: FormData): Promise<void>` and `logout(): Promise<void>` in `@/app/login/actions` — the logout action is reused by later plans' app shell.

- [ ] **Step 1: Write `src/app/login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=1");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=1");

  redirect("/");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Write `src/app/login/page.tsx`**

```tsx
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">GymTrack</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && (
              <p className="text-sm text-destructive">Login fehlgeschlagen – prüfe E-Mail und Passwort.</p>
            )}
            <Button type="submit" className="w-full">Anmelden</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .single();

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">GymTrack</h1>
      <p className="mt-2 text-muted-foreground">
        Angemeldet als {profile?.display_name ?? "unbekannt"}
      </p>
      <form action={logout} className="mt-6">
        <Button type="submit" variant="outline">Abmelden</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verify end-to-end locally**

1. `npm run dev`, open http://localhost:3000 → Expected: redirect to `/login`.
2. Log in with a wrong password → Expected: stays on `/login`, shows "Login failed."
3. Dominik logs in with the real test user → Expected: home shows "Signed in as Dominik" (proves auth + RLS + profiles roundtrip).
4. Log out → Expected: back on `/login`; opening `/` redirects to `/login` again.
5. `npm run build` → Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password login, protected home, and logout"
```

---

### Task 7: Vercel project + staging/production deploys

**Files:**
- none in-repo (Vercel is zero-config for Next.js; no `vercel.json` needed).

**Interfaces:**
- Consumes: GitHub repo `deisert/gym-tracking-app` (branches `staging`, `main`), env values from Task 1.
- Produces: Vercel project `gym-tracking-app`; every push to `staging` → Preview deployment, `main` → Production.

- [ ] **Step 1: Create the Vercel project via the Vercel integration**

Link repo `deisert/gym-tracking-app`, framework preset Next.js, production branch `main` (default). Confirm the team/scope with Dominik first if more than one exists.

- [ ] **Step 2: Dominik sets the env vars**

Vercel Dashboard → Project → **Settings → Environment Variables**, environment: **All Environments**:
- `NEXT_PUBLIC_SUPABASE_URL` = `<SUPABASE_URL>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<SUPABASE_ANON_KEY>`

- [ ] **Step 3: Deploy staging (Preview)**

```bash
git push origin staging
```
Expected: Vercel builds a Preview deployment; status READY. Open the preview URL → redirects to `/login`, login works.

- [ ] **Step 4: Deploy production**

```bash
git checkout main
git merge --ff-only staging
git push origin main
git checkout staging
```
Expected: Production deployment READY on the project's `.vercel.app` domain.

- [ ] **Step 5: Verify production**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://<production-domain>/
```
Expected: `307 https://<production-domain>/login`. Then Dominik: log in **on the phone** — the target device for this app.

---

### Task 8: Foundation acceptance

**Files:** none.

**Interfaces:**
- Consumes: everything above.
- Produces: sign-off to start the core-loop plan (CONCEPT.md §7 phase 3).

- [ ] **Step 1: Run the acceptance checklist**

| # | Check | Expected |
|---|---|---|
| 1 | `npm run build` on `staging` | exit 0 |
| 2 | Anonymous REST probe (Task 5 Step 6) | `[]` |
| 3 | Production URL unauthenticated | redirect to `/login` |
| 4 | Phone login with test user | home shows "Signed in as Dominik" |
| 5 | `git status` | clean; `staging` == `main` |
| 6 | Signup blocked | Supabase dashboard shows email signups disabled |

- [ ] **Step 2: Tag the milestone**

```bash
git tag -a v0.1-foundation -m "Auth + schema + deploy working end-to-end"
git push origin v0.1-foundation
```
