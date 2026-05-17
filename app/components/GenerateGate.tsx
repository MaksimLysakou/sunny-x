"use client";

import { useState } from "react";
import type { Card } from "@/app/types";
import { CardStack } from "./CardStack";
import { CardsLoader } from "./CardsLoader";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; cards: Card[] }
  | { kind: "error"; message: string };

export function GenerateGate() {
  const [state, setState] = useState<State>({ kind: "idle" });

  const trigger = async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/cards", { method: "POST" });
      const data = (await res.json()) as { cards?: Card[]; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setState({ kind: "ready", cards: data.cards ?? [] });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (state.kind === "loading") return <CardsLoader />;
  if (state.kind === "ready") return <CardStack initialCards={state.cards} />;

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <div className="relative w-full rounded-2xl bg-white border border-zinc-200 shadow-lg overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-40 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(250, 204, 21, 0.25) 0%, transparent 60%)",
          }}
        />
        <div className="relative flex flex-col items-center text-center gap-5 p-8 sm:p-12">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
            <SunIcon />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Сегодняшние реплаи ещё не готовы
            </h2>
            <p className="text-sm text-zinc-600 max-w-md leading-relaxed">
              Нажми кнопку, и я отберу твиты из ленты
              и составлю карточки с реплаями. Обычно занимает 60
              секунд.
            </p>
          </div>

          {state.kind === "error" && (
            <div className="w-full max-w-md text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap text-left">
              {state.message}
            </div>
          )}

          <button
            type="button"
            onClick={trigger}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 font-semibold shadow-sm transition-colors"
          >
            <SparkIcon />
            {state.kind === "error" ? "Попробовать ещё раз" : "Запустить генерацию"}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <DotIcon className="text-emerald-500" />
              Opus 4.7 — посты и реплаи
            </span>
            <span className="inline-flex items-center gap-1">
              <DotIcon className="text-sky-500" />
              Sonnet 4.6 + web search — новости
            </span>
            <span className="inline-flex items-center gap-1">
              <DotIcon className="text-amber-500" />
              Кэш до конца дня
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7 text-amber-500"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2zm6 11l.9 2.6L21.5 16l-2.6.9L18 19.5l-.9-2.6L14.5 16l2.6-.9L18 13z" />
    </svg>
  );
}

function DotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={`w-2 h-2 ${className ?? ""}`} aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}
