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
            <p className="m-0 flex items-center gap-1.5">
              <span>&copy; 2026 Cartwright. Built by</span>
              <a
                href="https://github.com/Meetpatel006"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-200 hover:text-white underline underline-offset-2 transition-colors"
              >
                Meet Patel
              </a>
            </p>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <span>Zero Sponsored Bias</span>
              <span>&bull;</span>
              <span>Spending Guardrails</span>
              <span>&bull;</span>
              <a
                href="https://github.com/Meetpatel006/cartwright"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-neutral-300 hover:text-white transition-colors underline-offset-4 hover:underline"
              >
                GitHub Docs &amp; Help &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
