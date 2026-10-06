"use client";

import { useOffline } from "next/offline";

/**
 * `useOffline` is more trustworthy than `navigator.onLine`, which reports true
 * for a phone on gym WiFi that has no route upstream. It flips on a failed
 * framework fetch as well as on the browser's `offline` event.
 */
export function OfflineBanner() {
  const isOffline = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm text-foreground"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      Offline – Eingaben werden gesendet, sobald du wieder Empfang hast.
    </div>
  );
}
