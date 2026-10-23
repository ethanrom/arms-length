import type { Metadata } from "next";
import { LiveSessionView } from "@/components/live/LiveSessionView";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";

export const metadata: Metadata = {
  title: "Use my photo",
  description: "Add a photo and see what others can actually see of your skin, and from how far.",
  robots: { index: false, follow: false },
};

export default function LivePage() {
  const faces = DEMO_IDS.flatMap((id) => {
    const bundle = loadBundle(id);
    return bundle ? [{ id, label: bundle.label }] : [];
  });
  // Read where the page is built, like the demo faces; /api/rehearse checks it again per request.
  return <LiveSessionView faces={faces} agentEnabled={process.env.AGENT_ENABLED === "1"} />;
}
