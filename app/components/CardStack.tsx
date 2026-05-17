"use client";

import { useState } from "react";
import type { Card } from "@/app/types";
import { CardView } from "./CardView";

type SwipeDir = "left" | "right" | null;

export function CardStack({ initialCards }: { initialCards: Card[] }) {
  const [cards] = useState<Card[]>(initialCards);
  const [index, setIndex] = useState(0);
  const [swipe, setSwipe] = useState<SwipeDir>(null);

  const total = cards.length;
  const remaining = Math.max(total - index, 0);
  const current = cards[index];
  const next = cards[index + 1];

  const handleSwipe = (direction: "left" | "right") => {
    if (swipe || !current) return;
    setSwipe(direction);
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setSwipe(null);
    }, 320);
  };

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-2xl font-semibold text-zinc-800">
          All done
        </div>
        <p className="text-sm text-zinc-500">No more cards in the queue.</p>
      </div>
    );
  }

  const swipeClass =
    swipe === "left"
      ? "translate-x-[-130%] -rotate-12 opacity-0"
      : swipe === "right"
        ? "translate-x-[130%] rotate-12 opacity-0"
        : "translate-x-0 rotate-0 opacity-100";

  const widthClass = current.mode === "reply" ? "max-w-5xl" : "max-w-2xl";

  return (
    <div className={`flex flex-col items-center gap-6 w-full ${widthClass} transition-[max-width] duration-300`}>
      <div className="relative w-full h-[640px]">
        {next && (
          <div
            key={`bg-${next.id}`}
            className="absolute inset-0 rounded-2xl bg-white border border-zinc-200 shadow-sm p-7 overflow-hidden scale-[0.96] translate-y-2 opacity-70 pointer-events-none"
            aria-hidden="true"
          >
            <CardView card={next} />
          </div>
        )}
        <div
          key={current.id}
          className={`absolute inset-0 rounded-2xl bg-white border border-zinc-200 shadow-lg p-7 overflow-y-auto transition-all duration-300 ease-out will-change-transform ${swipeClass}`}
        >
          <CardView card={current} />
        </div>
      </div>

      <div className="flex items-center gap-4 w-full justify-center">
        <button
          type="button"
          onClick={() => handleSwipe("left")}
          disabled={!!swipe}
          className="flex-1 max-w-[160px] inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-3 font-semibold shadow-sm transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Отказано
        </button>

        <div
          className="min-w-[64px] text-center font-mono text-sm text-zinc-500"
          aria-live="polite"
        >
          {remaining}/{total}
        </div>

        <button
          type="button"
          onClick={() => handleSwipe("right")}
          disabled={!!swipe}
          className="flex-1 max-w-[160px] inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-3 font-semibold shadow-sm transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Опубликовано
        </button>
      </div>
    </div>
  );
}
