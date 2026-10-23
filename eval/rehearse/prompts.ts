/**
 * The exact prompts of the "without our numbers" arm, and the parser for its reply. prompts.md is generated from these
 * (run.ts --prompts), so the two cannot drift.
 *
 * The arm sees what the agent's system prompt shows it (scene, light and viewer ids and labels, the concern names, the
 * device setting) plus the scene distances from the same table, the iris and pupil-distance as a ruler, and the definition
 * of "noticeable" the scoring uses. It gets no tool result: no share, no count, no threshold from our model.
 */
import { SCENES } from "../../lib/contracts/rehearse";
import { CONCERN_COPY } from "../../lib/copy/concerns";
import { IRIS_DIAMETER_MM } from "../../lib/scale/iris";
import { IPD_MM } from "../../lib/scale/fromMasks";
import type { ConcernId } from "../../lib/contracts/concerns";
import { extractJsonObject } from "../llm-baseline/stats";
import { settingsLine } from "./days";
import type { MomentChoice, Stand } from "./score";

/** The concerns with a visibility distance, in the app's order (texture has none). */
export const CONCERN_IDS: readonly ConcernId[] = ["pore", "age_spot", "acne", "wrinkle", "dark_circle", "eye_bag", "redness"];
export const MAX_MOMENTS = 8;

/** Copied from LIGHTS in lib/agent/prompt.ts, so the two arms read the same words. */
const LIGHTS = [
  "home: dim home or restaurant light, candlelit dinners, evenings in",
  "indoor: office, cafe, shop or a bright room",
  "overcast: cloudy daylight outdoors, or open shade",
  "daylight: bright sun outdoors, or sitting by a sunny window",
  "videoCall: the glow of a screen, the default for calls",
];

export function systemPrompt(): string {
  const scenes = SCENES.map((s) =>
    s.distanceM === null
      ? `- ${s.id}: ${s.label} (the other person sees you on a screen; default light ${s.light})`
      : `- ${s.id}: ${s.label} (about ${s.distanceM} m; default light ${s.light})`,
  ).join("\n");
  const names = CONCERN_IDS.map((id) => `${id} = ${CONCERN_COPY[id].plural}`).join("; ");
  const shape = `{"moments":[{"title":"short title","time":"9am" or null,"scene":"<scene id>","light":"<light id>","viewer":"typical" or "blurry","concerns":{${CONCERN_IDS.map((id) => `"${id}":{"noticeable":true,"share":0.4,"advice":"cover"}`).join(",")}}}]}`;

  return `You help one person see what other people can actually pick out of their skin in each moment of a day. You are given a photo of their face and a description of their day.

Look at the photo: which kinds of marks this face has, how big each is (the iris is about ${IRIS_DIAMETER_MM} mm across and the distance between the pupils is about ${IPD_MM} mm, so use them as a ruler), and how much darker or redder each is than the skin around it. Then think about how far away the other person is in each moment, the light, and how well they see.

## Steps
1. Split the day into 1 to ${MAX_MOMENTS} moments, in time order.
2. For each moment choose one scene, one light and one viewer from the tables below. Use the ids exactly. Where the person did not say, use the scene's default light and the typical viewer.
3. For each moment, for each kind of mark, judge what that other person could pick out and whether you would suggest covering it.

## Scenes
${scenes}

## Lights
${LIGHTS.map((l) => `- ${l}`).join("\n")}

## Viewers
- typical: most people, 20/20 sight (the default)
- blurry: someone without their glasses, 20/40 sight

## Kinds of marks
${names}

## What to say about each kind of mark, at each moment
- noticeable: true when that other person, looking straight at this person with nothing else competing for their attention, could pick out at least about one in ten of that kind of mark. For a single large soft area (under-eye shadows, under-eye puffiness, broad redness) true when they could pick out the area. Otherwise false.
- share: your best estimate, from 0 to 1, of the fraction of that kind of mark on this face that such a person could pick out. For a single large soft area give 1 if it can be picked out and 0 if not.
- advice: "cover" if you would suggest covering or softening it for this moment (for example with makeup), "nothing" if no effort is needed.
- If a kind of mark is not on this face, give null for it instead of an object.
What is easy to see in a close-up photo can be too small or too faint to pick out at the distance of the moment, and large soft areas carry much farther than small dots. Be calibrated: do not call something visible just because it is on the face, and do not call it invisible just because it is small.

## Reply
JSON only, no markdown fence and no commentary, in this shape (every one of the ${CONCERN_IDS.length} kinds of marks in every moment):
${shape}`;
}

