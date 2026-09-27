import Link from "next/link";
import { decideDuplicate } from "@/app/actions";
import { ingredientDiff } from "@/lib/dedupe-rules";

/** Shown on a fresh import that looks like a recipe already in the book. */
export function DuplicatePrompt({
  newId,
  original,
  freshIngredients,
  canReplace,
}: {
  newId: string;
  original: { id: string; title: string; ingredients: { canonical: string }[] };
  freshIngredients: { canonical: string }[];
  canReplace: boolean;
}) {
  const diff = ingredientDiff(
    original.ingredients.map((i) => i.canonical),
    freshIngredients.map((i) => i.canonical),
  );
  return (
    <section className="duplicate" aria-labelledby="dup-title" role="region">
      <h2 id="dup-title">Looks familiar</h2>
      <p>
        This looks like <Link href={`/recipes/${original.id}`}>{original.title}</Link>, which is already in the book.
      </p>
      <ul className="diff">
        {diff.added.length > 0 && <li>Only in the new one: {diff.added.join(", ")}</li>}
        {diff.removed.length > 0 && <li>Only in the original: {diff.removed.join(", ")}</li>}
        {diff.added.length + diff.removed.length === 0 && <li>Same ingredients.</li>}
      </ul>
      <div className="button-row">
        <form action={decideDuplicate.bind(null, newId, "keep-original")}>
          <button className="secondary">Keep original</button>
        </form>
        {canReplace && (
          <form action={decideDuplicate.bind(null, newId, "replace")}>
            <button className="secondary">Replace with new</button>
          </form>
        )}
        <form action={decideDuplicate.bind(null, newId, "keep-both")}>
          <button className="secondary">Keep both</button>
        </form>
      </div>
      <p className="muted small">
        Replacing keeps the original&apos;s notes, photos and share link. Until you choose, the new one stays out of
        search.
      </p>
    </section>
  );
}
