import Link from "next/link";
import { decideDuplicate } from "@/app/actions";
import { ingredientDiff } from "@/lib/dedupe-rules";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/translate";

/** Shown on a fresh import that looks like a recipe already in the book. */
export async function DuplicatePrompt({
  newId,
  original,
  freshIngredients,
  names,
  canReplace,
}: {
  newId: string;
  original: { id: string; title: string; ingredients: { canonical: string }[] };
  freshIngredients: { canonical: string }[];
  /** canonical ingredient -> name in the reader's language */
  names: Record<string, string>;
  canReplace: boolean;
}) {
  const t = await getT();
  const show = (list: string[]) => list.map((n) => names[n] ?? n).join(", ");
  const diff = ingredientDiff(
    original.ingredients.map((i) => i.canonical),
    freshIngredients.map((i) => i.canonical),
  );
  return (
    <section className="dup" aria-labelledby="dup-title">
      <p className="kicker">{t("dup.kicker")}</p>
      <h2 id="dup-title">
        {rich(t("dup.title"), {
          recipe: (
            <Link key="original" href={`/recipes/${original.id}`} dir="auto">
              {original.title}
            </Link>
          ),
        })}
      </h2>
      <p className="muted">{t("dup.hidden")}</p>
      <ul className="diff">
        {diff.added.length > 0 && (
          <li>
            <span className="mk" aria-hidden>
              +
            </span>
            <span>
              <strong>{t("dup.onlyNew")}</strong> {show(diff.added)}
            </span>
          </li>
        )}
        {diff.removed.length > 0 && (
          <li>
            <span className="mk" aria-hidden>
              −
            </span>
            <span>
              <strong>{t("dup.onlyOriginal")}</strong> {show(diff.removed)}
            </span>
          </li>
        )}
        {diff.added.length + diff.removed.length === 0 && (
          <li>
            <span className="mk" aria-hidden>
              =
            </span>
            <span>{t("dup.same")}</span>
          </li>
        )}
      </ul>
      <div className="choices">
        <form action={decideDuplicate.bind(null, newId, "keep-original")}>
          <button className="choice primary">
            <b>{t("dup.keep")}</b>
            <span>{t("dup.keepHelp")}</span>
          </button>
        </form>
        {canReplace && (
          <form action={decideDuplicate.bind(null, newId, "replace")}>
            <button className="choice">
              <b>{t("dup.replace")}</b>
              <span>{t("dup.replaceHelp")}</span>
            </button>
          </form>
        )}
        <form action={decideDuplicate.bind(null, newId, "keep-both")}>
          <button className="choice">
            <b>{t("dup.both")}</b>
            <span>{t("dup.bothHelp")}</span>
          </button>
        </form>
      </div>
    </section>
  );
}
