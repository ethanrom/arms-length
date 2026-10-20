/**
 * Plain-language names and one-line explainers for each concern. Neutral: what it is, no judgement,
 * no medical framing. British spelling, to match the rest of the copy.
 */
import type { ConcernId } from "@/lib/contracts/concerns";

export interface ConcernCopy {
  /** The one name used for a card, a mask label or a share line: capitalised, plural. Everywhere in the product, no synonyms. */
  title: string;
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
 * - wrinkle is "fine lines": the everyday word, with no ageing subtext.
 * - one noun per concern everywhere (expert panel, 2026-10-21): Dark spots, Breakouts, Pores, Fine lines, Under-eye shadows,
 *   Under-eye puffiness, Redness. Never "age spots", "acne marks", "dark circles" or "eye bags" in copy; the linter catches
 *   the first two. "Dark circles" stays a search and alt-text term only.
 */
export const CONCERN_COPY: Record<ConcernId, ConcernCopy> = {
  pore: {
    title: "Pores",
    singular: "pore",
    plural: "pores",
    agreement: "plural",
    explainer: "Pores are the tiny openings in the skin where natural oil reaches the surface. Everyone has them.",
  },
  age_spot: {
    title: "Dark spots",
    singular: "dark spot",
    plural: "dark spots",
    agreement: "plural",
    explainer: "Small flat patches a shade darker than the skin around them.",
  },
  acne: {
    title: "Breakouts",
    singular: "breakout",
    plural: "breakouts",
    agreement: "plural",
    explainer: "Small bumps or reddish spots that tend to come and go.",
  },
  wrinkle: {
    title: "Fine lines",
    singular: "fine line",
    plural: "fine lines",
    agreement: "plural",
    explainer: "Fine creases where the skin folds as your face moves, most often around the eyes, mouth and forehead.",
  },
  dark_circle: {
    title: "Under-eye shadows",
    singular: "under-eye shadow",
    plural: "under-eye shadows",
    agreement: "plural",
    explainer: "A darker tone in the skin under the eyes, shaped by how light falls on the face as well as by skin colour.",
  },
  eye_bag: {
    title: "Under-eye puffiness",
    singular: "under-eye puffiness",
    plural: "under-eye puffiness",
    agreement: "singular",
    explainer: "A soft fullness under the eyes, where the surface curves out and catches light and shadow.",
  },
  redness: {
    title: "Redness",
    singular: "redness",
    plural: "redness",
    agreement: "singular",
    explainer: "Areas where the skin looks pinker or redder than the skin around it, often on the cheeks and around the nose.",
  },
  texture: {
    title: "Skin texture",
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

/** "Dark spots": the capitalised plural for a heading, a mask label or a share line. */
export function concernTitle(id: ConcernId): string {
  return CONCERN_COPY[id].title;
}

export function concernExplainer(id: ConcernId): string {
  return CONCERN_COPY[id].explainer;
}

export const concernBe = (id: ConcernId): "is" | "are" => (CONCERN_COPY[id].agreement === "plural" ? "are" : "is");
export const concernThem = (id: ConcernId): "it" | "them" => (CONCERN_COPY[id].agreement === "plural" ? "them" : "it");
