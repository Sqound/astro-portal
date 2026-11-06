/**
 * The owner's own tags of a capture (`capture_tags`): free text of the owner, entered in « Mon espace » →
 * « Captures » and shown in the private gallery only — never in the public
 * gallery, whose tags are derived from the target's object type.
 *
 * A tag is never normalised: its case, its accents and its inner spaces stay
 * as typed; only the spaces around it are trimmed, as for a name of the
 * space. Pure, for the server and the browser alike.
 */

/** A tag holds 40 characters at most. */
export const CAPTURE_TAG_MAX_LENGTH = 40;

/** A capture holds 20 tags at most. */
export const CAPTURE_TAGS_MAX = 20;

const collator = new Intl.Collator("und", { numeric: true });

/** The order tags are read in: by their text, whatever the order typed. */
export const compareCaptureTags = (left, right) =>
  collator.compare(left, right) || (left < right ? -1 : left > right ? 1 : 0);

/** Characters as a person counts them (code points, as SQL `length`). */
export const tagLength = (tag) => [...tag].length;

/**
 * A list of tags as kept: each trimmed, the empty ones dropped, an exact
 * repetition kept once, in the order given. Never split, never changed
 * otherwise.
 */
export function cleanCaptureTags(tags) {
  const kept = [];
  for (const piece of tags) {
    const tag = String(piece).trim();
    if (tag && !kept.includes(tag)) kept.push(tag);
  }
  return kept;
}

/** The tags typed in the field: separated by commas or by lines. */
export const parseCaptureTags = (text) =>
  cleanCaptureTags(String(text ?? "").split(/[,\n]/));

/** The text of the field for a list of tags. */
export const captureTagsText = (tags) => (tags ?? []).join(", ");

/**
 * Why a list of tags cannot be saved, or `null`: `not_a_list` (not an array
 * of strings), `too_long` (a tag over 40 characters), `too_many` (more than
 * 20 tags once the empty ones and the repetitions are dropped).
 */
export function captureTagsProblem(tags) {
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))
    return "not_a_list";
  const kept = cleanCaptureTags(tags);
  if (kept.some((tag) => tagLength(tag) > CAPTURE_TAG_MAX_LENGTH))
    return "too_long";
  if (kept.length > CAPTURE_TAGS_MAX) return "too_many";
  return null;
}

/**
 * The list to store and to read: `cleanCaptureTags`, in the order of
 * `compareCaptureTags`. Call it after `captureTagsProblem` said `null`.
 */
export const storedCaptureTags = (tags) =>
  cleanCaptureTags(tags).sort(compareCaptureTags);
