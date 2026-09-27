import Link from "next/link";
import { RecipeMeta } from "@/components/recipe-meta";
import { searchRecipes, type RecipeCard } from "@/lib/search";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const results = await searchRecipes(query);

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
