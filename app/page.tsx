import Image from "next/image";
import { getCurrentDayKey, getData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const day = getCurrentDayKey();
  let data: unknown = null;
  let error: string | null = null;

  try {
    data = await getData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
      <div className="flex items-center gap-3">
        <Image src="/sun.svg" alt="sunny-x" width={40} height={40} priority />
        <h1 className="text-2xl font-semibold">sunny-x</h1>
      </div>
      <p className="text-sm text-zinc-500">Day: {day}</p>
      {error ? (
        <pre className="max-w-2xl whitespace-pre-wrap text-red-600">{error}</pre>
      ) : (
        <pre className="max-w-2xl w-full overflow-auto rounded-lg bg-white dark:bg-zinc-900 p-4 text-sm">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
