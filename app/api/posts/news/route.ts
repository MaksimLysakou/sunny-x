import { generateNews, readNewsCache } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const cached = await readNewsCache();
    return Response.json({ news: cached });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, news: null }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  try {
    const result = await generateNews({ force });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
