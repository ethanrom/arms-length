import { accessCode, readBody, respond } from "@/lib/youcam/http";
import { MAX_BODY_BYTES, simulateBody } from "@/lib/youcam/schemas";
import { getService } from "@/lib/youcam/service";

export const maxDuration = 120;

export async function POST(request: Request) {
  const code = accessCode(request);
  return respond(async () => getService().simulate(await readBody(request, simulateBody, MAX_BODY_BYTES.render), code));
}
