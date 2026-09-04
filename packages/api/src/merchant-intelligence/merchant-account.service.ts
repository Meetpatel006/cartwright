import {
  getMerchantAccountByUserId,
  insertMerchantAccount,
  updateMerchantAccount,
} from "@cartwright/db/repositories/merchant-account.repository";
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
  const existing = await getMerchantAccountByUserId(userId);

  if (existing) {
    const siteIds = existing.siteIds && existing.siteIds.length > 0 ? existing.siteIds : [existing.primarySiteId];
    return {
      merchantId: existing.id,
      name: existing.name,
      primarySiteId: existing.primarySiteId,
      siteIds,
      createdAt: existing.createdAt,
    };
  }

  // 2. Generate new permanent merchant_id and initial site_id
  const merchantId = generateOpaqueId("mch");
  const siteId = generateOpaqueId("site");
  const storeName = userName ? `${userName}'s Store` : "Merchant Store";

  try {
    const created = await insertMerchantAccount({
      id: merchantId,
      userId,
      name: storeName,
      primarySiteId: siteId,
      siteIds: [siteId],
    });

    return {
      merchantId: created.id,
      name: created.name,
      primarySiteId: created.primarySiteId,
      siteIds: created.siteIds,
      createdAt: created.createdAt,
    };
  } catch {
    // Handle concurrency/race condition if already inserted
    const retry = await getMerchantAccountByUserId(userId);

    if (retry) {
      return {
        merchantId: retry.id,
        name: retry.name,
        primarySiteId: retry.primarySiteId,
        siteIds: retry.siteIds && retry.siteIds.length > 0 ? retry.siteIds : [retry.primarySiteId],
        createdAt: retry.createdAt,
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

  await updateMerchantAccount(userId, {
    siteIds: updatedSiteIds,
    primarySiteId: account.primarySiteId || newSiteId,
  });

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

  await updateMerchantAccount(userId, {
    primarySiteId: siteId,
    siteIds,
  });

  return {
    ...account,
    primarySiteId: siteId,
    siteIds,
  };
}
