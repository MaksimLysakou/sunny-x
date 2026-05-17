import Link from "next/link";
import { Header } from "./components/Header";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-12 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />

      <section className="w-full max-w-3xl flex flex-col items-center text-center gap-3 mt-6">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Что сегодня публикуем?
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 max-w-xl">
          Выбирай раздел и листай карточки. Свайп влево — отказ, вправо — в публикацию.
        </p>
      </section>

      <section className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ModeCard
          href="/replies"
          accent="emerald"
          eyebrow="Реакции на ленту"
          title="Реплаи"
          description="Отвечаем на свежие твиты из подписок — 3 варианта на каждый, в твоём голосе."
          icon={<ReplyIcon />}
        />
        <ModeCard
          href="/posts"
          accent="sky"
          eyebrow="Оригинальные посты"
          title="Твиты"
          description="Авторские посты по горячим AI/IT новостям дня. Со ссылками на источники."
          icon={<PostIcon />}
        />
      </section>
    </main>
  );
}

type Accent = "emerald" | "sky";

const ACCENT: Record<
  Accent,
  { badge: string; ring: string; iconBg: string; iconText: string }
> = {
  emerald: {
    badge: "text-emerald-700 bg-emerald-50 border-emerald-200",
    ring: "hover:border-emerald-300 hover:shadow-emerald-100/60",
    iconBg: "bg-emerald-50 border-emerald-200",
    iconText: "text-emerald-600",
  },
  sky: {
    badge: "text-sky-700 bg-sky-50 border-sky-200",
    ring: "hover:border-sky-300 hover:shadow-sky-100/60",
    iconBg: "bg-sky-50 border-sky-200",
    iconText: "text-sky-600",
  },
};

function ModeCard({
  href,
  accent,
  eyebrow,
  title,
  description,
  icon,
}: {
  href: string;
  accent: Accent;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-5 rounded-2xl bg-white border border-zinc-200 shadow-sm p-6 sm:p-7 transition-all hover:shadow-md ${a.ring}`}
    >
      <div
        className={`w-12 h-12 rounded-xl border flex items-center justify-center ${a.iconBg} ${a.iconText}`}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <div
          className={`inline-flex self-start items-center text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${a.badge}`}
        >
          {eyebrow}
        </div>
        <h3 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h3>
        <p className="text-sm text-zinc-600 leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center gap-1 text-sm font-medium text-zinc-700 mt-auto">
        Открыть
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </Link>
  );
}

function ReplyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
