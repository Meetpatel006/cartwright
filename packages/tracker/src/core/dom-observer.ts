/**
 * Safe Debounced DOM Mutation Observer
 *
 * Observes dynamic SPA component mounting (React, Next.js, Vue) to detect
 * product views or cart updates without continuously scanning the entire DOM.
 */

import { tryCatchGuard } from "./error-boundary";

export type DomChangeCallback = () => void;

export class ScopedDomObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  public observe(targetDoc: Document | undefined, onChange: DomChangeCallback): void {
    const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
    if (!doc || !doc.body || typeof MutationObserver === "undefined") return;

    this.observer = new MutationObserver((mutations) => {
      tryCatchGuard(() => {
        // Quick relevance filter: check if any added nodes might be commerce relevant
        let hasRelevantChange = false;

        for (const m of mutations) {
          if (m.type === "childList" && m.addedNodes.length > 0) {
            for (let i = 0; i < m.addedNodes.length; i++) {
              const node = m.addedNodes[i];
              if (node && node.nodeType === 1) {
                const el = node as HTMLElement;
                if (
                  el.hasAttribute?.("data-cartwright-product-id") ||
                  el.hasAttribute?.("data-cartwright-event") ||
                  el.querySelector?.("[data-cartwright-product-id], [itemscope], h1, .product, .cart, .price")
                ) {
                  hasRelevantChange = true;
                  break;
                }
              }
            }
          }
          if (hasRelevantChange) break;
        }

        if (hasRelevantChange) {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            tryCatchGuard(onChange, undefined);
          }, this.debounceMs);
        }
      }, undefined);
    });

    this.observer.observe(doc.body, {
      childList: true,
      subtree: true,
    });
  }

  public disconnect(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
