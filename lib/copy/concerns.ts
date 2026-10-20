/**
 * Plain-language names and one-line explainers for each concern. Neutral: what it is, no judgement,
 * no medical framing. British spelling, to match the rest of the copy.
 */
import type { ConcernId } from "@/lib/contracts/concerns";

export interface ConcernCopy {
  singular: string;
  plural: string;
  /**
   * "plural" nouns (pores) take "are" and "them"; "singular" ones (redness, puffiness: mass nouns, and
   * texture) take "is" and "it". For mass nouns `singular` and `plural` are the same string.
   */
  agreement: "plural" | "singular";
  /** One neutral sentence: what it is. */
  explainer: string;
}

/**
 * Naming choices:
 * - age_spot is "dark spots": says what you see, and does not tie a mark to getting older.
 * - acne is "breakouts", not "blemishes". A blemish is literally a mark that spoils something; a breakout is
 *   something that happens and passes, which is also what the acne mask picks up (active spots).
 * - wrinkle is "lines": the everyday word, with no ageing subtext.
 */
export const CONCERN_COPY: Record<ConcernId, ConcernCopy> = {
  pore: {
    singular: "pore",
    plural: "pores",
    agreement: "plural",
    explainer: "Pores are the tiny openings in the skin where natural oil reaches the surface. Everyone has them.",
  },
  age_spot: {
    singular: "dark spot",
    plural: "dark spots",
    agreement: "plural",
    explainer: "Small flat patches a shade darker than the skin around them, more common after years of sun.",
  },
  acne: {
    singular: "breakout",
    plural: "breakouts",
    agreement: "plural",
    explainer: "Small bumps or reddish spots that tend to come and go.",
  },
  wrinkle: {
    singular: "line",
    plural: "lines",
    agreement: "plural",
    explainer: "Creases where the skin folds as your face moves, most often around the eyes, mouth and forehead.",
  },
  dark_circle: {
    singular: "under-eye shadow",
    plural: "under-eye shadows",
    agreement: "plural",
    explainer: "A darker tone in the skin under the eyes, shaped by how light falls on the face as well as by skin colour.",
  },
  eye_bag: {
    singular: "under-eye puffiness",
    plural: "under-eye puffiness",
    agreement: "singular",
    explainer: "A soft fullness under the eyes, where the surface curves out and catches light and shadow.",
  },
  redness: {
    singular: "redness",
    plural: "redness",
    agreement: "singular",
    explainer: "Areas where the skin looks pinker or redder than the skin around it, often on the cheeks and around the nose.",
  },
  texture: {
    singular: "skin texture",
    plural: "skin texture",
    agreement: "singular",
    explainer: "The fine surface pattern of the skin. It is not a single mark, so we do not turn it into a distance.",
  },
};

export function concernName(id: ConcernId, form: "singular" | "plural" = "plural"): string {
  return CONCERN_COPY[id][form];
}

/** The form that reads naturally after "your": "your pores", "your redness". */
export function concernNoun(id: ConcernId): string {
  const c = CONCERN_COPY[id];
  return c.agreement === "plural" ? c.plural : c.singular;
}

export function concernExplainer(id: ConcernId): string {
  return CONCERN_COPY[id].explainer;
}

export const concernBe = (id: ConcernId): "is" | "are" => (CONCERN_COPY[id].agreement === "plural" ? "are" : "is");
export const concernThem = (id: ConcernId): "it" | "them" => (CONCERN_COPY[id].agreement === "plural" ? "them" : "it");
