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
    <section className="dup" aria-labelledby="dup-title">
      <p className="kicker">Looks familiar</p>
      <h2 id="dup-title">
        This looks like <Link href={`/recipes/${original.id}`}>{original.title}</Link>, already in the book
      </h2>
      <p className="muted">Until you choose, the new one stays out of search.</p>
      <ul className="diff">
        {diff.added.length > 0 && (
          <li>
            <span className="mk" aria-hidden>
              +
            </span>
            <span>
              <strong>Only in the new one:</strong> {diff.added.join(", ")}
            </span>
          </li>
        )}
        {diff.removed.length > 0 && (
          <li>
            <span className="mk" aria-hidden>
              −
            </span>
            <span>
              <strong>Only in the original:</strong> {diff.removed.join(", ")}
            </span>
          </li>
        )}
        {diff.added.length + diff.removed.length === 0 && (
          <li>
            <span className="mk" aria-hidden>
              =
            </span>
            <span>Same ingredients.</span>
          </li>
        )}
      </ul>
      <div className="choices">
        <form action={decideDuplicate.bind(null, newId, "keep-original")}>
          <button className="choice primary">
            <b>Keep original</b>
            <span>Throw away this new import.</span>
          </button>
        </form>
        {canReplace && (
          <form action={decideDuplicate.bind(null, newId, "replace")}>
            <button className="choice">
              <b>Replace with new</b>
              <span>Use the new version; keep notes, photos and the share link.</span>
            </button>
          </form>
        )}
        <form action={decideDuplicate.bind(null, newId, "keep-both")}>
          <button className="choice">
            <b>Keep both</b>
            <span>They&apos;re different enough to keep side by side.</span>
          </button>
        </form>
      </div>
    </section>
  );
}
