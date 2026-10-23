import { clientIp } from "@/lib/youcam/ratelimit";
import { handleRehearse } from "./handler";

// No `runtime` export: cacheComponents requires the Node.js runtime and rejects the config.
// A run takes 5 to 20 s; the loop's own budget (50 s) leaves room to deliver the fallback inside this.
export const maxDuration = 60;

export async function POST(request: Request) {
  // Reading request headers is runtime data: do it before anything that could catch, so a build-time bail-out is never swallowed.
  const ip = clientIp(request);
  return handleRehearse(request, ip);
}
