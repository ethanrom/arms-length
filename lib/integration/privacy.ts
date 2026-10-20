/**
 * What we tell people about their photo. Each clause is true as built:
 *  - the data path is lib/copy's DISCLAIMERS.privacy (browser -> our server -> YouCam);
 *  - "deleted from YouCam when you leave this page": the live session collects the YouCam tasks it creates and the
 *    browser asks for them to be deleted on pagehide (lib/integration/live.ts -> POST /api/youcam/cleanup, which calls
 *    POST /s2s/v2.0/task/delete; verified 2026-10-20 and again in the first live session);
 *  - "We don't store your photo": nothing here writes it anywhere.
 * Two limits are stated in SIMULATION_RETENTION_NOTE: a Skin Simulation task answers delete with 400 OperationInvalid,
 * so its output stays under YouCam's own retention, and a page closed without the clean-up call getting through leaves
 * everything to that retention too (YouCam: results 24 hours, files at most 30 days).
 */
import { DISCLAIMERS } from "@/lib/copy/disclaimers";

export const PRIVACY_LINE = `${DISCLAIMERS.privacy} It is deleted from YouCam when you leave this page. We don't store your photo.`;

export const SIMULATION_RETENTION_NOTE =
  "One exception: YouCam can't delete the improved-face picture from Skin Simulation early, so it keeps that one for up to 24 hours under its own policy.";
