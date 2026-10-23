/**
 * The deterministic checker between the model's plan and the user. A plan passes only if every number in it comes from a
 * quote of a result it cites, bound numbers are worded as bounds, no banned word or absolute appears, and every action
 * points at a result of the right kind. The model is never trusted with a number; this is what makes "every number comes
 * from the model" true.
 */
import type { Claim, PlannedMoment, RehearsePrefs, VerifierIssue } from "@/lib/contracts";
import { UI_LISTS } from "@/lib/copy/banned";
import { lintText } from "@/lib/copy/lint";
import { isFreeFix, isLightestTouch, isObserve, isWorthIt, quotesFor } from "./results";
import { MAX_CLAIM_CHARS, MAX_MOMENTS } from "./schemas";
import type { AnyResult } from "./types";

export type DraftMoment = Omit<PlannedMoment, "id">;
export interface PlanDraft {
  moments: DraftMoment[];
  summary: Claim;
}

type Results = Readonly<Record<string, AnyResult>>;

/** Words that are absolutes about people or outcomes. The lists in lib/copy cover medical, shaming and claims words. */
const ABSOLUTES = /\b(?:nobody|never|promise|promised|promises|guarantee|guaranteed|guarantees|no one)\b/i;
/** A number matched only by a bound quote must be worded as one. */
const BOUND_WORDING = /\b(?:at most|up to|sharpest)\b/i;
const BOUND_KEY = /\.bound(?:Count)?$/;

const NUMBER = /\d+(?:\.\d+)?/g;
/** "1 in 12" and "54 of 650": the pair must be in one quote, not two numbers that each appear somewhere. */
const PAIR = /\b(\d+(?:\.\d+)?)\s+(in|of)\s+(\d+(?:\.\d+)?)\b/gi;
/** Clock times are the user's own words ("9am", "7:30"), not model output. */
const CLOCK = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)(?![a-z])|\b\d{1,2}:\d{2}\b|\bo'clock\b/gi;
/** Quantities in words. "one" is left out: it is mostly an idiom ("one of the").  */
const SPELLED =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|halves|third|thirds|quarter|quarters|dozen|dozens|twice|triple)\b/gi;

const norm = (token: string) => String(Number(token));

/** Numbers written in `text`, clock times excluded, normalised (1.50 and 1.5 are the same number). */
export function numbersIn(text: string): string[] {
  return [...text.replace(CLOCK, " ").matchAll(NUMBER)].map((m) => norm(m[0]));
}

const pairsIn = (text: string): string[] => [...text.matchAll(PAIR)].map((m) => `${norm(m[1])} ${m[2].toLowerCase()} ${norm(m[3])}`);

const spelledIn = (text: string): string[] => [...text.matchAll(SPELLED)].map((m) => m[0].toLowerCase());

/** Every issue found in one text: banned words, absolutes. */
function wordingIssues(text: string, momentId: string | null, where: string): VerifierIssue[] {
  const out: VerifierIssue[] = [];
  for (const v of lintText(text, UI_LISTS)) out.push({ momentId, code: "banned_word", detail: `${where} uses "${v.word}", which is not allowed.` });
  const absolute = text.match(ABSOLUTES);
  if (absolute) out.push({ momentId, code: "absolute", detail: `${where} says "${absolute[0]}": avoid absolutes and promises.` });
  return out;
}

