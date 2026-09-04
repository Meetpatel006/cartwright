/**
 * Cartwright Universal Tracker Orchestrator
 */

import { AdapterRegistry } from "../adapters/adapter-registry";
import type { PlatformAdapter } from "../adapters/adapter.interface";
import { type SiteConfig, resolveSiteConfig } from "../config/config";
import { BoundedEventQueue } from "./queue";
import { tryCatchAsync, tryCatchGuard } from "./error-boundary";
import type {
  ActorType,
  AgentTelemetry,
  CanonicalCart,
  CanonicalEvent,
  CanonicalOrder,
  CanonicalProduct,
  EventType,
} from "../events/canonical-types";
import { createCanonicalEvent } from "../events/event-factory";
import { IdentityManager } from "../identity/identity";
import { PostHogTransport } from "../posthog/posthog-client";
import { ConsentManager } from "../privacy/consent";
import { SessionManager } from "../session/session";
import { SpaNavigator } from "../session/spa-navigator";
import { extractSearchFromFormSubmit, extractSearchQuery } from "../detection/search-detector";
import { resolveProductLayered } from "../detection/product-resolver";
import { ScopedDomObserver } from "./dom-observer";

export class CartwrightTracker {
  private config: SiteConfig | null = null;
  private identity: IdentityManager;
  private session: SessionManager;
  private consentManager: ConsentManager;
  private spaNavigator: SpaNavigator;
  private domObserver: ScopedDomObserver;
  private queue: BoundedEventQueue;
  private adapterRegistry: AdapterRegistry;
  private currentAdapter: PlatformAdapter | null = null;
  private transport: PostHogTransport | null = null;
  private searchSubmitListener: ((e: Event) => void) | null = null;
  private isInitialized = false;
  private isDestroyed = false;

  constructor() {
    this.identity = new IdentityManager();
    this.session = new SessionManager();
    this.consentManager = new ConsentManager();
    this.spaNavigator = new SpaNavigator();
    this.domObserver = new ScopedDomObserver(300);
    this.queue = new BoundedEventQueue();
    this.adapterRegistry = new AdapterRegistry();
  }

  public async init(inlineConfig?: Partial<SiteConfig>): Promise<boolean> {
    if (this.isInitialized || this.isDestroyed) return this.isInitialized;

    return tryCatchAsync(async () => {
      this.config = await resolveSiteConfig(inlineConfig);

      if (!this.config.enabled || !this.config.siteId) {
        return false;
      }

      // Check DNT / privacy consent
      if (!this.consentManager.isAllowed()) {
        if (this.config.debug && typeof console !== "undefined") {
          console.log("[CartwrightTracker] Tracking disabled by privacy settings or DNT.");
        }
        return false;
      }

      // Initialize PostHog transport
      if (this.config.posthogApiKey) {
        this.transport = new PostHogTransport({
          apiKey: this.config.posthogApiKey,
          apiHost: this.config.posthogHost,
          autocapture: this.config.autocapture,
          sessionRecording: this.config.sessionRecording,
          debug: this.config.debug,
          respectDnt: this.config.respectDnt,
        });
        this.transport.init();
        const superProps: Record<string, unknown> = {
          site_id: this.config.siteId,
          visitor_id: this.identity.getVisitorId(),
          cartwright_sdk_version: "1.0.0",
        };
        if (this.config.merchantId) {
          superProps.merchant_id = this.config.merchantId;
        }
        this.transport.registerSuperProperties(superProps);
      }

      // Select and initialize platform adapter
      if (this.config.platform) {
        this.currentAdapter = this.adapterRegistry.getAdapterByName(this.config.platform) || null;
      }
      if (!this.currentAdapter) {
        this.currentAdapter = this.adapterRegistry.resolveAdapter(
          typeof window !== "undefined" ? window : undefined,
          typeof document !== "undefined" ? document : undefined,
        );
      }

      this.currentAdapter.init((evt) => this.processEvent(evt), {
        siteId: this.config.siteId,
        visitorId: this.identity.getVisitorId(),
        sessionId: this.session.getSessionId(),
        debug: this.config.debug,
      });

      // Hook SPA navigation
      this.spaNavigator.onNavigate((url, referrer) => {
        this.handleNavigation(url, referrer);
      });

      // Hook safe search form submissions
      this.hookSearchForms();

      // Start scoped DOM mutation observer for dynamic SPA re-renders
      if (typeof document !== "undefined") {
        this.domObserver.observe(document, () => {
          this.scanDynamicView();
        });
      }

      this.isInitialized = true;

      // Drain queued events
      this.drainQueue();

      // Trigger initial pageview & automatic page scan
      this.handleInitialPage();

      return true;
    }, false, this.config?.debug, "CartwrightTracker:init");
  }

