"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "How does Cartwright discover products across different stores?",
    a: "Cartwright deploys autonomous browser agents with vision models that interpret e-commerce pages like a human shopper. It executes natural search queries, filters out sponsored noise, and extracts true specifications and real-time inventory without needing brittle scrapers.",
  },
  {
    q: "Is my payment information and budget secure?",
    a: "Yes. Cartwright operates under strict user-defined guardrails. You set maximum spending limits per item and per session. No order is finalized without your explicit review or pre-configured auto-approval threshold, and all payment workflows run in verified Razorpay test mode or tokenized gateways.",
  },
  {
    q: "Does Cartwright show sponsored products or affiliate bias?",
    a: "No. Ranking is purely algorithmic based on your query requirements, customer reviews, verified pricing, and delivery timelines. Cartwright never promotes sponsored listings over objectively superior deals.",
  },
  {
    q: "Can I watch the agent while it browses and compares?",
    a: "Yes. Every shopping session includes a live stream view with browser screenshots and action logs showing every query, filter applied, and candidate product evaluated in real time.",
  },
  {
    q: "What happens if a product is out of stock or overpriced?",
    a: "The agent flags out of stock items immediately, analyzes historical price trends, and suggests the next best ranked alternative with transparent reasoning.",
  },
  {
    q: "How do merchants install and track AI agent traffic on their stores?",
    a: "Merchants install `@cartwright/tracker` via npm/bun or embed a single script tag into Shopify, WooCommerce, BigCommerce, or custom Next.js stores. Cartwright automatically classifies AI agent visits, tracks agent-driven checkouts, and surfaces live GMV share analytics.",
  },
  {
    q: "How much does Cartwright cost to use?",
    a: "Cartwright is completely free to start during our initial public release. You can run unlimited shopping searches, test checkout automations, and track AI traffic on your store with zero markup.",
  },
];

export function CartwrightFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="scroll-mt-16 bg-[#fcfcfc] text-[#141414] font-ito-sans">
      <div className="border-b border-[#eaeaea] px-4 md:px-6 lg:px-12">
        <div className="relative mx-auto w-full max-w-[80rem] border-x border-[#eaeaea] bg-[#fcfcfc]">
          <div className="flex flex-col items-center gap-6 px-4 pt-16 pb-12 text-center md:px-6 md:pt-20 md:pb-16 lg:px-12">
            <span className="inline-block bg-[#ddefff] px-3 py-1 font-ito-mono text-xs uppercase tracking-[0.03em] text-[#141414]">
              FREQUENTLY ASKED QUESTIONS
            </span>
            <h2 className="m-0 text-[2rem] font-normal leading-tight text-[#141414] md:text-[2.5rem] xl:text-[3rem]">
              Questions teams ask before using Cartwright.
            </h2>
            <p className="m-0 text-base text-[#727272]">
              Common questions from shoppers, agent developers, and e-commerce merchants.
            </p>
          </div>

          {/* Accordions List */}
          <div className="border-t border-[#eaeaea]">
            {FAQS.map((faq, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div
                  key={faq.q}
                  className="border-b border-[#eaeaea] transition-colors hover:bg-[#f8f8f8]"
                >
                  <button
                    type="button"
                    onClick={() => toggle(idx)}
                    className="flex w-full cursor-pointer items-center justify-between p-6 text-left md:p-8"
                  >
                    <span className="text-lg font-normal text-[#141414] md:text-xl">
                      {faq.q}
                    </span>
                    <span className="ml-4 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eaeaea] font-ito-mono text-base text-[#727272]">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 text-base leading-relaxed text-[#727272] md:px-8 md:pb-8">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
