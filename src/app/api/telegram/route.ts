import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { db, pendingMedia, recipeColumns, recipes, sources, users } from "@/db";
import { isAiBusy } from "@/lib/ai/errors";
import { substituteContext, suggestSubstitutes } from "@/lib/ai/substitute";
import { hearVoiceNote } from "@/lib/ai/voice";
import { checkCredentials } from "@/lib/auth";
import { resolveDuplicate } from "@/lib/dedupe";
import { ingredientDiff } from "@/lib/dedupe-rules";
import { DEFAULT_LOCALE, detectLocale, isLocale, matchLocale, type Locale } from "@/lib/i18n/config";
import { ingest, NotARecipeError, type IncomingFile, type IngestRequest } from "@/lib/ingest";
import { findIngredientLine, parseIngredientIntent } from "@/lib/ingredient-intent";
import { localName, localNames } from "@/lib/ingredient-names";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";
import { isRateLimited } from "@/lib/rate-limit";
import { searchRecipes } from "@/lib/search";
import { downloadFile, edit, react, send, tg, typing, type TgMessage, type TgUpdate } from "@/lib/telegram";
import { BOT } from "@/lib/telegram-bot";
import {
  botTranslator,
  classifyText,
  duplicateKeyboard,
  esc,
  openKeyboard,
  parseCallback,
  parseDuplicateCallback,
  parseSaveVoiceCallback,
  recipeIdOf,
  renderAbundance,
  renderDuplicatePrompt,
  renderRecipe,
  renderResults,
  renderSubstitution,
  saveVoiceKeyboard,
  variant,
  viewKeyboard,
  type BotTranslator,
  type TgView,
} from "@/lib/telegram-format";
import { ensureTranslations, localizeRecipe } from "@/lib/translations";

export const maxDuration = 300;

// How the bot behaves and what it says: src/lib/telegram-bot.ts.

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "");

/** The person's app language, else their Telegram language, else English. */
function chatLocale(user: { locale: string | null } | null | undefined, languageCode?: string): Locale {
  return isLocale(user?.locale) ? user.locale : (matchLocale(languageCode) ?? DEFAULT_LOCALE);
}

/** Answer in the language they wrote to us in (Hebrew or English), else as `chatLocale`. */
function translatorForChat(
  user: { locale: string | null } | null | undefined,
  languageCode?: string,
  said?: string | null,
): BotTranslator {
  const written = BOT.followWrittenLanguage ? detectLocale(said) : null;
  return botTranslator(written ?? chatLocale(user, languageCode));
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
    columns: { id: true, locale: true, isAdmin: true },
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
  // What they typed sets the reply's language; a login's words are just a username and password.
  const said = intent?.kind === "login" ? null : text || msg.caption;

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
  if (!user) return send(chatId, translatorForChat(null, language, said)("tg.private"));
  const t = translatorForChat(user, language, said);
  if (intent?.kind === "start" || intent?.kind === "help") return send(chatId, t("tg.help"));

  // Media
  const media = pickMedia(msg);
  if (media) {
    if (msg.media_group_id) return collectAlbum(msg, media);
    if (media.kind === "audio") return voiceNote(msg, media, user, language);
    return importAndReply(chatId, user.id, t, msg.message_id, async () => ({
      kind: media.kind,
      caption: msg.caption,
      files: [await fetchFile(media.fileId, media.mediaType)],
    }));
  }

  // A sticker, a PDF…: a one-line nudge, not the whole help.
  if (!intent) return send(chatId, t("tg.nudge"));
  if (intent.kind === "url") {
    return importAndReply(chatId, user.id, t, msg.message_id, async () => ({ kind: "url", url: intent.url }));
  }
  if (intent.kind === "import") {
    return importAndReply(chatId, user.id, t, msg.message_id, async () => ({ kind: "text", text: intent.text }));
  }
  if (intent.kind === "search") return answer(chatId, intent.query, t, { userId: user.id, replyTo: msg.reply_to_message });
}

