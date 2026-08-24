import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { count, eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import {
  user as userTable,
  shoppingSessions,
} from "@cartwright/db/schema";
import {
  findSessionByIdempotency,
  insertShoppingSessionIdempotent,
} from "@cartwright/db/repositories/shopping.repository";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM audit_events WHERE user_id = ${userId}`);
  await db.delete(userTable).where(eq(userTable.id, userId));
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

describe("shopping session idempotency (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("same user + same idempotency key returns the same session", async () => {
    await withTestUser(async (userId) => {
      const first = await insertShoppingSessionIdempotent({
        userId,
        rawQuery: "phone under 100",
        intent: { budget: 100 },
        idempotencyKey: "same-key",
      });
      const second = await insertShoppingSessionIdempotent({
        userId,
        rawQuery: "phone under 100",
        intent: { budget: 100 },
        idempotencyKey: "same-key",
      });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.session.id).toBe(first.session.id);

      const existing = await findSessionByIdempotency(userId, "same-key");
      expect(existing?.id).toBe(first.session.id);
    });
  });

  test("concurrent inserts create only one session (DB-level constraint)", async () => {
    await withTestUser(async (userId) => {
      const [a, b] = await Promise.all([
        insertShoppingSessionIdempotent({
          userId,
          rawQuery: "phone under 100",
          intent: { budget: 100 },
          idempotencyKey: "concurrent-key",
        }),
        insertShoppingSessionIdempotent({
          userId,
          rawQuery: "phone under 100",
          intent: { budget: 100 },
          idempotencyKey: "concurrent-key",
        }),
      ]);

      // Exactly one session must win; the other must resolve to the same row.
      expect(a.session.id).toBe(b.session.id);

      const rows = await db
        .select({ value: count() })
        .from(shoppingSessions)
        .where(eq(shoppingSessions.idempotencyKey, "concurrent-key"));
      expect(rows[0]?.value).toBe(1);
    });
  });

  test("different users may reuse the same idempotency key", async () => {
    await withTestUser(async (userA) => {
      await withTestUser(async (userB) => {
        const a = await insertShoppingSessionIdempotent({
          userId: userA,
          rawQuery: "phone under 100",
          intent: { budget: 100 },
          idempotencyKey: "shared-key",
        });
        const b = await insertShoppingSessionIdempotent({
          userId: userB,
          rawQuery: "phone under 100",
          intent: { budget: 100 },
          idempotencyKey: "shared-key",
        });

        expect(a.created).toBe(true);
        expect(b.created).toBe(true);
        expect(a.session.id).not.toBe(b.session.id);
      });
    });
  });

  test("different idempotency keys create different sessions", async () => {
    await withTestUser(async (userId) => {
      const a = await insertShoppingSessionIdempotent({
        userId,
        rawQuery: "phone under 100",
        intent: { budget: 100 },
        idempotencyKey: "key-a",
      });
      const b = await insertShoppingSessionIdempotent({
        userId,
        rawQuery: "phone under 100",
        intent: { budget: 100 },
        idempotencyKey: "key-b",
      });

      expect(a.created).toBe(true);
      expect(b.created).toBe(true);
      expect(a.session.id).not.toBe(b.session.id);
    });
  });
});
