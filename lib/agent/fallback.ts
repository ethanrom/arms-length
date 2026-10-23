/**
 * The deterministic fallback: when the model fails, times out or cannot produce a plan that passes the checker, the day is
 * rebuilt from the same tools with template sentences. Every number in it is a verbatim quote of a result it cites, so it
 * passes verifyPlan by construction (and the tests check that for every example day on every demo face).
 */
import type { Claim, ConcernAtScene, ConcernId, DayPlan, LightId, ObserveResult, RehearseEvent, RehearseFace, RunStats, SceneId, SceneInput, ToolName, VerifierIssue } from "@/lib/contracts";
import { SCENES } from "@/lib/contracts";
import { UI_LISTS } from "@/lib/copy/banned";
import { CONCERN_COPY } from "@/lib/copy/concerns";
import { lintText } from "@/lib/copy/lint";
import { assemblePlan } from "./plan";
import { createRunStore } from "./results";
import { MAX_CLAIM_CHARS, MAX_HEADLINE_CHARS, MAX_MOMENTS } from "./schemas";
import { cleanTitle, stepEvent } from "./tools";
import { isSceneError, type AgentRequest, type RehearseEngine } from "./types";
import type { DraftMoment, PlanDraft } from "./verify";

export interface FallbackMoment {
  /** As the model or the user said it; replaced by a template title when empty or not clean. */
  title: string | null;
  time: string | null;
  scene: SceneInput;
  /** parseDayFallback: a team call is shown in a small tile. */
  gallery?: boolean;
}

export interface FallbackInput {
  request: AgentRequest;
  face: RehearseFace;
  engine: RehearseEngine;
  /** Moments from the model's attempt. Without them they are read from the day text (or the earlier plan, for a follow-up). */
  moments?: FallbackMoment[];
  /** The checker's findings on the model's last attempt, kept on the plan. */
  issues?: VerifierIssue[];
  stats: RunStats;
  /** Progress, for replay: the same step events the model's tool calls would have produced. */
  emit?: (event: RehearseEvent) => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the day text
// ---------------------------------------------------------------------------------------------------------------

interface SceneRule {
  re: RegExp;
  scene: SceneId;
  title: string;
}

/** In priority order: the first rule that matches a clause names its scene. */
const SCENE_RULES: SceneRule[] = [
  { re: /\b(?:video|zoom|teams|calls?|stand-?ups?|webcam)\b/i, scene: "video_call", title: "Video call" },
  { re: /\bpresent(?:s|ing|ation)?\b/i, scene: "presenting", title: "Presenting" },
  { re: /\bmeetings?\b/i, scene: "meeting_room", title: "Meeting" },
  { re: /\bwedding\b/i, scene: "close_talk", title: "Wedding" },
  { re: /\b(?:danc(?:e|es|ing)|hugs?|hugging)\b/i, scene: "close_talk", title: "Up close" },
  { re: /\bdinner\b/i, scene: "dinner_table", title: "Dinner" },
  { re: /\bdate\b/i, scene: "dinner_table", title: "Date" },
  { re: /\b(?:lunch|restaurant)\b/i, scene: "dinner_table", title: "Lunch" },
  { re: /\b(?:coffee|cafe|brunch)\b/i, scene: "cafe_table", title: "Coffee" },
  { re: /\b(?:drinks|party|pub|bar|friends|colleagues|chat)\b/i, scene: "conversation", title: "Catching up" },
];

const LIGHT_RULES: { re: RegExp; light: LightId }[] = [
  { re: /\b(?:outdoors?|outside|sun|sunny|sunshine|sunlight|garden|beach|terrace|park|window)\b/i, light: "daylight" },
  { re: /\b(?:overcast|cloudy|rain|rainy)\b/i, light: "overcast" },
  { re: /\b(?:candle|candlelit|dim|dimly)\b/i, light: "home" },
];

const lightIn = (text: string): LightId | null => LIGHT_RULES.find((r) => r.re.test(text))?.light ?? null;

function timeIn(clause: string): string | null {
  const clock = clause.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i) ?? clause.match(/\bat (\d{1,2}(?::\d{2})?)\b/i);
  if (clock) return /^at /i.test(clock[0]) ? `at ${clock[1]}` : clock[1].toLowerCase().replace(/\s+/g, "");
  return clause.match(/\b(morning|afternoon|evening|tonight|noon|after work)\b/i)?.[1].toLowerCase() ?? null;
}

