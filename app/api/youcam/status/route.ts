import { admit, callerOf, respond, strikeBadCode } from "@/lib/youcam/http";
import { getService } from "@/lib/youcam/service";

export async function GET(request: Request) {
  // Reading request headers is runtime data: with cacheComponents it keeps this GET handler out of
  // prerendering. Do it before any try/catch (respond) so the build-time bail-out is not swallowed.
  const who = callerOf(request);
  return respond(async () => {
    admit(who, "status");
    // Replay mode (no API key, or YOUCAM_MODE=replay) answers { live: false, reason: "replay_only" } without any gate check.
    const status = await getService().status(who.code);
    if (status.reason === "bad_code") strikeBadCode(who);
    return status;
  }, who);
}
