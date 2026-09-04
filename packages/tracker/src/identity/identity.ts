/**
 * Identity Manager
 *
 * Handles anonymous persistent visitor IDs, customer identify(), and reset().
 */

import { tryCatchGuard } from "../core/error-boundary";

const VISITOR_ID_STORAGE_KEY = "cw_visitor_id";
const USER_ID_STORAGE_KEY = "cw_user_id";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class IdentityManager {
  private visitorId: string = "";
  private identifiedUserId: string | null = null;
  private userTraits: Record<string, unknown> = {};

  constructor() {
    this.initVisitorId();
  }

  private initVisitorId(): void {
    this.visitorId = tryCatchGuard(() => {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
        if (stored) return stored;
      }
      const newId = `vis_${generateUUID()}`;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(VISITOR_ID_STORAGE_KEY, newId);
      }
      return newId;
    }, `vis_${generateUUID()}`);

    tryCatchGuard(() => {
      if (typeof localStorage !== "undefined") {
        this.identifiedUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
      }
    }, null);
  }

  public getVisitorId(): string {
    return this.visitorId;
  }

  public getIdentifiedUserId(): string | null {
    return this.identifiedUserId;
  }

  public getDistinctId(): string {
    return this.identifiedUserId || this.visitorId;
  }

  public getUserTraits(): Record<string, unknown> {
    return { ...this.userTraits };
  }

  public identify(userId: string, traits: Record<string, unknown> = {}): void {
    if (!userId || typeof userId !== "string") return;
    this.identifiedUserId = userId.trim();
    this.userTraits = { ...traits };

    tryCatchGuard(() => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(USER_ID_STORAGE_KEY, this.identifiedUserId!);
      }
    }, undefined);
  }

  public reset(): void {
    this.identifiedUserId = null;
    this.userTraits = {};
    tryCatchGuard(() => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(USER_ID_STORAGE_KEY);
      }
      // Re-roll anonymous visitor ID on reset
      this.visitorId = `vis_${generateUUID()}`;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(VISITOR_ID_STORAGE_KEY, this.visitorId);
      }
    }, undefined);
  }
}
