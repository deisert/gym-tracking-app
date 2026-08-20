# Deployment TODOs

Manual steps left over from the email+name signup work (PRs #2, #3). Neither
can be done by Claude from this session — see reasons below.

- [x] **Set `NEXT_PUBLIC_SITE_URL`** in Vercel (Project → Settings →
      Environment Variables) to the real deployed origin, then redeploy.
      Without it, magic-link emails point at `127.0.0.1:3000` instead of the
      live site.
- [x] **Apply the new migration** against the real Supabase project:
      `supabase link` → `supabase db push` (or paste
      `supabase/migrations/20260819000001_profile_on_signup.sql` into the
      Studio SQL editor). Without it, signup won't auto-create the
      `profiles` row for new users.
- [x] **Enable email signups**: Supabase Dashboard → Authentication →
      Sign In / Providers → Email → "Allow new users to sign up". Confirmed
      via Auth Logs — `POST /auth/v1/otp` returns 422, consistent with
      signups being disabled project-wide.
- [ ] **Fix Supabase Auth URL Configuration**: Dashboard → Authentication →
      URL Configuration — set Site URL to
      `https://gym-tracking-app-kohl.vercel.app` and add
      `https://gym-tracking-app-kohl.vercel.app/**` to Redirect URLs.
      Confirmed via Auth Logs — the emailed link's `redirect_to` silently
      fell back to a different (stale) domain's bare `/`, skipping
      `/auth/confirm` entirely, because the real domain wasn't allow-listed.
      That's why signup confirmation bounces back to `/login`.

## Why Claude can't do these

- **Vercel**: the connector is connected and authorized
  (`ListConnectors` → connected: true), and `list_teams` sees "Dominik's
  projects" — but `list_projects`/`get_project` on that team both come back
  empty/404. Team-level OAuth is granted; project-level data isn't, which
  points at a per-project access grant on Vercel's side (separate from the
  claude.ai connector authorization) rather than a broken connection.
- **Supabase**: the MCP server needs an OAuth flow that can't be completed
  in this non-interactive session.
