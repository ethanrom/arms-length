// Shared by the Vitest files in this folder. Not imported by app code.

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export type FakeHandler = (call: RecordedCall) => Response | Promise<Response>;

/** A fake fetch that records every call. Header names are lower-cased; JSON bodies are parsed. */
export function fakeFetch(handler: FakeHandler) {
  const calls: RecordedCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // leave as text
      }
    }
    const call = { method: init?.method ?? "GET", url: String(input), headers, body };
    calls.push(call);
    return handler(call);
  };
  return { fetch: impl as typeof fetch, calls };
}

/** JSON response from raw text, so tests can include long float literals exactly as the API sends them. */
export const jsonText = (text: string, status = 200) =>
  new Response(text, { status, headers: { "content-type": "application/json" } });

export const json = (value: unknown, status = 200) => jsonText(JSON.stringify(value), status);

/** The first 33 bytes of a PNG: enough for the header sniffer, which reads only the signature and IHDR. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

export const pngDataUrl = (width: number, height: number) =>
  `data:image/png;base64,${Buffer.from(pngHeader(width, height)).toString("base64")}`;

export const noSleep = async () => undefined;

export const FILE_ID = "F".repeat(64);
export const TASK_ID = "T".repeat(90);
