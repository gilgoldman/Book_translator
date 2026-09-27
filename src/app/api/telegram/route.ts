import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { db, pendingMedia, recipes, sources, users } from "@/db";
import { isAiBusy } from "@/lib/ai/errors";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import { checkCredentials } from "@/lib/auth";
import { resolveDuplicate } from "@/lib/dedupe";
import { ingredientDiff } from "@/lib/dedupe-rules";
import { DEFAULT_LOCALE, isLocale, matchLocale } from "@/lib/i18n/config";
import type { Translator } from "@/lib/i18n/translate";
import { translatorFor } from "@/lib/i18n/translator-for";
import { ingest, NotARecipeError, type IncomingFile, type IngestRequest } from "@/lib/ingest";
import { parseIngredientIntent } from "@/lib/ingredient-intent";
import { localName, localNames } from "@/lib/ingredient-names";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";
import { isRateLimited } from "@/lib/rate-limit";
import { searchRecipes } from "@/lib/search";
import { downloadFile, edit, send, tg, type TgMessage, type TgUpdate } from "@/lib/telegram";
import {
  classifyText,
  duplicateKeyboard,
  esc,
  parseCallback,
  parseDuplicateCallback,
  renderAbundance,
  renderDuplicatePrompt,
  renderRecipe,
  renderSubstitution,
  viewKeyboard,
  type TgView,
} from "@/lib/telegram-format";
import { ensureTranslations, localizeRecipe } from "@/lib/translations";

export const maxDuration = 300;

// Waits between whole-import retries when the AI is busy. The person never waits more than a minute between tries.
const BUSY_WAITS_MS = [20_000, 40_000, 60_000];

const ALBUM_WAIT_MS = 2500;
const appUrl = () => process.env.APP_URL?.replace(/\/$/, "");

/** Reply in the person's app language, else their Telegram language, else English. */
function translatorForChat(user: { locale: string | null } | null | undefined, languageCode?: string): Translator {
  const locale = isLocale(user?.locale) ? user.locale : (matchLocale(languageCode) ?? DEFAULT_LOCALE);
  return translatorFor(locale);
}

function secretMatches(given: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The approved user linked to this chat, if any. */
async function linkedUser(chatId: number) {
  return db().query.users.findFirst({
    where: and(eq(users.telegramChatId, chatId), eq(users.status, "approved")),
  });
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json()) as TgUpdate;
  // Answer Telegram at once; the slow work runs after the response.
  after(() =>
    handle(update).catch((err) => {
      console.error("telegram update failed", err);
    }),
  );
  return Response.json({ ok: true });
}

async function handle(update: TgUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const intent = text ? classifyText(text) : null;
  const language = msg.from?.language_code;

  if (intent?.kind === "login") {
    // Don't leave the password sitting in the chat.
    await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
    const before = translatorForChat(null, language);
    if (await isRateLimited(`tg-login:${chatId}`, 5, 15 * 60)) {
      return send(chatId, before("tg.tooManyLogins"));
    }
    const user = await checkCredentials(intent.username, intent.password);
    if (!user || user.status === "declined") return send(chatId, before("err.badLogin"));
    if (user.status === "pending") return send(chatId, before("tg.pending"));
    await db().update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await db().update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
    const t = translatorForChat(user, language);
    return send(chatId, `${esc(t("tg.connected", { name: user.displayName ?? user.username }))}\n\n${t("tg.help")}`);
  }

  const user = await linkedUser(chatId);
  if (!user) return send(chatId, translatorForChat(null, language)("tg.private"));
  const t = translatorForChat(user, language);
  if (intent?.kind === "start" || intent?.kind === "help") return send(chatId, t("tg.help"));

  // Media
  const media = pickMedia(msg);
  if (media) {
    if (msg.media_group_id) return collectAlbum(msg, media);
    return importAndReply(chatId, user.id, t, async () => ({
      kind: media.kind,
      caption: msg.caption,
      files: [await fetchFile(media.fileId, media.mediaType)],
    }));
  }

  if (!intent) return send(chatId, t("tg.help"));
  if (intent.kind === "url") return importAndReply(chatId, user.id, t, async () => ({ kind: "url", url: intent.url }));
  if (intent.kind === "import") return importAndReply(chatId, user.id, t, async () => ({ kind: "text", text: intent.text }));
  if (intent.kind === "search") {
    const ingredientIntent = parseIngredientIntent(intent.query);
    if (ingredientIntent?.kind === "abundance") return abundanceReply(chatId, ingredientIntent.ingredient, t);
    if (ingredientIntent?.kind === "substitute") return substituteReply(chatId, ingredientIntent.ingredient, t);
    return searchAndReply(chatId, intent.query, t);
  }
}

