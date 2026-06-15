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

  // Stream progress as newline-delimited JSON: one {type:"step"} per pipeline
  // step, then a final {type:"result"} or {type:"error"}.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await generateArticle({ briefUrl, keysUrl }, (step) =>
          send({ type: "step", step }),
        );
        send({ type: "result", result });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
