import { formatDuration, formatMinutes } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { createTranslator, type MessageKey, type Translator } from "@/lib/i18n/translate";
import { segmentText, type Enrichment, type Ingredient, type Step, type Substitution } from "@/lib/recipe-types";
import { BOT, BOT_WORDS, type BotKey } from "@/lib/telegram-bot";

// Pure renderers for the Telegram bot (HTML parse mode, 4096-char limit). What it says and
// how it looks is set in telegram-bot.ts.

/** The bot's words plus the app's, in one language. */
export type BotTranslator = Translator<MessageKey | BotKey>;

export const botTranslator = (locale: Locale): BotTranslator =>
  createTranslator<MessageKey | BotKey>(locale, { ...MESSAGES[locale], ...BOT_WORDS[locale] });

export const TG_VIEWS = ["effective", "classic", "ratios", "source"] as const;
export type TgView = (typeof TG_VIEWS)[number];

export type TgRecipe = {
  id: string;
  title: string;
  /** Shown under the title, e.g. the original title of a translated recipe. */
  subtitle?: string | null;
  cuisine: string;
  course: string;
  season: string;
  totalMinutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  enrichment: Enrichment | null;
  addedBy?: string | null;
};

export type TgSource = { kind: string; url: string | null; files: { url: string; mediaType: string }[]; text: string | null } | null;

const LIMIT = 4000;

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/** 1️⃣ … 🔟, then "11." and on. */
export const num = (n: number) => KEYCAPS[n - 1] ?? `${n}.`;

/** One of a message's "|"-separated variants, the same one for the same seed. */
export const variant = (text: string, seed: number) => {
  const all = text.split("|");
  return all[Math.abs(seed) % all.length];
};

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(s: string) {
  return s.length > LIMIT ? s.slice(0, LIMIT - 20).replace(/<[^>]*$/, "") + "\n…" : s;
}

/** Button labels are cut short; never in the middle of an emoji. */
const buttonText = (s: string, max = 60) => [...s].slice(0, max).join("");

/** A category's label, or the stored value if it isn't one we know. */
function category(t: BotTranslator, kind: string, value: string) {
  const key = `${kind}.${value}` as MessageKey;
  const label = t(key);
  return label === key ? value : label;
}

function header(r: TgRecipe, t: BotTranslator) {
  const time = formatMinutes(r.totalMinutes, t);
  const meta = [
    category(t, "cuisine", r.cuisine),
    category(t, "course", r.course),
    `${BOT.look.season[r.season] ?? ""} ${category(t, "season", r.season)}`.trim(),
    time && `⏱ ${time}`,
    r.servings && t("tg.makes", { n: r.servings }),
  ]
    .filter(Boolean)
    .join(" · ");
  const sub = r.subtitle && r.subtitle !== r.title ? `\n<i>${esc(r.subtitle)}</i>` : "";
  const by = r.addedBy ? `\n🧑‍🍳 ${esc(t("common.addedBy", { name: r.addedBy }))}` : "";
  return `${BOT.look.course[r.course] ?? "🍴"} <b>${esc(r.title)}</b>${sub}\n<i>${esc(meta)}</i>${by}`;
}

const timerNote = (timers: { label: string; seconds: number }[], t: BotTranslator) =>
  timers.length
    ? `  ⏱ ${timers.map((x) => `${esc(x.label.toLowerCase())} ${formatDuration(x.seconds, t)}`).join(", ")}`
    : "";

const bar = (parts: number, k: number) =>
  BOT.look.ratioBars[k % BOT.look.ratioBars.length].repeat(Math.min(12, Math.max(1, Math.round(parts))));

