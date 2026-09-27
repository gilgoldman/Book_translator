export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest}` : `${h} h`;
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(minutes: number | null): string | null {
  return minutes ? formatDuration(minutes * 60) : null;
}

const RTL = new Set(["he", "ar", "fa", "ur", "yi"]);
export const dirFor = (lang: string) => (RTL.has(lang) ? "rtl" : "ltr");

export function titleCase(s: string) {
  return s.replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}
