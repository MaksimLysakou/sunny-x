import { postsToCards } from "@/lib/cards";
import { readNewsCache, readPostsCache } from "@/lib/posts";
import { CardStack } from "@/app/components/CardStack";
import { Header } from "@/app/components/Header";
import { PostsGenerateGate } from "@/app/components/PostsGenerateGate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function PostsPage() {
  let postsCached: Awaited<ReturnType<typeof readPostsCache>> = null;
  let newsCached: Awaited<ReturnType<typeof readNewsCache>> = null;
  let error: string | null = null;
  try {
    [postsCached, newsCached] = await Promise.all([
      readPostsCache(),
      readNewsCache(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const cards =
    postsCached && postsCached.posts.length > 0
      ? postsToCards(postsCached.posts, postsCached.day)
      : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-8 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />

      {error ? (
        <div className="max-w-2xl text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 whitespace-pre-wrap">
          {error}
        </div>
      ) : cards ? (
        <CardStack initialCards={cards} />
      ) : (
        <PostsGenerateGate hasNews={!!newsCached && newsCached.news.length > 0} />
      )}
    </main>
  );
}
