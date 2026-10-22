import { admit, callerOf, readBody, respond } from "@/lib/youcam/http";
import { byokAllowed, replayUploadsEnabled, youcamMode } from "@/lib/youcam/mode";
import { MAX_BODY_BYTES, analysisBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// No `runtime` export: cacheComponents requires the Node.js runtime and rejects the config.
// Upload + HD analysis + mask downloads take 10 to 30 s; the poll gives up after about 60 s. 120 s fits Hobby and Pro
// with Fluid compute (300 s default and maximum on Hobby); without Fluid, Hobby caps at 60 s (docs/DEPLOY.md).
export const maxDuration = 120;

/**
 * Dev and e2e only (REPLAY_UPLOADS=1, replay mode): an uploaded photo is answered with this recorded face, labelled
 * replay. REPLAY_STAND_IN picks another recorded face (video rehearsals of the upload flow on the same face).
 */
const standIn = () => process.env.REPLAY_STAND_IN || "p2b";

export async function POST(request: Request) {
  const who = callerOf(request);
  return respond(async () => {
    admit(who, "analysis");
    const body = await readBody(request, analysisBody, MAX_BODY_BYTES.analysis);
    // Without the flag, an upload in replay mode reaches the service, which refuses it ("reserved" for keys and codes).
    // A caller's own key is a live upload, not a stand-in, wherever own keys are accepted.
    const ownKey = who.apiKey !== null && byokAllowed(process.env);
    if (body.image !== undefined && !ownKey && youcamMode(process.env) === "replay" && replayUploadsEnabled(process.env)) {
      return getService().analysis({ persona: standIn(), engine: body.engine }, who);
    }
    return getService().analysis(body, who);
  }, who);
}
