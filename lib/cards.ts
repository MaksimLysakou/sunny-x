import "server-only";
import type { Card } from "@/app/types";
import { generate, type GenerateResult } from "./generate";

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
