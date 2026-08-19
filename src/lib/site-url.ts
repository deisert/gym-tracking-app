/**
 * Absolute origin used for `emailRedirectTo` on magic-link requests — Supabase
 * needs a full URL, not a relative path. Falls back to the local Supabase
 * `site_url` (see `supabase/config.toml`) so this works out of the box in dev.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}
