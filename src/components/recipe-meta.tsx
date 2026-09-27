import { formatMinutes, titleCase } from "@/lib/format";

const SEASON_MARK: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  "all-year": "年",
};

/** The only visible tags: cuisine, course, diet, season. Season is a colour + a seal-like mark. */
export function RecipeMeta({
  r,
}: {
  r: { cuisine: string; course: string; diet: string[]; season: string; totalMinutes: number | null };
}) {
  const time = formatMinutes(r.totalMinutes);
  const diet = r.diet.filter((d) => d !== "meat" && d !== "kosher");
  return (
    <p className="meta">
      <span className={`seal season-${r.season}`} title={titleCase(r.season)} aria-label={r.season}>
        {SEASON_MARK[r.season] ?? "年"}
      </span>
      <span>{[titleCase(r.cuisine), r.course, ...diet, time].filter(Boolean).join(" · ")}</span>
    </p>
  );
}
