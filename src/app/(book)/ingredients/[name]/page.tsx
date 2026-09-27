import Link from "next/link";
import { Suspense } from "react";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import { titleCase } from "@/lib/format";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";
import { SubstitutionCard } from "@/components/substitution";

export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/ingredients/[name]">) {
  return { title: titleCase(decodeURIComponent((await params).name)) };
}

/** Ingredient-first: "I have a lot of X" and "I don't have X". */
export default async function IngredientPage({ params, searchParams }: PageProps<"/ingredients/[name]">) {
  const name = await resolveIngredient(decodeURIComponent((await params).name));
  const { swap } = await searchParams;
  const [uses, pairs] = await Promise.all([recipesUsingMost(name), goesWellWith(name)]);

  const swapSection = (
    <section aria-labelledby="swap">
      <h2 id="swap">No {name}? Try instead</h2>
      <Suspense fallback={<p className="muted">Thinking of good swaps…</p>}>
        <Swaps name={name} />
      </Suspense>
    </section>
  );

  return (
    <div className="ingredient-page">
      <h1>{titleCase(name)}</h1>
      {swap && swapSection}

      <section aria-labelledby="uses">
        <h2 id="uses">Uses the most {name}</h2>
        {uses.length === 0 ? (
          <p className="muted">No recipes with {name} yet.</p>
        ) : (
          <ol className="uses">
            {uses.map((u) => (
              <li key={u.id} className={`season-${u.season}`}>
                <Link href={`/recipes/${u.id}`}>
                  <span className="use-title">{u.title}</span>
                  {u.amount && <span className="use-amount">{u.amount}</span>}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pairs.length > 0 && (
        <section aria-labelledby="pairs">
          <h2 id="pairs">Goes well with</h2>
          <ul className="pairs">
            {pairs.map((p) => (
              <li key={p.name}>
                <Link href={`/ingredients/${encodeURIComponent(p.name)}`} className="chip">
                  {p.name}
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

async function Swaps({ name }: { name: string }) {
  const result = await suggestSubstitutes(name).catch((err) => {
    console.error("substitutes failed", err);
    return null;
  });
  if (!result) return <p className="muted">Couldn&apos;t get suggestions right now.</p>;
  return <SubstitutionCard result={result} />;
}
