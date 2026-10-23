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
  { re: /\b(?:can['’]t|cannot|can not|won['’]t) (?:change|help|hide)\b/i, shown: '"can\'t change"' },
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