function checkClaim(claim: Claim, momentId: string | null, where: string, implicitRefs: string[], results: Results): VerifierIssue[] {
  const issues: VerifierIssue[] = [];
  const text = claim.text ?? "";
  if (!text.trim() || text.length > MAX_CLAIM_CHARS) {
    issues.push({ momentId, code: "schema", detail: `${where} must be 1 to ${MAX_CLAIM_CHARS} characters (it is ${text.length}).` });
  }
  for (const ref of claim.refs ?? []) {
    if (!(ref in results)) issues.push({ momentId, code: "unknown_ref", detail: `${where} cites ${ref}, which is not a tool result in this run.` });
  }
  issues.push(...wordingIssues(text, momentId, where));

  const cited = [...new Set([...(claim.refs ?? []), ...implicitRefs])].filter((r) => r in results);
  const pool = cited.flatMap((ref) => Object.entries(quotesFor(results, ref)));
  const quoteText = pool.map(([, v]) => v.toLowerCase()).join(" \n ");

  // For each number the claim writes: which quote keys of the cited results contain it?
  const keysByNumber = new Map<string, string[]>();
  for (const [key, quote] of pool) {
    for (const m of quote.matchAll(NUMBER)) {
      const n = norm(m[0]);
      keysByNumber.set(n, [...(keysByNumber.get(n) ?? []), key]);
    }
  }

  const quotedPairs = new Set(pool.flatMap(([, quote]) => pairsIn(quote)));
  for (const pair of new Set(pairsIn(text.replace(CLOCK, " ")))) {
    if (!quotedPairs.has(pair)) issues.push({ momentId, code: "stray_number", detail: `${where} says "${pair}", which no quote of the cited results says. Copy the quote verbatim.` });
  }

  let boundOnly = false;
  for (const n of new Set(numbersIn(text))) {
    const keys = keysByNumber.get(n);
    if (!keys) {
      issues.push({ momentId, code: "stray_number", detail: `${where} writes ${n}, which is not in a quote of the results it cites (${cited.join(", ") || "none"}). Copy a quote verbatim or leave the number out.` });
    } else if (keys.every((k) => BOUND_KEY.test(k))) {
      boundOnly = true;
    }
  }
  if (boundOnly && !BOUND_WORDING.test(text)) {
    issues.push({ momentId, code: "bound_wording", detail: `${where} uses a number from the sharpest-eyes quote without saying "at most", "up to" or "sharpest".` });
  }
  for (const word of new Set(spelledIn(text))) {
    if (!new RegExp(`\\b${word}\\b`).test(quoteText)) {
      issues.push({ momentId, code: "stray_number", detail: `${where} says "${word}", a quantity in words that no quote of the cited results contains. Use a quote verbatim or leave it out.` });
    }
  }
  return issues;
}

/** Text that is not a claim (title, assumptions) carries no numbers except the user's own clock times. */
function checkPlainText(text: string, momentId: string, where: string, allowClock: boolean): VerifierIssue[] {
  const issues = wordingIssues(text, momentId, where);
  const body = allowClock ? text.replace(CLOCK, " ") : text;
  if (/\d/.test(body)) issues.push({ momentId, code: "stray_number", detail: `${where} must not contain numbers. Say it in words.` });
  return issues;
}

function checkAction(m: DraftMoment, momentId: string, results: Results, prefs: RehearsePrefs): VerifierIssue[] {
  const a = m.action;
  if (a.kind === "none") return [];
  const bad = (detail: string): VerifierIssue[] => [{ momentId, code: "bad_action", detail }];
  if (!("ref" in a) || !a.ref) return bad(`Action ${a.kind} needs a ref.`);
  const r = results[a.ref];
  if (!r) return [{ momentId, code: "unknown_ref", detail: `Action cites ${a.ref}, which is not a tool result in this run.` }];

  switch (a.kind) {
    case "free_fix":
      if (!isFreeFix(r)) return bad(`Action free_fix must cite a find_free_fix result; ${a.ref} is not one.`);
      if (!r.reachable) return bad(`${a.ref} found no reachable free fix, so the action cannot be free_fix.`);
      if (r.from.scene !== m.scene.scene) return bad(`${a.ref} was searched for scene ${r.from.scene}, not this moment's ${m.scene.scene}.`);
      return [];
    case "lightest_touch":
      if (prefs.noMakeup) return bad("The user would rather not wear makeup: no lightest_touch action.");
      if (!isLightestTouch(r)) return bad(`Action lightest_touch must cite a lightest_touch result; ${a.ref} is not one.`);
      if (r.status !== "met" && r.status !== "not_met") return bad(`${a.ref} has status ${r.status}: there is no measured plan to offer.`);
      return [];
    case "worth_it":
      if (!isWorthIt(r)) return bad(`Action worth_it must cite a worth_it result; ${a.ref} is not one.`);
      if (!r.simulated) return bad(`${a.ref} was not simulated, so there is nothing to offer.`);
      return [];
  }
}