export function renderRecipe(r: TgRecipe, view: TgView, t: BotTranslator, source: TgSource = null): string {
  const parts = [header(r, t), ""];

  if (view === "effective" && r.enrichment) {
    const e = r.enrichment;
    parts.push(e.recap.map((x) => `• ${x.metric ? `${esc(x.metric)} ` : ""}${esc(x.name)}`).join("\n"), "");
    e.effectiveSteps.forEach((s, i) => {
      const text = s.segments
        .map((seg) => (seg.ingredient === null ? esc(seg.text) : `<b>${seg.metric ? esc(seg.metric) + " " : ""}${esc(segmentText(seg, r.ingredients))}</b>`))
        .join("");
      parts.push(`${num(i + 1)} ${text}${timerNote(s.timers, t)}`);
    });
  } else if (view === "ratios" && r.enrichment) {
    const x = r.enrichment.ratio;
    if (x.family) parts.push(`⚖️ <b>${esc(x.family)}</b>`);
    parts.push(`<code>${esc(x.formula)}</code>`, "");
    x.components.forEach((c, k) => {
      parts.push(`${bar(c.parts, k)} ${c.parts} ${esc(c.name)}${c.grams ? ` (${Math.round(c.grams)} g)` : ""}`);
    });
    if (x.extras.length) parts.push("", ...x.extras.map((e) => `• ${esc(e.name)}: ${esc(e.amount)}`));
    parts.push("", `💡 <i>${esc(x.insight)}</i>`);
  } else if (view === "source") {
    if (!source) parts.push(`<i>${esc(t("tg.noOriginal"))}</i>`);
    else {
      if (source.url) parts.push(`🔗 ${esc(source.url)}`);
      for (const f of source.files) parts.push(`${f.mediaType.startsWith("audio/") ? "🎙" : "🖼"} ${esc(f.url)}`);
      if (source.text) parts.push("", esc(source.text.slice(0, 2500)));
    }
  } else {
    parts.push(r.ingredients.map((i) => `• ${esc(i.metric ?? i.original)}${i.metric ? ` ${esc(i.name)}` : ""}`).join("\n"), "");
    r.steps.forEach((s, i) => parts.push(`${num(i + 1)} ${esc(s.text)}${timerNote(s.timers, t)}`));
  }
  return clip(parts.join("\n"));
}

type Button = { text: string; callback_data?: string; url?: string };

// Buttons carry the language they were written in, so tapping one answers in it too.

/** The four views as a 2×2 grid, then a link to the app. */
export function viewKeyboard(id: string, current: TgView, t: BotTranslator, appUrl?: string) {
  const buttons: Button[] = TG_VIEWS.map((v) => ({
    text: v === current ? `· ${t(`tg.view.${v}`)} ·` : t(`tg.view.${v}`),
    callback_data: `v:${id}:${v}:${t.locale}`,
  }));
  const rows: Button[][] = [buttons.slice(0, 2), buttons.slice(2)];
  if (appUrl) rows.push([{ text: t("tg.openInApp"), url: `${appUrl}/recipes/${id}` }]);
  return { inline_keyboard: rows };
}

/** A numbered list of recipes, one button each that opens it. */
export function openKeyboard(list: { id: string; title: string }[], t: BotTranslator) {
  return {
    inline_keyboard: list.map((r, i) => [{ text: buttonText(`${num(i + 1)} ${r.title}`), callback_data: `o:${r.id}:${t.locale}` }]),
  };
}

export type DuplicateCallback = {
  id: string;
  choice: "keep-original" | "replace" | "keep-both";
  locale: Locale | null;
};

const DUP_CODES = { o: "keep-original", r: "replace", b: "keep-both" } as const;

const localeOf = (code: string | undefined) => (isLocale(code) ? code : null);

export function duplicateKeyboard(newId: string, t: BotTranslator) {
  return {
    inline_keyboard: [
      [{ text: `📌 ${t("dup.keep")}`, callback_data: `d:${newId}:o:${t.locale}` }],
      [{ text: `🔁 ${t("dup.replace")}`, callback_data: `d:${newId}:r:${t.locale}` }],
      [{ text: `👯 ${t("dup.both")}`, callback_data: `d:${newId}:b:${t.locale}` }],
    ],
  };
}

export function parseDuplicateCallback(data: string): DuplicateCallback | null {
  const m = data.match(/^d:([0-9a-f-]{36}):([orb])(?::(\w+))?$/);
  return m ? { id: m[1], choice: DUP_CODES[m[2] as keyof typeof DUP_CODES], locale: localeOf(m[3]) } : null;
}

