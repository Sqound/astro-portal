// The way back from « Définir mon matériel ». The link leaves the planner for
// « Mon espace » → « Matériel » in the same tab; before it goes, the page
// notes the identifiers of the equipment it knows, by type, in the tab's
// session storage. When the planner is shown again (a new load, or the tab
// that comes back to the front), it reads the equipment of the space again
// (`GET /api/equipment`) and compares: for each type where exactly one piece
// is new, the field of that type takes it; where several or none are new,
// nothing changes. The note is read once and then forgotten. Pure functions
// over a `Storage` (or anything with getItem, setItem, removeItem).

/** The key of the note in the tab's session storage. */
export const equipmentReturnKey = "astro-portal.equipment-return";

/** A note older than this is forgotten unread (a return the next day). */
export const equipmentReturnMaxAgeMs = 6 * 60 * 60 * 1000;

/** The types of `GET /api/equipment` a picker of the planner reads. */
export const equipmentReturnTypes = Object.freeze([
  "telescope",
  "camera",
  "eyepiece",
  "lens",
  "filter",
  "mount",
]);

/** The identifiers of the equipment not archived, by type. */
export function equipmentIdsByType(items = []) {
  const byType = Object.fromEntries(
    equipmentReturnTypes.map((type) => [type, []]),
  );
  for (const item of items || []) {
    if (!item || item.archivedAt || !item.id) continue;
    if (byType[item.type]) byType[item.type].push(String(item.id));
  }
  return byType;
}

/** Note the equipment known before leaving by « Définir mon matériel ». */
export function rememberEquipmentForReturn(storage, items, now = Date.now()) {
  try {
    storage?.setItem(
      equipmentReturnKey,
      JSON.stringify({ at: now, ids: equipmentIdsByType(items) }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Whether a note waits for the return (the page then reads the equipment). */
export function equipmentReturnPending(storage, now = Date.now()) {
  const note = readNote(storage);
  return Boolean(note) && now - note.at <= equipmentReturnMaxAgeMs;
}

function readNote(storage) {
  try {
    const note = JSON.parse(storage?.getItem(equipmentReturnKey) ?? "null");
    return note && typeof note.at === "number" && note.ids ? note : null;
  } catch {
    return null;
  }
}

/**
 * The equipment that becomes the value of its field on the return:
 * `{ telescope: "id", eyepiece: "id", … }`, a type only when exactly one
 * piece of it is new since the note. The note is forgotten. `{}` with no
 * note, an old note, or nothing new.
 */
export function equipmentChosenOnReturn(storage, items, now = Date.now()) {
  const note = readNote(storage);
  try {
    storage?.removeItem(equipmentReturnKey);
  } catch {
    // A storage that refuses: the note is read once all the same.
  }
  if (!note || now - note.at > equipmentReturnMaxAgeMs) return {};
  const current = equipmentIdsByType(items);
  const chosen = {};
  for (const type of equipmentReturnTypes) {
    const before = new Set(Array.isArray(note.ids[type]) ? note.ids[type] : []);
    const added = current[type].filter((id) => !before.has(id));
    if (added.length === 1) chosen[type] = added[0];
  }
  return chosen;
}

/** The key of an equipment selection each type brought back takes. */
const selectionKeys = Object.freeze({
  telescope: "telescopeId",
  camera: "cameraId",
  eyepiece: "eyepieceId",
  lens: "modifierId",
});

/**
 * An equipment selection (a draft of « Matériel de l'aperçu », the framing
 * editor's own) once the way back brought `chosen` (`{ telescope: "id",
 * camera, eyepiece, lens }`): each piece takes its place; a mount or a
 * filter, which such a selection does not hold, is left out. The selection
 * itself when nothing changes.
 */
export function equipmentSelectionWithReturn(selection, chosen) {
  let next = selection;
  for (const [type, key] of Object.entries(selectionKeys))
    if (chosen?.[type] && next?.[key] !== chosen[type])
      next = { ...(next || {}), [key]: chosen[type] };
  return next;
}
