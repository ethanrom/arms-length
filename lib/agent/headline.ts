/**
 * What a moment's headline may not say, and the style guides the prompt shows. One list, used by the prompt (so the model is told)
 * and by the verifier (so it is held to it). A headline sits alone under a picture, so the plan's own jargon, a push, a dead end or an
 * invented position must not reach it. The tools' wording ("free change", "lever") is for the detail view, not for this sentence.
 */

export interface ForbiddenPhrase {
  re: RegExp;
  /** How the prompt names it. */
  shown: string;
}

export const HEADLINE_FORBIDDEN: ForbiddenPhrase[] = [
  { re: /\bfree (?:change|fix)\b/i, shown: '"free change", "free fix"' },
  { re: /\blevers?\b/i, shown: '"lever"' },
  { re: /\bthe (?:measurements?|model)\b/i, shown: '"the measurements", "the model"' },
  { re: /\bsimply\b/i, shown: '"simply"' },
  { re: /\b(?:only|one|single) (?:option|thing|way)\b/i, shown: '"only option", "only thing", "one option"' },
  { re: /\bno\b[^.;:]*\bhides?\b/i, shown: '"no ... hides"' },
  { re: /\b(?:can['’]t|cannot|can not|won['’]t|would not|wouldn['’]t|will not|does not|doesn['’]t|did not|didn['’]t|do not|don['’]t) (?:really )?(?:change|help|hide|alter)\b/i, shown: "\"can't change\", \"doesn't change that\", \"would not help\"" },
  { re: /\bnothing (?:can|will)\b/i, shown: '"nothing can"' },
  { re: /\b(?:back|front) (?:of the room|row)\b|\bby the door\b/i, shown: '"back of the room", "front row" (the scene gives a distance, not a position)' },
];

/** Style guides for the prompt. Not templates: the verifier rejects a headline that copies one, and every fact must come from the tools. */
export const HEADLINE_STYLE_GUIDES = [
  "On the call, your pores and fine lines don't come through the video.",
  "On the call, only the darker spots come through; moving the laptop back a little softens them.",
  "Close up in bright window light, more of your skin shows; if you'd like it softer, this is the moment for a light touch.",
  "Across the table in evening light, pores fade from view and the rest looks soft.",
] as const;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const GUIDES = new Set(HEADLINE_STYLE_GUIDES.map(normalise));

/** The first forbidden phrase in a headline, or null. */
export function forbiddenInHeadline(text: string): string | null {
  for (const { re } of HEADLINE_FORBIDDEN) {
    const match = text.match(re);
    if (match) return match[0];
  }
  return null;
}

export const copiesStyleGuide = (text: string): boolean => GUIDES.has(normalise(text));

// ---------------------------------------------------------------------------------------------------------------
// Filler polish
// ---------------------------------------------------------------------------------------------------------------

// "just" is always the adverb here ("just as it is", "just what they will see"); "justice" and "adjust" are other words.
const FILLER_AT_SENTENCE_START = /(^|[.!?]["')]*\s+)(?:simply|just|really)\b,?\s*([a-z])/gi;
const FILLER = /\s*\b(?:simply|just|really)\b,?/gi;

/**
 * Removes the filler words "simply", "just" and "really" from model-written text, then tidies the spaces and punctuation the
 * removal leaves; a sentence that began with one keeps its capital. Deterministic, and it touches no other word and no digit, so a
 * quote copied into the text stays verbatim. It runs before the verifier so a filler word does not cost a repair round; the
 * banned-phrase checks still apply to whatever it leaves. `removed` is how many fillers went.
 */
export function polishText(text: string): { text: string; removed: number } {
  let removed = 0;
  const count = (m: string) => {
    removed++;
    return m;
  };
  const out = text
    .replace(FILLER_AT_SENTENCE_START, (m, lead: string, letter: string) => {
      count(m);
      return `${lead}${letter.toUpperCase()}`;
    })
    .replace(FILLER, (m) => {
      count(m);
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])([.!?])/g, "$2")
    .replace(/^[\s,;:]+/, "")
    .trim();
  return removed === 0 ? { text, removed: 0 } : { text: out, removed };
}

/**
 * A headline over the limit is cut at its last semicolon (the second clause is the offer, the first is the relief), when that leaves a
 * sentence that fits. Nothing else is shortened: a long sentence with no clause to spare is left for the verifier.
 */
export function fitHeadline(text: string, max: number): string {
  let out = text;
  while (out.length > max) {
    const cut = out.lastIndexOf(";");
    if (cut < 20) return text;
    out = `${out.slice(0, cut).trimEnd().replace(/[,:]$/, "")}.`;
  }
  return out;
}
