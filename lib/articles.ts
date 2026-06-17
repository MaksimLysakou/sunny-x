import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { downloadBriefText, createArticleDoc } from "./google";
import { markdownToStyledHtml } from "./md-format";
import {
  SEO_SCHEMA,
  buildSeoUserPrompt,
  buildHeroImagePrompt,
  HERO_REF_LABEL,
  REF_SETS,
} from "./article-prompts";
import { CLUTCH_REVIEWS, CLUTCH_REVIEWS_URL } from "./clutch-reviews";
import { CASE_STUDIES } from "./case-studies";

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
  heroImages: HeroVariant[]; // one per reference set
};

const ARTICLE_SYSTEM_PROMPT = `You are a senior SEO content writer. You turn a client brief (ТЗ) into a polished, publication-ready article.

Hard rules:
- Follow the brief EXACTLY: required structure (sections/headings), required length, tone, and any explicit instructions take priority over your own preferences.
- EXAMPLES IN THE BRIEF ARE ILLUSTRATIVE ONLY. Any sample sentences, example copy, demo paragraphs, placeholder text or sample wording in the ТЗ are there to show intent, tone and format — NEVER copy them word-for-word or near-verbatim. Always write fresh, original content in your own words; treat every example strictly as guidance, not as text to reuse.
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

const WANTS_CASE_STUDIES_RE = /case[\s-]?stud|кейс/i;
const WANTS_REVIEWS_RE = /review|testimonial|отзыв/i;

function buildCaseStudiesBlock(): string {
  const list = CASE_STUDIES.map((c) => `- ${c.title}: ${c.url}`).join("\n");
  return `\n\nCASE STUDIES: The brief asks for case studies. Pick the 1–3 from Fively's REAL case-study catalog below whose topic best matches THIS article, mention each by name, and link to its EXACT URL as a markdown link. NEVER use a case-study URL that is not in this list, and never invent case studies or links.\n\nFIVELY CASE STUDIES (title: url):\n${list}`;
}

function buildReviewsBlock(): string {
  const list = CLUTCH_REVIEWS.map(
    (r) => `- "${r.quote}" — ${r.role}, ${r.company} (${r.context})`,
  ).join("\n");
  return `\n\nREVIEWS / TESTIMONIALS: The brief asks for reviews/testimonials. Use ONLY the real Fively client reviews below (verified on Clutch). Pick the 1–3 most relevant to THIS article's topic, quote them VERBATIM, and attribute each to its real role and company. You may cite the source as ${CLUTCH_REVIEWS_URL}. NEVER invent reviews, quotes, names, or companies, and never alter a quote's wording.\n\nREAL FIVELY CLUTCH REVIEWS:\n${list}`;
}

async function writeArticle(
  client: Anthropic,
  briefRaw: string,
  keysRaw: string | null,
): Promise<string> {
  const keysBlock = keysRaw
    ? `\n\nSEO KEYS (separate list — use ALL of them naturally):\n${keysRaw}`
    : "";

  // Inject our hardcoded real datasets when the brief asks for them, so the
  // model picks topic-matched real cases/reviews and links them — no invented
  // 404 URLs or fake quotes. Both are local snapshots (case studies and Clutch
  // reviews rarely change); re-snapshot the dataset files to refresh.
  const caseStudiesBlock = WANTS_CASE_STUDIES_RE.test(`${briefRaw}\n${keysRaw ?? ""}`)
    ? buildCaseStudiesBlock()
    : "";
  const reviewsBlock = WANTS_REVIEWS_RE.test(`${briefRaw}\n${keysRaw ?? ""}`)
    ? buildReviewsBlock()
    : "";

  const userPrompt = `Write the article strictly according to this brief (ТЗ). Respect its structure, required length, and incorporate every required SEO key (keys may be inside the brief and/or in the separate list below).\n\nBRIEF (ТЗ):\n${briefRaw}${keysBlock}${caseStudiesBlock}${reviewsBlock}`;

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
5. No copied examples: find any sentence or phrase that was lifted word-for-word (or nearly) from the brief's example/sample copy and REWRITE it in fresh, original wording. Examples in the brief are illustrative only.

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

async function generateSeo(
  client: Anthropic,
  finalMd: string,
  briefRaw: string,
): Promise<ArticleSeo> {
  const response = await client.messages.parse({
    model: OPUS_MODEL,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: SEO_SCHEMA } },
    messages: [{ role: "user", content: buildSeoUserPrompt(finalMd, briefRaw) }],
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

type InlineRef = { inlineData: { mimeType: string; data: string } };
export type HeroVariant = { label: string; image: string };

/** One generation attempt with retry + model fallback. Returns a data URI or null. */
async function tryGenerateImage(
  ai: GoogleGenAI,
  parts: ({ text: string } | InlineRef)[],
): Promise<string | null> {
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
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  return null;
}

/**
 * Generate one hero per reference set (REF_SETS) so the doc offers a choice.
 * Same subject prompt, different reference images. Runs in parallel.
 */
async function generateHeroImages(heroSubject: string): Promise<HeroVariant[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });

  // Fetch every reference once, index-aligned with HERO_REFERENCES.
  const allRefs = await Promise.all(HERO_REFERENCES.map((u) => fetchImageInline(u)));

  const variants = await Promise.all(
    REF_SETS.map(async (set) => {
      const refs = set.indexes
        .map((i) => allRefs[i])
        .filter((r): r is InlineRef => r !== null);
      const parts = [
        { text: buildHeroImagePrompt(heroSubject, refs.length) },
        ...(refs.length ? [{ text: HERO_REF_LABEL }] : []),
        ...refs,
      ];
      const image = await tryGenerateImage(ai, parts);
      return image ? { label: set.label, image } : null;
    }),
  );

  const ok = variants.filter((v): v is HeroVariant => v !== null);
  if (ok.length === 0) {
    throw new Error("Nano Banana не вернул ни одного изображения");
  }
  return ok;
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
  heroImages: HeroVariant[],
  finalMd: string,
): string {
  const body = markdownToStyledHtml(finalMd); // step 6 — fully inline-styled
  const metaLine = (label: string, value: string) =>
    `<p style="${META_P}"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
  const single = heroImages.length === 1;
  const heroBlock = heroImages
    .map(
      (h) =>
        (single ? "" : `<p style="${META_P}"><strong>${escapeHtml(h.label)}</strong></p>`) +
        `<p><img src="${h.image}" width="${HERO_WIDTH_PX}" style="width:${HERO_WIDTH_PX}px;max-width:100%;height:auto"></p>`,
    )
    .join("");
  const head = [
    metaLine("url", seo.url),
    metaLine("meta title", seo.metaTitle),
    metaLine("meta description", seo.metaDescription),
    heroBlock,
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
  const seo = await generateSeo(client, finalMd, briefRaw);
  // 5. hero images (one per reference set — a choice in the final doc)
  step("image");
  const heroImages = await generateHeroImages(seo.heroPrompt);
  // 6 + 7. format + create Google Doc
  step("doc");
  const html = buildDocHtml(seo, heroImages, finalMd);
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
    heroImages,
  };
}
