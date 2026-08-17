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
    <main className="mx-auto w-full max-w-md p-4">
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
