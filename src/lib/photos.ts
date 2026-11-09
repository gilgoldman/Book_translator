// Recipe and note photos: which one is the cover, and what the hero carousel shows.
// Pure functions, shared by server and browser.

/** Photos one note can carry. With in-browser downscaling they fit one 4 MB request. */
export const MAX_NOTE_PHOTOS = 6;
/** Server Actions accept 4 MB (next.config.ts); leave room for the text and form overhead. */
export const MAX_UPLOAD_BYTES = 3_800_000;

/** The hero carousel: the recipe's photos (cover first), then photos from notes, oldest first. */
export function heroPhotos(recipePhotos: string[], notes: { photos: string[] }[]): string[] {
  return [...new Set([...recipePhotos, ...notes.flatMap((n) => n.photos)])];
}

/**
 * Make `cover` the book cover. It may come from a note, so it joins the recipe's photos.
 * Anything not in `allowed` is ignored: the form can't point the cover at an arbitrary URL.
 */
export function withCover(photos: string[], cover: string | null, allowed: string[]): string[] {
  if (!cover || cover === photos[0] || !allowed.includes(cover)) return photos;
  return [cover, ...photos.filter((p) => p !== cover)];
}
