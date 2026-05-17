import { getCachedCards } from "@/lib/cards";
import { CardStack } from "@/app/components/CardStack";
import { GenerateGate } from "@/app/components/GenerateGate";
import { Header } from "@/app/components/Header";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function RepliesPage() {
  let cached: Awaited<ReturnType<typeof getCachedCards>> = null;
  let error: string | null = null;
  try {
    cached = await getCachedCards();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const replies = cached?.filter((c) => c.mode === "reply") ?? [];

  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-8 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />

      {error ? (
        <div className="max-w-2xl text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 whitespace-pre-wrap">
          {error}
        </div>
      ) : replies.length > 0 ? (
        <CardStack initialCards={replies} />
      ) : (
        <GenerateGate />
      )}
    </main>
  );
}
