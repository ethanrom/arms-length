"use client";

import { useEffect, useRef, useState } from "react";
import type { ShareData } from "@/components/results/types";
import { ShareCard } from "./ShareCard";

interface ShareCardPreviewProps {
  data: ShareData;
  imageSrc: string;
  imagePosition?: string;
  /** Plain-text version for the clipboard; falls back to the lines of the card. */
  text?: string;
}

/** Fits the 1200 x 630 card to its container and offers a text copy. Image download arrives with the OG route. */
export function ShareCardPreview({ data, imageSrc, imagePosition, text }: ShareCardPreviewProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const summary =
    text ??
    [data.title, ...data.lines.map((l) => `${l.label}: ${l.sentence}`), data.footnote].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div ref={box} className="w-full border border-rule" style={{ height: (width * 630) / 1200 }}>
        <div role="img" aria-label={`Share card. ${summary.replace(/\n/g, " ")}`}>
          <ShareCard data={data} imageSrc={imageSrc} imagePosition={imagePosition} width={width} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={copy} className="btn btn-primary btn-sm">
          Copy as text
        </button>
        <p role="status" className="text-[0.875rem] text-muted">
          {copied ? "Copied." : "Image download arrives with the share route."}
        </p>
      </div>
    </div>
  );
}
