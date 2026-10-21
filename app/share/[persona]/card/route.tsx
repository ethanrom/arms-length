import type { NextRequest } from "next/server";
import { isCardKey, parseFormat, renderShareCard } from "../../_card/render";

/**
 * A share card as a PNG: /share/p2b/card?format=4x5|9x16&lines=pore.mostly.room,... Everything on the card comes from
 * a closed vocabulary (lib/integration/shareLines.ts), so nothing is stored and nobody can put their own words on it.
 * "live" is a visitor's own photo: its card never carries a face.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/share/[persona]/card">) {
  const { persona } = await ctx.params;
  if (!isCardKey(persona)) return new Response("Not found", { status: 404 });
  const q = request.nextUrl.searchParams;
  return renderShareCard({
    key: persona,
    format: parseFormat(q.get("format")),
    lines: q.get("lines"),
    face: q.get("face") === "1",
    synthetic: q.get("synthetic") === "1",
    download: q.get("download") === "1",
  });
}
