/**
 * Browser Bundle Build Script
 *
 * Uses Bun.build to produce a standalone minified IIFE browser bundle
 * for distribution via CDN / public static serving.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

declare const Bun: {
  build(options: {
    entrypoints: string[];
    outdir: string;
    naming?: string;
    target?: string;
    format?: string;
    minify?: boolean;
    sourcemap?: string;
  }): Promise<{ success: boolean; logs: unknown[]; outputs: Array<{ path: string }> }>;
};

async function build() {
  console.log("Building Cartwright Tracker browser bundle...");

  const baseDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const distDir = resolve(baseDir, "dist");
  await mkdir(distDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [resolve(baseDir, "src/index.ts")],
    outdir: distDir,
    naming: "v1.js",
    target: "browser",
    format: "iife",
    minify: true,
    sourcemap: "external",
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }

  console.log("Build succeeded:", result.outputs.map((o: { path: string }) => o.path).join(", "));
}

build().catch((err) => {
  console.error("Unexpected build error:", err);
  process.exit(1);
});
