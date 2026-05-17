import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { REPLY_PERSONA_PROMPT } from "./persona";
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

export const GENERATE_SCHEMA_VERSION = 5;

export type GenerateResult = {
  schemaVersion: number;
  day: string;
  fellBackToYesterday: boolean;
  fetchedCount: number;
  selectedCount: number;
  replies: GeneratedReply[];
  generatedAt: string;
  cached: boolean;
};

const X_LIST_ID = "2055761051199922416";
const OPUS_MODEL = "claude-opus-4-7";
const HAIKU_MODEL = "claude-haiku-4-5";
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
    model: HAIKU_MODEL,
    max_tokens: 1024,
    output_config: {
      format: { type: "json_schema", schema: SELECTION_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { indices: number[] } | null;
  if (!parsed) throw new Error("Haiku selection returned no parsed output");

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
    max_tokens: 8192,
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
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    await writeCache(empty);
    return empty;
  }

  const client = new Anthropic({ maxRetries: 5 });

  const selected = await selectTopTweets(client, tweets, REPLY_COUNT);
  const replies = await generateReplies(client, selected);

  const result: GenerateResult = {
    schemaVersion: GENERATE_SCHEMA_VERSION,
    day: window.label,
    fellBackToYesterday: window.fellBackToYesterday,
    fetchedCount: tweets.length,
    selectedCount: selected.length,
    replies,
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
