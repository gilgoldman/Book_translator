<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project map

A family cookbook (Next.js on Vercel, Neon Postgres, Gemini via the AI SDK); README.md has the
details. Where to look:

- `src/lib/assistant/`: the chat bot's brain, channel-neutral. `persona.ts` holds its
  personality (words in every app language, reactions, look, limits); `index.ts` handles
  messages (`onMessage`) and button taps (`onTap`); `chat.ts` is the contract a channel
  implements. Nothing here may import a channel.
- `src/lib/channels/telegram/`: the Telegram channel. Callback data formats in `codec.ts` are
  fixed: buttons already in people's chats use them. `settings.ts` is Telegram-only words,
  synced to Telegram on deploy by `scripts/telegram-sync.ts`.
- `src/lib/ingest/`, `src/lib/ai/`: importing recipes, and every model choice (`models.ts`).
- `src/lib/i18n/`: app words per language; recipes are translated in `src/lib/translations.ts`.

Checks before pushing: `npm run typecheck`, `npm run lint`, `npm test`.
