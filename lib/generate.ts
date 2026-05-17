import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { POSTS_PERSONA_PROMPT, REPLY_PERSONA_PROMPT } from "./persona";
import { readCache, writeCache } from "./generate-cache";
import {
  fetchListTweets,
  getMoscowDayWindow,
  type RawTweet,
} from "./x-api";

export type GeneratedReply = {
  sourceUrl: string;
  source: {
    id: string;
    text: string;
    authorName: string;
    authorHandle: string;
  };
  variants: [string, string, string];
};

export type PostSource = {
  url: string;
  authorHandle: string;
  authorName: string;
  snippet: string;
};

export type GeneratedPost = {
  text: string;
  sources: PostSource[];
};

export const GENERATE_SCHEMA_VERSION = 3;

export type GenerateResult = {
  schemaVersion: number;
  day: string;
  fellBackToYesterday: boolean;
  fetchedCount: number;
  selectedCount: number;
  replies: GeneratedReply[];
  posts: GeneratedPost[];
  generatedAt: string;
  cached: boolean;
};

const X_LIST_ID = "2055761051199922416";
const OPUS_MODEL = "claude-opus-4-7";
const MAX_FETCH = 40;
const REPLY_COUNT = 20;

const SELECTION_SCHEMA = {
  type: "object",
  properties: {
    indices: {
      type: "array",
      items: { type: "integer" },
      description: `0-based indices of the ${REPLY_COUNT} selected tweets`,
    },
  },
  required: ["indices"],
  additionalProperties: false,
} as const;

const REPLIES_SCHEMA = {
  type: "object",
  properties: {
    replies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceIndex: { type: "integer" },
          variants: {
            type: "array",
            items: { type: "string" },
            description: "Exactly 3 reply variants in the persona's voice, each ≤ 280 chars, each using a different hook pattern",
          },
        },
        required: ["sourceIndex", "variants"],
        additionalProperties: false,
      },
    },
  },
  required: ["replies"],
  additionalProperties: false,
} as const;

const POSTS_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The post text (≤ 280 chars).",
          },
          sourceIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "0-based indices of the source tweets this post is reacting to / referencing. Required when the post mentions specific news, tools, names, or events from the context so a non-technical reader can follow the link. Empty array only for pure original takes that don't reference anything specific.",
          },
        },
        required: ["text", "sourceIndices"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
} as const;

function buildTweetCorpus(tweets: RawTweet[]): string {
  return tweets
    .map((t, i) => {
      const stats = `❤️${t.likes} 🔁${t.retweets} 💬${t.replies}`;
      return `[${i}] @${t.authorUsername} (${t.authorName}) ${stats}\n${t.text}`;
    })
    .join("\n\n---\n\n");
}

async function selectTopTweets(
  client: Anthropic,
  tweets: RawTweet[],
  k: number,
): Promise<RawTweet[]> {
  if (tweets.length <= k) return tweets;

  const corpus = buildTweetCorpus(tweets);
  const userPrompt = `Below are ${tweets.length} tweets from a curated tech/AI list (today's batch). Pick the ${k} that are the most newsworthy, interesting, or worth reacting to — prioritize concrete news, product launches, hot takes from notable people, and signal over noise. Skip pure ads, low-effort threads, and engagement-bait.

Return exactly ${k} 0-based indices in the JSON schema. Order doesn't matter.

TWEETS:

${corpus}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 1024,
    output_config: {
      format: { type: "json_schema", schema: SELECTION_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { indices: number[] } | null;
  if (!parsed) throw new Error("Opus selection returned no parsed output");

  const unique = Array.from(new Set(parsed.indices)).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < tweets.length,
  );
  const selected = unique.slice(0, k).map((i) => tweets[i]);

  if (selected.length < k) {
    const seen = new Set(selected.map((t) => t.id));
    for (const t of tweets) {
      if (selected.length >= k) break;
      if (!seen.has(t.id)) selected.push(t);
    }
  }
  return selected;
}

async function generateReplies(
  client: Anthropic,
  tweets: RawTweet[],
): Promise<GeneratedReply[]> {
  const corpus = tweets
    .map((t, i) => `[${i}] @${t.authorUsername}:\n${t.text}`)
    .join("\n\n---\n\n");

  const userPrompt = `Below are ${tweets.length} source tweets. For each tweet, write EXACTLY 3 reply variants in the persona's voice. Each variant must use a DIFFERENT hook pattern, all ≤ 280 chars, in character — direct opinionated responses to the source tweet. Different hooks across variants AND across the batch (don't reuse the same opener back-to-back).

Return JSON conforming to the schema: an array of items, each with sourceIndex and exactly 3 variants.

SOURCE TWEETS:

