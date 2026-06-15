# План разработки: генерация статей

Генерация статьи устроена как многоэтапный пайплайн — по аналогии с генерацией
твитов (`lib/posts.ts` + `app/api/posts/*` + `PostsGenerateGate`). Пользователь
вводит ссылку на ТЗ (и опционально ссылку на ключи) в форме
[ArticleForm.tsx](../app/components/ArticleForm.tsx), запускается цепочка из 7
шагов, на выходе — готовый Google Docs документ.

В отличие от постов (кэш на день, по «московскому окну»), статья — это разовая
**задача (job)**, ключуемая по хешу входа (brief URL + keys URL), а не по дате.

---

## Архитектура

Повторяем паттерн постов:

- **`lib/articles.ts`** — серверная логика (`import "server-only"`), функции по
  шагам + оркестратор. Anthropic через `client.messages.parse` со
  `json_schema` output, как в `lib/posts.ts`.
- **`lib/articles-cache.ts`** (или переиспользуем `lib/blob-cache.ts`) —
  хранение состояния job и промежуточных артефактов в Vercel Blob. Каждый шаг
  идемпотентен: если артефакт шага уже в кэше — не пересчитываем.
- **`app/api/articles/[step]/route.ts`** — по эндпоинту на шаг (как
  `/api/posts/news` и `/api/posts`), потому что суммарно шаги дольше
  `maxDuration = 300`. Клиент-гейт гоняет шаги последовательно и показывает
  прогресс (как `PostsGenerateGate` → `CardsLoader`).
- **UI:** [ArticleForm.tsx](../app/components/ArticleForm.tsx) после сабмита
  переходит в режим прогресса (стадии шагов), в конце показывает ссылку на
  созданный Google Docs.

**Модель состояния job** (`ArticleJob`, в блобе по ключу `articles/<jobId>`):

```ts
type ArticleJob = {
  schemaVersion: number;
  jobId: string;            // хеш(briefUrl + keysUrl)
  input: { briefUrl: string; keysUrl: string | null };
  briefRaw?: string;                              // шаг 1 — сырой текст ТЗ
  keysRaw?: string | null;                        // шаг 1 — сырой текст ключей (если ссылка была)
  draftMd?: string;                               // шаг 2
  finalMd?: string;                               // шаг 3
  seo?: { url: string; metaTitle: string; metaDescription: string; heroPrompt: string }; // шаг 4
  heroImageUrl?: string;                          // шаг 5 (blob URL)
  styledHtml?: string;                            // шаг 6
  docUrl?: string;                                // шаг 7
  status: "running" | "done" | "error";
  error?: string;
  generatedAt: string;
};
```

**Модели и инструменты:**

| Что | Модель / сервис | ID |
| --- | --- | --- |
| Шаги 2–4 (текст, вычитка, SEO) | Claude Opus 4.8 | `claude-opus-4-8` |
| Шаг 5 (hero image) | Nano Banana (Google Gemini image) | `gemini-3-pro-image-preview` (Nano Banana Pro) или `gemini-2.5-flash-image` (точный ID подтвердить в доке Gemini) |

---

## Шаг 1 — Скачать ТЗ (и ключи)

**Вход:** `briefUrl` (обязательная, главная), `keysUrl` (опциональная).

**Решения:** доки всегда публичны (доступ по ссылке), авторизация не нужна.
**Парсер не пишем** — отдаём Клоду сырой текст ТЗ.

**Логика:**
- Качаем **brief** всегда; **keys** — только если ссылка передана.
- Качаем **на сервере** обычным `fetch` по export-URL Google (без сторонних
  библиотек — это просто HTTP GET, не «парсер»):
  - Google **Sheets** → `.../export?format=csv` (или `tsv`) — отдаёт текст;
  - Google **Docs** → `.../export?format=txt` (или `html`) — отдаёт текст;
  - иначе берём тело ответа как текст.
- **Почему не отдаём ссылку прямо Клоду:** ТЗ часто Google Sheets/xlsx — по
  «сырой» ссылке это бинарь (zip), Клод его не прочитает; плюс нам нужно самим
  поймать момент «файл недоступен», чтобы остановить пайплайн. GET export-URL
  решает оба вопроса и остаётся «без парсера».
- **Если файл недоступен** (не 200, пустое тело, или Google вернул HTML-страницу
  логина вместо контента) — **останавливаем пайплайн** и сообщаем об этом в UI
  (`status: "error"`, понятный текст: «ТЗ недоступно по ссылке, открой доступ
  „всем, у кого есть ссылка“»).

