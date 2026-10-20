/**
 * Free read of the remaining YouCam units (GET /s2s/v1.0/client/credit). Prints the number only, never the key.
 *   npx tsx --env-file=.env scripts/dev/credit.ts
 */
import { createYouCamClient } from "../../lib/youcam/client";

async function main() {
  const apiKey = process.env.YOUCAM_API_KEY;
  if (!apiKey) throw new Error("YOUCAM_API_KEY is not set");
  console.log(await createYouCamClient({ apiKey }).credit());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exit(1);
});
