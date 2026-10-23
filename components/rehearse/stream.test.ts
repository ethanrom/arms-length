import { describe, expect, it } from "vitest";
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

  it("skips blank, unreadable and unknown lines, and keeps the moment a step names", () => {
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("{not json")).toBeNull();
    expect(parseEventLine('{"type":"other"}')).toBeNull();
    const step = '{"type":"step","tool":"observe_scene","label":"x","moment":{"title":"Lunch","scene":"dinner_table"}}';
    expect(parseEventLine(step)).toEqual({ type: "step", tool: "observe_scene", label: "x", moment: { title: "Lunch", scene: "dinner_table" } });
  });
});
