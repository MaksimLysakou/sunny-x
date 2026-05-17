import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";
import { GENERATE_SCHEMA_VERSION, type GenerateResult } from "./generate";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const isServerless =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const LOCAL_CACHE_DIR = isServerless
  ? path.join("/tmp", "sunny-x-cache", "generate")
  : path.join(process.cwd(), ".cache", "generate");

const BLOB_PREFIX = "generate/";

function safeKey(dayLabel: string): string {
  return dayLabel.replace(/[^A-Za-z0-9_-]/g, "_");
}

function blobPathFor(dayLabel: string): string {
  return `${BLOB_PREFIX}${safeKey(dayLabel)}.json`;
}

function localPathFor(dayLabel: string): string {
  return path.join(LOCAL_CACHE_DIR, `${safeKey(dayLabel)}.json`);
}

function validate(
  parsed: GenerateResult | null,
  dayLabel: string,
): GenerateResult | null {
  if (!parsed) return null;
  if (parsed.day !== dayLabel) return null;
  if (parsed.schemaVersion !== GENERATE_SCHEMA_VERSION) return null;
  return parsed;
}

async function readBlob(dayLabel: string): Promise<GenerateResult | null> {
  if (!BLOB_TOKEN) return null;
  const pathname = blobPathFor(dayLabel);
  const { blobs } = await list({
    prefix: pathname,
    token: BLOB_TOKEN,
    limit: 1,
  });
  const match = blobs.find((b) => b.pathname === pathname);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as GenerateResult;
}

async function writeBlob(result: GenerateResult): Promise<void> {
  if (!BLOB_TOKEN) return;
  await put(blobPathFor(result.day), JSON.stringify(result), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    token: BLOB_TOKEN,
  });
}

async function readLocal(dayLabel: string): Promise<GenerateResult | null> {
  try {
    const raw = await fs.readFile(localPathFor(dayLabel), "utf8");
    return JSON.parse(raw) as GenerateResult;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function writeLocal(result: GenerateResult): Promise<void> {
  await fs.mkdir(LOCAL_CACHE_DIR, { recursive: true });
  const file = localPathFor(result.day);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(result, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function readCache(
  dayLabel: string,
): Promise<GenerateResult | null> {
  if (BLOB_TOKEN) {
    try {
      return validate(await readBlob(dayLabel), dayLabel);
    } catch {
      return null;
    }
  }
  return validate(await readLocal(dayLabel), dayLabel);
}

export async function writeCache(result: GenerateResult): Promise<void> {
  if (BLOB_TOKEN) {
    await writeBlob(result);
    return;
  }
  await writeLocal(result);
}
