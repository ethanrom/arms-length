import { admit, callerOf, readBody, respond } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, simulateBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// A simulation render finishes in under 10 s; the client gives up polling after about 60 s.
export const maxDuration = 90;

export async function POST(request: Request) {
  const who = callerOf(request);
  return respond(async () => {
    admit(who, "render");
    return getService().simulate(await readBody(request, simulateBody, MAX_BODY_BYTES.render), who);
  }, who);
}
