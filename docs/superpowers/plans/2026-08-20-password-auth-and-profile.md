# Password Auth & Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make email/password the default signup and login path (magic link becomes an opt-in alternative on both forms), and add a "Profil" tab where a user can rename themselves and set/update a password — including setting one for the first time after a magic-link-only signup.

**Architecture:** No new subsystems — this extends the existing Next.js App Router auth flow. `src/app/login/actions.ts` gains one new server action (`signUpWithPassword`) alongside the three that already exist; `src/components/auth/auth-card.tsx` gains a second password/magic-link toggle (one per tab) and its login-tab default flips. A new `src/app/profile/` route follows the exact same pattern as `src/app/login/`: a `page.tsx` server component that reads `searchParams` and the current user/profile row, a sibling `actions.ts` with one `"use server"` function per operation, and a client form component that renders the fields. `supabase.auth.updateUser({ password })` is the single call for "set a password for the first time" and "change an existing password" — Supabase does not distinguish the two, so the profile page needs only one password form, not two.

**Tech Stack:** Next.js 16.3.1 (App Router, TypeScript), React 19.2.8, Tailwind CSS v4, shadcn/ui (Base UI primitives), Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Zod, Vitest, lucide-react.

**Spec:** None. This was scoped as a bounded change during brainstorming (extends an auth flow that already exists in the repo) and approved in chat rather than written up as a separate spec file — this plan's Goal/Architecture sections above are the full design record.

## Global Constraints

