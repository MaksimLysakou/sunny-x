import "server-only";
import { getEffectiveDateKey } from "./effective-date";

export type ApiData = unknown;

const cache = new Map<string, Promise<ApiData>>();

async function fetchFromApi(): Promise<ApiData> {
  const url = process.env.DATA_API_URL;
  if (!url) {
    throw new Error("DATA_API_URL is not set");
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function getData(): Promise<ApiData> {
  const key = getEffectiveDateKey();
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchFromApi().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, pending);
  }
  return pending;
}

export function getCurrentDayKey(): string {
  return getEffectiveDateKey();
}
