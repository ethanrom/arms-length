import { afterEach, describe, expect, test, vi } from "vitest";
import { configFromEnv, createBudgetGuard, hashCode, writeLedger, type GuardConfig } from "./budget";

const config: GuardConfig = {
  codes: ["judge-alpha", "judge-beta"],
  killSwitch: false,
  unitFloor: 100,
  analysisDailyCap: 3,
  renderDailyCap: 5,
};

function guard(overrides: Partial<GuardConfig> = {}, balance: () => Promise<number> = async () => 500) {
  let clock = Date.UTC(2026, 10, 1, 12);
  const getBalance = vi.fn(balance);
  const g = createBudgetGuard({ config: () => ({ ...config, ...overrides }), getBalance, now: () => clock });
  return { g, getBalance, advance: (ms: number) => void (clock += ms) };
}

const analysis = { cost: 16, reserve: true };

afterEach(() => vi.restoreAllMocks());

describe("budget guard", () => {
  test("refuses in a fixed order: no code, bad code, kill switch, daily cap, balance floor", async () => {
    const reason = async (g: ReturnType<typeof guard>["g"], code: string | null) => {
      const decision = await g.decide(code, "analysis", analysis);
      return decision.ok ? "ok" : decision.reason;
    };
    expect(await reason(guard().g, null)).toBe("no_code");
    expect(await reason(guard().g, "wrong")).toBe("bad_code");
    expect(await reason(guard({ codes: [] }).g, "judge-alpha")).toBe("bad_code");
    expect(await reason(guard({ killSwitch: true }).g, "judge-alpha")).toBe("kill_switch");
    expect(await reason(guard().g, "judge-beta")).toBe("ok");

    // 115 units left, 16 to spend: 99 would be under the floor of 100.
    expect(await reason(guard({}, async () => 115).g, "judge-alpha")).toBe("budget_floor");
    expect(await reason(guard({}, async () => 117).g, "judge-alpha")).toBe("ok");
  });

  test("balance is cached for 60 s, shared by concurrent calls, and an unreadable balance fails closed", async () => {
    const { g, getBalance, advance } = guard();
    await Promise.all([g.decide("judge-alpha", "analysis", analysis), g.decide("judge-beta", "analysis", analysis)]);
    expect(getBalance).toHaveBeenCalledTimes(1);
    advance(59_000);
    await g.decide("judge-alpha", "analysis", analysis);
    expect(getBalance).toHaveBeenCalledTimes(1);
    advance(2_000);
    await g.decide("judge-alpha", "analysis", analysis);
    expect(getBalance).toHaveBeenCalledTimes(2);

    // A spend lowers the cached balance at once, so a burst cannot overshoot the floor.
    const burst = guard({}, async () => 130);
    expect((await burst.g.decide("judge-alpha", "analysis", analysis)).ok).toBe(true);
    burst.g.noteSpend(16);
    expect(await burst.g.decide("judge-alpha", "analysis", analysis)).toEqual({ ok: false, reason: "budget_floor" });

    const broken = guard({}, async () => {
      throw new Error("credit endpoint down");
    });
    expect(await broken.g.decide("judge-alpha", "analysis", analysis)).toEqual({ ok: false, reason: "budget_floor" });
  });

  test("each code gets 3 live analyses a day; releasing a slot, peeking and the next day behave", async () => {
    const { g, advance } = guard();
    const slots = [];
    for (let i = 0; i < 3; i++) slots.push(await g.decide("judge-alpha", "analysis", analysis));
    expect(slots.every((s) => s.ok)).toBe(true);
    expect(await g.decide("judge-alpha", "analysis", analysis)).toEqual({ ok: false, reason: "daily_cap" });
    expect((await g.decide("judge-beta", "analysis", analysis)).ok).toBe(true); // other code is unaffected

    const first = slots[0];
    if (first.ok) first.release(); // the call failed before any unit was spent
    expect((await g.decide("judge-alpha", "analysis", { cost: 16, reserve: false })).ok).toBe(true); // peek only
    expect((await g.decide("judge-alpha", "analysis", analysis)).ok).toBe(true);
    expect((await g.decide("judge-alpha", "analysis", analysis)).ok).toBe(false);

    // Renders have their own, larger cap.
    expect((await g.decide("judge-alpha", "render", { cost: 1, reserve: true })).ok).toBe(true);

    advance(24 * 3_600_000);
    expect((await g.decide("judge-alpha", "analysis", analysis)).ok).toBe(true);
  });

  test("config comes from env with safe defaults", () => {
    expect(configFromEnv({})).toEqual({
      codes: [],
      killSwitch: false,
      unitFloor: 100,
      analysisDailyCap: 3,
      renderDailyCap: 20,
    });
    expect(configFromEnv({ LIVE_ACCESS_CODES: " a , b,,", KILL_SWITCH: "1", UNIT_FLOOR: "250", LIVE_DAILY_CAP: "5" })).toMatchObject({
      codes: ["a", "b"],
      killSwitch: true,
      unitFloor: 250,
      analysisDailyCap: 5,
    });
    expect(configFromEnv({ UNIT_FLOOR: "lots" })).toMatchObject({ unitFloor: 100 });
  });

  test("the kill switch fails safe: any value but empty, 0, false, no or off engages it", () => {
    const on = (value: string | undefined) => configFromEnv({ KILL_SWITCH: value }).killSwitch;
    for (const value of ["1", "true", "TRUE", " yes ", "on", "enabled", "x"]) expect(on(value)).toBe(true);
    for (const value of [undefined, "", "  ", "0", "false", "No", "off"]) expect(on(value)).toBe(false);
  });

  test("UNIT_FLOOR can raise the reserve but never lower it below 100", () => {
    for (const value of ["0", "50", "99", "-5", "", "lots", undefined]) {
      expect(configFromEnv({ UNIT_FLOOR: value }).unitFloor).toBe(100);
    }
    expect(configFromEnv({ UNIT_FLOOR: "100" }).unitFloor).toBe(100);
    expect(configFromEnv({ UNIT_FLOOR: "400" }).unitFloor).toBe(400);
  });

  test("the ledger line is one JSON object with a hashed code, never the code itself", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    writeLedger({ action: "skin_analysis_hd", units: 16, codeHash: hashCode("judge-alpha") });
    writeLedger({ action: "makeup_vto", units: 1, codeHash: hashCode("judge-alpha"), maybe: true });

    expect(log).toHaveBeenCalledTimes(2);
    const line = String(log.mock.calls[0][0]);
    expect(line).not.toContain("judge-alpha");
    const entry = JSON.parse(line);
    expect(entry).toMatchObject({ type: "ledger", action: "skin_analysis_hd", units: 16, code_hash: hashCode("judge-alpha") });
    expect(entry.code_hash).toMatch(/^[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
    expect(JSON.parse(String(log.mock.calls[1][0])).maybe).toBe(true);
  });
});
