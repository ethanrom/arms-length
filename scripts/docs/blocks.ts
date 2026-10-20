/**
 * Generated blocks in the docs. A block sits between `<!-- generated:NAME:start -->` and `<!-- generated:NAME:end -->`;
 * a script owns its content, so edit the script (or the code it reads), never the block. Pure except `syncFile`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (this file is scripts/docs/blocks.ts). */
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const unix = (s: string): string => s.replace(/\r\n/g, "\n");

/** True when the module at `metaUrl` is the script node was started with (false under vitest and when imported). */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const norm = (p: string) => resolve(p).replace(/\\/g, "/").toLowerCase();
  return norm(entry) === norm(fileURLToPath(metaUrl));
}

const markers = (name: string) => ({ start: `<!-- generated:${name}:start -->`, end: `<!-- generated:${name}:end -->` });

/** The text of a block, trimmed. Throws when the block is missing. */
export function extractBlock(markdown: string, name: string): string {
  const { start, end } = markers(name);
  const text = unix(markdown);
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`generated block "${name}" not found (markers ${start} ... ${end})`);
  return text.slice(a + start.length, b).trim();
}

/** The markdown with the named block's content replaced by `body`. */
export function replaceBlock(markdown: string, name: string, body: string): string {
  const { start, end } = markers(name);
  const text = unix(markdown);
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`generated block "${name}" not found (markers ${start} ... ${end})`);
  return `${text.slice(0, a + start.length)}\n\n${body.trim()}\n\n${text.slice(b)}`;
}

/** Rewrite blocks of a file in place. Returns the names whose content changed. */
export function syncFile(path: string, blocks: Record<string, string>): string[] {
  const before = unix(readFileSync(path, "utf8"));
  let after = before;
  const changed: string[] = [];
  for (const [name, body] of Object.entries(blocks)) {
    if (extractBlock(after, name) !== body.trim()) changed.push(name);
    after = replaceBlock(after, name, body);
  }
  if (after !== before) writeFileSync(path, after);
  return changed;
}

/** Markdown table from a header and rows. Cells must not contain a pipe. */
export function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}
