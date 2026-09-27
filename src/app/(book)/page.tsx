import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { db, users } from "@/db";
import { requireSession } from "@/lib/auth";
import { pendingDuplicates } from "@/lib/dedupe";
import { parseIngredientIntent } from "@/lib/ingredient-intent";
import { recentRecipes, searchRecipes, type RecipeCard } from "@/lib/search";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const by = typeof params.by === "string" ? params.by : "";

  // "I have a lot of leeks" / "I don't have buttermilk" go to the ingredient page.
  const intent = parseIngredientIntent(query);
  if (intent) {
    const path = `/ingredients/${encodeURIComponent(intent.ingredient)}`;
    redirect(intent.kind === "substitute" ? `${path}?swap=1` : path);
  }

  const [results, waiting, person] = await Promise.all([
    by ? recentRecipes(200, by) : searchRecipes(query),
    query || by ? Promise.resolve([]) : pendingDuplicates(session.userId, session.isAdmin),
    by ? db().query.users.findFirst({ where: eq(users.username, by), columns: { displayName: true } }) : null,
  ]);
  const heading = by
    ? `Added by ${person?.displayName || by}`
    : query
      ? `Results for “${query}”`
      : "Recently added";

  return (
    <>
      <form className="search-form" action="/" role="search">
        <label className="search-label" htmlFor="q">
          What would you like to cook?
        </label>
        <div className="search">
          <Icon name="search" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="What can I make with leeks, eggs, feta?"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="primary">Search</button>
        </div>
        <p className="hint">
          Try <em>leeks, eggs, feta</em> · <em>that lemony chicken</em> · <em>I have a lot of courgettes</em> ·{" "}
          <em>no buttermilk</em>
        </p>
      </form>

      {waiting.length > 0 && (
        <section className="notice" aria-label="Imports waiting for a decision">
          <p>
            <strong>These imports look like recipes you already have.</strong> Choose what to keep:
          </p>
          <ul>
            {waiting.map((w) => (
              <li key={w.id}>
                <Link href={`/recipes/${w.id}`}>{w.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="results-head">
        <h2>{heading}</h2>
        {(query || by) && <Link href="/">Show everything</Link>}
      </div>

      {results.length === 0 ? (
        <div className="empty card">
          <p>
            {query || by
              ? "Nothing matches yet."
              : "The book is empty. Add the first recipe: a photo, a link, a voice note or pasted text."}
          </p>
          <Link href="/add" className="btn btn-primary">
            <Icon name="plus" /> Add a recipe
          </Link>
        </div>
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
    <li className={`season-${r.season}`}>
      <article className="rcard">
        <Link href={`/recipes/${r.id}`} className="photo" aria-hidden tabIndex={-1}>
          {r.photo ? (
            <img src={r.photo} alt="" loading="lazy" />
          ) : (
            <span className="placeholder">
              <Icon name="bowl" />
            </span>
          )}
        </Link>
        <div className="body">
          <h3>
            <Link href={`/recipes/${r.id}`}>{r.title}</Link>
          </h3>
          {r.title !== r.titleEnglish && <p className="sub">{r.titleEnglish}</p>}
          <RecipeMeta r={r} />
          {r.match && (
            <div className="have">
              <strong>
                {r.match.missing > 0
                  ? `You have ${r.match.have.length} of ${r.match.have.length + r.match.missing}`
                  : "You have everything"}
              </strong>
              <p className="miss">{r.match.have.join(", ")}</p>
            </div>
          )}
          <AddedBy by={r.addedBy} />
        </div>
      </article>
    </li>
  );
}
