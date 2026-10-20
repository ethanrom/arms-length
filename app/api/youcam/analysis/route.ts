import { accessCode, readBody, respond } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, analysisBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// No `runtime` export: cacheComponents requires the Node.js runtime and rejects the config.
// Upload + HD analysis + mask downloads take 10 to 30 s; the poll gives up after about 60 s.
export const maxDuration = 120;

/** Dev replay (YOUCAM_MODE=replay): any uploaded photo is answered with this recorded face, labelled replay. */
const REPLAY_STAND_IN = "p2b";

export async function POST(request: Request) {
  const code = accessCode(request);
  return respond(async () => {
    const body = await readBody(request, analysisBody, MAX_BODY_BYTES.analysis);
    if (process.env.YOUCAM_MODE === "replay" && body.image !== undefined) {
      return getService().analysis({ persona: REPLAY_STAND_IN, engine: body.engine }, code);
    }
    return getService().analysis(body, code);
  });
}
