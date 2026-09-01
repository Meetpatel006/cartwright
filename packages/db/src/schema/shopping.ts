import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Lifecycle of a Part B shopping session:
 *  - created      → intent parsed, discovery/ranking not yet persisted
 *  - recommended  → candidates ranked + recommendations generated + persisted
 *  - selected     → user explicitly chose a product (PurchasePlan stored)
 *  - converted    → the selected plan was handed to Part A's transaction gate
 *  - expired      → session lived past its validity window
 *
 * The session never creates a payment; `converted` only records that a Part A
 * transaction was opened for it (tracked by `transactionId`).
 */
export const shoppingSessionStatus = pgEnum("shopping_session_status", [
  "created",
  "processing",
  "recommended",
  "selected",
  "converted",
  "expired",
]);

export const shoppingSessions = pgTable("shopping_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  rawQuery: text("raw_query").notNull(),
  /** Parsed `ShoppingIntent` (budget, currency, constraints, merchant prefs). */
  intent: jsonb("intent").$type<Record<string, unknown>>().notNull(),
  status: shoppingSessionStatus("status").notNull().default("created"),
  /** The structured PurchasePlan once the user selects a product. */
  selectedPlan: jsonb("selected_plan").$type<Record<string, unknown>>(),
  /** Part A transaction id created from the selected plan (set on convert). */
  transactionId: text("transaction_id"),
  /** Retained browser-automation checkout session id from discovery (optional). */
  checkoutSessionId: text("checkout_session_id"),
  /** Client idempotency key; reused to dedupe repeated shopping requests. */
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** When a session is no longer actionable for selection. */
  expiresAt: timestamp("expires_at"),
}, (table) => [
  // Idempotency: a client-supplied key is unique per user. `idempotency_key`
  // is nullable, and Postgres treats NULLs as distinct, so key-less sessions
  // never collide while a present key enforces one session per (user, key).
  uniqueIndex("shopping_sessions_user_id_idempotency_key_idx").on(
    table.userId,
    table.idempotencyKey,
  ),
]);

/**
 * One row per normalized product considered in a session. Captures the
 * ranking outcome and whether the product was filtered out or rejected during
 * normalization, so the recommendation UI can show exactly why.
 */
export const productCandidates = pgTable(
  "product_candidates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id")
      .notNull()
      .references(() => shoppingSessions.id, { onDelete: "cascade" }),
    /** Stable normalized product id (merchant + title + url hash). */
    productId: text("product_id").notNull(),
    merchant: text("merchant"),
    title: text("title").notNull(),
    amountInMinor: integer("amount_in_minor").notNull(),
    currency: text("currency").notNull(),
    productUrl: text("product_url"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    availability: text("availability"),
    /** 0..1 data-confidence assigned during normalization. */
    confidence: real("confidence").notNull().default(1),
    source: text("source"),
    rankingScore: integer("ranking_score"),
    rankingFactors: jsonb("ranking_factors").$type<unknown>(),
    /** True if dropped by pre-ranking filter (with `reason`). */
    filteredOut: boolean("filtered_out").notNull().default(false),
    /** True if it failed normalization (with `reason`). */
    rejected: boolean("rejected").notNull().default(false),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

/**
 * The recommendation view: ranking score, the actual ranking factors, and the
 * human-facing explanation lines (each derived from real ranking data).
 */
export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => shoppingSessions.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  rankingScore: integer("ranking_score").notNull(),
  rankingFactors: jsonb("ranking_factors").$type<unknown>().notNull(),
  explanation: jsonb("explanation").$type<string[]>().notNull(),
  isTop: boolean("is_top").notNull().default(false),
  selected: boolean("selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShoppingSessionRow = typeof shoppingSessions.$inferSelect;
export type NewShoppingSessionRow = typeof shoppingSessions.$inferInsert;
export type ProductCandidateRow = typeof productCandidates.$inferSelect;
export type NewProductCandidateRow = typeof productCandidates.$inferInsert;
export type RecommendationRow = typeof recommendations.$inferSelect;
export type NewRecommendationRow = typeof recommendations.$inferInsert;
