import "server-only";
import { GENERATE_SCHEMA_VERSION, type GenerateResult } from "./generate";
import { readJsonCache, writeJsonCache } from "./blob-cache";

const NAMESPACE = "generate";

export async function readCache(
  dayLabel: string,
): Promise<GenerateResult | null> {
  const parsed = await readJsonCache<GenerateResult>(NAMESPACE, dayLabel);
  if (!parsed) return null;
  if (parsed.day !== dayLabel) return null;
  if (parsed.schemaVersion !== GENERATE_SCHEMA_VERSION) return null;
  return parsed;
}

export async function writeCache(result: GenerateResult): Promise<void> {
  await writeJsonCache(NAMESPACE, result.day, result);
}
