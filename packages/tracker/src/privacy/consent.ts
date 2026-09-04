/**
 * Privacy Consent & Do-Not-Track (DNT) Handling
 */

export type ConsentStatus = "granted" | "denied" | "unspecified";

export interface ConsentState {
  status: ConsentStatus;
  updatedAt: number;
}

const CONSENT_STORAGE_KEY = "cw_consent_status";

export class ConsentManager {
  private memoryConsent: ConsentStatus = "unspecified";

  constructor(private respectDnt: boolean = true) {}

  public isDntEnabled(): boolean {
    if (!this.respectDnt) return false;
    if (typeof navigator === "undefined") return false;

    // Check navigator.doNotTrack or Global Privacy Control (GPC)
    const dnt = navigator.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack;
    if (dnt === "1" || dnt === "yes") return true;

    if (
      (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    ) {
      return true;
    }

    return false;
  }

  public getConsent(): ConsentStatus {
    if (this.isDntEnabled()) {
      return "denied";
    }

    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
        if (stored === "granted" || stored === "denied") {
          return stored;
        }
      } catch {
        // LocalStorage disabled/blocked
      }
    }

    return this.memoryConsent;
  }

  public setConsent(granted: boolean): void {
    const status: ConsentStatus = granted ? "granted" : "denied";
    this.memoryConsent = status;

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(CONSENT_STORAGE_KEY, status);
      } catch {
        // LocalStorage disabled
      }
    }
  }

  public isAllowed(): boolean {
    const consent = this.getConsent();
    if (consent === "denied") return false;
    // Default: allow unless explicitly denied or DNT is active
    return true;
  }
}