  private hookSearchForms(): void {
    if (typeof document === "undefined") return;

    this.searchSubmitListener = (e: Event) => {
      tryCatchGuard(() => {
        const form = (e.target as HTMLElement)?.closest?.("form") || (e.target as HTMLFormElement);
        if (!form) return;

        const query = extractSearchFromFormSubmit(form);
        if (query) {
          this.trackSearch(query);
        }
      }, undefined, this.config?.debug, "CartwrightTracker:searchSubmit");
    };

    document.addEventListener("submit", this.searchSubmitListener, true);
  }

  private handleInitialPage(): void {
    tryCatchGuard(() => {
      this.session.recordPageNavigation();
      this.track("page_viewed");

      const pathname = typeof location !== "undefined" ? location.pathname.toLowerCase() : "";

      // Auto-detect search
      const query = extractSearchQuery();
      if (query) {
        this.trackSearch(query);
      }

      // Auto-detect checkout started on checkout page
      if (pathname.includes("/checkout")) {
        this.track("checkout_started");
      }

      // Auto-detect product with strict layered priority
      const product = resolveProductLayered(
        typeof document !== "undefined" ? document : undefined,
        typeof location !== "undefined" ? location : undefined,
        this.currentAdapter,
      );
      if (product) {
        this.track("product_viewed", { product });
      }

      // Auto-detect order confirmation
      const order = this.currentAdapter?.extractOrder?.(
        typeof document !== "undefined" ? document : undefined,
      );
      if (order && order.order_id) {
        this.track("purchase_completed", { order });
      }
    }, undefined, this.config?.debug, "CartwrightTracker:initialPage");
  }

  private handleNavigation(url: string, referrer: string): void {
    tryCatchGuard(() => {
      this.session.recordPageNavigation();
      this.track("page_viewed", {
        page: { url, referrer, pathname: typeof location !== "undefined" ? location.pathname : "" },
      });

      const pathname = typeof location !== "undefined" ? location.pathname.toLowerCase() : "";
      if (pathname.includes("/checkout")) {
        this.track("checkout_started");
      }

      // Scan for product on new route
      setTimeout(() => {
        const product = resolveProductLayered(
          typeof document !== "undefined" ? document : undefined,
          typeof location !== "undefined" ? location : undefined,
          this.currentAdapter,
        );
        if (product) {
          this.track("product_viewed", { product });
        }
      }, 200);
    }, undefined, this.config?.debug, "CartwrightTracker:navigation");
  }

  private scanDynamicView(): void {
    tryCatchGuard(() => {
      const product = resolveProductLayered(
        typeof document !== "undefined" ? document : undefined,
        typeof location !== "undefined" ? location : undefined,
        this.currentAdapter,
      );
      if (product) {
        this.track("product_viewed", { product });
      }
    }, undefined, this.config?.debug, "CartwrightTracker:scanDynamicView");
  }

  public track<T = Record<string, unknown>>(
    eventName: EventType,
    params: {
      actor_type?: ActorType;
      page?: Record<string, unknown>;
      product?: CanonicalProduct;
      cart?: CanonicalCart;
      order?: CanonicalOrder;
      agent?: AgentTelemetry;
      search?: { query: string; results_count?: number };
      metadata?: T;
    } = {},
  ): void {
    if (this.isDestroyed) return;

    tryCatchGuard(() => {
      if (!this.config?.siteId) return;

      const actorType = this.resolveActorType(params.actor_type);

      const event = createCanonicalEvent({
        site_id: this.config.siteId,
        merchant_id: this.config.merchantId,
        visitor_id: this.identity.getVisitorId(),
        session_id: this.session.getSessionId(),
        event_name: eventName,
        actor_type: actorType,
        platform: this.currentAdapter?.name || "unknown",
        source: params.agent ? "agent_telemetry" : "auto_adapter",
        product: params.product,
        cart: params.cart,
        order: params.order,
        agent: params.agent,
        search: params.search,
        metadata: params.metadata,
      });

      this.processEvent(event as CanonicalEvent);
    }, undefined, this.config?.debug, "CartwrightTracker:track");
  }

