/**
 * The cells of a six-digit code (the e-mail sign-in code of the space and of
 * the private portal), as pure functions the two inputs share.
 *
 * A code typed on a keyboard did not fill the cells while a paste did — a
 * cell took a digit only through the browser's `input` event, which a cell
 * already holding a digit (`maxLength` 1) never fires and some key sources
 * never produce. The digit of a key is now read from the key itself, and a
 * focused cell is selected so that a typed digit replaces it.
 */

export const OTP_LENGTH = 6;

/** The cells of [value], an empty string for each one not filled. */
export function otpDigits(value) {
  return Array.from({ length: OTP_LENGTH }, (_, index) => value?.[index] || "");
}

/**
 * [raw] (one typed digit, or a pasted text) written from cell [index] on:
 * every non-digit dropped, no more than the cells left. `null` when nothing
 * is left to write. [focus] is the cell the caret goes to next.
 */
export function otpInsert(digits, index, raw) {
  const incoming = String(raw || "")
    .replace(/\D/g, "")
    .slice(0, OTP_LENGTH - index);
  if (!incoming) return null;
  const next = [...digits];
  incoming.split("").forEach((digit, offset) => {
    next[index + offset] = digit;
  });
  return { next, focus: Math.min(index + incoming.length, OTP_LENGTH - 1) };
}

/**
 * The digit a key press stands for, or `null` for any other key (a letter, a
 * shortcut, a key of a soft keyboard that reports nothing: those reach the
 * cell as an `input` event).
 */
export function otpDigitOfKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return typeof event.key === "string" && /^[0-9]$/.test(event.key)
    ? event.key
    : null;
}
