"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { substituteInRecipe } from "@/app/actions";
import type { Substitution } from "@/lib/recipe-types";
import { SubstitutionCard } from "./substitution";
import type { Enrichment, Ingredient, Step } from "@/lib/recipe-types";
import { dirFor } from "@/lib/format";
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
const VIEWS = ["effective", "classic", "ratios", "source"] as const;
type View = (typeof VIEWS)[number];

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
  source,
  withTimers = true,
}: {
  recipe: RecipeViewData;
  /** When set (signed-in pages), ingredients offer "recipes with this" and swaps. */
  recipeId?: string;
  source?: SourceViewData;
  withTimers?: boolean;
}) {
  const views = VIEWS.filter((v) => v !== "source" || source !== undefined);
  const [view, setView] = useState<View>("effective");
  const [units, setUnits] = usePersistentUnits();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const dir = dirFor(recipe.language);

  // Horizontal swipe between views on touch screens.
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const i = views.indexOf(view);
    const next = views[Math.min(views.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1)))];
    setView(next);
  };

  return (
    <div className="recipe-view">
      <div className="view-bar">
        <nav className="view-tabs" role="tablist" aria-label="Recipe views">
          {views.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </nav>
        {view !== "source" && (
          <button
            className="units-toggle"
            onClick={() => setUnits(units === "metric" ? "volume" : "metric")}
            title="Switch units"
          >
            {units === "metric" ? "g · ml" : "cups"}
          </button>
        )}
      </div>

      <div
        className="view-body"
        dir={view === "ratios" ? "ltr" : dir}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        {view === "effective" && <EffectiveView recipe={recipe} units={units} withTimers={withTimers} />}
        {view === "classic" && (
          <ClassicView recipe={recipe} recipeId={recipeId} units={units} withTimers={withTimers} />
        )}
        {view === "ratios" && <RatiosView recipe={recipe} />}
        {view === "source" && source !== undefined && <SourceView source={source} />}
      </div>
    </div>
  );
}

const amount = (i: { metric: string | null; volume: string | null }, units: Units) =>
  (units === "metric" ? (i.metric ?? i.volume) : (i.volume ?? i.metric)) ?? "";

function EffectiveView({ recipe, units, withTimers }: { recipe: RecipeViewData; units: Units; withTimers: boolean }) {
  const e = recipe.enrichment;
  if (!e) return <ClassicView recipe={recipe} units={units} withTimers={withTimers} />;
  return (
    <>
      <ul className="recap">
        {e.recap.map((r, i) => (
          <li key={i}>
            <span className="qty">{amount(r, units)}</span> {r.name}
          </li>
        ))}
      </ul>
      <ol className="steps">
        {e.effectiveSteps.map((s, i) => (
          <li key={i}>
            <p>
              {s.segments.map((seg, j) =>
                seg.ingredient === null ? (
                  <span key={j}>{seg.text}</span>
                ) : (
                  <strong key={j} className="ing">
                    {amount(seg, units) && <span className="qty">{amount(seg, units)} </span>}
                    {seg.text}
                  </strong>
                ),
              )}
            </p>
            {withTimers && <StepTimers timers={s.timers} recipe={recipe} step={i} />}
          </li>
        ))}
      </ol>
    </>
  );
}

