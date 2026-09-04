"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@cartwright/ui/components/button";
import GlideMenu from "./primitives/glide-menu";
import { cn } from "@cartwright/ui/lib/utils";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time. The stack slides vertically as you
 * move between questions (the card's height animates to fit),
 * the step counter rolls like an odometer, and the footer uses
 * pill actions — a quiet Skip and a dark Continue with a ⏎.
 * Single-choice answers auto-advance; multi-select waits.
 * ───────────────────────────────────────────────────────── */

export type ApprovalQuestion = {
  q: string;
  type: "radio" | "check";
  options: string[];
};

export const QUESTIONS: ApprovalQuestion[] = [
  {
    q: "How many flavors should we launch?",
    type: "radio",
    options: ["Three (core line)", "Five (full case)", "Just one hero"],
  },
  {
    q: "Which mix-ins should we stock?",
    type: "check",
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"],
  },
  {
    q: "Which market do we enter first?",
    type: "radio",
    options: ["Food trucks", "Grocery freezers", "Scoop shops"],
  },
];

export type ApprovalLabels = {
  skip: string;
  continue: string;
  send: string;
  customPlaceholder: string;
  sentMessage: string;
};

const DEFAULT_LABELS: ApprovalLabels = {
  skip: "Skip",
  continue: "Continue",
  send: "Send",
  customPlaceholder: "Something else…",
  sentMessage: "Answers sent",
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

/* odometer digits — each character that changes rolls up (or down) */
function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) {
          return <span key={`${i}-${n}`}>{n}</span>;
        }
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        const restY = dir === "down" ? "0" : "-1em";
        const startY = dir === "down" ? "-1em" : "0";
        return (
          <span
            key={`${i}-${o}-${n}-${dir}`}
            style={{
              display: "inline-block",
              position: "relative",
              overflow: "hidden",
              height: "1em",
              lineHeight: "1em",
              verticalAlign: "-0.05em",
            }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateY(${shifted ? restY : startY})`,
              }}
            >
              <span style={{ height: "1em", lineHeight: "1em" }}>{top}</span>
              <span style={{ height: "1em", lineHeight: "1em" }}>{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

function Ico({ path, size = 14, sw = 2 }: { path: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export interface ApprovalCardProps {
  questions?: ApprovalQuestion[];
  labels?: Partial<ApprovalLabels>;
  onSubmitted?: (answers: Record<number, number[]>) => void;
  onAnswerChange?: (questionIndex: number, answer: number[]) => void;
  onDismiss?: () => void;
  resettable?: boolean;
  className?: string;
}

export function ApprovalCard({
  questions = QUESTIONS,
  labels,
  onSubmitted,
  onAnswerChange,
  onDismiss,
  resettable = true,
  className,
}: ApprovalCardProps = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(false);

  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [viewportH, setViewportH] = useState<number | undefined>(undefined);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);
  const measured = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const last = qi === questions.length - 1;
  const currentAnswers = answers[qi] ?? [];
  const currentCustom = custom[qi] ?? "";
  const hasAnswer = currentAnswers.length > 0 || currentCustom.trim().length > 0;

  const sync = (withAnim = true) => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };

  useLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, answers, custom, open, sent]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const goTo = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), questions.length - 1));
  };

  const handleDismiss = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setOpen(false);
    onDismiss?.();
  };

  const send = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setSent(true);
    onSubmitted?.(answers);
  };

  const advance = () => {
    if (last) send();
    else goTo(qi + 1);
  };

  const toggle = (index: number) => {
    const type = questions[qi].type;
    setAnswers((current) => {
      const picked = current[qi] ?? [];
      const next =
        type === "radio"
          ? [index]
          : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];
      onAnswerChange?.(qi, next);
      return { ...current, [qi]: next };
    });
    if (type === "radio") {
      setCustom((current) => ({ ...current, [qi]: "" }));
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        if (last) send();
        else setQi((current) => Math.min(questions.length - 1, current + 1));
      }, 480);
    }
  };

  const reset = () => {
    setQi(0);
    setAnswers({});
    setCustom({});
    setSent(false);
    setOpen(true);
    measured.current = false;
  };

  if (!open) {
    return null;
  }

  if (sent) {
    return (
      <div className="flex w-full max-w-sm items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 py-1 pr-3 pl-1 text-[12.5px] font-medium text-emerald-400">
          <span className="flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-black">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          {t.sentMessage}
        </span>
        {resettable && (
          <button
            type="button"
            onClick={reset}
            className="text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200 cursor-pointer"
          >
            Start over
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-[#161616]/95 p-4 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          aria-label="Dismiss"
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-zinc-400 transition-colors duration-100 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
        >
          <Ico size={14} sw={2.2} path={<path d="M18 6L6 18M6 6l12 12" />} />
        </button>

        <div>
          {/* the question itself is the heading */}
          <div
            className="overflow-hidden"
            style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
            aria-live="polite"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 26,
                transform: `translate3d(0, ${-trackY}px, 0)`,
                transition: animate ? `transform ${SLIDE}` : undefined,
                willChange: "transform",
              }}
            >
              {questions.map((question, qIdx) => {
                const active = qIdx === qi;
                if (!ready && !active) return null;
                const picked = answers[qIdx] ?? [];
                const questionStyle: CSSProperties = {
                  opacity: active ? 1 : 0,
                  transition: animate ? `opacity ${SLIDE}` : undefined,
                  pointerEvents: active ? undefined : "none",
                };
                return (
                  <div
                    key={qIdx}
                    ref={(el) => {
                      questionRefs.current[qIdx] = el;
                    }}
                    aria-hidden={active ? undefined : true}
                    style={questionStyle}
                  >
                    <div className="pr-7 text-[14px] font-semibold text-zinc-100">{question.q}</div>
                    <GlideMenu className="mt-3 flex flex-col gap-1" highlightClassName="inset-x-0 rounded-lg bg-zinc-800/60">
                      {question.options.map((option, i) => {
                        const on = picked.includes(i);
                        return (
                          <button
                            key={option}
                            type="button"
                            data-menu-row
                            aria-pressed={on}
                            tabIndex={active ? 0 : -1}
                            onClick={() => {
                              if (active) toggle(i);
                            }}
                            className="relative z-10 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-100 cursor-pointer"
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center transition-colors duration-200 border",
                                question.type === "radio" ? "rounded-full" : "rounded-[5px]",
                                on
                                  ? "border-emerald-500 bg-emerald-500 text-black"
                                  : "border-zinc-700 bg-zinc-900/60 text-transparent"
                              )}
                            >
                              {question.type === "radio" ? (
                                <span
                                  className="size-1.5 rounded-full bg-black transition-transform duration-200"
                                  style={{ transform: on ? "scale(1)" : "scale(0)" }}
                                />
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                            <span
                              className={cn(
                                "text-[13px] leading-tight transition-colors duration-200",
                                on ? "font-medium text-white" : "text-zinc-300"
                              )}
                            >
                              {option}
                            </span>
                          </button>
                        );
                      })}
                      <label
                        data-menu-row
                        className="relative z-10 flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-100"
                      >
                        <input
                          value={custom[qIdx] ?? ""}
                          tabIndex={active ? 0 : -1}
                          onChange={(event) => {
                            if (!active) return;
                            setCustom((current) => ({ ...current, [qIdx]: event.target.value }));
                            if (question.type === "radio") setAnswers((current) => ({ ...current, [qIdx]: [] }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && hasAnswer) {
                              event.preventDefault();
                              advance();
                            }
                          }}
                          placeholder={t.customPlaceholder}
                          aria-label="Custom answer"
                          className="min-w-0 flex-1 bg-transparent pl-1 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500"
                        />
                      </label>
                    </GlideMenu>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* footer — step nav (rolling counter) + pill actions */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <button
              type="button"
              aria-label="Previous question"
              disabled={qi <= 0}
              onClick={() => goTo(qi - 1)}
              className="flex size-5 items-center justify-center rounded-md transition-colors duration-100 enabled:hover:text-zinc-200 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <Ico size={14} path={<path d="M18 15l-6-6-6 6" />} />
            </button>
            <span
              className="inline-flex items-center text-[12px] font-mono tabular-nums text-zinc-400"
              style={{ letterSpacing: "-0.1px", lineHeight: 1 }}
            >
              <RollingDigits value={`${qi + 1} / ${questions.length}`} />
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={last}
              onClick={() => goTo(qi + 1)}
              className="flex size-5 items-center justify-center rounded-md transition-colors duration-100 enabled:hover:text-zinc-200 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <Ico size={14} path={<path d="M6 9l6 6 6-6" />} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (last ? handleDismiss() : goTo(qi + 1))}
              className="rounded-lg h-7 px-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
            >
              {t.skip}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!hasAnswer}
              onClick={advance}
              className="rounded-lg h-7 px-3 text-xs bg-white text-zinc-950 font-semibold hover:bg-zinc-200 disabled:opacity-40"
            >
              {last ? t.send : t.continue}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApprovalCard;
