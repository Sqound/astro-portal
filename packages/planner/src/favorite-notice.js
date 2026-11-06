// The catalogue says which of the two favorites
// a tick just touched — photo or visual, added or removed — in the planner's
// own notice. No "Annuler": the
// second tick undoes.
export const favoriteNoticeDurationMs = 2500;

/** The message key of the notice for a tick of [mode] (`photo` or `visual`). */
export function favoriteNoticeKey(mode, added) {
  const family =
    mode === "photo"
      ? "plannerTargetCataloguePhotoFavorite"
      : "plannerTargetCatalogueVisualFavorite";
  return `${family}${added ? "Added" : "Removed"}`;
}