/**
 * The day text as moments, by keywords: call, zoom, standup (video call); dinner, date (dinner table); coffee (cafe table);
 * present (presenting); meeting (meeting room); wedding, dance, hug (close talk); outdoor, sun (daylight). A clause with no
 * keyword is skipped; a day with none at all is one standing conversation. Used only when the model gave nothing to go on.
 */
export function parseDayFallback(day: string): FallbackMoment[] {
  const out: FallbackMoment[] = [];
  for (const clause of day.split(/[,;.\n]|\bthen\b|\band\b/i)) {
    const rule = SCENE_RULES.find((r) => r.re.test(clause));
    if (!rule) continue;
    const light = lightIn(clause);
    out.push({
      title: rule.title,
      time: timeIn(clause),
      scene: { scene: rule.scene, ...(light ? { light } : {}) },
      ...(rule.scene === "video_call" ? { gallery: /\b(?:stand-?up|team|group|all-hands)\b/i.test(clause) } : {}),
    });
    if (out.length === MAX_MOMENTS) break;
  }
  return out.length ? out : [{ title: "Chatting", time: null, scene: { scene: "conversation" } }];
}

/** A follow-up with no new plan from the model: the earlier moments, with a light change where the question names that moment. */
function followUpMoments(request: AgentRequest): { moments: FallbackMoment[]; applied: boolean } {
  const follow = request.followUp;
  if (!follow) return { moments: [], applied: false };
  const light = lightIn(follow.question);
  const asked = new Set(follow.question.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  let applied = false;
  const moments = follow.previous.moments.map((m): FallbackMoment => {
    const named = (m.title.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => asked.has(w));
    if (light && named && m.scene.scene !== "video_call") {
      applied = true;
      return { title: m.title, time: m.time, scene: { ...m.scene, light } };
    }
    return { title: m.title, time: m.time, scene: m.scene };
  });
  return { moments, applied };
}

// ---------------------------------------------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------------------------------------------

const SCENE_TITLE: Record<SceneId, string> = {
  close_talk: "Up close",
  cafe_table: "Coffee",
  conversation: "Chatting",
  dinner_table: "Across a table",
  meeting_room: "Meeting",
  presenting: "Presenting",
  video_call: "Video call",
};

const CLOCK = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi;
const ABSOLUTE = /\b(?:nobody|never|promise|guarantee|no one)\b/i;

/** A title worth showing: clean, short, no digits but clock times, no banned or absolute words. */
function usableTitle(title: string | null): string | null {
  const t = cleanTitle(title);
  if (!t || /\d/.test(t.replace(CLOCK, " ")) || lintText(t, UI_LISTS).length || ABSOLUTE.test(t)) return null;
  return t;
}

function usableTime(time: string | null): string | null {
  if (!time || time.length > 20 || !/^[\p{L}\d:.\s]+$/u.test(time) || lintText(time, UI_LISTS).length) return null;
  return time;
}

const names = (ids: ConcernId[]) => {
  const list = ids.map((id) => CONCERN_COPY[id].plural);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A sentence within the claim limit: the long form if it fits, else the short one. */
const fit = (long: string, short: string) => (long.length <= MAX_CLAIM_CHARS ? long : short);

function outOfSightClaim(obs: ObserveResult, ids: ConcernId[]): Claim {
  const list = names(ids);
  const text =
    obs.input.scene === "video_call"
      ? `On the call, your face looks as it would from ${obs.quotes.distance} away: a typical viewer picks out none of your ${list}.`
      : fit(`At ${obs.quotes.distance} in ${obs.quotes.light}, a typical viewer picks out none of your ${list}.`, `At ${obs.quotes.distance}, a typical viewer picks out none of your ${list}.`);
  return { text, refs: [obs.ref] };
}

function noticeClaim(obs: ObserveResult, c: ConcernAtScene): Claim {
  const copy = CONCERN_COPY[c.concern];
  const typical = obs.quotes[`${c.concern}.typical`];
  const text = c.soft
    ? `A typical viewer would find your ${copy.plural} ${typical}.`
    : copy.agreement === "plural"
      ? `A typical viewer could pick out ${typical} of your ${copy.plural}.`
      : `A typical viewer could pick out ${typical} of the areas of ${copy.plural}.`;
  return { text, refs: [obs.ref] };
}

/** "at most 1 in 8", "at most half", "at most 3 in 10": the bounds that read well after "could pick out". */
const READABLE_BOUND = /^at most (?:1 in \d+|\d+ in 10|half)$/;

function sharpestClaim(obs: ObserveResult, ids: ConcernId[]): Claim | null {
  for (const id of ids) {
    const bound = obs.quotes[`${id}.bound`];
    const copy = CONCERN_COPY[id];
    if (bound && READABLE_BOUND.test(bound) && copy.agreement === "plural") {
      return { text: `The sharpest eyes could pick out ${bound} of your ${copy.plural}.`, refs: [obs.ref] };
    }
  }
  return null;
}

/** On a call, marks smaller than the video can carry are lost whatever the other person's eyes: good news, so it leads. */
function videoFloorClaim(obs: ObserveResult): Claim | null {
  const floor = obs.quotes.floor;
  const lost = obs.concerns
    .filter((c) => (c.belowCameraCount ?? 0) > 0 && obs.quotes[`${c.concern}.belowCamera`])
    .sort((a, b) => (b.belowCameraCount ?? 0) / b.targetCount - (a.belowCameraCount ?? 0) / a.targetCount)[0];
  if (!floor || !lost) return null;
  const name = CONCERN_COPY[lost.concern].title;
  return { text: `${name} on the call: ${obs.quotes[`${lost.concern}.belowCamera`]} are smaller than the smallest detail the video carries (${floor}).`, refs: [obs.ref] };
}

const SCENE_LEAD: Record<SceneId, string> = {
  close_talk: "up close",
  cafe_table: "across a small table",
  conversation: "while you chat",
  dinner_table: "across the table",
  meeting_room: "across the meeting room",
  presenting: "while you present",
  video_call: "on the call",
};

/**
 * The one sentence under a moment's picture, relief first: what a typical viewer does not pick out, then (if something does show)
 * a pointer to the tip as an option. No numbers, so there is nothing to quote wrongly, and none of the wording the verifier keeps
 * out of headlines. The opening alternates with the moment's position, so a day does not read the same way twice.
 */
function headlineClaim(obs: ObserveResult, outIds: ConcernId[], hasTip: boolean, anySeen: boolean, position: number): Claim {
  const lead = SCENE_LEAD[obs.input.scene];
  const first = position % 2 === 0;
  const Lead = lead.charAt(0).toUpperCase() + lead.slice(1);
  const out = (ids: ConcernId[], among: boolean) => {
    const verb = ids.length === 1 && CONCERN_COPY[ids[0]].agreement === "singular" ? "is" : "are";
    return `your ${names(ids)}${among ? ", among others," : ""} ${verb} out of sight`;
  };
  let text: string;
  if (outIds.length === 0) {
    const tip = hasTip ? "if you'd like, there is a tip below" : "that is what they will see";
    text = first ? `${Lead}, more of your skin shows; ${tip}.` : `More of your skin shows ${lead}; ${tip}.`;
  } else {
    const tail = hasTip ? ", and there is a tip if you'd like more" : anySeen ? ", and you can see the rest below" : "";
    const make = (ids: ConcernId[], among: boolean) => {
      const o = out(ids, among);
      return first ? `${Lead}, ${o}${tail}.` : `${o.charAt(0).toUpperCase()}${o.slice(1)} ${lead}${tail}.`;
    };
    const shown = outIds.slice(0, 3);
    text = make(shown, outIds.length > shown.length);
    if (text.length > MAX_HEADLINE_CHARS) text = make(outIds.slice(0, 1), outIds.length > 1);
  }
  if (text.length > MAX_HEADLINE_CHARS) text = "Here is what they will see from there.";
  return { text, refs: [obs.ref] };
}

// ---------------------------------------------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------------------------------------------

/** The same 10% the free-fix and lightest-touch searches aim at. */
const NEEDS_SHARE = 0.1;

type Store = ReturnType<typeof createRunStore>;
type Step = (tool: ToolName, args: unknown) => void;

interface BuiltMoment {
  moment: DraftMoment;
  /** Something is still in sight that the user may want to act on. */
  needsChange: boolean;
}

export function buildFallbackPlan(input: FallbackInput): DayPlan {
  const { request, face, engine } = input;
  const store = createRunStore();
  const step: Step = (tool, args) => input.emit?.(stepEvent(tool, args));

  const follow = input.moments?.length ? null : followUpMoments(request);
  const candidates: FallbackMoment[] = (input.moments?.length ? input.moments : follow?.moments.length ? follow.moments : parseDayFallback(request.day)).slice(0, MAX_MOMENTS);

  const withCall = (m: FallbackMoment): SceneInput => {
    const scene = { ...m.scene };
    if (scene.scene === "video_call") {
      if (!scene.call) scene.call = engine.defaultCall(request.prefs.callDevice, m.gallery ? "gallery" : "speaker");
      delete scene.distanceM;
    } else {
      delete scene.call;
    }
    return scene;
  };

  // The model's scene first; if the engine refuses it (a distance outside the range), the scene's own defaults.
  const observe = (title: string, scene: SceneInput): { obs: ObserveResult; scene: SceneInput } | null => {
    for (const attempt of [scene, { scene: scene.scene, ...(scene.call ? { call: scene.call } : {}) } as SceneInput]) {
      try {
        step("observe_scene", { label: title, scene: attempt.scene });
        const obs = engine.observeScene(face, attempt, store.nextRef());
        store.commit(obs);
        return { obs, scene: attempt };
      } catch (error) {
        if (!isSceneError(error)) throw error;
      }
    }
    return null;
  };

  const built: BuiltMoment[] = [];
  const add = (candidate: FallbackMoment) => {
    const scene = withCall(candidate);
    const title = usableTitle(candidate.title) ?? SCENE_TITLE[scene.scene];
    const seen = observe(title, scene);
    if (seen) built.push(momentFrom({ ...seen, title, time: usableTime(candidate.time), position: built.length, input, store, step }));
  };
  candidates.forEach(add);
  if (built.length === 0) add({ title: "Chatting", time: null, scene: { scene: "conversation" } });
  if (built.length === 0) throw new Error("The fallback plan could not be built: no scene could be observed.");

  const notApplied = !!request.followUp && !!follow && !follow.applied;
  const draft: PlanDraft = { moments: built.map((b) => b.moment), summary: summaryFor(built, notApplied) };
  return assemblePlan({ day: request.day, draft, results: store.results, verified: false, issues: input.issues ?? [], stats: input.stats });
}

const LIGHT_WORDS: Record<LightId, string> = {
  home: "dim home light",
  indoor: "indoor light",
  overcast: "overcast daylight",
  daylight: "bright daylight",
  videoCall: "the glow of a screen",
};

function momentFrom(args: { obs: ObserveResult; scene: SceneInput; title: string; time: string | null; position: number; input: FallbackInput; store: Store; step: Step }): BuiltMoment {
  const { obs, scene, title, time, position, input, store, step } = args;
  const measured = obs.concerns.filter((c) => c.targetCount > 0);
  const outIds = measured.filter((c) => c.typicalCount === 0).map((c) => c.concern);
  const seen = measured.filter((c) => c.typicalCount > 0).sort((a, b) => b.typicalShare - a.typicalShare);
  const needs = measured.filter((c) => c.typicalShare > NEEDS_SHARE);

  const outOfSight: Claim[] = [];
  if (outIds.length) outOfSight.push(outOfSightClaim(obs, outIds));
  const sharpest = sharpestClaim(obs, outIds);
  if (sharpest) outOfSight.push(sharpest);
  const floorClaim = scene.call ? videoFloorClaim(obs) : null;
  if (floorClaim) outOfSight.unshift(floorClaim);

  const action = chooseAction({ obs, scene, needs, title, input, store, step });
  const call = scene.call;
  const assumptions = [
    `I took this moment as: ${SCENES.find((s) => s.id === scene.scene)?.label ?? scene.scene}.`,
    call ? `I took your call as on a ${call.device}, ${call.layout === "gallery" ? "in a small gallery tile" : "with you alone on the screen"}.` : "I took the viewer as someone with typical eyesight.",
  ];
  if (scene.light && !call) assumptions.push(`I took the light as ${LIGHT_WORDS[scene.light]}.`);

  return {
    needsChange: needs.length > 0,
    moment: { time, title, scene, observeRef: obs.ref, headline: headlineClaim(obs, outIds, action.kind !== "none", seen.length > 0, position), assumptions, notice: seen.slice(0, 3).map((c) => noticeClaim(obs, c)), outOfSight, action },
  };
}

/**
 * One action per moment. A free change first: the largest group of the concerns in sight (easiest first) that one change puts
 * out of sight. Then the measured lightest touch, unless the user would rather not wear makeup. Otherwise none, said plainly.
 */
function chooseAction(args: { obs: ObserveResult; scene: SceneInput; needs: ConcernAtScene[]; title: string; input: FallbackInput; store: Store; step: Step }): DraftMoment["action"] {
  const { obs, scene, needs, title, input, store, step } = args;
  const { face, engine, request } = input;
  if (needs.length === 0) return { kind: "none", claim: { text: "Nothing needs doing for this moment.", refs: [obs.ref] } };

  const easiestFirst = [...needs].sort((a, b) => a.typicalShare - b.typicalShare).map((c) => c.concern);
  let group: ConcernId[] = [];
  for (let k = 1; k <= easiestFirst.length; k++) {
    const probe = engine.findFreeFix(face, { moment: scene, concerns: easiestFirst.slice(0, k) }, "probe");
    if (!probe.reachable || !probe.lever) break;
    group = easiestFirst.slice(0, k);
  }
  if (group.length) {
    step("find_free_fix", { label: title });
    const fix = engine.findFreeFix(face, { moment: scene, concerns: group }, store.nextRef());
    store.commit(fix);
    const where = fix.quotes.to && fix.lever !== "light" ? ` (${fix.quotes.to})` : "";
    const text = fit(
      `${cap(fix.quotes.change)}${where} to put your ${names(group)} out of sight for a typical viewer.`,
      `${cap(fix.quotes.change)}${where} to put these out of sight for a typical viewer.`,
    );
    return { kind: "free_fix", ref: fix.ref, claim: { text, refs: [fix.ref] } };
  }

  if (!request.prefs.noMakeup) {
    for (const concern of easiestFirst) {
      step("lightest_touch", { concern });
      const touch = engine.lightestTouch(face, concern, store.nextRef());
      store.commit(touch);
      if ((touch.status === "met" || touch.status === "not_met") && touch.quotes.coverage && touch.quotes.measuredAt) {
        const extra = touch.status === "not_met" && touch.quotes.result ? ` (${touch.quotes.result})` : "";
        const text = `Your measured lightest touch for ${CONCERN_COPY[concern].plural}: ${touch.quotes.coverage}${extra}, ${touch.quotes.measuredAt}.`;
        return { kind: "lightest_touch", ref: touch.ref, claim: { text, refs: [touch.ref] } };
      }
    }
  }
  step("find_free_fix", { label: title });
  const all = engine.findFreeFix(face, { moment: scene, concerns: easiestFirst }, store.nextRef());
  store.commit(all);
  const limit = all.quotes.limit;
  const generic = "A free change would not bring these fully out of sight here, so the list above is what a typical viewer could pick out.";
  return { kind: "none", claim: { text: limit ? fit(`${cap(limit)}.`, generic) : generic, refs: [all.ref] } };
}

function summaryFor(built: BuiltMoment[], followUpNotApplied: boolean): Claim {
  const refs = built.map((b) => b.moment.observeRef).slice(0, 8);
  const lead = followUpNotApplied ? "I could not work out that change just now, so these are your earlier moments, checked again. " : "";
  const needing = built.filter((b) => b.needsChange).map((b) => b.moment.title);
  if (needing.length === 0) return { text: `${lead}Nothing in your day needs doing: a typical viewer picks out very little at any moment.`, refs };
  const listed = [...new Set(needing)].slice(0, 3);
  const verb = listed.length === 1 ? "has" : "have";
  const sentence =
    needing.length * 2 < built.length
      ? `Most of your day needs nothing. ${listed.join(" and ")} ${verb} something a typical viewer could pick out, and the card lists the smallest change.`
      : `${listed.join(", ")} ${verb} something a typical viewer could pick out; each card lists the smallest change.`;
  return { text: fit(`${lead}${sentence}`, `${lead}Each card lists what is in sight and the smallest change.`), refs };
}
