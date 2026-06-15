import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { downloadBriefText, createArticleDoc } from "./google";
import { markdownToStyledHtml } from "./md-format";

// Article generation pipeline (see docs/article-generation-plan.md).
// 7 steps: fetch ТЗ → write → proofread → SEO+hero prompt → hero image →
// format → create Google Doc. Each step is a small function; generateArticle
// runs them in sequence.

const OPUS_MODEL = "claude-opus-4-8";
// Nano Banana Pro first; fall back to the flash image model if it's overloaded.
const IMAGE_MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"];
// Hero is embedded full-resolution but DISPLAYED at this px width via <img
// width> (Google honors it on import) so it fits the page content column
// (~6.3in on a default A4/Letter doc) instead of overflowing.
const HERO_WIDTH_PX = 600;

// 10 reference image URLs for the hero (style + composition guidance).
// Set ARTICLE_HERO_REFERENCES as a comma/newline-separated list; empty is OK
// (the image is then generated from the prompt alone).
const HERO_REFERENCES: string[] = (process.env.ARTICLE_HERO_REFERENCES ?? "")
  .split(/[\n,]/)
  .map((s) => s.trim())
  .filter(Boolean);

export type ArticleInput = { briefUrl: string; keysUrl: string | null };

// Pipeline steps, in order — emitted to the UI as each one starts.
export type StepKey = "fetch" | "write" | "proofread" | "seo" | "image" | "doc";

export type ArticleSeo = {
  url: string;
  metaTitle: string;
  metaDescription: string;
  heroPrompt: string;
};

export type ArticleResult = {
  docUrl: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
  heroImage: string; // base64 data URI
};

const ARTICLE_SYSTEM_PROMPT = `You are a senior SEO content writer. You turn a client brief (ТЗ) into a polished, publication-ready article.

Hard rules:
- Follow the brief EXACTLY: required structure (sections/headings), required length, tone, and any explicit instructions take priority over your own preferences.
- Write in the SAME language as the brief (usually English).
- Weave in the required SEO keys naturally — never keyword-stuff, never break readability.
- Output GitHub-flavored Markdown: a single \`#\` H1 title, \`##\` for sections, \`###\` for sub-sections, normal paragraphs, lists and tables where the brief asks for them.
- No preamble, no meta-commentary, no "here is the article" — output only the article itself.`;

// --- Step 1: fetch ТЗ (and keys) ------------------------------------------

async function fetchBrief(
  input: ArticleInput,
): Promise<{ briefRaw: string; keysRaw: string | null }> {
  const briefRaw = await downloadBriefText(input.briefUrl);
  if (!briefRaw.trim()) {
    throw new Error("ТЗ скачалось пустым — проверь ссылку и доступ.");
  }
  let keysRaw: string | null = null;
  if (input.keysUrl) {
    keysRaw = await downloadBriefText(input.keysUrl);
  }
  return { briefRaw, keysRaw };
}

// --- Step 2: write the article --------------------------------------------

const WRITE_SCHEMA = {
  type: "object",
  properties: {
    markdown: {
      type: "string",
      description:
        "The full article in GitHub-flavored Markdown, strictly following the brief's structure, length and keys.",
    },
  },
  required: ["markdown"],
  additionalProperties: false,
} as const;

async function writeArticle(
  client: Anthropic,
  briefRaw: string,
  keysRaw: string | null,
): Promise<string> {
  const keysBlock = keysRaw
    ? `\n\nSEO KEYS (separate list — use ALL of them naturally):\n${keysRaw}`
    : "";
  const userPrompt = `Write the article strictly according to this brief (ТЗ). Respect its structure, required length, and incorporate every required SEO key (keys may be inside the brief and/or in the separate list below).\n\nBRIEF (ТЗ):\n${briefRaw}${keysBlock}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: WRITE_SCHEMA } },
    system: [
      {
        type: "text",
        text: ARTICLE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { markdown: string } | null;
  if (!parsed?.markdown) throw new Error("Opus (шаг 2) не вернул статью");
  return parsed.markdown;
}

// --- Step 3: proofread + top up keys + check length -----------------------

async function proofreadArticle(
  client: Anthropic,
  draftMd: string,
  briefRaw: string,
  keysRaw: string | null,
): Promise<string> {
  const keysBlock = keysRaw
    ? `\n\nFULL SEO KEYS LIST:\n${keysRaw}`
    : "\n\n(Keys are inside the brief.)";
  const userPrompt = `You are the editor. Here is a draft article, the original brief, and the full keys list. Do a careful editorial pass:
1. Proofread: grammar, flow, clarity, remove fluff and repetition.
2. Keys: the first draft almost always under-uses the required keys — add the MISSING ones from the full list, woven in naturally. Do not keyword-stuff.
3. Length: verify it matches the length required by the brief; expand or trim to hit it.
4. Keep the required structure intact.

Return the corrected full article as Markdown.

BRIEF (ТЗ):\n${briefRaw}${keysBlock}\n\nDRAFT:\n${draftMd}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: WRITE_SCHEMA } },
    system: [
      {
        type: "text",
        text: ARTICLE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as { markdown: string } | null;
  if (!parsed?.markdown) throw new Error("Opus (шаг 3) не вернул статью");
  return parsed.markdown;
}

// --- Step 4: SEO meta + hero image prompt ---------------------------------

const SEO_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description:
        "URL slug: lowercase latin, words separated by hyphens, no spaces, transliterated from the title. e.g. 'kak-vybrat-crm'.",
    },
    metaTitle: {
      type: "string",
      description: "SEO meta title, ≤ 60 chars, in the article's language.",
    },
    metaDescription: {
      type: "string",
      description: "SEO meta description, 140–160 chars, in the article's language.",
    },
    heroPrompt: {
      type: "string",
      description:
        "English image-generation prompt for the hero illustration. The scene MUST include a central character (most likely a robot) and a couple of large planets. Everything else — what the character is doing, the surrounding objects, props and details — MUST reflect and represent THIS article's specific topic. The overall art style MUST be COSMIC / outer-space themed (starfield, nebula, cosmic glow, deep-space atmosphere). Non-realistic, modern, clean illustration. The background MUST be purple/violet. Strictly NO text, letters, words, numbers or logos anywhere in the image.",
    },
  },
  required: ["url", "metaTitle", "metaDescription", "heroPrompt"],
  additionalProperties: false,
} as const;

