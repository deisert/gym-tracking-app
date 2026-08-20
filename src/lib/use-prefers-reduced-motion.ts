"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** No `window` on the server; `false` is the safe default until the client corrects it on mount. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Mirrors the `prefers-reduced-motion` media query.
 *
 * `useSyncExternalStore` (not `useEffect` + `useState`) because this is
 * exactly its intended use: subscribing to a mutable value that lives
 * outside React and can change independently of any render.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