/** Who asked, and the message they replied to, if any: a recipe there is what "no…" is about. */
type Asker = { userId: string; replyTo?: TgMessage };

/** A question, typed or spoken: "I have a lot of…", "no…", or a search. */
async function answer(chatId: number, query: string, t: BotTranslator, asker: Asker) {
  const ingredientIntent = parseIngredientIntent(query);
  if (ingredientIntent?.kind === "abundance") return abundanceReply(chatId, ingredientIntent.ingredient, t);
  if (ingredientIntent?.kind === "substitute") return substituteReply(chatId, ingredientIntent, t, asker);
  return searchAndReply(chatId, query, t);
}

/**
 * A voice note is either a question for the cookbook or a recipe to save. A quick listen decides;
 * a question is answered under "I heard: …" with a button to save it as a recipe after all.
 * If the listen fails, it's imported as a recipe, as before.
 */
async function voiceNote(
  msg: TgMessage,
  media: { kind: "image" | "audio"; fileId: string; mediaType: string },
  user: { id: string; locale: string | null },
  language?: string,
) {
  const chatId = msg.chat.id;
  react(chatId, msg.message_id, BOT.reactions.reading);
  typing(chatId);
  const file = await fetchFile(media.fileId, media.mediaType).catch(() => null);
  const heard = file
    ? await hearVoiceNote(file, msg.caption).catch((err) => {
        console.error("voice note: couldn't tell question from recipe", err);
        return null;
      })
    : null;

  if (heard?.kind === "question" && heard.query) {
    const t = translatorForChat(user, language, heard.query);
    await send(chatId, t("tg.heard", { query: esc(heard.query) }), {
      reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      reply_markup: saveVoiceKeyboard(t),
    });
    await answer(chatId, heard.query, t, { userId: user.id, replyTo: msg.reply_to_message });
    react(chatId, msg.message_id, BOT.reactions.answered);
    return;
  }
  const t = translatorForChat(user, language, msg.caption);
  return importAndReply(chatId, user.id, t, msg.message_id, async () => ({
    kind: "audio",
    caption: msg.caption,
    // A failed download is tried once more here, where a failure gets its "couldn't read that".
    files: [file ?? (await fetchFile(media.fileId, media.mediaType))],
  }));
}

async function abundanceReply(chatId: number, text: string, t: BotTranslator) {
  const name = await resolveIngredient(text);
  const [uses, pairs, label] = await Promise.all([
    recipesUsingMost(name, t.locale, BOT.lotsResults),
    goesWellWith(name, BOT.pairings),
    localName(name, t.locale),
  ]);
  const pairNames = await localNames(pairs.map((p) => p.name), t.locale);
  const localPairs = pairs.map((p) => ({ name: pairNames.get(p.name) ?? p.name }));
  return send(chatId, renderAbundance(label, uses, localPairs, t), {
    reply_markup: uses.length ? openKeyboard(uses, t) : undefined,
  });
}

async function substituteReply(
  chatId: number,
  { ingredient, candidate }: { ingredient: string; candidate?: string },
  t: BotTranslator,
  asker: Asker,
) {
  if (await isRateLimited(`tg-swap:${chatId}`, BOT.swapsPerHour, 60 * 60)) return send(chatId, t("tg.slowDown"));
  const name = await resolveIngredient(ingredient);
  typing(chatId);
  const inRecipe = await recipeInQuestion(asker, name, ingredient);
  const line = inRecipe?.recipe.ingredients[inRecipe.index];
  const [label, swaps] = await Promise.all([
    localName(line?.canonical ?? name, t.locale),
    inRecipe && line
      ? suggestSubstitutes(line.canonical, t.locale, substituteContext(inRecipe.recipe, inRecipe.index), candidate)
      : suggestSubstitutes(name, t.locale, undefined, candidate),
  ]);
  if (!inRecipe) return send(chatId, renderSubstitution(label, swaps, t));
  const title = localizeRecipe(inRecipe.recipe, t.locale).recipe.title;
  return send(chatId, renderSubstitution(label, swaps, t, title), {
    reply_markup: openKeyboard([{ id: inRecipe.recipe.id, title }], t),
  });
}