- **Read the shipped Next.js docs before writing code.** `AGENTS.md` at the repo root warns that this Next.js version differs from training data; the relevant guides live in `node_modules/next/dist/docs/`. This plan only uses patterns (`"use server"` actions, `redirect()`, `searchParams` as a `Promise`) that already appear working in `src/app/login/` and `src/app/page.tsx` — copy their shape rather than reinventing it.
- All UI copy is German, informal "du". Tap targets stay ≥ 44px — every `<Input>`/`<Button>` in this codebase uses `min-h-11` (44px) for that reason; match it.
- Branch flow: commit directly on `staging` (this repo's working branch — see recent history in `docs/superpowers/plans/2026-08-17-core-loop-release.md`). Do not touch `main`.
- Env vars are already configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`); nothing in this plan changes them.
- Password rule: `authPasswordSchema` (Task 1) enforces 8–72 characters, no complexity requirement. Supabase's own server-side floor is 6 (`supabase/config.toml`, `minimum_password_length = 6`), so the stricter client-side 8 never conflicts with it. 72 is bcrypt's hard ceiling.
- `supabase/config.toml` has `enable_confirmations = false` locally, confirmed also disabled on the hosted project. This means `supabase.auth.signUp({ email, password })` returns a session immediately — no confirmation e-mail, no extra step. Task 2 relies on this.
- **Manual verification, not automated tests, for actions and components.** This repo's Vitest config (`vitest.config.js`) only runs `src/**/*.test.ts` under a `node` environment — there is no jsdom/React-Testing-Library setup and no existing test for a server action or a component (check `src/app/login/actions.ts` and `src/components/auth/auth-card.tsx` — neither has a test file). Follow that existing convention: only Task 1's pure Zod schema gets an automated test; Tasks 2 and 3 are verified by running the app locally (`npm run dev` + local Supabase via `supabase start`) and checking behavior by hand, exactly as this codebase already does for its other auth code.
- **Out of scope** (do not build these — confirmed with the user during brainstorming): password-strength meter, a "forgot password" reset flow, changing the account e-mail from the profile page, and any special handling for "this e-mail already has a magic-link-only account and now tries password signup" (Supabase's own `signUp` error for a duplicate e-mail is enough; do not add custom detection or messaging for that case).

---

### Task 1: Password validation schema

**Files:**
- Modify: `src/lib/validation.ts:31` (right after `authNameSchema`)
- Test: `src/lib/validation.test.ts` (append a new `describe` block)

**Interfaces:**
- Produces: `authPasswordSchema: z.ZodString` — a Zod schema validating a plain password string (8–72 chars). Tasks 2 and 3 both import this from `@/lib/validation`.

- [ ] **Step 1: Write the failing tests**

Open `src/lib/validation.test.ts`. Add `authPasswordSchema` to the existing import at the top of the file:

```ts
import {
  authEmailSchema,
  authNameSchema,
  authPasswordSchema,
  exerciseNameSchema,
  setInputSchema,
  workoutMetaSchema,
} from "@/lib/validation";
```

Then append this new `describe` block at the end of the file (after the closing `});` of the `workoutMetaSchema` block):

```ts
describe("authPasswordSchema", () => {
  it("accepts an 8+ character password", () => {
    expect(authPasswordSchema.safeParse("geheim123").success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(authPasswordSchema.safeParse("kurz12").success).toBe(false);
  });

  it("rejects a password longer than 72 characters (bcrypt limit)", () => {
    expect(authPasswordSchema.safeParse("x".repeat(73)).success).toBe(false);
    expect(authPasswordSchema.safeParse("x".repeat(72)).success).toBe(true);
  });

  it("rejects a non-string value", () => {
    expect(authPasswordSchema.safeParse(undefined).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- validation`
Expected: FAIL — `authPasswordSchema` is not exported from `@/lib/validation` (a TypeScript/import error, since it doesn't exist yet).

- [ ] **Step 3: Add the schema**

In `src/lib/validation.ts`, directly below the existing line:

```ts
export const authNameSchema = z.string().trim().min(1).max(80);
```

add:

```ts

// Auth: password for the password-based signup/login/profile flows.
// Supabase's own minimum is 6 (supabase/config.toml); 8 is a stricter
// client-side floor that never conflicts with the server-side check.
// 72 is bcrypt's hard ceiling — Supabase silently truncates past it.
export const authPasswordSchema = z.string().min(8).max(72);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- validation`
Expected: PASS, all tests in `validation.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add authPasswordSchema"
```

---

### Task 2: Password-first signup & login

**Files:**
- Modify: `src/app/login/actions.ts` (add `signUpWithPassword`)
- Modify: `src/components/auth/auth-card.tsx` (full rewrite — see below)
- Modify: `src/app/login/page.tsx` (wire the new action)

**Interfaces:**
- Consumes: `authEmailSchema`, `authNameSchema`, `authPasswordSchema` from `@/lib/validation` (Task 1); `getSiteUrl` from `@/lib/site-url`; `createServerSupabase` from `@/lib/supabase/server`.
- Produces: `signUpWithPassword(formData: FormData): Promise<void>` exported from `src/app/login/actions.ts`, alongside the pre-existing `signUpWithMagicLink`, `loginWithMagicLink`, `loginWithPassword`, `logout` (unchanged signatures). `AuthCard`'s prop shape changes — see Step 2 — which is why `login/page.tsx` needs to be updated in the same task.

- [ ] **Step 1: Add the `signUpWithPassword` action**

Open `src/app/login/actions.ts`. Add `authPasswordSchema` to the existing import:

```ts
import { authEmailSchema, authNameSchema, authPasswordSchema } from "@/lib/validation";
```

Update the comment on `signUpWithMagicLink` (it currently says password signup isn't offered — that's no longer true) and insert the new action right after it. The full file should read:

```ts
"use server";

import { redirect } from "next/navigation";
import { authEmailSchema, authNameSchema, authPasswordSchema } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site-url";
import { createServerSupabase } from "@/lib/supabase/server";

/** New account, magic link: email + name only, no password. Kept as the
 *  opt-in alternative to signUpWithPassword (see auth-card.tsx). */
export async function signUpWithMagicLink(formData: FormData) {
  const emailResult = authEmailSchema.safeParse(formData.get("email"));
  const nameResult = authNameSchema.safeParse(formData.get("name"));
  if (!emailResult.success || !nameResult.success) redirect("/login?error=signup");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: emailResult.data,
    options: {
      shouldCreateUser: true,
      data: { display_name: nameResult.data },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (error) redirect("/login?error=signup");

  redirect("/login?sent=1");
}

/** New account, password: email + name + password. This is the default
 *  signup path (see auth-card.tsx) — Supabase's `enable_confirmations` is
 *  off (supabase/config.toml, mirrored on the hosted project), so signUp
 *  returns a session immediately and no confirmation e-mail is sent. */
export async function signUpWithPassword(formData: FormData) {
  const emailResult = authEmailSchema.safeParse(formData.get("email"));
  const nameResult = authNameSchema.safeParse(formData.get("name"));
  const passwordResult = authPasswordSchema.safeParse(formData.get("password"));
  if (!emailResult.success || !nameResult.success || !passwordResult.success) {
    redirect("/login?error=signup");
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: emailResult.data,
    password: passwordResult.data,
    options: {
      data: { display_name: nameResult.data },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (error || !data.session) redirect("/login?error=signup");

  redirect("/");
}

/** Returning user, passwordless: email only. Does not create an account. */
export async function loginWithMagicLink(formData: FormData) {
  const emailResult = authEmailSchema.safeParse(formData.get("email"));
  if (!emailResult.success) redirect("/login?error=magic");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: emailResult.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (error) redirect("/login?error=magic");

  redirect("/login?sent=1");
}

/** Password login — the default login path alongside magic link. */
export async function loginWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=password");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=password");

  redirect("/");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Rewrite `AuthCard`**

Replace the full contents of `src/components/auth/auth-card.tsx` with:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "signup" | "login";

const ERROR_MESSAGES: Record<string, string> = {
  signup: "Konto konnte nicht erstellt werden – prüfe die Eingaben.",
  magic: "Link konnte nicht gesendet werden – prüfe die E-Mail-Adresse.",
  password: "Anmeldung fehlgeschlagen – prüfe E-Mail und Passwort.",
  link: "Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.",
};

type Props = {
  error?: string;
  sent: boolean;
  signUpAction: (formData: FormData) => void;
  signUpMagicLinkAction: (formData: FormData) => void;
  magicLoginAction: (formData: FormData) => void;
  passwordLoginAction: (formData: FormData) => void;
};

export function AuthCard({
  error,
  sent,
  signUpAction,
  signUpMagicLinkAction,
  magicLoginAction,
  passwordLoginAction,
}: Props) {
  // error=link/magic (a dead or failed magic link) is always a login-side
  // problem regardless of which form the user last submitted, so land them
  // on "Anmelden" and keep them in magic-link mode to retry.
  const [mode, setMode] = useState<Mode>(
    error === "password" || error === "link" || error === "magic" ? "login" : "signup"
  );
  const [loginUsePassword, setLoginUsePassword] = useState(error !== "magic" && error !== "link");
  // Password is the default signup path; magic link is an opt-in
  // alternative. A signup error doesn't say which sub-form failed, so it's
  // fine to always land back on the password sub-form.
  const [signupUsePassword, setSignupUsePassword] = useState(true);

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Prüfe dein Postfach</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Wir haben dir einen Anmeldelink per E-Mail geschickt. Öffne ihn auf diesem Gerät, um
            fortzufahren.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">GymTrack</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={tabClass(mode === "signup")}
            aria-pressed={mode === "signup"}
            onClick={() => setMode("signup")}
          >
            Konto erstellen
          </button>
          <button
            type="button"
            className={tabClass(mode === "login")}
            aria-pressed={mode === "login"}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>
        </div>

        {mode === "signup" && signupUsePassword && (
          <form action={signUpAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-password-name">Name</Label>
              <Input
                id="signup-password-name"
                name="name"
                type="text"
                autoComplete="name"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-password-email">E-Mail</Label>
              <Input
                id="signup-password-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-password">Passwort</Label>
              <Input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="min-h-11"
                required
              />
            </div>
            {error === "signup" && <p className="text-sm text-destructive">{ERROR_MESSAGES.signup}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Konto erstellen
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setSignupUsePassword(false)}
            >
              Stattdessen Link per E-Mail senden
            </button>
          </form>
        )}

        {mode === "signup" && !signupUsePassword && (
          <form action={signUpMagicLinkAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-magic-name">Name</Label>
              <Input
                id="signup-magic-name"
                name="name"
                type="text"
                autoComplete="name"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-magic-email">E-Mail</Label>
              <Input
                id="signup-magic-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            {error === "signup" && <p className="text-sm text-destructive">{ERROR_MESSAGES.signup}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Link senden
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setSignupUsePassword(true)}
            >
              Stattdessen Passwort vergeben
            </button>
          </form>
        )}

        {mode === "login" && loginUsePassword && (
          <form action={passwordLoginAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password-email">E-Mail</Label>
              <Input
                id="password-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="min-h-11"
                required
              />
            </div>
            {error === "password" && <p className="text-sm text-destructive">{ERROR_MESSAGES.password}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Anmelden
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setLoginUsePassword(false)}
            >
              Stattdessen Link per E-Mail senden
            </button>
          </form>
        )}

        {mode === "login" && !loginUsePassword && (
          <form action={magicLoginAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="magic-email">E-Mail</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            {(error === "magic" || error === "link") && (
              <p className="text-sm text-destructive">{ERROR_MESSAGES[error]}</p>
            )}
            <Button type="submit" className="min-h-11 w-full">
              Link senden
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setLoginUsePassword(true)}
            >
              Stattdessen Passwort verwenden
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function tabClass(active: boolean) {
  return cn(
    "min-h-9 flex-1 rounded-md text-sm font-medium transition-colors",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
  );
}
```

Note: `signup-password-name`/`signup-magic-name` (and the email equivalents) are deliberately distinct `id`s across the two signup sub-forms, even though only one renders at a time — this matches the existing login sub-forms' pattern (`password-email` vs `magic-email`), so don't collapse them back to a shared id.

- [ ] **Step 3: Wire the new action into the login page**

Replace the full contents of `src/app/login/page.tsx` with:

```tsx
import {
  loginWithMagicLink,
  loginWithPassword,
  signUpWithMagicLink,
  signUpWithPassword,
} from "./actions";
import { AuthCard } from "@/components/auth/auth-card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthCard
        error={error}
        sent={sent === "1"}
        signUpAction={signUpWithPassword}
        signUpMagicLinkAction={signUpWithMagicLink}
        magicLoginAction={loginWithMagicLink}
        passwordLoginAction={loginWithPassword}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verify the type-checker and linter are clean**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification against the running app**

Prerequisite: local Supabase must be running (`supabase start` in the repo root) and `npm run dev` started separately. Open `http://127.0.0.1:3000/login`.

Check all of the following:
1. The "Konto erstellen" tab shows Name + E-Mail + Passwort by default, with a "Stattdessen Link per E-Mail senden" link at the bottom.
2. Sign up with a new e-mail + name + an 8+ character password → redirected straight to `/` (no e-mail sent), logged in as the new user with the entered name shown ("Hallo `<name>`").
3. Log out (existing button on the home page — still there until Task 3 moves it), go back to `/login`, click "Stattdessen Link per E-Mail senden" on the signup tab → form switches to Name + E-Mail only, submit → lands on the "Prüfe dein Postfach" screen.
4. Click "Anmelden" tab → shows E-Mail + Passwort by default (not magic link) with a "Stattdessen Link per E-Mail senden" link.
5. Log in with the password account created in step 2 → redirected to `/`.
6. On the login tab, click "Stattdessen Link per E-Mail senden", submit an e-mail → lands on "Prüfe dein Postfach". Check the local inbox at `http://127.0.0.1:54324` for the link and confirm it still logs you in.
7. Submit the password login form with a wrong password → redirected back to `/login?error=password`, lands on the login tab in password mode with the error message shown.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/actions.ts src/components/auth/auth-card.tsx src/app/login/page.tsx
git commit -m "feat: make password the default signup and login path"
```

---

### Task 3: Profile page — rename and set/update password

**Files:**
- Create: `src/app/profile/actions.ts`
- Create: `src/app/profile/page.tsx`
- Create: `src/components/profile/profile-form.tsx`
- Modify: `src/components/nav/bottom-tabs.tsx` (add the third tab)
- Modify: `src/app/page.tsx` (remove the "Abmelden" button — it moves to the profile page)

**Interfaces:**
- Consumes: `authNameSchema`, `authPasswordSchema` from `@/lib/validation` (Task 1); `createServerSupabase` from `@/lib/supabase/server`; `logout` from `@/app/login/actions` (unchanged, existing export).
- Produces: `updateDisplayName(formData: FormData): Promise<void>` and `setPassword(formData: FormData): Promise<void>`, both exported `"use server"` functions from `src/app/profile/actions.ts`. `ProfileForm` — a client component taking `{ email, initialName, error, saved, updateDisplayNameAction, setPasswordAction, logoutAction }`.

- [ ] **Step 1: Write the profile server actions**

Create `src/app/profile/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { authNameSchema, authPasswordSchema } from "@/lib/validation";
import { createServerSupabase } from "@/lib/supabase/server";

/** Renames the current user. Works no matter how they signed in. */
export async function updateDisplayName(formData: FormData) {
  const nameResult = authNameSchema.safeParse(formData.get("name"));
  if (!nameResult.success) redirect("/profile?error=name");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: nameResult.data })
    .eq("id", user.id);
  if (error) redirect("/profile?error=name");

  redirect("/profile?saved=name");
}

/**
 * Sets or updates the current user's password. `auth.updateUser` doesn't
 * distinguish "first password ever" (e.g. after a magic-link-only signup)
 * from "change an existing password" — both are the same call, so this one
 * action covers both cases from the profile page.
 */
export async function setPassword(formData: FormData) {
  const passwordResult = authPasswordSchema.safeParse(formData.get("password"));
  const confirmResult = authPasswordSchema.safeParse(formData.get("confirmPassword"));
  if (
    !passwordResult.success ||
    !confirmResult.success ||
    passwordResult.data !== confirmResult.data
  ) {
    redirect("/profile?error=password");
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: passwordResult.data });
  if (error) redirect("/profile?error=password");

  redirect("/profile?saved=password");
}
```

- [ ] **Step 2: Write the profile form (client component)**

Create `src/components/profile/profile-form.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  name: "Name konnte nicht gespeichert werden.",
  password:
    "Passwort konnte nicht gespeichert werden – prüfe, ob beide Felder übereinstimmen und mindestens 8 Zeichen lang sind.",
};

const SAVED_MESSAGES: Record<string, string> = {
  name: "Name gespeichert.",
  password: "Passwort gespeichert.",
};

type Props = {
  email: string;
  initialName: string;
  error?: string;
  saved?: string;
  updateDisplayNameAction: (formData: FormData) => void;
  setPasswordAction: (formData: FormData) => void;
  logoutAction: () => void;
};

export function ProfileForm({
  email,
  initialName,
  error,
  saved,
  updateDisplayNameAction,
  setPasswordAction,
  logoutAction,
}: Props) {
  const [password, setPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konto</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateDisplayNameAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                name="name"
                type="text"
                autoComplete="name"
                defaultValue={initialName}
                className="min-h-11"
                required
              />
            </div>
            {error === "name" && <p className="text-sm text-destructive">{ERROR_MESSAGES.name}</p>}
            {saved === "name" && <p className="text-sm text-muted-foreground">{SAVED_MESSAGES.name}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Name speichern
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passwort</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={setPasswordAction} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Falls du dich bisher nur per Link angemeldet hast, kannst du hier erstmals ein
              Passwort vergeben. Ein bestehendes Passwort wird dabei überschrieben.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-password">Neues Passwort</Label>
              <Input
                id="profile-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPasswordValue(event.target.value)}
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-confirm-password">Passwort wiederholen</Label>
              <Input
                id="profile-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="min-h-11"
                required
              />
            </div>
            {passwordsMismatch && (
              <p className="text-sm text-destructive">Die Passwörter stimmen nicht überein.</p>
            )}
            {error === "password" && (
              <p className="text-sm text-destructive">{ERROR_MESSAGES.password}</p>
            )}
            {saved === "password" && (
              <p className="text-sm text-muted-foreground">{SAVED_MESSAGES.password}</p>
            )}
            <Button type="submit" className="min-h-11 w-full" disabled={passwordsMismatch}>
              Passwort speichern
            </Button>
          </form>
        </CardContent>
      </Card>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" className="min-h-11 w-full text-muted-foreground">
          Abmelden
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Write the profile page (server component)**

Create `src/app/profile/page.tsx`:

```tsx
import { logout } from "@/app/login/actions";
import { setPassword, updateDisplayName } from "./actions";
import { ProfileForm } from "@/components/profile/profile-form";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Profil</h1>

      <ProfileForm
        email={user?.email ?? ""}
        initialName={profile?.display_name ?? ""}
        error={error}
        saved={saved}
        updateDisplayNameAction={updateDisplayName}
        setPasswordAction={setPassword}
        logoutAction={logout}
      />
    </main>
  );
}
```

`/profile` needs no middleware change — `src/middleware.ts` already treats every path except `/login` and `/auth/confirm` as protected, so an unauthenticated request redirects to `/login` automatically.

- [ ] **Step 4: Add the "Profil" tab to bottom navigation**

Replace the full contents of `src/components/nav/bottom-tabs.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Heute", Icon: Dumbbell },
  { href: "/history", label: "Verlauf", Icon: CalendarDays },
  { href: "/profile", label: "Profil", Icon: UserRound },
];

export function BottomTabs() {
  const pathname = usePathname();

  // The login screen has no navigation.
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: Remove the "Abmelden" button from the home page**

Replace the full contents of `src/app/page.tsx` with:

```tsx
import Link from "next/link";

import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { Card, CardContent } from "@/components/ui/card";
import { countWorkoutsSince, listRecentWorkouts } from "@/lib/data/workouts";
import { formatPerformedOn, startOfWeekMonday, todayInAppTimezone } from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function HomePage({
  searchParams,
}: {
  // A Promise in this Next.js version — see `src/app/login/page.tsx`.
  searchParams: Promise<{ error?: string }>;
}) {
  // `startWorkout` redirects here with ?error=start when the insert fails.
  // Without reading it, the app's primary action dead-ends on a silent screen.
  const { error } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  const weekStart = startOfWeekMonday(new Date(`${todayInAppTimezone()}T12:00:00`));
  const [thisWeek, recent] = await Promise.all([
    countWorkoutsSince(weekStart),
    listRecentWorkouts(5),
  ]);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">GymTrack</h1>

      <p className="mt-1 text-sm text-muted-foreground">
        Hallo {profile?.display_name ?? "du"}
      </p>

      <Card className="mt-6">
        <CardContent className="flex items-baseline gap-3 p-4">
          <span className="text-4xl font-bold tabular-nums">{thisWeek}</span>
          <span className="text-sm text-muted-foreground">
            {thisWeek === 1 ? "Workout diese Woche" : "Workouts diese Woche"}
          </span>
        </CardContent>
      </Card>

      <div className="mt-6">
        <StartWorkoutButton />
        {error === "start" && (
          <p className="mt-2 text-sm text-destructive">
            Workout konnte nicht gestartet werden – versuch es noch einmal.
          </p>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Zuletzt
        </h2>

        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein Workout geloggt. Starte dein erstes.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recent.map((workout) => (
              <li key={workout.id}>
                <Link
                  href={`/workout/${workout.id}`}
                  className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4"
                >
                  <span className="font-medium">
                    {formatPerformedOn(workout.performed_on)}
                    {workout.category ? ` · ${workout.category}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

The only changes from the current file: the `logout` import and the `<header>` with the "Abmelden" `<form>` are gone (replaced by a plain `<h1>`), and the now-unused `Button` import is dropped.

- [ ] **Step 6: Verify the type-checker and linter are clean**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification against the running app**

Prerequisite: local Supabase running (`supabase start`) and `npm run dev` started. Log in (any account from Task 2's verification works).

Check all of the following:
1. Bottom nav now shows three tabs: Heute, Verlauf, Profil. The home page header no longer has an "Abmelden" button.
2. Open `/profile` — shows the account e-mail, a Name field pre-filled with the current display name, a password + confirm-password field, and an "Abmelden" button at the bottom.
3. Change the name, submit → page reloads at `/profile?saved=name`, "Name gespeichert." shown, and the new name persists on reload (check it also shows correctly as "Hallo `<name>`" on the home page).
4. Type two different values into the password and confirm-password fields → "Die Passwörter stimmen nicht überein." appears and the submit button is disabled; make them match → the message disappears and the button re-enables.
5. Submit a matching new password (8+ chars) → redirected to `/profile?saved=password`, "Passwort gespeichert." shown.
6. Log out (via the button on the profile page), then log back in on `/login` using the password tab with the password just set in step 5 → succeeds.
7. **The specific case this feature exists for:** create a brand-new account via magic link only (signup tab → "Stattdessen Link per E-Mail senden"), confirm the link, go straight to `/profile` and set a password there without ever having had one before → same flow as step 5, then log out and log back in with that password on `/login`'s password tab → succeeds. This confirms `updateUser({ password })` works identically for "first password ever" and "changing an existing one".

- [ ] **Step 8: Commit**

```bash
git add src/app/profile/actions.ts src/app/profile/page.tsx src/components/profile/profile-form.tsx src/components/nav/bottom-tabs.tsx src/app/page.tsx
git commit -m "feat: add profile page for renaming and setting/updating a password"
```
