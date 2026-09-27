import { asc } from "drizzle-orm";
import { removeUser, setUserStatus } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { db, users } from "@/db";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "People" };

/** Owner only: approve requests and manage who can use the cookbook. */
export default async function PeoplePage() {
  await requireAdmin();
  const people = await db()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatarUrl,
      status: users.status,
      note: users.requestNote,
      isAdmin: users.isAdmin,
      telegram: users.telegramChatId,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
  const pending = people.filter((p) => p.status === "pending");
  const members = people.filter((p) => p.status === "approved");
  const declined = people.filter((p) => p.status === "declined");
  const name = (p: (typeof people)[number]) => p.displayName || p.username;

  return (
    <div className="narrow stack-sections">
      <div>
        <p className="kicker">Owner</p>
        <h1>People</h1>
      </div>

      <section aria-labelledby="requests">
        <h2 id="requests">Waiting for approval</h2>
        {pending.length === 0 ? (
          <p className="muted">No one is waiting.</p>
        ) : (
          <ul className="people">
            {pending.map((p) => (
              <li key={p.id} className="appr">
                <Avatar name={name(p)} src={p.avatar} />
                <div className="who">
                  <b>{name(p)}</b>
                  <span>@{p.username}</span>
                </div>
                {p.note && <blockquote>“{p.note}”</blockquote>}
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "approved")}>
                    <button className="btn btn-primary">Approve</button>
                  </form>
                  <form action={setUserStatus.bind(null, p.id, "declined")}>
                    <button className="btn danger">Decline</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="members">
        <h2 id="members">Members</h2>
        <ul className="people">
          {members.map((p) => (
            <li key={p.id} className="appr">
              <Avatar name={name(p)} src={p.avatar} />
              <div className="who">
                <b>{name(p)}</b>
                <span>
                  @{p.username}
                  {p.isAdmin ? " · owner" : ""}
                  {p.telegram ? " · Telegram" : ""}
                </span>
              </div>
              {!p.isAdmin && (
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "declined")}>
                    <button className="btn danger">Remove access</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {declined.length > 0 && (
        <details>
          <summary>Declined or removed ({declined.length})</summary>
          <ul className="people">
            {declined.map((p) => (
              <li key={p.id} className="appr">
                <Avatar name={name(p)} src={p.avatar} />
                <div className="who">
                  <b>{name(p)}</b>
                  <span>@{p.username}</span>
                </div>
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "approved")}>
                    <button className="btn">Approve after all</button>
                  </form>
                  <form action={removeUser.bind(null, p.id)}>
                    <button className="btn danger">Delete account</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
