/**
 * The words the owner reads of the reason an automatic check could not decide,
 * in the tab « Captures ». The check belongs to a service with a team that
 * looks at the captures: the composition of that service registers the words
 * (`registerCheckReasonWords`), and a server without one draws none.
 */
let provider = null;

/** `provider(locale, reason)` resolves to a sentence, or `null`. */
export function registerCheckReasonWords(next) {
  provider = typeof next === "function" ? next : null;
}

/** The sentence for `reason` in `locale`, or `null`. */
export const checkReasonWords = (locale, reason) =>
  provider?.(locale, reason) ?? null;
