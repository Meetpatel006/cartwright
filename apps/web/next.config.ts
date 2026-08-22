import "@cartwright/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  // Stagehand resolves extension assets via `new URL("../", import.meta.url)`,
  // which can't be bundled — load it from node_modules at runtime instead.
  serverExternalPackages: ["@browserbasehq/stagehand"],
};

export default nextConfig;
