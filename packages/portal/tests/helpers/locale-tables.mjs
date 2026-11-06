// Finds the copy tables kept outside the catalogues: every object literal of
// a source file keyed by at least two shipped locale tags (`{ en, fr, ja }`,
// `{ en: "Nebula", ja: "星雲" }`), read line by line from the sources as
// Prettier writes them (no parser: JSX components read as they are).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

/** Every `.js`, `.mjs`, `.ts` source file under `directory`. */
export function sourceFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "dist")
        files.push(...sourceFiles(path));
    } else if ([".js", ".mjs", ".ts", ".tsx"].includes(extname(name)))
      files.push(path);
  }
  return files.sort();
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A property key that is one of `tags`, bare or quoted, at its start. */
function keyPattern(tags) {
  const alternatives = tags
    .map((tag) =>
      /^[A-Za-z_$][\w$]*$/.test(tag)
        ? `${escaped(tag)}|"${escaped(tag)}"|'${escaped(tag)}'`
        : `"${escaped(tag)}"|'${escaped(tag)}'`,
    )
    .join("|");
  return alternatives;
}

function unquoted(key) {
  return key.replace(/^["']|["']$/g, "");
}

const indentOf = (line) => line.match(/^\s*/)[0].length;

/** The names of the blocks that enclose line `index`: `copy.acquisition`. */
function labelOf(lines, index) {
  const parts = [];
  let indent = indentOf(lines[index]);
  for (let current = index - 1; current >= 0 && indent > 0; current -= 1) {
    const line = lines[current];
    if (!line.trim() || indentOf(line) >= indent) continue;
    indent = indentOf(line);
    const name =
      line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)/)?.[1] ??
      line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/)?.[1] ??
      line.match(/^\s*["']?([^"':\s]+)["']?\s*:/)?.[1];
    if (name) parts.unshift(name);
  }
  return parts.join(".") || "(top level)";
}

/**
 * The locale-keyed tables of `file`: `{ label, line, locales }`, where
 * `locales` are the table's keys that are tags of `localeTags`. The sources
 * are formatted by Prettier, so a table spread over several lines has one
 * key per line at one indentation, and a short one sits on a single line.
 */
export function localeTables(file, localeTags) {
  const lines = readFileSync(file, "utf8").split("\n");
  const keys = keyPattern(localeTags);
  const lineKey = new RegExp(`^(\\s*)(${keys})\\s*:`);
  const inlineObject = /\{[^{}]*\}/g;
  const inlineKey = new RegExp(`(?:^\\{|,)\\s*(${keys})\\s*:`, "g");
  const tables = [];
  const open = new Map();
  const close = (indent) => {
    for (const [level, group] of [...open]) {
      if (level <= indent) continue;
      if (group.locales.length >= 2) tables.push(group);
      open.delete(level);
    }
  };
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const indent = indentOf(line);
    close(indent);
    const match = line.match(lineKey);
    if (match) {
      const group = open.get(indent) ?? {
        label: labelOf(lines, index),
        line: index + 1,
        locales: [],
      };
      group.locales.push(unquoted(match[2]));
      open.set(indent, group);
    }
    for (const object of line.match(inlineObject) || []) {
      const found = [...object.matchAll(inlineKey)].map((entry) =>
        unquoted(entry[1]),
      );
      if (found.length >= 2)
        tables.push({
          label: `${labelOf(lines, index)}${match ? "" : ""}`,
          line: index + 1,
          locales: found,
        });
    }
  });
  close(-1);
  return tables.sort((left, right) => left.line - right.line);
}

/** `path` relative to `root`, with forward slashes. */
export function relativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

/**
 * The accidental fallback the copy tables no longer use: `table[locale] ||
 * table.en` (or `?? table.fr`). Each match is `{ line, text }`.
 */
export function accidentalFallbacks(file) {
  const pattern = /(\w+)\[(locale|language|lang)\]\s*(\|\||\?\?)\s*\1\.\w+/;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => pattern.test(text));
}

/**
 * Checks the copy tables of `files` against the inventory: every file with a
 * table is listed (`inventory[path]`), and every table of a `copy` file has
 * every shipped locale but those the inventory lets it lack. Returns the
 * problems found, as sentences.
 */
export function copyTableProblems({ root, files, inventory, localeTags }) {
  const problems = [];
  for (const file of files) {
    const path = relativePath(root, file);
    const tables = localeTables(file, localeTags);
    const entry = inventory[path];
    if (!tables.length) {
      if (entry)
        problems.push(
          `${path} is in the inventory but holds no locale-keyed table.`,
        );
      continue;
    }
    if (!entry) {
      problems.push(
        `${path} holds a locale-keyed table (${tables[0].label}, line ${tables[0].line}) that is not in the copy-table inventory.`,
      );
      continue;
    }
    if (entry.kind !== "copy") continue;
    for (const table of tables) {
      const allowed = new Set([
        ...(entry.implicit || []),
        ...(entry.lacks?.[table.label] || []),
      ]);
      const missing = localeTags.filter(
        (tag) => !table.locales.includes(tag) && !allowed.has(tag),
      );
      if (missing.length)
        problems.push(
          `${path} ${table.label} (line ${table.line}) has no ${missing.join(", ")} entry.`,
        );
    }
    for (const { line, text } of accidentalFallbacks(file))
      problems.push(
        `${path}:${line} falls back by accident (${text}); use copyFor.`,
      );
  }
  for (const path of Object.keys(inventory))
    if (!files.some((file) => relativePath(root, file) === path))
      problems.push(`${path} is in the inventory but was not scanned.`);
  return problems;
}
