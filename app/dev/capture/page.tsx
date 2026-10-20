import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevCapture } from "./DevCapture";

export const metadata: Metadata = {
  title: "Capture (dev)",
  robots: { index: false, follow: false },
};

// A test bench for components/capture. It is not part of the product, so production serves a 404.
export default function DevCapturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevCapture />;
}
