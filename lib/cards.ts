import "server-only";
import type { Card, PostCard } from "@/app/types";
import { generate, type GenerateResult } from "./generate";
import { readCache } from "./generate-cache";
import type { GeneratedPost } from "./posts";
import { getMoscowDayWindow } from "./x-api";

export function resultToCards(result: GenerateResult): Card[] {
  return result.replies.map((r, i) => ({
    id: `r-${result.day}-${r.source.id ?? i}`,
    mode: "reply" as const,
    original: {
      author: r.source.authorName,
      handle: r.source.authorHandle,
      text: r.source.text,
      tweetUrl: r.sourceUrl,
    },
    replies: r.variants,
  }));
}

export async function getCards(): Promise<Card[]> {
  const result = await generate();
  return resultToCards(result);
}

export async function getCachedCards(): Promise<Card[] | null> {
  const window = getMoscowDayWindow();
  const cached = await readCache(window.label);
  if (!cached) return null;
  return resultToCards(cached);
}

export function postsToCards(posts: GeneratedPost[], day: string): PostCard[] {
  return posts.map((post, i) => ({
    id: `p-${day}-${i}`,
    mode: "post" as const,
    text: post.text,
    sources: post.sources,
  }));
}
