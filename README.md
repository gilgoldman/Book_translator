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

## Stack

- Next.js 16 on Vercel
- Neon Postgres + pgvector (via the Vercel Marketplace), Drizzle ORM
- Vercel Blob for photos and voice notes
- Vercel AI SDK with Gemini 3.8 Flash. All vendor choices live in `src/lib/ai/models.ts`.
- Username/password login (invite-only), signed session cookie

## Setup

1. **Vercel project**: import this repo.
2. **Storage**: in the project's *Storage* tab add **Neon** (Postgres) and **Blob**. Their env vars are added for you.
3. **Env vars**: add the rest from `.env.example` (`AUTH_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `APP_URL`).
4. **Deploy**. Migrations run automatically during the build.
5. Open the site and sign in as `gilgoldman` (or `OWNER_USERNAME`) with the password you want:
   on an empty database only that username can create the owner account. Change it later under
   **Settings**.
6. Family and friends use **Request access** on the sign-in page; approve them under **Settings**.
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
3. Locally, with the same vars in `.env`: `npm run telegram:webhook`.
4. In Telegram send the bot `/login username password` (the message is deleted right away).

Then send photos (an album = one recipe), links, voice notes, pasted text, or questions:
`leeks, eggs, feta`, `I have a lot of leeks` (or `/lots leeks`), `no buttermilk` (or `/swap buttermilk`).
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

### Switching LLM vendor

Edit `src/lib/ai/models.ts` only: install the provider's `@ai-sdk/*` package and map the
`extract`, `enrich`, `quick` and `text` (embedding) roles to its models. Prompts and schemas are
shared. Voice notes need a model that accepts audio input. After changing the embedding model,
run `npm run reembed`.

## Design

`design/` holds the design research: `BRIEF.md`, three visual directions as static pages, and
`tokens.css` for the recommended one. Round 2 explores the chosen Linne direction in three warm-stone
palettes (`linne-*.html`). The app currently uses interim styling.
