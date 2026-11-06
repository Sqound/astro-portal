import { CAPABILITY_UNLIMITED } from "astro-contracts/capabilities";
import { normalizeSearch } from "../../i18n.js";
import { PUBLIC_GALLERY_TAGS } from "../../captures/public-capture-view.js";
import { localizedTag } from "../gallery/gallery-tags.js";

/**
 * What the list of « Mon espace › Captures » computes from the service's
 * page, kept apart from the components so that a test reads it without
 * drawing: the chips of the
 * filter bar, the captures a chip, a search and the order keep, the counter,
 * the state of the space line, and the words of a card.
 */

/** The night of a capture (`YYYY-MM-DD`), else the day it was added. */
const dayOf = (capture) =>
  capture.detail?.night || String(capture.createdAt || "").slice(0, 10);

/**
 * The chips after « Toutes »: the generic labels present, in the public
 * gallery's order and translated, then the owner's own tags in their first
 * order; a word shown twice is one chip. Each chip is `{ key, label }`.
 */
export function captureChips(captures, locale) {
  const chips = [];
  const seen = new Set();
  // A capture's default generic tag is among its stored tags too; either
  // way the chip is the generic one, translated.
  const present = new Set(
    captures.flatMap((capture) => [
      capture.galleryLabel,
      ...(capture.tags ?? []),
    ]),
  );
  for (const tag of PUBLIC_GALLERY_TAGS)
    if (present.has(tag)) {
      const label = localizedTag(tag, locale);
      if (!seen.has(label)) {
        seen.add(label);
        chips.push({ key: `label:${tag}`, label });
      }
    }
  for (const capture of captures)
    for (const tag of capture.tags ?? [])
      if (!PUBLIC_GALLERY_TAGS.includes(tag)) {
        const label = localizedTag(tag, locale);
        if (!seen.has(label)) {
          seen.add(label);
          chips.push({ key: `own:${tag}`, label });
        }
      }
  return chips;
}

/** The words a search compares: designations, names, aliases. */
function searchable(capture) {
  const words = [];
  for (const target of capture.targets ?? [])
    words.push(target.designation, target.name, ...(target.aliases ?? []));
  for (const target of capture.detail?.targets ?? [])
    words.push(target.designation, target.name);
  return words.filter(Boolean);
}

/**
 * The captures a chip (`""` for « Toutes »), a search and an order keep:
 * `oldestFirst` reverses « Plus récentes » (by night, else by day added).
 */
export function filteredCaptures(
  captures,
  { chip = "", query = "", oldestFirst = false, locale = "en" } = {},
) {
  const wanted = normalizeSearch(query.trim(), locale);
  const kept = captures.filter((capture) => {
    if (chip) {
      const label =
        capture.galleryLabel && localizedTag(capture.galleryLabel, locale);
      if (
        label !== chip &&
        !(capture.tags ?? []).some((tag) => localizedTag(tag, locale) === chip)
      )
        return false;
    }
    if (!wanted) return true;
    return searchable(capture).some((word) =>
      normalizeSearch(word, locale).includes(wanted),
    );
  });
  const order = (left, right) =>
    dayOf(right).localeCompare(dayOf(left)) ||
    String(right.createdAt).localeCompare(String(left.createdAt));
  return kept.sort((left, right) =>
    oldestFirst ? order(right, left) : order(left, right),
  );
}

/**
 * What the lines of « Intégrations » of a capture come to, as one string: two
 * captures with the same signature show the same lines. « Synchroniser avec
 * la session » compares the signature before and after to say whether it took
 * anything.
 */
export function integrationSignature(capture) {
  const acquisition = capture?.metadata?.acquisition ?? {};
  return JSON.stringify([
    (acquisition.lines ?? []).map((line) => [
      line.id,
      line.filter ?? null,
      line.frameCount,
      line.exposureSeconds,
      line.gain ?? null,
      line.integrationSeconds,
      line.origin ?? null,
      line.edited === true,
    ]),
    acquisition.totalFrames ?? 0,
    acquisition.totalSeconds ?? null,
    acquisition.source ?? null,
  ]);
}

/**
 * `{ captures, targets }`: the counter « 12 captures · 9 cibles ». Every target
 * of every capture counts, once each (a mosaic names several).
 */
export function captureCounts(captures) {
  const targets = new Set();
  for (const capture of captures) {
    for (const id of capture.targetIds ?? []) if (id) targets.add(id);
  }
  return { captures: captures.length, targets: targets.size };
}

const finite = (value) =>
  Number.isFinite(value) && value > 0 && value < CAPABILITY_UNLIMITED;

/**
 * The space line's state:
 * - `count` — a profile that caps the number of captures (the free account:
 *   « 3 captures sur 3 »), with its bytes when it has a quota (`used`,
 *   `quota`, `left`, `share`, and `bytes`: `normal` · `low` · `full`);
 * - `normal` · `low` (under 10 % left: « Il reste 1,8 Go ») · `full` (the
 *   quota reached: the notice, « Ajouter une capture » greyed);
 * - `included` — the service administrator's exempted space: the bytes
 *   used and « Inclus », no quota;
 * - `unlimited` — no quota (a private server): the bytes used only.
 * `share` is the proportion used, for the bar (0 to 1).
 */
export function storageLine(storage) {
  if (!storage) return null;
  const used = Number(storage.usedBytes) || 0;
  const quota = Number(storage.quotaBytes);
  if (Number.isInteger(storage.captureCountLimit)) {
    const line = {
      kind: "count",
      count: storage.captureCount ?? 0,
      limit: storage.captureCountLimit,
    };
    if (!finite(quota)) return line;
    const left = Math.max(0, quota - used);
    return {
      ...line,
      used,
      quota,
      left,
      share: Math.min(1, used / quota),
      bytes: used >= quota ? "full" : left / quota < 0.1 ? "low" : "normal",
    };
  }
  // The service administrator's exempted space: « Inclus », no quota line.
  if (storage.included === true) return { kind: "included", used };
  if (!finite(quota)) return { kind: "unlimited", used };
  const left = Math.max(0, quota - used);
  const share = Math.min(1, used / quota);
  const kind = used >= quota ? "full" : left / quota < 0.1 ? "low" : "normal";
  return { kind, used, quota, left, share };
}

/**
 * The words of a card's two first lines: the title (the target's name, a
 * personal target's name, else its designation) and the line under it
 * (« M31 · NGC 224 »; « Cible personnelle »).
 */
export function cardTarget(capture, { personal, noTarget }) {
  const listed = capture.targets?.[0];
  const labelled = capture.detail?.targets?.[0];
  if (!listed && !labelled) return { title: noTarget, aliases: "" };
  if (listed?.source === "personal")
    return { title: listed.name || noTarget, aliases: personal };
  const designation = labelled?.designation || listed?.designation || "";
  const name = labelled?.name || null;
  const alias = (listed?.aliases ?? []).find(
    (candidate) => candidate && candidate !== name && candidate !== designation,
  );
  return name
    ? { title: name, aliases: [designation, alias].filter(Boolean).join(" · ") }
    : { title: designation, aliases: alias || "" };
}
