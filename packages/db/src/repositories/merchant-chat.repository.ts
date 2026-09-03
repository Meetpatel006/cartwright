import { eq, desc } from "drizzle-orm";

import { db } from "../index";
import {
  type MerchantChatRow,
  type NewMerchantChatRow,
  type MerchantChatMessageRow,
  type NewMerchantChatMessageRow,
  merchantChats,
  merchantChatMessages,
} from "../schema/merchant-chats";

// ── Chat CRUD ──────────────────────────────────────────────────────────

export async function insertChat(
  row: NewMerchantChatRow,
): Promise<MerchantChatRow> {
  const [created] = await db.insert(merchantChats).values(row).returning();
  if (!created) throw new Error("Failed to insert merchant chat");
  return created;
}

export async function getChatById(
  chatId: string,
): Promise<MerchantChatRow | undefined> {
  const rows = await db
    .select()
    .from(merchantChats)
    .where(eq(merchantChats.id, chatId))
    .limit(1);
  return rows[0];
}

export async function getChatForUser(
  chatId: string,
  userId: string,
): Promise<MerchantChatRow | undefined> {
  const rows = await db
    .select()
    .from(merchantChats)
    .where(eq(merchantChats.id, chatId))
    .limit(1);
  const chat = rows[0];
  if (chat && chat.userId !== userId) return undefined;
  return chat;
}

export async function listChatsForUser(
  userId: string,
): Promise<MerchantChatRow[]> {
  return db
    .select()
    .from(merchantChats)
    .where(eq(merchantChats.userId, userId))
    .orderBy(desc(merchantChats.updatedAt));
}

export async function updateChat(
  chatId: string,
  patch: Partial<Pick<NewMerchantChatRow, "title">>,
): Promise<MerchantChatRow | undefined> {
  const [updated] = await db
    .update(merchantChats)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(merchantChats.id, chatId))
    .returning();
  return updated;
}

// ── Message CRUD ───────────────────────────────────────────────────────

export async function insertMessage(
  row: NewMerchantChatMessageRow,
): Promise<MerchantChatMessageRow> {
  const [created] = await db
    .insert(merchantChatMessages)
    .values(row)
    .returning();
  if (!created) throw new Error("Failed to insert chat message");
  return created;
}

export async function listMessagesForChat(
  chatId: string,
): Promise<MerchantChatMessageRow[]> {
  return db
    .select()
    .from(merchantChatMessages)
    .where(eq(merchantChatMessages.chatId, chatId))
    .orderBy(merchantChatMessages.createdAt);
}

export async function getMessageCount(chatId: string): Promise<number> {
  const rows = await db
    .select({ count: merchantChatMessages.id })
    .from(merchantChatMessages)
    .where(eq(merchantChatMessages.chatId, chatId));
  return rows.length;
}
