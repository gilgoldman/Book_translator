import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, recipeColumns, recipes, sources, users } from "@/db";
import { isAiBusy } from "@/lib/ai/errors";
import { substituteContext, suggestSubstitutes } from "@/lib/ai/substitute";
import { hearVoiceNote } from "@/lib/ai/voice";
import { resolveDuplicate } from "@/lib/dedupe";
import { ingredientDiff } from "@/lib/dedupe-rules";
import { ingest, NotARecipeError, type IngestRequest } from "@/lib/ingest";
import { findIngredientLine, parseIngredientIntent } from "@/lib/ingredient-intent";
import { localName, localNames } from "@/lib/ingredient-names";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";
import { isRateLimited } from "@/lib/rate-limit";
import { searchRecipes } from "@/lib/search";
import { ensureTranslations, localizeRecipe } from "@/lib/translations";
import type { Attachment, Chat, Incoming, MessageRef, Person, RecipeView, Tap } from "./chat";
import { classifyText } from "./intent";
import { replyLocale, speaker, usualLocale, type Speaker } from "./language";
import { PERSONA } from "./persona";
import {
  duplicateButtons,
  esc,
  openButtons,
  renderAbundance,
  renderDuplicatePrompt,
  renderRecipe,
  renderResults,
  renderSubstitution,
  saveVoiceButtons,
  variant,
  viewButtons,
} from "./render";

// THE ASSISTANT: what it does with what someone sends it, on any channel. Its personality and
// words are in persona.ts; how its replies look, in render.ts. A channel (src/lib/channels)
// signs the person in, then hands each message to `onMessage` and each button tap to `onTap`,
// with a `Chat` that sends the replies (see chat.ts).

export type * from "./chat";

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") || undefined;

/** A recipe to file, a question, or a call for help. */
export async function onMessage(chat: Chat, person: Person, msg: Incoming) {
  const text = (msg.text ?? "").trim();
  const intent = text ? classifyText(text) : null;
  const t = speaker(replyLocale(person, chat.languageHint, text || msg.caption));
  if (intent?.kind === "start" || intent?.kind === "help") {
    await chat.send({ text: t("bot.help") });
    return;
  }

  const attachment = msg.attachment;
  if (attachment?.kind === "audio") return voiceNote(chat, person, msg, attachment);
  if (attachment) {
    return importAndReply(chat, person, t, msg.ref, async () => ({
      kind: attachment.kind,
      caption: msg.caption,
      files: await attachment.load(),
    }));
  }

  // A sticker, a PDF…: a one-line nudge, not the whole help.
  if (!intent) {
    await chat.send({ text: t("bot.nudge") });
    return;
  }
  if (intent.kind === "url") {
    return importAndReply(chat, person, t, msg.ref, async () => ({ kind: "url", url: intent.url }));
  }
  if (intent.kind === "import") {
    return importAndReply(chat, person, t, msg.ref, async () => ({ kind: "text", text: intent.text }));
  }
  return answer(chat, person, intent.query, t, msg.repliedToRecipe);
}

/** A button on one of the assistant's replies. */
export async function onTap(chat: Chat, person: Person, { action, on, voiceNote }: Tap) {
  // Answer in the language the buttons were written in.
  const t = speaker(action.locale ?? usualLocale(person, chat.languageHint));

  if (action.kind === "saveVoice") {
    if (voiceNote?.attachment.kind !== "audio") {
      await chat.send({ text: esc(t("bot.couldnt")) });
      return;
    }
    await chat.removeButtons(on);
    return importAndReply(chat, person, t, voiceNote.ref, async () => ({
      kind: "audio",
      caption: voiceNote.caption,
      files: await voiceNote.attachment.load(),
    }));
  }

  if (action.kind === "duplicate") {
    try {
      const id = await resolveDuplicate(action.recipeId, action.choice, { userId: person.id, isAdmin: person.isAdmin });
      return showRecipe(chat, person, id, "effective", t, on);
    } catch (err) {
      console.error("duplicate decision failed", err);
      await chat.send({ text: esc(t("bot.couldnt")) });
      return;
    }
  }

  if (action.kind === "open") return showRecipe(chat, person, action.recipeId, "effective", t);
  return showRecipe(chat, person, action.recipeId, action.view, t, on);
}

