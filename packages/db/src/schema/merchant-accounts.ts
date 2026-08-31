import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const merchantAccounts = pgTable(
  "merchant_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    primarySiteId: text("primary_site_id").notNull(),
    siteIds: text("site_ids").array().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("merchant_accounts_user_id_idx").on(table.userId)],
);

export const merchantAccountsRelations = relations(merchantAccounts, ({ one }) => ({
  user: one(user, {
    fields: [merchantAccounts.userId],
    references: [user.id],
  }),
}));
