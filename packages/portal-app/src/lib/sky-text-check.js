// The check of the short texts of the bright stars and the constellations
// (`packages/astro-core/sky-data/texts/<locale>.json`) against their facts
// table (`texts/facts.json`): two to four sentences, at most 700 characters,
// and every number the text writes is a value of the facts of its entry, by
// the rule of the published pages of the other targets (`checkTargetText`).
//
//   checkSkyText({ key, locale, text, facts })  the issues of one text
//   skyFactsRow(facts, key)                     an entry as a row of that rule

import { shippedLocales } from "astro-contracts/locales";
import { checkTargetText } from "./target-text-check.js";

/**
 * The languages whose texts are complete: the tests require every key in
 * each, every text checked. It is the registry's list of the shipped
 * languages (`astro-contracts/locales`): a language enters the registry with
 * its file finished, the generator of the table refusing it otherwise.
 */
export const COMPLETE_TEXT_LOCALES = Object.freeze(shippedLocales());

export const skyTextLimits = Object.freeze({
  minimumSentences: 2,
  maximumSentences: 4,
  maximumCharacters: 700,
});

// A sentence ends with « . », « ! », « ? » or « … » followed by a space (a
// closing quote or bracket may come between), or with the full-width marks
// of Chinese and Japanese. A decimal point (« 2.5 ») never ends one.
const sentenceBreak = /(?<=[.!?…][\p{Pf}\p{Pe}"']*)\s+|(?<=[。！？])/u;

/** How many sentences a text holds. */
export function countSentences(text) {
  return String(text || "")
    .trim()
    .split(sentenceBreak)
    .filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

// The facts table writes an area in square degrees; the number reader of
// the rule reads « 1 303 degrés carrés » as degrees.
const checkerUnit = (unit) => (unit === "deg²" ? "deg" : unit || "1");

function numericFacts(value, path, into) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      numericFacts(item, `${path}[${index}]`, into),
    );
    return into;
  }
  if (!value || typeof value !== "object") return into;
  if (typeof value.value === "number" && Number.isFinite(value.value))
    (into[path] ||= []).push({
      value: value.value,
      unit: checkerUnit(value.unit),
      label: value.label ?? path,
    });
  for (const [key, child] of Object.entries(value))
    if (key !== "value")
      numericFacts(child, path ? `${path}.${key}` : key, into);
  return into;
}

/**
 * An entry of the facts table as a row of `checkTargetText`: its names
 * (their digits are not quantities) and every numeric value of the entry
 * and of the common facts.
 */
export function skyFactsRow(facts, key) {
  const entry = facts?.entries?.[key];
  if (!entry) return null;
  const names = [entry.name, entry.bayer?.value].filter(Boolean);
  return {
    id: key,
    designation: names[0] ?? key,
    aliases: names.slice(1),
    facts: numericFacts(
      facts.common || {},
      "common",
      numericFacts(entry, "", {}),
    ),
  };
}

/**
 * The issues of one text: `sentences` (fewer than two or more than four),
 * `length` (over 700 characters), `facts` (no entry for the key), `number`
 * (a number that is not in the entry's facts, with the checker's status).
 */
export function checkSkyText({ key, locale, text, facts }) {
  const issues = [];
  const sentences = countSentences(text);
  if (
    sentences < skyTextLimits.minimumSentences ||
    sentences > skyTextLimits.maximumSentences
  )
    issues.push({ kind: "sentences", sentences });
  const characters = [...String(text || "")].length;
  if (characters > skyTextLimits.maximumCharacters)
    issues.push({ kind: "length", characters });
  const row = skyFactsRow(facts, key);
  if (!row) issues.push({ kind: "facts" });
  else
    for (const issue of checkTargetText({ text, locale, row }).issues)
      issues.push({
        kind: "number",
        raw: issue.raw,
        status: issue.status,
        nearest: issue.nearest ?? null,
      });
  return { ok: issues.length === 0, issues };
}
