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

  // Stream progress as Server-Sent Events: one {type:"step"} per pipeline step,
  // then a final {type:"result"} or {type:"error"}. SSE (text/event-stream) is
  // the one streaming content type every engine (Blink/WebKit/Gecko) treats as
  // a live stream and never buffers or MIME-sniffs — which NDJSON did not
  // guarantee on Chrome/macOS (Blink).
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      // Extra belt: a large comment up front defeats any initial proxy/engine
      // buffer immediately. SSE comment lines start with ':' and are ignored.
      controller.enqueue(encoder.encode(`: ${" ".repeat(2048)}\n\n`));
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
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
