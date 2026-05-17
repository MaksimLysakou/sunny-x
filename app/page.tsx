import Image from "next/image";
import { getCachedCards } from "@/lib/cards";
import { CardStack } from "./components/CardStack";
import { GenerateGate } from "./components/GenerateGate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home() {
  let cached: Awaited<ReturnType<typeof getCachedCards>> = null;
  let error: string | null = null;
  try {
    cached = await getCachedCards();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-8 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <header className="flex items-center gap-3 mt-2">
        <Image src="/sun.svg" alt="sunny-x" width={44} height={44} priority />
        <h1 className="text-2xl font-semibold tracking-tight">sunny-x</h1>
      </header>

      {error ? (
        <div className="max-w-2xl text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 whitespace-pre-wrap">
          {error}
        </div>
      ) : cached && cached.length > 0 ? (
        <CardStack initialCards={cached} />
      ) : (
        <GenerateGate />
      )}
    </main>
  );
}
