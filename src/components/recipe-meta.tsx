import Link from "next/link";
import { formatMinutes } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { Avatar } from "./avatar";
import { Icon, SEASON_ICON } from "./icons";

/** The visible tags: season (colour + icon + word), cuisine, course, diet, time. */
export async function RecipeMeta({
  r,
}: {
  r: { cuisine: string; course: string; diet: string[]; season: string; totalMinutes: number | null };
}) {
  const t = await getT();
  // Values come from fixed lists; an unknown one (older data) shows as stored.
  const label = (key: string, fallback: string) => {
    const text = t(key as MessageKey);
    return text === key ? fallback : text;
  };
  const time = formatMinutes(r.totalMinutes, t);
  const diet = r.diet.filter((d) => d !== "meat" && d !== "kosher");
  return (
    <p className="tagline">
      <span className={`season season-${r.season}`}>
        <Icon name={SEASON_ICON[r.season] ?? "bowl"} />
        {label(`season.${r.season}`, r.season)}
      </span>
      <span>{label(`cuisine.${r.cuisine}`, r.cuisine)}</span>
      <span>{label(`course.${r.course}`, r.course)}</span>
      {diet.map((d) => (
        <span key={d}>{label(`diet.${d}`, d)}</span>
      ))}
      {time && (
        <span>
          <Icon name="clock" /> {time}
        </span>
      )}
    </p>
  );
}

/** "Added by …": who uploaded a recipe. Links to everything they added. */
export async function AddedBy({
  by,
  link = true,
}: {
  by: { username: string; name: string; avatar: string | null } | null;
  link?: boolean;
}) {
  if (!by) return null;
  const t = await getT();
  const inner = (
    <>
      <Avatar name={by.name} src={by.avatar} /> {t("common.addedBy", { name: by.name })}
    </>
  );
  return link ? (
    <Link href={`/?by=${encodeURIComponent(by.username)}`} className="added-by">
      {inner}
    </Link>
  ) : (
    <span className="added-by">{inner}</span>
  );
}
