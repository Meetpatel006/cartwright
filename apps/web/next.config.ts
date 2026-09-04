import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: ["@browserbasehq/stagehand"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "localhost:3002",
        "localhost:3003",
        "127.0.0.1:3000",
        "127.0.0.1:3001",
        "127.0.0.1:3002",
        "127.0.0.1:3003",
      ],
    },
  },
};

export default nextConfig;
