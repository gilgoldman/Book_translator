/** Profile picture, or initials on a paper disc. */
export function Avatar({ name, src, size = "" }: { name: string; src?: string | null; size?: "" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return src ? (
    <img src={src} alt="" className={`avatar ${size}`} />
  ) : (
    <span className={`avatar ${size}`} aria-hidden>
      {initials}
    </span>
  );
}
