/**
 * SPA History & Navigation Observer
 *
 * Safely monitors pushState, replaceState, and popstate without breaking
 * existing merchant application routing (Next.js, React Router, Vue, Remix).
 */

import { tryCatchGuard } from "../core/error-boundary";

export type NavigationCallback = (url: string, referrer: string) => void;

interface WindowWithHistoryProto extends Window {
  History?: {
    prototype?: {
      pushState?: typeof history.pushState;
      replaceState?: typeof history.replaceState;
    };
  };
}

export class SpaNavigator {
  private win?: WindowWithHistoryProto;
  private listeners: NavigationCallback[] = [];
  private lastUrl: string = "";
  private isHooked = false;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private boundPopStateHandler: (() => void) | null = null;

  constructor(targetWin?: Window) {
    this.win = (targetWin || (typeof window !== "undefined" ? window : undefined)) as WindowWithHistoryProto | undefined;
    if (this.win && this.win.location) {
      this.lastUrl = this.win.location.href;
    }
  }

  public onNavigate(cb: NavigationCallback): () => void {
    this.listeners.push(cb);
    if (!this.isHooked) {
      this.hookHistory();
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
      if (this.listeners.length === 0) {
        this.unhook();
      }
    };
  }

  public handleUrlChange(): void {
    tryCatchGuard(() => {
      const loc = this.win?.location || (typeof location !== "undefined" ? location : undefined);
      if (!loc) return;

      const currentUrl = loc.href;
      if (currentUrl !== this.lastUrl) {
        const referrer = this.lastUrl;
        this.lastUrl = currentUrl;
        this.listeners.forEach((cb) => {
          tryCatchGuard(() => cb(currentUrl, referrer), undefined);
        });
      }
    }, undefined);
  }

  private hookHistory(): void {
    const win = this.win || (typeof window !== "undefined" ? (window as WindowWithHistoryProto) : undefined);
    const hist = win?.history || (typeof history !== "undefined" ? history : undefined);

    if (this.isHooked || !hist || !win) return;

    this.originalPushState = hist.pushState.bind(hist);
    this.originalReplaceState = hist.replaceState.bind(hist);

    const self = this;

    const customPushState = function (this: History, ...args: Parameters<typeof history.pushState>) {
      const ret = self.originalPushState?.apply(this, args);
      self.handleUrlChange();
      return ret;
    };

    const customReplaceState = function (this: History, ...args: Parameters<typeof history.replaceState>) {
      const ret = self.originalReplaceState?.apply(this, args);
      self.handleUrlChange();
      return ret;
    };

    hist.pushState = customPushState;
    hist.replaceState = customReplaceState;

    if (win.History?.prototype) {
      win.History.prototype.pushState = customPushState;
      win.History.prototype.replaceState = customReplaceState;
    }

    this.boundPopStateHandler = () => {
      self.handleUrlChange();
    };

    win.addEventListener("popstate", this.boundPopStateHandler);
    this.isHooked = true;
  }

  public unhook(): void {
    const win = this.win || (typeof window !== "undefined" ? (window as WindowWithHistoryProto) : undefined);
    const hist = win?.history || (typeof history !== "undefined" ? history : undefined);

    if (!this.isHooked) return;
    if (this.originalPushState && hist) {
      hist.pushState = this.originalPushState;
      if (win?.History?.prototype) {
        win.History.prototype.pushState = this.originalPushState;
      }
    }
    if (this.originalReplaceState && hist) {
      hist.replaceState = this.originalReplaceState;
      if (win?.History?.prototype) {
        win.History.prototype.replaceState = this.originalReplaceState;
      }
    }
    if (this.boundPopStateHandler && win) {
      win.removeEventListener("popstate", this.boundPopStateHandler);
    }
    this.isHooked = false;
  }
}
