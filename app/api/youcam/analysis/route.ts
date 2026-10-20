import { accessCode, readBody, respond } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, analysisBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

// No `runtime` export: cacheComponents requires the Node.js runtime and rejects the config.
// Upload + HD analysis + mask downloads take 10 to 30 s; the poll gives up after about 60 s.
export const maxDuration = 120;

export async function POST(request: Request) {
  const code = accessCode(request);
  return respond(async () => getService().analysis(await readBody(request, analysisBody, MAX_BODY_BYTES.analysis), code));
}
