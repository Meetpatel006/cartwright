/**
 * Tracker Configuration & Script Attribute Loader
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { PlatformType } from "../events/canonical-types";

export interface SiteConfig {
  siteId: string;
  merchantId?: string;
  platform?: PlatformType;
  enabled: boolean;
  posthogApiKey?: string;
  posthogHost?: string;
  apiEndpoint?: string;
  debug?: boolean;
  respectDnt?: boolean;
  autocapture?: boolean;
  sessionRecording?: boolean;
  actor?: "shopper" | "agent";
  sampleRate?: number;
}

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_POSTHOG_KEY =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_POSTHOG_KEY) || "";

/**
 * Extracts configuration attributes from the active script tag.
 */
export function extractScriptConfig(targetDoc?: Document): Partial<SiteConfig> {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return {};

  return tryCatchGuard(() => {
    // 1. Check document.currentScript
    let scriptEl = doc.currentScript as HTMLScriptElement | null;

    // 2. Fallback: Query all script tags for data-site or src containing tracker
    if (!scriptEl) {
      const scripts = Array.from(doc.querySelectorAll("script"));
      scriptEl =
        scripts.find(
          (s) => s.hasAttribute("data-site") || (s.src && s.src.includes("tracker")),
        ) || null;
    }

    if (!scriptEl) return {};

    const siteId = scriptEl.getAttribute("data-site") || undefined;
    const merchantId =
      scriptEl.getAttribute("data-merchant") ||
      scriptEl.getAttribute("data-merchant-id") ||
      undefined;
    const rawPlatform = scriptEl.getAttribute("data-platform");
    const platform = (rawPlatform as PlatformType) || undefined;
    const posthogApiKey = scriptEl.getAttribute("data-posthog-key") || undefined;
    const posthogHost = scriptEl.getAttribute("data-posthog-host") || undefined;
    const apiEndpoint = scriptEl.getAttribute("data-api-endpoint") || undefined;
    const debug =
      scriptEl.getAttribute("data-debug") === "true" ||
      scriptEl.getAttribute("data-debug") === "1";
    const respectDnt = scriptEl.getAttribute("data-dnt") !== "false";
    const autocapture = scriptEl.getAttribute("data-autocapture") !== "false";
    const sessionRecording = scriptEl.getAttribute("data-session-recording") !== "false";
    const rawActor = scriptEl.getAttribute("data-actor");
    const actor = rawActor === "agent" ? "agent" : rawActor === "shopper" ? "shopper" : undefined;

    return {
      siteId,
      merchantId,
      platform,
      posthogApiKey,
      posthogHost,
      apiEndpoint,
      debug,
      respectDnt,
      autocapture,
      sessionRecording,
      actor,
      enabled: true,
    };
  }, {});
}

/**
 * Resolves full SiteConfig by combining script attributes, defaults, and optional remote config.
 */
export async function resolveSiteConfig(
  inlineConfig?: Partial<SiteConfig>,
  fetchRemote = true,
): Promise<SiteConfig> {
  const scriptCfg = extractScriptConfig();
  const merged: SiteConfig = {
    siteId: inlineConfig?.siteId || scriptCfg.siteId || "",
    merchantId: inlineConfig?.merchantId || scriptCfg.merchantId,
    platform: inlineConfig?.platform || scriptCfg.platform,
    enabled: inlineConfig?.enabled ?? scriptCfg.enabled ?? true,
    posthogApiKey: inlineConfig?.posthogApiKey || scriptCfg.posthogApiKey || DEFAULT_POSTHOG_KEY,
    posthogHost: inlineConfig?.posthogHost || scriptCfg.posthogHost || DEFAULT_POSTHOG_HOST,
    apiEndpoint: inlineConfig?.apiEndpoint || scriptCfg.apiEndpoint,
    debug: inlineConfig?.debug ?? scriptCfg.debug ?? false,
    respectDnt: inlineConfig?.respectDnt ?? scriptCfg.respectDnt ?? true,
    autocapture: inlineConfig?.autocapture ?? scriptCfg.autocapture ?? true,
    sessionRecording: inlineConfig?.sessionRecording ?? scriptCfg.sessionRecording ?? true,
    actor: inlineConfig?.actor || scriptCfg.actor,
    sampleRate: inlineConfig?.sampleRate ?? 1.0,
  };

  if (!merged.siteId) {
    merged.enabled = false;
    return merged;
  }

  // Attempt to fetch public dynamic configuration if an endpoint is provided or standard /api/tracker/config
  if (fetchRemote && merged.apiEndpoint && typeof fetch !== "undefined") {
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

      const url = `${merged.apiEndpoint}?site=${encodeURIComponent(merged.siteId)}${
        merged.merchantId ? `&merchant=${encodeURIComponent(merged.merchantId)}` : ""
      }`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller?.signal,
        headers: { Accept: "application/json" },
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        const remoteData = (await res.json()) as Partial<SiteConfig>;
        if (remoteData.merchantId) merged.merchantId = remoteData.merchantId;
        if (remoteData.posthogApiKey) merged.posthogApiKey = remoteData.posthogApiKey;
        if (remoteData.posthogHost) merged.posthogHost = remoteData.posthogHost;
        if (remoteData.enabled !== undefined) merged.enabled = remoteData.enabled;
        if (remoteData.autocapture !== undefined) merged.autocapture = remoteData.autocapture;
      }
    } catch {
      // Remote config fetch failed or timed out — silently fall back to client defaults
    }
  }

  return merged;
}
