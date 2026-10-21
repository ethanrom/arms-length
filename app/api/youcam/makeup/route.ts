import { admit, callerOf, readBody, respond } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, makeupBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// A VTO render finishes in under 10 s; the client gives up polling after about 60 s.
export const maxDuration = 90;

export async function POST(request: Request) {
  const who = callerOf(request);
  return respond(async () => {
    admit(who, "render");
    return getService().makeup(await readBody(request, makeupBody, MAX_BODY_BYTES.render), who.code);
  }, who);
}
