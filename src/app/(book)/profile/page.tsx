import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { changePassword, deleteRecipe, logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { SimpleForm } from "@/components/login-form";
import { AvatarForm, NameForm } from "@/components/profile-forms";
import { db, recipes } from "@/db";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const me = await requireSession();
  const mine = await db()
    .select({ id: recipes.id, title: recipes.title, createdAt: recipes.createdAt })
    .from(recipes)
    .where(and(eq(recipes.createdBy, me.userId), isNull(recipes.duplicateOf)))
    .orderBy(desc(recipes.createdAt));
  const bot = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <div className="narrow stack-sections">
      <div className="profile-head">
        <Avatar name={me.displayName} src={me.avatarUrl} size="lg" />
        <div>
          <p className="kicker">Your profile</p>
          <h1 style={{ margin: 0 }}>{me.displayName}</h1>
          <p className="muted" style={{ margin: 0 }}>
            @{me.username}
            {me.isAdmin ? " · owner" : ""}
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="about">
        <h2 id="about">Name and picture</h2>
        <NameForm current={me.displayName} />
        <AvatarForm hasAvatar={!!me.avatarUrl} />
      </section>

      <section className="card" aria-labelledby="mine">
        <h2 id="mine">Recipes you added ({mine.length})</h2>
        {mine.length === 0 ? (
          <p>
            None yet. <Link href="/add">Add your first recipe</Link>
          </p>
        ) : (
          <ul className="my-recipes">
            {mine.map((r) => (
              <li key={r.id}>
                <Link className="title" href={`/recipes/${r.id}`}>
                  {r.title}
                </Link>
                <div className="button-row">
                  <Link className="btn" href={`/recipes/${r.id}/edit`}>
                    <Icon name="edit" /> Edit
                  </Link>
                  <form action={deleteRecipe.bind(null, r.id, "/profile")}>
                    <button className="btn danger" aria-label={`Delete ${r.title}`}>
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: "var(--sp-4)" }}>
          <Link href="/add" className="btn btn-primary">
            <Icon name="plus" /> Add a recipe
          </Link>
        </p>
      </section>

      <section className="card" aria-labelledby="password">
        <h2 id="password">Change password</h2>
        <SimpleForm
          action={changePassword}
          submit="Change password"
          fields={[
            { name: "current", label: "Current password", type: "password", autoComplete: "current-password" },
            { name: "next", label: "New password (10+ characters)", type: "password", autoComplete: "new-password" },
          ]}
        />
      </section>

      <section className="card" aria-labelledby="telegram">
        <h2 id="telegram">Telegram</h2>
        {bot ? (
          <p>
            Open <a href={`https://t.me/${bot}`}>@{bot}</a> and send <code>/login {me.username} your-password</code>. Then
            send it photos, links, voice notes or questions.
          </p>
        ) : (
          <p className="muted">The Telegram bot isn&apos;t set up yet.</p>
        )}
      </section>

      <form action={logout}>
        <button className="btn">Sign out</button>
      </form>
    </div>
  );
}
