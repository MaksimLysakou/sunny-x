import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { POSTS_PERSONA_PROMPT } from "./persona";
import { readJsonCache, writeJsonCache } from "./blob-cache";
import { getMoscowDayWindow } from "./x-api";

export type PostSource = {
  url: string;
  title: string;
  summary: string;
};

export type NewsItem = PostSource;

export type GeneratedPost = {
  text: string;
  sources: PostSource[];
};

export const NEWS_SCHEMA_VERSION = 1;
export const POSTS_SCHEMA_VERSION = 1;

export type NewsCache = {
  schemaVersion: number;
  day: string;
  news: NewsItem[];
  generatedAt: string;
};

export type PostsCache = {
  schemaVersion: number;
  day: string;
  posts: GeneratedPost[];
  generatedAt: string;
};

const HAIKU_MODEL = "claude-haiku-4-5";
const OPUS_MODEL = "claude-opus-4-7";

const NEWS_CANDIDATE_COUNT = 12;
const NEWS_SELECTED_COUNT = 6;
const POSTS_COUNT = 6;

const NEWS_NAMESPACE = "news";
const POSTS_NAMESPACE = "posts";

const NEWS_GATHER_SCHEMA = {
  type: "object",
  properties: {
    news: {
      type: "array",
      description: `Exactly ${NEWS_CANDIDATE_COUNT} distinct real AI/IT news stories from the past 7 days. URLs MUST come from web_search results — never fabricate.`,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Headline of the story." },
          url: {
            type: "string",
            description: "Canonical article URL exactly as in web_search results.",
          },
          summary: {
            type: "string",
            description:
              "1–2 sentence plain-English summary that explains jargon so a non-technical reader can follow (e.g. instead of 'Mojo 0.7 released', write 'Modular released Mojo 0.7, a programming language built for AI/ML workloads').",
          },
        },
        required: ["title", "url", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["news"],
  additionalProperties: false,
} as const;

const NEWS_SELECT_SCHEMA = {
  type: "object",
  properties: {
    indices: {
      type: "array",
      items: { type: "integer" },
      description: `Exactly ${NEWS_SELECTED_COUNT} 0-based indices into the provided candidate news list — the most post-worthy stories.`,
    },
  },
  required: ["indices"],
  additionalProperties: false,
} as const;

const POSTS_WRITE_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              "The post text (≤ 280 chars). When newsIndices is non-empty the matching URL(s) MUST appear inline in this text.",
          },
          newsIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "0-based indices into the provided news list — the stories this post references. REQUIRED whenever the post mentions specific tools, launches, people, or events.",
          },
        },
        required: ["text", "newsIndices"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
} as const;

async function gatherNewsCandidates(
  client: Anthropic,
  dayLabel: string,
): Promise<NewsItem[]> {
  const userPrompt = `Today is ${dayLabel}. Use web_search 3–4 times to find ${NEWS_CANDIDATE_COUNT} of the most newsworthy AI and IT stories from the past 7 days, from real news sources (TechCrunch, The Verge, Ars Technica, Bloomberg, Reuters, official company blogs, Hacker News front page). Cover a mix: model launches, product releases, funding/M&A, infra, dev tooling, notable research, industry drama.

Return exactly ${NEWS_CANDIDATE_COUNT} DISTINCT stories. Headline, URL (exactly as it appears in the search result, never invented), and a 1–2 sentence plain-English summary that explains jargon for a non-technical reader.`;

  const response = await client.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: NEWS_GATHER_SCHEMA },
    },
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 4,
        allowed_callers: ["direct"],
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { news: NewsItem[] } | null;
  if (!parsed) throw new Error("Haiku news gathering returned no parsed output");

  const allowedUrls = new Set<string>();
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") allowedUrls.add(r.url);
      }
    }
  }

  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of parsed.news) {
    if (typeof n.url !== "string") continue;
    if (allowedUrls.size > 0 && !allowedUrls.has(n.url)) continue;
    if (seen.has(n.url)) continue;
    seen.add(n.url);
    out.push(n);
  }
  return out;
}

