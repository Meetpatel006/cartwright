"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const AGENTS = [
  { name: "Claude Sonnet 5", logo: { src: "/logos/claude.svg", width: 100, em: 0.8 } },
  { name: "GPT-6 Astra", logo: { src: "/logos/chatgpt.svg", width: 114, em: 0.82 } },
  { name: "DeepSeek V4", logo: { src: "/logos/deepseek.svg", width: 136, em: 0.8 } },
  { name: "Gemini 3.8 Flash", logo: { src: "/logos/gemini.svg", width: 100, em: 0.9 } },
  { name: "Perplexity Sonar", logo: { src: "/logos/perplexity.svg", width: 76, em: 0.82 } },
  { name: "GitHub Copilot", logo: { src: "/logos/copilot.svg", width: 110, em: 0.8 } },
  { name: "Grok 4.6", logo: { src: "/logos/grok.svg", width: 91, em: 0.72 } },
  { name: "OpenClaw Agent", logo: { src: "/logos/openclaw.svg", width: 111, em: 0.82 } },
];

export function CartwrightRollingAgent({
  inline = true,
  className = "",
}: {
  inline?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % AGENTS.length);
        setIsTransitioning(false);
      }, 500);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  const current = AGENTS[index] ?? AGENTS[0];

  return (
    <span className={inline ? "relative inline-block align-baseline" : "relative block"}>
      <span
        style={{
          transition:
            "opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), filter 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
          opacity: isTransitioning ? 0 : 1,
          filter: isTransitioning ? "blur(8px)" : "blur(0px)",
        }}
        className={`inline-flex items-center whitespace-nowrap text-sky-400 ${className}`}
      >
        <Image
          src={current.logo.src}
          alt=""
          width={current.logo.width}
          height={100}
          unoptimized
          style={{
            height: `${current.logo.em}em`,
            verticalAlign: "middle",
          }}
          className="mr-2 inline-block w-auto drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]"
        />
        <span>{current.name}</span>
      </span>
    </span>
  );
}