export function renderDuplicatePrompt(
  newTitle: string,
  originalTitle: string,
  diff: { added: string[]; removed: string[] },
  t: BotTranslator,
) {
  const lines = [t("tg.dupLooks", { title: `<b>${esc(originalTitle)}</b>` }), ""];
  if (newTitle !== originalTitle) lines.push(t("tg.dupNew", { title: `<i>${esc(newTitle)}</i>` }));
  if (diff.added.length) lines.push(t("tg.dupNewHas", { list: esc(diff.added.join(", ")) }));
  if (diff.removed.length) lines.push(t("tg.dupOriginalHas", { list: esc(diff.removed.join(", ")) }));
  if (!diff.added.length && !diff.removed.length) lines.push(esc(t("dup.same")));
  lines.push("", esc(t("tg.dupWhat")));
  return lines.join("\n");
}

/** Search results: what each needs, if the search named ingredients. */
export function renderResults(results: { title: string; match?: { missing: number } }[], t: BotTranslator) {
  return results
    .map((r, i) => {
      const match = r.match
        ? ` — <i>${esc(r.match.missing ? t("tg.needsMore", { n: r.match.missing }) : t("tg.haveAll"))}</i>`
        : "";
      return `${num(i + 1)} ${esc(r.title)}${match}`;
    })
    .join("\n");
}

export function renderSubstitution(ingredient: string, s: Substitution, t: BotTranslator) {
  const lines = [`<b>${esc(t("tg.noSwap", { name: ingredient }))}</b>`, ""];
  s.options.forEach((o, i) => {
    lines.push(`${num(i + 1)} <b>${esc(o.use)}</b> — ${esc(o.amount)}`, `   ${esc(o.how)} <i>${esc(o.effect)}</i>`);
  });
  if (s.tip) lines.push("", `💡 <i>${esc(s.tip)}</i>`);
  return clip(lines.join("\n"));
}

export function renderAbundance(
  ingredient: string,
  uses: { title: string; amount: string | null }[],
  pairs: { name: string }[],
  t: BotTranslator,
) {
  if (uses.length === 0) return `🤷 ${esc(t("ingredientPage.none", { name: ingredient }))}`;
  const lines = [`<b>${esc(t("tg.lots", { name: ingredient }))}</b>`, ""];
  uses.forEach((u, i) => lines.push(`${num(i + 1)} ${esc(u.title)}${u.amount ? ` — <i>${esc(u.amount)}</i>` : ""}`));
  if (pairs.length) lines.push("", esc(t("tg.pairs", { list: pairs.map((p) => p.name).join(", ") })));
  return clip(lines.join("\n"));
}

/**
 * "v:<id>:<view>[:<lang>]" switches view in place; "o:<id>[:<lang>]" opens a recipe from a
 * list as a new message. Buttons sent before languages were added have no <lang>.
 */
export function parseCallback(data: string): { id: string; view: TgView; open: boolean; locale: Locale | null } | null {
  const open = data.match(/^o:([0-9a-f-]{36})(?::(\w+))?$/);
  if (open) return { id: open[1], view: "effective", open: true, locale: localeOf(open[2]) };
  const m = data.match(/^v:([0-9a-f-]{36}):(\w+)(?::(\w+))?$/);
  if (!m || !(TG_VIEWS as readonly string[]).includes(m[2])) return null;
  return { id: m[1], view: m[2] as TgView, open: false, locale: localeOf(m[3]) };
}

export type TgIntent =
  | { kind: "login"; username: string; password: string }
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "url"; url: string }
  | { kind: "import"; text: string }
  | { kind: "search"; query: string };

/** Decide what a plain text message means. Commands win; long multi-line text is a pasted recipe. */
export function classifyText(text: string): TgIntent {
  const t = text.trim();
  const login = t.match(/^\/login(?:@\w+)?\s+(\S+)\s+(.+)$/s);
  if (login) return { kind: "login", username: login[1], password: login[2].trim() };
  if (/^\/start\b/.test(t)) return { kind: "start" };
  if (/^\/help\b/.test(t)) return { kind: "help" };
  const add = t.match(/^\/add(?:@\w+)?\s+([\s\S]+)$/);
  const find = t.match(/^\/(?:find|search)(?:@\w+)?\s+([\s\S]+)$/);
  if (find) return { kind: "search", query: find[1].trim() };
  const body = add ? add[1].trim() : t;
  const url = body.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (url && body.length < url.length + 60) return { kind: "url", url };
  if (add || body.length > 280 || body.split("\n").length >= 5) return { kind: "import", text: body };
  return { kind: "search", query: body };
}
