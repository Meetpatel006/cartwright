"use client";

import { useEffect, useRef } from "react";

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]()<>/=+*-_;:.";
const WORDS = ["CARTWRIGHT", "RUNTIME", "AGENTS", "WEBMCP", "TOOLS", "MANIFEST"];
const COLORS = ["#222222", "#272727", "#2d2d2d", "#333333"];
const LEVELS = COLORS.length;
const FALLBACK_FONT = "ui-monospace, monospace";

export function CartwrightAsciiBackdrop({
  className = "",
  colors = COLORS,
  wordColor = "#444444",
}: {
  className?: string;
  colors?: string[];
  wordColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const activeColors = colors && colors.length > 0 ? colors : COLORS;
    const activeWordColor = wordColor || "#444444";
    const activeLevels = activeColors.length;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const monoFont =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-geist-mono")
        .trim() || FALLBACK_FONT;
    const fontDesc = `10px ${monoFont}, ${FALLBACK_FONT}`;

    let cols = 0;
    let rows = 0;
    let charWidth = 7;
    let clientW = 0;
    let clientH = 0;
    let scale = 1;
    let grid: string[][] = [];
    let dirty: boolean[] = [];
    let waveY = new Float32Array(0);
    let animFrame = 0;
    let lastTime = 0;
    let lastScrollY = -1;

    const resize = () => {
      clientW = canvas.clientWidth;
      clientH = canvas.clientHeight;
      if (clientW === 0 || clientH === 0) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(clientW * dpr);
      canvas.height = Math.round(clientH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = fontDesc;
      ctx.textBaseline = "top";
      charWidth = ctx.measureText("M").width || 6;
      cols = Math.ceil(clientW / charWidth) + 1;
      rows = Math.ceil(clientH / 12) + 2;
      grid = Array.from({ length: activeLevels + 1 }, () => Array(cols).fill(" "));
      dirty = Array(activeLevels + 1).fill(false);
      waveY = new Float32Array(cols);
      scale = clientW < 768 ? 0.7 : 1;
      return true;
    };

    const render = (time: number, scrollY: number) => {
      if (cols === 0 || rows === 0) return;
      const t = 18e-7 * time;
      const rowOffset = Math.floor(scrollY / 12);
      const subPixelY = scrollY - 12 * rowOffset;
      const wordRow = grid[activeLevels];

      for (let c = 0; c < cols; c++) {
        waveY[c] = 0.7 * Math.cos(0.09 * c - 1.4 * t);
      }

      ctx.clearRect(0, 0, clientW, clientH);

      for (let r = 0; r < rows; r++) {
        const actualRow = r + rowOffset;
        for (let l = 0; l <= activeLevels; l++) {
          grid[l].fill(" ");
          dirty[l] = false;
        }

        let hash = Math.imul(0x9e3779b9 ^ actualRow, 0x9e3779b1);
        hash ^= hash >>> 15;
        hash = Math.imul(hash, 0x85ebca6b);
        hash = (hash ^ (hash >>> 13)) >>> 0;

        if (hash % 13 === 0) {
          const word = WORDS[hash % WORDS.length];
          const startCol = (hash >>> 9) % Math.max(1, cols - word.length);
          for (let i = 0; i < word.length; i++) {
            wordRow[startCol + i] = word[i];
          }
          dirty[activeLevels] = true;
        }

        const m = 0.22 * actualRow;
        const p = 0.8 * Math.sin(0.13 * actualRow + 1.9 * t);
        const h = 1.15 * m - 1.6 * t;

        for (let c = 0; c < cols; c++) {
          if (wordRow[c] !== " ") continue;
          const a = 0.16 * c;
          const noise =
            ((Math.sin(a + p + 2.1 * t) +
              Math.sin(h + waveY[c]) +
              Math.sin((a + m) * 0.42 + 1.1 * t) +
              0.7 * Math.sin(2.7 * a - 1.9 * m + 2.6 * t)) /
              3.7 *
              0.5 +
              0.5) *
            scale;

          if (noise < 0.34) continue;
          const level = Math.min(activeLevels - 1, (noise * activeLevels) | 0);

          let charHash =
            Math.imul(0x9e3779b9 ^ actualRow, 0x9e3779b1) ^
            Math.imul(c + 0x85ebca6b, 0x85ebca6b);
          charHash ^= charHash >>> 15;
          charHash = Math.imul(charHash, 0x85ebca6b);
          charHash = (charHash ^ (charHash >>> 13)) >>> 0;

          grid[level][c] = CHARS[charHash % CHARS.length];
          dirty[level] = true;
        }

        const yPos = 12 * r - subPixelY;
        for (let l = 0; l <= activeLevels; l++) {
          if (dirty[l]) {
            ctx.fillStyle = l === activeLevels ? activeWordColor : activeColors[l];
            ctx.fillText(grid[l].join(""), 0, yPos);
          }
        }
      }
    };

    const loop = (time: number) => {
      animFrame = requestAnimationFrame(loop);
      const scrollY = window.scrollY;
      if (scrollY === lastScrollY && time - lastTime < 500) return;
      lastScrollY = scrollY;
      lastTime = time;
      render(time, scrollY);
    };

    const stop = () => {
      cancelAnimationFrame(animFrame);
      animFrame = 0;
      window.removeEventListener("scroll", onScroll);
    };

    let scrolling = false;
    const onScroll = () => {
      if (scrolling) return;
      scrolling = true;
      requestAnimationFrame(() => {
        scrolling = false;
        render(12000, window.scrollY);
      });
    };

    const start = () => {
      stop();
      if (reducedMotion.matches) {
        render(12000, window.scrollY);
        window.addEventListener("scroll", onScroll, { passive: true });
        return;
      }
      if (document.hidden) {
        render(12000, window.scrollY);
      } else {
        lastTime = 0;
        lastScrollY = -1;
        animFrame = requestAnimationFrame(loop);
      }
    };

    resize();
    start();

    const resizeObserver = new ResizeObserver(() => {
      if (resize()) start();
    });
    resizeObserver.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", start);

    return () => {
      stop();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", start);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
