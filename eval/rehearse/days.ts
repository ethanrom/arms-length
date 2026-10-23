/** The 4 demo faces and the 6 days. The first three days are the app's EXAMPLE_DAYS (recorded agent plans exist for them). */
import { EXAMPLE_DAYS } from "../../lib/contracts/rehearse";

export const FACES = ["p1a", "p2b", "p3a", "p5a"] as const;
export type FaceId = (typeof FACES)[number];

export interface EvalDay {
  id: string;
  text: string;
  /** The device a video call in this day is on: the agent gets it as its setting, the baseline as the same sentence, and the baseline's calls are scored at its default call. */
  callDevice: "laptop" | "phone";
  /** true: the agent's plan is the recorded fixture (fixtures/rehearse/<face>/<id>.json), not run again. */
  recorded: boolean;
}

export const DAYS: readonly EvalDay[] = [
  ...EXAMPLE_DAYS.map((d): EvalDay => ({ id: d.id, text: d.day, callDevice: "laptop", recorded: true })),
  { id: "interview", text: "Job interview at 10 in a small office, then coffee with a friend at a cafe table", callDevice: "laptop", recorded: false },
  { id: "teaching", text: "Teaching a class all morning, then parent video calls on my phone in the afternoon", callDevice: "phone", recorded: false },
  { id: "beach", text: "Beach day with friends in bright sun, then a candle-lit dinner for two", callDevice: "laptop", recorded: false },
];

/** The high-effort check (README): one run of each of these days on every face. */
export const HIGH_EFFORT_DAYS: readonly string[] = ["workday", "beach"];

export const dayById = (id: string): EvalDay => {
  const d = DAYS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown day ${id}`);
  return d;
};

/** The request settings both conditions are given: the same sentence the agent's user message carries. */
export const settingsLine = (device: EvalDay["callDevice"]): string =>
  `Settings: video calls are on my ${device}. Makeup is fine if it is the only thing that helps.`;
