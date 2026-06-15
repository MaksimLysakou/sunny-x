// Markdown → styled HTML formatter, ported from ../sunny-md-formatter.
//
// The point of this module is to turn plain markdown into HTML that, when
// dropped into Google Docs (or Word), carries the right styles: an Arial body
// at document point sizes, a centered MsoTitle for the first H1, Google-Docs
// blue links, themed tables, etc. The same `.doc-theme` rules the formatter
// renders in its live preview are exported here as DOC_THEME_CSS so the output
// is self-contained.
//
// Two directions:
//   markdownToStyledHtml / markdownToStyledDocument  — md  → styled HTML
//   htmlToMarkdown                                    — pasted Docs/Word HTML → md

import MarkdownIt from "markdown-it";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Google Docs' HTML import ignores CSS pseudo-class selectors (td:first-child,
// thead th, …), so a <style> block can't style tables correctly. Instead we
// INLINE every style onto the element — which is what the browser clipboard
// effectively does, and what makes the import look like the formatter preview.
// Values mirror the `.doc-theme` "final priority" rules in DOC_THEME_CSS.
const S = {
  // first <h1> → Word/Docs "Title" paragraph
  title:
    "mso-style-name:Title;font-family:Arial,sans-serif;font-size:26pt;line-height:1.3;color:#000;text-align:center;font-weight:normal",
  h2: "font-family:Arial,sans-serif;font-size:16pt;line-height:1.4;color:#000;font-weight:normal",
  h3: "font-family:Arial,sans-serif;font-size:14pt;line-height:1.4;color:#000;font-weight:normal",
  para: "font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000",
  list:
    "font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000;padding-left:1.5em",
  link: "color:#1155cc",
  blockquote:
    "margin:0 0 1em;padding:0 1.5em;border-left:3px solid #2ec4c8;background:transparent",
  codeInline:
    "font-family:Menlo,Consolas,monospace;font-size:0.9em;background:#f4f6fa;padding:2px 6px;border-radius:6px",
  pre:
    "font-family:Menlo,Consolas,monospace;padding:20px 24px;background:#0f172a;color:#e6edf3;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap",
  table: "width:100%;border-collapse:collapse;font-family:Arial,sans-serif",
  th: "background:#20124d;color:#facd45;font-weight:700;font-size:12pt;text-align:center;padding:8px 10px;border:1pt solid #3e2e68;vertical-align:middle",
  tdFirst:
    "background:#3e2e68;color:#f3f3f3;font-weight:700;font-size:10pt;padding:8px 10px;border:1pt solid #4e4170;vertical-align:middle",
  td: "background:#989dbf;color:#000;font-size:11pt;text-align:center;padding:8px 10px;border:1pt solid #b1b6d1;vertical-align:middle",
  hr: "height:1px;background-color:#dbe1e7;border:none",
} as const;

type RenderEnv = {
  wordTitleRendered?: boolean;
  wordTitleOpen?: boolean;
  tableCol?: number;
};

/**
 * Build a configured markdown-it instance. Each call is independent so it is
 * safe to reuse across requests; render state lives in the per-render `env`.
 * All block/inline rules emit inline styles so Google Docs' HTML import
 * reproduces the formatter look (tables included).
 */
export function createMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  });

  const rules = md.renderer.rules;

  // Headings: first h1 → centered MsoTitle paragraph; h2/h3 inline-styled.
  rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.tag === "h1") {
      const state = (env ?? {}) as RenderEnv;
      const cls = state.wordTitleRendered ? "doc-title" : "MsoTitle doc-title";
      state.wordTitleRendered = true;
      return `<p class="${cls}" style="${S.title}">`;
    }
    if (token.tag === "h2") return `<h2 style="${S.h2}">`;
    if (token.tag === "h3") return `<h3 style="${S.h3}">`;
    return self.renderToken(tokens, idx, options);
  };
  rules.heading_close = (tokens, idx, options, _env, self) => {
    const tag = tokens[idx].tag;
    if (tag === "h1") return "</p>";
    if (tag === "h2" || tag === "h3") return `</${tag}>`;
    return self.renderToken(tokens, idx, options);
  };

  rules.paragraph_open = (tokens, idx) =>
    tokens[idx].hidden ? "" : `<p style="${S.para}">`;
  rules.paragraph_close = (tokens, idx) => (tokens[idx].hidden ? "" : "</p>");

  rules.bullet_list_open = () => `<ul style="${S.list}">`;
  rules.ordered_list_open = () => `<ol style="${S.list}">`;
  rules.list_item_open = () => `<li style="${S.para}">`;

  rules.link_open = (tokens, idx, options, _env, self) => {
    tokens[idx].attrSet("style", S.link);
    return self.renderToken(tokens, idx, options);
  };

  rules.blockquote_open = () => `<blockquote style="${S.blockquote}">`;

  rules.code_inline = (tokens, idx) =>
    `<code style="${S.codeInline}">${md.utils.escapeHtml(tokens[idx].content)}</code>`;
  rules.fence = (tokens, idx) =>
    `<pre style="${S.pre}"><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>`;
  rules.code_block = rules.fence;

  rules.hr = () => `<hr style="${S.hr}">`;

  // Tables: inline per-cell styles, first body column treated as a row header.
  rules.table_open = () => `<table style="${S.table}">`;
  rules.tr_open = (_tokens, _idx, _options, env) => {
    (env as RenderEnv).tableCol = 0;
    return "<tr>";
  };
  rules.th_open = () => `<th style="${S.th}">`;
  rules.td_open = (_tokens, _idx, _options, env) => {
    const e = env as RenderEnv;
    const first = (e.tableCol ?? 0) === 0;
    e.tableCol = (e.tableCol ?? 0) + 1;
    return `<td style="${first ? S.tdFirst : S.td}">`;
  };

  return md;
}

