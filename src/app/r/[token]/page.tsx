import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { A11yControls } from "@/components/a11y-controls";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { TimersProvider } from "@/components/timers";
import { db, recipes, users } from "@/db";
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
  const uploader = r.createdBy
    ? await db().query.users.findFirst({
        where: eq(users.id, r.createdBy),
        columns: { username: true, displayName: true, avatarUrl: true },
      })
    : null;
  return (
    <TimersProvider>
      <main id="main" className="page shared">
        <div className="shared-bar">
          <span className="wordmark">
            <span className="book" aria-hidden />A recipe from our cookbook
          </span>
          <div className="appbar-actions">
            <A11yControls />
          </div>
        </div>
        <article className={`recipe season-${r.season}`}>
          {r.photos[0] && (
            <div className="r-hero">
              <img src={r.photos[0]} alt="" />
            </div>
          )}
          <div className="r-body">
            <header className="r-head" dir={dirFor(r.language)}>
              <RecipeMeta r={r} />
              <h1>{r.title}</h1>
              {r.description && <p className="r-dek">{r.description}</p>}
              <AddedBy
                link={false}
                by={
                  uploader
                    ? { username: uploader.username, name: uploader.displayName || uploader.username, avatar: uploader.avatarUrl }
                    : null
                }
              />
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
          </div>
        </article>
        <footer className="shared-footer">Shared with love from our family cookbook</footer>
      </main>
    </TimersProvider>
  );
}
