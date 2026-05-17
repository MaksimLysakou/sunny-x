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
  title: string;
  summary: string;
};

export type GeneratedPost = {
  text: string;
  sources: PostSource[];
};

export const GENERATE_SCHEMA_VERSION = 4;

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
    news: {
      type: "array",
      description:
        "The pool of real news stories you found via web_search and used as context. URLs MUST come directly from search results — never fabricate URLs.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Headline of the news story." },
          url: {
            type: "string",
            description: "Canonical article URL from the web_search results.",
          },
          summary: {
            type: "string",
            description:
              "1–2 sentence plain-English summary a non-technical reader can understand. Explain jargon (e.g. don't just say 'new LLM language' — say 'a new programming language built specifically for LLMs').",
          },
        },
        required: ["title", "url", "summary"],
        additionalProperties: false,
      },
    },
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The post text (≤ 280 chars).",
          },
          newsIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "0-based indices into the `news` array — the stories this post is reacting to. REQUIRED whenever the post mentions specific tools, launches, people, or events so a non-technical reader can click through. Use [] only for pure abstract takes.",
          },
        },
        required: ["text", "newsIndices"],
        additionalProperties: false,
      },
    },
  },
  required: ["news", "posts"],
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
  dayLabel: string,
): Promise<GeneratedPost[]> {
  const userPrompt = `Today is ${dayLabel}. Use the web_search tool 4–8 times to find the most newsworthy AI and IT stories from the last 24–72 hours from real news sources (TechCrunch, The Verge, Ars Technica, Bloomberg, Reuters, official company blogs, Hacker News front page, etc. — NOT random twitter takes). Cover a mix: model launches, product releases, funding/M&A, infra news, dev tooling, notable research, industry drama.

Then write 6 ORIGINAL standalone posts in your voice riffing on what's actually happening today. Different hook for each post.

For each post, return newsIndices — the 0-based indices into your \`news\` array of the stories that post is reacting to. If the post mentions ANY specific tool, launch, company, person, or event, attaching the index is REQUIRED — readers may be non-technical and need the link to follow what you mean. Pure abstract opinions with no specific reference can return [].

CRITICAL — inline links: when a post has newsIndices, the source URL(s) MUST appear inline in the post \`text\`, exactly as they appear in \`news[i].url\`. The URL is what readers click on X. Place it naturally: usually at the end on its own line, or mid-sentence ("X just shipped Y https://… — wild"). One URL is the common case; a second only if the post genuinely riffs on two stories. Don't add a URL unless its index is in newsIndices, and don't add an index without putting its URL in the text.

Character budget: max 280 chars per post. X auto-shortens any URL to 23 chars — count each URL as 23 regardless of real length, plus 1 for the space/newline before it. Keep the prose tight so the link fits.

In each news \`summary\`, explain the story in 1–2 plain-English sentences a layperson would get. Don't just echo a jargon headline — unpack it (e.g. instead of "Mojo 0.7 released", write "Modular released Mojo 0.7, a programming language built specifically for AI/ML workloads that compiles to fast machine code").

All URLs in \`news\` MUST come directly from your web_search results — do not invent or guess URLs.`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 8192,
    output_config: {
      format: { type: "json_schema", schema: POSTS_SCHEMA },
    },
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 8,
      },
    ],
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
    | {
        news: Array<{ title: string; url: string; summary: string }>;
        posts: Array<{ text: string; newsIndices: number[] }>;
      }
    | null;
  if (!parsed) throw new Error("Opus post generation returned no parsed output");

  const allowedUrls = new Set<string>();
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") allowedUrls.add(r.url);
      }
    }
  }

  const news = parsed.news.filter(
    (n) => typeof n.url === "string" && (allowedUrls.size === 0 || allowedUrls.has(n.url)),
  );

  return parsed.posts.slice(0, 6).map((p) => {
    const seen = new Set<number>();
    const sources: PostSource[] = [];
    for (const idx of p.newsIndices ?? []) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= news.length) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      const n = news[idx];
      sources.push({ url: n.url, title: n.title, summary: n.summary });
    }
    let text = p.text;
    if (sources.length > 0 && !sources.some((s) => text.includes(s.url))) {
      text = `${text.trimEnd()}\n\n${sources[0].url}`;
    }
    return { text, sources };
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
    generatePosts(client, window.label),
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
