// Hero/SEO prompt building for the article pipeline, kept in its own module
// (no server-only deps) so it can be reused/tested in isolation — iterate on
// the hero/SEO prompts here.

// Descriptions written by looking at the first 3 reference images — they pin
// down the target look so the model can't drift into a scary/realistic robot.
// Used both as the synthesized STYLE_GUIDE and as concrete style examples.
export const REF_STYLE_EXAMPLES = [
  "A cute friendly little robot with a rounded glossy white-and-silver body and big glowing blue eyes, happily typing on a laptop that shows colourful code, next to a stack of dark server blocks; a large purple planet and a small ringed planet float in the background among streams of glowing binary code; deep violet cosmic background with soft glow; soft polished 3D-rendered wholesome cartoon style.",
  "A cute cartoon astronaut mascot floating with arms spread wide, surrounded by a playful miniature solar system — a smiling sun, small colourful orbiting planets and a glowing comet — standing on a softly glowing cyan platform; dark navy-purple starry space background; adorable glossy illustration with vibrant colours and gentle glows.",
  "A cute friendly robot with a rounded white body and big glowing purple eyes, floating with its hands together, surrounded by holographic UI panels, data dashboards and charts, glowing network constellation lines and streams of binary code, a small pink planet in the upper right; blue-to-violet gradient tech background with glowing nodes; soft glossy 3D-rendered wholesome style.",
];

// Synthesized house style shared by the references.
export const STYLE_GUIDE =
  "Cute, friendly, wholesome cartoon-mascot style. The centerpiece is a small adorable robot with a smooth rounded glossy white/silver body and big glowing eyes, cheerful and charming. Around it float a few small colourful planets, comets and stars, plus playful digital/tech elements: glowing holographic UI panels, charts, network constellation lines and nodes, and streams of binary code (0s and 1s). Deep purple-violet-to-blue cosmic background with soft cyan glows, bokeh and vibrant accent colours. Soft, glossy, polished 3D-rendered look. Mood is cute, modern, optimistic and techy — NEVER scary, aggressive, dark, realistic or menacing; no lightning, no humanoid terminators.";

export const SEO_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description:
        "URL slug. If the brief (ТЗ) specifies a URL/slug, use it EXACTLY. Otherwise: lowercase latin, words separated by hyphens, no spaces, transliterated from the title. e.g. 'kak-vybrat-crm'.",
    },
    metaTitle: {
      type: "string",
      description:
        "SEO meta title. Follow the brief (ТЗ) FIRST: if it gives an exact meta title, use it verbatim; if it specifies required keywords, length, or a title formula, follow them. Only fall back to deriving from the article when the brief says nothing. Default length ≤ 60 chars, in the article's language.",
    },
    metaDescription: {
      type: "string",
      description:
        "SEO meta description. Follow the brief (ТЗ) FIRST: if it gives an exact meta description, use it verbatim; if it specifies required keywords or length, follow them. Only fall back to deriving from the article when the brief says nothing. Default length 140–160 chars, in the article's language.",
    },
    heroPrompt: {
      type: "string",
      description:
        "A SHORT list of just 2–4 KEY topic-specific objects a cute robot mascot should be interacting with, so the hero is relevant to THIS article — the few most iconic props/devices/symbols for the article's subject, meant to be drawn LARGE and bold. Pick few, big, recognizable items — NOT a long busy list of tiny icons. Do NOT describe art style, colours, medium, the robot itself, planets or the background (those are fixed by the house style). Do NOT include any people or humans. No text, letters, words, numbers or logos.",
    },
  },
  required: ["url", "metaTitle", "metaDescription", "heroPrompt"],
  additionalProperties: false,
} as const;

export function buildSeoUserPrompt(finalMd: string, briefRaw: string): string {
  return `Produce: a URL slug, an SEO meta title, an SEO meta description, and a hero-image subject description.

The URL, meta title and meta description MUST follow the brief (ТЗ) first — if the brief specifies an exact URL/title/description, required keywords, or length limits, obey them; only derive from the article when the brief is silent. The hero-image subject is based on the article's topic.

The hero image always shows a cute robot mascot in a fixed house style; your job is ONLY to choose just 2–4 KEY topic-specific objects the robot interacts with so the image fits THIS article — the few most iconic items, meant to be drawn LARGE and bold (not a long list of tiny icons). Do NOT mention art style, colours, medium, the robot, planets or background — those are fixed. NO people or humans. No text, letters, words or numbers in the image.

BRIEF (ТЗ):\n${briefRaw}

ARTICLE:\n${finalMd}`;
}

/**
 * The text instruction sent to the image model alongside the reference images.
 * Leads with the house STYLE_GUIDE + concrete examples (so the cute look is
 * explicit in words too), then drops the article subject into that style.
 */
export function buildHeroImagePrompt(heroSubject: string, refCount: number): string {
  const refLine = refCount
    ? ` It MUST closely match the ${refCount} attached reference images — same set, same vibe.`
    : "";
  return `Create a brand-new original hero image in this exact house style.${refLine}

STYLE: ${STYLE_GUIDE}

Style examples to match:
1) ${REF_STYLE_EXAMPLES[0]}
2) ${REF_STYLE_EXAMPLES[1]}
3) ${REF_STYLE_EXAMPLES[2]}

For THIS image, keep the cute robot mascot LARGE and prominent as the centerpiece, with these few KEY elements drawn BIG and bold around it: ${heroSubject}

Composition: bold, large, clearly readable details with a clean uncluttered layout and generous spacing. A LARGE robot plus a few BIG elements — do NOT scatter many tiny icons or fill the frame with small busy details.

Do not copy any single reference directly. Do NOT depict any realistic people or humans. Do not include any text, letters, words, numbers, watermarks, or logos in the image.`;
}

export const HERO_REF_LABEL = "Reference images — copy this cute style:";

// Reference-image set(s) (0-based indexes into ARTICLE_HERO_REFERENCES).
// One hero is generated per set. Locked to set B (robot mascots + character-less
// space/digital scenes, no people) — the chosen style direction.
export const REF_SETS: { label: string; indexes: number[] }[] = [
  { label: "hero", indexes: [0, 1, 2, 4, 6, 9] },
];
