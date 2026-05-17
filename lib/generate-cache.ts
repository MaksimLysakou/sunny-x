import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GENERATE_SCHEMA_VERSION, type GenerateResult } from "./generate";

// On Vercel/AWS Lambda the function bundle at process.cwd() (/var/task) is read-only;
// /tmp is the only writable path. Locally we keep .cache next to the repo for easy inspection.
const isServerless =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const CACHE_DIR = isServerless
  ? path.join("/tmp", "sunny-x-cache", "generate")
  : path.join(process.cwd(), ".cache", "generate");

function cacheFileFor(dayLabel: string): string {
  const safe = dayLabel.replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function readCache(dayLabel: string): Promise<GenerateResult | null> {
  try {
    const raw = await fs.readFile(cacheFileFor(dayLabel), "utf8");
    const parsed = JSON.parse(raw) as GenerateResult;
    if (parsed.day !== dayLabel) return null;
    if (parsed.schemaVersion !== GENERATE_SCHEMA_VERSION) return null;
    return parsed;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function writeCache(result: GenerateResult): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFileFor(result.day);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(result, null, 2), "utf8");
  await fs.rename(tmp, file);
}
