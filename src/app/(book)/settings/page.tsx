import { asc } from "drizzle-orm";
import { addPerson, changePassword, logout } from "@/app/actions";
import { SimpleForm } from "@/components/login-form";
import { db, users } from "@/db";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const people = await db()
    .select({ username: users.username, displayName: users.displayName, telegram: users.telegramChatId })
    .from(users)
    .orderBy(asc(users.createdAt));
  const bot = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <div className="narrow settings">
      <h1>Settings</h1>

      <section>
        <h2>Telegram</h2>
        {bot ? (
          <p>
            Open <a href={`https://t.me/${bot}`}>@{bot}</a> and send{" "}
            <code>/login {session.username} your-password</code>. Then send it photos, links, voice notes or
            questions.
          </p>
        ) : (
          <p className="muted">The Telegram bot isn&apos;t set up yet (see README).</p>
        )}
      </section>

      <section>
        <h2>People</h2>
        <ul className="people">
          {people.map((p) => (
            <li key={p.username}>
              {p.displayName ?? p.username} <span className="muted">@{p.username}{p.telegram ? " · telegram" : ""}</span>
            </li>
          ))}
        </ul>
        {session.isAdmin && (
          <SimpleForm
            action={addPerson}
            submit="add person"
            fields={[
              { name: "displayName", placeholder: "name (optional)" },
              { name: "username", placeholder: "username", autoComplete: "off" },
              { name: "password", placeholder: "their password", type: "password", autoComplete: "new-password" },
            ]}
          />
        )}
      </section>

      <section>
        <h2>Password</h2>
        <SimpleForm
          action={changePassword}
          submit="change password"
          fields={[
            { name: "current", placeholder: "current password", type: "password", autoComplete: "current-password" },
            { name: "next", placeholder: "new password", type: "password", autoComplete: "new-password" },
          ]}
        />
      </section>

      <form action={logout}>
        <button className="quiet">sign out</button>
      </form>
    </div>
  );
}