/** A question, typed or spoken: "I have a lot of…", "no…", or a search. */
async function answer(chat: Chat, person: Person, query: string, t: Speaker, repliedToRecipe?: string | null) {
  const ingredientIntent = parseIngredientIntent(query);
  if (ingredientIntent?.kind === "abundance") return abundanceReply(chat, ingredientIntent.ingredient, t);
  if (ingredientIntent?.kind === "substitute") return substituteReply(chat, person, ingredientIntent, t, repliedToRecipe);
  return searchAndReply(chat, query, t);
}

/**
 * A voice note is either a question for the cookbook or a recipe to save. A quick listen decides;
 * a question is answered under "I heard: …" with a button to save it as a recipe after all.
 * If the listen fails, it's imported as a recipe, as before.
 */
async function voiceNote(chat: Chat, person: Person, msg: Incoming, attachment: Attachment) {
  chat.react(msg.ref, "reading");
  chat.typing();
  const files = await attachment.load().catch(() => null);
  const heard = files?.[0]
    ? await hearVoiceNote(files[0], msg.caption).catch((err) => {
        console.error("voice note: couldn't tell question from recipe", err);
        return null;
      })
    : null;

  if (heard?.kind === "question" && heard.query) {
    const t = speaker(replyLocale(person, chat.languageHint, heard.query));
    await chat.send(
      { text: t("bot.heard", { query: esc(heard.query) }), buttons: saveVoiceButtons(t) },
      { replyTo: msg.ref },
    );
    await answer(chat, person, heard.query, t, msg.repliedToRecipe);
    chat.react(msg.ref, "answered");
    return;
  }
  const t = speaker(replyLocale(person, chat.languageHint, msg.caption));
  return importAndReply(chat, person, t, msg.ref, async () => ({
    kind: "audio",
    caption: msg.caption,
    // A failed download is tried once more here, where a failure gets its "couldn't read that".
    files: files ?? (await attachment.load()),
  }));
}

async function abundanceReply(chat: Chat, text: string, t: Speaker) {
  const name = await resolveIngredient(text);
  const [uses, pairs, label] = await Promise.all([
    recipesUsingMost(name, t.locale, PERSONA.lotsResults),
    goesWellWith(name, PERSONA.pairings),
    localName(name, t.locale),
  ]);
  const pairNames = await localNames(pairs.map((p) => p.name), t.locale);
  const localPairs = pairs.map((p) => ({ name: pairNames.get(p.name) ?? p.name }));
  await chat.send({
    text: renderAbundance(label, uses, localPairs, t),
    buttons: uses.length ? openButtons(uses, t) : undefined,
  });
}

async function substituteReply(
  chat: Chat,
  person: Person,
  { ingredient, candidate }: { ingredient: string; candidate?: string },
  t: Speaker,
  repliedToRecipe?: string | null,
) {
  if (await isRateLimited(`bot-swap:${person.id}`, PERSONA.swapsPerHour, 60 * 60)) {
    await chat.send({ text: t("bot.slowDown") });
    return;
  }
  const name = await resolveIngredient(ingredient);
  chat.typing();
  const inRecipe = await recipeInQuestion(person, repliedToRecipe, name, ingredient);
  const line = inRecipe?.recipe.ingredients[inRecipe.index];
  const [label, swaps] = await Promise.all([
    localName(line?.canonical ?? name, t.locale),
    inRecipe && line
      ? suggestSubstitutes(line.canonical, t.locale, substituteContext(inRecipe.recipe, inRecipe.index), candidate)
      : suggestSubstitutes(name, t.locale, undefined, candidate),
  ]);
  if (!inRecipe) {
    await chat.send({ text: renderSubstitution(label, swaps, t) });
    return;
  }
  const title = localizeRecipe(inRecipe.recipe, t.locale).recipe.title;
  await chat.send({
    text: renderSubstitution(label, swaps, t, title),
    buttons: openButtons([{ id: inRecipe.recipe.id, title }], t),
  });
}

/**
 * The recipe a "no buttermilk?" is about: the one they replied to, else the one the assistant
 * showed them last if that was recent. Only if it uses the ingredient; otherwise the answer is general.
 */
async function recipeInQuestion(person: Person, repliedToRecipe: string | null | undefined, name: string, said: string) {
  const id = repliedToRecipe || (await lastRecipeShown(person));
  if (!id) return null;
  const recipe = await db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: recipeColumns });
  if (!recipe) return null;
  const index = findIngredientLine(recipe.ingredients, name, said);
  return index < 0 ? null : { recipe, index };
}

// What they're looking at, per person. The columns are named for Telegram, where it began.

