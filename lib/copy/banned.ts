/**
 * Words and phrases that must never appear in UI copy (CLAUDE.md "Content rules"). Matched whole-word and
 * case-insensitively by `lintText`. Spaces and hyphens in an entry match either ("anti-aging" also catches
 * "anti aging"). Entries are lowercase.
 *
 * This file lists the words, so the file lint (`lintFiles`) skips it by default.
 */

export type BannedList = "medical" | "shaming" | "trademark";

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
};
