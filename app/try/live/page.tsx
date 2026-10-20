import type { Metadata } from "next";
import { LiveSessionView } from "@/components/live/LiveSessionView";

export const metadata: Metadata = {
  title: "Check mine",
  description: "Add a photo and see what others can actually see of your skin, and from how far.",
  robots: { index: false, follow: false },
};

export default function LivePage() {
  return <LiveSessionView />;
}
