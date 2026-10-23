const held = new Map<string, HTMLImageElement>();

/** Decodes a photo ahead of time and keeps it, so showing it (the held mirror) is instant. */
export function preloadImage(src: string): void {
  if (typeof Image === "undefined" || held.has(src)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  held.set(src, img);
  img.decode().catch(() => held.delete(src));
}
