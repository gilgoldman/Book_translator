import Link from "next/link";
import { redirect } from "next/navigation";
import { RecipeMeta } from "@/components/recipe-meta";
import { requireSession } from "@/lib/auth";
import { pendingDuplicates } from "@/lib/dedupe";
import { parseIngredientIntent } from "@/lib/ingredient-intent";
import { searchRecipes, type RecipeCard } from "@/lib/search";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  // "I have a lot of leeks" / "I don't have buttermilk" go to the ingredient page.
  const intent = parseIngredientIntent(query);
  if (intent) {
    const path = `/ingredients/${encodeURIComponent(intent.ingredient)}`;
    redirect(intent.kind === "substitute" ? `${path}?swap=1` : path);
  }

  const [results, waiting] = await Promise.all([
    searchRecipes(query),
    query ? Promise.resolve([]) : pendingDuplicates(session.userId, session.isAdmin),
  ]);

  return (
    <>
      <form className="search" action="/" role="search">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search, or list what you have…"
          aria-label="Search recipes"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {!query && (
        <p className="search-hint muted">
          Try <em>leeks, eggs, feta</em> · <em>I have a lot of courgettes</em> · <em>no buttermilk</em>
        </p>
      )}

      {waiting.length > 0 && (
        <section className="notice" aria-label="Imports waiting for a decision">
          <p>These imports look like recipes you already have. Choose what to keep:</p>
          <ul>
            {waiting.map((w) => (
              <li key={w.id}>
                <Link href={`/recipes/${w.id}`}>{w.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.length === 0 ? (
        <p className="empty muted">
          {query ? "Nothing matches yet." : "The book is empty."} <Link href="/add">Add a recipe</Link>
        </p>
      ) : (
        <ul className="cards">
          {results.map((r) => (
            <Card key={r.id} r={r} />
          ))}
        </ul>
      )}
    </>
  );
}

function Card({ r }: { r: RecipeCard }) {
  return (
    <li className={`card season-${r.season}`}>
      <Link href={`/recipes/${r.id}`}>
        {r.photo && <img src={r.photo} alt="" loading="lazy" className="card-photo" />}
        <div className="card-text">
          <h2>{r.title}</h2>
          {r.title !== r.titleEnglish && <p className="muted subtitle">{r.titleEnglish}</p>}
          <RecipeMeta r={r} />
          {r.match && (
            <p className="match">
              {r.match.have.join(", ")}
              {r.match.missing > 0 ? ` · needs ${r.match.missing} more` : " · you have everything"}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
