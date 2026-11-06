// A name whose last line is never a single CJK character.
//
// Han, kana and hangul break between any two characters, so a place name like
// "BASEGATE audit横浜関内" can wrap to "…横浜関" over a lone "内". A word joiner
// (U+2060) before the last character, when it and the one before it are both
// CJK, keeps them on one line: the line breaks earlier instead. Display only:
// keep the original for the accessible name, for comparing and for saving.

const WORD_JOINER = "⁠";

const isCjk = (code) =>
  (code >= 0x3040 && code <= 0x30ff) || // hiragana, katakana
  (code >= 0x3400 && code <= 0x4dbf) || // Han, extension A
  (code >= 0x4e00 && code <= 0x9fff) || // Han
  (code >= 0xf900 && code <= 0xfaff) || // Han compatibility
  (code >= 0xac00 && code <= 0xd7af) || // hangul syllables
  (code >= 0xff66 && code <= 0xff9f) || // half-width katakana
  (code >= 0x20000 && code <= 0x2ffff); // Han, extensions B and later

/**
 * @param {string} text
 * @returns {string} `text` with a word joiner before its last character when
 *   that character and the one before it are both CJK; `text` itself otherwise.
 */
export function keepLastCharactersTogether(text) {
  const characters = Array.from(String(text ?? ""));
  if (characters.length < 3) return String(text ?? "");
  const last = characters[characters.length - 1].codePointAt(0);
  const before = characters[characters.length - 2].codePointAt(0);
  if (!isCjk(last) || !isCjk(before)) return characters.join("");
  return (
    characters.slice(0, -1).join("") +
    WORD_JOINER +
    characters[characters.length - 1]
  );
}
