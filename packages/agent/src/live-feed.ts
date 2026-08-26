/**
 * Live browser feed: an in-memory, single-frame-per-key buffer of JPEG
 * screenshots captured from the browser the agent is driving.
 *
 * The agent pumps frames into this buffer while a run is active (see
 * `startLiveFeedPump` in `shopping-agent.ts`); the API exposes the latest
 * frame per user via a tRPC query, and the web UI polls it to show what the
 * agent sees in real time. Nothing is persisted — frames live only in process
 * memory and are cleared when the pump stops.
 */

/** Structural subset of Playwright's Page the pump needs (keeps this module
 *  dependency-free and trivially testable). */
export interface LiveFeedScreenshotPage {
  screenshot(options: { type: "jpeg"; quality?: number }): Promise<Buffer>;
}

/** key -> latest frame as a `data:image/jpeg;base64,...` URL. */
const latestFrames = new Map<string, string>();

/** Store/update the latest frame for `key`. */
export function publishLiveFrame(key: string, frame: string): void {
  if (!key) return;
  latestFrames.set(key, frame);
}

/** Read the latest frame for `key` (undefined when nothing was published). */
export function getLiveFrame(key: string): string | undefined {
  return latestFrames.get(key);
}

/** Drop the buffered frame for `key`. */
export function clearLiveFrame(key: string): void {
  latestFrames.delete(key);
}

export interface LiveFeedPumpOptions {
  /** Milliseconds between captures (default 800). */
  intervalMs?: number;
  /** JPEG quality 1-100 (default 55). */
  quality?: number;
}

/**
 * Repeatedly capture JPEG screenshots of `page` into the live-feed buffer
 * under `key` until the returned stop function is called. Capture errors
 * (navigation, CDP hiccups) are swallowed and retried on the next tick so a
 * brief navigation never kills the feed.
 *
 * Returns a stop function — idempotent, clears the buffered frame.
 */
export function startLiveFeedPump(
  page: LiveFeedScreenshotPage,
  key: string,
  options: LiveFeedPumpOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 800;
  const quality = options.quality ?? 55;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const buffer = await page.screenshot({ type: "jpeg", quality });
      if (!stopped && buffer.length > 0) {
        publishLiveFrame(
          key,
          `data:image/jpeg;base64,${buffer.toString("base64")}`,
        );
      }
    } catch {
      /* page mid-navigation or closed; retry next tick */
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  // First frame almost immediately so the UI doesn't sit empty.
  timer = setTimeout(() => void tick(), 50);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    clearLiveFrame(key);
  };
}
