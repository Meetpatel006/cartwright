/**
 * Standalone demo to verify session recording on a NORMAL website.
 *
 * It uses the SAME mechanism as the change in src/shopping-agent.ts:
 *   1. launch Stagehand's local Chrome,
 *   2. attach a Playwright client to that SAME browser over CDP,
 *   3. record the tab with Playwright's native page.screencast(),
 *   4. drive Google -> YouTube -> "minecraft song" -> play,
 *   5. stop the screencast (finalizing the .webm) and transcode it to .mp4
 *      BEFORE closing Stagehand.
 *
 * Usage:
 *   bun scripts/record-web-demo.ts
 *   bun scripts/record-web-demo.ts   # always records
 *
 * Output: packages/agent/recordings/session-YYYY-MM-DD_HH-mm-ss.mp4
 */
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdir, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import * as path from "node:path";

function getStagehandCdpUrl(stagehand: Stagehand): string | undefined {
  const h = stagehand as unknown as {
    rpcClient?: { cdp?: { webSocketDebuggerUrl?: string } };
  };
  return h.rpcClient?.cdp?.webSocketDebuggerUrl;
}

function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`
  );
}

/**
 * Playwright's screencast only writes WebM, so transcode to a real MP4 with the
 * bundled ffmpeg-static binary. Returns the .mp4 path, or null on failure
 * (original .webm is kept).
 */
async function transcodeWebmToMp4(webmPath: string): Promise<string | null> {
  const ffmpeg = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
  if (!ffmpeg) {
    console.warn("[demo] ffmpeg-static not available; keeping .webm.");
    return null;
  }
  const mp4Path = webmPath.replace(/\.webm$/i, ".mp4");
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpeg, [
        "-y", "-i", webmPath,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-crf", "23", "-preset", "veryfast", "-an",
        "-movflags", "+faststart", mp4Path,
      ]);
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    await unlink(webmPath).catch(() => {});
    return mp4Path;
  } catch (e) {
    console.warn(`[demo] MP4 transcode failed (${(e as Error).message}); keeping .webm.`);
    return null;
  }
}

/**
 * Injected into the recorded page so the screencast shows where the agent
 * clicked. CDP-driven automation has no OS cursor, so we render our own DOM
 * cursor that follows real mouse/pointer moves plus a red ripple on each press.
 */
const SESSION_CURSOR_OVERLAY = `
(function () {
  var C = '__agent_cursor';
  var lastDown = 0;
  var pos = { x: -300, y: -300 };
  function ensure() {
    var cur = document.getElementById(C);
    if (cur && cur.parentNode) return;
    cur = document.createElement('div');
    cur.id = C;
    cur.setAttribute('style',
      'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;' +
      'pointer-events:none;will-change:transform;' +
      'transform:translate(' + pos.x + 'px,' + pos.y + 'px);' +
      'transition:transform 50ms linear;');
    // Build the cursor with createElementNS (not innerHTML) — YouTube enforces
    // Trusted Types, which blocks string innerHTML assignment.
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('viewBox', '0 0 24 24');
    var sp = document.createElementNS(NS, 'path');
    sp.setAttribute('d', 'M4 2 L4 21 L9 16 L12 23 L15 22 L12 15 L19 15 Z');
    sp.setAttribute('fill', '#111');
    sp.setAttribute('stroke', '#fff');
    sp.setAttribute('stroke-width', '1.5');
    sp.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(sp);
    cur.appendChild(svg);
    (document.documentElement || document.body).appendChild(cur);
    window.__agentCursor = cur;
  }
  function move(x, y) {
    pos.x = x; pos.y = y;
    ensure();
    var cur = window.__agentCursor;
    if (cur) cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function ripple(x, y) {
    var now = Date.now();
    if (now - lastDown < 80) return;
    lastDown = now;
    ensure();
    var r = document.createElement('div');
    r.setAttribute('style',
      'position:fixed;left:' + x + 'px;top:' + y + 'px;width:12px;height:12px;' +
      'border-radius:50%;background:rgba(255,64,64,0.6);z-index:2147483646;' +
      'pointer-events:none;transform:translate(-50%,-50%) scale(1);opacity:1;' +
      'transition:transform 450ms ease-out,opacity 450ms ease-out;');
    (document.documentElement || document.body).appendChild(r);
    requestAnimationFrame(function () {
      r.style.transform = 'translate(-50%,-50%) scale(7)';
      r.style.opacity = '0';
    });
    setTimeout(function () { r.remove(); }, 500);
  }
  window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); }, true);
  window.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY); }, true);
  window.addEventListener('mousedown', function (e) { ripple(e.clientX, e.clientY); }, true);
  window.addEventListener('pointerdown', function (e) { ripple(e.clientX, e.clientY); }, true);
  // Self-heal: heavy SPAs (e.g. YouTube) re-render and strip foreign DOM nodes,
  // so re-append the cursor if it gets removed.
  setInterval(ensure, 400);
  document.addEventListener('DOMContentLoaded', ensure);
  ensure();
})();
`;

async function main() {
  // 1) Launch Stagehand's local Chrome (headless:false so you can watch it).
  const browser = await localBrowser.launch({ headless: false });
  const stagehand = await Stagehand.create({ browser });

  // 2) Attach a Playwright client to the SAME Chrome over CDP.
  const cdpUrl = getStagehandCdpUrl(stagehand);
  if (!cdpUrl) throw new Error("Could not resolve Stagehand's CDP URL.");
  const pw = await chromium.connectOverCDP(cdpUrl);
  const pwPage = pw.contexts()[0]!.pages()[0]!;

  // 3) Start recording the underlying tab.
  const recDir = fileURLToPath(new URL("../recordings", import.meta.url));
  await mkdir(recDir, { recursive: true });
  const out = path.join(recDir, `session-${stamp()}.webm`);
  await pwPage.screencast.start({ path: out, size: { width: 1280, height: 800 } });
  console.log(`[demo] recording → ${out}`);

  // Show a visible cursor + click ripples (automation has no OS cursor).
  try {
    const ctx = pw.contexts()[0];
    if (ctx) await ctx.addInitScript(SESSION_CURSOR_OVERLAY).catch(() => {});
    await pwPage.addInitScript(SESSION_CURSOR_OVERLAY).catch(() => {});
    await pwPage.evaluate(SESSION_CURSOR_OVERLAY).catch(() => {});
  } catch {
    /* non-fatal */
  }

  // 4) Drive the SAME tab (via the Playwright page) through the scenario.
  //    Failures are logged (not swallowed) so we can see what actually happens.
  pwPage.setDefaultTimeout(8000);
  const log = (m: string) => console.log(`[demo] ${m}  (url=${pwPage.url().slice(0, 70)})`);
  try {
    // --- Google: search "youtube" ---
    await pwPage.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
    // Dismiss a possible Google consent interstitial.
    const gAgree = pwPage.getByRole("button", { name: /accept all|i agree/i });
    if (await gAgree.count()) {
      await gAgree.first().click().catch(() => {});
      await pwPage.waitForTimeout(1000);
    }
    const gBox = 'textarea[name="q"], input[name="q"]';
    await pwPage.waitForSelector(gBox, { timeout: 8000 }).catch(() => {});
    console.log(`[demo] google search box present:`, (await pwPage.locator(gBox).count()) > 0);
    await pwPage.fill(gBox, "youtube").catch((e) => console.warn("[demo] google fill failed:", e.message));
    await pwPage.keyboard.press("Enter");
    await pwPage.waitForLoadState("domcontentloaded").catch(() => {});
    await pwPage.waitForTimeout(2000);
    log("after google search");

    // --- Click the first YouTube result ---
    const yt = pwPage.locator('a[href*="youtube.com"]').first();
    console.log(`[demo] youtube result links:`, await yt.count());
    if (await yt.count()) await yt.click();
    await pwPage.waitForLoadState("domcontentloaded").catch(() => {});
    await pwPage.waitForTimeout(3000);
    log("after clicking youtube result");

    // --- Make sure we're on YouTube (fallback if the click missed) ---
    if (!/youtube\.com/.test(pwPage.url())) {
      await pwPage.goto("https://www.youtube.com", { waitUntil: "domcontentloaded" });
      await pwPage.waitForTimeout(2000);
      log("navigated directly to youtube");
    }
    // Dismiss a possible YouTube consent / region interstitial.
    const ytAgree = pwPage.getByRole("button", {
      name: /accept|agree|confirm|continue|i am|i’m over/i,
    });
    if (await ytAgree.count()) {
      await ytAgree.first().click().catch(() => {});
      await pwPage.waitForTimeout(1500);
    }

    // --- Search "minecraft song" on YouTube (typed, with URL fallback) ---
    const yBox = "input#search";
    await pwPage.waitForSelector(yBox, { timeout: 8000 }).catch(() => {});
    console.log(`[demo] youtube search box present:`, (await pwPage.locator(yBox).count()) > 0);
    let searched = false;
    if (await pwPage.locator(yBox).count()) {
      await pwPage
        .fill(yBox, "minecraft song")
        .catch((e) => console.warn("[demo] yt fill failed:", e.message));
      await pwPage.keyboard.press("Enter");
      searched = true;
      log("typed 'minecraft song' in the YouTube search box");
    }
    if (!searched) {
      console.log("[demo] search box unavailable (consent/region) — using direct results URL");
      await pwPage
        .goto("https://www.youtube.com/results?search_query=minecraft+song", {
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
    }
    await pwPage.waitForTimeout(3000);
    log("after youtube search");

    // --- Play the first video ---
    const video = pwPage
      .locator("ytd-video-renderer a#video-title, ytd-rich-item-renderer a#video-title, a#video-title")
      .first();
    console.log(`[demo] video titles found:`, await video.count());
    if (await video.count()) await video.click();
    log("clicked first video — recording 15s of playback…");
    await pwPage.waitForTimeout(15000);
  } catch (e) {
    console.warn(`[demo] driving hit an error (recording still saved): ${(e as Error).message}`);
  }

  // 5) Stop the screencast BEFORE tearing down Stagehand.
  await pwPage.screencast.stop();
  await pw.close();
  // Transcode the WebM screencast into a real MP4.
  const finalOut = (await transcodeWebmToMp4(out)) ?? out;
  console.log(`[demo] saved → ${finalOut}`);

  await stagehand.close().catch(() => {});
  await browser.close().catch(() => {});
}

main().catch((e) => {
  console.error("[demo] FAILED:", e);
  process.exit(1);
});
