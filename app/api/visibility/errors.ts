import type { ApiError } from "@/lib/contracts";

/** An error whose message is safe to show to the caller. */
export class VisibilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "VisibilityError";
  }
}

export const NO_STORE = { "Cache-Control": "no-store" };

export function errorResponse(error: unknown): Response {
  if (error instanceof VisibilityError) {
    const body: ApiError = { error: { code: error.code, message: error.message } };
    return Response.json(body, { status: error.status, headers: { ...NO_STORE, ...error.headers } });
  }
  // Never log request content: only the error class.
  console.error(`[visibility] unhandled ${error instanceof Error ? error.name : typeof error}`);
  const body: ApiError = { error: { code: "internal", message: "Something went wrong on our side. Please try again." } };
  return Response.json(body, { status: 500, headers: NO_STORE });
}
