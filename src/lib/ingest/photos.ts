/**
 * The sent images the model saw as the finished dish, as cover photos, in the order sent.
 * Indexes that point nowhere or at a non-image are dropped. If every image looked like a dish,
 * none is used: the recipe was read off one of them, so the model got it wrong.
 */
export function dishPhotos(files: { url: string; mediaType: string }[], indexes: number[]): string[] {
  const isImage = (i: number) => files[i]?.mediaType.startsWith("image/") ?? false;
  const picked = [...new Set(indexes)].filter(isImage).sort((a, b) => a - b);
  const images = files.filter((f) => f.mediaType.startsWith("image/")).length;
  if (picked.length === 0 || picked.length === images) return [];
  return picked.map((i) => files[i].url);
}