  public resolveActorType(explicitActor?: ActorType): ActorType {
    if (explicitActor) return explicitActor;
    if (this.config?.actor) return this.config.actor;

    // Automated WebDriver / Bot / Headless Agent Heuristic
    if (
      typeof navigator !== "undefined" &&
      Boolean((navigator as { webdriver?: boolean }).webdriver)
    ) {
      return "agent";
    }

    // Explicit Cartwright Agent Window Flag
    if (
      typeof window !== "undefined" &&
      Boolean((window as unknown as { __CARTWRIGHT_AGENT__?: boolean }).__CARTWRIGHT_AGENT__)
    ) {
      return "agent";
    }

    return "shopper";
  }

  public trackSearch(query: string, resultsCount?: number): void {
    if (!query) return;
    this.track("search_performed", {
      search: { query: query.trim(), results_count: resultsCount },
    });
  }

  public trackProduct(product: CanonicalProduct, event: EventType = "product_viewed"): void {
    this.track(event, { product });
  }

  public trackCart(cart: CanonicalCart, event: EventType = "cart_viewed"): void {
    this.track(event, { cart });
  }

  public trackPurchase(order: CanonicalOrder): void {
    this.track("purchase_completed", { order });
  }

  public trackAgent(params: {
    event?: EventType;
    agent_provider?: string;
    agent_session_id?: string;
    agent_run_id?: string;
    agent_task_id?: string;
    intent?: string;
    product_id?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const eventName: EventType = params.event || "agent_action";
    const agent: AgentTelemetry = {
      provider: params.agent_provider,
      session_id: params.agent_session_id,
      run_id: params.agent_run_id,
      task_id: params.agent_task_id,
      intent: params.intent,
      metadata: params.metadata,
    };

    let product: CanonicalProduct | undefined;
    if (params.product_id) {
      product = {
        product_id: params.product_id,
        title: params.product_id,
      };
    }

    this.track(eventName, {
      actor_type: "agent",
      agent,
      product,
      metadata: params.metadata,
    });
  }

  public identify(userId: string, traits?: Record<string, unknown>): void {
    tryCatchGuard(() => {
      this.identity.identify(userId, traits);
      this.transport?.identify(userId, traits);
    }, undefined, this.config?.debug, "CartwrightTracker:identify");
  }

  public reset(): void {
    tryCatchGuard(() => {
      this.identity.reset();
      this.session.reset();
      this.transport?.reset();
    }, undefined, this.config?.debug, "CartwrightTracker:reset");
  }

  public consent(granted: boolean): void {
    this.consentManager.setConsent(granted);
    if (!granted && this.transport) {
      this.transport.setEnabled(false);
    } else if (granted && this.transport) {
      this.transport.setEnabled(true);
    }
  }

  private processEvent(event: CanonicalEvent): void {
    if (!this.consentManager.isAllowed()) return;

    // Enqueue with deduplication check
    const accepted = this.queue.enqueue(event);
    if (!accepted) return;

    if (this.transport) {
      this.transport.capture(event);
    }
  }

  private drainQueue(): void {
    if (!this.transport) return;
    const pending = this.queue.drain();
    for (const evt of pending) {
      this.transport.capture(evt);
    }
  }

  public getIdentity(): IdentityManager {
    return this.identity;
  }

  public getSession(): SessionManager {
    return this.session;
  }

  public getConfig(): SiteConfig | null {
    return this.config;
  }

  public getAdapter(): PlatformAdapter | null {
    return this.currentAdapter;
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.searchSubmitListener && typeof document !== "undefined") {
      document.removeEventListener("submit", this.searchSubmitListener, true);
    }
    this.domObserver.disconnect();
    this.currentAdapter?.destroy();
    this.spaNavigator.unhook();
  }
}
