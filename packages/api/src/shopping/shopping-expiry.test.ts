import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import { user as userTable } from "@cartwright/db/schema";
import {
  getBrowserSessionById,
  insertBrowserSession,
} from "@cartwright/db/repositories/browser-session.repository";
import {
  getShoppingSessionById,
  insertShoppingSession,
} from "@cartwright/db/repositories/shopping.repository";

import {
  cleanupExpiredShoppingSessions,
  getReachableShoppingSession,
  selectProductForSession,
} from "./shopping.service";
import { runAllCleanup } from "./cleanup-scheduler";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(
    sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`,
  );
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

async function insertExpiredShoppingSession(
  userId: string,
  status: "created" | "recommended" | "selected" | "converted",
): Promise<string> {
  const created = await insertShoppingSession({
    userId,
    rawQuery: "phone under 100",
    intent: { budget: 100 },
    status,
    expiresAt: pastDate(),
  });
  return created.id;
}

describe("shopping session expiry (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("a session past its TTL is expired by cleanup and becomes unreachable", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "recommended");

      const count = await cleanupExpiredShoppingSessions(new Date());
      expect(count).toBe(1);

      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("expired");

      // Expired sessions are unreachable through the read path.
      const reachable = await getReachableShoppingSession(sessionId, userId);
      expect(reachable).toBeUndefined();
    });
  });

  test("expiry triggers cleanup of the retained browser session", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "recommended");

      const closedCalls: string[] = [];
      const fakeClose = async (providerSessionId: string) => {
        closedCalls.push(providerSessionId);
      };

      const browser = await insertBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `local-${randomUUID()}`,
        shoppingSessionId: sessionId,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const count = await cleanupExpiredShoppingSessions(new Date(), {
        closeProvider: fakeClose,
      });
      expect(count).toBe(1);
      expect(closedCalls).toEqual([browser.providerSessionId]);

      const browserRow = await getBrowserSessionById(browser.id);
      expect(browserRow?.status).toBe("expired");
    });
  });

  test("cleanup is idempotent", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "created");

      const first = await cleanupExpiredShoppingSessions(new Date());
      expect(first).toBe(1);

      // A repeated sweep finds no further actionable sessions.
      const second = await cleanupExpiredShoppingSessions(new Date());
      expect(second).toBe(0);

      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("expired");
    });
  });

  test("converted (terminal) sessions are never expired by cleanup", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "converted");

      const count = await cleanupExpiredShoppingSessions(new Date());
      expect(count).toBe(0);

      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("converted");
    });
  });

  test("runAllCleanup expires both shopping and browser sessions", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "recommended");

      // A browser session expired purely by its own TTL (not tied to shopping).
      await insertBrowserSession({
        ownerUserId: userId,
        provider: "browserbase",
        providerSessionId: `bb-${randomUUID()}`,
        expiresAt: pastDate(),
      });

      const report = await runAllCleanup(new Date());
      expect(report.shoppingSessions).toBe(1);
      expect(report.browserSessions).toBe(1);

      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("expired");
    });
  });

  // ── TTL enforcement without the background sweep ──────────────────────────
  // The scheduler is wired at server start (instrumentation.ts), but expiry
  // must ALSO hold when only the read/select paths run (e.g. right after a
  // deploy, or if a sweep tick was missed).
  test("a stale session is lazily expired on READ before any sweeper runs", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "recommended");

      const reachable = await getReachableShoppingSession(sessionId, userId);
      expect(reachable).toBeUndefined();

      // The lazy path itself persisted the terminal transition.
      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("expired");
    });
  });

  test("a stale session cannot be SELECTED, and selection expires it", async () => {
    await withTestUser(async (userId) => {
      const sessionId = await insertExpiredShoppingSession(userId, "recommended");

      await expect(
        selectProductForSession({
          userId,
          sessionId,
          productId: "any-product",
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

      const row = await getShoppingSessionById(sessionId);
      expect(row?.status).toBe("expired");
    });
  });

  test("a live (non-stale) session remains readable and selectable", async () => {
    await withTestUser(async (userId) => {
      const created = await insertShoppingSession({
        userId,
        rawQuery: "phone under 100",
        intent: { budget: 100 },
        status: "recommended",
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const reachable = await getReachableShoppingSession(created.id, userId);
      expect(reachable?.id).toBe(created.id);
    });
  });
});