function checkScene(m: DraftMoment, momentId: string, results: Results): VerifierIssue[] {
  const r = results[m.observeRef];
  if (!r) return [{ momentId, code: "unknown_ref", detail: `observeRef ${m.observeRef} is not a tool result in this run.` }];
  if (!isObserve(r)) return [{ momentId, code: "bad_scene", detail: `observeRef ${m.observeRef} is not an observe_scene result.` }];
  const bad = (detail: string): VerifierIssue[] => [{ momentId, code: "bad_scene", detail }];
  if (r.input.scene !== m.scene.scene) return bad(`The moment says scene ${m.scene.scene}, but ${m.observeRef} observed ${r.input.scene}.`);
  if (m.scene.light && m.scene.light !== r.input.light) return bad(`The moment says light ${m.scene.light}, but ${m.observeRef} observed ${r.input.light}.`);
  if (m.scene.viewer && m.scene.viewer !== r.input.viewer) return bad(`The moment says viewer ${m.scene.viewer}, but ${m.observeRef} observed ${r.input.viewer}.`);
  if (r.input.scene === "video_call") {
    const a = m.scene.call;
    const b = r.input.call;
    if (!a || !b || a.device !== b.device || a.cameraDistanceCm !== b.cameraDistanceCm || a.layout !== b.layout) {
      return bad(`The moment's call geometry differs from the one ${m.observeRef} observed.`);
    }
  }
  return [];
}

/** All the problems with a draft plan; empty means it may be shown. */
export function verifyPlan(draft: PlanDraft, results: Results, prefs: RehearsePrefs): VerifierIssue[] {
  const issues: VerifierIssue[] = [];
  if (draft.moments.length < 1 || draft.moments.length > MAX_MOMENTS) {
    issues.push({ momentId: null, code: "schema", detail: `A plan needs 1 to ${MAX_MOMENTS} moments (this has ${draft.moments.length}).` });
  }

  draft.moments.forEach((m, i) => {
    const id = `m${i + 1}`;
    issues.push(...checkScene(m, id, results));
    issues.push(...checkAction(m, id, results, prefs));
    issues.push(...checkPlainText(m.title, id, "The title", true));
    if (m.time) issues.push(...wordingIssues(m.time, id, "The time"));
    m.assumptions.forEach((text, j) => issues.push(...checkPlainText(text, id, `Assumption ${j + 1}`, true)));
    m.notice.forEach((c, j) => issues.push(...checkClaim(c, id, `notice ${j + 1}`, [m.observeRef], results)));
    m.outOfSight.forEach((c, j) => issues.push(...checkClaim(c, id, `outOfSight ${j + 1}`, [m.observeRef], results)));
    issues.push(...checkClaim(m.action.claim, id, "The action sentence", "ref" in m.action && m.action.ref ? [m.action.ref] : [], results));
  });
  issues.push(...checkClaim(draft.summary, null, "The summary", [], results));
  return issues;
}

/** The plan with each claim's implicit refs (the moment's observation, the action's result) made explicit, for the UI. */
export function withExplicitRefs(draft: PlanDraft): PlanDraft {
  const add = (c: Claim, extra: (string | undefined)[]): Claim => ({ ...c, refs: [...new Set([...c.refs, ...extra.filter((r): r is string => !!r)])] });
  return {
    summary: draft.summary,
    moments: draft.moments.map((m) => ({
      ...m,
      notice: m.notice.map((c) => add(c, [m.observeRef])),
      outOfSight: m.outOfSight.map((c) => add(c, [m.observeRef])),
      action: { ...m.action, claim: add(m.action.claim, ["ref" in m.action ? m.action.ref : undefined]) } as DraftMoment["action"],
    })),
  };
}
