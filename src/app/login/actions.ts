"use server";

import { redirect } from "next/navigation";
import { authEmailSchema, authNameSchema } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site-url";
import { createServerSupabase } from "@/lib/supabase/server";

/** New account: email + name only, no password (CONCEPT.md open question #1). */
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

/** Password login — kept as a backup path alongside magic link. */
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
