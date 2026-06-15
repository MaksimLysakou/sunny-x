import { Header } from "@/app/components/Header";
import { ArticleForm } from "@/app/components/ArticleForm";

export const dynamic = "force-dynamic";

export default function ArticlesPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-8 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />
      <ArticleForm />
    </main>
  );
}
