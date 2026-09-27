import type { Translator } from "@/lib/i18n/translate";

export function formatDuration(seconds: number, t: Translator): string {
  if (seconds < 60) return t("time.s", { n: seconds });
  const m = Math.round(seconds / 60);
  if (m < 60) return t("time.min", { n: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? t("time.hMin", { h, m: rest }) : t("time.h", { n: h });
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(minutes: number | null, t: Translator): string | null {
  return minutes ? formatDuration(minutes * 60, t) : null;
}

export function titleCase(s: string) {
  return s.replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}
