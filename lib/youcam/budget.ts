// Unit budget guard: decides whether a request may spend project YouCam units, and writes the ledger.
//
// Project units are spent only when all hold:
//   1. the request carries a valid access code (LIVE_ACCESS_CODES, comma-separated), or the deployment is open
//      (LIVE_OPEN=1) and the request carries no code at all;
//   2. KILL_SWITCH is off (anything but empty, 0, false, no or off turns it on: a typo must not leave paid calls open);
//   3. the caller is under its daily cap (default 3 live analyses; renders have their own, larger cap). A code is
//      counted by its hash, an open visitor by a hash of their address, and all open visitors together are held to
//      LIVE_OPEN_DAILY_CAP analyses a day (default 8);
//   4. the account balance (credit(), cached 60 s) minus this call's cost stays above UNIT_FLOOR (never below 100).
//
// A caller's own YouCam key never reaches this guard: it spends the caller's units, not the project's (service.ts).
//
// Daily caps live in module memory. On serverless every instance has its own memory, so the cap is
// best effort: N warm instances can each allow the full cap. The balance floor and kill switch are the
// real protection.
import { createHash, timingSafeEqual } from "node:crypto";
import type { GateReason } from "./errors";

export type GuardKind = "analysis" | "render";

export interface GuardConfig {
  codes: string[];
  killSwitch: boolean;
  unitFloor: number;
  analysisDailyCap: number;
  renderDailyCap: number;
  /** LIVE_OPEN=1: a request with no code may use the project key, within the caps and the floor. */
  open: boolean;
  /** Analyses per day across every open visitor together, so a leaked link can only burn so much. */
  openDailyCap: number;
}

export type Decision =
  | {
      ok: true;
      /** Who is spending, for the ledger: the code's hash, or "open". Never key material. */
      who: string;
      /** Gives back the daily slot when the call failed before any unit was spent. */
      release: () => void;
    }
  | { ok: false; reason: GateReason };

const BALANCE_TTL_MS = 60_000;
const MAX_TRACKED_IDENTITIES = 10_000;

/** UNIT_FLOOR can raise the reserve but never lower it: the units kept back are not for live visitors. */
export const MIN_UNIT_FLOOR = 100;