**Выход:** `briefRaw` (сырой текст ТЗ) и `keysRaw` (сырой текст ключей, если
ссылка была). Дальше оба куска просто кладутся в промпт Клода как есть.

---

## Шаг 2 — Сгенерировать статью по ТЗ

**Вход:** `briefRaw` (+ `keysRaw`, если был).

**Логика:** Opus 4.8 пишет статью **строго по ТЗ**. В промпте акцент на:
- **структуру** (заголовки/разделы из ТЗ),
- **длину** (требование по объёму из ТЗ),
- **ключи** — вписать естественно (ключи могут быть как в ТЗ, так и отдельным
  списком).

Системный промпт — авторский tone of voice (аналог `POSTS_PERSONA_PROMPT` в
`lib/persona.ts`, с `cache_control: ephemeral`).

**Выход:** `draftMd` — статья в markdown. Большой `max_tokens`. Можно вернуть
структурой `{ markdown, keysUsed[] }`, чтобы шаг 3 видел, какие ключи уже вписаны.

---

## Шаг 3 — Вычитка и добор ключей

**Вход:** `draftMd` + полный список ключей (`keysRaw`/из `briefRaw`) + требование
к длине из ТЗ.

**Логика:** второй вызов Opus 4.8 — редактор:
- вычитывает текст,
- **добавляет недостающие ключи** из списка (на шаге 2 их всегда вписывают
  маловато),
- проверяет и корректирует **длину**.

**Выход:** `finalMd` — финальный markdown + краткий отчёт (плотность ключей,
итоговая длина) для логов/UI.

---

## Шаг 4 — SEO-мета и промпт для hero-картинки

**Вход:** `finalMd`.

**Логика:** Opus 4.8 со `json_schema` output генерирует:
- `url` (слаг),
- `metaTitle`,
- `metaDescription`,
- `heroPrompt` — промпт для изображения.

**Ограничения для `heroPrompt`:** стиль космоса, с планетами / кометами /
ракетами, в центре робот или что-то подобное. **Цвета в промпте НЕ указывать.**

**Выход:** `seo = { url, metaTitle, metaDescription, heroPrompt }`.

---

## Шаг 5 — Hero-картинка через Nano Banana

**Решения:** идём напрямую в Google Gemini API (Nano Banana). Ключ — от тебя
(`GEMINI_API_KEY`). SDK — `@google/genai`. Модель — Nano Banana Pro
(`gemini-3-pro-image-preview`) как основная для 10 референсов; запасной вариант
`gemini-2.5-flash-image`.

**Вход:** `seo.heroPrompt` + 10 референсов (URL — список в конфиге/env).

**Логика:** вызываем Nano Banana с промптом и референсами. Из референсов берём
**общий стиль и композицию** и делаем **новую** картинку:
- старые изображения **не менять**,
- **текст на картинку не добавлять**.

Это формулируем прямо в промпте (Gemini одним запросом принимает текст + набор
входных картинок).

> **Нюанс с «по ссылке»:** Gemini сам по URL картинки **не качает** — на вход
> идут байты (inline base64 или Files API). Поэтому 10 референсов мы скачиваем на
> сервере (`fetch` каждого URL) и передаём как inline-данные. Для тебя это всё
> равно «дал ссылки», просто скачивание делаем мы. Если какой-то URL недоступен —
> пропускаем его, остальные идут в дело.

**Выход:** сгенерированное изображение → кладём в Vercel Blob, сохраняем
публичный `heroImageUrl` (понадобится для вставки в Google Docs на шаге 7).

---

## Шаг 6 — Форматирование текста статьи

**Вход:** `finalMd`.

**Логика:** прогоняем через наш форматтер
[lib/md-format.ts](../lib/md-format.ts):
- `markdownToStyledHtml(finalMd)` — для сборки тела документа, либо
- `markdownToStyledDocument(finalMd)` — готовый самодостаточный HTML со стилями
  `.doc-theme` (Arial, pt-размеры, центрированный `MsoTitle`, ссылки `#1155cc`).

**Выход:** `styledHtml`.

---

## Шаг 7 — Создать Google Docs в папке

**Вход:** `seo`, `heroImageUrl`, `styledHtml`, целевая папка Drive (folder ID из
конфига).

**Логика:** создаём документ в заданной папке и наполняем контентом **в
порядке**:
1. `url`
2. `metaTitle`
3. `metaDescription`
4. сгенерированная картинка (`heroImageUrl`)
5. отформатированный текст (`styledHtml`)

