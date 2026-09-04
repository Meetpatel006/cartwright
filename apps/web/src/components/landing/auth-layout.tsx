import Link from "next/link";
import { CartwrightAsciiBackdrop } from "@/components/landing/ascii-backdrop";

const BENEFITS = [
  "Multi-store autonomous product discovery & authentic ranking",
  "Universal LLM add-to-cart across Amazon, Nike, Shopify & custom stores",
  "Wallet spending guardrails with Razorpay checkout automation",
  "Universal Merchant Tracker SDK for AI agent traffic analytics",
];

const TRUSTED_BY = ["Amazon", "Shopify", "Flipkart", "Nike", "Razorpay", "WooCommerce"];

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen min-h-dvh overflow-hidden bg-[#0e0e0e] font-mono text-neutral-100 antialiased">

      {/* ── LEFT PANEL — marketing / branding (clean solid dark) ────── */}
      <div className="relative hidden w-[52%] shrink-0 lg:flex flex-col bg-[#0a0a0a] border-r border-white/[0.08]">
        {/* corner tick marks */}
        <span aria-hidden="true" className="absolute left-7 top-7 size-5 border-l border-t border-white/25" />
        <span aria-hidden="true" className="absolute right-7 top-7 size-5 border-r border-t border-white/25" />
        <span aria-hidden="true" className="absolute left-7 bottom-7 size-5 border-l border-b border-white/25" />
        <span aria-hidden="true" className="absolute right-7 bottom-7 size-5 border-r border-b border-white/25" />

        <div className="relative z-10 flex h-full flex-col justify-between px-14 py-12">
          {/* Logo */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-sm font-semibold tracking-widest uppercase text-white no-underline"
            >
              Cartwright
            </Link>
          </div>

          {/* Headline + bullets */}
          <div className="max-w-xl">
            <h1 className="text-3xl lg:text-[2.5rem] font-normal leading-[1.2] tracking-tight text-neutral-100">
              Autonomous commerce with total behavioral certainty
            </h1>
            <ul className="mt-8 space-y-4">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm leading-relaxed text-neutral-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#007aff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom — Trusted by & Copyright */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">Trusted by</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {TRUSTED_BY.map((name) => (
                <span key={name} className="text-xs font-semibold text-neutral-400">
                  {name}
                </span>
              ))}
            </div>

            <p className="mt-8 text-[10px] uppercase tracking-widest text-neutral-600">
              © Cartwright Platform · All rights reserved
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — ASCII backdrop + solid form ───────────────── */}
      <div className="relative flex flex-1 flex-col bg-[#141414] overflow-hidden">
        {/* High contrast animated ASCII backdrop */}
        <CartwrightAsciiBackdrop
          className="opacity-90"
          colors={["#2c2c2c", "#3e3e3e", "#565656", "#787878"]}
          wordColor="#9e9e9e"
        />

        {/* centered form card with solid dark surface for perfect contrast */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[430px] border border-white/10 bg-[#101010]/95 p-8 sm:p-10 shadow-2xl backdrop-blur-md">
            {/* mobile brand */}
            <div className="mb-8 lg:hidden">
              <Link
                href="/"
                className="text-sm font-semibold tracking-widest uppercase text-white no-underline"
              >
                Cartwright
              </Link>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

