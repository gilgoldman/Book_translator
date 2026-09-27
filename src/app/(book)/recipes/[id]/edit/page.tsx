import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { EditRecipeForm } from "@/components/edit-recipe-form";
import { db, recipes } from "@/db";
import { requireSession } from "@/lib/auth";
import { canEdit } from "@/lib/dedupe";
import { dirFor, languageName } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("edit.pageTitle") };
}
// Changing ingredients or method re-reads the recipe with the LLM.
export const maxDuration = 300;

export default async function EditRecipePage({ params }: PageProps<"/recipes/[id]/edit">) {
  const session = await requireSession();
  const t = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, id) });
  if (!r) notFound();
  if (!canEdit(r, session)) redirect(`/recipes/${id}`);

  return (
    <div className="narrow">
      <p className="kicker">{t("edit.kicker")}</p>
      <h1 dir="auto">{r.title}</h1>
      {/* Edits go to the original; translations follow. */}
      {r.language !== t.locale && (
        <p className="translation-note">{t("edit.originalNote", { language: languageName(r.language, t.locale) })}</p>
      )}
      <div className="card">
        <EditRecipeForm
          id={r.id}
          dir={dirFor(r.language)}
          values={{
            title: r.title,
            description: r.description ?? "",
            servings: r.servings ?? "",
            prepMinutes: r.prepMinutes?.toString() ?? "",
            cookMinutes: r.cookMinutes?.toString() ?? "",
            totalMinutes: r.totalMinutes?.toString() ?? "",
            cuisine: r.cuisine,
            course: r.course,
            season: r.season,
            diet: r.diet,
            ingredients: r.ingredients.map((i) => i.original).join("\n"),
            method: r.steps.map((s) => s.text).join("\n\n"),
            notes: r.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
