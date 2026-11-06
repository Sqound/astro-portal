// The children's version of a target's page on the web.
//
// A target may carry, beside its page, a text written for children from that
// page: one or two paragraphs, `childrenSpokenParagraphs` of its knowledge
// (`GET /v1/targets/{id}`; the service serves it only when a page wrote it,
// never from a template). The control « Pour les enfants » of a target sheet
// switches the text shown to those paragraphs, in place of the page's
// sections — the sources stay at the bottom. The web has no voice: text only.
//
// The choice belongs to this browser (`localStorage`, as the red night mode does) and applies to every target sheet.
import { deviceStorage } from "./night-mode.js";

export const childrenVersionPreferenceKey = "nightSession.readAloudChildren";

/** The children's paragraphs of `knowledge`: its non-empty strings. */
export function childrenParagraphs(knowledge) {
  const value = knowledge?.childrenSpokenParagraphs;
  return Array.isArray(value)
    ? value.filter(
        (paragraph) => typeof paragraph === "string" && paragraph.trim(),
      )
    : [];
}

/** Whether `knowledge` carries a children's version. */
export function hasChildrenVersion(knowledge) {
  return childrenParagraphs(knowledge).length > 0;
}

/**
 * `knowledge` with its story replaced by the children's paragraphs — one
 * section without an intertitle — and everything else kept (the sources and
 * their note close the page as before). `knowledge` itself when it has no
 * children's version.
 */
export function knowledgeInChildrenVersion(knowledge) {
  const children = childrenParagraphs(knowledge);
  if (children.length === 0) return knowledge;
  return {
    ...knowledge,
    story: children.join(" "),
    storyParagraphs: children,
    storySections: [{ heading: null, paragraphs: children }],
  };
}

/**
 * What a surface shows of `knowledge`: the children's version when the
 * switch is on and the target has one, else `knowledge` itself.
 */
export function knowledgeShown(knowledge, on) {
  return on && knowledge ? knowledgeInChildrenVersion(knowledge) : knowledge;
}

/** The first of `sources` that carries a children's version, else null. */
export function withChildrenVersion(...sources) {
  return sources.find((source) => hasChildrenVersion(source)) ?? null;
}

/** The device's choice: off unless an explicit `true` was written. */
export function readChildrenVersion(storage = deviceStorage()) {
  try {
    const raw = storage?.getItem(childrenVersionPreferenceKey);
    return raw === null || raw === undefined ? false : JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

const listeners = new Set();
let held = null;

/** Writes the choice and tells every sheet that shows it. */
export function writeChildrenVersion(on, storage = deviceStorage()) {
  held = Boolean(on);
  try {
    storage?.setItem(childrenVersionPreferenceKey, JSON.stringify(held));
  } catch {
    // Kept for this page at least; the next visit reads the default.
  }
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` contract: the current choice, and its changes. */
export function subscribeChildrenVersion(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function childrenVersionSnapshot() {
  if (held === null) held = readChildrenVersion();
  return held;
}

/** The server renders the default; the browser corrects it after hydration. */
export function childrenVersionServerSnapshot() {
  return false;
}

/** Forgets the choice held in memory (tests). */
export function resetChildrenVersion() {
  held = null;
  listeners.clear();
}
