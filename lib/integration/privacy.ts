/**
 * What we tell people about their photo. Each clause is true as built (internal/DECISIONS.md, "task delete verified"):
 *  - the data path: the photo goes from the browser to our server and on to YouCam Skin Analysis;
 *  - "We ask YouCam to delete ... when you leave this page": the live session collects the YouCam tasks it creates and the
 *    browser asks for them to be deleted on pagehide (lib/integration/live.ts -> POST /api/youcam/cleanup, which calls
 *    POST /s2s/v2.0/task/delete; verified to return 200 and leave the task and its result URL gone). It is best effort;
 *  - "We don't store your photo": nothing here writes it anywhere;
 *  - the exception: a Skin Simulation task answers delete with 400 OperationInvalid, so YouCam keeps that picture under its
 *    own retention. A page closed without the clean-up call getting through leaves everything to that retention too.
 */
import { DISCLAIMERS } from "@/lib/copy/disclaimers";

/** The data path, what is asked of YouCam when the visitor leaves, and the one exception: lib/copy's three lines, in order. */
export const PRIVACY_LINE = [DISCLAIMERS.privacy, DISCLAIMERS.retention, DISCLAIMERS.simulationRetention].join(" ");

/** The age gate before capture: a plain checkbox. Own photos are for people 18 and over. */
export const AGE_CONFIRMATION = "I'm 18 or older";
export const AGE_NOTE = DISCLAIMERS.adults;
