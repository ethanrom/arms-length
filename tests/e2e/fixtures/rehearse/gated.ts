import type { Page } from "@playwright/test";

/**
 * Serves `body` (NDJSON) for POST /api/rehearse as a stream that pauses: it sends the first `cuts[0]` lines plus a piece of the
 * next one, waits for `next()`, sends up to `cuts[1]` lines, and so on, then the rest. Chunks are 61 bytes, so lines (and the
 * multi-byte characters in them) are split at awkward places. A stand-in for `fetch` rather than page.route, because
 * route.fulfill sends the whole body at once.
 */
export async function gatedRehearse(page: Page, body: string, cuts: number[]): Promise<{ next: () => Promise<void> }> {
  await page.addInitScript(
    ({ text, lines }) => {
      const real = window.fetch.bind(window);
      const w = window as unknown as { __next: () => void };
      const gates: (() => void)[] = [];
      w.__next = () => gates.shift()?.();
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.endsWith("/api/rehearse")) return real(input, init);
        const bytes = new TextEncoder().encode(text);
        const lineEnd = (n: number) => {
          let at = -1;
          for (let i = 0; i < n; i++) at = bytes.indexOf(10, at + 1);
          return at + 1;
        };
        const edges = [...lines.map((n) => lineEnd(n) + 12), bytes.length];
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let from = 0;
            for (let b = 0; b < edges.length; b++) {
              if (b > 0) await new Promise<void>((resolve) => gates.push(resolve));
              const to = Math.min(edges[b], bytes.length);
              for (let at = from; at < to; at += 61) controller.enqueue(bytes.slice(at, Math.min(at + 61, to)));
              from = to;
            }
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
      };
    },
    { text: body, lines: cuts },
  );
  return { next: () => page.evaluate(() => (window as unknown as { __next: () => void }).__next()) };
}
