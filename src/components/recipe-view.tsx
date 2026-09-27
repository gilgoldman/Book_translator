"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { substituteInRecipe } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { dirFor } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/translate";
import { segmentText, type Enrichment, type Ingredient, type Step, type Substitution } from "@/lib/recipe-types";
import { Icon, type IconName } from "./icons";
import { SubstitutionCard } from "./substitution";
import { AddTimer, TimerPill } from "./timers";

export type RecipeViewData = {
  title: string;
  language: string;
  ingredients: Ingredient[];
  steps: Step[];
  enrichment: Enrichment | null;
};

export type SourceViewData = {
  kind: "url" | "image" | "audio" | "text";
  url: string | null;
  files: { url: string; mediaType: string }[];
  text: string | null;
} | null;

type Units = "metric" | "volume";

const VIEWS: { id: "effective" | "classic" | "ratios" | "source"; icon: IconName }[] = [
  { id: "effective", icon: "steps" },
  { id: "classic", icon: "list" },
  { id: "ratios", icon: "scale" },
  { id: "source", icon: "source" },
];
type View = (typeof VIEWS)[number]["id"];

function usePersistentUnits(): [Units, (u: Units) => void] {
  const [units, setUnits] = useState<Units>("metric");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      if (localStorage.getItem("cookbook.units") === "volume") setUnits("volume");
    } catch {}
  }, []);
  return [
    units,
    (u) => {
      setUnits(u);
      try {
        localStorage.setItem("cookbook.units", u);
      } catch {}
    },
  ];
}

export function RecipeView({
  recipe,
  recipeId,
  ingredientNames = {},
  source,
  withTimers = true,
}: {
  recipe: RecipeViewData;
  /** When set (signed-in pages), ingredients offer "recipes with this" and swaps. */
  recipeId?: string;
  /** Canonical ingredient -> its name in the reader's language. */
  ingredientNames?: Record<string, string>;
  source?: SourceViewData;
  withTimers?: boolean;
}) {
  const t = useT();
  const views = VIEWS.filter((v) => v.id !== "source" || source !== undefined);
  const [view, setView] = useState<View>("effective");
  const [units, setUnits] = usePersistentUnits();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dir = dirFor(recipe.language);
  // Arrow keys follow the page direction: in Hebrew, "next" is to the left.
  const pageDir = dirFor(t.locale);

  const select = (i: number) => {
    const next = views[(i + views.length) % views.length];
    setView(next.id);
    tabs.current[(i + views.length) % views.length]?.focus();
  };

  // Horizontal swipe between views on touch screens.
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const i = views.findIndex((v) => v.id === view);
    const forward = pageDir === "rtl" ? dx > 0 : dx < 0;
    const next = views[Math.min(views.length - 1, Math.max(0, i + (forward ? 1 : -1)))];
    setView(next.id);
  };

  return (
    <div className="recipe-view">
      <div className="views" role="tablist" aria-label={t("view.tablist")}>
        {views.map((v, i) => (
          <button
            key={v.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            id={`tab-${v.id}`}
            aria-controls="view-panel"
            aria-selected={view === v.id}
            tabIndex={view === v.id ? 0 : -1}
            onClick={() => setView(v.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") select(i + (pageDir === "rtl" ? -1 : 1));
              if (e.key === "ArrowLeft") select(i + (pageDir === "rtl" ? 1 : -1));
            }}
          >
            <Icon name={v.icon} />
            <b>{t(`view.${v.id}`)}</b>
            <small>{t(`view.${v.id}.hint` as MessageKey)}</small>
          </button>
        ))}
      </div>

      {view !== "source" && view !== "ratios" && (
        <div className="units-row">
          <span className="muted">{t("units.label")}</span>
          <div className="seg" role="radiogroup" aria-label={t("units.aria")}>
            <button role="radio" aria-checked={units === "metric"} onClick={() => setUnits("metric")}>
              {t("units.metric")}
            </button>
            <button role="radio" aria-checked={units === "volume"} onClick={() => setUnits("volume")}>
              {t("units.volume")}
            </button>
          </div>
        </div>
      )}

      <div
        id="view-panel"
        role="tabpanel"
        aria-labelledby={`tab-${view}`}
        lang={view === "source" ? undefined : recipe.language}
        dir={view === "source" ? undefined : dir}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        {view === "effective" && <EffectiveView recipe={recipe} units={units} withTimers={withTimers} />}
        {view === "classic" && (
          <ClassicView
            recipe={recipe}
            recipeId={recipeId}
            ingredientNames={ingredientNames}
            units={units}
            withTimers={withTimers}
          />
        )}
        {view === "ratios" && <RatiosView recipe={recipe} />}
        {view === "source" && source !== undefined && <SourceView source={source} />}
      </div>
    </div>
  );
}

const amount = (i: { metric: string | null; volume: string | null }, units: Units) =>
  (units === "metric" ? (i.metric ?? i.volume) : (i.volume ?? i.metric)) ?? "";