function ClassicView({
  recipe,
  recipeId,
  units,
  withTimers,
}: {
  recipe: RecipeViewData;
  recipeId?: string;
  units: Units;
  withTimers: boolean;
}) {
  const groups = new Map<string, { ing: Ingredient; index: number }[]>();
  recipe.ingredients.forEach((ing, index) => {
    const g = ing.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), { ing, index }]);
  });
  return (
    <div className="classic">
      <section className="ingredients">
        {[...groups.entries()].map(([group, list]) => (
          <div key={group}>
            {group && <h3>{group}</h3>}
            <ul>
              {list.map(({ ing: i, index }) => (
                <li key={index} className={i.optional ? "optional" : undefined}>
                  {recipeId ? (
                    <IngredientRow ing={i} index={index} recipeId={recipeId} units={units} />
                  ) : (
                    <IngredientText ing={i} units={units} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <ol className="steps">
        {recipe.steps.map((s, i) => (
          <li key={i}>
            <p>{s.text}</p>
            {withTimers && <StepTimers timers={s.timers} recipe={recipe} step={i} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IngredientText({ ing, units }: { ing: Ingredient; units: Units }) {
  return (
    <>
      <span className="qty">{amount(ing, units)}</span> {ing.name}
      {ing.note && <span className="note">, {ing.note}</span>}
      {ing.optional && <span className="note"> (optional)</span>}
    </>
  );
}

/** Tap an ingredient: recipes that use it, or what to use if you don't have it. */
function IngredientRow({ ing, index, recipeId, units }: { ing: Ingredient; index: number; recipeId: string; units: Units }) {
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
              className="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    setSwap(await substituteInRecipe(recipeId, index));
                  } catch {
                    setError("Couldn't get suggestions right now.");
                  }
                })
              }
            >
              {pending ? "Thinking…" : "Don't have it?"}
            </button>
            <Link className="secondary button-link" href={`/ingredients/${encodeURIComponent(ing.canonical)}`}>
              More with {ing.canonical}
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
  return (
    <div className="step-timers">
      {timers.map((t, k) => (
        <TimerPill key={k} label={t.label} seconds={t.seconds} recipeTitle={recipe.title} />
      ))}
      <AddTimer recipeTitle={recipe.title} defaultLabel={`Step ${step + 1}`} />
    </div>
  );
}

function RatiosView({ recipe }: { recipe: RecipeViewData }) {
  const r = recipe.enrichment?.ratio;
  if (!r) return <p className="muted">No ratio yet for this recipe.</p>;
  const total = r.components.reduce((s, c) => s + c.parts, 0) || 1;
  return (
    <div className="ratios">
      {r.family && <p className="ratio-family">{r.family}</p>}
      <p className="ratio-formula">{r.formula}</p>
      <div className="ratio-bar" role="img" aria-label={`Ratio ${r.formula}`}>
        {r.components.map((c, i) => (
          <span key={i} className={`ratio-block tone-${i % 5}`} style={{ flexGrow: c.parts }}>
            <span className="ratio-parts">{c.parts}</span>
          </span>
        ))}
      </div>
      <ul className="ratio-legend">
        {r.components.map((c, i) => (
          <li key={i}>
            <span className={`dot tone-${i % 5}`} aria-hidden />
            <span className="ratio-name">{c.name}</span>
            <span className="muted">
              {c.parts} {c.parts === 1 ? "part" : "parts"} · {Math.round((c.parts / total) * 100)}%
              {c.grams ? ` · ${Math.round(c.grams)} g here` : ""}
            </span>
          </li>
        ))}
      </ul>
      {r.extras.length > 0 && (
        <ul className="ratio-extras">
          {r.extras.map((x, i) => (
            <li key={i}>
              {x.name} <span className="muted">{x.amount}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="ratio-insight">{r.insight}</p>
    </div>
  );
}

function SourceView({ source }: { source: SourceViewData }) {
  if (!source) return <p className="muted">The original wasn&apos;t kept for this recipe.</p>;
  return (
    <div className="source">
      {source.url && (
        <p>
          <a href={source.url} target="_blank" rel="noreferrer">
            {new URL(source.url).hostname.replace(/^www\./, "")} ↗
          </a>
        </p>
      )}
      {source.files.map((f) =>
        f.mediaType.startsWith("audio/") ? (
          <audio key={f.url} controls src={f.url} preload="none" />
        ) : f.mediaType.startsWith("image/") ? (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
            <img src={f.url} alt="Original" className="source-image" />
          </a>
        ) : null,
      )}
      {source.text && <div className="source-text">{source.text}</div>}
    </div>
  );
}
