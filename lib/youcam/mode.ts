// Which way a deployment answers: from recordings (replay) or through the live YouCam API.
//
// Keyless is the safe default for a public deploy: with no YOUCAM_API_KEY the mode is replay whatever YOUCAM_MODE says,
// so no environment mistake can reach the paid API. With a key, live is the default unless YOUCAM_MODE=replay.
// Even in live mode a call on the project key still needs an access code (or LIVE_OPEN=1), a budget above the floor and a
// free daily slot (lib/youcam/budget.ts). A caller's own YouCam key needs none of that, so it works on a keyless deploy too:
// only YOUCAM_MODE=replay (and the kill switch) turns it away.

export type YouCamMode = "live" | "replay";

type Env = Record<string, string | undefined>;

/**
 * Dev and test only: in replay mode, answer an uploaded photo with a recorded demo face (labelled replay). Off by default,
 * because on a public deploy a visitor who uploads their own photo must never be shown someone else's face.
 */
export function replayUploadsEnabled(env: Env): boolean {
  return env.REPLAY_UPLOADS?.trim() === "1";
}

export function youcamMode(env: Env): YouCamMode {
  if (env.YOUCAM_MODE?.trim().toLowerCase() === "replay") return "replay";
  return env.YOUCAM_API_KEY?.trim() ? "live" : "replay";
}

/** Whether a caller's own YouCam key may be used here: everywhere except a deployment forced to recordings. */
export function byokAllowed(env: Env): boolean {
  return env.YOUCAM_MODE?.trim().toLowerCase() !== "replay";
}

/** The sentence shown wherever a live call is turned away because this deployment does not offer it to the caller. */
export const LIVE_RESERVED_MESSAGE = "Live analysis needs your own YouCam API key or an access code here. Try a demo face.";