/** Steps as cards; tap one to make it the current step, "Done · next step" moves on. */
function StepList({
  steps,
  recipe,
  withTimers,
}: {
  steps: { body: React.ReactNode; timers: { label: string; seconds: number }[] }[];
  recipe: RecipeViewData;
  withTimers: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const t = useT();
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li
          key={i}
          className={`step${i === current ? " is-current" : ""}${i < current ? " is-done-step" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <div className="step-head">
            <button className="step-no-button" onClick={() => setCurrent(i)} aria-label={t("step.makeCurrent", { n: i + 1 })}>
              <span className="step-no">{i + 1}</span>
            </button>
            <span className="now-badge">{t("step.now")}</span>
          </div>
          <p>{s.body}</p>
          {withTimers && <StepTimers timers={s.timers} recipe={recipe} step={i} />}
          {i === current && i < steps.length - 1 && (
            <button className="btn next" onClick={() => setCurrent(i + 1)}>
              <Icon name="check" /> {t("step.next")}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function EffectiveView({ recipe, units, withTimers }: { recipe: RecipeViewData; units: Units; withTimers: boolean }) {
  const t = useT();
  const e = recipe.enrichment;
  if (!e) return <ClassicView recipe={recipe} units={units} withTimers={withTimers} />;
  return (
    <div className="eff">
      <aside className="recap" aria-labelledby="recap-title">
        <h2 id="recap-title">{t("recap.title")}</h2>
        <ul>
          {e.recap.map((r, i) => (
            <li key={i}>
              <span>{r.name}</span>
              <span className="q">{amount(r, units)}</span>
            </li>
          ))}
        </ul>
      </aside>
      <StepList
        recipe={recipe}
        withTimers={withTimers}
        steps={e.effectiveSteps.map((s) => ({
          timers: s.timers,
          body: s.segments.map((seg, j) =>
            seg.ingredient === null ? (
              <span key={j}>{seg.text}</span>
            ) : (
              <strong key={j} className="ing">
                {amount(seg, units) && `${amount(seg, units)} `}
                {segmentText(seg, recipe.ingredients)}
              </strong>
            ),
          ),
        }))}
      />
    </div>
  );
}

function ClassicView({
  recipe,
  recipeId,
  ingredientNames = {},
  units,
  withTimers,
}: {
  recipe: RecipeViewData;
  recipeId?: string;
  ingredientNames?: Record<string, string>;
  units: Units;
  withTimers: boolean;
}) {
  const t = useT();
  const groups = new Map<string, { ing: Ingredient; index: number }[]>();
  recipe.ingredients.forEach((ing, index) => {
    const g = ing.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), { ing, index }]);
  });
  return (
    <div className="classic">
      <section className="ingredients" aria-labelledby="ing-title">
        <h2 id="ing-title">{t("classic.ingredients")}</h2>
        {recipeId && <p className="muted small">{t("classic.tapHint")}</p>}
        {[...groups.entries()].map(([group, list]) => (
          <div key={group}>
            {group && <h3>{group}</h3>}
            <ul>
              {list.map(({ ing: i, index }) => (
                <li key={index} className={i.optional ? "optional" : undefined}>
                  {recipeId ? (
                    <IngredientRow
                      ing={i}
                      index={index}
                      recipeId={recipeId}
                      units={units}
                      label={ingredientNames[i.canonical] ?? i.canonical}
                    />
                  ) : (
                    <p style={{ margin: ".5em 0" }}>
                      <IngredientText ing={i} units={units} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="method" aria-labelledby="method-title">
        <h2 id="method-title">{t("classic.method")}</h2>
        <StepList
          recipe={recipe}
          withTimers={withTimers}
          steps={recipe.steps.map((s) => ({ body: s.text, timers: s.timers }))}
        />
      </section>
    </div>
  );
}

function IngredientText({ ing, units }: { ing: Ingredient; units: Units }) {
  const t = useT();
  return (
    <>
      <span className="qty">{amount(ing, units)}</span> {ing.name}
      {ing.note && <span className="note">, {ing.note}</span>}
      {ing.optional && <span className="note"> {t("ingredient.optional")}</span>}
    </>
  );
}

/** Tap an ingredient: recipes that use it, or what to use if you don't have it. */
function IngredientRow({
  ing,
  index,
  recipeId,
  units,
  label,
}: {
  ing: Ingredient;
  index: number;
  recipeId: string;
  units: Units;
  label: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<Substitution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="ingredient-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IngredientText ing={ing} units={units} />
      </button>
      {open && (
        <div className="ingredient-panel">
          <div className="button-row">
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    setError(null);
                    setSwap(await substituteInRecipe(recipeId, index));
                  } catch {
                    setError(t("ingredient.swapFailed"));
                  }
                })
              }
            >
              {pending ? t("ingredient.thinking") : t("ingredient.dontHave")}
            </button>
            <Link className="btn" href={`/ingredients/${encodeURIComponent(ing.canonical)}`}>
              {t("ingredient.moreWith", { name: label })}
            </Link>
          </div>
          {swap && <SubstitutionCard result={swap} />}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </>
  );
}

function StepTimers({
  timers,
  recipe,
  step,
}: {
  timers: { label: string; seconds: number }[];
  recipe: RecipeViewData;
  step: number;
}) {
  const t = useT();
  return (
    <div className="step-timers">
      {timers.map((t, k) => (
        <TimerPill key={k} label={t.label} seconds={t.seconds} recipeTitle={recipe.title} />
      ))}
      <AddTimer recipeTitle={recipe.title} defaultLabel={t("step.label", { n: step + 1 })} />
    </div>
  );
}

/** Pattern + colour per role, so the ratio never relies on colour alone. */
function roleClass(component: { name: string; role?: string }, i: number) {
  // A translated component keeps its original name as `role`.
  const n = (component.role ?? component.name).toLowerCase();
  if (/flour|grain|rice|oat|semolina|meal|starch|bread|pasta|קמח|אורז|סולת|שיבולת|עמילן|לחם|פסטה|פתיתים/.test(n)) return "c-grain";
  if (/butter|fat|oil|lard|shortening|ghee|חמאה|שומן|שמן|מרגרינה/.test(n)) return "c-fat";
  if (/egg|yolk|white|ביצ|חלמון|חלבון/.test(n)) return "c-egg";
  if (/cream|milk|cheese|yogurt|yoghurt|dairy|feta|שמנת|חלב|גבינ|יוגורט|לבן|פטה/.test(n)) return "c-dairy";
  if (/water|stock|liquid|broth|juice|wine|vinegar|acid|מים|ציר|נוזל|מיץ|יין|חומץ/.test(n)) return "c-liquid";
  return ["c-grain", "c-fat", "c-liquid", "c-egg", "c-dairy"][i % 5];
}

function RatiosView({ recipe }: { recipe: RecipeViewData }) {
  const t = useT();
  const r = recipe.enrichment?.ratio;
  if (!r) return <p className="muted">{t("ratio.none")}</p>;
  const total = r.components.reduce((s, c) => s + c.parts, 0) || 1;
  return (
    <section className="ratio" aria-labelledby="ratio-title">
      {r.family && <p className="kicker">{r.family}</p>}
      {/* The formula and the columns read left to right in every language, like the numbers. */}
      <h2 id="ratio-title" className="r-num" dir="ltr">
        {r.formula}
      </h2>
      <p className="r-by">{t("ratio.byWeight")}</p>
      <div
        className="stack"
        dir="ltr"
        role="img"
        aria-label={t("ratio.aria", {
          formula: r.formula,
          parts: r.components.map((c) => `${c.parts} ${c.name}`).join(", "),
        })}
      >
        {r.components.map((c, i) => {
          const whole = Math.floor(c.parts);
          const half = c.parts - whole >= 0.25;
          return (
            <div key={i} className={`col ${roleClass(c, i)}`}>
              <span className="n">{c.parts}</span>
              <span className="blocks">
                {Array.from({ length: Math.min(12, whole) }, (_, k) => (
                  <i key={k} />
                ))}
                {half && <i className="half" />}
              </span>
              <span className="nm" dir="auto">
                {c.name}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="legend">
        {r.components.map((c, i) => (
          <li key={i} className={roleClass(c, i)}>
            <span className="sw" aria-hidden />
            <span>{c.name}</span>
            <span className="muted">
              {t("ratio.parts", { n: c.parts })} · {Math.round((c.parts / total) * 100)}%
              {c.grams ? ` · ${t("ratio.gramsHere", { g: Math.round(c.grams) })}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {r.extras.length > 0 && (
        <ul className="ratio-extras">
          {r.extras.map((x, i) => (
            <li key={i}>
              <strong>{x.name}</strong> — {x.amount}
            </li>
          ))}
        </ul>
      )}
      <p className="ratio-insight">{r.insight}</p>
    </section>
  );
}

function SourceView({ source }: { source: SourceViewData }) {
  const t = useT();
  if (!source) return <p className="muted">{t("source.none")}</p>;
  return (
    <div className="source">
      {source.url && (
        <p>
          <a href={source.url} target="_blank" rel="noreferrer">
            {t("source.open", { host: new URL(source.url).hostname.replace(/^www\./, "") })}
          </a>
        </p>
      )}
      {source.files.map((f) =>
        f.mediaType.startsWith("audio/") ? (
          <audio key={f.url} controls src={f.url} preload="none" />
        ) : f.mediaType.startsWith("image/") ? (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
            <img src={f.url} alt={t("source.imageAlt")} className="source-image" />
          </a>
        ) : null,
      )}
      {source.text && (
        <div className="source-text" dir="auto">
          {source.text}
        </div>
      )}
    </div>
  );
}
