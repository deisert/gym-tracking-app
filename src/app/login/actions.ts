"use server";

import { redirect } from "next/navigation";
import { authEmailSchema, authNameSchema, authPasswordSchema } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site-url";
import { createServerSupabase } from "@/lib/supabase/server";

/** New account, default path: email + name + password. */
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
  if (error) redirect("/login?error=signup");

  // Projects with email confirmations disabled get a session immediately;
  // otherwise Supabase mails a confirmation link and there's nothing to log
  // into yet.
  if (data.session) redirect("/");
  redirect("/login?sent=1");
}

/** New account, secondary path: email + name only, no password to set or remember. */
export async function signUpWithMagicLink(formData: FormData) {
  const emailResult = authEmailSchema.safeParse(formData.get("email"));
  const nameResult = authNameSchema.safeParse(formData.get("name"));
  if (!emailResult.success || !nameResult.success) redirect("/login?error=signup-magic");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: emailResult.data,
    options: {
      shouldCreateUser: true,
      data: { display_name: nameResult.data },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (error) redirect("/login?error=signup-magic");

  redirect("/login?sent=1");
}

/** Returning user, secondary path: email only, passwordless. Does not create an account. */
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

/** Returning user, default path: email + password. */
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