export function userText(day: string, device: "laptop" | "phone"): string {
  return `My day: ${day}\n\n${settingsLine(device)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The reply
// ---------------------------------------------------------------------------------------------------------------

export interface ParsedMoment extends MomentChoice {
  title: string;
  time: string | null;
}

function parseStand(v: unknown): Stand | undefined {
  if (v === null) return { noticeable: false, share: 0, advice: "nothing", absent: true };
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const noticeable = typeof o.noticeable === "boolean" ? o.noticeable : o.noticeable === "true" ? true : o.noticeable === "false" ? false : undefined;
  const share = typeof o.share === "number" ? o.share : typeof o.share === "string" && o.share.trim() !== "" && Number.isFinite(Number(o.share)) ? Number(o.share) : undefined;
  const advice = typeof o.advice === "string" ? o.advice.trim().toLowerCase() : undefined;
  if (noticeable === undefined || share === undefined || !Number.isFinite(share) || (advice !== "cover" && advice !== "nothing")) return undefined;
  return { noticeable, share, advice };
}

/** null when the reply cannot be read as the requested shape (that costs the one allowed retry). */
export function parseReply(text: string | undefined): ParsedMoment[] | null {
  const obj = text ? extractJsonObject(text) : null;
  const list = obj?.moments;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_MOMENTS) return null;
  const out: ParsedMoment[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    if (typeof m.scene !== "string" || typeof m.light !== "string" || typeof m.viewer !== "string") return null;
    const concerns = m.concerns;
    if (!concerns || typeof concerns !== "object") return null;
    const stands: Partial<Record<ConcernId, Stand>> = {};
    for (const id of CONCERN_IDS) {
      if (!(id in (concerns as object))) return null;
      const stand = parseStand((concerns as Record<string, unknown>)[id]);
      if (!stand) return null;
      stands[id] = stand;
    }
    out.push({
      title: typeof m.title === "string" ? m.title : "",
      time: typeof m.time === "string" ? m.time : null,
      scene: m.scene.trim(),
      light: m.light.trim(),
      viewer: m.viewer.trim().toLowerCase(),
      stands,
    });
  }
  return out;
}

export function promptsMarkdown(modelNote: string): string {
  const fence = "```";
  return `# Prompts

Generated by \`npx tsx eval/rehearse/run.ts --prompts\` from \`prompts.ts\`. These are the exact strings sent.

## Without our numbers

- Model: ${modelNote}, \`ConverseCommand\` on Amazon Bedrock, \`maxTokens: 8000\`, \`additionalModelRequestFields: { output_config: { effort } }\` with the same effort as the agent (\`CLAUDE_AWS_EFFORT\`, \`low\` unless set). No tools, no temperature.
- Prompt caching: a cache point after the system prompt and one after the photo, so the 12 calls that share a face reuse both. If the account rejects cache points the call is repeated once without them.
- One user message: the photo (\`public/demo/<face>/photo.jpg\`, sent unchanged), then the user text.

### System prompt

${fence}text
${systemPrompt()}
${fence}

### User text (for example the \`workday\` day, laptop calls)

${fence}text
${userText("9am video standup on my laptop, lunch with a client by the window, dinner date at 7", "laptop")}
${fence}

For the \`teaching\` day the settings line says "phone". Every other day says "laptop".

## With our numbers

The agent is run as shipped (\`runAgent\` in \`lib/agent/loop.ts\` with \`createBedrockClient\`; its system prompt is \`buildSystemPrompt()\` in \`lib/agent/prompt.ts\`, its tools are in \`lib/agent/tools.ts\`). Its user message is

${fence}text
My day: <the day>

${settingsLine("laptop")}
${fence}

with "phone" for the \`teaching\` day.
`;
}