let sharedRenderer: MarkdownIt | null = null;

/**
 * Render markdown to the inner HTML fragment (no wrapper, no stylesheet).
 * Wrap it in `<div class="doc-theme">` and apply DOC_THEME_CSS to get the
 * document look, or use markdownToStyledDocument for a ready-made string.
 */
export function markdownToStyledHtml(markdown: string): string {
  sharedRenderer ??= createMarkdownRenderer();
  // A fresh env per render so the "first H1" title logic resets each time.
  return sharedRenderer.render(markdown, {} as RenderEnv);
}

/**
 * Render markdown to a complete, self-contained HTML document: the `.doc-theme`
 * stylesheet plus the rendered body. This is what you copy into the clipboard
 * (text/html) or hand to a Google Docs import — the styles travel with it.
 */
export function markdownToStyledDocument(markdown: string): string {
  const body = markdownToStyledHtml(markdown);
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8"><style>',
    DOC_THEME_CSS,
    "</style></head><body>",
    `<div class="doc-theme">${body}</div>`,
    "</body></html>",
  ].join("");
}

// --- Reverse direction: pasted HTML (Google Docs / Word) → markdown ----------

let sharedTurndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (sharedTurndown) return sharedTurndown;
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  turndown.use(gfm);
  sharedTurndown = turndown;
  return turndown;
}

/** Strip Word's conditional comments and <o:p> tags that pollute pasted HTML. */
export function stripWordArtifacts(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<\/?o:p[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/** Convert pasted Google Docs / Word HTML back into markdown. */
export function htmlToMarkdown(html: string): string | null {
  try {
    return getTurndown().turndown(stripWordArtifacts(html)).trim();
  } catch {
    return null;
  }
}

/**
 * The `.doc-theme` rules from sunny-md-formatter's styles.css, trimmed to the
 * selectors that affect the exported document. Cascade order is preserved so
 * the "final priority" overrides (Arial, pt sizes, centered title, #1155cc
 * links) win, matching the formatter's preview exactly.
 */
export const DOC_THEME_CSS = `
.doc-theme {
  font-family: "Metropolis", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  letter-spacing: 0.5px;
  color: #212b36;
  font-size: 16px;
  line-height: 28px;
}
.doc-theme * { color: inherit; }
.doc-theme h1, .doc-theme .doc-title { font-size: 64px; line-height: 80px; }
.doc-theme h2 { font-size: 48px; line-height: 64px; }
.doc-theme h3 { font-size: 32px; line-height: 42px; }
.doc-theme p { font-size: 16px; line-height: 28px; }
.doc-theme ul, .doc-theme ol { padding-left: 1.5em; }
.doc-theme li { line-height: 28px; }
.doc-theme code {
  font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9em;
  background: #f4f6fa;
  padding: 2px 6px;
  border-radius: 6px;
}
.doc-theme pre {
  padding: 20px 24px;
  background: #0f172a;
  color: #e6edf3;
  border-radius: 16px;
  overflow-x: auto;
  line-height: 1.5;
}
.doc-theme pre code { background: transparent; padding: 0; color: inherit; font-size: 14px; white-space: pre; }
.doc-theme table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; }
.doc-theme td, .doc-theme th { padding: 8px 10px; line-height: 1.35; vertical-align: middle; word-break: break-word; }
.doc-theme thead th {
  background: #20124d;
  color: #facd45;
  font-weight: 700;
  font-size: 12pt;
  text-align: center;
  padding: 8px 10px;
  border: 1pt solid #3e2e68;
}
.doc-theme td:first-child {
  background: #3e2e68;
  color: #f3f3f3;
  font-weight: 700;
  font-size: 10pt;
  border: 1pt solid #4e4170;
}
.doc-theme td:not(:first-child) {
  background: #989dbf;
  color: #000;
  font-size: 11pt;
  text-align: center;
  border: 1pt solid #b1b6d1;
}
.doc-theme h2 { font-size: 24px; line-height: 36px; }
.doc-theme h3 { font-size: 20px; line-height: 30px; }
.doc-theme blockquote { margin: 0 0 1em; padding: 0 1.5em; border-left: 3px solid #2ec4c8; background: transparent; border-radius: 0; }
.doc-theme hr { height: 1px; background-color: #dbe1e7; border: none; }

/* Final priority typography overrides — what Google Docs actually receives. */
.doc-theme, .doc-theme * { font-family: Arial, sans-serif; color: #000; }
.doc-theme h1, .doc-theme .doc-title { font-size: 26pt; line-height: 1.3; text-align: center; font-weight: normal !important; }
.doc-theme h2 { font-size: 16pt; line-height: 1.4; font-weight: normal !important; }
.doc-theme h3 { font-size: 14pt; line-height: 1.4; font-weight: normal !important; }
.doc-theme p, .doc-theme ul, .doc-theme ol, .doc-theme li { font-size: 11pt; line-height: 1.15; }
.doc-theme a { color: #1155cc; }
`.trim();
