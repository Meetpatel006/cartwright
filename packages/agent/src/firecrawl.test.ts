import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  buildProductSearchQuery,
  FirecrawlClient,
  isSameOriginOrRelative,
  isSameStoreHost,
  normalizeHost,
  resolveAbsoluteUrl,
  resolveProductUrls,
  selectStoreUrl,
  storeDomainFromUrl,
  type FirecrawlResult,
  type SearchFn,
} from "./firecrawl";

describe("host helpers", () => {
  test("normalizeHost strips www and lowercases", () => {
    expect(normalizeHost("WWW.Nike.com")).toBe("nike.com");
  });

  test("storeDomainFromUrl extracts the host", () => {
    expect(storeDomainFromUrl("https://www.nike.com/in/w?q=x")).toBe("www.nike.com");
  });

  test("isSameStoreHost matches exact and subdomains, rejects look-alikes", () => {
    expect(isSameStoreHost("https://www.nike.com/in/t/x", "nike.com")).toBe(true);
    expect(isSameStoreHost("https://store.nike.com/x", "nike.com")).toBe(true);
    expect(isSameStoreHost("https://www.nike.in/x", "nike.com")).toBe(false);
    expect(isSameStoreHost("https://evilenike.com/x", "nike.com")).toBe(false);
    expect(isSameStoreHost("https://nike.com.co/x", "nike.com")).toBe(false);
  });
});

describe("selectStoreUrl", () => {
  const results: FirecrawlResult[] = [
    { url: "https://example.com/ads", title: "ad" },
    { url: "https://www.nike.com/in/t/miler", title: "Miler" },
    { url: "https://nike.com/in/t/air", title: "Air" },
  ];

  test("picks the first store-domain result, skipping off-domain ones", () => {
    expect(selectStoreUrl(results, "nike.com")).toBe("https://www.nike.com/in/t/miler");
  });

  test("returns undefined when nothing matches the store", () => {
    expect(selectStoreUrl(results, "adidas.com")).toBeUndefined();
  });
});

describe("buildProductSearchQuery", () => {
  test("biases the query to the store with site:", () => {
    expect(buildProductSearchQuery("Nike Miler Shorts", "www.nike.com")).toBe(
      "Nike Miler Shorts site:www.nike.com",
    );
  });
});

describe("resolveProductUrls", () => {
  test("resolves each product, tolerating individual failures", async () => {
    const fakeSearch: SearchFn = async (q) => {
      if (q.includes("Miler")) return [{ url: "https://www.nike.com/in/t/miler-1" }];
      if (q.includes("Boom")) throw new Error("boom");
      return [{ url: "https://www.nike.com/in/t/other" }];
    };
    const products = [
      { name: "Nike Miler Shorts" },
      { name: "Nike Air Force 1" },
      { name: "Nike Boom Thing" },
    ];
    const map = await resolveProductUrls(products, "www.nike.com", fakeSearch, { concurrency: 2 });
    expect(map.get("Nike Miler Shorts")).toBe("https://www.nike.com/in/t/miler-1");
    expect(map.get("Nike Air Force 1")).toBe("https://www.nike.com/in/t/other");
    expect(map.has("Nike Boom Thing")).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe("FirecrawlClient.search", () => {
  const originalFetch = globalThis.fetch;
  let lastUrl: string | undefined;
  let lastBody: any;
  let lastAuth: string | undefined;

  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    globalThis.fetch = (async (url: string | URL | Request, init?: any) => {
      lastUrl = String(url);
      lastBody = init?.body ? JSON.parse(init.body) : undefined;
      lastAuth = init?.headers?.Authorization;
      return new Response(
        JSON.stringify({ data: [{ url: "https://www.nike.com/in/t/miler", title: "Miler" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.FIRECRAWL_API_KEY;
  });

  test("posts to /search with auth + query and parses results", async () => {
    const client = new FirecrawlClient({ baseUrl: "https://api.firecrawl.dev/v1" });
    const results = await client.search("Nike Miler");
    expect(lastUrl).toBe("https://api.firecrawl.dev/v1/search");
    expect(lastAuth).toBe("Bearer test-key");
    expect(lastBody.query).toBe("Nike Miler");
    expect(lastBody.limit).toBe(5);
    expect(results[0]?.url).toBe("https://www.nike.com/in/t/miler");
  });

  test("throws a clear error when no API key is configured", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const client = new FirecrawlClient();
    await expect(client.search("x")).rejects.toThrow(/FIRECRAWL_API_KEY/);
  });

  test("throws on a non-OK response", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const client = new FirecrawlClient();
    await expect(client.search("x")).rejects.toThrow(/Firecrawl search failed/);
  });
});

describe("isSameOriginOrRelative", () => {
  const SEARCH_PAGE = "https://www.nike.com/in/w?q=running%20shoes";

  test("accepts a same-origin absolute URL", () => {
    expect(
      isSameOriginOrRelative("https://www.nike.com/in/t/miler-shorts/abc-123", SEARCH_PAGE),
    ).toBe(true);
  });

  test("rejects an off-origin hallucinated domain (the 404 bug)", () => {
    expect(isSameOriginOrRelative("https://www.nike.in/5-3920", SEARCH_PAGE)).toBe(false);
  });

  test("rejects a different subdomain", () => {
    expect(isSameOriginOrRelative("https://nike.com/in/t/x", SEARCH_PAGE)).toBe(false);
  });

  test("accepts relative / path references", () => {
    expect(isSameOriginOrRelative("/in/t/miler-shorts/abc-123", SEARCH_PAGE)).toBe(true);
    expect(isSameOriginOrRelative("./miler-shorts", SEARCH_PAGE)).toBe(true);
  });

  test("treats non-scheme strings as relative (caller pre-filters placeholders)", () => {
    // The discovery loop strips placeholder URLs ("None", "N/A") before calling
    // this; anything without a scheme is assumed to resolve against the base.
    expect(isSameOriginOrRelative("not a url", SEARCH_PAGE)).toBe(true);
  });
});

describe("resolveAbsoluteUrl", () => {
  const SEARCH_PAGE = "https://www.nike.com/in/w?q=running%20shoes";

  test("resolves a relative path against the base origin", () => {
    expect(resolveAbsoluteUrl("/in/t/miler-123", SEARCH_PAGE)).toBe(
      "https://www.nike.com/in/t/miler-123",
    );
  });

  test("passes an absolute URL through unchanged", () => {
    expect(resolveAbsoluteUrl("https://www.nike.com/in/t/miler-123", SEARCH_PAGE)).toBe(
      "https://www.nike.com/in/t/miler-123",
    );
  });

  test("treats a placeholder as missing and returns the base", () => {
    expect(resolveAbsoluteUrl("None", SEARCH_PAGE)).toBe(SEARCH_PAGE);
    expect(resolveAbsoluteUrl("N/A", SEARCH_PAGE)).toBe(SEARCH_PAGE);
  });
});
