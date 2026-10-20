import { readVisibilityRequest } from "./body";
import { errorResponse, NO_STORE } from "./errors";
import { checkRateLimit, clientIp, RATE_LIMIT, withSlot } from "./guard";
import { runVisibility } from "./pipeline";
import { HOSTING_LIMIT_MB, MAX_BODY_BYTES } from "./schema";

// No `runtime` export: cacheComponents requires the Node.js runtime and rejects the config.
// Decoding up to 17 masks and running the model takes a few seconds; the rest is headroom for mask downloads.
export const maxDuration = 60;

/** A static self-description: with cacheComponents this GET is prerendered at build time. */
export function GET() {
  return Response.json({
    name: "Arm's Length visibility layer",
    purpose:
      "Send a YouCam Skin Analysis result and the photo it came from; get back, for each concern, the distance beyond which " +
      "an ideal 20/20 observer can no longer see it. Distances are in metres. No YouCam calls are made and no units are spent.",
    request: {
      method: "POST",
      contentType: "application/json",
      fields: {
        output: "required. The `data.results.output` array of a finished Skin Analysis task (HD or SD, format=json), as returned.",
        image: "required. The analysed photo as a JPEG or PNG data URL.",
        masks:
          "optional. Mask PNG data URLs keyed by the mask URL in `output`. Without it, mask URLs on YouCam's result storage " +
          "(https, amazonaws.com S3) are fetched; they expire after 2 hours. Only masks without a region, or with region 'whole', are needed.",
        viewing: "optional. luminanceCdM2, acuityScale, label, marginDb. Default: indoor, 45 cd/m2, 20/20, 6 dB margin.",
        scale:
          "optional. { mmPerPx, relSd, source } for the analysed frame, if you measured it (iris, card). Otherwise it is " +
          "estimated from the masks and every concern is reported at low confidence.",
      },
    },
    response:
      "VisibilityReport: { viewing, concerns[] (maxDistanceM, medianDistanceM, intervalM, confidence), targets[] }. " +
      "Headers x-scale-source, x-scale-mm-per-px, x-scale-rel-sd and x-scale-method say which scale was used.",
    limits: {
      maxBodyBytes: MAX_BODY_BYTES,
      hostingLimitMb: HOSTING_LIMIT_MB,
      rateLimit: `${RATE_LIMIT.max} requests per ${RATE_LIMIT.windowMs / 60_000} minutes per address`,
    },
    unitsSpent: 0,
    docs: "docs/YOUCAM.md",
  });
}

export async function POST(request: Request) {
  // Reading request headers is runtime data: do it before the try/catch so a build-time bail-out is never swallowed.
  const ip = clientIp(request);
  try {
    checkRateLimit(ip);
    return await withSlot(async () => {
      const { report, scale, scaleMethod } = await runVisibility(await readVisibilityRequest(request));
      return Response.json(report, {
        headers: {
          ...NO_STORE,
          "x-scale-source": scale.source,
          "x-scale-method": scaleMethod,
          "x-scale-mm-per-px": scale.mmPerPx.toFixed(5),
          "x-scale-rel-sd": scale.relSd.toFixed(4),
        },
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
