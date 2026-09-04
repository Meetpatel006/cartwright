import { CartwrightAsciiBackdrop } from "./ascii-backdrop";

export function CartwrightFooter() {
  return (
    <footer className="relative w-full bg-[#191919] text-neutral-100 font-ito-sans overflow-hidden border-t border-white/10">
      {/* Exact Sodium ASCII Canvas Backdrop running inside footer */}
      <CartwrightAsciiBackdrop />

      <div className="relative z-10 px-4 md:px-6 lg:px-12">
        <div className="relative mx-auto w-full max-w-6xl py-6 sm:py-8">
          {/* Bottom Bar */}
          <div className="flex flex-col justify-between gap-4 text-xs text-neutral-400 sm:flex-row sm:items-center font-ito-mono">
            <p className="m-0">
              &copy; {new Date().getFullYear()} Cartwright Technologies Inc. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <span>Zero Sponsored Bias</span>
              <span>&bull;</span>
              <span>Spending Guardrails</span>
              <span>&bull;</span>
              <span>Razorpay Sandbox</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
