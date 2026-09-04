/**
 * PostHog Transport Client
 *
 * Wraps official posthog-js browser SDK with privacy guardrails and failure isolation.
 */

import posthog from "posthog-js";
import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalEvent } from "../events/canonical-types";
import { mapCanonicalToPostHog } from "./posthog-mapper";

export interface PostHogClientConfig {
  apiKey: string;
  apiHost?: string;
  autocapture?: boolean;
  sessionRecording?: boolean;
  debug?: boolean;
  respectDnt?: boolean;
  defaults?: string;
}

export class PostHogTransport {
  private isInitialized = false;
  private isEnabled = true;

  constructor(private config: PostHogClientConfig) {}

  public init(): boolean {
    if (this.isInitialized || !this.config.apiKey) return this.isInitialized;

    return tryCatchGuard(() => {
      posthog.init(this.config.apiKey, {
        api_host: this.config.apiHost || "https://us.i.posthog.com",
        defaults: this.config.defaults || "2026-05-30",
        autocapture: this.config.autocapture ?? true,
        capture_pageview: false, // We control canonical page_viewed events
        capture_pageleave: true,
        request_batching: true,
        disable_session_recording: this.config.sessionRecording === false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        mask_all_element_attributes: true,
        mask_all_text: true,
        opt_out_capturing_by_default: false,
        loaded: () => {
          this.isInitialized = true;
        },
      } as Parameters<typeof posthog.init>[1]);

      this.isInitialized = true;
      return true;
    }, false, this.config.debug, "PostHogTransport:init");
  }

  public registerSuperProperties(properties: Record<string, unknown>): void {
    if (!this.isInitialized || !this.isEnabled) return;
    tryCatchGuard(() => {
      posthog.register(properties);
    }, undefined, this.config.debug, "PostHogTransport:register");
  }

  public capture(event: CanonicalEvent): boolean {
    if (!this.isEnabled) return false;

    return tryCatchGuard(() => {
      const { eventName, properties } = mapCanonicalToPostHog(event);
      posthog.capture(eventName, properties);
      return true;
    }, false, this.config.debug, "PostHogTransport:capture");
  }

  public identify(distinctId: string, traits?: Record<string, unknown>): void {
    if (!this.isEnabled) return;
    tryCatchGuard(() => {
      posthog.identify(distinctId, traits);
    }, undefined, this.config.debug, "PostHogTransport:identify");
  }

  public reset(): void {
    if (!this.isEnabled) return;
    tryCatchGuard(() => {
      posthog.reset();
    }, undefined, this.config.debug, "PostHogTransport:reset");
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public getPostHogInstance(): typeof posthog {
    return posthog;
  }
}
