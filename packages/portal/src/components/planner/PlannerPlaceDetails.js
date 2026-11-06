"use client";
import { PlaceMap } from "./PlannerPlaceDialog.js";
import { PlannerHorizonEditor } from "./PlannerHorizonEditor.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { message } from "../../i18n.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import { horizonMaskHasProfile } from "../../planner/horizon-mask.js";
import { placeCoordinates } from "../../planner/state.js";
import { timeZoneShownName } from "../../planner/place-time-zone.js";

/** « 45.00000° · -29.60575° · Etc/GMT+2 », as the place editor writes the
 * position; the zone only when the place has one. */
export function placeDetailsCoordinatesLine(place) {
  const coordinates = placeCoordinates(place);
  const zone = typeof place?.timeZone === "string" ? place.timeZone : "";
  return [
    ...(coordinates
      ? [
          `${coordinates.latitude.toFixed(5)}°`,
          `${coordinates.longitude.toFixed(5)}°`,
        ]
      : []),
    ...(zone ? [timeZoneShownName(zone)] : []),
  ].join(" · ");
}

/**
 * The place of « Cette nuit » in a dialog: the place's name as the title,
 * the locality and the coordinates under it, then, read only, its position on
 * the editor's map (a click on it opens the place editor) and its drawn
 * horizon under « Horizon enregistré du lieu. » — or the grey inert badge
 * « Aucun horizon » when nothing is drawn. The foot: a link, « Fermer », and
 * « Éditer ce lieu », a tertiary on its right, and, at the end, the
 * secondary of the light-pollution map when `lightMap` is given: the short
 * label, the glyph of the map, « Planification avancée » as a subtitle inside
 * the button when the feature is held back. One line when it fits, stacked
 * under 600 px with the strongest first.
 *
 * `lightMap`: `null` (no button) or
 * `{ access, label, subtitle, icon, onOpen }`, drawn by the planner
 * (`TonightPage`) which knows the words and the right: `access` is `open`
 * (the map) or `heldBack` (the feature is withheld); the button is the same.
 */
export function PlannerPlaceDetails({
  locale,
  place,
  onEdit,
  onClose,
  lightMap = null,
}) {
  const name = place.name || place.locality || "";
  const locality =
    place.locality && place.locality !== name ? place.locality : "";
  const coordinates = placeDetailsCoordinatesLine(place);
  const drawn = horizonMaskHasProfile(place.horizonMask);
  return (
    <WebDialog
      className="planner-place-dialog tonight-place-details"
      bodyClassName="tonight-place-details-body"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      footerClassName="tonight-place-details-footer"
      // The focus starts on the title: the map, first of the body, is a
      // button whose focus ring would frame it before anything is touched.
      focusTitle
      onClose={onClose}
      title={name}
      footer={
        <>
          <button type="button" className="btn-link" onClick={onClose}>
            {flow(locale, "close")}
          </button>
          <button
            type="button"
            className="btn-tertiary"
            data-testid="tonight-place-details-edit"
            onClick={onEdit}
          >
            {flow(locale, "editPlace")}
          </button>
          {lightMap ? (
            <button
              type="button"
              className="btn-secondary tonight-place-details-light-map"
              data-testid="tonight-place-details-light-map"
              data-light-map-entry={lightMap.access}
              onClick={lightMap.onOpen}
            >
              {lightMap.icon}
              <span className="tonight-place-details-light-map-text">
                <span>{lightMap.label}</span>
                {lightMap.subtitle ? (
                  <small data-testid="tonight-place-details-light-map-subtitle">
                    {lightMap.subtitle}
                  </small>
                ) : null}
              </span>
            </button>
          ) : null}
        </>
      }
    >
      <div data-testid="tonight-place-details">
        {locality ? (
          <p className="tonight-place-details-locality">{locality}</p>
        ) : null}
        {coordinates ? (
          <p
            className="tonight-place-details-coordinates"
            data-testid="tonight-place-details-coordinates"
          >
            {coordinates}
          </p>
        ) : null}
        <PlaceMap
          locale={locale}
          location={place}
          readOnly
          onOpen={onEdit}
          openLabel={message(locale, "tonightPlaceMapLabel")}
        />
        {drawn ? (
          <section
            className="tonight-place-details-horizon"
            data-testid="tonight-place-details-horizon"
          >
            <p className="tonight-muted">
              {message(locale, "horizonMapHelpLine")}
            </p>
            <PlannerHorizonEditor
              locale={locale}
              mask={place.horizonMask}
              readOnly
            />
          </section>
        ) : (
          <span
            className="tonight-place-no-horizon"
            data-testid="tonight-place-no-horizon"
            role="status"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 19l6-10 4 6 3-4 5 8z" />
            </svg>
            {message(locale, "tonightPlaceNoHorizon")}
          </span>
        )}
      </div>
    </WebDialog>
  );
}
