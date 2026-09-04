/**
 * Session Manager
 *
 * Tracks browsing session lifecycle with 30-minute inactivity timeout,
 * session IDs, pageview counts, and start timestamps.
 */

import { tryCatchGuard } from "../core/error-boundary";

const SESSION_STORAGE_KEY = "cw_session_data";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface SessionData {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
  pageCount: number;
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `ses_${crypto.randomUUID()}`;
  }
  return `ses_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class SessionManager {
  private currentSession: SessionData;

  constructor() {
    this.currentSession = this.loadOrInitSession();
  }

  private loadOrInitSession(): SessionData {
    return tryCatchGuard(() => {
      const now = Date.now();
      if (typeof sessionStorage !== "undefined") {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SessionData;
          if (now - parsed.lastActivityAt < SESSION_TIMEOUT_MS) {
            parsed.lastActivityAt = now;
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
            return parsed;
          }
        }
      }

      const newSession: SessionData = {
        sessionId: generateSessionId(),
        createdAt: now,
        lastActivityAt: now,
        pageCount: 0,
      };

      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      }

      return newSession;
    }, {
      sessionId: generateSessionId(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      pageCount: 0,
    });
  }

  public getSessionId(): string {
    this.touch();
    return this.currentSession.sessionId;
  }

  public getSessionData(): Readonly<SessionData> {
    return { ...this.currentSession };
  }

  public recordPageNavigation(): void {
    this.currentSession.pageCount += 1;
    this.touch();
  }

  public touch(): void {
    const now = Date.now();
    if (now - this.currentSession.lastActivityAt >= SESSION_TIMEOUT_MS) {
      // Rotate session
      this.currentSession = {
        sessionId: generateSessionId(),
        createdAt: now,
        lastActivityAt: now,
        pageCount: 1,
      };
    } else {
      this.currentSession.lastActivityAt = now;
    }

    tryCatchGuard(() => {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.currentSession));
      }
    }, undefined);
  }

  public reset(): void {
    const now = Date.now();
    this.currentSession = {
      sessionId: generateSessionId(),
      createdAt: now,
      lastActivityAt: now,
      pageCount: 0,
    };
    tryCatchGuard(() => {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }, undefined);
  }
}
