import { admit, assertCodeNotLocked, callerOf, cleanYoucamKey, readBody, respond, strikeBadCode } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, cleanupBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// Deleting is free but takes about two seconds per task; the tasks are deleted in parallel.
export const maxDuration = 60;

/**
 * POST /api/youcam/cleanup: delete the YouCam tasks (photo, results, renders) a session created. The browser calls it
 * when the visitor leaves; `navigator.sendBeacon` cannot set headers, so the own key or access code may ride in the body instead.
 */
export async function POST(request: Request) {
  const who = callerOf(request);
  return respond(async () => {
    admit(who, "cleanup");
    const body = await readBody(request, cleanupBody, MAX_BODY_BYTES.cleanup);
    // Same order as the headers: an own key wins, and a code sent along with it is ignored.
    const apiKey = who.apiKey ?? cleanYoucamKey(body.youcamKey);
    const caller = { ...who, apiKey, code: apiKey ? null : (who.code ?? body.accessCode ?? null) };
    assertCodeNotLocked(caller);
    const service = getService();
    // The answer differs for a right and a wrong code, so wrong guesses here count like anywhere else.
    if (caller.code && !service.acceptsCode(caller.code)) strikeBadCode(caller);
    return service.cleanup(body.taskIds, caller);
  }, who);
}
