/**
 * Safe Error Boundary
 *
 * Wraps arbitrary callbacks and operations so tracker failures NEVER
 * throw uncaught exceptions or break the host merchant website.
 */

export function tryCatchGuard<T>(
  fn: () => T,
  fallback: T,
  debug = false,
  context = "tracker",
): T {
  try {
    return fn();
  } catch (err) {
    if (debug && typeof console !== "undefined" && console.warn) {
      console.warn(`[CartwrightTracker:${context}]`, err);
    }
    return fallback;
  }
}

export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  debug = false,
  context = "tracker",
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (debug && typeof console !== "undefined" && console.warn) {
      console.warn(`[CartwrightTracker:${context}]`, err);
    }
    return fallback;
  }
}
