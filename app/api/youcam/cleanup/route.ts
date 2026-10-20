import { accessCode, readBody, respond } from "@/lib/youcam/http";
import { cleanupBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// Deleting is free but takes about two seconds per task; the tasks are deleted in parallel.
export const maxDuration = 60;

/**
 * POST /api/youcam/cleanup: delete the YouCam tasks (photo, results, renders) a session created. The browser calls it
 * when the visitor leaves; `navigator.sendBeacon` cannot set headers, so the access code may ride in the body instead.
 */
export async function POST(request: Request) {
  const headerCode = accessCode(request);
  return respond(async () => {
    const body = await readBody(request, cleanupBody, 16_000);
    return getService().cleanup(body.taskIds, headerCode ?? body.accessCode ?? null);
  });
}
