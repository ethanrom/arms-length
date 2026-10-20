import { accessCode, respond } from "@/lib/youcam/http";
import { getService } from "@/lib/youcam/service";

export async function GET(request: Request) {
  // Reading request headers is runtime data: with cacheComponents it keeps this GET handler out of
  // prerendering. Do it before any try/catch (respond) so the build-time bail-out is not swallowed.
  const code = accessCode(request);
  return respond(() => getService().status(code));
}
