import { DEMO_IDS } from "@/lib/integration/demo";
import { CARD_SIZES } from "../_card/ShareCardImage";
import { renderShareCard } from "../_card/render";

export const alt = "From where others stand: the parts of a face that are out of sight at a distance";
export const size = CARD_SIZES.wide;
export const contentType = "image/png";

export function generateStaticParams() {
  return DEMO_IDS.map((persona) => ({ persona }));
}

/** The link preview for a shared reading: the face-less relief card, in the landscape size link previews use. */
export default async function Image({ params }: { params: Promise<{ persona: string }> }) {
  const { persona } = await params;
  return renderShareCard({ key: persona, format: "wide", lines: null, face: false, synthetic: false });
}
