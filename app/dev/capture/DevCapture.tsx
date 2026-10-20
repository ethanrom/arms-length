"use client";

import { useState } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import type { CaptureResult } from "@/lib/capture/types";

export function DevCapture() {
  const [result, setResult] = useState<CaptureResult | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Capture test bench</h1>
        <p className="text-sm text-zinc-600">
          Dev only. Try the camera or an upload; &quot;Use this photo&quot; shows what the app would receive.
        </p>
      </header>

      <CaptureFlow onCapture={setResult} />

      {result && (
        <section aria-labelledby="result-heading" className="flex flex-col gap-4" data-testid="capture-result">
          <h2 id="result-heading" className="text-xl font-semibold">
            Result
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in this tab */}
            <img src={result.image} alt="Captured and resized frame" className="w-full rounded-md border border-zinc-300" />
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <Row k="Engine" v={result.engine} />
              <Row k="Image size" v={`${result.size.width} × ${result.size.height} px`} />
              <Row k="Scale source" v={result.scale.source} />
              <Row k="Iris (output px)" v={result.scale.irisPx?.toFixed(2) ?? "n/a"} />
              <Row k="mm per px" v={result.scale.mmPerPx.toFixed(5)} />
              <Row k="relSd" v={`${(result.scale.relSd * 100).toFixed(2)}%`} />
              <Row k="Face width / frame" v={`${(result.quality.faceWidthFraction * 100).toFixed(0)}%`} />
              <Row k="Yaw / pitch" v={`${result.quality.yawDeg?.toFixed(1)}° / ${result.quality.pitchDeg?.toFixed(1)}°`} />
              <Row k="Eye openness" v={result.quality.eyeOpenness?.toFixed(3) ?? "n/a"} />
              <Row k="Mean luma / clipped" v={`${result.quality.meanLuma.toFixed(0)} / ${(result.quality.clippedFraction * 100).toFixed(1)}%`} />
              <Row
                k="Checks"
                v={result.quality.checks.map((c) => `${c.id}:${c.ok ? "ok" : "FAIL"}`).join("  ")}
              />
              <Row k="Data URL bytes" v={`${Math.round(result.image.length * 0.75 / 1024)} KB`} />
            </dl>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">Full quality object</summary>
            <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs">
              {JSON.stringify({ scale: result.scale, quality: result.quality }, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-medium">{k}</dt>
      <dd className="break-all font-mono">{v}</dd>
    </>
  );
}
