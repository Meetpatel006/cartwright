"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "How does Cartwright discover products across different stores?",
    answer:
      "Cartwright deploys autonomous browser agents with vision models that interpret e-commerce pages like a human shopper. It executes natural search queries, filters out sponsored noise, and extracts true specifications and real-time inventory without needing brittle scrapers.",
  },
  {
    question: "Is my payment information and budget secure?",
    answer:
      "Yes. Cartwright operates under strict user defined guardrails. You set maximum spending limits per item and per session. No order is finalized without your explicit one click review, and all payment workflows run in verified test sandbox environments during this release.",
  },
  {
    question: "Does Cartwright show sponsored products or affiliate bias?",
    answer:
      "No. Ranking is purely algorithmic based on your query requirements, customer reviews, verified pricing, and delivery timelines. Cartwright never promotes sponsored listings over objectively superior deals.",
  },
  {
    question: "Can I watch the agent while it browses and compares?",
    answer:
      "Yes. Every shopping session includes a live stream view with browser screenshots and action logs showing every query, filter applied, and candidate product evaluated in real time.",
  },
  {
    question: "What happens if a product is out of stock or overpriced?",
    answer:
      "The agent flags out of stock items immediately, analyzes historical price trends, and suggests the next best ranked alternative with transparent reasoning.",
  },
  {
    question: "How much does Cartwright cost to use?",
    answer:
      "Cartwright is completely free to start during our initial public release. You can run unlimited shopping searches and test checkout automations with zero markup on product prices.",
  },
];

export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="mx-auto max-w-3xl divide-y divide-neutral-800/80 border-y border-neutral-800/80">
      {FAQS.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="py-5">
            <button
              type="button"
              onClick={() => toggle(index)}
              className="flex w-full items-center justify-between py-2 text-left font-sans text-base sm:text-lg font-medium text-white transition-colors duration-300 hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded [text-wrap:balance]"
              aria-expanded={isOpen}
            >
              <span>{faq.question}</span>
              <ChevronDown
                className={`ml-4 h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-300 ${
                  isOpen ? "rotate-180 text-white" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="pt-2 pb-3 text-sm sm:text-base leading-relaxed text-neutral-400 [text-wrap:pretty] transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