/** On unless explicitly off. Fails safe: "true", "yes", "on" and any other stray value all engage it. */
function switchedOn(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase() ?? "";
  return v !== "" && !["0", "false", "no", "off"].includes(v);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function configFromEnv(env: Record<string, string | undefined>): GuardConfig {
  return {
    codes: (env.LIVE_ACCESS_CODES ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
    killSwitch: switchedOn(env.KILL_SWITCH),
    unitFloor: Math.max(MIN_UNIT_FLOOR, positiveInt(env.UNIT_FLOOR, MIN_UNIT_FLOOR)),
    analysisDailyCap: positiveInt(env.LIVE_DAILY_CAP, 3),
    renderDailyCap: positiveInt(env.LIVE_RENDER_DAILY_CAP, 20),
    open: switchedOn(env.LIVE_OPEN),
    openDailyCap: positiveInt(env.LIVE_OPEN_DAILY_CAP, 8),
  };
}

/** Short stable hash for logs. The access code itself is never written anywhere. */
export function hashCode(code: string): string {
  return createHash("sha256").update(`arms-length|${code}`).digest("hex").slice(0, 12);
}

/** Open visitors are counted by a hash of their address, so no address sits in memory or logs. */
function ipKey(ip: string): string {
  return `ip:${createHash("sha256").update(`arms-length|ip|${ip}`).digest("hex").slice(0, 12)}`;
}

/** The one usage record shared by every open visitor. */
const OPEN_POOL = "open";

function sameCode(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface LedgerEntry {
  action: string;
  units: number;
  /** "byok", "open" or the access code's hash. Never the code or a key. */
  who: string;
  /** The submit outcome was unknown, so the units may or may not have been charged. */
  maybe?: boolean;
}

/** One structured JSON line per paid call; the platform log is the ledger. Own-key calls are logged too (who: "byok"). */
export function writeLedger(entry: LedgerEntry): void {
  console.log(
    JSON.stringify({
      type: "ledger",
      action: entry.action,
      units: entry.units,
      who: entry.who,
      ts: new Date().toISOString(),
      ...(entry.maybe ? { maybe: true } : {}),
    }),
  );
}

export interface BudgetGuardOptions {
  config: () => GuardConfig;
  /** Remaining units; usually `() => client.credit()`. A failure counts as "unknown" and closes the gate. */
  getBalance: () => Promise<number>;
  now?: () => number;
}

export interface BudgetGuard {
  /**
   * `reserve: false` only peeks (status endpoint). `cost` is the units this call will spend. `ip` is the caller's
   * address: with no code and LIVE_OPEN on, it is the identity the daily cap is kept against.
   */
  decide(code: string | null, kind: GuardKind, options: { cost: number; reserve: boolean; ip?: string }): Promise<Decision>;
  /** Lowers the cached balance after a spend so a burst of requests cannot overshoot the floor. */
  noteSpend(units: number): void;
  /** True for a configured access code. No budget, cap or kill-switch checks: for free clean-up calls that must still work. */
  accepts(code: string | null): boolean;
  /** True when LIVE_OPEN is on, so a request with no code is served from the project key. */
  isOpen(): boolean;
  /** True when KILL_SWITCH is on. Own-key calls are refused by it too. */
  killed(): boolean;
}

interface Usage {
  day: string;
  analysis: number;
  render: number;
}

export function createBudgetGuard(options: BudgetGuardOptions): BudgetGuard {
  const now = options.now ?? Date.now;
  const usage = new Map<string, Usage>();
  let cached: { value: number; at: number } | null = null;
  let inflight: Promise<number> | null = null;

  const today = () => new Date(now()).toISOString().slice(0, 10);

  function usageFor(hash: string): Usage {
    const day = today();
    const current = usage.get(hash);
    if (current && current.day === day) return current;
    // Open visitors are one record per address: drop yesterday's so the map cannot grow without bound.
    if (usage.size >= MAX_TRACKED_IDENTITIES) for (const [key, u] of usage) if (u.day !== day) usage.delete(key);
    const fresh: Usage = { day, analysis: 0, render: 0 };
    usage.set(hash, fresh);
    return fresh;
  }

  async function balance(): Promise<number | null> {
    if (cached && now() - cached.at < BALANCE_TTL_MS) return cached.value;
    inflight ??= options.getBalance().finally(() => {
      inflight = null;
    });
    try {
      const value = await inflight;
      cached = { value, at: now() };
      return value;
    } catch {
      return null;
    }
  }

  return {
    async decide(code, kind, { cost, reserve, ip }) {
      const config = options.config();
      // A code is compared against every configured one so timing does not reveal which matched. A request with no code
      // is an open visitor when the deployment is open; a wrong code is never downgraded to open.
      let identity: string;
      let who: string;
      if (code) {
        const matches = config.codes.map((candidate) => sameCode(candidate, code));
        if (!matches.some(Boolean)) return { ok: false, reason: "bad_code" };
        identity = who = hashCode(code);
      } else if (config.open) {
        identity = ipKey(ip ?? "unknown");
        who = "open";
      } else {
        return { ok: false, reason: "no_code" };
      }
      if (config.killSwitch) return { ok: false, reason: "kill_switch" };

      const pooled = who === "open" && kind === "analysis";
      const cap = kind === "analysis" ? config.analysisDailyCap : config.renderDailyCap;
      const full = () => usageFor(identity)[kind] >= cap || (pooled && usageFor(OPEN_POOL).analysis >= config.openDailyCap);
      if (full()) return { ok: false, reason: "daily_cap" };

      const units = await balance();
      if (units === null || units - cost <= config.unitFloor) return { ok: false, reason: "budget_floor" };

      // Re-check after the await: another request may have taken the last slot meanwhile.
      if (full()) return { ok: false, reason: "daily_cap" };
      const slot = usageFor(identity);
      const pool = pooled ? usageFor(OPEN_POOL) : null;
      if (reserve) {
        slot[kind] += 1;
        if (pool) pool.analysis += 1;
      }
      return {
        ok: true,
        who,
        release: () => {
          if (!reserve) return;
          if (slot.day === today() && slot[kind] > 0) slot[kind] -= 1;
          if (pool && pool.day === today() && pool.analysis > 0) pool.analysis -= 1;
        },
      };
    },

    noteSpend(units) {
      if (cached) cached = { value: cached.value - units, at: cached.at };
    },

    accepts(code) {
      if (!code) return false;
      return options.config().codes.map((candidate) => sameCode(candidate, code)).some(Boolean);
    },

    isOpen: () => options.config().open,

    killed: () => options.config().killSwitch,
  };
}
