import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db, recipes, sources } from "@/db";
import { RecipeExtras } from "@/components/recipe-extras";
import { RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { dirFor } from "@/lib/format";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return db().query.recipes.findFirst({ where: eq(recipes.id, id) });
}

export async function generateMetadata({ params }: PageProps<"/recipes/[id]">) {
  const r = await load((await params).id);
  return { title: r?.title ?? "Recipe" };
}

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  const r = await load((await params).id);
  if (!r) notFound();
  const source = r.sourceId ? await db().query.sources.findFirst({ where: eq(sources.id, r.sourceId) }) : null;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <article className={`recipe season-${r.season}`}>
      {r.photos[0] && <img src={r.photos[0]} alt="" className="hero" />}
      <header dir={dirFor(r.language)}>
        <h1>{r.title}</h1>
        {r.title !== r.titleEnglish && <p className="muted subtitle">{r.titleEnglish}</p>}
        {r.description && <p className="description">{r.description}</p>}
        <RecipeMeta r={r} />
        {r.servings && <p className="muted small">Makes {r.servings}</p>}
      </header>

      <RecipeView
        recipe={{
          title: r.title,
          language: r.language,
          ingredients: r.ingredients,
          steps: r.steps,
          enrichment: r.enrichment,
        }}
        source={source ? { kind: source.kind, url: source.url, files: source.files, text: source.text } : null}
      />

      {r.notes && <p className="notes">{r.notes}</p>}

      <RecipeExtras
        id={r.id}
        notes={r.notes}
        shareUrl={`${origin}/r/${r.shareToken}`}
        tags={{ cuisine: r.cuisine, course: r.course, season: r.season, diet: r.diet }}
      />
    </article>
  );
}
