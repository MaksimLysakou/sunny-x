import type { Card } from "@/app/types";
import { CardStack } from "@/app/components/CardStack";
import { Header } from "@/app/components/Header";

export const dynamic = "force-dynamic";

const MOCK_POSTS: Card[] = [
  {
    id: "mock-1",
    mode: "post",
    text: `Hot take: каждый раз, когда стартап пишет в анонсе "AI-native", у него на бэке ровно один OpenAI-вызов и три if-а.

меняй мой мнение 😅

https://example.com/ai-native-startups`,
    sources: [
      {
        url: "https://example.com/ai-native-startups",
        title: "Why 'AI-native' is the new 'cloud-native' (and just as meaningless)",
        summary:
          "Разбор того, как маркетинговый ярлык AI-native подменил реальный продукт у большинства новых SaaS-стартапов 2026 года.",
      },
    ],
  },
  {
    id: "mock-2",
    mode: "post",
    text: `Anthropic выкатили Opus 4.7 с 1M контекста. Загрузил туда весь монорепо своего проекта, попросил найти баг. Нашёл за один проход.

инфра, которая не глючит — это не миф, это просто дорого.

https://example.com/opus-4-7`,
    sources: [
      {
        url: "https://example.com/opus-4-7",
        title: "Anthropic ships Claude Opus 4.7 with 1M token context window",
        summary:
          "Новая модель Anthropic с увеличенным контекстом до 1 миллиона токенов и улучшенной работой с большими кодовыми базами и документами.",
      },
    ],
  },
  {
    id: "mock-3",
    mode: "post",
    text: `Unpopular opinion: 90% MCP-серверов, которые я видел в проде, можно заменить одной curl-ой и regex. И спать спокойно.

Слой абстракции, который дороже того, что под ним 🤷‍♂️`,
    sources: [],
  },
  {
    id: "mock-4",
    mode: "post",
    text: `Vercel прикрутили Edge Inference прямо в Functions. Latency на холодный старт LLM-вызова: 80мс.

Кажется, шаринг GPU между функциями реально работает. Кто тестил в проде?

https://example.com/vercel-edge-inference`,
    sources: [
      {
        url: "https://example.com/vercel-edge-inference",
        title: "Vercel ships Edge Inference: run LLMs inside Functions with 80ms cold start",
        summary:
          "Vercel добавила выполнение LLM-моделей прямо внутри serverless-функций на edge с очень быстрым стартом — без отдельного inference-сервиса.",
      },
    ],
  },
  {
    id: "mock-5",
    mode: "post",
    text: `Сценарий: senior дев тратит 2 часа на ревью PR из 800 строк.
В соседней команде: AI-ревью за 12 секунд, апрув, мёрж.

А потом инцидент на проде в 3 ночи, и кто его чинит? Senior дев. 😭`,
    sources: [],
  },
];

export default function PostsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-8 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />

      <div className="w-full max-w-2xl flex items-center gap-2 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-semibold uppercase tracking-wider">
          Visual mock
        </span>
        <span>генерация постов временно отключена, это просто превью карточек</span>
      </div>

      <CardStack initialCards={MOCK_POSTS} />
    </main>
  );
}
