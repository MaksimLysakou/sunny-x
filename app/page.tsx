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
      <h1 className="text-2xl font-semibold">Day: {day}</h1>
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
