import "server-only";
import type { Card } from "@/app/types";
import { generate, type GenerateResult } from "./generate";
import { readCache } from "./generate-cache";
import { getMoscowDayWindow } from "./x-api";

export function resultToCards(result: GenerateResult): Card[] {
  const cards: Card[] = [];

  result.posts.forEach((post, i) => {
    cards.push({
      id: `p-${result.day}-${i}`,
      mode: "post",
      text: post.text,
      sources: post.sources,
    });
  });

  result.replies.forEach((r, i) => {
    cards.push({
      id: `r-${result.day}-${r.source.id ?? i}`,
      mode: "reply",
      original: {
        author: r.source.authorName,
        handle: r.source.authorHandle,
        text: r.source.text,
        tweetUrl: r.sourceUrl,
      },
      replies: r.variants,
    });
  });

  return cards;
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
