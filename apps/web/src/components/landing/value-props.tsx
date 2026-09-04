import Image from "next/image";

export function CartwrightValueProps() {
  const cards = [
    {
      icon: "/logos/icon-catch.svg",
      title: "Universal LLM Add-To-Cart",
      desc: "No brittle scrapers or hardcoded selectors. Cartwright navigates any e-commerce storefront like a human shopper — selecting sizes, dismissing popups, and verifying cart placement.",
    },
    {
      icon: "/logos/icon-proof.svg",
      title: "Zero Sponsored Bias & Fake Deals",
      desc: "Query-relevance gating strips promoted placements and upsell noise. Candidates receive an authentic 0–100 match score based on verified specs, reviews, and historical pricing.",
    },
    {
      icon: "/logos/icon-hours.svg",
      title: "Wallet Guardrails & Merchant Tracker",
      desc: "Enforce strict per-item and per-session spending limits with 1-click Razorpay checkout. Merchants embed Cartwright Universal Tracker to observe incoming AI buyers in real time.",
    },
  ];

  return (
    <>
      {/* Value Props Header */}
      <section id="capabilities" className="scroll-mt-16 bg-[#fcfcfc] text-[#141414]" aria-labelledby="features-heading">
        <div className="border-b border-[#eaeaea] px-4 md:px-6 lg:px-12">
          <div className="relative mx-auto w-full max-w-[80rem]">
            <div className="py-12 md:py-16 lg:py-20">
              <h2
                id="features-heading"
                className="m-0 text-[1.75rem] font-normal leading-tight text-[#141414] md:text-[36px] lg:text-[2.5rem]"
              >
                Autonomous commerce with total certainty
                <span className="block text-[#727272] tracking-[-1.2px]">
                  powered by LLM vision, spending guardrails & merchant analytics
                </span>
              </h2>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props 3 Cards Grid */}
      <section
        className="bg-[#fcfcfc] bg-[repeating-linear-gradient(125deg,transparent,transparent_6px,#0000000d_6px,#0000000d_7px)] text-[#141414]"
        aria-label="Feature Highlights"
      >
        <div className="border-b border-[#eaeaea] px-4 md:px-6 lg:px-12">
          <div className="relative mx-auto w-full max-w-[80rem] border-x border-[#eaeaea] bg-[#fcfcfc]">
            <div className="grid auto-cols-fr grid-cols-1 items-stretch gap-px bg-[#eaeaea] md:grid-cols-3">
              {cards.map((card) => (
                <article key={card.title} className="bg-[#fcfcfc] p-6 md:p-8">
                  <div className="mb-6 md:mb-8">
                    <Image
                      src={card.icon}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className="size-8"
                    />
                  </div>
                  <h3 className="m-0 mb-2 text-[18px] font-normal leading-tight text-[#141414] md:text-[20px]">
                    {card.title}
                  </h3>
                  <p className="m-0 text-sm leading-[1.5] text-[#727272]">
                    {card.desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
