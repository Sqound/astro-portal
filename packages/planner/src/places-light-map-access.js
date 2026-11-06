import { getPlannerExtensions } from "portal/planner/extensions.js";
import { isHostedService } from "./access-copy.js";
import { placeCoordinates } from "portal/planner/state.js";
import { offersCopy, offersRegistered } from "./offers-slot.js";

// The geographic light-pollution map as the open planner sees it: a point
// a shell may register (`planner.places.lightMap`,
// `portal/planner/extensions.js`) and nothing else. The map, its tiles and
// its words are a paid addition's, held by
// `planner.mosaic` ("Planification avancée"); the open core only knows
// where its entry belongs — the header of the "Lieux" view — and how to
// draw it held back. The free light layer of the horizon map is the core's
// and never changes.
//
// Who sees what:
//
//  - nothing registered (a private server, the open-source composition), or
//    a page that is not a service that sells it: nothing at all;
//  - registered, without `planner.mosaic` (a visitor, a free space):
//    "heldBack", the entry carries the badge "Planification avancée"
//    and opens the view held back, with the words and the way to the offers
//    (`planner.offers`), the way the greyed "Mosaïque" section does;
//  - registered, with `planner.mosaic`: "open".
//
// The place's details of "Cette nuit" carry the same entry as a button of
// their foot: `placeLightMapEntry`.
//
// The screen is never the only barrier: the service refuses the tiles by
// itself (`403 capability_required` on `GET /v1/sky-quality/map/…`).

/** The planner extension point the light-pollution map is registered at. */
export const LIGHT_MAP_POINT = "planner.places.lightMap";

export const LIGHT_MAP_ACCESS = Object.freeze(["absent", "heldBack", "open"]);

/**
 * What the "Lieux" view shows of the light-pollution map: `absent`,
 * `heldBack` or `open` (see the file comment). `registered` says whether a
 * shell registered `planner.places.lightMap`; `hosted` whether the page is
 * a service that sells it (`isHostedService`); `capabilities` the person's
 * profile (a visitor's is the free account's).
 */
export function placesLightMapAccess({
  registered = false,
  hosted = false,
  capabilities = null,
} = {}) {
  if (!registered || !hosted) return "absent";
  return capabilities?.["planner.mosaic"] === true ? "open" : "heldBack";
}

/** `{ name, latitude, longitude }` of [place], or `null`. */
export function lightMapFocusOf(place) {
  const at = placeCoordinates(place);
  if (!at) return null;
  return {
    name: String(place?.name || place?.locality || "").trim(),
    ...at,
  };
}

/**
 * The button of the place's details of "Cette nuit": `null` where the map is
 * not the shell's (nothing registered: a private server, the open
 * composition; a page that is not a service that sells it), where nothing is
 * sold to a space that lacks it (the purchase box would be empty) and for a
 * place without a position (the map cannot be centred on it); else the
 * button's content — `access` (`open` | `heldBack`), the `focus` the map
 * opens on, the short `label` "Pollution lumineuse", the `subtitle`
 * "Planification avancée" inside the button while it is held back — and the
 * `View` to open. The gesture (the map, or the purchase box) is the caller's.
 */
export function placeLightMapEntry({
  locale,
  place,
  auth = null,
  capabilities = null,
}) {
  const extension = getPlannerExtensions(LIGHT_MAP_POINT)[0] ?? null;
  const access = placesLightMapAccess({
    registered: Boolean(extension),
    hosted: isHostedService(auth),
    capabilities,
  });
  const focus = lightMapFocusOf(place);
  if (access === "absent" || !focus || !extension?.View) return null;
  if (!offersRegistered()) return null;
  return {
    access,
    focus,
    View: extension.View,
    label: offersCopy(locale, "lightMapTitleShort"),
    subtitle:
      access === "heldBack"
        ? offersCopy(locale, "offerAdvancedPlanningName")
        : null,
  };
}
