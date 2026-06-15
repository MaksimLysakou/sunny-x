"use client";

import { useState } from "react";

const GDOCS_RE = /docs\.google\.com\/document\//i;

export function ArticleForm() {
  const [brief, setBrief] = useState("");
  const [hasKeys, setHasKeys] = useState(false);
  const [keys, setKeys] = useState("");

  const briefValid = GDOCS_RE.test(brief.trim());
  const keysValid = !hasKeys || GDOCS_RE.test(keys.trim());
  const canSubmit = briefValid && keysValid;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // TODO: подключить генерацию статьи
    console.log("article", {
      brief: brief.trim(),
      keys: hasKeys ? keys.trim() : null,
    });
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

      <form
        onSubmit={onSubmit}
        className="w-full rounded-2xl bg-white border border-zinc-200 shadow-sm p-6 sm:p-8 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="brief"
            className="text-sm font-medium text-zinc-800"
          >
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
            Google Docs документ с техническим заданием.
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
              <label
                htmlFor="keys"
                className="text-sm font-medium text-zinc-800"
              >
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

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white px-6 py-3 font-semibold shadow-sm transition-colors"
        >
          <SparkIcon />
          Написать статью
        </button>
      </form>
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