**Решение — HTML-импорт через Drive API:** собираем единый HTML (3 строки меты
как параграфы + `<img src=heroImageUrl>` + тело из `styledHtml`) и
`drive.files.create` с конвертацией в `application/vnd.google-apps.document`.
Google сам превращает HTML → Doc, переиспользуя наш форматтер; картинку тянет по
публичному URL (поэтому hero и лежит в блобе). Параметр `parents: [folderId]`
кладёт документ сразу в нужную папку.

> Если на проверке окажется, что конвертация съедает часть стилей или `<img>` —
> запасной план Б: `documents.batchUpdate` (`insertText` для меты +
> `insertInlineImage` для hero), но перенос `.doc-theme` в Docs-реквесты руками
> дороже. Стартуем с HTML-импорта.

**Про авторизацию (важно):** анонимной записи в Google Drive нет — «папка,
открытая по ссылке» позволяет редактировать людям в браузере, но создать
документ через API можно только от имени какого-то Google-аккаунта. Минимальный
путь — **один раз** выдать OAuth-доступ к твоему аккаунту и хранить refresh
token; дальше всё работает само. Пошаговый гайд — в разделе «Что нужно от тебя».

**Выход:** `docUrl` — ссылка на созданный документ, показываем в UI.

---

## Что нужно добавить

**Зависимости:**
- `googleapis` — Drive API (создание Doc из HTML, шаг 7).
- `@google/genai` — Gemini / Nano Banana (шаг 5).
- *(Парсер ТЗ не нужен — качаем сырой текст обычным `fetch`.)*

**Файлы:**
- `lib/articles.ts` — пайплайн.
- `app/api/articles/*` — пошаговые эндпоинты.
- Доработать [ArticleForm.tsx](../app/components/ArticleForm.tsx) — режим
  прогресса + финальная ссылка.
- `lib/google.ts` — OAuth + Drive-хелпер (создание Doc из HTML).

**Секреты / env:**
- `ANTHROPIC_API_KEY` (уже есть).
- `GEMINI_API_KEY` — Nano Banana (шаг 5).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — OAuth для
  Drive (шаг 7).
- `GOOGLE_DRIVE_FOLDER_ID` — папка, куда складывать документы.
- `ARTICLE_HERO_REFERENCES` — 10 URL референсов для hero (можно списком в коде).

---

## Что нужно от тебя (настройка доступов)

Три блока. Как сделаешь — пришли значения, я положу их в `.env.local`.

### A. Gemini / Nano Banana (шаг 5)
1. Открой <https://aistudio.google.com/apikey> → **Create API key**.
2. Пришли мне ключ → ляжет в `GEMINI_API_KEY`.
3. Скинь **10 ссылок-референсов** на картинки (прямые URL на изображения).

### B. Google Drive — OAuth-доступ к твоему аккаунту (шаг 7)
Это разовая настройка; полностью без авторизации Drive не умеет (см. шаг 7).
1. Зайди в <https://console.cloud.google.com/> → создай проект (или возьми
   существующий).
2. **APIs & Services → Library** → включи **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → тип **External** → заполни
   имя приложения и email (минимум) → в **Test users** добавь свой Google-аккаунт. Публиковать
   не нужно — режима Testing достаточно.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   тип **Desktop app** → скачаешь **Client ID** и **Client secret**.
5. Пришли мне Client ID + Client secret — я дам короткий скрипт/ссылку, ты один
   раз подтвердишь доступ в браузере, и мы получим **refresh token** (он и даёт
   доступ без повторных логинов). Эти три значения → `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

> Почему OAuth, а не «папка для всех»: создание файла через Drive API всегда идёт
> от имени аккаунта. OAuth с твоим аккаунтом — самый простой путь без
> подводных камней с квотами (у service account на личном Google создание Docs
> часто падает на квоте).

### C. Целевая папка (шаг 7)
1. Создай в своём Google Drive папку для статей.
2. Открой её — в URL после `/folders/` будет ID
   (`drive.google.com/drive/folders/**ВОТ_ЭТО**`).
3. Пришли мне ID → ляжет в `GOOGLE_DRIVE_FOLDER_ID`. Документы будут создаваться
   твоим аккаунтом прямо в ней; шарить отдельно не нужно (ты и так владелец).

### Итого прислать
- `GEMINI_API_KEY`
- 10 URL референсов
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (дальше вместе добудем refresh token)
- `GOOGLE_DRIVE_FOLDER_ID`
