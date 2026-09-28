import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { AddedBy, RecipeMeta } from "@/components/recipe-meta";
import { db, users } from "@/db";
import { requireSession } from "@/lib/auth";
import { pendingDuplicates } from "@/lib/dedupe";
import { getT } from "@/lib/i18n/server";
import { parseIngredientIntent } from "@/lib/ingredient-intent";
import type { Translator } from "@/lib/i18n/translate";
import { recentRecipes, searchRecipes, type RecipeCard } from "@/lib/search";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  const t = await getT();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const by = typeof params.by === "string" ? params.by : "";

  // "I have a lot of leeks" / "I don't have buttermilk, would yogurt work?" go to the ingredient page.
  const intent = parseIngredientIntent(query);
  if (intent) {
    const path = `/ingredients/${encodeURIComponent(intent.ingredient)}`;
    if (intent.kind === "abundance") redirect(path);
    redirect(`${path}?swap=1${intent.candidate ? `&with=${encodeURIComponent(intent.candidate)}` : ""}`);
  }

  const [results, waiting, person] = await Promise.all([
    by ? recentRecipes(t.locale, 200, by) : searchRecipes(query, t.locale),
    query || by ? Promise.resolve([]) : pendingDuplicates(session.userId, session.isAdmin, t.locale),
    by ? db().query.users.findFirst({ where: eq(users.username, by), columns: { displayName: true } }) : null,
  ]);
  const heading = by
    ? t("common.addedBy", { name: person?.displayName || by })
    : query
      ? t("home.resultsFor", { query })
      : t("home.recent");

  return (
    <>
      <form className="search-form" action="/" role="search">
        <label className="search-label" htmlFor="q">
          {t("home.searchLabel")}
        </label>
        <div className="search">
          <Icon name="search" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t("home.searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="primary">{t("home.search")}</button>
        </div>
        <p className="hint">
          {t("home.try")}{" "}
          {t("home.examples")
            .split("|")
            .map((example, i) => (
              <span key={example}>
                {i > 0 && " · "}
                <Link href={`/?q=${encodeURIComponent(example)}`}>
                  <em>{example}</em>
                </Link>
              </span>
            ))}
        </p>
      </form>

      {waiting.length > 0 && (
        <section className="notice" aria-label={t("home.waitingLabel")}>
          <p>
            <strong>{t("home.waitingTitle")}</strong> {t("home.waitingChoose")}
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
        {(query || by) && <Link href="/">{t("home.showAll")}</Link>}
      </div>

      {results.length === 0 ? (
        <div className="empty card">
          <p>
            {query || by ? t("home.nothing") : t("home.empty")}
          </p>
          <Link href="/add" className="btn btn-primary">
            <Icon name="plus" /> {t("nav.add")}
          </Link>
        </div>
      ) : (
        <ul className="cards">
          {results.map((r) => (
            <Card key={r.id} r={r} t={t} />
          ))}
        </ul>
      )}
    </>
  );
}

function Card({ r, t }: { r: RecipeCard; t: Translator }) {
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
          <h3 dir="auto">
            <Link href={`/recipes/${r.id}`}>{r.title}</Link>
          </h3>
          {r.title !== r.originalTitle && <p className="sub" dir="auto">{r.originalTitle}</p>}
          <RecipeMeta r={r} />
          {r.match && (
            <div className="have">
              <strong>
                {r.match.missing > 0
                  ? t("home.haveSome", { have: r.match.have.length, total: r.match.have.length + r.match.missing })
                  : t("home.haveAll")}
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
