/**
 * Search Query Detector
 *
 * Extracts storefront search terms from URL query strings or dedicated search input elements.
 * Explicitly guards against capturing arbitrary textareas or general text inputs.
 */

import { tryCatchGuard } from "../core/error-boundary";

const SEARCH_QUERY_PARAMS = ["q", "query", "s", "search", "keyword", "search_query", "term"];

export function extractSearchQuery(targetDoc?: Document, targetLoc?: Location): string | null {
  const loc = targetLoc || (typeof location !== "undefined" ? location : undefined);
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);

  return tryCatchGuard(() => {
    // 1. Check URL parameters
    if (loc?.search) {
      const params = new URLSearchParams(loc.search);
      for (const param of SEARCH_QUERY_PARAMS) {
        const val = params.get(param);
        if (val && val.trim().length > 1) {
          return val.trim();
        }
      }
    }

    // 2. Check dedicated search input elements
    if (doc) {
      const searchInput = doc.querySelector<HTMLInputElement>(
        'input[type="search"], input[name="q"], input[name="s"], input[name="search"], input[name="keyword"], input[role="searchbox"]',
      );
      if (searchInput && searchInput.value && searchInput.value.trim().length > 1) {
        return searchInput.value.trim();
      }
    }

    return null;
  }, null);
}

/**
 * Checks if a submitted form is a search form and extracts the query safely.
 */
export function extractSearchFromFormSubmit(form: HTMLFormElement): string | null {
  return tryCatchGuard(() => {
    const isSearchForm =
      form.getAttribute("role") === "search" ||
      form.action?.toLowerCase().includes("/search") ||
      form.classList.contains("search-form") ||
      form.id.includes("search");

    if (!isSearchForm) return null;

    const input = form.querySelector<HTMLInputElement>(
      'input[type="search"], input[name="q"], input[name="s"], input[name="search"], input[name="keyword"], input[type="text"]',
    );

    if (input && input.value && input.value.trim().length > 1) {
      return input.value.trim();
    }

    return null;
  }, null);
}
