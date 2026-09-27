import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DuplicatePrompt } from "@/components/duplicate-prompt";
import { Icon } from "@/components/icons";
import { RecipeExtras } from "@/components/recipe-extras";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { db, recipes, sources, users } from "@/db";
import { requireSession } from "@/lib/auth";
import { canEdit } from "@/lib/dedupe";
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
  const session = await requireSession();
  const r = await load((await params).id);
  if (!r) notFound();
  const [original, source, uploader] = await Promise.all([
    r.duplicateOf ? load(r.duplicateOf) : null,
    r.sourceId ? db().query.sources.findFirst({ where: eq(sources.id, r.sourceId) }) : null,
    r.createdBy ? db().query.users.findFirst({ where: eq(users.id, r.createdBy) }) : null,
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const editable = canEdit(r, session);

  return (
    <>
      {original && (
        <DuplicatePrompt
          newId={r.id}
          original={original}
          freshIngredients={r.ingredients}
          canReplace={canEdit(original, session)}
        />
      )}
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
            {r.title !== r.titleEnglish && <p className="subtitle">{r.titleEnglish}</p>}
            {r.description && <p className="r-dek">{r.description}</p>}
            <div className="button-row">
              <AddedBy
                by={
                  uploader
                    ? {
                        username: uploader.username,
                        name: uploader.displayName || uploader.username,
                        avatar: uploader.avatarUrl,
                      }
                    : null
                }
              />
              {r.servings && <span className="muted">Makes {r.servings}</span>}
              {editable && (
                <Link href={`/recipes/${r.id}/edit`} className="btn">
                  <Icon name="edit" /> Edit
                </Link>
              )}
            </div>
          </header>

          <RecipeView
            recipeId={r.id}
            recipe={{
              title: r.title,
              language: r.language,
              ingredients: r.ingredients,
              steps: r.steps,
              enrichment: r.enrichment,
            }}
            source={source ? { kind: source.kind, url: source.url, files: source.files, text: source.text } : null}
          />

          {r.notes && (
            <p className="notes">
              <strong>Notes: </strong>
              {r.notes}
            </p>
          )}

          <RecipeExtras
            id={r.id}
            notes={r.notes}
            shareUrl={`${origin}/r/${r.shareToken}`}
            canEdit={editable}
          />
        </div>
      </article>
    </>
  );
}
