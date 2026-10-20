// Bounded JSON body reading and validation for POST /api/visibility.
import type { VisibilityRequest } from "@/lib/contracts";
import { VisibilityError } from "./errors";
import { describeIssue, HOSTING_LIMIT_MB, MAX_BODY_BYTES, visibilityBody } from "./schema";

const tooBig = () =>
  new VisibilityError(
    "payload_too_large",
    `That request is larger than the ${MAX_BODY_BYTES / 1_000_000} MB this endpoint takes (the hosting platform's own limit is ${HOSTING_LIMIT_MB} MB). ` +
      `Send a smaller photo, or only the masks you need (the ones without a "region", or with region "whole", are enough), ` +
      `or leave out "masks" so they are fetched from the URLs in "output".`,
    413,
  );

/** Reads at most `maxBytes` of the body, refusing early on the declared length and while streaming. */
async function readText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readVisibilityRequest(request: Request): Promise<VisibilityRequest> {
  const text = await readText(request, MAX_BODY_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new VisibilityError("bad_request", 'That request wasn\'t valid JSON. Send a JSON object with "output" and "image".', 400);
  }
  const parsed = visibilityBody.safeParse(json);
  if (!parsed.success) throw new VisibilityError("bad_request", describeIssue(parsed.error), 400);
  return parsed.data;
}