/**
 * The recipe a "no buttermilk?" is about: the one they replied to, else the one the bot showed
 * them last if that was recent. Only if it uses the ingredient; otherwise the answer is general.
 */
async function recipeInQuestion(asker: Asker, name: string, said: string) {
  let id = recipeIdOf(asker.replyTo?.reply_markup);
  if (!id) {
    const u = await db().query.users.findFirst({
      where: eq(users.id, asker.userId),
      columns: { telegramRecipeId: true, telegramRecipeAt: true },
    });
    const shownAt = u?.telegramRecipeAt?.getTime() ?? 0;
    if (Date.now() - shownAt < BOT.recipeMemoryMinutes * 60_000) id = u?.telegramRecipeId ?? null;
  }
  if (!id) return null;
  const recipe = await db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: recipeColumns });
  if (!recipe) return null;
  const index = findIngredientLine(recipe.ingredients, name, said);
  return index < 0 ? null : { recipe, index };
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
  await new Promise((r) => setTimeout(r, BOT.albumWaitMs));

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
  const caption = parts.find((p) => p.caption)?.caption ?? undefined;
  const t = translatorForChat(user, msg.from?.language_code, caption);
  await importAndReply(msg.chat.id, user.id, t, parts[0].messageId, async () => ({
    kind: "image",
    caption,
    files: await Promise.all(parts.map((p) => fetchFile(p.fileId, p.mediaType))),
  }));
}

/**
 * Import what they sent, reacting on their message as it goes. When the AI is busy, retry the
 * whole import after BOT.busyRetryWaitsMs, but give up once the next try couldn't finish in time.
 */
