/**
 * Node.js-only server startup (imported dynamically from
 * `instrumentation.ts` so the Edge bundle never sees Node APIs).
 *
 * - Registers an `uncaughtException` guard (Windows EPERM safety net).
 * - Starts the Part B cleanup scheduler so expired shopping sessions and their
 *   retained browser sessions are actually swept in production. Without this,
 *   `expiresAt` is only ever enforced lazily on read/select.
 */
export async function registerNode() {
  // Windows safety net: chrome-launcher (pulled in by Stagehand) creates
  // `%TEMP%/lighthouse.<random>` Chrome profiles and rmSync()s them when the
  // browser is killed. On Windows Chrome can still hold locks in that dir, so
  // the rm throws EPERM as an UNCAUGHT EXCEPTION and would crash the whole
  // Next.js server mid-request. We pass our own --user-data-dir to prevent it
  // at the source; this handler is a belt-and-braces guard for any leftover
  // EPERM temp-cleanup errors from native deps. All other uncaught exceptions
  // are logged but do not exit, so one failed agent run never takes the
  // dev/prod server down.
  process.on("uncaughtException", (err) => {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "EPERM" && /lighthouse\./.test(e?.path ?? "")) {
      console.warn(
        `[instrumentation] ignored Windows EPERM cleaning chrome-launcher tmp: ${e.path}`,
      );
      return;
    }
    console.error("[instrumentation] uncaughtException:", err);
  });

  const { startCleanupScheduler } = await import(
    "@cartwright/api/shopping/cleanup-scheduler"
  );
  // Interval default: 5 minutes. The timer is unref'd so it never keeps the
  // process alive on its own; failures inside a sweep are swallowed and the
  // next tick retries (idempotent by design).
  startCleanupScheduler();
}
