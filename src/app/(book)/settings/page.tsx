import { asc } from "drizzle-orm";
import { changePassword, logout, removeUser, setUserStatus } from "@/app/actions";
import { SimpleForm } from "@/components/login-form";
import { db, users } from "@/db";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const people = session.isAdmin
    ? await db()
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          status: users.status,
          note: users.requestNote,
          isAdmin: users.isAdmin,
          telegram: users.telegramChatId,
        })
        .from(users)
        .orderBy(asc(users.createdAt))
    : [];
  const pending = people.filter((p) => p.status === "pending");
  const members = people.filter((p) => p.status === "approved");
  const declined = people.filter((p) => p.status === "declined");

  return (
    <div className="narrow settings">
      <h1>Settings</h1>

      {session.isAdmin && (
        <section aria-labelledby="requests">
          <h2 id="requests">Access requests</h2>
          {pending.length === 0 ? (
            <p className="muted">No one is waiting.</p>
          ) : (
            <ul className="people">
              {pending.map((p) => (
                <li key={p.id}>
                  <p>
                    <strong>{p.displayName ?? p.username}</strong> <span className="muted">@{p.username}</span>
                  </p>
                  {p.note && <p className="muted">“{p.note}”</p>}
                  <div className="button-row">
                    <form action={setUserStatus.bind(null, p.id, "approved")}>
                      <button className="primary">Approve</button>
                    </form>
                    <form action={setUserStatus.bind(null, p.id, "declined")}>
                      <button className="secondary">Decline</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {session.isAdmin && (
        <section aria-labelledby="people">
          <h2 id="people">People</h2>
          <ul className="people">
            {members.map((p) => (
              <li key={p.id}>
                <p>
                  <strong>{p.displayName ?? p.username}</strong>{" "}
                  <span className="muted">
                    @{p.username}
                    {p.isAdmin ? " · owner" : ""}
                    {p.telegram ? " · Telegram" : ""}
                  </span>
                </p>
                {!p.isAdmin && (
                  <form action={setUserStatus.bind(null, p.id, "declined")}>
                    <button className="secondary">Remove access</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {declined.length > 0 && (
            <details>
              <summary>Declined ({declined.length})</summary>
              <ul className="people">
                {declined.map((p) => (
                  <li key={p.id}>
                    <p>
                      {p.displayName ?? p.username} <span className="muted">@{p.username}</span>
                    </p>
                    <div className="button-row">
                      <form action={setUserStatus.bind(null, p.id, "approved")}>
                        <button className="secondary">Approve after all</button>
                      </form>
                      <form action={removeUser.bind(null, p.id)}>
                        <button className="secondary danger">Delete account</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section aria-labelledby="telegram">
        <h2 id="telegram">Telegram</h2>
        {bot ? (
          <p>
            Open <a href={`https://t.me/${bot}`}>@{bot}</a> and send <code>/login {session.username} your-password</code>.
            Then send it photos, links, voice notes or questions.
          </p>
        ) : (
          <p className="muted">The Telegram bot isn&apos;t set up yet.</p>
        )}
      </section>

      <section aria-labelledby="password">
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

      <form action={logout}>
        <button className="secondary">Sign out</button>
      </form>
    </div>
  );
}
