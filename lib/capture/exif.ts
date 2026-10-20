/**
 * EXIF orientation for uploaded JPEGs. Phone photos are often stored sideways with an orientation tag.
 * Modern browsers apply the tag when decoding, older ones do not, and landmarks, crops and YouCam masks must all
 * agree on the upright pixels. So we read the tag ourselves and only rotate if the decoded bitmap is still raw.
 */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface JpegInfo {
  orientation: ExifOrientation;
  /** Stored (unrotated) size from the SOF marker, when found. */
  width?: number;
  height?: number;
}

const TAG_ORIENTATION = 0x0112;

function readOrientation(v: DataView, tiffStart: number, end: number): ExifOrientation | null {
  if (tiffStart + 8 > end) return null;
  const little = v.getUint16(tiffStart) === 0x4949;
  if (!little && v.getUint16(tiffStart) !== 0x4d4d) return null;
  if (v.getUint16(tiffStart + 2, little) !== 0x002a) return null;
  const ifd = tiffStart + v.getUint32(tiffStart + 4, little);
  if (ifd + 2 > end) return null;
  const count = v.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (v.getUint16(entry, little) === TAG_ORIENTATION) {
      const value = v.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? (value as ExifOrientation) : null;
    }
  }
  return null;
}

/** Parse the EXIF orientation and stored size of a JPEG. Anything unreadable gives orientation 1. */
export function readJpegInfo(bytes: ArrayBuffer | Uint8Array): JpegInfo {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const info: JpegInfo = { orientation: 1 };
  if (u8.length < 4 || v.getUint16(0) !== 0xffd8) return info;

  let pos = 2;
  let haveOrientation = false;
  let haveSize = false;
  while (pos + 4 <= u8.length && !(haveOrientation && haveSize)) {
    if (u8[pos] !== 0xff) break;
    const marker = u8[pos + 1];
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2; // standalone markers
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image, start of scan
    const length = v.getUint16(pos + 2);
    const body = pos + 4;
    const end = Math.min(pos + 2 + length, u8.length);

    if (marker === 0xe1 && !haveOrientation && end - body >= 6) {
      const isExif = v.getUint32(body) === 0x45786966 && v.getUint16(body + 4) === 0; // "Exif\0\0"
      if (isExif) {
        const o = readOrientation(v, body + 6, end);
        if (o) info.orientation = o;
        haveOrientation = true;
      }
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && end - body >= 5) {
      info.height = v.getUint16(body + 1);
      info.width = v.getUint16(body + 3);
      haveSize = true;
    }
    pos += 2 + length;
  }
  return info;
}

/**
 * Which orientation still has to be applied to a bitmap the browser has already decoded.
 * Orientations 5 to 8 swap width and height, so a decoded size that matches the stored size means the browser
 * left the pixels raw. For 2 to 4 the size does not change and we trust the browser (all current ones apply it).
 */
export function orientationToApply(
  info: JpegInfo,
  decoded: { width: number; height: number },
): ExifOrientation {
  if (info.orientation < 5) return 1;
  if (!info.width || !info.height || info.width === info.height) return 1;
  const stillRaw = decoded.width === info.width && decoded.height === info.height;
  return stillRaw ? info.orientation : 1;
}

export interface OrientedDraw {
  /** Arguments for CanvasRenderingContext2D.setTransform(a, b, c, d, e, f). */
  matrix: [number, number, number, number, number, number];
  /** Canvas size after orientation. */
  width: number;
  height: number;
}

/** Canvas transform that draws a raw w x h bitmap upright for the given EXIF orientation. */
export function orientedDraw(orientation: ExifOrientation, w: number, h: number): OrientedDraw {
  switch (orientation) {
    case 2:
      return { matrix: [-1, 0, 0, 1, w, 0], width: w, height: h };
    case 3:
      return { matrix: [-1, 0, 0, -1, w, h], width: w, height: h };
    case 4:
      return { matrix: [1, 0, 0, -1, 0, h], width: w, height: h };
    case 5:
      return { matrix: [0, 1, 1, 0, 0, 0], width: h, height: w };
    case 6:
      return { matrix: [0, 1, -1, 0, h, 0], width: h, height: w };
    case 7:
      return { matrix: [0, -1, -1, 0, h, w], width: h, height: w };
    case 8:
      return { matrix: [0, -1, 1, 0, 0, w], width: h, height: w };
    default:
      return { matrix: [1, 0, 0, 1, 0, 0], width: w, height: h };
  }
}
