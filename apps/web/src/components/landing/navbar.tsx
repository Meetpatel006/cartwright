"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Capabilities", id: "capabilities", href: "/#capabilities" },
  { label: "Merchant Tracker", id: "merchant-tracker", href: "/#merchant-tracker" },
  { label: "FAQ", id: "faq", href: "/#faq" },
];

export function CartwrightNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-scroll if page loaded with an anchor hash
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const targetId = window.location.hash.replace("#", "");
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, []);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (targetId === "onboarding") return;
    if (typeof window !== "undefined") {
      const isCartwrightPath = window.location.pathname === "/cartwright" || window.location.pathname === "/";
      if (isCartwrightPath) {
        e.preventDefault();
        setMobileOpen(false);
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          window.history.pushState(null, "", `#${targetId}`);
        }
      }
    }
  };

  return (
    <header className="absolute top-0 right-0 left-0 z-20 bg-transparent font-mono">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="inline-flex w-fit items-baseline gap-2 py-1.5 text-lg leading-none font-medium text-neutral-100 no-underline"
          >
            <span>Cartwright</span>
          </Link>
          <span className="hidden sm:inline-block text-[11px] text-neutral-500">by</span>
          <a
            href="https://github.com/Meetpatel006"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
          >
            Meet Patel
          </a>
        </div>

        {/* Navigation */}
        <nav className="hidden items-center justify-center gap-6 text-sm text-neutral-400 md:flex lg:gap-8">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={(e) => handleScroll(e, item.id)}
              className="py-1 transition-colors hover:text-neutral-100 no-underline cursor-pointer"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right CTA: Direct Login link & Bracket-Corner Get Started */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Meetpatel006/cartwright"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Repository & Documentation"
            className="hidden sm:inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 256 256">
              <path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.49,39.8,39.8,0,0,0-11.53,20.08,36,36,0,0,1-30.91-10.45,8,8,0,0,0-12.8,9.76,52,52,0,0,0,44.8,15.12V224a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V197.88a39.86,39.86,0,0,0,22.44-30.39A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68Z"></path>
            </svg>
            <span>GitHub</span>
          </a>

          <Link
            href="/login"
            className="hidden sm:inline-block px-3 py-1.5 font-mono text-sm text-neutral-300 transition-colors hover:text-white no-underline"
          >
            Login
          </Link>

          <Link
            href="/signup"
            className="group relative z-[3] flex select-none items-center justify-center px-4 py-2 font-mono text-xs uppercase tracking-[0.03em] text-white no-underline shadow-sm"
          >
            <span className="relative z-[3] block font-mono">Get Started</span>
            <span className="absolute inset-0 z-0 h-full w-full border border-[#007aff] bg-[#007aff]"></span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 z-[1] opacity-0 transition-all duration-300 group-hover:opacity-100 ito-bracket-corners"
              style={{ "--ito-primary-dark": "#ffffff" } as React.CSSProperties}
            ></span>
          </Link>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex md:hidden p-2 text-neutral-400 hover:text-white focus:outline-none"
            aria-label="Toggle Navigation"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#141414] px-4 py-4 md:hidden">
          <div className="flex flex-col space-y-3">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => handleScroll(e, item.id)}
                className="py-1.5 text-sm text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <Link
                href="/login"
                className="text-sm text-neutral-300 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                Login
              </Link>
              <a
                href="https://github.com/Meetpatel006/cartwright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-neutral-400 hover:text-white flex items-center gap-1.5"
                onClick={() => setMobileOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.49,39.8,39.8,0,0,0-11.53,20.08,36,36,0,0,1-30.91-10.45,8,8,0,0,0-12.8,9.76,52,52,0,0,0,44.8,15.12V224a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V197.88a39.86,39.86,0,0,0,22.44-30.39A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68Z"></path>
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
