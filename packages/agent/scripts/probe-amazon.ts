/**
 * Diagnostic probe: launch Chrome through the SAME Stagehand path as
 * runShoppingAgent, navigate to an Amazon search, and dump what the page
 * actually contains (title / link count / body snippet). No LLM calls made.
 *
 *   bun scripts/probe-amazon.ts [url]
 */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
import { createOpenAICompatibleLLM } from "../src/custom-llm";

const url = process.argv[2] ?? "https://www.amazon.com/s?k=wireless+headphones";

const browser = await localBrowser.launch({
  headless: false,
  // Mask CDP/automation signals that trigger Amazon's "Sorry! Something went
  // wrong!" dogpage (curl with a plain Chrome UA gets full results from the
  // same IP, so the block is automation-signal-based, not IP-based).
  args: [
    "--disable-features=PasswordManager,PasswordManagerClient",
    "--disable-blink-features=AutomationControlled",
  ],
});
let stagehand: Stagehand | undefined;
try {
  stagehand = await Stagehand.create({
    browser,
    cache: false,
    model: createOpenAICompatibleLLM({
      baseURL: process.env.AGENT_LLM_BASE_URL!,
      model: process.env.AGENT_LLM_MODEL!,
      apiKey: process.env.AGENT_LLM_API_KEY,
    }),
  });
  const page = (await browser.context.pages())[0]!;
  // Warm-up experiment: establish session cookies on the homepage before
  // hitting /s — amazon.com search dogpages for cookieless India-geo sessions.
  const u = new URL(url);
  if (u.hostname.endsWith("amazon.com") && u.pathname.startsWith("/s")) {
    await page.goto("https://www.amazon.com/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await page.waitForTimeout(1_500);
    console.log("warmup title:", await page.evaluate(`document.title`).catch(() => "?"));
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", 20_000).catch(() => {});
  await page.waitForTimeout(2_000);

  console.log("final url :", await page.url());
  console.log("title     :", await page.evaluate(`document.title`).catch(() => "?"));
  console.log(
    "a[href]   :",
    await page.evaluate(`document.querySelectorAll('a[href]').length`).catch(() => -1),
  );
  console.log("ua        :", await page.evaluate(`navigator.userAgent`).catch(() => "?"));
  console.log(
    "webdriver :",
    await page.evaluate(`navigator.webdriver`).catch(() => "?"),
  );
  const body = await page
    .evaluate(`(document.body?.innerText || "").replace(/\\s+/g, " ").slice(0, 400)`)
    .catch(() => "?");
  console.log("body[0:400]:", body);
} finally {
  await stagehand?.close().catch(() => {});
  await browser.close().catch(() => {});
}