async function abundanceReply(chatId: number, text: string, t: Translator) {
  const name = await resolveIngredient(text);
  const [uses, pairs, label] = await Promise.all([
    recipesUsingMost(name, t.locale, 8),
    goesWellWith(name, 8),
    localName(name, t.locale),
  ]);
  const pairNames = await localNames(pairs.map((p) => p.name), t.locale);
  const localPairs = pairs.map((p) => ({ name: pairNames.get(p.name) ?? p.name }));
  return send(chatId, renderAbundance(label, uses, localPairs, t), {
    reply_markup: uses.length
      ? { inline_keyboard: uses.map((u, i) => [{ text: `${i + 1}. ${u.title}`.slice(0, 60), callback_data: `o:${u.id}` }]) }
      : undefined,
  });
}

async function substituteReply(chatId: number, text: string, t: Translator) {
  if (await isRateLimited(`tg-swap:${chatId}`, 30, 60 * 60)) return send(chatId, t("tg.slowDown"));
  const name = await resolveIngredient(text);
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  const [label, swaps] = await Promise.all([localName(name, t.locale), suggestSubstitutes(name, t.locale)]);
  return send(chatId, renderSubstitution(label, swaps, t));
}

function pickMedia(msg: TgMessage): { kind: "image" | "audio"; fileId: string; mediaType: string } | null {
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { kind: "image", fileId: largest.file_id, mediaType: "image/jpeg" };
  }
  if (msg.voice) return { kind: "audio", fileId: msg.voice.file_id, mediaType: msg.voice.mime_type ?? "audio/ogg" };
  if (msg.audio) return { kind: "audio", fileId: msg.audio.file_id, mediaType: msg.audio.mime_type ?? "audio/mpeg" };
  const doc = msg.document;
  if (doc?.mime_type?.startsWith("image/")) return { kind: "image", fileId: doc.file_id, mediaType: doc.mime_type };
  if (doc?.mime_type?.startsWith("audio/")) return { kind: "audio", fileId: doc.file_id, mediaType: doc.mime_type };
  return null;
}

async function fetchFile(fileId: string, mediaType: string): Promise<IncomingFile> {
  const ext = mediaType.split("/")[1]?.split(";")[0] ?? "bin";
  return { data: await downloadFile(fileId), mediaType, name: `telegram.${ext}` };
}

/** Park this photo; after a short wait, the handler holding the first photo imports the whole album. */
async function collectAlbum(msg: TgMessage, media: { kind: "image" | "audio"; fileId: string; mediaType: string }) {
  const groupId = msg.media_group_id!;
  await db()
    .insert(pendingMedia)
    .values({
      groupId,
      messageId: msg.message_id,
      chatId: msg.chat.id,
      fileId: media.fileId,
      mediaType: media.mediaType,
      caption: msg.caption ?? null,
    })
    .onConflictDoNothing();
  await new Promise((r) => setTimeout(r, ALBUM_WAIT_MS));

  const parts = await db()
    .select()
    .from(pendingMedia)
    .where(eq(pendingMedia.groupId, groupId))
    .orderBy(asc(pendingMedia.messageId));
  if (parts[0]?.messageId !== msg.message_id) return; // another handler owns this album

  await db().delete(pendingMedia).where(eq(pendingMedia.groupId, groupId));
  // Housekeeping for albums whose owner crashed.
  await db().delete(pendingMedia).where(lt(pendingMedia.createdAt, new Date(Date.now() - 3600_000)));

  const user = await linkedUser(msg.chat.id);
  if (!user) return;
  await importAndReply(msg.chat.id, user.id, translatorForChat(user, msg.from?.language_code), async () => ({
    kind: "image",
    caption: parts.find((p) => p.caption)?.caption ?? undefined,
    files: await Promise.all(parts.map((p) => fetchFile(p.fileId, p.mediaType))),
  }));
}

