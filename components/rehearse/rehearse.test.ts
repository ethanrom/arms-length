import { describe, expect, it } from "vitest";
import type { ObserveResult, PlannedMoment } from "@/lib/contracts/rehearse";
import { distanceRange, editedScene, editedSentences, percentOf, sameEdit, startingEdit } from "./edit";
import { parseEventLine, readLines } from "./stream";

function bodyOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of readLines(stream)) out.push(line);
  return out;
}

describe("NDJSON stream", () => {
  it("rebuilds lines split at any byte, including inside a multi-byte character", async () => {
    const text = '{"type":"step","label":"model’s results"}\n{"type":"error","code":"timeout","message":"é"}\n';
    const bytes = new TextEncoder().encode(text);
    for (let size = 1; size <= 9; size++) {
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < bytes.length; at += size) chunks.push(bytes.slice(at, at + size));
      expect(await collect(bodyOf(chunks))).toEqual(text.trimEnd().split("\n"));
    }
  });

  it("returns a last line that has no newline", async () => {
    expect(await collect(bodyOf([new TextEncoder().encode('{"a":1}\n{"b":2}')]))).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("skips blank, unreadable and unknown lines", () => {
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("{not json")).toBeNull();
    expect(parseEventLine('{"type":"other"}')).toBeNull();
    expect(parseEventLine('{"type":"step","tool":"observe_scene","label":"x"}')).toEqual({ type: "step", tool: "observe_scene", label: "x" });
  });
});

const base: ObserveResult = {
  ref: "o",
  quotes: {},
  assumptions: [],
  input: { scene: "dinner_table", light: "overcast", viewer: "typical" },
  distanceM: 1.5,
  luminanceCdM2: 300,
  acuityScale: 1,
  concerns: [
    { concern: "age_spot", targetCount: 64, typicalShare: 0.45, typicalCount: 29, boundShare: 0.7, boundCount: 45, soft: false },
    { concern: "pore", targetCount: 450, typicalShare: 0, typicalCount: 0, boundShare: 0.04, boundCount: 18, soft: false, belowCameraCount: 30 },
    { concern: "redness", targetCount: 5, typicalShare: 1, typicalCount: 5, boundShare: 1, boundCount: 5, soft: true },
    { concern: "eye_bag", targetCount: 2, typicalShare: 0, typicalCount: 0, boundShare: 0, boundCount: 0, soft: true },
  ],
};

describe("edited moments", () => {
  it("words the model's numbers with templates, typical viewer first and the sharpest eyes as a footnote", () => {
    const { notice, outOfSight } = editedSentences(base);
    expect(notice).toEqual(["Redness: a larger, soft area that a typical viewer can see.", "Dark spots: about 45% (29 of 64) could be picked out by a typical viewer."]);
    expect(outOfSight).toEqual([
      "Pores: out of sight for a typical viewer. The sharpest eyes could still pick out about 4%. 30 of 450 are finer than the call can carry.",
      "Under-eye puffiness: out of sight for a typical viewer.",
    ]);
  });

  it("never rounds a small share down to nothing", () => {
    expect(percentOf(0.003)).toBe("under 1%");
    expect(percentOf(0)).toBe("0%");
    expect(percentOf(0.454)).toBe("45%");
  });

  it("builds the tool input inside the scene's range, and leaves the distance out of a video call", () => {
    const lunch: PlannedMoment = { id: "m", time: null, title: "t", scene: base.input, observeRef: "o", assumptions: [], notice: [], outOfSight: [], action: { kind: "none", claim: { text: "", refs: [] } } };
    expect(distanceRange("dinner_table")).toEqual([1.2, 2.1]);
    expect(editedScene(lunch, { light: "daylight", viewer: "blurry", distanceM: 9 })).toEqual({ scene: "dinner_table", light: "daylight", viewer: "blurry", distanceM: 2.1 });

    const call = { device: "laptop", cameraDistanceCm: 55, layout: "speaker" } as const;
    const video: PlannedMoment = { ...lunch, scene: { scene: "video_call", light: "videoCall", viewer: "typical", call } };
    const input = editedScene(video, { light: "videoCall", viewer: "blurry", distanceM: 1.9 });
    expect(input).toEqual({ scene: "video_call", light: "videoCall", viewer: "blurry", call });
    expect("distanceM" in input).toBe(false);
  });

  it("knows when an edit is back at the plan's own scene", () => {
    const start = startingEdit(base);
    expect(start).toEqual({ light: "overcast", viewer: "typical", distanceM: 1.5 });
    expect(sameEdit(start, { ...start })).toBe(true);
    expect(sameEdit(start, { ...start, viewer: "blurry" })).toBe(false);
  });
});