async function generateSeo(
  client: Anthropic,
  finalMd: string,
): Promise<ArticleSeo> {
  const userPrompt = `Based on this finished article, produce: a URL slug, an SEO meta title, an SEO meta description, and a hero-image prompt.

Hero prompt constraints (strict): the scene MUST feature a central character (most likely a robot) and a couple of large planets. Everything else — what the character is doing, the surrounding objects and details — must reflect what THIS specific article is about. The overall art style must be COSMIC / outer-space themed (starfield, nebula, cosmic glow, deep-space atmosphere). Non-realistic style. The background must be purple/violet. No text, letters, words or numbers of any kind in the image.

ARTICLE:\n${finalMd}`;

  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: SEO_SCHEMA } },
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = response.parsed_output as ArticleSeo | null;
  if (!parsed) throw new Error("Opus (шаг 4) не вернул SEO-данные");
  return parsed;
}

// --- Step 5: hero image via Nano Banana -----------------------------------

async function fetchImageInline(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { inlineData: { mimeType, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

/** Returns a base64 data URI — embedded directly in the Doc (no public host needed). */
async function generateHeroImage(heroPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });

  const refs = (
    await Promise.all(HERO_REFERENCES.map((u) => fetchImageInline(u)))
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const guidance = refs.length
    ? " Use the reference images ONLY as guidance for overall visual style and composition. Create a brand-new original image — do not copy, reproduce, or edit the reference images themselves."
    : "";
  const fullPrompt = `${heroPrompt}${guidance} Do not include any text, letters, words, watermarks, or logos in the image.`;
  const parts = [{ text: fullPrompt }, ...refs];

  // Image models get overloaded (503); retry each model twice before failing,
  // and fall back from Nano Banana Pro to the flash model.
  let lastError: unknown;
  for (const model of IMAGE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
        });
        const out = response.candidates?.[0]?.content?.parts ?? [];
        const imagePart = out.find((p) => p.inlineData?.data);
        if (!imagePart?.inlineData?.data) throw new Error("empty image response");
        // Keep the full-resolution image; display size is constrained by the
        // <img width> in buildDocHtml (Google honors it on import).
        const mimeType = imagePart.inlineData.mimeType ?? "image/jpeg";
        return `data:${mimeType};base64,${imagePart.inlineData.data}`;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Nano Banana не вернул изображение: ${msg}`);
}

// --- Step 6 + 7: format and create the Google Doc -------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const META_P = "font-family:Arial,sans-serif;font-size:11pt;color:#000";

function buildDocHtml(
  seo: ArticleSeo,
  heroImage: string,
  finalMd: string,
): string {
  const body = markdownToStyledHtml(finalMd); // step 6 — fully inline-styled
  const metaLine = (label: string, value: string) =>
    `<p style="${META_P}"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
  const head = [
    metaLine("url", seo.url),
    metaLine("meta title", seo.metaTitle),
    metaLine("meta description", seo.metaDescription),
    `<p><img src="${heroImage}" width="${HERO_WIDTH_PX}" style="width:${HERO_WIDTH_PX}px;max-width:100%;height:auto"></p>`,
  ].join("");
  // No <style> block: Google Docs' importer would let a stylesheet rule (e.g.
  // `* { color:#000 }`) override our inline cell colors. Pure inline styles
  // import faithfully.
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8"></head><body>',
    `${head}${body}`,
    "</body></html>",
  ].join("");
}

// --- Orchestrator ----------------------------------------------------------

export async function generateArticle(
  input: ArticleInput,
  onStep?: (step: StepKey) => void,
): Promise<ArticleResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");

  const client = new Anthropic({ maxRetries: 5 });
  const step = (k: StepKey) => onStep?.(k);

  // 1. fetch ТЗ
  step("fetch");
  const { briefRaw, keysRaw } = await fetchBrief(input);
  // 2. write
  step("write");
  const draftMd = await writeArticle(client, briefRaw, keysRaw);
  // 3. proofread + keys + length
  step("proofread");
  const finalMd = await proofreadArticle(client, draftMd, briefRaw, keysRaw);
  // 4. SEO + hero prompt
  step("seo");
  const seo = await generateSeo(client, finalMd);
  // 5. hero image
  step("image");
  const heroImage = await generateHeroImage(seo.heroPrompt);
  // 6 + 7. format + create Google Doc
  step("doc");
  const html = buildDocHtml(seo, heroImage, finalMd);
  const doc = await createArticleDoc({
    name: seo.metaTitle || seo.url || "Статья",
    html,
    folderId,
  });

  return {
    docUrl: doc.url,
    url: seo.url,
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    heroImage,
  };
}
