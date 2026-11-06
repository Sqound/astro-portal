// The place chosen with "Changer" on "Cette nuit" is kept — in this browser
// — until the next local noon of that place, and wins over the plans while
// it holds. Nothing else is stored.
import { tonightChoiceUntil } from "./tonight-overview.js";

export const tonightPlaceChoiceKey = "astro.tonight.place-choice.v1";

const store = (storage) => {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** `{ place, until }` of the choice that still holds at `now`, else `null`. */
export function readTonightChoice(now = Date.now(), storage = null) {
  try {
    const raw = store(storage)?.getItem(tonightPlaceChoiceKey);
    const value = raw ? JSON.parse(raw) : null;
    if (!value?.place || !Number.isFinite(value.until) || now >= value.until)
      return null;
    return { place: value.place, until: value.until };
  } catch {
    return null;
  }
}

/** Keeps `place` until the next local noon of it; `null` forgets the choice. */
export function rememberTonightChoice(place, now = Date.now(), storage = null) {
  if (!place) {
    try {
      store(storage)?.removeItem(tonightPlaceChoiceKey);
    } catch {
      // Storage refused: the choice holds for this page.
    }
    return null;
  }
  const choice = { place, until: tonightChoiceUntil(now, place) };
  try {
    store(storage)?.setItem(tonightPlaceChoiceKey, JSON.stringify(choice));
  } catch {
    // Storage refused: the choice holds for this page.
  }
  return choice;
}
