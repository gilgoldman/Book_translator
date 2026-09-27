// When is a fresh import "the same recipe"? Embedding similarity catches rephrasings and
// translations; ingredient overlap (Jaccard on canonical ingredients) guards against two
// different dishes that merely sound alike ("lemon chicken" vs "lemon tart").

export const DUPLICATE_RULES = {
  nearlyIdentical: 0.93, // similarity alone is enough
  similar: 0.85, // …with at least this ingredient overlap
  similarOverlap: 0.6,
  sameTitleOverlap: 0.4, // same title needs only moderate overlap
};

export function isLikelyDuplicate(m: { similarity: number; overlap: number; sameTitle: boolean }): boolean {
  const r = DUPLICATE_RULES;
  if (m.similarity >= r.nearlyIdentical) return true;
  if (m.similarity >= r.similar && m.overlap >= r.similarOverlap) return true;
  if (m.sameTitle && m.overlap >= r.sameTitleOverlap) return true;
  return false;
}

/** What changed between two ingredient lists, for the "looks familiar" prompt. */
export function ingredientDiff(original: string[], fresh: string[]) {
  const a = new Set(original.map((s) => s.toLowerCase()));
  const b = new Set(fresh.map((s) => s.toLowerCase()));
  return {
    added: [...b].filter((x) => !a.has(x)),
    removed: [...a].filter((x) => !b.has(x)),
  };
}
