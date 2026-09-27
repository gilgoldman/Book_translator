// A few line icons (24px grid). Decorative: always paired with a text label.
const PATHS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2",
  plus: "M12 5v14M5 12h14",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  steps: "M5 6h14M5 12h10M5 18h7",
  scale: "M12 4v16M6 8h12M6 8l-3 7a3 3 0 0 0 6 0Zm12 0-3 7a3 3 0 0 0 6 0Z",
  source: "M6 3h9l4 4v14H6Zm9 0v4h4M9 12h7M9 16h7",
  text: "M4 19 9 6l5 13M6 14h6M15 19l3-7 3 7M16 17h4",
  leaf: "M5 19c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
  snow: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9",
  bowl: "M3 11h18a9 9 0 0 1-18 0Zm5-4c0-1 1-1 1-2m3 2c0-1 1-1 1-2m3 2c0-1 1-1 1-2",
  pause: "M9 5v14M15 5v14",
  play: "M7 5l12 7-12 7Z",
  stop: "M6 6h12v12H6Z",
  check: "M5 12l5 5 9-10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  edit: "M4 20h4L19 9l-4-4L4 16Zm10-14 4 4",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4Zm4 4h4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`ico ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

export const SEASON_ICON: Record<string, IconName> = {
  spring: "leaf",
  summer: "sun",
  autumn: "leaf",
  winter: "snow",
  "all-year": "bowl",
};
