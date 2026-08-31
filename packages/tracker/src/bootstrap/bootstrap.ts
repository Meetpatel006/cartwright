/**
 * Browser Bootstrap Module
 *
 * Automatically initializes CartwrightTracker from the current script tag
 * and mounts the global window.cartwright API.
 */

import { CartwrightTracker } from "../core/tracker";
import { createCartwrightAPI, type CartwrightGlobalAPI } from "../public-api/cartwright-api";
import { extractScriptConfig } from "../config/config";
import { tryCatchGuard } from "../core/error-boundary";

declare global {
  interface Window {
    cartwright?: CartwrightGlobalAPI;
  }
}

let globalTrackerInstance: CartwrightTracker | null = null;

export function bootstrapTracker(): CartwrightTracker | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  return tryCatchGuard(() => {
    if (globalTrackerInstance) {
      return globalTrackerInstance;
    }

    const tracker = new CartwrightTracker();
    globalTrackerInstance = tracker;

    const api = createCartwrightAPI(tracker);
    window.cartwright = api;

    const scriptConfig = extractScriptConfig();
    if (scriptConfig.siteId) {
      tracker.init();
    }

    return tracker;
  }, null);
}
