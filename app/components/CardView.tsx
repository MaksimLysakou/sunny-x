"use client";

import { useState } from "react";
import type { Card } from "@/app/types";
import { TweetEmbed } from "./TweetEmbed";

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ReplyOption({ text, index }: { text: string; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <span className="text-xs font-mono text-zinc-400 mt-0.5 select-none">
        {index + 1}
      </span>
      <p className="flex-1 text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy reply"}
        title={copied ? "Copied" : "Copy"}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 transition-colors"
      >
        <CopyIcon copied={copied} />
      </button>
    </div>
  );
}

export function CardView({ card }: { card: Card }) {
  if (card.mode === "post") {
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          New post
        </div>
        <p className="text-xl leading-relaxed text-zinc-900 whitespace-pre-wrap">
          <LinkifiedText text={card.text} />
        </p>
        {card.sources.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
              References
            </div>
            <ul className="flex flex-col gap-2">
              {card.sources.map((src) => {
                let host = "";
                try {
                  host = new URL(src.url).hostname.replace(/^www\./, "");
                } catch {
                  host = "";
                }
                return (
                  <li
                    key={src.url}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="text-sm font-semibold text-zinc-900 group-hover:underline mb-1">
                        {src.title}
                      </div>
                      {host && (
                        <div className="text-xs text-zinc-500 mb-1">{host}</div>
                      )}
                      <p className="text-sm text-zinc-700 line-clamp-3">
                        {src.summary}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full md:flex-row md:gap-6 md:items-stretch">
      <div className="flex flex-col gap-3 md:w-1/2 md:min-w-0">
        <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          Reply to
        </div>
        <div className="md:overflow-y-auto md:flex-1 md:pr-1">
          <TweetEmbed original={card.original} />
        </div>
      </div>
      <div className="flex flex-col gap-2 md:w-1/2 md:min-w-0">
        <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          Variants
        </div>
        <div className="flex flex-col gap-2 md:overflow-y-auto md:flex-1 md:pr-1">
          {card.replies.map((reply, i) => (
            <ReplyOption key={i} text={reply} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
