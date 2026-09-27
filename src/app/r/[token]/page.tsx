import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, recipes } from "@/db";
import { RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { TimersProvider } from "@/components/timers";
import { dirFor } from "@/lib/format";

// Public, read-only page for a friend. Unguessable token, no login.

async function load(token: string) {
  return db().query.recipes.findFirst({ where: eq(recipes.shareToken, token) });
}

export async function generateMetadata({ params }: PageProps<"/r/[token]">) {
  const r = await load((await params).token);
  return {
    title: r?.title ?? "Recipe",
    description: r?.description ?? undefined,
    robots: { index: false },
    openGraph: r?.photos[0] ? { images: [r.photos[0]] } : undefined,
  };
}

export default async function SharedRecipe({ params }: PageProps<"/r/[token]">) {
  const r = await load((await params).token);
  if (!r) notFound();
  return (
    <TimersProvider>
      <main className="page shared">
        <article className={`recipe season-${r.season}`}>
          {r.photos[0] && <img src={r.photos[0]} alt="" className="hero" />}
          <header dir={dirFor(r.language)}>
            <h1>{r.title}</h1>
            {r.description && <p className="description">{r.description}</p>}
            <RecipeMeta r={r} />
          </header>
          <RecipeView
            recipe={{
              title: r.title,
              language: r.language,
              ingredients: r.ingredients,
              steps: r.steps,
              enrichment: r.enrichment,
            }}
          />
        </article>
        <footer className="muted small shared-footer">from our cookbook</footer>
      </main>
    </TimersProvider>
  );
}
