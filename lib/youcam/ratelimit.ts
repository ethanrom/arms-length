// Per-address request limits shared by every route: a fixed window per key, held in module memory.
//
// Best effort by design. On a serverless host each warm instance counts separately, so a determined caller can spread
// across instances; the limits stop accidents, loops and casual abuse. The real protection for paid calls is the budget
// guard (access code, daily caps, balance floor, kill switch) in budget.ts.

export interface RateLimit {
  max: number;
  windowMs: number;
}

export interface Limiter {
  /** Counts one request for `key`. Returns 0 when it is allowed, otherwise the seconds until the window resets. */
  hit(key: string, now?: number): number;
  /** Seconds until `key` may try again, without counting a request. 0 when it is under the limit. */
  wait(key: string, now?: number): number;
  reset(): void;
}

const MAX_TRACKED_KEYS = 10_000;

export function createLimiter(limit: RateLimit): Limiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const secondsLeft = (resetAt: number, now: number) => Math.max(1, Math.ceil((resetAt - now) / 1000));

  return {
    hit(key, now = Date.now()) {
      if (windows.size >= MAX_TRACKED_KEYS) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        if (windows.size >= MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value as string);
      }
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + limit.windowMs });
        return 0;
      }
      if (current.count >= limit.max) return secondsLeft(current.resetAt, now);
      current.count++;
      return 0;
    },

    wait(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || current.resetAt <= now || current.count < limit.max) return 0;
      return secondsLeft(current.resetAt, now);
    },

    reset() {
      windows.clear();
    },
  };
}

/** Client address as the host reports it. Vercel overwrites x-forwarded-for; elsewhere it can be spoofed, hence "best effort". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
