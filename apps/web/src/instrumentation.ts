/**
 * Next.js instrumentation hook (runs once per server process start).
 *
 * All Node-only setup lives in `instrumentation-node.ts` — Next.js excludes
 * that file from the Edge runtime bundle, so `process.on(...)` here never
 * trips the "Node.js API used in Edge Runtime" warning.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}
