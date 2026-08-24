// Public surface of @cartwright/agent.
//
// Part A (discovery + browser automation + Razorpay) and Part B (commerce
// intelligence) both live here. The API package imports from this barrel.

export * from "./razorpay";
export * from "./shopping-agent";

// ── Part B: Agentic Shopping & Commerce Intelligence ────────────────────────
export * from "./errors";
// parseBudget / ParsedBudget are re-exported via ./shopping-agent.
export * from "./request/parse-shopping-request";
export * from "./normalization/product-normalizer";
export * from "./filtering/product-filter";
export * from "./ranking/product-ranker";
export * from "./commerce/types";
export * from "./commerce/recommendation";
export * from "./commerce/purchase-plan";
export * from "./discovery/discover-products";
export * from "./orchestration/shopping-orchestrator";
