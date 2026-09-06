"use client";

import { useState } from "react";
import { CartwrightRollingAgent } from "./rolling-agent";
import { CartwrightAsciiBackdrop } from "./ascii-backdrop";

export function CartwrightHero() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section className="relative w-full min-h-screen min-h-dvh flex flex-col justify-center items-center bg-[#191919] text-neutral-100 overflow-hidden border-b border-white/[0.08]" aria-label="Hero">
      {/* Exact Sodium ASCII Canvas Backdrop filling the section */}
      <CartwrightAsciiBackdrop />

      {/* Hero Content Container */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 font-ito-sans">
        <div className="mx-auto max-w-3xl text-center">

          {/* Tag Pill */}
          {/* Sodium's Signature Hero Title with RollingAgent */}
          <h1 className="text-4xl leading-[1.2] font-normal text-neutral-100 text-balance sm:text-5xl lg:text-[3.75rem] tracking-tight">
            <span className="sr-only">Autonomous shopping and checkout for AI agents</span>
            <span aria-hidden="true" className="inline">
              Autonomous shopping and checkout for{" "}
              <CartwrightRollingAgent inline={true} className="text-white font-semibold" />
            </span>
          </h1>

          {/* Subheading */}
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 text-pretty sm:text-lg">
            Describe what you need in plain English. Cartwright explores verified stores in parallel, filters out sponsored noise, compares authentic deals, and executes guardrailed 1-click checkout under strict spending limits.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <div className="relative">
              <a
                href="#features"
                className="group relative z-[3] flex select-none items-center justify-center px-8 py-3.5 font-ito-mono text-xs uppercase tracking-[0.04em] text-white no-underline shadow-lg"
              >
                <span className="relative z-[3] block font-ito-mono">Launch Agent Free</span>
                <span className="absolute inset-0 z-0 h-full w-full border border-[#007aff] bg-[#007aff]"></span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 z-[1] opacity-0 transition-all duration-300 group-hover:opacity-100 ito-bracket-corners"
                ></span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="flex cursor-pointer items-center gap-2 text-neutral-300 transition-colors duration-300 hover:text-white"
              aria-label="Watch 2 min demo"
            >
              <div className="flex size-4 items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14,7.999c0-0.326-0.159-0.632-0.427-0.819l-10-7C3.269-0.034,2.869-0.058,2.538,0.112 C2.207,0.285,2,0.626,2,0.999v14.001c0,0.373,0.207,0.715,0.538,0.887c0.331,0.17,0.73,0.146,1.035-0.068l10-7 C13.841,8.633,14,8.327,14,8.001C14,8,14,8,14,7.999z" />
                </svg>
              </div>
              <span className="font-ito-mono text-xs uppercase tracking-[0.36px]">
                Watch agent live demo
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Demo Video Modal */}
      {demoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setDemoOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-lg bg-[#141414] p-2 shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 text-white">
              <span className="font-ito-mono text-xs uppercase tracking-wider text-neutral-400">
                Cartwright Autonomous Shopping &amp; Checkout Demo
              </span>
              <div className="flex items-center gap-3">
                <a
                  href="https://youtu.be/Dcm_cUj0LmY"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-neutral-400 hover:text-white underline underline-offset-2 transition-colors flex items-center gap-1"
                >
                  <span>Open in YouTube</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"></path>
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => setDemoOpen(false)}
                  className="text-neutral-400 hover:text-white px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded bg-black">
              <iframe
                src="https://www.youtube-nocookie.com/embed/Dcm_cUj0LmY?autoplay=1&rel=0"
                title="Cartwright Autonomous Shopping &amp; Checkout Demo"
                className="size-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
