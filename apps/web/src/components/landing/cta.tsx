import { CartwrightAsciiBackdrop } from "./ascii-backdrop";

export function CartwrightCta() {
  return (
    <section className="relative w-full bg-[#191919] text-neutral-100 overflow-hidden border-t border-white/[0.08] font-ito-sans">
      {/* Exact Sodium ASCII Canvas Backdrop running inside CTA */}
      <CartwrightAsciiBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10 text-center sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="m-0 text-3xl font-normal leading-tight text-neutral-100 sm:text-4xl lg:text-5xl tracking-tight">
            Ready to delegate your shopping to an autonomous agent?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Search across verified stores in real time with zero sponsored markups, full spending guardrails, and live merchant analytics.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center">
            <a
              href="#features"
              className="group relative z-[3] flex select-none items-center justify-center px-8 py-3.5 font-ito-mono text-xs uppercase tracking-[0.03em] text-white no-underline shadow-lg"
            >
              <span className="relative z-[3] block font-ito-mono">Launch Agent Free</span>
              <span className="absolute inset-0 z-0 h-full w-full border border-[#007aff] bg-[#007aff]"></span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 z-[1] opacity-0 transition-all duration-300 group-hover:opacity-100 ito-bracket-corners"
              ></span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
