// HTTP plumbing shared by the four route handlers: bounded JSON bodies, validation, ApiError responses.
// Never logs request bodies, image data or keys.
import { ACCESS_HEADER } from "@/lib/contracts";
import type { ApiError } from "@/lib/contracts";
import type { z } from "zod";
import { YouCamError } from "./errors";

const NO_STORE = { "Cache-Control": "no-store" };

export function accessCode(request: Request): string | null {
  const value = request.headers.get(ACCESS_HEADER)?.trim();
  return value && value.length <= 200 ? value : null;
}

/** Reads and validates a JSON body, refusing anything over `maxBytes` before it is parsed. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S, maxBytes: number): Promise<z.output<S>> {
  const tooBig = () => new YouCamError("payload_too_large", "That upload is too large. Please use a photo under 10 MB.", 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig();

  const text = await request.text();
  if (text.length > maxBytes) throw tooBig();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new YouCamError("bad_request", "That request wasn't in the expected format.", 400);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new YouCamError("bad_request", "That request wasn't in the expected format.", 400);
  return parsed.data;
}

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/** Runs a handler and turns anything thrown into an ApiError response with a plain-language message. */
export async function respond<T>(run: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await run(), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof YouCamError) {
      // Only our own code and the sanitised upstream detail are logged.
      if (error.status >= 500) console.error(`[youcam] ${error.code} ${error.detail ?? ""}`.trim());
      return Response.json(errorBody(error.code, error.message), { status: error.status, headers: NO_STORE });
    }
    console.error(`[youcam] unhandled ${error instanceof Error ? error.name : typeof error}`);
    return Response.json(errorBody("internal", "Something went wrong on our side. Please try again."), {
      status: 500,
      headers: NO_STORE,
    });
  }
}
