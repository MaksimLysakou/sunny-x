import "server-only";

export type RawTweet = {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  url: string;
  likes: number;
  retweets: number;
  replies: number;
};

type ListTweetsApiResponse = {
  data?: Array<{
    id: string;
    text: string;
    created_at: string;
    author_id: string;
    public_metrics?: {
      like_count?: number;
      retweet_count?: number;
      reply_count?: number;
    };
  }>;
  includes?: {
    users?: Array<{ id: string; username: string; name: string }>;
  };
  meta?: { next_token?: string };
};

export type DayWindow = {
  startIso: string;
  endIso: string;
  label: string;
  fellBackToYesterday: boolean;
};

const MSK_OFFSET_MS = 3 * 3_600_000;

export function getMoscowDayWindow(now: Date = new Date()): DayWindow {
  const nowMs = now.getTime();
  const mskNow = new Date(nowMs + MSK_OFFSET_MS);
  const mskHour = mskNow.getUTCHours();
  const fellBackToYesterday = mskHour < 3;
  const chosenMskMs = nowMs + MSK_OFFSET_MS + (fellBackToYesterday ? -24 * 3_600_000 : 0);
  const chosenMskDate = new Date(chosenMskMs);
  const y = chosenMskDate.getUTCFullYear();
  const m = chosenMskDate.getUTCMonth();
  const d = chosenMskDate.getUTCDate();
  const mskMidnightUtcMs = Date.UTC(y, m, d) - MSK_OFFSET_MS;
  const dayEndUtcMs = mskMidnightUtcMs + 24 * 3_600_000;
  return {
    startIso: new Date(mskMidnightUtcMs).toISOString(),
    endIso: new Date(dayEndUtcMs).toISOString(),
    label: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")} MSK`,
    fellBackToYesterday,
  };
}

export async function fetchListTweets(
  listId: string,
  window: DayWindow,
  bearerToken: string,
  desiredCount = 40,
): Promise<RawTweet[]> {
  const startMs = new Date(window.startIso).getTime();
  const endMs = new Date(window.endIso).getTime();
  const collected: RawTweet[] = [];
  let paginationToken: string | undefined;
  let pages = 0;
  const MAX_PAGES = 5;

  while (collected.length < desiredCount && pages < MAX_PAGES) {
    pages += 1;
    const params = new URLSearchParams({
      max_results: "100",
      "tweet.fields": "created_at,author_id,public_metrics",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    if (paginationToken) params.set("pagination_token", paginationToken);

    const url = `https://api.twitter.com/2/lists/${encodeURIComponent(listId)}/tweets?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`X list tweets failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as ListTweetsApiResponse;
    const users = new Map<string, { username: string; name: string }>();
    for (const u of json.includes?.users ?? []) {
      users.set(u.id, { username: u.username, name: u.name });
    }

    let sawOlderThanWindow = false;
    for (const t of json.data ?? []) {
      const tMs = new Date(t.created_at).getTime();
      if (tMs < startMs) {
        sawOlderThanWindow = true;
        continue;
      }
      if (tMs >= endMs) continue;
      const user = users.get(t.author_id) ?? { username: t.author_id, name: t.author_id };
      collected.push({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        authorId: t.author_id,
        authorUsername: user.username,
        authorName: user.name,
        url: `https://x.com/${user.username}/status/${t.id}`,
        likes: t.public_metrics?.like_count ?? 0,
        retweets: t.public_metrics?.retweet_count ?? 0,
        replies: t.public_metrics?.reply_count ?? 0,
      });
      if (collected.length >= desiredCount) break;
    }

    paginationToken = json.meta?.next_token;
    if (!paginationToken) break;
    if (sawOlderThanWindow) break;
  }

  return collected.slice(0, desiredCount);
}
