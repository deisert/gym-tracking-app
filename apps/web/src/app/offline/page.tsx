export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <h1 className="text-xl font-semibold">Kein Empfang</h1>
      <p className="text-sm text-muted-foreground">
        GymTrack braucht kurz Verbindung. Sobald du wieder Empfang hast, lädt
        die Seite von selbst weiter.
      </p>
    </main>
  );
}
