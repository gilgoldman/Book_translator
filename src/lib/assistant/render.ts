import { localAmount } from "@/lib/amounts";
import { formatDuration, formatMinutes } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/translate";
import { segmentText, type Enrichment, type Ingredient, type Step, type Substitution } from "@/lib/recipe-types";
import type { RecipeDiff } from "@/lib/recipe-changes";
import type { MenuAsk } from "./asks";
import { RECIPE_VIEWS, type Button, type MessageRef, type RecipeView } from "./chat";
import type { Speaker } from "./language";
import { PERSONA } from "./persona";

// How the assistant's replies look: pure renderers to rich text (<b>, <i>, <code>, the rest
// escaped) and buttons, for any channel. What it says and how it looks is set in persona.ts.

export type ShownRecipe = {
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
  /** The language its words are shown in; amounts follow it. Defaults to the reader's. */
  language?: string;
};

export type ShownSource = { kind: string; url: string | null; files: { url: string; mediaType: string }[]; text: string | null } | null;

/** Chat apps cap a message at 4096 characters (Telegram, WhatsApp). */
const LIMIT = 4000;

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/** 1️⃣ … 🔟, then "11." and on. */
export const num = (n: number) => KEYCAPS[n - 1] ?? `${n}.`;

/** One of a message's "|"-separated variants, the same one for the same seed. */
export const variant = (text: string, seed: MessageRef) => {
  const all = text.split("|");
  const n = typeof seed === "number" ? seed : [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return all[Math.abs(n) % all.length];
};

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(s: string) {
  return s.length > LIMIT ? s.slice(0, LIMIT - 20).replace(/<[^>]*$/, "") + "\n…" : s;
}

/** A category's label, or the stored value if it isn't one we know. */
function category(t: Speaker, kind: string, value: string) {
  const key = `${kind}.${value}` as MessageKey;
  const label = t(key);
  return label === key ? value : label;
}

function header(r: ShownRecipe, t: Speaker) {
  const time = formatMinutes(r.totalMinutes, t);
  const meta = [
    category(t, "cuisine", r.cuisine),
    category(t, "course", r.course),
    `${PERSONA.look.season[r.season] ?? ""} ${category(t, "season", r.season)}`.trim(),
    time && `⏱ ${time}`,
    r.servings && t("bot.makes", { n: r.servings }),
  ]
    .filter(Boolean)
    .join(" · ");
  const sub = r.subtitle && r.subtitle !== r.title ? `\n<i>${esc(r.subtitle)}</i>` : "";
  const by = r.addedBy ? `\n🧑‍🍳 ${esc(t("common.addedBy", { name: r.addedBy }))}` : "";
  return `${PERSONA.look.course[r.course] ?? "🍴"} <b>${esc(r.title)}</b>${sub}\n<i>${esc(meta)}</i>${by}`;
}

const timerNote = (timers: { label: string; seconds: number }[], t: Speaker) =>
  timers.length
    ? `  ⏱ ${timers.map((x) => `${esc(x.label.toLowerCase())} ${formatDuration(x.seconds, t)}`).join(", ")}`
    : "";

const bar = (parts: number, k: number) =>
  PERSONA.look.ratioBars[k % PERSONA.look.ratioBars.length].repeat(Math.min(12, Math.max(1, Math.round(parts))));

export function renderRecipe(r: ShownRecipe, view: RecipeView, t: Speaker, source: ShownSource = null): string {
  const parts = [header(r, t), ""];
  // Amounts written for the language the recipe is shown in.
  const amt = (s: string | null) => (s ? localAmount(s, r.language ?? t.locale) : s);

  if (view === "effective" && r.enrichment) {
    const e = r.enrichment;
    parts.push(e.recap.map((x) => `• ${x.metric ? `${esc(amt(x.metric)!)} ` : ""}${esc(x.name)}`).join("\n"), "");
    e.effectiveSteps.forEach((s, i) => {
      const text = s.segments
        .map((seg) => (seg.ingredient === null ? esc(seg.text) : `<b>${seg.metric ? esc(amt(seg.metric)!) + " " : ""}${esc(segmentText(seg, r.ingredients))}</b>`))
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
    if (!source) parts.push(`<i>${esc(t("bot.noOriginal"))}</i>`);
    else {
      if (source.url) parts.push(`🔗 ${esc(source.url)}`);
      for (const f of source.files) parts.push(`${f.mediaType.startsWith("audio/") ? "🎙" : "🖼"} ${esc(f.url)}`);
      if (source.text) parts.push("", esc(source.text.slice(0, 2500)));
    }
  } else {
    parts.push(r.ingredients.map((i) => `• ${esc(i.metric ? amt(i.metric)! : i.original)}${i.metric ? ` ${esc(i.name)}` : ""}`).join("\n"), "");
    r.steps.forEach((s, i) => parts.push(`${num(i + 1)} ${esc(s.text)}${timerNote(s.timers, t)}`));
  }
  return clip(parts.join("\n"));
}

// Buttons carry the language they were written in, so tapping one answers in it too.

/** The four views as a 2×2 grid, then a link to the app ("" for a relative one). */
export function viewButtons(id: string, current: RecipeView, t: Speaker, appUrl?: string): Button[][] {
  const buttons: Button[] = RECIPE_VIEWS.map((view) => ({
    label: view === current ? `· ${t(`bot.view.${view}`)} ·` : t(`bot.view.${view}`),
    action: { kind: "view", recipeId: id, view, locale: t.locale },
  }));
  const rows = [buttons.slice(0, 2), buttons.slice(2)];
  if (appUrl !== undefined) rows.push([{ label: t("bot.openInApp"), url: `${appUrl}/recipes/${id}` }]);
  return rows;
}

/** A numbered list of recipes, one button each that opens it. */
export function openButtons(list: { id: string; title: string }[], t: Speaker): Button[][] {
  return list.map((r, i) => [{ label: `${num(i + 1)} ${r.title}`, action: { kind: "open", recipeId: r.id, locale: t.locale } }]);
}

export function duplicateButtons(newId: string, t: Speaker): Button[][] {
  const button = (label: string, choice: "keep-original" | "replace" | "keep-both"): Button[] => [
    { label, action: { kind: "duplicate", recipeId: newId, choice, locale: t.locale } },
  ];
  return [
    button(`📌 ${t("dup.keep")}`, "keep-original"),
    button(`🔁 ${t("dup.replace")}`, "replace"),
    button(`👯 ${t("dup.both")}`, "keep-both"),
  ];
}

/** Under "I heard: …" for a voice note taken as a question: save it as a recipe after all. */
export function saveVoiceButtons(t: Speaker): Button[][] {
  return [[{ label: t("bot.saveVoice"), action: { kind: "saveVoice", locale: t.locale } }]];
}

export function renderDuplicatePrompt(
  newTitle: string,
  originalTitle: string,
  diff: { added: string[]; removed: string[] },
  t: Speaker,
) {
  const lines = [t("bot.dupLooks", { title: `<b>${esc(originalTitle)}</b>` }), ""];
  if (newTitle !== originalTitle) lines.push(t("bot.dupNew", { title: `<i>${esc(newTitle)}</i>` }));
  if (diff.added.length) lines.push(t("bot.dupNewHas", { list: esc(diff.added.join(", ")) }));
  if (diff.removed.length) lines.push(t("bot.dupOriginalHas", { list: esc(diff.removed.join(", ")) }));
  if (!diff.added.length && !diff.removed.length) lines.push(esc(t("dup.same")));
  lines.push("", esc(t("bot.dupWhat")));
  return lines.join("\n");
}

/** Search results: what each needs, if the search named ingredients. */
export function renderResults(results: { title: string; match?: { missing: number } }[], t: Speaker) {
  return results
    .map((r, i) => {
      const match = r.match
        ? ` — <i>${esc(r.match.missing ? t("bot.needsMore", { n: r.match.missing }) : t("bot.haveAll"))}</i>`
        : "";
      return `${num(i + 1)} ${esc(r.title)}${match}`;
    })
    .join("\n");
}

const VERDICT = { yes: "bot.askedYes", "with-changes": "bot.askedChanges", no: "bot.askedNo" } as const;

/**
 * Swaps for a missing ingredient, in a recipe when `title` is given. When they asked about a
 * substitute ("would yogurt work?"), its verdict comes first and the rest are other options.
 */
export function renderSubstitution(ingredient: string, s: Substitution, t: Speaker, title?: string) {
  const lines: string[] = [];
  // Answers cached before "asked" existed don't have it.
  const asked = s.asked ?? null;
  if (asked) {
    const q = title
      ? t("bot.askedIn", { use: asked.use, name: ingredient, title })
      : t("bot.asked", { use: asked.use, name: ingredient });
    lines.push(`<b>${esc(q)}</b>`, "", `<b>${esc(t(VERDICT[asked.verdict]))}</b>${asked.amount ? ` — ${esc(asked.amount)}` : ""}`);
    lines.push(`   ${esc(asked.how)} <i>${esc(asked.effect)}</i>`);
    if (s.options.length) lines.push("", `<b>${esc(t("bot.swapOthers"))}</b>`);
  } else {
    const head = title ? t("bot.noSwapIn", { name: ingredient, title }) : t("bot.noSwap", { name: ingredient });
    lines.push(`<b>${esc(head)}</b>`, "");
  }
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
  t: Speaker,
) {
  if (uses.length === 0) return `🤷 ${esc(t("ingredientPage.none", { name: ingredient }))}`;
  const lines = [`<b>${esc(t("bot.lots", { name: ingredient }))}</b>`, ""];
  uses.forEach((u, i) => lines.push(`${num(i + 1)} ${esc(u.title)}${u.amount ? ` — <i>${esc(u.amount)}</i>` : ""}`));
  if (pairs.length) lines.push("", esc(t("bot.pairs", { list: pairs.map((p) => p.name).join(", ") })));
  return clip(lines.join("\n"));
}

/** "Dana's recipes": how many they added, the newest few, and how many more there are. */
export function renderByPerson(name: string, recipes: { title: string }[], total: number, t: Speaker) {
  if (total === 0) return esc(t("bot.byPersonNone", { name }));
  const lines = [`<b>${esc(t("bot.byPerson", { name, n: total }))}</b>`, ""];
  recipes.forEach((r, i) => lines.push(`${num(i + 1)} ${esc(r.title)}`));
  if (total > recipes.length) lines.push("", `<i>${esc(t("bot.byPersonMore", { n: total - recipes.length }))}</i>`);
  return clip(lines.join("\n"));
}

/** What a menu was asked to be: "Italian · eggplant". */
export function menuTheme({ cuisines, rest }: MenuAsk, t: Speaker) {
  return [...cuisines.map((c) => category(t, "cuisine", c)), rest].filter(Boolean).join(" · ");
}

/** A menu: one dish per course, each under its course. */
export function renderMenu(ask: MenuAsk, dishes: { title: string; course: string }[], t: Speaker) {
  const theme = menuTheme(ask, t);
  const head = `<b>${esc(t(`bot.menu.${ask.meal}`))}</b>${theme ? ` · <i>${esc(theme)}</i>` : ""}`;
  const lines = dishes.map(
    (d, i) => `${num(i + 1)} ${PERSONA.look.course[d.course] ?? "🍴"} <i>${esc(category(t, "course", d.course))}</i>: ${esc(d.title)}`,
  );
  return clip([head, "", ...lines].join("\n"));
}

/** The dishes of a menu, one button each, then "another menu" for the next round. */
export function menuButtons(ask: MenuAsk, dishes: { id: string; title: string }[], round: number, t: Speaker): Button[][] {
  const next = (round + 1) % PERSONA.menuRounds;
  return [
    ...openButtons(dishes, t),
    [{ label: t("bot.anotherMenu"), action: { kind: "menu", ...ask, round: next, locale: t.locale } }],
  ];
}

const DETAIL_LABELS = {
  title: "edit.title",
  servings: "edit.makes",
  prepMinutes: "edit.prep",
  cookMinutes: "edit.cook",
  totalMinutes: "edit.total",
} as const;

/** A proposed correction: what it does, then each line that goes (➖) and comes (➕). */
export function renderCorrection(title: string, summary: string, diff: RecipeDiff, t: Speaker) {
  const lines = [`<b>${esc(t("bot.fixAsk", { title }))}</b>`];
  if (summary) lines.push(`<i>${esc(summary)}</i>`);
  for (const d of diff.details) {
    lines.push("", `<b>${esc(t(DETAIL_LABELS[d.field]))}</b>`, `➖ ${esc(String(d.before ?? "—"))}`, `➕ ${esc(String(d.after ?? "—"))}`);
  }
  const section = (key: "edit.ingredients" | "edit.method", { removed, added }: { removed: string[]; added: string[] }) => {
    if (!removed.length && !added.length) return;
    lines.push("", `<b>${esc(t(key))}</b>`, ...removed.map((l) => `➖ ${esc(l)}`), ...added.map((l) => `➕ ${esc(l)}`));
  };
  section("edit.ingredients", diff.ingredients);
  section("edit.method", diff.steps);
  return clip(lines.join("\n"));
}

export function fixButtons(editId: string, t: Speaker): Button[][] {
  return [
    [
      { label: t("bot.fixApply"), action: { kind: "fix", editId, choice: "apply", locale: t.locale } },
      { label: t("bot.fixCancel"), action: { kind: "fix", editId, choice: "cancel", locale: t.locale } },
    ],
  ];
}
