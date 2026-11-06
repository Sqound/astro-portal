import { normaliseHorizonMask } from "./horizon-mask.js";
import { emptyHorizon, placeCoordinates } from "./state.js";

// The horizon the place editor works on: the mask, on the 10° grid, switched
// on (the editor always edits an enabled mask).
const editedMask = (mask) =>
  JSON.stringify({
    ...normaliseHorizonMask(mask || emptyHorizon()),
    enabled: true,
  });

/**
 * Whether closing the place editor now would lose something the person did:
 * a new place, as soon as a position is chosen; a place being edited, once its position or
 * its horizon differ from what it opened with.
 *
 * `place` is the place the editor opened on (`null` for a new one), `draft`
 * the place being written.
 */
export function placeHasUnsavedChoices({ place, draft }) {
  const now = placeCoordinates(draft);
  if (!place) return Boolean(now);
  const before = placeCoordinates(place);
  const moved =
    Boolean(now) !== Boolean(before) ||
    (now &&
      before &&
      (now.latitude !== before.latitude || now.longitude !== before.longitude));
  return (
    Boolean(moved) ||
    editedMask(draft.horizonMask) !== editedMask(place.horizonMask)
  );
}
