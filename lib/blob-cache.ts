import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const isServerless =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const LOCAL_CACHE_ROOT = isServerless
  ? path.join("/tmp", "sunny-x-cache")
  : path.join(process.cwd(), ".cache");

function safeKey(label: string): string {
  return label.replace(/[^A-Za-z0-9_-]/g, "_");
}

function blobPathFor(namespace: string, key: string): string {
  return `${namespace}/${safeKey(key)}.json`;
}

function localPathFor(namespace: string, key: string): string {
  return path.join(LOCAL_CACHE_ROOT, namespace, `${safeKey(key)}.json`);
}

export async function readJsonCache<T>(
  namespace: string,
  key: string,
): Promise<T | null> {
  if (BLOB_TOKEN) {
    try {
      const result = await get(blobPathFor(namespace, key), {
        access: "private",
        token: BLOB_TOKEN,
        useCache: false,
      });
      if (!result || result.statusCode !== 200) return null;
      return (await new Response(result.stream).json()) as T;
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(localPathFor(namespace, key), "utf8");
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function writeJsonCache<T>(
  namespace: string,
  key: string,
  value: T,
): Promise<void> {
  if (BLOB_TOKEN) {
    await put(blobPathFor(namespace, key), JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: BLOB_TOKEN,
    });
    return;
  }
  const file = localPathFor(namespace, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}
