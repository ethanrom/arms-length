/** Parsing of the model's JSON replies and the small statistics used by the report. Pure functions. */

/** The first balanced {...} object in the text (strings and escapes respected), parsed; null if none parses. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, "");
  for (let start = s.indexOf("{"); start >= 0; start = s.indexOf("{", start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const v: unknown = JSON.parse(s.slice(start, i + 1));
          if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
        } catch {
          /* try the next opening brace */
        }
        break;
      }
    }
  }
  return null;
}

/**
 * A distance in metres from whatever the model put in the field: a number, null, "null", or a string such as "1.5 m",
 * "~2", "40 cm". Undefined when it cannot be read as a single distance (ranges, prose).
 */
export function toMetres(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (t === "" || /^(null|none|n\/a|absent|not present)$/.test(t)) return null;
  if (/\d\s*(-|–|to)\s*\d/.test(t)) return undefined;
  const m = /^[~≈<>]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)?\b/.exec(t);
  if (!m) return undefined;
  const x = parseFloat(m[1]);
  const unit = m[2] ?? "m";
  return unit === "mm" ? x / 1000 : unit === "cm" ? x / 100 : x;
}

export function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const n = a.length;
  return n === 0 ? NaN : n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export interface Spread {
  n: number;
  median: number;
  min: number;
  max: number;
  mean: number;
  /** Sample standard deviation over the mean (n - 1 in the denominator); NaN for n < 2 or a zero mean. */
  cv: number;
}

export function spread(xs: number[]): Spread {
  const n = xs.length;
  if (n === 0) return { n, median: NaN, min: NaN, max: NaN, mean: NaN, cv: NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  return { n, median: median(xs), min: Math.min(...xs), max: Math.max(...xs), mean, cv: mean > 0 ? sd / mean : NaN };
}

/** How many times too far (> 1) or too near (< 1) an answer is, relative to a reference distance. */
export const factor = (answer: number, reference: number): number => answer / reference;

/** Factor by which an answer misses the interval [lo, hi]: 1 inside it, otherwise the ratio to the nearest edge (always >= 1). */
export function factorOutside(answer: number, lo: number, hi: number): number {
  if (answer >= lo && answer <= hi) return 1;
  return answer < lo ? lo / answer : answer / hi;
}

export function geometricMean(xs: number[]): number {
  return Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
}
