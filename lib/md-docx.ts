// Markdown → .docx builder for the article pipeline. We hand the .docx to
// Google Drive for conversion to a Google Doc — DOCX→Doc is high-fidelity
// (canonical Office format) and keeps our brand styling, unlike the lossy
// HTML→Doc import. Mirrors the look of lib/md-format.ts (Arial body, centered
// title, themed purple tables, Google-blue links).

import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  ImageRun,
  BorderStyle,
  TableLayoutType,
  LineRuleType,
} from "docx";

// Line-heights mirror sunny-md-formatter. docx `spacing.line` is in 240ths of a
// line (240 = 1.0), with lineRule AUTO.
const LINE = { body: 276, h1: 312, h2: 336, cell: 324, code: 360 }; // 1.15 / 1.3 / 1.4 / 1.35 / 1.5
const autoLine = (line: number) => ({ line, lineRule: LineRuleType.AUTO });

// Full content width of a default Letter/A4 Google Doc, in twips (≈6.25in) —
// used as a fixed table width so tables span the page instead of shrinking to
// their content.
const TABLE_WIDTH_DXA = 9000;

const FONT = "Arial";
// docx run sizes are half-points (22 = 11pt).
const SIZE = { body: 22, meta: 22, th: 24, tdFirst: 20, td: 22, code: 20 };
const C = {
  link: "1155CC",
  thBg: "20124D",
  thFg: "FACD45",
  firstBg: "3E2E68",
  firstFg: "F3F3F3",
  tdBg: "989DBF",
  tdFg: "000000",
  thBorder: "3E2E68",
  firstBorder: "4E4170",
  tdBorder: "B1B6D1",
  rule: "DBE1E7",
  codeBg: "0F172A",
  codeFg: "E6EDF3",
  quoteBar: "2EC4C8",
};

// --- inline → runs --------------------------------------------------------

type Run = TextRun | ExternalHyperlink;

function inlineRuns(children: Token[]): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  let linkHref: string | null = null;
  let linkBuf: TextRun[] | null = null;

  const push = (text: string, code = false) => {
    if (!text) return;
    const inLink = linkBuf !== null;
    const run = new TextRun({
      text,
      bold,
      italics: italic,
      font: code ? "Consolas" : FONT,
      ...(inLink ? { color: C.link, underline: {} } : {}),
    });
    (linkBuf ?? runs).push(run);
  };

  for (const t of children) {
    switch (t.type) {
      case "text":
        push(t.content);
        break;
      case "code_inline":
        push(t.content, true);
        break;
      case "strong_open":
        bold = true;
        break;
      case "strong_close":
        bold = false;
        break;
      case "em_open":
        italic = true;
        break;
      case "em_close":
        italic = false;
        break;
      case "softbreak":
        push(" ");
        break;
      case "hardbreak":
        (linkBuf ?? runs).push(new TextRun({ text: "", break: 1 }));
        break;
      case "link_open":
        linkHref = t.attrGet("href");
        linkBuf = [];
        break;
      case "link_close":
        if (linkHref) {
          runs.push(
            new ExternalHyperlink({
              link: linkHref,
              children:
                linkBuf && linkBuf.length
                  ? linkBuf
                  : [new TextRun({ text: linkHref, color: C.link, underline: {} })],
            }),
          );
        }
        linkBuf = null;
        linkHref = null;
        break;
      default:
        // images and other inline tokens are skipped in the body (the hero
        // image is added separately).
        break;
    }
  }
  return runs;
}

/** Plain concatenated text of an inline token — used for table cells. */
function inlineText(children: Token[]): string {
  return children
    .map((t) => (t.type === "text" || t.type === "code_inline" ? t.content : t.type === "softbreak" ? " " : ""))
    .join("");
}

// --- tables ---------------------------------------------------------------

const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

