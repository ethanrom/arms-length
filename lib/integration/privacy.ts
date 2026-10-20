/**
 * What we tell people about their photo. Each clause is true as built (internal/DECISIONS.md, "task delete verified"):
 *  - "analysed by YouCam": the photo goes from the browser to our server and on to YouCam Skin Analysis;
 *  - "deleted from YouCam when you leave this page": the live session collects the YouCam tasks it creates and the browser
 *    asks for them to be deleted on pagehide (lib/integration/live.ts -> POST /api/youcam/cleanup, which calls
 *    POST /s2s/v2.0/task/delete; verified to return 200 and leave the task and its result URL gone);
 *  - "We don't store your photo": nothing here writes it anywhere;
 *  - the exception: a Skin Simulation task answers delete with 400 OperationInvalid, so YouCam keeps the simulated picture
 *    under its own retention (up to 24 hours). A page closed without the clean-up call getting through leaves everything to
 *    that retention too (YouCam: results 24 hours, files at most 30 days).
 */
export const PRIVACY_LINE =
  "Your photo is analysed by YouCam and deleted from YouCam when you leave this page. We don't store your photo. YouCam may keep the simulated picture for up to 24 hours.";

/** The age gate before capture: a plain checkbox. Own photos are for people 18 and over. */
export const AGE_CONFIRMATION = "I'm 18 or older";
export const AGE_NOTE = "Checking your own photo is for people 18 and over. The demo faces are for everyone.";
