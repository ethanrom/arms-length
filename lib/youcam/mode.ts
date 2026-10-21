// Which way a deployment answers: from recordings (replay) or through the live YouCam API.
//
// Keyless is the safe default for a public deploy: with no YOUCAM_API_KEY the mode is replay whatever YOUCAM_MODE says,
// so no environment mistake can reach the paid API. With a key, live is the default unless YOUCAM_MODE=replay.
// Even in live mode a call still needs a configured access code, a budget above the floor and a free daily slot
// (lib/youcam/budget.ts).

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

/** The sentence shown wherever a live call is turned away because this deployment is a recorded-faces demo. */
export const LIVE_RESERVED_MESSAGE = "Live analysis is reserved for judges with an access code. Try a demo face.";
