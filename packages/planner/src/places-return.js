// On the web, the fiche of a place
// replaces the list inside the page, so "Retour" must give the list back as
// it was. The tab and the filters live in `PlacesView`'s own state and
// survive the fiche; the position of the page does not (a fiche shorter than
// the list resets it), so it is remembered when a fiche opens and given back
// when it closes. Pure of any component: `environment` is the window.

/** A one-shot memory of the page's vertical position. */
export function createPlacesReturnMemory() {
  let saved = null;
  return {
    /** Remembers where the page stands (when a fiche opens). */
    remember(environment = globalThis) {
      saved = Number.isFinite(environment.scrollY) ? environment.scrollY : 0;
    },
    /** Gives the position back once (when the list is shown again). */
    restore(environment = globalThis) {
      if (saved == null) return false;
      const top = saved;
      saved = null;
      if (typeof environment.scrollTo !== "function") return false;
      environment.scrollTo(0, top);
      return true;
    },
    /** Whether a position is waiting to be given back. */
    get pending() {
      return saved != null;
    },
  };
}
