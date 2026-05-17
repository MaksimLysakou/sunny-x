import { getCards } from "@/lib/cards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const cards = await getCards();
    return Response.json({ cards });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, cards: [] }, { status: 500 });
  }
}
