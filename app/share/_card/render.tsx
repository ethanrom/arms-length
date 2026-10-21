import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";
import { SHARE_QUALIFIER, SYNTHETIC_TAG } from "@/lib/integration/copy";
import {
  MAX_SHARE_LINES,
  parseShareLines,
  reliefShareLines,
  shareLineDistanceM,
  shareLineParts,
  shareSafetyFor,
  type ShareLineSpec,
} from "@/lib/integration/shareLines";
import { CARD_SIZES, ShareCardImage, type CardFormat } from "./ShareCardImage";

/** The key a card is asked for under: a demo face, or "live" for a visitor's own photo (which never shows a face). */
export function isCardKey(key: string): boolean {
  return key === "live" || (DEMO_IDS as readonly string[]).includes(key);
}

export function parseFormat(value: string | null): CardFormat {
  return value === "9x16" ? "9x16" : value === "wide" ? "wide" : "4x5";
}

const FALLBACK = "Up close you see every detail. From here, you see a person.";

let fonts: Promise<{ name: string; data: Buffer; weight: 400; style: "normal" | "italic" }[]> | undefined;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "app/share/_fonts/Geist-Regular.ttf")),
    readFile(path.join(process.cwd(), "app/share/_fonts/Newsreader-Regular.ttf")),
    readFile(path.join(process.cwd(), "app/share/_fonts/Newsreader-Italic.ttf")),
  ]).then(([geist, regular, italic]) => [
    { name: "Geist", data: geist, weight: 400 as const, style: "normal" as const },
    { name: "Newsreader", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Newsreader", data: italic, weight: 400 as const, style: "italic" as const },
  ]);
  return fonts;
}

export interface CardRequest {
  key: string;
  format: CardFormat;
  /** `?lines=` tokens; empty means "the best news this face has". */
  lines: string | null;
  /** A demo face on the card, when asked. Ignored for an own photo. */
  face: boolean;
  /** An own photo that is really a replayed synthetic face still says so. */
  synthetic: boolean;
  download?: boolean;
}

export async function renderShareCard(req: CardRequest): Promise<Response> {
  const demo = (DEMO_IDS as readonly string[]).includes(req.key);
  const bundle = demo ? loadBundle(req.key) : null;

  let specs: ShareLineSpec[] = parseShareLines(req.lines);
  if (specs.length === 0 && req.lines === null && bundle) specs = reliefShareLines(bundle.report).slice(0, MAX_SHARE_LINES);

  let face: string | null = null;
  if (demo && req.face && req.format !== "wide") {
    const photo = await readFile(path.join(process.cwd(), "public/demo", req.key, "photo.jpg")).catch(() => null);
    if (photo) face = `data:image/jpeg;base64,${photo.toString("base64")}`;
  }

  const tag = demo || req.synthetic ? SYNTHETIC_TAG : null;
  const size = CARD_SIZES[req.format];
  const response = new ImageResponse(
    (
      <ShareCardImage
        format={req.format}
        lines={specs.map((s) => ({ ...shareLineParts(s), distanceM: shareLineDistanceM(s) }))}
        fallback={FALLBACK}
        face={face}
        tag={tag}
        qualifier={SHARE_QUALIFIER}
        safety={shareSafetyFor(specs)}
      />
    ),
    { ...size, fonts: await loadFonts() },
  );
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=3600");
  if (req.download) headers.set("Content-Disposition", `attachment; filename="arms-length-${req.format}.png"`);
  return new Response(response.body, { status: 200, headers });
}
