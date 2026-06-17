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

// Shared cosmic house style — the character clause is added per-kind below, so
// this describes only the look/scene (not who is in it).
export const COSMIC_STYLE =
  "Soft, glossy, polished 3D-rendered cartoon style. Deep purple-violet-to-blue cosmic background with soft cyan glows, bokeh, a few big colourful planets, comets and stars, plus playful digital/tech accents (glowing holographic panels, charts, network nodes, streams of binary code). Mood: cute, modern, optimistic and techy — NEVER scary, dark, realistic-gritty or menacing. Bold, large, clearly readable details with a clean uncluttered layout and generous spacing — a few BIG elements, not many tiny icons.";

// The three hero variants we generate per article.
export type HeroKind = "mascot" | "objects" | "people";
export const HERO_KINDS: { key: HeroKind; label: string }[] = [
  { key: "mascot", label: "Mascot" },
  { key: "objects", label: "Objects only" },
  { key: "people", label: "People + objects" },
];

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
    hero: {
      type: "object",
      description:
        "Three hero-image subject descriptions for THIS article, one per composition kind. For each: pick just 2–4 KEY topic-specific elements drawn LARGE and bold (not a long list of tiny icons). Do NOT describe art style, colours, medium, planets or background — those are fixed by the house style.",
      properties: {
        mascot: {
          type: "string",
          description:
            "MASCOT variant: the 2–4 KEY topic objects/elements a cute cosmic mascot is interacting with. No humans. No text.",
        },
        objects: {
          type: "string",
          description:
            "OBJECTS-ONLY variant: the 2–4 KEY topic objects / composition to depict with NO character and NO people — just the iconic props/devices/symbols of the article. No text.",
        },
        people: {
          type: "string",
          description:
            "PEOPLE variant: what stylized people are doing related to the article, plus the 2–4 KEY topic objects around them. No text.",
        },
      },
      required: ["mascot", "objects", "people"],
      additionalProperties: false,
    },
  },
  required: ["url", "metaTitle", "metaDescription", "hero"],
  additionalProperties: false,
} as const;

export function buildSeoUserPrompt(finalMd: string, briefRaw: string): string {
  return `Produce: a URL slug, an SEO meta title, an SEO meta description, and THREE hero-image subjects (one per composition kind).

The URL, meta title and meta description MUST follow the brief (ТЗ) first — if the brief specifies an exact URL/title/description, required keywords, or length limits, obey them; only derive from the article when the brief is silent.

The hero images share a fixed cosmic house style; your only job for the hero is to choose the topic-specific elements for each of three variants, tailored to THIS article:
- mascot: 2–4 KEY topic objects a cute cosmic mascot interacts with (no humans).
- objects: the 2–4 KEY topic objects / composition with NO character and NO people.
- people: what stylized people are doing related to the article, plus the 2–4 KEY topic objects.
For all three: few, big, iconic elements (not a long list of tiny icons). Do NOT mention art style, colours, medium, planets or background — those are fixed. No text, letters, words or numbers in the image.

BRIEF (ТЗ):\n${briefRaw}

ARTICLE:\n${finalMd}`;
}

// Per-kind framing — what (if any) character is in the scene, around the
// article-specific subject. References always set the STYLE (not the character).
const KIND_FRAMING: Record<HeroKind, (subject: string) => string> = {
  mascot: (s) =>
    `Centerpiece: a cute friendly cosmic MASCOT — a little robot OR another charming space character (e.g. a tiny astronaut, alien or creature) — drawn LARGE and prominent, interacting with these few BIG elements: ${s}. Do NOT include any realistic humans.`,
  objects: (s) =>
    `NO character at all — no mascot, no robot, no people. Depict only these few BIG, bold objects / composition: ${s}, arranged cleanly in the cosmic scene with planets and stars.`,
  people: (s) =>
    `Feature stylized PEOPLE (humans) as the focus, interacting with these few BIG elements: ${s}. People are encouraged here; do NOT use a robot mascot.`,
};

/**
 * Build the text instruction sent to the image model alongside the reference
 * images. The references set the STYLE for every kind; the per-kind framing
 * decides who/what is in the scene around the article subject.
 */
export function buildHeroImagePrompt(
  kind: HeroKind,
  subject: string,
  refCount: number,
): string {
  const refLine = refCount
    ? ` Match the visual STYLE of the ${refCount} attached reference images (rendering, colours, glow, cosmic vibe) — use them ONLY for the look, NOT for which character appears.`
    : "";
  return `Create a brand-new original hero image.${refLine}

STYLE: ${COSMIC_STYLE}

Style examples (for the LOOK only, not the character):
1) ${REF_STYLE_EXAMPLES[0]}
2) ${REF_STYLE_EXAMPLES[1]}
3) ${REF_STYLE_EXAMPLES[2]}

${KIND_FRAMING[kind](subject)}

Composition: bold, large, clearly readable details, clean uncluttered layout, generous spacing — a few BIG elements, not many tiny icons. Do not copy any single reference directly. Do not include any text, letters, words, numbers, watermarks, or logos in the image.`;
}

export const HERO_REF_LABEL = "Reference images — copy this cute style:";

// Reference-image set(s) (0-based indexes into ARTICLE_HERO_REFERENCES).
// One hero is generated per set. Locked to set B (robot mascots + character-less
// space/digital scenes, no people) — the chosen style direction.
export const REF_SETS: { label: string; indexes: number[] }[] = [
  { label: "hero", indexes: [0, 1, 2, 4, 6, 9] },
];
