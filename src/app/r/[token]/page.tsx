import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { A11yControls } from "@/components/a11y-controls";
import { LanguageSwitch } from "@/components/language-switch";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { RecipeView } from "@/components/recipe-view";
import { TimersProvider } from "@/components/timers";
import { TranslationNote } from "@/components/translation-note";
import { db, recipeColumns, recipes, users } from "@/db";
import { dirFor } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { asWritten, ensureTranslations, localizeRecipe } from "@/lib/translations";

// Public, read-only page for a friend. Unguessable token, no login. Shown in the
// visitor's language (browser setting or the switch at the top).

// Cached per request: the page and its metadata share one query.
const load = cache(async (token: string) =>
  db().query.recipes.findFirst({ where: eq(recipes.shareToken, token), columns: recipeColumns }),
);

export async function generateMetadata({ params }: PageProps<"/r/[token]">) {
  const [r, t] = await Promise.all([load((await params).token), getT()]);
  const shown = r ? localizeRecipe(r, t.locale).recipe : null;
  return {
    title: shown?.title ?? t("common.recipe"),
    description: shown?.description ?? undefined,
    robots: { index: false },
    openGraph: r?.photos[0] ? { images: [r.photos[0]] } : undefined,
  };
}

export default async function SharedRecipe({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const r = await load(token);
  if (!r) notFound();
  const t = await getT();
  const showOriginal = (await searchParams).original === "1";
  const localized = showOriginal ? asWritten(r) : localizeRecipe(r, t.locale);
  if (localized.refresh) after(() => ensureTranslations(r.id, [t.locale]));
  const shown = localized.recipe;
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
            <span className="book" aria-hidden />
            {t("share.from")}
          </span>
          <div className="appbar-actions">
            <LanguageSwitch />
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
            <header className="r-head">
              <RecipeMeta r={r} />
              <div lang={localized.language} dir={dirFor(localized.language)}>
                <h1>{shown.title}</h1>
                {shown.description && <p className="r-dek">{shown.description}</p>}
              </div>
              <TranslationNote
                localized={localized.status}
                original={r.language}
                showingOriginal={showOriginal}
                path={`/r/${token}`}
              />
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
                title: shown.title,
                language: localized.language,
                ingredients: shown.ingredients,
                steps: shown.steps,
                enrichment: shown.enrichment,
              }}
            />
          </div>
        </article>
        <footer className="shared-footer">{t("share.footer")}</footer>
      </main>
    </TimersProvider>
  );
}
