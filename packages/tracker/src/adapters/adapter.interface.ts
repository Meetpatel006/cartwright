/**
 * Platform Adapter Interface
 */

import type {
  CanonicalCart,
  CanonicalEvent,
  CanonicalOrder,
  CanonicalProduct,
  PlatformType,
} from "../events/canonical-types";

export interface AdapterContext {
  siteId: string;
  visitorId: string;
  sessionId: string;
  debug?: boolean;
}

export type EventEmitter = (event: CanonicalEvent) => void;

export interface PlatformAdapter {
  readonly name: PlatformType;
  detect(win?: Window, doc?: Document): boolean;
  init(emitter: EventEmitter, context: AdapterContext): void;
  extractProduct?(doc?: Document): CanonicalProduct | null;
  extractCart?(doc?: Document): CanonicalCart | null;
  extractOrder?(doc?: Document): CanonicalOrder | null;
  destroy(): void;
}
