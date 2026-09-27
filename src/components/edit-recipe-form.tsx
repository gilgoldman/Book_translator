"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateRecipe, type FormState } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
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

export function EditRecipeForm({ id, values, dir }: { id: string; values: Values; dir: "ltr" | "rtl" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateRecipe.bind(null, id), undefined);
  const t = useT();
  return (
    <form action={action} className="form">
      <label className="field">
        <span>{t("edit.title")}</span>
        <input name="title" defaultValue={values.title} required maxLength={200} dir={dir} />
      </label>
      <label className="field">
        <span>{t("edit.description")}</span>
        <textarea name="description" defaultValue={values.description} rows={2} maxLength={1000} dir={dir} />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>{t("edit.makes")}</span>
          <input name="servings" defaultValue={values.servings} placeholder={t("edit.makesPlaceholder")} dir={dir} />
        </label>
        <label className="field">
          <span>{t("edit.total")}</span>
          <input name="totalMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.totalMinutes} />
        </label>
        <label className="field">
          <span>{t("edit.prep")}</span>
          <input name="prepMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.prepMinutes} />
        </label>
        <label className="field">
          <span>{t("edit.cook")}</span>
          <input name="cookMinutes" type="number" inputMode="numeric" min={1} defaultValue={values.cookMinutes} />
        </label>
      </div>

      <div className="grid-2">
        <Select name="cuisine" label={t("edit.cuisine")} value={values.cuisine} options={CUISINES} />
        <Select name="course" label={t("edit.course")} value={values.course} options={COURSES} />
        <Select name="season" label={t("edit.season")} value={values.season} options={SEASONS} />
      </div>
      <fieldset>
        <legend>{t("edit.diet")}</legend>
        <div className="checks">
          {DIETS.map((d) => (
            <label key={d}>
              <input type="checkbox" name="diet" value={d} defaultChecked={values.diet.includes(d)} />
              {t(`diet.${d}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>{t("edit.ingredients")}</span>
        <span className="help">{t("edit.ingredientsHelp")}</span>
        <textarea name="ingredients" defaultValue={values.ingredients} rows={10} required dir={dir} />
      </label>
      <label className="field">
        <span>{t("edit.method")}</span>
        <span className="help">{t("edit.methodHelp")}</span>
        <textarea name="method" defaultValue={values.method} rows={14} required dir={dir} />
      </label>
      <p className="muted">{t("edit.reread")}</p>

      <label className="field">
        <span>{t("extras.notes")}</span>
        <textarea name="notes" defaultValue={values.notes} rows={3} dir="auto" />
      </label>

      <div className="button-row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? t("common.saving") : t("edit.save")}
        </button>
        <Link href={`/recipes/${id}`} className="btn">
          {t("common.cancel")}
        </Link>
      </div>
      {pending && <p role="status">{t("edit.savingStatus")}</p>}
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: "cuisine" | "course" | "season";
  label: string;
  value: string;
  options: readonly string[];
}) {
  const t = useT();
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o} value={o}>
            {t(`${name}.${o}` as MessageKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