function themedCell(
  text: string,
  bg: string,
  fg: string,
  size: number,
  center: boolean,
  widthDxa: number,
  borderColor: string,
): TableCell {
  const b = { style: BorderStyle.SINGLE, size: 8, color: borderColor } as const;
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: bg, color: "auto" },
    borders: { top: b, bottom: b, left: b, right: b },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: autoLine(LINE.cell),
        children: [new TextRun({ text, bold: true, color: fg, font: FONT, size })],
      }),
    ],
  });
}

function parseTable(tokens: Token[], start: number): { table: Table; next: number } {
  // First pass: collect rows as {head, cells:[text]} so we know the column count.
  const rowsData: { head: boolean; cells: string[] }[] = [];
  let i = start + 1;
  let inHead = false;
  let cur: { head: boolean; cells: string[] } | null = null;
  while (i < tokens.length && tokens[i].type !== "table_close") {
    const t = tokens[i];
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") cur = { head: inHead, cells: [] };
    else if (t.type === "tr_close") {
      if (cur) rowsData.push(cur);
      cur = null;
    } else if (t.type === "th_open" || t.type === "td_open") {
      cur?.cells.push(inlineText(tokens[i + 1].children ?? []));
      i += 2; // skip inline + close
    }
    i++;
  }

  const cols = Math.max(1, ...rowsData.map((r) => r.cells.length));
  const colW = Math.floor(TABLE_WIDTH_DXA / cols);

  const rows = rowsData.map(
    (r) =>
      new TableRow({
        children: r.cells.map((text, ci) => {
          const [bg, fg, size, center, border] = r.head
            ? [C.thBg, C.thFg, SIZE.th, true, C.thBorder]
            : ci === 0
              ? [C.firstBg, C.firstFg, SIZE.tdFirst, false, C.firstBorder]
              : [C.tdBg, C.tdFg, SIZE.td, true, C.tdBorder];
          return themedCell(
            text,
            bg as string,
            fg as string,
            size as number,
            center as boolean,
            colW,
            border as string,
          );
        }),
      }),
  );

  const table = new Table({
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: Array(cols).fill(colW),
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    },
    rows,
  });
  return { table, next: i + 1 };
}

// --- blocks ---------------------------------------------------------------

// Headings match sunny-md-formatter exactly: plain black Arial, NORMAL weight,
// fixed point sizes (h1 26pt centered, h2 16pt, h3 14pt) — not Google's own
// heading styles (which recolour/space them differently). docx size = half-pt.
const HEADING: Record<string, { size: number; line: number; center?: boolean }> = {
  h1: { size: 52, line: LINE.h1, center: true },
  h2: { size: 32, line: LINE.h2 },
  h3: { size: 28, line: LINE.h2 },
  h4: { size: 24, line: LINE.h2 },
};

function headingParagraph(tag: string, children: Token[]): Paragraph {
  const cfg = HEADING[tag] ?? { size: 24, line: LINE.h2 };
  return new Paragraph({
    alignment: cfg.center ? AlignmentType.CENTER : undefined,
    spacing: { before: 200, after: 80, ...autoLine(cfg.line) },
    children: [
      new TextRun({
        text: inlineText(children),
        font: FONT,
        size: cfg.size,
        bold: false,
        color: "000000",
      }),
    ],
  });
}

