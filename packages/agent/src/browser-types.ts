/**
 * Shared Stagehand browser/page type aliases.
 *
 * These were previously defined inside `shopping-agent.ts`, but the local-merchant
 * engine (`src/local-merchant.ts`) needs the same types without importing the
 * shopping agent (which would create a runtime import cycle). Type-only imports
 * are erased at build time, so both modules can safely depend on this one.
 */
import { localBrowser } from "@browserbasehq/stagehand";

export type AgentBrowser = Awaited<ReturnType<typeof localBrowser.launch>>;
export type AgentBrowserContext = AgentBrowser["context"];
export type AgentPage = Exclude<
  Awaited<ReturnType<AgentBrowserContext["pages"]>>[number],
  undefined
>;
