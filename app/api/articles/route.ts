import { generateArticle } from "@/lib/articles";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { briefUrl?: string; keysUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const briefUrl = (body.briefUrl ?? "").trim();
  if (!briefUrl) {
    return Response.json({ error: "briefUrl is required" }, { status: 400 });
  }
  const keysUrl = body.keysUrl ? String(body.keysUrl).trim() || null : null;

  try {
    const result = await generateArticle({ briefUrl, keysUrl });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
