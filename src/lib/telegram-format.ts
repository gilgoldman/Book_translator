import type { Enrichment, Ingredient, Step } from "@/lib/recipe-types";
import { formatDuration, formatMinutes, titleCase } from "@/lib/format";

// Pure renderers for the Telegram bot (HTML parse mode, 4096-char limit).

export const TG_VIEWS = ["effective", "classic", "ratios", "source"] as const;
export type TgView = (typeof TG_VIEWS)[number];

export type TgRecipe = {
  id: string;
  title: string;
  titleEnglish: string;
  cuisine: string;
  course: string;
  season: string;
  totalMinutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  enrichment: Enrichment | null;
};

export type TgSource = { kind: string; url: string | null; files: { url: string; mediaType: string }[]; text: string | null } | null;

const LIMIT = 4000;

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(s: string) {
  return s.length > LIMIT ? s.slice(0, LIMIT - 20).replace(/<[^>]*$/, "") + "\n…" : s;
}

function header(r: TgRecipe) {
  const meta = [titleCase(r.cuisine), r.course, r.season, formatMinutes(r.totalMinutes), r.servings && `makes ${r.servings}`]
    .filter(Boolean)
    .join(" · ");
  const sub = r.title !== r.titleEnglish ? `\n<i>${esc(r.titleEnglish)}</i>` : "";
  return `<b>${esc(r.title)}</b>${sub}\n<i>${esc(meta)}</i>`;
}

const timerNote = (timers: { label: string; seconds: number }[]) =>
  timers.length ? `  ⏱ ${timers.map((t) => `${esc(t.label.toLowerCase())} ${formatDuration(t.seconds)}`).join(", ")}` : "";

export function renderRecipe(r: TgRecipe, view: TgView, source: TgSource = null): string {
  const parts = [header(r), ""];

  if (view === "effective" && r.enrichment) {
    const e = r.enrichment;
    parts.push(e.recap.map((x) => `· ${x.metric ? `${esc(x.metric)} ` : ""}${esc(x.name)}`).join("\n"), "");
    e.effectiveSteps.forEach((s, i) => {
      const text = s.segments
        .map((seg) => (seg.ingredient === null ? esc(seg.text) : `<b>${seg.metric ? esc(seg.metric) + " " : ""}${esc(seg.text)}</b>`))
        .join("");
      parts.push(`${i + 1}. ${text}${timerNote(s.timers)}`);
    });
  } else if (view === "ratios" && r.enrichment) {
    const x = r.enrichment.ratio;
    if (x.family) parts.push(`<b>${esc(x.family)}</b>`);
    parts.push(`<code>${esc(x.formula)}</code>`, "");
    for (const c of x.components) {
      parts.push(`${"▮".repeat(Math.max(1, Math.round(c.parts)))} ${c.parts} ${esc(c.name)}${c.grams ? ` (${Math.round(c.grams)} g)` : ""}`);
    }
    if (x.extras.length) parts.push("", ...x.extras.map((e) => `· ${esc(e.name)}: ${esc(e.amount)}`));
    parts.push("", `<i>${esc(x.insight)}</i>`);
  } else if (view === "source") {
    if (!source) parts.push("<i>No original saved.</i>");
    else {
      if (source.url) parts.push(esc(source.url));
      for (const f of source.files) parts.push(`${f.mediaType.startsWith("audio/") ? "🎙" : "🖼"} ${esc(f.url)}`);
      if (source.text) parts.push("", esc(source.text.slice(0, 2500)));
    }
  } else {
    parts.push(r.ingredients.map((i) => `· ${esc(i.metric ?? i.original)}${i.metric ? ` ${esc(i.name)}` : ""}`).join("\n"), "");
    r.steps.forEach((s, i) => parts.push(`${i + 1}. ${esc(s.text)}${timerNote(s.timers)}`));
  }
  return clip(parts.join("\n"));
}

export function viewKeyboard(id: string, current: TgView, appUrl?: string) {
  const row = TG_VIEWS.map((v) => ({
    text: v === current ? `· ${v} ·` : v,
    callback_data: `v:${id}:${v}`,
  }));
  const rows: { text: string; callback_data?: string; url?: string }[][] = [row];
  if (appUrl) rows.push([{ text: "open in cookbook ↗", url: `${appUrl}/recipes/${id}` }]);
  return { inline_keyboard: rows };
}

/** "v:<id>:<view>" switches view in place; "o:<id>" opens a recipe from a search list as a new message. */
export function parseCallback(data: string): { id: string; view: TgView; open: boolean } | null {
  const open = data.match(/^o:([0-9a-f-]{36})$/);
  if (open) return { id: open[1], view: "effective", open: true };
  const m = data.match(/^v:([0-9a-f-]{36}):(\w+)$/);
  if (!m || !(TG_VIEWS as readonly string[]).includes(m[2])) return null;
  return { id: m[1], view: m[2] as TgView, open: false };
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
