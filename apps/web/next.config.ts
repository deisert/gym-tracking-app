import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @gymtrack/core is published as raw TypeScript source (no build step),
  // so Next has to run it through its own compiler rather than assume
  // node_modules is pre-compiled JavaScript.
  transpilePackages: ["@gymtrack/core"],
};

export default nextConfig;
