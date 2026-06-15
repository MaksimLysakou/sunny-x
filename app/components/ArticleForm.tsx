"use client";

import { useEffect, useState } from "react";

const GDOCS_RE = /docs\.google\.com\/(document|spreadsheets)\//i;

const STAGES = [
  "Скачиваю ТЗ",
  "Пишу статью по ТЗ",
  "Вычитываю и добавляю ключи",
  "Готовлю SEO и промпт картинки",
  "Рисую hero-картинку",
  "Форматирую и собираю Google Docs",
];
const STAGE_MS = 25000;

type ArticleResult = {
  docUrl: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
  heroImage: string;
};

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ArticleResult }
  | { kind: "error"; message: string };

export function ArticleForm() {
  const [brief, setBrief] = useState("");
  const [hasKeys, setHasKeys] = useState(false);
  const [keys, setKeys] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const briefValid = GDOCS_RE.test(brief.trim());
  const keysValid = !hasKeys || GDOCS_RE.test(keys.trim());
  const canSubmit = briefValid && keysValid;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefUrl: brief.trim(),
          keysUrl: hasKeys ? keys.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setState({ kind: "done", result: data as ArticleResult });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <section className="w-full flex flex-col items-center text-center gap-2">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <ArticleIcon />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Написать статью</h2>
        <p className="text-sm text-zinc-600 max-w-md leading-relaxed">
          Конвертируем ТЗшку в красивую статью с ключами, hero картинкой и текстом
          постов.
        </p>
      </section>

      {state.kind === "running" ? (
        <ArticleProgress />
      ) : state.kind === "done" ? (
        <ResultCard result={state.result} onReset={() => setState({ kind: "idle" })} />
      ) : (
        <form
          onSubmit={onSubmit}
          className="w-full rounded-2xl bg-white border border-zinc-200 shadow-sm p-6 sm:p-8 flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="brief" className="text-sm font-medium text-zinc-800">
              Ссылка на ТЗ
            </label>
            <input
              id="brief"
              type="url"
              inputMode="url"
              placeholder="https://docs.google.com/document/d/..."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />
            <p className="text-xs text-zinc-400">
              Google Docs или Sheets с техническим заданием.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasKeys}
                onChange={(e) => setHasKeys(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-amber-600 accent-amber-600 cursor-pointer"
              />
              <span className="text-sm text-zinc-800">
                Ключи лежат в отдельном Google Docs
              </span>
            </label>

            {hasKeys && (
              <div className="flex flex-col gap-2 pl-7">
                <label htmlFor="keys" className="text-sm font-medium text-zinc-800">
                  Ссылка на ключи
                </label>
                <input
                  id="keys"
                  type="url"
                  inputMode="url"
                  placeholder="https://docs.google.com/document/d/..."
                  value={keys}
                  onChange={(e) => setKeys(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                />
              </div>
            )}
          </div>

          {state.kind === "error" && (
            <div className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap text-left">
              {state.message}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white px-6 py-3 font-semibold shadow-sm transition-colors"
          >
            <SparkIcon />
            {state.kind === "error" ? "Попробовать ещё раз" : "Написать статью"}
          </button>
        </form>
      )}
    </div>
  );
}

function ArticleProgress() {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const stageTimer = window.setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, STAGE_MS);
    const tickTimer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="w-full rounded-2xl bg-white border border-zinc-200 shadow-sm p-8 flex flex-col items-center gap-6 text-center">
      <Spinner />
      <div className="flex flex-col gap-1">
        <div className="text-base font-medium text-zinc-800">
          {STAGES[stage]}…
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          {mm}:{ss}
        </div>
      </div>
      <ol className="w-full max-w-xs flex flex-col gap-1.5 text-left">
        {STAGES.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 text-xs ${
              i < stage
                ? "text-zinc-400"
                : i === stage
                  ? "text-zinc-800 font-medium"
                  : "text-zinc-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                i < stage
                  ? "bg-emerald-400"
                  : i === stage
                    ? "bg-amber-500"
                    : "bg-zinc-200"
              }`}
            />
            {label}
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
        Три прохода Opus 4.8 + генерация картинки + сборка документа. Обычно 1.5–3
        минуты.
      </p>
    </div>
  );
}

function ResultCard({
  result,
  onReset,
}: {
  result: ArticleResult;
  onReset: () => void;
}) {
  return (
    <div className="w-full rounded-2xl bg-white border border-zinc-200 shadow-sm p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckIcon />
        <span className="font-semibold">Статья готова</span>
      </div>

      <div className="flex flex-col gap-3">
        {result.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.heroImage}
            alt="Hero"
            className="w-full rounded-xl border border-zinc-200"
          />
        )}
        <div className="flex flex-col gap-1 text-sm">
          <Meta label="URL" value={result.url} />
          <Meta label="Meta title" value={result.metaTitle} />
          <Meta label="Meta description" value={result.metaDescription} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={result.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 font-semibold shadow-sm transition-colors"
        >
          Открыть в Google Docs
        </a>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-50 px-6 py-3 font-medium transition-colors"
        >
          Ещё одну
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-zinc-400 shrink-0">{label}:</span>
      <span className="text-zinc-800 break-words">{value}</span>
    </div>
  );
}

function ArticleIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="11" y2="9" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2zm6 11l.9 2.6L21.5 16l-2.6.9L18 19.5l-.9-2.6L14.5 16l2.6-.9L18 13z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-10 h-10 text-zinc-900 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
