import Link from "next/link";
import { formatMinutes, titleCase } from "@/lib/format";
import { Avatar } from "./avatar";
import { Icon, SEASON_ICON } from "./icons";

const SEASON_LABEL: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
  "all-year": "All year",
};

/** The visible tags: season (colour + icon + word), cuisine, course, diet, time. */
export function RecipeMeta({
  r,
}: {
  r: { cuisine: string; course: string; diet: string[]; season: string; totalMinutes: number | null };
}) {
  const time = formatMinutes(r.totalMinutes);
  const diet = r.diet.filter((d) => d !== "meat" && d !== "kosher");
  return (
    <p className="tagline">
      <span className={`season season-${r.season}`}>
        <Icon name={SEASON_ICON[r.season] ?? "bowl"} />
        {SEASON_LABEL[r.season] ?? r.season}
      </span>
      <span>{titleCase(r.cuisine)}</span>
      <span>{titleCase(r.course)}</span>
      {diet.map((d) => (
        <span key={d}>{titleCase(d)}</span>
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
export function AddedBy({
  by,
  link = true,
}: {
  by: { username: string; name: string; avatar: string | null } | null;
  link?: boolean;
}) {
  if (!by) return null;
  const inner = (
    <>
      <Avatar name={by.name} src={by.avatar} /> Added by {by.name}
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