async function importAndReply(
  chatId: number,
  userId: string | null,
  t: BotTranslator,
  messageId: number,
  build: () => Promise<IngestRequest>,
) {
  const started = Date.now();
  react(chatId, messageId, BOT.reactions.reading);
  const status = await send(chatId, variant(t("tg.reading"), messageId));
  typing(chatId);
  try {
    const req = await build();
    let result: Awaited<ReturnType<typeof ingest>> | null = null;
    let longestAttempt = 0;
    for (let attempt = 0; !result; attempt++) {
      const attemptStart = Date.now();
      try {
        result = await ingest(req, userId, t.locale);
      } catch (err) {
        // Google's AI is overloaded: say so, then try again if another attempt as long as the
        // slowest one so far still ends within the time limit.
        longestAttempt = Math.max(longestAttempt, Date.now() - attemptStart);
        const wait = BOT.busyRetryWaitsMs[attempt];
        const timeLeft = BOT.busyGiveUpMs - (Date.now() - started);
        if (!isAiBusy(err) || wait === undefined || wait + longestAttempt > timeLeft) throw err;
        console.warn(`telegram import: AI busy, retrying in ${wait / 1000}s`);
        if (attempt === 0) await edit(chatId, status.message_id, esc(t("tg.busyRetrying")));
        await new Promise((r) => setTimeout(r, wait));
        typing(chatId);
      }
    }
    const { recipeId, duplicate } = result;
    // Looks familiar: the "reading" reaction stays while they choose.
    if (duplicate) {
      const [fresh, original] = await Promise.all([
        db().query.recipes.findFirst({ where: eq(recipes.id, recipeId), columns: recipeColumns }),
        db().query.recipes.findFirst({ where: eq(recipes.id, duplicate.id), columns: recipeColumns }),
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
    react(chatId, messageId, BOT.reactions.saved);
  } catch (err) {
    console.error("telegram import failed", err);
    const notRecipe = err instanceof NotARecipeError;
    react(chatId, messageId, notRecipe ? BOT.reactions.notRecipe : BOT.reactions.failed);
    const key = notRecipe ? "err.notRecipe" : isAiBusy(err) ? "tg.stillBusy" : "tg.failed";
    await edit(chatId, status.message_id, esc(t(key)));
  }
}

async function searchAndReply(chatId: number, query: string, t: BotTranslator) {
  const results = await searchRecipes(query, t.locale, BOT.searchResults);
  if (results.length === 0) return send(chatId, esc(t("tg.nothingFor", { query })));
  return send(chatId, renderResults(results, t), { reply_markup: openKeyboard(results, t) });
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) return;
  const user = await linkedUser(chatId);
  if (!user) return;
  const dup = parseDuplicateCallback(cb.data);
  const saveVoice = dup ? null : parseSaveVoiceCallback(cb.data);
  const parsed = dup || saveVoice ? null : parseCallback(cb.data);
  // Answer in the language the buttons were written in.
  const t = botTranslator(dup?.locale ?? saveVoice?.locale ?? parsed?.locale ?? chatLocale(user, cb.from?.language_code));

  if (saveVoice) {
    // "I heard: …" replies to the voice note, so that's where the recipe is.
    const voice = cb.message?.reply_to_message;
    const media = voice && pickMedia(voice);
    if (!voice || media?.kind !== "audio") return send(chatId, esc(t("tg.couldnt")));
    await tg("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cb.message!.message_id,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
    return importAndReply(chatId, user.id, t, voice.message_id, async () => ({
      kind: "audio",
      caption: voice.caption,
      files: [await fetchFile(media.fileId, media.mediaType)],
    }));
  }

  if (dup) {
    try {
      const id = await resolveDuplicate(dup.id, dup.choice, { userId: user.id, isAdmin: user.isAdmin });
      return showRecipe(chatId, id, "effective", t, cb.message?.message_id);
    } catch (err) {
      console.error("duplicate decision failed", err);
      return send(chatId, esc(t("tg.couldnt")));
    }
  }

  if (!parsed) return;
  await showRecipe(chatId, parsed.id, parsed.view, t, parsed.open ? undefined : cb.message?.message_id);
}

async function showRecipe(chatId: number, id: string, view: TgView, t: BotTranslator, messageId?: number) {
  const load = () => db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: recipeColumns });
  let r = await load();
  if (!r) return send(chatId, esc(t("tg.gone")));
  let localized = localizeRecipe(r, t.locale);
  if (localized.status === "pending") {
    // Nothing in their language yet, and we're off the request path: worth the wait.
    typing(chatId);
    await ensureTranslations(id, [t.locale]);
    r = (await load()) ?? r;
    localized = localizeRecipe(r, t.locale);
  } else if (localized.refresh) {
    // An older translation is fine for now; the new one is made after this reply.
    after(() => ensureTranslations(id, [t.locale]));
  }
  const { sourceId, createdBy } = r;
  const [source, uploader] = await Promise.all([
    view === "source" && sourceId ? db().query.sources.findFirst({ where: eq(sources.id, sourceId) }) : null,
    createdBy
      ? db().query.users.findFirst({ where: eq(users.id, createdBy), columns: { displayName: true, username: true } })
      : null,
  ]);
  const text = renderRecipe(
    {
      ...localized.recipe,
      subtitle: r.title,
      addedBy: uploader ? uploader.displayName || uploader.username : null,
    },
    view,
    t,
    source ?? null,
  );
  const reply_markup = viewKeyboard(r.id, view, t, appUrl());
  await (messageId ? edit(chatId, messageId, text, { reply_markup }) : send(chatId, text, { reply_markup }));
  // What they're looking at now: a "no buttermilk?" next is about this recipe.
  await db()
    .update(users)
    .set({ telegramRecipeId: r.id, telegramRecipeAt: new Date() })
    .where(eq(users.telegramChatId, chatId))
    .catch((err) => console.error("couldn't remember the recipe shown", err));
}
