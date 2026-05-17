"use client";

import { useState } from "react";
import type { PostCard } from "@/app/types";
import { CardStack } from "./CardStack";
import { CardsLoader } from "./CardsLoader";

type State =
  | { kind: "idle" }
  | { kind: "running"; stages: string[]; hint: string }
  | { kind: "ready"; cards: PostCard[] }
  | { kind: "error"; message: string };

type GeneratedPostDTO = {
  text: string;
  sources: { url: string; title: string; summary: string }[];
};

type NewsResponse = {
  news?: { news: unknown[] } | null;
  error?: string;
};

type PostsResponse = {
  day?: string;
  posts?: GeneratedPostDTO[];
  error?: string;
};

const NEWS_STAGES = [
  "Гуглю свежие AI/IT новости",
  "Отбираю 6 лучших",
];
const POSTS_STAGES = [
  "Думаю над постами",
  "Пишу первые черновики",
  "Шлифую и оформляю ссылки",
];

const NEWS_HINT =
  "Haiku пробежится по web-поиску, потом другой Haiku выберет 6 самых сочных. ~30–60с.";
const POSTS_HINT =
  "Opus пишет 6 постов по отобранным новостям. ~20–40с.";

function buildCards(day: string, posts: GeneratedPostDTO[]): PostCard[] {
  return posts.map((p, i) => ({
    id: `p-${day}-${i}`,
    mode: "post" as const,
    text: p.text,
    sources: p.sources,
  }));
}

export function PostsGenerateGate({ hasNews }: { hasNews: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const trigger = async () => {
    try {
      if (!hasNews) {
        setState({
          kind: "running",
          stages: NEWS_STAGES,
          hint: NEWS_HINT,
        });
        const newsRes = await fetch("/api/posts/news", { method: "POST" });
        const newsData = (await newsRes.json()) as NewsResponse;
        if (!newsRes.ok || newsData.error) {
          throw new Error(newsData.error ?? `HTTP ${newsRes.status}`);
        }
      }

      setState({
        kind: "running",
        stages: POSTS_STAGES,
        hint: POSTS_HINT,
      });
      const postsRes = await fetch("/api/posts", { method: "POST" });
      const postsData = (await postsRes.json()) as PostsResponse;
      if (!postsRes.ok || postsData.error) {
        throw new Error(postsData.error ?? `HTTP ${postsRes.status}`);
      }

      const cards = buildCards(
        postsData.day ?? "now",
        postsData.posts ?? [],
      );
      setState({ kind: "ready", cards });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (state.kind === "running") {
    return <CardsLoader stages={state.stages} stageMs={14000} hint={state.hint} />;
  }
  if (state.kind === "ready") {
    return <CardStack initialCards={state.cards} />;
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <div className="relative w-full rounded-2xl bg-white border border-zinc-200 shadow-lg overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-40 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(56, 189, 248, 0.25) 0%, transparent 60%)",
          }}
        />
        <div className="relative flex flex-col items-center text-center gap-5 p-8 sm:p-12">
          <div className="w-16 h-16 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <PenIcon />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {hasNews
                ? "Новости готовы — пишем посты"
                : "Сегодняшние посты ещё не готовы"}
            </h2>
            <p className="text-sm text-zinc-600 max-w-md leading-relaxed">
              {hasNews
                ? "Свежие новости уже в кэше. Сейчас Opus напишет по ним 6 постов с ссылками на источники."
                : "Сначала Haiku найдёт 12 свежих AI/IT новостей и отберёт 6 лучших, потом Opus напишет по ним 6 постов с ссылками."}
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
            {state.kind === "error"
              ? "Попробовать ещё раз"
              : hasNews
                ? "Сгенерировать посты"
                : "Запустить генерацию"}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <DotIcon className="text-emerald-500" />
              Haiku 4.5 — новости
            </span>
            <span className="inline-flex items-center gap-1">
              <DotIcon className="text-sky-500" />
              Opus 4.7 — посты
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

function PenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
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
