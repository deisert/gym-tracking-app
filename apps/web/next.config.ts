import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @gymtrack/core is published as raw TypeScript source (no build step),
  // so Next has to run it through its own compiler rather than assume
  // node_modules is pre-compiled JavaScript.
  transpilePackages: ["@gymtrack/core"],
  experimental: {
    // Failed navigations and Server Actions stay pending and retry when the
    // connection returns, instead of rejecting. See CONCEPT.md §2.8 —
    // never lose a logged set to bad gym reception.
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // Never cache the worker itself, or a broken one can never be
          // replaced on devices that already fetched it.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
