import type { StatusResponse } from "@/lib/contracts";
import { accessCode, respond } from "@/lib/youcam/http";
import { getService } from "@/lib/youcam/service";

export async function GET(request: Request) {
  // Reading request headers is runtime data: with cacheComponents it keeps this GET handler out of
  // prerendering. Do it before any try/catch (respond) so the build-time bail-out is not swallowed.
  const code = accessCode(request);
  // Replay mode answers every analysis from recordings, so live can never run; say that instead of "kill switch".
  if (process.env.YOUCAM_MODE === "replay") {
    const status: StatusResponse = { live: false, reason: "replay_only" };
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  }
  return respond(() => getService().status(code));
}
