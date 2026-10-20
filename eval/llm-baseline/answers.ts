/** Reads the raw cache back into answers: which runs are finished, and what each run said. */
import fs from "node:fs";
import { readRecord, recordPath, type RawRecord } from "./bedrock";
import { TEST_A_CONCERNS, type TestAKey } from "./prompts";
import { extractJsonObject, toMetres } from "./stats";

export type TestAValues = Record<TestAKey, number | null>;

export function parseTestA(text: string | undefined): TestAValues | null {
  const obj = text ? extractJsonObject(text) : null;
  if (!obj) return null;
  const out = {} as TestAValues;
  for (const c of TEST_A_CONCERNS) {
    if (!(c.key in obj)) return null;
    const v = toMetres(obj[c.key]);
    if (v === undefined) return null;
    out[c.key] = v;
  }
  return out;
}

export function parseTestB(text: string | undefined): { distanceM: number; reasoning: string } | null {
  const obj = text ? extractJsonObject(text) : null;
  if (!obj) return null;
  const v = toMetres(obj.distance_m);
  if (typeof v !== "number") return null;
  return { distanceM: v, reasoning: typeof obj.reasoning_short === "string" ? obj.reasoning_short : "" };
}

export interface RunAnswer<T> {
  test: "A" | "B";
  item: string;
  run: number;
  /** Calls spent on this run (1, or 2 if the first reply could not be read). */
  attempts: number;
  /** The parsed answer from the first readable attempt; null if none was readable. */
  value: T | null;
  record: RawRecord | null;
}

export const MAX_ATTEMPTS = 2;

/** Attempt records on disk for a run, in order. */
export function attemptsOf(test: string, item: string, run: number): RawRecord[] {
  const out: RawRecord[] = [];
  for (let k = 1; k <= MAX_ATTEMPTS; k++) {
    const f = recordPath(test, item, run, k);
    if (fs.existsSync(f)) out.push(readRecord(f));
  }
  return out;
}

export function readRun<T>(test: "A" | "B", item: string, run: number, parse: (t: string | undefined) => T | null): RunAnswer<T> {
  const attempts = attemptsOf(test, item, run);
  for (const r of attempts) {
    const value = parse(r.text);
    if (value) return { test, item, run, attempts: attempts.length, value, record: r };
  }
  return { test, item, run, attempts: attempts.length, value: null, record: attempts.at(-1) ?? null };
}

/** The attempt number to make next, or 0 if the run is finished (readable answer, or both attempts used). */
export function nextAttempt<T>(test: "A" | "B", item: string, run: number, parse: (t: string | undefined) => T | null): number {
  const r = readRun(test, item, run, parse);
  if (r.value || r.attempts >= MAX_ATTEMPTS) return 0;
  return r.attempts + 1;
}
