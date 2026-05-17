"use client";

import { useEffect, useRef, useState } from "react";
import type { OriginalPost } from "@/app/types";

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (el?: HTMLElement) => Promise<void>;
        createTweet: (
          id: string,
          el: HTMLElement,
          options?: Record<string, unknown>,
        ) => Promise<HTMLElement | undefined>;
      };
      ready?: (cb: (twttr: NonNullable<Window["twttr"]>) => void) => void;
    };
  }
}

const WIDGETS_SRC = "https://platform.twitter.com/widgets.js";

let widgetsPromise: Promise<typeof window.twttr | undefined> | null = null;

function loadWidgets(): Promise<typeof window.twttr | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  if (window.twttr?.widgets?.createTweet) return Promise.resolve(window.twttr);
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise((resolve) => {
    const finish = () => resolve(window.twttr);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGETS_SRC}"]`,
    );
    if (existing) {
      if (window.twttr?.widgets?.createTweet) {
        finish();
        return;
      }
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => resolve(undefined));
      return;
    }
    const script = document.createElement("script");
    script.src = WIDGETS_SRC;
    script.async = true;
    script.onload = finish;
    script.onerror = () => resolve(undefined);
    document.body.appendChild(script);
  });

  return widgetsPromise;
}

function extractTweetId(url: string): string | null {
  const m = url.match(/status(?:es)?\/(\d+)/);
  return m ? m[1] : null;
}

type Status = "loading" | "ready" | "failed";

export function TweetEmbed({ original }: { original: OriginalPost }) {
  const tweetId = original.tweetUrl ? extractTweetId(original.tweetUrl) : null;

  if (!tweetId) {
    return <TweetFallback original={original} />;
  }

  return <TweetWidget key={tweetId} tweetId={tweetId} original={original} />;
}

function TweetWidget({
  tweetId,
  original,
}: {
  tweetId: string;
  original: OriginalPost;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    loadWidgets().then((twttr) => {
      if (cancelled) return;
      if (!twttr || !ref.current) {
        setStatus("failed");
        return;
      }
      ref.current.innerHTML = "";
      twttr.widgets
        .createTweet(tweetId, ref.current, {
          dnt: true,
          conversation: "none",
          align: "center",
        })
        .then((el) => {
          if (cancelled) return;
          setStatus(el ? "ready" : "failed");
        })
        .catch(() => {
          if (!cancelled) setStatus("failed");
        });
    });

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  if (status === "failed") {
    return <TweetFallback original={original} />;
  }

  return (
    <div className="relative min-h-[120px]">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-[120px] rounded-xl bg-zinc-100 animate-pulse" />
        </div>
      )}
      <div ref={ref} className="tweet-embed-host" />
    </div>
  );
}

export function TweetFallback({ original }: { original: OriginalPost }) {
  const initials = original.author
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-xl border border-zinc-200 p-4 bg-white">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center text-sm font-semibold text-zinc-600">
          {initials}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-zinc-900">
            {original.author}
          </span>
          <span className="text-sm text-zinc-500">@{original.handle}</span>
        </div>
        <svg
          className="ml-auto w-5 h-5 text-zinc-400"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25h6.829l4.713 6.231 5.448-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
        </svg>
      </div>
      <p className="text-zinc-800 whitespace-pre-wrap leading-relaxed">
        {original.text}
      </p>
    </div>
  );
}