async function lastRecipeShown(person: Person) {
  const u = await db().query.users.findFirst({
    where: eq(users.id, person.id),
    columns: { telegramRecipeId: true, telegramRecipeAt: true },
  });
  const shownAt = u?.telegramRecipeAt?.getTime() ?? 0;
  return Date.now() - shownAt < PERSONA.recipeMemoryMinutes * 60_000 ? (u?.telegramRecipeId ?? null) : null;
}

async function rememberRecipeShown(person: Person, recipeId: string) {
  await db()
    .update(users)
    .set({ telegramRecipeId: recipeId, telegramRecipeAt: new Date() })
    .where(eq(users.id, person.id))
    .catch((err) => console.error("couldn't remember the recipe shown", err));
}

/**
 * Import what they sent, reacting on their message as it goes. When the AI is busy, retry the
 * whole import after PERSONA.busyRetryWaitsMs, but give up once the next try couldn't finish in time.
 */
async function importAndReply(
  chat: Chat,
  person: Person,
  t: Speaker,
  ref: MessageRef,
  build: () => Promise<IngestRequest>,
) {
  const started = Date.now();
  chat.react(ref, "reading");
  const status = await chat.send({ text: variant(t("bot.reading"), ref) });
  chat.typing();
  try {
    const req = await build();
    let result: Awaited<ReturnType<typeof ingest>> | null = null;
    let longestAttempt = 0;
    for (let attempt = 0; !result; attempt++) {
      const attemptStart = Date.now();
      try {
        result = await ingest(req, person.id, t.locale);
      } catch (err) {
        // Google's AI is overloaded: say so, then try again if another attempt as long as the
        // slowest one so far still ends within the time limit.
        longestAttempt = Math.max(longestAttempt, Date.now() - attemptStart);
        const wait = PERSONA.busyRetryWaitsMs[attempt];
        const timeLeft = PERSONA.busyGiveUpMs - (Date.now() - started);
        if (!isAiBusy(err) || wait === undefined || wait + longestAttempt > timeLeft) throw err;
        console.warn(`${chat.channel} import: AI busy, retrying in ${wait / 1000}s`);
        if (attempt === 0) await chat.edit(status, { text: esc(t("bot.busyRetrying")) });
        await new Promise((r) => setTimeout(r, wait));
        chat.typing();
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
      await chat.edit(status, {
        text: renderDuplicatePrompt(
          title(fresh),
          original ? title(original) : duplicate.title,
          { added: local(diff.added), removed: local(diff.removed) },
          t,
        ),
        buttons: duplicateButtons(recipeId, t),
      });
      return;
    }
    await showRecipe(chat, person, recipeId, "effective", t, status);
    chat.react(ref, "saved");
  } catch (err) {
    console.error(`${chat.channel} import failed`, err);
    const notRecipe = err instanceof NotARecipeError;
    chat.react(ref, notRecipe ? "notRecipe" : "failed");
    const key = notRecipe ? "err.notRecipe" : isAiBusy(err) ? "bot.stillBusy" : "bot.failed";
    await chat.edit(status, { text: esc(t(key)) });
  }
}

async function searchAndReply(chat: Chat, query: string, t: Speaker) {
  const results = await searchRecipes(query, t.locale, PERSONA.searchResults);
  if (results.length === 0) {
    await chat.send({ text: esc(t("bot.nothingFor", { query })) });
    return;
  }
  await chat.send({ text: renderResults(results, t), buttons: openButtons(results, t) });
}

/** Show a recipe in one view: in place of `replace` if given, else as a new reply. */
async function showRecipe(chat: Chat, person: Person, id: string, view: RecipeView, t: Speaker, replace?: MessageRef) {
  const load = () => db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: recipeColumns });
  let r = await load();
  if (!r) {
    await chat.send({ text: esc(t("bot.gone")) });
    return;
  }
  let localized = localizeRecipe(r, t.locale);
  if (localized.status === "pending") {
    // Nothing in their language yet, and we're off the request path: worth the wait.
    chat.typing();
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
  const reply = {
    text: renderRecipe(
      {
        ...localized.recipe,
        subtitle: r.title,
        addedBy: uploader ? uploader.displayName || uploader.username : null,
      },
      view,
      t,
      source ?? null,
    ),
    buttons: viewButtons(r.id, view, t, chat.appUrl ?? appUrl()),
  };
  await (replace === undefined ? chat.send(reply) : chat.edit(replace, reply));
  // What they're looking at now: a "no buttermilk?" next is about this recipe.
  await rememberRecipeShown(person, r.id);
}
