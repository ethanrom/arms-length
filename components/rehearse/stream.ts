import type { RehearseEvent, RehearseRequest } from "@/lib/contracts/rehearse";

const EVENT_TYPES = new Set(["step", "plan", "error"]);

/** One NDJSON line to an event, or null for blank or unreadable lines (a half-written line must not end the run). */
export function parseEventLine(line: string): RehearseEvent | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && EVENT_TYPES.has((value as { type?: string }).type ?? "")) return value as RehearseEvent;
  } catch {
    // not JSON: skip it
  }
  return null;
}

/**
 * Splits a byte stream into NDJSON lines. A line can arrive in several chunks (even inside a multi-byte character), so the
 * decoder streams and the unfinished tail waits for the next chunk. The last line needs no trailing newline.
 */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let tail = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tail += decoder.decode(value, { stream: true });
      const lines = tail.split("\n");
      tail = lines.pop() ?? "";
      yield* lines;
    }
    tail += decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export type ErrorEvent = Extract<RehearseEvent, { type: "error" }>;
/** How a run ends: with the plan, or with an error (the stream's own, or one made here when the connection fails). */
export type Terminal = ErrorEvent | Extract<RehearseEvent, { type: "plan" }>;

const failure = (code: ErrorEvent["code"]): ErrorEvent => ({ type: "error", code, message: "" });

/**
 * POSTs the request and calls `onEvent` for each event as it arrives. Resolves with the terminal event (plan or error):
 * a dropped connection, a non-stream reply or a stream that stops early comes back as an error event too, never a throw.
 * An abort is the one exception: the caller asked for it and wants nothing back.
 */
export async function streamRehearse(request: RehearseRequest, onEvent: (event: RehearseEvent) => void, signal?: AbortSignal): Promise<Terminal> {
  // An object, so TypeScript doesn't narrow the field to null across the closure below.
  const seen: { end: Terminal | null } = { end: null };
  const take = (line: string) => {
    const event = parseEventLine(line);
    if (!event) return;
    onEvent(event);
    if (event.type !== "step") seen.end = event;
  };

  let status = 0;
  try {
    const res = await fetch("/api/rehearse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    status = res.status;
    if (res.body) for await (const line of readLines(res.body)) take(line);
    else for (const line of (await res.text()).split("\n")) take(line);
  } catch (err) {
    if (signal?.aborted) throw err;
    return seen.end ?? failure("upstream");
  }
  return seen.end ?? failure(status === 429 ? "rate_limited" : status === 404 || status === 501 ? "disabled" : "upstream");
}
