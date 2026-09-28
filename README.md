# Cookbook

A private, searchable family cookbook. Send it a photo, a link, a voice note or pasted text
(on the web or through Telegram); an LLM files it as a structured recipe with four views:

- **Effective**: short ingredient recap, then steps with the quantities written in.
- **Classic**: the usual ingredient list + method.
- **Ratios**: the recipe's core in whole parts by weight, after Michael Ruhlman's *Ratio*.
- **Source**: the original photo, voice note, page text or link.

Search understands pantry lists ("leeks, eggs, feta"), names, and vague memories
("that lemony chicken thing"). Ingredient-first questions work too: "I have a lot of leeks"
lists recipes that use the most, "I don't have buttermilk" suggests swaps (also per ingredient,
in the context of a recipe). New imports that look like a recipe already in the book are
parked until someone picks keep original / replace / keep both.

Steps carry tap-to-start timers. Any recipe can be shared as a read-only link. Text size
(three steps) and a high-contrast mode are one tap away; text contrast meets WCAG AAA.

The app speaks **English and Hebrew** (right to left). Each person picks a language once (it
follows them to every device and to the Telegram bot); before sign-in, the browser's language
decides, and a button at the top switches. Every recipe is stored as it came in plus a
translation into each other app language, made on import: only the words are translated, so
quantities, timers, ratios and the units switch are shared. Readers can always flip to the
original. Search and "I have a lot of…" / "I don't have…" work in both languages.

## Stack

- Next.js 16 on Vercel
- Neon Postgres + pgvector (via the Vercel Marketplace), Drizzle ORM
- Vercel Blob for photos and voice notes
- Vercel AI SDK with Gemini 3.8 Flash, falling back to Gemini 3.5 Flash while 3.8 is overloaded. All vendor choices live in `src/lib/ai/models.ts`.
- Username/password login (invite-only), signed session cookie

## Setup

1. **Vercel project**: import this repo.
2. **Storage**: in the project's *Storage* tab add **Neon** (Postgres) and **Blob**. Their env vars are added for you.
3. **Env vars**: add the rest from `.env.example` (`AUTH_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `APP_URL`).
4. **Deploy**. Migrations run automatically during the build.
5. Open the site and sign in as `gilgoldman` (or `OWNER_USERNAME`) with the password you want:
   on an empty database only that username can create the owner account. Change it later under
   **Settings**.
6. Family and friends use **Ask for access** on the sign-in page; approve them under **People**.
   Everyone manages their name, picture, password and the recipes they added under their profile;
   every recipe shows who added it.
   Approved members can add recipes, notes and photos; changing tags or deleting is limited to
   whoever added the recipe, and managing people to the owner.

### Security on Vercel

Built in: bcrypt (cost 12), signed `__Host-` session cookie, sessions revoked on password
change or removed access, invite/approval flow, per-IP and per-username throttling in Postgres,
Vercel BotID on sign-in and registration, strict security headers (CSP, HSTS, frame denial).

Recommended in the Vercel dashboard (free on Hobby):

1. **Firewall → Configure → Bot Protection**: turn on BotID (and Deep Analysis if your plan has it).
2. **Firewall → Rules → New rule**: rate limit `POST` requests with a `Next-Action` header, e.g. 30 per
   minute per IP, action *Deny*.
3. **Settings → Deployment Protection**: keep *Vercel Authentication* on for Preview deployments.
4. Use a long random `AUTH_SECRET`; rotating it signs everyone out.

### Telegram bot (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather), copy its token.
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (any random string) and `TELEGRAM_BOT_USERNAME` in Vercel, redeploy.
   Every production deploy points the bot at the app and sets its `/` menu and profile in
   English and Hebrew (the build log says "Telegram bot synced"). No terminal needed.
3. In Telegram send the bot `/login username password` (the message is deleted right away).

**Changing the bot**: its personality is one file, `src/lib/assistant/persona.ts`: everything
it says (in both languages), its reactions, look and limits. Edit it and deploy. Only Telegram's
`/` menu, profile and sign-in words are in `src/lib/channels/telegram/settings.ts`.

It answers in the language you write to it in. Send photos (an album = one recipe), links,
voice notes, pasted text, or questions:
`leeks, eggs, feta`, `I have a lot of leeks` (or `/lots leeks`), `no buttermilk` (or `/swap buttermilk`).
Questions can be voice notes too: a quick listen tells a question from a dictated recipe. A question
is answered under "I heard: …", with a button to save it as a recipe if it was one after all.
Duplicate imports come back with Keep original / Replace / Keep both buttons.

## Development

```bash
cp .env.example .env   # fill in DATABASE_URL etc.
npm install
npm run db:migrate
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate`.

Prompt or format changes: bumping `PROMPT_VERSION` (`src/lib/translations.ts`) or
`ENRICHMENT_VERSION` (`src/lib/recipe-types.ts`) marks every translation or effective view as
out of date. Readers keep seeing the older translation while a new one is made on their next
view; to redo them all at once, deploy and then run `npm run translate`.

### Adding a language

1. Add it to `LOCALES` in `src/lib/i18n/config.ts`.
2. Copy `src/lib/i18n/messages/en.ts` to `<code>.ts`, translate, and register it in
   `messages/index.ts`. TypeScript and `i18n.test.ts` flag any missing string or placeholder.
3. Deploy, then `npm run translate` to give existing recipes and ingredients the new language
   (recipes also translate themselves the first time someone opens them in it).
4. Optional: phrasing for "I have a lot of…" in `src/lib/ingredient-intent.ts`.

### Adding a chat channel

The assistant (`src/lib/assistant`) knows nothing about Telegram; Telegram is one channel
(`src/lib/channels/telegram`). Another one, say WhatsApp, is a folder next to it that:

1. Receives messages (a webhook in `src/app/api/<channel>/route.ts`) and knows who is writing
   (Telegram links a chat to an account with `/login`).
2. Hands each message to `onMessage` and each button tap to `onTap`, with a `Chat` that sends
   the replies. `src/lib/assistant/chat.ts` lists what a channel gives and gets.
3. Turns the replies' rich text (`<b>`, `<i>`, `<code>`) and buttons into its own format.

`src/lib/assistant/index.test.ts` drives the assistant through a pretend channel.

### Switching LLM vendor

Edit `src/lib/ai/models.ts` only: install the provider's `@ai-sdk/*` package and map the
`extract`, `enrich`, `translate`, `quick` and `text` (embedding) roles to its models. Prompts and schemas are
shared. Voice notes need a model that accepts audio input. After changing the embedding model,
run `npm run reembed`.

## Design

`design/` holds the design research: `BRIEF.md`, three visual directions as static pages, and
`tokens.css` for the recommended one. Round 2 explores the chosen Linne direction in three warm-stone
palettes (`linne-*.html`). The app uses **Old book** (`linne-oldbook.html`); its tokens are in
`src/app/globals.css`, generated from `design/linne-tokens.css`.

Setup checklist for the owner: `docs/setup-todo.html`.