function tokensToBlocks(tokens: Token[]): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];
  let i = 0;
  let orderedCounter = 0;
  let inOrdered = false;

  while (i < tokens.length) {
    const t = tokens[i];
    switch (t.type) {
      case "heading_open":
        blocks.push(headingParagraph(t.tag, tokens[i + 1].children ?? []));
        i += 3;
        continue;
      case "paragraph_open":
        blocks.push(new Paragraph({ children: inlineRuns(tokens[i + 1].children ?? []) }));
        i += 3;
        continue;
      case "ordered_list_open":
        inOrdered = true;
        orderedCounter = 0;
        i++;
        continue;
      case "ordered_list_close":
        inOrdered = false;
        i++;
        continue;
      case "bullet_list_open":
      case "bullet_list_close":
        i++;
        continue;
      case "list_item_open": {
        // find the inline content of this item's first paragraph
        let j = i + 1;
        while (j < tokens.length && tokens[j].type !== "inline") j++;
        const runs = inlineRuns(tokens[j]?.children ?? []);
        if (inOrdered) {
          orderedCounter++;
          blocks.push(
            new Paragraph({
              indent: { left: 360 },
              children: [new TextRun({ text: `${orderedCounter}. `, font: FONT }), ...runs],
            }),
          );
        } else {
          blocks.push(new Paragraph({ bullet: { level: 0 }, children: runs }));
        }
        // skip to list_item_close
        while (i < tokens.length && tokens[i].type !== "list_item_close") i++;
        i++;
        continue;
      }
      case "table_open": {
        const { table, next } = parseTable(tokens, i);
        blocks.push(table);
        i = next;
        continue;
      }
      case "blockquote_open": {
        // render contained paragraphs as italic, indented
        let j = i + 1;
        while (j < tokens.length && tokens[j].type !== "blockquote_close") {
          if (tokens[j].type === "inline") {
            blocks.push(
              new Paragraph({
                indent: { left: 360 },
                border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.quoteBar, space: 12 } },
                children: inlineRuns(tokens[j].children ?? []).map((r) =>
                  r instanceof TextRun ? r : r,
                ),
              }),
            );
          }
          j++;
        }
        i = j + 1;
        continue;
      }
      case "fence":
      case "code_block":
        blocks.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: C.codeBg, color: "auto" },
            spacing: autoLine(LINE.code),
            children: [new TextRun({ text: t.content.replace(/\n$/, ""), font: "Consolas", color: C.codeFg, size: SIZE.code })],
          }),
        );
        i++;
        continue;
      case "hr":
        blocks.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.rule, space: 1 } },
            children: [],
          }),
        );
        i++;
        continue;
      default:
        i++;
        continue;
    }
  }
  return blocks;
}

// --- image ----------------------------------------------------------------

function imageSize(buf: Buffer): { width: number; height: number } {
  // PNG
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG — walk markers to the SOF segment
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return { width: 600, height: 400 };
}

const HERO_WIDTH = 600;

function heroParagraph(dataUri: string): Paragraph | null {
  const m = /^data:(image\/(\w+));base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  const buf = Buffer.from(m[3], "base64");
  const { width, height } = imageSize(buf);
  const h = Math.round(HERO_WIDTH * (height / width));
  return new Paragraph({
    children: [
      new ImageRun({
        data: buf,
        transformation: { width: HERO_WIDTH, height: h },
      } as ConstructorParameters<typeof ImageRun>[0]),
    ],
  });
}

// --- public ---------------------------------------------------------------

function metaParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: FONT, size: SIZE.meta }),
      new TextRun({ text: value, font: FONT, size: SIZE.meta }),
    ],
  });
}

export async function buildArticleDocx(opts: {
  url: string;
  metaTitle: string;
  metaDescription: string;
  heroImages: { label: string; image: string }[]; // data URIs; >1 = a choice
  markdown: string;
}): Promise<Buffer> {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
  const body = tokensToBlocks(md.parse(opts.markdown, {}));

  // Hero variants: when there's more than one, label each so the user can pick.
  const single = opts.heroImages.length === 1;
  const heroBlocks: Paragraph[] = [];
  for (const v of opts.heroImages) {
    if (!single) {
      heroBlocks.push(
        new Paragraph({
          children: [new TextRun({ text: v.label, bold: true, font: FONT, size: SIZE.meta })],
        }),
      );
    }
    const p = heroParagraph(v.image);
    if (p) heroBlocks.push(p);
  }

  const children: (Paragraph | Table)[] = [
    metaParagraph("url", opts.url),
    metaParagraph("meta title", opts.metaTitle),
    metaParagraph("meta description", opts.metaDescription),
    ...heroBlocks,
    ...body,
  ];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE.body },
          paragraph: { spacing: autoLine(LINE.body) },
        },
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
