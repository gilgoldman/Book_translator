import Link from "next/link";
import { Suspense } from "react";
import { SubstitutionCard } from "@/components/substitution";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import { titleCase } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { localName, localNames } from "@/lib/ingredient-names";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";

export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/ingredients/[name]">) {
  const t = await getT();
  const name = await resolveIngredient(decodeURIComponent((await params).name));
  return { title: titleCase(await localName(name, t.locale)) };
}

/** Ingredient-first: "I have a lot of X" and "I don't have X", in any app language. */
export default async function IngredientPage({ params, searchParams }: PageProps<"/ingredients/[name]">) {
  const t = await getT();
  const name = await resolveIngredient(decodeURIComponent((await params).name));
  const { swap } = await searchParams;
  const [uses, pairs, label] = await Promise.all([
    recipesUsingMost(name, t.locale),
    goesWellWith(name),
    localName(name, t.locale),
  ]);
  const pairNames = await localNames(
    pairs.map((p) => p.name),
    t.locale,
  );
  const most = Math.max(0, ...uses.map((u) => u.grams ?? 0));

  const swapSection = (
    <section aria-labelledby="swap">
      <h2 id="swap">{t("ingredientPage.noSwap", { name: label })}</h2>
      <Suspense fallback={<p className="muted">{t("ingredientPage.thinking")}</p>}>
        <Swaps name={name} locale={t.locale} failed={t("ingredient.swapFailed")} />
      </Suspense>
    </section>
  );

  return (
    <div className="ingredient-page narrow">
      <p className="kicker">{t("ingredientPage.kicker")}</p>
      <h1>{titleCase(label)}</h1>
      {swap && swapSection}

      <section aria-labelledby="uses">
        <h2 id="uses">{t("ingredientPage.usesMost", { name: label })}</h2>
        {uses.length === 0 ? (
          <p className="muted">{t("ingredientPage.none", { name: label })}</p>
        ) : (
          <ol className="uses">
            {uses.map((u) => (
              <li key={u.id} className={`season-${u.season}`}>
                <Link href={`/recipes/${u.id}`}>
                  <span className="top">
                    <span dir="auto">{u.title}</span>
                    {u.amount && (
                      <span className="amt" dir="auto">
                        {u.amount}
                      </span>
                    )}
                  </span>
                  {most && u.grams ? (
                    <span className="meter" aria-hidden>
                      <i style={{ width: `${Math.max(6, Math.round((u.grams / most) * 100))}%` }} />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pairs.length > 0 && (
        <section aria-labelledby="pairs">
          <h2 id="pairs">{t("ingredientPage.pairs")}</h2>
          <ul className="chips">
            {pairs.map((p) => (
              <li key={p.name}>
                <Link href={`/ingredients/${encodeURIComponent(p.name)}`} className="chip">
                  {pairNames.get(p.name) ?? p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!swap && swapSection}
    </div>
  );
}

async function Swaps({ name, locale, failed }: { name: string; locale: Locale; failed: string }) {
  const result = await suggestSubstitutes(name, locale).catch((err) => {
    console.error("substitutes failed", err);
    return null;
  });
  if (!result) return <p className="muted">{failed}</p>;
  return <SubstitutionCard result={result} />;
}