${corpus}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 16384,
    system: [
      {
        type: "text",
        text: REPLY_PERSONA_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: REPLIES_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as
    | { replies: Array<{ sourceIndex: number; variants: string[] }> }
    | null;
  if (!parsed) throw new Error("Opus reply generation returned no parsed output");

  const byIndex = new Map<number, string[]>();
  for (const r of parsed.replies) {
    if (
      Number.isInteger(r.sourceIndex) &&
      r.sourceIndex >= 0 &&
      r.sourceIndex < tweets.length &&
      Array.isArray(r.variants) &&
      r.variants.length >= 1
    ) {
      byIndex.set(r.sourceIndex, r.variants.slice(0, 3));
    }
  }

  const out: GeneratedReply[] = [];
  for (let i = 0; i < tweets.length; i++) {
    const variants = byIndex.get(i);
    if (!variants || variants.length === 0) continue;
    const padded: [string, string, string] = [
      variants[0],
      variants[1] ?? variants[0],
      variants[2] ?? variants[1] ?? variants[0],
    ];
    const t = tweets[i];
    out.push({
      sourceUrl: t.url,
      source: {
        id: t.id,
        text: t.text,
        authorName: t.authorName,
        authorHandle: t.authorUsername,
      },
      variants: padded,
    });
  }
  return out;
}

async function generatePosts(
  client: Anthropic,
  tweets: RawTweet[],
  dayLabel: string,
): Promise<GeneratedPost[]> {
  const corpus = buildTweetCorpus(tweets);

  const userPrompt = `Today (${dayLabel}) the tech-twitter conversation is about these topics. Use them as situational context — do NOT quote them, do NOT reply to them. Write 6 ORIGINAL standalone posts in your voice riffing on what's in the air today.

Different hook for each of the 6 posts.

For each post, return sourceIndices — the 0-based indices of the source tweets the post is reacting to or referencing. If your post mentions a specific tool, news, launch, person, or event from the context, you MUST attach the matching source index so a non-technical reader can click through to the original news. Pure abstract takes that don't reference anything specific can return [].

TODAY'S CONTEXT:

${corpus}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: POSTS_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: POSTS_PERSONA_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as
    | { posts: Array<{ text: string; sourceIndices: number[] }> }
    | null;
  if (!parsed) throw new Error("Opus post generation returned no parsed output");

  return parsed.posts.slice(0, 6).map((p) => {
    const seen = new Set<number>();
    const sources: PostSource[] = [];
    for (const idx of p.sourceIndices ?? []) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= tweets.length) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      const t = tweets[idx];
      sources.push({
        url: t.url,
        authorHandle: t.authorUsername,
        authorName: t.authorName,
        snippet: t.text.slice(0, 200),
      });
    }
    return { text: p.text, sources };
  });
}

const inflight = new Map<string, Promise<GenerateResult>>();

async function runPipeline(dayLabel: string): Promise<GenerateResult> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) throw new Error("X_BEARER_TOKEN is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  const window = getMoscowDayWindow();
  if (window.label !== dayLabel) {
    throw new Error(`day window drifted mid-run: ${dayLabel} → ${window.label}`);
  }

  const tweets = await fetchListTweets(X_LIST_ID, window, bearer, MAX_FETCH);
  if (tweets.length === 0) {
    const empty: GenerateResult = {
      schemaVersion: GENERATE_SCHEMA_VERSION,
      day: window.label,
      fellBackToYesterday: window.fellBackToYesterday,
      fetchedCount: 0,
      selectedCount: 0,
      replies: [],
      posts: [],
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    await writeCache(empty);
    return empty;
  }

  const client = new Anthropic();

  const selected = await selectTopTweets(client, tweets, REPLY_COUNT);
  const [replies, posts] = await Promise.all([
    generateReplies(client, selected),
    generatePosts(client, selected, window.label),
  ]);

  const result: GenerateResult = {
    schemaVersion: GENERATE_SCHEMA_VERSION,
    day: window.label,
    fellBackToYesterday: window.fellBackToYesterday,
    fetchedCount: tweets.length,
    selectedCount: selected.length,
    replies,
    posts,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
  await writeCache(result);
  return result;
}

export async function generate(options: { force?: boolean } = {}): Promise<GenerateResult> {
  const window = getMoscowDayWindow();
  const dayLabel = window.label;

  if (!options.force) {
    const cached = await readCache(dayLabel);
    if (cached) return { ...cached, cached: true };
  }

  const existing = inflight.get(dayLabel);
  if (existing && !options.force) return existing;

  const pending = runPipeline(dayLabel).finally(() => {
    if (inflight.get(dayLabel) === pending) inflight.delete(dayLabel);
  });
  inflight.set(dayLabel, pending);
  return pending;
}
