/**
 * Words and phrases that must never appear in UI copy (CLAUDE.md "Content rules"). Matched whole-word and
 * case-insensitively by `lintText`. Spaces and hyphens in an entry match either ("anti-aging" also catches
 * "anti aging"). Entries are lowercase.
 *
 * This file lists the words, so the file lint (`lintFiles`) skips it by default.
 */

export type BannedList = "medical" | "shaming" | "trademark" | "claims" | "ui";

/** No medical language: we measure visibility, we do not diagnose, treat or promise outcomes. */
export const BANNED_MEDICAL: readonly string[] = [
  "diagnose",
  "diagnoses",
  "diagnosed",
  "diagnosing",
  "diagnosis",
  "treat",
  "treats",
  "treated",
  "treating",
  "treatment",
  "treatments",
  "cure",
  "cures",
  "cured",
  "curing",
  "disease",
  "diseases",
  "condition",
  "conditions",
  "prescription",
  "prescriptions",
  "prescribe",
  "prescribed",
  "rx",
  "clinical",
  "clinically",
  "dermatologist-approved",
  "medical",
  "medically",
  "symptom",
  "symptoms",
];

/** No shaming language: the product is kind and relief-first. */
export const BANNED_SHAMING: readonly string[] = [
  "flaw",
  "flaws",
  "flawed",
  "flawless",
  "imperfection",
  "imperfections",
  "problem area",
  "problem areas",
  "fix your",
  "ugly",
  "bad skin",
  "anti-aging",
  "anti-ageing",
  "defect",
  "defects",
];

/**
 * Health and efficacy claims that read as a promise or a verdict (expert panel, 2026-10-21): the YouCam N/100 line said
 * "higher is healthier", and "pores, nobody notices" turned a measured distance into a guarantee about a person. Applies to
 * UI copy and to the docs alike.
 */
export const BANNED_CLAIMS: readonly string[] = ["healthier", "nobody notices", "where effort pays"];

/**
 * UI copy only: words that are fine in a technical doc but not on a screen. "refine" and "refining" are product-claim verbs
 * (a doc may say "refine the last crossing by bisection"); "age spot" and "acne mark" are YouCam's concern names, which tie
 * a mark to age or to a disease, where our copy says "dark spots" and "breakouts" (lib/copy/concerns.ts).
 */
export const BANNED_UI: readonly string[] = ["refine", "refining", "age spot", "age spots", "acne mark", "acne marks"];

/**
 * Major beauty brands. No third-party trademarks in UI copy. Accented and plain spellings are both listed.
 * "YouCam" and "Perfect Corp" are deliberately absent: they are the API we build on and are credited by name.
 */
export const BANNED_TRADEMARKS: readonly string[] = [
  "sephora",
  "ulta",
  "l'oreal",
  "l'oréal",
  "loreal",
  "maybelline",
  "estee lauder",
  "estée lauder",
  "clinique",
  "lancome",
  "lancôme",
  "neutrogena",
  "cerave",
  "la roche-posay",
  "olay",
  "garnier",
  "nivea",
  "dior",
  "chanel",
  "fenty",
  "glossier",
  "rare beauty",
  "shiseido",
  "sk-ii",
  "covergirl",
  "revlon",
  "mac cosmetics",
  "nyx cosmetics",
  "kiehl's",
  "aveeno",
  "cetaphil",
  "eucerin",
  "clarins",
  "charlotte tilbury",
  "urban decay",
  "drunk elephant",
  "skinceuticals",
  "cosrx",
  "laneige",
];

export const BANNED_LISTS: Record<BannedList, readonly string[]> = {
  medical: BANNED_MEDICAL,
  shaming: BANNED_SHAMING,
  trademark: BANNED_TRADEMARKS,
  claims: BANNED_CLAIMS,
  ui: BANNED_UI,
};

/** The lists every text must pass: no medical or shaming language, no trademarks, no claims. */
export const CORE_LISTS: readonly BannedList[] = ["medical", "shaming", "trademark", "claims"];

/** Lists for UI copy: all of them. */
export const UI_LISTS: readonly BannedList[] = [...CORE_LISTS, "ui"];

/** Lists for docs: the softer set. A doc may name YouCam's own concern names or "refine" a number; it may not make a claim. */
export const DOC_LISTS: readonly BannedList[] = CORE_LISTS;
