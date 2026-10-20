/**
 * The copy linter: finds banned words (lib/copy/banned.ts) in text. Whole-word, case-insensitive.
 * `lintText` is pure and safe anywhere. `lintFiles` reads the disk (Node only); it is for CI tests and is
 * not re-exported from `lib/copy/index.ts`, so client bundles never see it.
 *
 * Two strengths: UI copy gets every list (`UI_LISTS`); docs get the softer set (`DOC_LISTS`), because a doc may name
 * YouCam's own concern names or "refine" a number, though it may not make a claim. Until the old names are gone from
 * app/ and lib/mock/, the default for both functions is the core set; ask for `UI_LISTS` where it matters.
 */
import { BANNED_LISTS, CORE_LISTS, DOC_LISTS, type BannedList } from "./banned";

export interface Violation {
  /** The banned entry that matched, lowercase as listed (e.g. "flaw"), not the text's own casing. */
  word: string;
  list: BannedList;
  /** Index of the match in the linted text. */
  index: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A match must not touch a letter, digit or underscore. Hyphens are boundaries ("pre-treatment" is caught).
const BEFORE = String.raw`(?<![\p{L}\p{N}_])`;
const AFTER = String.raw`(?![\p{L}\p{N}_])`;

function compile(entry: string): RegExp {
  const body = entry
    .split(/[\s-]+/)
    .map((piece) => escapeRe(piece).replace(/'/g, "['’]"))
    .join(String.raw`[\s-]+`);
  return new RegExp(`${BEFORE}${body}${AFTER}`, "giu");
}

const PATTERNS = (Object.entries(BANNED_LISTS) as [BannedList, readonly string[]][]).flatMap(([list, words]) =>
  words.map((word) => ({ word, list, re: compile(word) })),
);

/**
 * `lists` defaults to `CORE_LISTS`: medical, shaming, trademark and claims. Pass `UI_LISTS` for text a user reads on screen,
 * which adds the old concern names ("age spots", "acne marks") and the "refine" verbs.
 * TODO(integrator): flip the default to `UI_LISTS` with `lintFiles` once the pending renames are done (see lintFiles).
 */
export function lintText(text: string, lists: readonly BannedList[] = CORE_LISTS): Violation[] {
  const out: Violation[] = [];
  for (const { word, list, re } of PATTERNS) {
    if (!lists.includes(list)) continue;
    for (const m of text.matchAll(re)) out.push({ word, list, index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

export interface FileViolation extends Violation {
  file: string;
  line: number;
  column: number;
}

export interface LintFilesOptions {
  cwd?: string;
  /** Path substrings to skip (forward slashes). Defaults skip dependencies, build output, tests and the word lists. */
  ignore?: string[];
  /**
   * Which lists to check. Defaults to `CORE_LISTS`. TODO(integrator): make the default `UI_LISTS` once the last "age spots" and
   * "acne marks" strings in app/ and lib/mock/ are renamed (pass `UI_LISTS` to enforce it now); use `DOC_LISTS` for docs.
   */
  lists?: readonly BannedList[];
}

const DEFAULT_IGNORE = ["node_modules/", ".next/", "lib/copy/banned.ts", ".test.ts", ".test.tsx", ".spec.ts"];
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const JSON_FILE = /\.json$/;

/**
 * What users can read: pages, components (the capture flow included), route handlers (string literals only), the mock
 * sentences, our own copy, and recorded JSON served from public/ (string values only, so image data is skipped).
 */
export const DEFAULT_COPY_GLOBS: readonly string[] = [
  "app/**/*.{ts,tsx}",
  "components/**/*.{ts,tsx}",
  "lib/mock/**/*.ts",
  "lib/copy/**/*.ts",
  "public/**/*.json",
];

/** Docs and the README staging file, checked with `DOC_LISTS`. */
export const DOC_GLOBS: readonly string[] = ["docs/**/*.md", "README.md"];

/** An opaque string (a data URL, base64, a hash) is not copy and would only produce false whole-word matches. */
const isOpaque = (text: string) => text.startsWith("data:") || (text.length >= 120 && !/\s/.test(text));

interface Segment {
  text: string;
  offset: number;
}

/** Blank out comments (keeping offsets) and collect string literals and JSX text: the parts users can read. */
export function extractCopySegments(source: string): Segment[] {
  const segments: Segment[] = [];
  const code = source.split("");
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") code[i++] = " ";
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i++) code[i] = source[i] === "\n" ? "\n" : " ";
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let text = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") {
          text += source[j++];
          if (j >= source.length) break;
        } else if (c !== "`" && source[j] === "\n") break;
        text += source[j++];
      }
      // Template expressions are code, not copy: blank them so identifiers like `${condition}` don't match.
      segments.push({ text: c === "`" ? blankTemplateExpressions(text) : text, offset: i + 1 });
      i = j + 1;
    } else i++;
  }
  const blanked = code.join("");
  // JSX text runs from ">" to the next "<" or "{". A ";" or "=" means it was code (an arrow, a comparison).
  for (const m of blanked.matchAll(/>([^<>{};=]*\p{L}[^<>{};=]*)(?=[<{])/gu)) {
    segments.push({ text: m[1], offset: m.index + 1 });
  }
  return segments;
}

function blankTemplateExpressions(text: string): string {
  let out = "";
  let depth = 0;
  for (let k = 0; k < text.length; k++) {
    if (depth === 0 && text[k] === "$" && text[k + 1] === "{") {
      depth = 1;
      out += "  ";
      k++;
    } else if (depth > 0) {
      if (text[k] === "{") depth++;
      else if (text[k] === "}") depth--;
      out += " ";
    } else out += text[k];
  }
  return out;
}

/**
 * Lint files matched by globs (default: `DEFAULT_COPY_GLOBS`). Source files (.ts, .tsx, .js, ...) are checked for string
 * literals and JSX text only, so identifiers like `condition` in code don't trip it; JSON for string values only;
 * other files (md, html) in full.
 */
export async function lintFiles(globs: readonly string[] = DEFAULT_COPY_GLOBS, options: LintFilesOptions = {}): Promise<FileViolation[]> {
  const { glob, readFile } = await import("node:fs/promises");
  const { relative, resolve } = await import("node:path");
  const cwd = resolve(options.cwd ?? process.cwd());
  const ignore = options.ignore ?? DEFAULT_IGNORE;

  const files = new Set<string>();
  for await (const entry of glob([...globs], { cwd, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const rel = relative(cwd, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/");
    if (!ignore.some((part) => rel.includes(part))) files.add(rel);
  }

  const out: FileViolation[] = [];
  for (const file of [...files].sort()) {
    const text = await readFile(resolve(cwd, file), "utf8");
    const segments =
      CODE_FILE.test(file) || JSON_FILE.test(file)
        ? extractCopySegments(text).filter((seg) => !isOpaque(seg.text))
        : [{ text, offset: 0 }];
    const found = new Map<string, FileViolation>();
    for (const seg of segments) {
      for (const v of lintText(seg.text, options.lists ?? CORE_LISTS)) {
        const index = seg.offset + v.index;
        const before = text.slice(0, index);
        found.set(`${index}:${v.word}`, {
          ...v,
          index,
          file,
          line: before.split("\n").length,
          column: index - before.lastIndexOf("\n"),
        });
      }
    }
    out.push(...[...found.values()].sort((a, b) => a.index - b.index));
  }
  return out;
}

/** Docs and the README staging file, with the softer list. */
export function lintDocs(options: Omit<LintFilesOptions, "lists"> = {}): Promise<FileViolation[]> {
  return lintFiles(DOC_GLOBS, { ...options, lists: DOC_LISTS });
}
