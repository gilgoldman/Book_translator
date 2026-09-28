import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { DuplicatePrompt } from "@/components/duplicate-prompt";
import { Icon } from "@/components/icons";
import { RecipeExtras } from "@/components/recipe-extras";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { TranslationNote } from "@/components/translation-note";
import { db, recipeColumns, recipes, sources, users } from "@/db";
import { requireSession } from "@/lib/auth";
import { canEdit } from "@/lib/dedupe";
import { dirFor } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { localNames } from "@/lib/ingredient-names";
import { asWritten, ensureTranslations, localizeRecipe } from "@/lib/translations";

// Cached per request: the page and its metadata share one query.
const load = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: recipeColumns });
});

export async function generateMetadata({ params }: PageProps<"/recipes/[id]">) {
  const [r, t] = await Promise.all([load((await params).id), getT()]);
  return { title: r ? localizeRecipe(r, t.locale).recipe.title : t("common.recipe") };
}

export default async function RecipePage({ params, searchParams }: PageProps<"/recipes/[id]">) {
  const session = await requireSession();
  const t = await getT();
  const r = await load((await params).id);
  if (!r) notFound();
  const showOriginal = (await searchParams).original === "1";
  const localized = showOriginal ? asWritten(r) : localizeRecipe(r, t.locale);
  // Missing or out of date (an older recipe, or a failed call): make it now for next time.
  if (localized.refresh) after(() => ensureTranslations(r.id, [t.locale]));
  const shown = localized.recipe;

  const [original, source, uploader, names] = await Promise.all([
    r.duplicateOf ? load(r.duplicateOf) : null,
    r.sourceId ? db().query.sources.findFirst({ where: eq(sources.id, r.sourceId) }) : null,
    r.createdBy
      ? db().query.users.findFirst({
          where: eq(users.id, r.createdBy),
          columns: { username: true, displayName: true, avatarUrl: true },
        })
      : null,
    localNames(r.ingredients.map((i) => i.canonical), t.locale),
  ]);
  if (original) {
    const more = await localNames(original.ingredients.map((i) => i.canonical), t.locale);
    more.forEach((v, k) => names.set(k, v));
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const editable = canEdit(r, session);

  return (
    <>
      {original && (
        <DuplicatePrompt
          newId={r.id}
          original={{ ...original, title: localizeRecipe(original, t.locale).recipe.title }}
          freshIngredients={r.ingredients}
          names={Object.fromEntries(names)}
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
          <header className="r-head">
            <RecipeMeta r={r} />
            <div lang={localized.language} dir={dirFor(localized.language)}>
              <h1>{shown.title}</h1>
              {shown.title !== r.title && (
                <p className="subtitle" lang={r.language} dir={dirFor(r.language)}>
                  {r.title}
                </p>
              )}
              {shown.description && <p className="r-dek">{shown.description}</p>}
            </div>
            <TranslationNote
              localized={localized.status}
              original={r.language}
              showingOriginal={showOriginal}
              path={`/recipes/${r.id}`}
            />
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
              {shown.servings && <span className="muted">{t("recipe.makes", { n: shown.servings })}</span>}
              {editable && (
                <Link href={`/recipes/${r.id}/edit`} className="btn">
                  <Icon name="edit" /> {t("common.edit")}
                </Link>
              )}
            </div>
          </header>

          <RecipeView
            recipeId={r.id}
            recipe={{
              title: shown.title,
              language: localized.language,
              ingredients: shown.ingredients,
              steps: shown.steps,
              enrichment: shown.enrichment,
            }}
            ingredientNames={Object.fromEntries(names)}
            source={source ? { kind: source.kind, url: source.url, files: source.files, text: source.text } : null}
          />

          {r.notes && (
            <p className="notes" dir="auto">
              <strong>{t("recipe.notes")} </strong>
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
