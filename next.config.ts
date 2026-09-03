import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Playwright (used for server-side invoice PDF rendering) out of the
  // bundler — it's a Node-only dependency loaded at runtime in route handlers.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
