import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const merchantChats = pgTable(
  "merchant_chats",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Chat"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("merchant_chats_user_id_idx").on(table.userId)],
);

export const merchantChatsRelations = relations(merchantChats, ({ one, many }) => ({
  user: one(user, {
    fields: [merchantChats.userId],
    references: [user.id],
  }),
  messages: many(merchantChatMessages),
}));

export type MerchantChatRow = typeof merchantChats.$inferSelect;
export type NewMerchantChatRow = typeof merchantChats.$inferInsert;

export const merchantChatMessages = pgTable(
  "merchant_chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => merchantChats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("merchant_chat_messages_chat_id_idx").on(table.chatId),
  ],
);

export const merchantChatMessagesRelations = relations(merchantChatMessages, ({ one }) => ({
  chat: one(merchantChats, {
    fields: [merchantChatMessages.chatId],
    references: [merchantChats.id],
  }),
}));

export type MerchantChatMessageRow = typeof merchantChatMessages.$inferSelect;
export type NewMerchantChatMessageRow = typeof merchantChatMessages.$inferInsert;
