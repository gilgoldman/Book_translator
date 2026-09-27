"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateRecipe, type FormState } from "@/app/actions";
import { titleCase } from "@/lib/format";
import { COURSES, CUISINES, DIETS, SEASONS } from "@/lib/recipe-types";

type Values = {
  title: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  totalMinutes: string;
  cuisine: string;
  course: string;
  season: string;
  diet: string[];
  ingredients: string;
  method: string;
  notes: string;
};

export function EditRecipeForm({ id, values }: { id: string; values: Values }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateRecipe.bind(null, id), undefined);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Title</span>
        <input name="title" defaultValue={values.title} required maxLength={200} />
      </label>
      <label className="field">
        <span>Short description</span>
        <textarea name="description" defaultValue={values.description} rows={2} maxLength={1000} />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Makes</span>
          <input name="servings" defaultValue={values.servings} placeholder="4, 1 loaf…" />
        </label>
        <label className="field">
          <span>Total time (minutes)</span>
          <input name="totalMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.totalMinutes} />
        </label>
        <label className="field">
          <span>Prep (minutes)</span>
          <input name="prepMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.prepMinutes} />
        </label>
        <label className="field">
          <span>Cooking (minutes)</span>
          <input name="cookMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.cookMinutes} />
        </label>
      </div>

      <div className="grid-2">
        <Select name="cuisine" label="Cuisine" value={values.cuisine} options={CUISINES} />
        <Select name="course" label="Course" value={values.course} options={COURSES} />
        <Select name="season" label="Season" value={values.season} options={SEASONS} />
      </div>
      <fieldset>
        <legend>Diet</legend>
        <div className="checks">
          {DIETS.map((d) => (
            <label key={d}>
              <input type="checkbox" name="diet" value={d} defaultChecked={values.diet.includes(d)} />
              {titleCase(d)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Ingredients</span>
        <span className="help">One per line, as you&apos;d write them: “2 cups flour”, “1 onion, chopped”.</span>
        <textarea name="ingredients" defaultValue={values.ingredients} rows={10} required />
      </label>
      <label className="field">
        <span>Method</span>
        <span className="help">Leave an empty line between steps.</span>
        <textarea name="method" defaultValue={values.method} rows={14} required />
      </label>
      <p className="muted">
        If you change the ingredients or method, the recipe is read again so the cook view, ratios and units stay right.
        That takes about 20–40 seconds.
      </p>

      <label className="field">
        <span>Your notes</span>
        <textarea name="notes" defaultValue={values.notes} rows={3} />
      </label>

      <div className="button-row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/recipes/${id}`} className="btn">
          Cancel
        </Link>
      </div>
      {pending && <p role="status">Saving. If the ingredients changed this takes a little while.</p>}
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: readonly string[] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o} value={o}>
            {titleCase(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
