// Public surface of @cartwright/agent.
//
// Part A (discovery + browser automation + Razorpay) and Part B (commerce
// intelligence) both live here. The API package imports from this barrel.

// Built-in local-merchant profiles — imported for their side effect of
// registering into src/local-merchant.ts's registry. Add new merchants here
// (or register custom ones from your own code via `registerLocalMerchant`).
import "./merchants/raven-scents";

export * from "./razorpay";
export * from "./shopping-agent";
export * from "./live-feed";

// ── Part B: Agentic Shopping & Commerce Intelligence ────────────────────────
export * from "./errors";
// parseBudget / ParsedBudget are re-exported via ./shopping-agent.
export * from "./request/parse-shopping-request";
export * from "./request/llm-shopping-parser";
export * from "./normalization/product-normalizer";
export * from "./filtering/product-filter";
export * from "./ranking/product-ranker";
export * from "./commerce/types";
export * from "./commerce/recommendation";
export * from "./commerce/purchase-plan";
export * from "./discovery/discover-products";
export * from "./discovery/search-filters";
export * from "./orchestration/shopping-orchestrator";
