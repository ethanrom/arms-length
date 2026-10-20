// Dependency-free PNG/JPEG sniffing and data-URL helpers (no sharp: it is a devDependency).
// Magic bytes decide the type, never the file extension: the VTO "jpg" is really a PNG with alpha.
import type { Size2 } from "@/lib/contracts";

export type ImageMime = "image/png" | "image/jpeg";

export interface ImageInfo extends Size2 {
  mime: ImageMime;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Size of a PNG (IHDR) or JPEG (first SOF marker) from its header, or null if it is neither. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { mime: "image/png", width, height } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return sniffJpeg(bytes);
  return null;
}

function sniffJpeg(bytes: Uint8Array): ImageInfo | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Stand-alone markers carry no length: TEM, RSTn, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { mime: "image/jpeg", width, height } : null;
    }
    if (marker === 0xda) return null; // start of scan without a frame header
    i += 2 + length;
  }
  return null;
}

export function toDataUrl(bytes: Uint8Array, mime: ImageMime): string {
  return `data:${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`;
}

/** Decoded bytes of a `data:image/(jpeg|png);base64,...` URL, or null if it is not one. */
export function decodeImageDataUrl(value: string): Uint8Array | null {
  const comma = value.indexOf(",");
  if (comma < 0 || !/^data:image\/(jpeg|jpg|png);base64$/i.test(value.slice(0, comma))) return null;
  const buf = Buffer.from(value.slice(comma + 1), "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
