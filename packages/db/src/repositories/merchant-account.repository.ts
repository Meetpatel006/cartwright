import { eq } from "drizzle-orm";

import { db } from "../index";
import {
  type MerchantAccountRow,
  type NewMerchantAccountRow,
  merchantAccounts,
} from "../schema/merchant-accounts";

export async function getMerchantAccountByUserId(
  userId: string,
): Promise<MerchantAccountRow | undefined> {
  const rows = await db
    .select()
    .from(merchantAccounts)
    .where(eq(merchantAccounts.userId, userId))
    .limit(1);
  return rows[0];
}

export async function insertMerchantAccount(
  row: NewMerchantAccountRow,
): Promise<MerchantAccountRow> {
  const [created] = await db.insert(merchantAccounts).values(row).returning();
  if (!created) {
    throw new Error("Failed to insert merchant account");
  }
  return created;
}

export async function updateMerchantAccount(
  userId: string,
  patch: Partial<NewMerchantAccountRow>,
): Promise<MerchantAccountRow | undefined> {
  const [updated] = await db
    .update(merchantAccounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(merchantAccounts.userId, userId))
    .returning();
  return updated;
}
