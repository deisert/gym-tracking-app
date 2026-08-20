import { loginWithMagicLink, loginWithPassword, signUpWithMagicLink } from "./actions";
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
        signUpAction={signUpWithMagicLink}
        magicLoginAction={loginWithMagicLink}
        passwordLoginAction={loginWithPassword}
      />
    </main>
  );
}