async function importAndReply(
  chatId: number,
  userId: string | null,
  t: Translator,
  build: () => Promise<IngestRequest>,
) {
  const started = Date.now();
  const status = await send(chatId, t("tg.reading"));
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  try {
    const req = await build();
    let result: Awaited<ReturnType<typeof ingest>> | null = null;
    let longestAttempt = 0;
    for (let attempt = 0; !result; attempt++) {
      const attemptStart = Date.now();
      try {
        result = await ingest(req, userId);
      } catch (err) {
        // Google's AI is overloaded: say so, then keep trying while this function has time left
        // for another attempt as long as the slowest one so far.
        longestAttempt = Math.max(longestAttempt, Date.now() - attemptStart);
        const wait = BUSY_WAITS_MS[attempt];
        const timeLeft = maxDuration * 1000 - (Date.now() - started);
        if (!isAiBusy(err) || wait === undefined || wait + longestAttempt + 10_000 > timeLeft) throw err;
        console.warn(`telegram import: AI busy, retrying in ${wait / 1000}s`);
        if (attempt === 0) await edit(chatId, status.message_id, esc(t("tg.busyRetrying")));
        await new Promise((r) => setTimeout(r, wait));
        void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
      }
    }
    const { recipeId, duplicate } = result;
    if (duplicate) {
      const [fresh, original] = await Promise.all([
        db().query.recipes.findFirst({ where: eq(recipes.id, recipeId) }),
        db().query.recipes.findFirst({ where: eq(recipes.id, duplicate.id) }),
      ]);
      const canonical = (list: { canonical: string }[] | undefined) => list?.map((i) => i.canonical) ?? [];
      const names = await localNames([...canonical(original?.ingredients), ...canonical(fresh?.ingredients)], t.locale);
      const diff = ingredientDiff(canonical(original?.ingredients), canonical(fresh?.ingredients));
      const local = (list: string[]) => list.map((n) => names.get(n) ?? n);
      const title = (r: typeof fresh) => (r ? localizeRecipe(r, t.locale).recipe.title : "");
      return edit(
        chatId,
        status.message_id,
        renderDuplicatePrompt(
          title(fresh),
          original ? title(original) : duplicate.title,
          { added: local(diff.added), removed: local(diff.removed) },
          t,
        ),
        { reply_markup: duplicateKeyboard(recipeId, t) },
      );
    }
    await showRecipe(chatId, recipeId, "effective", t, status.message_id);
  } catch (err) {
    console.error("telegram import failed", err);
    const key = err instanceof NotARecipeError ? "err.notRecipe" : isAiBusy(err) ? "tg.stillBusy" : "tg.failed";
    await edit(chatId, status.message_id, esc(t(key)));
  }
}

async function searchAndReply(chatId: number, query: string, t: Translator) {
  const results = (await searchRecipes(query, t.locale, 6)).slice(0, 6);
  if (results.length === 0) return send(chatId, esc(t("tg.nothingFor", { query })));
  const lines = results.map((r, i) => {
    const match = r.match
      ? ` — <i>${esc(r.match.missing ? t("tg.needsMore", { n: r.match.missing }) : t("tg.haveAll"))}</i>`
      : "";
    return `${i + 1}. ${esc(r.title)}${match}`;
  });
  return send(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: results.map((r, i) => [
        { text: `${i + 1}. ${r.title}`.slice(0, 60), callback_data: `o:${r.id}` },
      ]),
    },
  });
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) return;
  const user = await linkedUser(chatId);
  if (!user) return;
  const t = translatorForChat(user, cb.from?.language_code);

  const dup = parseDuplicateCallback(cb.data);
  if (dup) {
    try {
      const id = await resolveDuplicate(dup.id, dup.choice, { userId: user.id, isAdmin: user.isAdmin });
      return showRecipe(chatId, id, "effective", t, cb.message?.message_id);
    } catch (err) {
      console.error("duplicate decision failed", err);
      return send(chatId, esc(t("tg.couldnt")));
    }
  }

  const parsed = parseCallback(cb.data);
  if (!parsed) return;
  await showRecipe(chatId, parsed.id, parsed.view, t, parsed.open ? undefined : cb.message?.message_id);
}

async function showRecipe(chatId: number, id: string, view: TgView, t: Translator, messageId?: number) {
  let r = await db().query.recipes.findFirst({ where: eq(recipes.id, id) });
  if (!r) return send(chatId, esc(t("tg.gone")));
  // We're already off the request path, so an older recipe can be translated right here.
  if (localizeRecipe(r, t.locale).status === "pending") {
    await ensureTranslations(r.id, [t.locale]);
    r = (await db().query.recipes.findFirst({ where: eq(recipes.id, id) })) ?? r;
  }
  const localized = localizeRecipe(r, t.locale);
  const source =
    view === "source" && r.sourceId
      ? ((await db().query.sources.findFirst({ where: eq(sources.id, r.sourceId) })) ?? null)
      : null;
  const uploader = r.createdBy
    ? await db().query.users.findFirst({ where: eq(users.id, r.createdBy), columns: { displayName: true, username: true } })
    : null;
  const text = renderRecipe(
    {
      ...localized.recipe,
      subtitle: r.title,
      addedBy: uploader ? uploader.displayName || uploader.username : null,
    },
    view,
    t,
    source,
  );
  const reply_markup = viewKeyboard(r.id, view, t, appUrl());
  return messageId ? edit(chatId, messageId, text, { reply_markup }) : send(chatId, text, { reply_markup });
}
