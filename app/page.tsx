import Link from "next/link";
import { Header } from "./components/Header";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-12 p-6 sm:p-10 bg-zinc-50 text-zinc-900">
      <Header />

      <section className="w-full max-w-4xl flex flex-col items-center text-center gap-3 mt-6">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Над чем сегодня работаем?
        </h2>
      </section>

      <div className="w-full max-w-4xl flex flex-col gap-10">
        <Group title="Копирайтинг">
          <WorkCard
            accent="amber"
            eyebrow="Лонгрид"
            title="Написать статью"
            description="Конвертируем ТЗшку в красивую статью с ключами, hero картинкой и текстом постов."
            icon={<ArticleIcon />}
            comingSoon
          />
          <WorkCard
            accent="amber"
            eyebrow="Кейс"
            title="Написать case study"
            description="История клиента с результатами — от проблемы до измеримого эффекта."
            icon={<CaseIcon />}
            comingSoon
          />
          <WorkCard
            accent="amber"
            eyebrow="Лендинг"
            title="Написать сервисную страницу"
            description="Продающая страница услуги — оффер, выгоды, призыв к действию."
            icon={<ServiceIcon />}
            comingSoon
          />
        </Group>

        <Group title="Twitter">
          <WorkCard
            href="/posts"
            accent="sky"
            eyebrow="Оригинальные посты"
            title="Написать твиты"
            description="Авторские посты по горячим AI/IT новостям дня. Со ссылками на источники."
            icon={<PostIcon />}
          />
          <WorkCard
            href="/replies"
            accent="emerald"
            eyebrow="Реакции на ленту"
            title="Написать реплаи"
            description="Отвечаем на свежие твиты из подписок — 3 варианта на каждый, в твоём голосе."
            icon={<ReplyIcon />}
          />
        </Group>

        <Group title="Утилиты">
          <WorkCard
            href="https://sunny-md.lysakou.dev/"
            external
            accent="violet"
            eyebrow="Форматирование"
            title="Отформатировать markdown"
            description="Привести markdown в порядок — заголовки, списки, отступы."
            icon={<MarkdownIcon />}
          />
        </Group>
      </div>
    </main>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-zinc-500 px-1">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  );
}

type Accent = "emerald" | "sky" | "amber" | "violet";

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
  amber: {
    badge: "text-amber-700 bg-amber-50 border-amber-200",
    ring: "hover:border-amber-300 hover:shadow-amber-100/60",
    iconBg: "bg-amber-50 border-amber-200",
    iconText: "text-amber-600",
  },
  violet: {
    badge: "text-violet-700 bg-violet-50 border-violet-200",
    ring: "hover:border-violet-300 hover:shadow-violet-100/60",
    iconBg: "bg-violet-50 border-violet-200",
    iconText: "text-violet-600",
  },
};

function WorkCard({
  href,
  external,
  comingSoon,
  accent,
  eyebrow,
  title,
  description,
  icon,
}: {
  href?: string;
  external?: boolean;
  comingSoon?: boolean;
  accent: Accent;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const a = ACCENT[accent];

  const inner = (
    <>
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
        <h4 className="text-xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h4>
        <p className="text-sm text-zinc-600 leading-relaxed">{description}</p>
      </div>
      {comingSoon ? (
        <div className="flex items-center gap-1 text-sm font-medium text-zinc-400 mt-auto">
          Coming soon...
        </div>
      ) : (
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
            {external ? (
              <>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </>
            ) : (
              <>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </>
            )}
          </svg>
        </div>
      )}
    </>
  );

  const base = "group relative flex flex-col gap-5 rounded-2xl border p-6 sm:p-7";

  if (comingSoon) {
    return (
      <div
        className={`${base} bg-zinc-50/60 border-dashed border-zinc-200 cursor-default opacity-80`}
        aria-disabled="true"
      >
        {inner}
      </div>
    );
  }

  const cls = `${base} bg-white border-zinc-200 shadow-sm transition-all hover:shadow-md ${a.ring}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href ?? "#"} className={cls}>
      {inner}
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

function ArticleIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="11" y2="9" />
    </svg>
  );
}

function CaseIcon() {
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
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function ServiceIcon() {
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

function MarkdownIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="M7 15v-6l2.5 3L12 9v6" />
      <path d="M17 9v6" />
      <path d="m14.5 12.5 2.5 2.5 2.5-2.5" />
    </svg>
  );
}
