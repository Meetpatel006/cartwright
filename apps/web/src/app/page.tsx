import Link from "next/link";
import { Play, ArrowRight, ShieldCheck, Sparkles, Zap, Store, Bot } from "lucide-react";
import { HeroVideo } from "@/components/hero-video";
import FAQAccordion from "@/components/faq-accordion";

export const metadata = {
  title: "Cartwright | Autonomous AI Shopping & Checkout Agent",
  description:
    "Describe what you need in plain English. Cartwright explores e-commerce stores in real time, filters out sponsored markup, compares verified prices, and automates checkout safely under your spending rules.",
};

function AmazonIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z" />
    </svg>
  );
}

function FlipkartIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.833 1.333a.993.993 0 0 0-.333.061V1c0-.551.449-1 1-1h14.667c.551 0 1 .449 1 1v.333H3.833zm17.334 2.334H2.833c-.551 0-1 .449-1 1V23c0 .551.449 1 1 1h7.3l1.098-5.645h-2.24c-.051 0-5.158-.241-5.158-.241l4.639-.327-.078-.366-1.978-.285 1.882-.158-.124-.449-3.075-.467s3.341-.373 3.392-.373h3.232l.247-1.331c.289-1.616.945-2.807 1.973-3.693 1.033-.892 2.344-1.332 3.937-1.332.643 0 1.053.151 1.231.463.118.186.201.516.279.859.074.352.14.671.095.903-.057.345-.461.465-1.197.465h-.253c-1.327 0-2.134.763-2.405 2.31l-.243 1.355h1.54c.574 0 .781.402.622 1.306-.17.941-.539 1.36-1.111 1.36H14.9L13.804 24h7.362c.551 0 1-.449 1-1V4.667a1 1 0 0 0-.999-1zM20.5 2.333A.334.334 0 0 0 20.167 2H3.833a.334.334 0 0 0-.333.333V3h17v-.667z" />
    </svg>
  );
}

function RazorpayIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.436 0l-11.91 7.773-1.174 4.276 6.625-4.297L11.65 24h4.391l6.395-24zM14.26 10.098L3.389 17.166 1.564 24h9.008l3.688-13.902Z" />
    </svg>
  );
}

function ShopifyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" />
    </svg>
  );
}

function NikeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="w-full overflow-hidden bg-black text-white selection:bg-white selection:text-black">
      {/* ── HERO VIEWPORT (Self-contained video background) ──────────── */}
      <section className="relative flex min-h-screen w-full flex-col justify-between overflow-hidden bg-black">
        {/* Background Video & Subtle Ambient Overlays strictly in Hero */}
        <HeroVideo />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-black/15 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 z-10" />

        {/* ── Transparent Top Navbar ──────────────────────────────────── */}
        <header className="relative z-30 w-full">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-10 lg:px-12">
            {/* Left — Nav Links */}
            <nav className="hidden items-center gap-8 md:flex">
              <Link
                href="/shopper"
                className="text-[13px] font-medium tracking-wide text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                Shopper
              </Link>
              <Link
                href="/policy"
                className="text-[13px] font-medium tracking-wide text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                Spending Policy
              </Link>
              <Link
                href="/transactions"
                className="text-[13px] font-medium tracking-wide text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                Transactions
              </Link>
            </nav>

            {/* Center — Brand */}
            <Link
              href="/"
              className="flex items-center gap-2.5 font-mono text-sm font-semibold tracking-wider uppercase text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </span>
              Cartwright
            </Link>

            {/* Right — Action Button */}
            <div className="flex items-center gap-4">
              <Link
                href="/signin"
                className="hidden text-xs font-medium text-neutral-300 transition-colors hover:text-white md:block"
              >
                Sign in
              </Link>
              <Link
                href="/shopper"
                className="inline-flex items-center rounded-full bg-white px-5 py-2 text-xs font-semibold text-black shadow-md transition-all hover:bg-neutral-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Launch agent
              </Link>
            </div>
          </div>
        </header>

        {/* ── Main Hero Left Content ──────────────────────────────────── */}
        <main className="relative z-20 mx-auto flex w-full max-w-7xl flex-1 items-center px-6 sm:px-10 lg:px-12 py-12 md:py-16">
          <div className="max-w-xl">
            {/* Tag Pill / Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-medium text-neutral-200 backdrop-blur-md shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Autonomous commerce agent</span>
            </div>

            {/* Large Serif Title */}
            <h1 className="font-serif text-5xl font-normal leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-[72px] drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)] [text-wrap:balance]">
              Real agents,
              <br />
              real checkout.
            </h1>

            {/* Subtitle / Description */}
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-neutral-200 sm:text-base drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] [text-wrap:pretty]">
              Describe what you need in plain English. Cartwright explores verified stores in parallel, filters out sponsored noise, ranks authentic deals, and automates checkout within strict wallet guardrails.
            </p>

            {/* Dual CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/shopper"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black shadow-lg transition-all hover:bg-neutral-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Start shopping free
              </Link>

              <Link
                href="#live-demo"
                className="inline-flex h-11 items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>See live process</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                  <Play className="h-2.5 w-2.5 fill-current text-white translate-x-0.5" />
                </span>
              </Link>
            </div>
          </div>
        </main>

        {/* ── Bottom Stats & Integrations Bar ──────────────────────────── */}
        <div className="relative z-20 w-full pb-8 pt-4">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-6 sm:px-10 lg:flex-row lg:items-end lg:px-12">
            {/* Stats Section with Column Dividers */}
            <div>
              <div className="grid grid-cols-3 divide-x-2 divide-white/25">
                <div className="pr-5 sm:pr-8">
                  <div className="font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                    14.2s
                  </div>
                  <div className="mt-1 text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                    Avg. deal discovery
                  </div>
                </div>

                <div className="px-5 sm:px-8">
                  <div className="font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                    100%
                  </div>
                  <div className="mt-1 text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                    Guardrailed spending
                  </div>
                </div>

                <div className="pl-5 sm:pl-8">
                  <div className="font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                    0%
                  </div>
                  <div className="mt-1 text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                    Sponsored markup
                  </div>
                </div>
              </div>
            </div>

            {/* Right Integrations Section */}
            <div className="flex flex-col items-start lg:items-end">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
                Supported Platforms & Gateways
              </span>
              <div className="flex flex-wrap items-center justify-start lg:justify-end gap-x-6 gap-y-2.5 sm:gap-x-7 text-xs font-medium text-neutral-300">
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <AmazonIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Amazon
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <NikeIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Nike
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <FlipkartIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Flipkart
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <RazorpayIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Razorpay
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <ShopifyIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Shopify
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap hover:text-white transition-colors">
                  <Store className="h-3.5 w-3.5 text-neutral-400 shrink-0" /> Custom Stores
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: Live Autonomous Agent Interactive Demo ──────────── */}
      <section id="live-demo" className="relative z-20 w-full bg-black py-28 px-6 sm:px-10 border-t border-neutral-800/80">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Execution Engine</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-white">
              Watch Cartwright navigate, rank, and decide
            </h2>
            <p className="mt-4 text-sm sm:text-base text-neutral-400 leading-relaxed">
              Every shopping session runs inside a sandboxed browser environment with computer vision reasoning and transparent decision logs.
            </p>
          </div>

          {/* Terminal Execution Preview Card */}
          <div className="w-full overflow-hidden rounded-2xl border border-neutral-800 bg-[#121212]/90 backdrop-blur-xl text-left shadow-2xl">
            {/* Terminal Window Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 bg-[#1a1a1a] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-neutral-700/80" />
                <span className="h-3 w-3 rounded-full bg-neutral-700/80" />
                <span className="h-3 w-3 rounded-full bg-neutral-700/80" />
                <span className="ml-2 font-mono text-[11px] text-neutral-400">
                  cartwright-session · id 8f9a2 · Stagehand v4 (Chromium)
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <Zap className="h-3 w-3" />
                Live Agent Active
              </div>
            </div>

            {/* Terminal Body */}
            <div className="p-6 font-mono text-xs sm:text-sm leading-relaxed space-y-3 text-neutral-300">
              <p className="text-neutral-400">
                <span className="text-white font-bold">$</span> query:{" "}
                <span className="text-emerald-300">
                  &quot;wireless over ear headphones with active noise cancellation under ₹25000&quot;
                </span>
              </p>
              <div className="pl-4 border-l border-neutral-800 space-y-1.5 text-xs text-neutral-400">
                <p>
                  <span className="text-emerald-400">&gt;</span> [intent] Extracted parameters: category=audio · budget_cap=₹25,000 · feature=ANC
                </p>
                <p>
                  <span className="text-emerald-400">&gt;</span> [discovery] Navigating Amazon, Flipkart, Croma in parallel… discovered 18 candidates
                </p>
                <p>
                  <span className="text-amber-400">&gt;</span> [filter] Dropped 6 sponsored listings and 3 out-of-budget variants
                </p>
                <p>
                  <span className="text-emerald-400">&gt;</span> [ranking] Verifying historical pricing, warranty terms, and seller trust score
                </p>
              </div>

              {/* Scored Candidate Result Card */}
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-[#1b2a22]/50 p-4 sm:p-5 text-white backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-emerald-400 text-sm">
                        Top Ranked Recommendation (Score 98/100)
                      </span>
                      <span className="ml-2 text-[11px] text-neutral-400">
                        Amazon India · Verified Deal
                      </span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-lg font-bold text-white">₹24,490</span>
                    <span className="ml-2 text-xs text-neutral-400 line-through">₹29,990</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <p className="text-xs text-neutral-300">
                    Sony WH-1000XM5 Wireless ANC Headphones (Black) · 30h battery · 4.8/5 (12,450 verified reviews)
                  </p>
                  <Link
                    href="/shopper"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-1.5 text-xs font-semibold shrink-0 transition-colors"
                  >
                    View in Shopper <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: 3-Step "How It Works" Journey ───────────────────── */}
      <section id="how-it-works" className="relative z-20 w-full bg-[#050505] py-28 px-6 sm:px-10 border-t border-neutral-800/80">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Step-By-Step Workflow</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-white">
              Autonomous commerce in 3 simple steps
            </h2>
            <p className="mt-4 text-sm sm:text-base text-neutral-400 leading-relaxed">
              From natural language request to verified checkout—without lifting a finger.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">
                  Step 01
                </span>
                <h3 className="mt-4 font-serif text-2xl font-normal text-white">
                  Describe Your Intent
                </h3>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                  Type what you need in plain English with your budget cap, specifications, and preferred merchants. No searching across tabs.
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-neutral-900 font-mono text-xs text-neutral-500">
                Prompt &rarr; Intent Extraction
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">
                  Step 02
                </span>
                <h3 className="mt-4 font-serif text-2xl font-normal text-white">
                  Parallel Store Exploration
                </h3>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                  Cartwright launches Stagehand browser agents to inspect live stores concurrently, evaluate customer reviews, and discard sponsored bias.
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-neutral-900 font-mono text-xs text-neutral-500">
                Vision Browsing &rarr; Explainable Ranking
              </div>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">
                  Step 03
                </span>
                <h3 className="mt-4 font-serif text-2xl font-normal text-white">
                  Guardrailed 1-Click Checkout
                </h3>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                  Review the explainable match score. Cartwright adds the item to cart and safely executes Test Mode checkout under strict spending rules.
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-neutral-900 font-mono text-xs text-neutral-500">
                Wallet Policy &rarr; Order Confirmation
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: Core Capabilities Grid ──────────────────────────── */}
      <section id="features" className="relative z-20 w-full bg-black py-28 px-6 sm:px-10 border-t border-neutral-800/80">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Core Architecture</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-white">
              Built for speed, safety, and transparency
            </h2>
            <p className="mt-4 text-sm sm:text-base text-neutral-400 leading-relaxed">
              Cartwright combines LLM reasoning with real browser automation and strict user guardrails.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 hover:border-white/25 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-6">
                <Bot className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl font-normal text-white">
                Universal LLM Add-To-Cart
              </h3>
              <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                No brittle scraping selectors. Cartwright navigates any e-commerce storefront like a human shopper, selecting sizes, dismissing popups, and confirming cart placement.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 hover:border-white/25 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-6">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl font-normal text-white">
                Zero Sponsored Bias & Fake Deals
              </h3>
              <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                Algorithms filter out promoted placements and calculate a 0–100 match score based on true price history, specifications, and verified customer feedback.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 hover:border-white/25 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-6">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl font-normal text-white">
                Wallet Spending Guardrails
              </h3>
              <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                Set hard budget limits and per-transaction auto-approval ceilings. No payment is triggered without meeting your explicit policy rules.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 hover:border-white/25 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-6">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl font-normal text-white">
                Full Video Screencasts & Audit Logs
              </h3>
              <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                Every automation run records high-definition MP4 screencasts with visual click ripples and captured order confirmations for full visibility.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: Frequently Asked Questions ─────────────────────── */}
      <section id="faq" className="relative z-20 w-full bg-[#050505] py-28 px-6 sm:px-10 border-t border-neutral-800/80">
        <div className="mx-auto max-w-4xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Got Questions?</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-white">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-sm sm:text-base text-neutral-400 leading-relaxed">
              Everything you need to know about Cartwright, spending limits, and payment automation.
            </p>
          </div>

          <FAQAccordion />
        </div>
      </section>

      {/* ── SECTION 6: Final Conversion CTA Banner & Footer ───────────── */}
      <section id="pricing" className="relative z-20 w-full bg-black py-28 px-6 sm:px-10 border-t border-neutral-800/80">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-medium text-neutral-200 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Public Beta · Free to Start</span>
          </div>

          <h2 className="font-serif text-4xl sm:text-6xl font-normal tracking-tight text-white [text-wrap:balance]">
            Ready to delegate your shopping to an autonomous agent?
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-sm sm:text-base text-neutral-300 leading-relaxed">
            Start searching across verified stores in real time with zero sponsored markups and full spending control.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/shopper"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-black shadow-xl transition-all hover:bg-neutral-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Launch Autonomous Shopper
            </Link>
            <Link
              href="/policy"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Configure Spending Policy
            </Link>
          </div>
        </div>
      </section>

      {/* ── Global Minimal Footer ────────────────────────────────────── */}
      <footer className="relative z-20 w-full bg-black border-t border-neutral-900 py-10 px-6 sm:px-10 lg:px-12 text-neutral-400 text-xs font-mono">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 text-white font-semibold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Cartwright
          </div>

          <div className="flex flex-wrap items-center gap-6 text-neutral-400">
            <Link href="/shopper" className="hover:text-white transition-colors">
              Shopper
            </Link>
            <Link href="/policy" className="hover:text-white transition-colors">
              Policy
            </Link>
            <Link href="/transactions" className="hover:text-white transition-colors">
              Transactions
            </Link>
            <Link href="/signin" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>

          <div className="flex items-center gap-2 text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Systems operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
