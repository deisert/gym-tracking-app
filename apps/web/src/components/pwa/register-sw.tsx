"use client";

import { useEffect } from "react";

/** Registers the service worker after mount. Renders nothing. */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("service worker registration failed", error));
  }, []);

  return null;
}
