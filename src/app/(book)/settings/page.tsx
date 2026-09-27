import { asc } from "drizzle-orm";
import { removeUser, setUserStatus } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { db, users } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("people.title") };
}

/** Owner only: approve requests and manage who can use the cookbook. */
export default async function PeoplePage() {
  await requireAdmin();
  const t = await getT();
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
        <p className="kicker">{t("people.kicker")}</p>
        <h1>{t("people.title")}</h1>
      </div>

      <section aria-labelledby="requests">
        <h2 id="requests">{t("people.waiting")}</h2>
        {pending.length === 0 ? (
          <p className="muted">{t("people.noneWaiting")}</p>
        ) : (
          <ul className="people">
            {pending.map((p) => (
              <li key={p.id} className="appr">
                <Avatar name={name(p)} src={p.avatar} />
                <div className="who">
                  <b>{name(p)}</b>
                  <span><bdi>@{p.username}</bdi></span>
                </div>
                {p.note && <blockquote>“{p.note}”</blockquote>}
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "approved")}>
                    <button className="btn btn-primary">{t("people.approve")}</button>
                  </form>
                  <form action={setUserStatus.bind(null, p.id, "declined")}>
                    <button className="btn danger">{t("people.decline")}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="members">
        <h2 id="members">{t("people.members")}</h2>
        <ul className="people">
          {members.map((p) => (
            <li key={p.id} className="appr">
              <Avatar name={name(p)} src={p.avatar} />
              <div className="who">
                <b>{name(p)}</b>
                <span>
                  <bdi>@{p.username}</bdi>
                  {p.isAdmin ? ` · ${t("profile.owner")}` : ""}
                  {p.telegram ? ` · ${t("people.telegram")}` : ""}
                </span>
              </div>
              {!p.isAdmin && (
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "declined")}>
                    <button className="btn danger">{t("people.removeAccess")}</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {declined.length > 0 && (
        <details>
          <summary>{t("people.declined", { n: declined.length })}</summary>
          <ul className="people">
            {declined.map((p) => (
              <li key={p.id} className="appr">
                <Avatar name={name(p)} src={p.avatar} />
                <div className="who">
                  <b>{name(p)}</b>
                  <span><bdi>@{p.username}</bdi></span>
                </div>
                <div className="button-row">
                  <form action={setUserStatus.bind(null, p.id, "approved")}>
                    <button className="btn">{t("people.approveAnyway")}</button>
                  </form>
                  <form action={removeUser.bind(null, p.id)}>
                    <button className="btn danger">{t("people.deleteAccount")}</button>
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
