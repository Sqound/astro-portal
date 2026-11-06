// The one setting of the places screens on the web: which of my places is the
// default one ("Lieu par défaut"). A preference of this browser, like the planner's
// own darkness preference — an identifier, never a place, never a result of a
// search. Both reads fail soft: a blocked store means no marked place.
export const defaultPlaceStorageKey = "astro-portal:places:default:v1";

const store = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** The identifier of the place marked as the default one, or `null`. */
export function readDefaultPlaceId(storage = store()) {
  try {
    const value = storage?.getItem(defaultPlaceStorageKey);
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

/** Marks [id] as the default place. Answers whether it could be kept. */
export function writeDefaultPlaceId(id, storage = store()) {
  try {
    storage.setItem(defaultPlaceStorageKey, String(id));
    return true;
  } catch {
    return false;
  }
}
