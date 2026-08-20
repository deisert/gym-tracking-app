"use client";

import { useEffect, useState } from "react";

/**
 * Mirrors the `prefers-reduced-motion` media query.
 *
 * Starts `false` (SSR-safe — `window` doesn't exist on the server) and
 * corrects itself on mount, then stays in sync if the OS setting changes
 * while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