async function selectBestNews(
  client: Anthropic,
  candidates: NewsItem[],
): Promise<NewsItem[]> {
  if (candidates.length <= NEWS_SELECTED_COUNT) return candidates;

  const corpus = candidates
    .map((n, i) => `[${i}] ${n.title}\n${n.url}\n${n.summary}`)
    .join("\n\n---\n\n");

  const userPrompt = `Below are ${candidates.length} candidate AI/IT news stories. Pick the ${NEWS_SELECTED_COUNT} most worth writing a post about. Prioritize: concrete product launches, model releases, hard numbers, notable announcements, juicy industry drama. Avoid: dry press releases without substance, near-duplicates, weak signal. Aim for topical variety (don't pick 6 model-launch stories).

Return exactly ${NEWS_SELECTED_COUNT} 0-based indices. Order doesn't matter.

CANDIDATES:

${corpus}`;

  const response = await client.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 512,
    output_config: {
      format: { type: "json_schema", schema: NEWS_SELECT_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { indices: number[] } | null;
  if (!parsed) throw new Error("Haiku news selection returned no parsed output");

  const unique = Array.from(new Set(parsed.indices)).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
  );
  const selected = unique.slice(0, NEWS_SELECTED_COUNT).map((i) => candidates[i]);

  if (selected.length < NEWS_SELECTED_COUNT) {
    const taken = new Set(selected.map((n) => n.url));
    for (const c of candidates) {
      if (selected.length >= NEWS_SELECTED_COUNT) break;
      if (!taken.has(c.url)) selected.push(c);
    }
  }
  return selected;
}

async function writePostsFromNews(
  client: Anthropic,
  news: NewsItem[],
): Promise<GeneratedPost[]> {
  if (news.length === 0) return [];

  const corpus = news
    .map((n, i) => `[${i}] ${n.title}\n${n.url}\n${n.summary}`)
    .join("\n\n---\n\n");

  const userPrompt = `Here are ${news.length} AI/IT news stories that matter right now. Write ${POSTS_COUNT} ORIGINAL standalone posts in your voice riffing on them. Different hook for each post. Try to cover most of the news items (one post per story is a good default).

For each post, return newsIndices — the 0-based indices into the news list of the stories that post is reacting to. If the post mentions ANY specific tool, launch, company, person, or event, attaching the index is REQUIRED — readers may be non-technical and need the link.

CRITICAL — inline links: when a post has newsIndices, the source URL(s) MUST appear inline in the post \`text\`, exactly as in news[i].url. Place it naturally — usually at the end on its own line. One URL is the common case; a second only if the post genuinely riffs on two stories.

Character budget: max 280 chars per post. X auto-shortens any URL to 23 chars — count each URL as 23 plus 1 for the leading space/newline. Keep the prose tight.

NEWS:

${corpus}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: POSTS_WRITE_SCHEMA },
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
    | { posts: Array<{ text: string; newsIndices: number[] }> }
    | null;
  if (!parsed) throw new Error("Opus post writing returned no parsed output");

  return parsed.posts.slice(0, POSTS_COUNT).map((p) => {
    const seenIdx = new Set<number>();
    const sources: PostSource[] = [];
    for (const idx of p.newsIndices ?? []) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= news.length) continue;
      if (seenIdx.has(idx)) continue;
      seenIdx.add(idx);
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

const newsInflight = new Map<string, Promise<NewsCache>>();
const postsInflight = new Map<string, Promise<PostsCache>>();

async function runNewsPipeline(dayLabel: string): Promise<NewsCache> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic({ maxRetries: 5 });
  const candidates = await gatherNewsCandidates(client, dayLabel);
  if (candidates.length === 0) {
    throw new Error("No news candidates returned from web_search");
  }
  const selected = await selectBestNews(client, candidates);
  const result: NewsCache = {
    schemaVersion: NEWS_SCHEMA_VERSION,
    day: dayLabel,
    news: selected,
    generatedAt: new Date().toISOString(),
  };
  await writeJsonCache(NEWS_NAMESPACE, dayLabel, result);
  return result;
}

async function runPostsPipeline(
  dayLabel: string,
  news: NewsItem[],
): Promise<PostsCache> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic({ maxRetries: 5 });
  const posts = await writePostsFromNews(client, news);
  const result: PostsCache = {
    schemaVersion: POSTS_SCHEMA_VERSION,
    day: dayLabel,
    posts,
    generatedAt: new Date().toISOString(),
  };
  await writeJsonCache(POSTS_NAMESPACE, dayLabel, result);
  return result;
}

function validateNewsCache(
  parsed: NewsCache | null,
  dayLabel: string,
): NewsCache | null {
  if (!parsed) return null;
  if (parsed.day !== dayLabel) return null;
  if (parsed.schemaVersion !== NEWS_SCHEMA_VERSION) return null;
  return parsed;
}

function validatePostsCache(
  parsed: PostsCache | null,
  dayLabel: string,
): PostsCache | null {
  if (!parsed) return null;
  if (parsed.day !== dayLabel) return null;
  if (parsed.schemaVersion !== POSTS_SCHEMA_VERSION) return null;
  return parsed;
}

export async function readNewsCache(): Promise<NewsCache | null> {
  const day = getMoscowDayWindow().label;
  const raw = await readJsonCache<NewsCache>(NEWS_NAMESPACE, day);
  return validateNewsCache(raw, day);
}

export async function readPostsCache(): Promise<PostsCache | null> {
  const day = getMoscowDayWindow().label;
  const raw = await readJsonCache<PostsCache>(POSTS_NAMESPACE, day);
  return validatePostsCache(raw, day);
}

export async function generateNews(
  options: { force?: boolean } = {},
): Promise<NewsCache> {
  const day = getMoscowDayWindow().label;
  if (!options.force) {
    const cached = await readNewsCache();
    if (cached) return cached;
  }
  const existing = newsInflight.get(day);
  if (existing && !options.force) return existing;
  const pending = runNewsPipeline(day).finally(() => {
    if (newsInflight.get(day) === pending) newsInflight.delete(day);
  });
  newsInflight.set(day, pending);
  return pending;
}

export async function generatePosts(
  options: { force?: boolean } = {},
): Promise<PostsCache> {
  const day = getMoscowDayWindow().label;
  if (!options.force) {
    const cached = await readPostsCache();
    if (cached) return cached;
  }
  const newsResult = await generateNews({ force: false });
  if (newsResult.news.length === 0) {
    throw new Error("News cache is empty — cannot write posts");
  }
  const existing = postsInflight.get(day);
  if (existing && !options.force) return existing;
  const pending = runPostsPipeline(day, newsResult.news).finally(() => {
    if (postsInflight.get(day) === pending) postsInflight.delete(day);
  });
  postsInflight.set(day, pending);
  return pending;
}
