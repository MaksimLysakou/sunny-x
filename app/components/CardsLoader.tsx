"use client";

import { useEffect, useState } from "react";

const DEFAULT_STAGES = [
  "Тащу сегодняшние твиты",
  "Отбираю самое сочное",
  "Пишу варианты ответов",
  "Шлифую и почти готово",
];
const DEFAULT_STAGE_MS = 16000;

export function CardsLoader({
  stages = DEFAULT_STAGES,
  stageMs = DEFAULT_STAGE_MS,
  hint,
}: {
  stages?: string[];
  stageMs?: number;
  hint?: string;
} = {}) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    setStage(0);
    const stageTimer = window.setInterval(() => {
      setStage((s) => (s < stages.length - 1 ? s + 1 : s));
    }, stageMs);
    const tickTimer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(tickTimer);
    };
  }, [stages, stageMs]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <div className="relative w-full h-[640px] rounded-2xl bg-white border border-zinc-200 shadow-lg overflow-hidden">
        <div
          className="absolute inset-0 opacity-50"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(110deg, transparent 0%, transparent 40%, rgba(244, 244, 245, 1) 50%, transparent 60%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "card-shimmer 2.4s linear infinite",
          }}
        />
        <div className="relative h-full flex flex-col items-center justify-center gap-6 p-8 text-center">
          <Spinner />
          <div className="flex flex-col gap-2">
            <div className="text-base font-medium text-zinc-800">
              {stages[stage]}…
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              {mm}:{ss}
            </div>
          </div>
          <div className="text-xs text-zinc-400 max-w-xs leading-relaxed">
            {hint ??
              "Первая генерация дня идёт через Opus и веб-поиск, обычно 30–90 секунд. Дальше всё кэшируется до конца дня."}
          </div>
        </div>
        <style>{`
          @keyframes card-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>

      <div className="flex items-center gap-4 w-full justify-center">
        <div className="flex-1 max-w-[160px] h-12 rounded-full bg-zinc-200/70 animate-pulse" />
        <div className="min-w-[64px] text-center font-mono text-sm text-zinc-400">
          —/—
        </div>
        <div className="flex-1 max-w-[160px] h-12 rounded-full bg-zinc-200/70 animate-pulse" />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="w-10 h-10 text-zinc-900 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
