import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Lands the emailed magic-link. @supabase/ssr's browser/server clients
 * hardcode `flowType: "pkce"`, so signInWithOtp's default email template
 * points here with `?code=...` — exchange it for a session via the same
 * cookie-backed client that stored the PKCE code verifier when the link
 * was requested. `token_hash`+`type` is handled too as a defensive
 * fallback (the shape used if PKCE is ever turned off project-side).
 * Must stay reachable while logged out (see the middleware allow-list) or
 * the link has nowhere to land.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
