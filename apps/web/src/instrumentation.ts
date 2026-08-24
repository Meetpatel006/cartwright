/**
 * Next.js instrumentation hook (runs once per server process start).
 *
 * Starts the Part B cleanup scheduler so expired shopping sessions and their
 * retained browser sessions are actually swept in production. Without this,
 * `expiresAt` is only ever enforced lazily on read/select.
 *
 * Only runs in the Node.js runtime (never middleware/edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startCleanupScheduler } = await import(
    "@cartwright/api/shopping/cleanup-scheduler"
  );
  // Interval default: 5 minutes. The timer is unref'd so it never keeps the
  // process alive on its own; failures inside a sweep are swallowed and the
  // next tick retries (idempotent by design).
  startCleanupScheduler();
}
