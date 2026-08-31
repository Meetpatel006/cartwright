import { db } from "@cartwright/db";
import { merchantAccounts } from "@cartwright/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

export function generateOpaqueId(prefix: "mch" | "site"): string {
  const token = randomBytes(8).toString("hex");
  return `${prefix}_${token}`;
}

export interface MerchantAccountResult {
  merchantId: string;
  name: string | null;
  primarySiteId: string;
  siteIds: string[];
  createdAt: Date;
}

/**
 * Get or create permanent Merchant Account and Site IDs for a user.
 * - On first login: generates permanent merchant_id and site_id, saves them to PostgreSQL database.
 * - On subsequent logins: loads the existing saved merchant_id and site_ids from PostgreSQL database.
 */
export async function getOrCreateMerchantAccount(
  userId: string,
  userName?: string | null
): Promise<MerchantAccountResult> {
  // 1. Fetch existing saved merchant account from database
  const existing = await db
    .select()
    .from(merchantAccounts)
    .where(eq(merchantAccounts.userId, userId))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const acc = existing[0];
    const siteIds = acc.siteIds && acc.siteIds.length > 0 ? acc.siteIds : [acc.primarySiteId];
    return {
      merchantId: acc.id,
      name: acc.name,
      primarySiteId: acc.primarySiteId,
      siteIds,
      createdAt: acc.createdAt,
    };
  }

  // 2. Generate new permanent merchant_id and initial site_id
  const merchantId = generateOpaqueId("mch");
  const siteId = generateOpaqueId("site");
  const storeName = userName ? `${userName}'s Store` : "Merchant Store";

  try {
    const [created] = await db
      .insert(merchantAccounts)
      .values({
        id: merchantId,
        userId,
        name: storeName,
        primarySiteId: siteId,
        siteIds: [siteId],
      })
      .returning();

    if (created) {
      return {
        merchantId: created.id,
        name: created.name,
        primarySiteId: created.primarySiteId,
        siteIds: created.siteIds,
        createdAt: created.createdAt,
      };
    }
  } catch {
    // Handle concurrency/race condition if already inserted
    const retry = await db
      .select()
      .from(merchantAccounts)
      .where(eq(merchantAccounts.userId, userId))
      .limit(1);

    if (retry.length > 0 && retry[0]) {
      const acc = retry[0];
      return {
        merchantId: acc.id,
        name: acc.name,
        primarySiteId: acc.primarySiteId,
        siteIds: acc.siteIds && acc.siteIds.length > 0 ? acc.siteIds : [acc.primarySiteId],
        createdAt: acc.createdAt,
      };
    }
  }

  return {
    merchantId,
    name: storeName,
    primarySiteId: siteId,
    siteIds: [siteId],
    createdAt: new Date(),
  };
}

/**
 * Generate a new site_id for an existing merchant, save it into PostgreSQL, and return it.
 */
export async function createMerchantSite(userId: string): Promise<MerchantAccountResult> {
  const account = await getOrCreateMerchantAccount(userId);
  const newSiteId = generateOpaqueId("site");
  const updatedSiteIds = Array.from(new Set([...account.siteIds, newSiteId]));

  await db
    .update(merchantAccounts)
    .set({
      siteIds: updatedSiteIds,
      primarySiteId: account.primarySiteId || newSiteId,
    })
    .where(eq(merchantAccounts.userId, userId));

  return {
    ...account,
    siteIds: updatedSiteIds,
  };
}

/**
 * Set the active/primary site_id for the merchant.
 */
export async function setPrimarySite(userId: string, siteId: string): Promise<MerchantAccountResult> {
  const account = await getOrCreateMerchantAccount(userId);
  const siteIds = Array.from(new Set([...account.siteIds, siteId]));

  await db
    .update(merchantAccounts)
    .set({
      primarySiteId: siteId,
      siteIds,
    })
    .where(eq(merchantAccounts.userId, userId));

  return {
    ...account,
    primarySiteId: siteId,
    siteIds,
  };
}
