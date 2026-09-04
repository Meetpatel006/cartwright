import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import { user as userTable } from "@cartwright/db/schema";
import {
  getBrowserSessionById,
} from "@cartwright/db/repositories/browser-session.repository";
import { insertShoppingSession } from "@cartwright/db/repositories/shopping.repository";

import {
  BrowserSessionError,
  cleanupExpiredBrowserSessions,
  closeBrowserSessionsForShoppingSession,
  closeBrowserSession,
  createBrowserSession,
  expireBrowserSession,
  getOwnedBrowserSession,
} from "./browser-session.service";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM audit_events WHERE user_id = ${userId}`);
  await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
}

async function withTestUser<T>(fn: (userId: string) => Promise<T>): Promise<T> {
  const userId = randomUUID();
  await db.insert(userTable).values({
    id: userId,
    name: "Test User",
    email: `test-${userId}@cartwright.test`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  try {
    return await fn(userId);
  } finally {
    await cleanupUser(userId);
  }
}

function pastDate(ms = 1000): Date {
  return new Date(Date.now() - ms);
}

describe("browser session service (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("create persists an owned, active session", async () => {
    await withTestUser(async (userId) => {
      const created = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      expect(created.ownerUserId).toBe(userId);
      expect(created.status).toBe("active");
      expect(created.provider).toBe("local");
    });
  });

  test("ownership is enforced — another user cannot access the session", async () => {
    await withTestUser(async (userA) => {
      await withTestUser(async (userB) => {
        const created = await createBrowserSession({
          ownerUserId: userA,
          provider: "local",
          providerSessionId: `local-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        });
        await expect(getOwnedBrowserSession(created.id, userB)).rejects.toThrow(
          BrowserSessionError,
        );
        // The owner can still resolve it.
        const owned = await getOwnedBrowserSession(created.id, userA);
        expect(owned.id).toBe(created.id);
      });
    });
  });

  test("expired sessions are rejected", async () => {
    await withTestUser(async (userId) => {
      const created = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      await expireBrowserSession(created.id);
      await expect(getOwnedBrowserSession(created.id, userId)).rejects.toThrow(
        /expired/i,
      );
    });
  });

  test("cleanup disposes exactly once and is idempotent", async () => {
    await withTestUser(async (userId) => {
      const closedCalls: string[] = [];
      const fakeClose = async (id: string) => {
        closedCalls.push(id);
      };
      const created = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        expiresAt: pastDate(),
      });

      const first = await cleanupExpiredBrowserSessions(new Date(), {
        closeProvider: fakeClose,
      });
      expect(first).toBe(1);
      expect(closedCalls).toEqual([created.providerSessionId]);

      // Repeated sweeps must not re-close or error.
      const second = await cleanupExpiredBrowserSessions(new Date(), {
        closeProvider: fakeClose,
      });
      expect(second).toBe(0);
      expect(closedCalls).toEqual([created.providerSessionId]);

      const row = await getBrowserSessionById(created.id);
      expect(row?.status).toBe("expired");
    });
  });

  test("a missing live provider session is handled gracefully during cleanup", async () => {
    await withTestUser(async (userId) => {
      const created = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        expiresAt: pastDate(),
      });
      // The live browser is already gone (no process holds it) — cleanup must
      // still expire the row without throwing.
      const throwingClose = async (): Promise<void> => {
        throw new Error("browser instance already disposed");
      };
      const count = await cleanupExpiredBrowserSessions(new Date(), {
        closeProvider: throwingClose,
      });
      expect(count).toBe(1);
      const row = await getBrowserSessionById(created.id);
      expect(row?.status).toBe("expired");
    });
  });

  test("cleanup does not depend on the in-memory live registry (restart simulation)", async () => {
    await withTestUser(async (userId) => {
      const created = await createBrowserSession({
        ownerUserId: userId,
        provider: "browserbase",
        providerSessionId: `bb-${randomUUID()}`,
        expiresAt: pastDate(),
      });
      // No live session was ever registered for this provider handle. Using the
      // default (real) close adapter must still expire the row via the DB.
      const count = await cleanupExpiredBrowserSessions(new Date());
      expect(count).toBe(1);
      const row = await getBrowserSessionById(created.id);
      expect(row?.status).toBe("expired");
    });
  });

  test("closeBrowserSession is idempotent and enforces ownership", async () => {
    await withTestUser(async (userA) => {
      await withTestUser(async (userB) => {
        const created = await createBrowserSession({
          ownerUserId: userA,
          provider: "local",
          providerSessionId: `local-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        });
        const noopClose = async (): Promise<void> => {};

        const closed = await closeBrowserSession(created.id, userA, {
          closeProvider: noopClose,
        });
        expect(closed?.status).toBe("closed");

        // Second close is a safe no-op (already closed).
        const again = await closeBrowserSession(created.id, userA, {
          closeProvider: noopClose,
        });
        expect(again?.status).toBe("closed");

        // A foreign user cannot close it.
        await expect(
          closeBrowserSession(created.id, userB, { closeProvider: noopClose }),
        ).rejects.toThrow(BrowserSessionError);
      });
    });
  });

  test("closes every retained session after provider-independent selection", async () => {
    await withTestUser(async (userId) => {
      const shoppingSessionId = randomUUID();
      await insertShoppingSession({
        id: shoppingSessionId,
        userId,
        rawQuery: "test product",
        intent: {},
        status: "recommended",
      });
      const first = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        shoppingSessionId,
      });
      const second = await createBrowserSession({
        ownerUserId: userId,
        provider: "browserbase",
        providerSessionId: `bb-${randomUUID()}`,
        shoppingSessionId,
      });
      const closedProviderIds: string[] = [];

      const closed = await closeBrowserSessionsForShoppingSession(
        shoppingSessionId,
        userId,
        { closeProvider: async (providerSessionId) => { closedProviderIds.push(providerSessionId); } },
      );

      expect(closed).toBe(2);
      expect(closedProviderIds).toEqual([first.providerSessionId, second.providerSessionId]);
      expect((await getBrowserSessionById(first.id))?.status).toBe("closed");
      expect((await getBrowserSessionById(second.id))?.status).toBe("closed");
    });
  });
});
