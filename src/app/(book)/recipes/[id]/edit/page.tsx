import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { EditRecipeForm } from "@/components/edit-recipe-form";
import { db, recipes } from "@/db";
import { requireSession } from "@/lib/auth";
import { canEdit } from "@/lib/dedupe";

export const metadata = { title: "Edit recipe" };
// Changing ingredients or method re-reads the recipe with the LLM.
export const maxDuration = 300;

export default async function EditRecipePage({ params }: PageProps<"/recipes/[id]/edit">) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, id) });
  if (!r) notFound();
  if (!canEdit(r, session)) redirect(`/recipes/${id}`);

  return (
    <div className="narrow">
      <p className="kicker">Edit</p>
      <h1>{r.title}</h1>
      <div className="card">
        <EditRecipeForm
          id={r.id}
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
