"use client";

import { FormSheet } from "./FormSheet.js";
import { message } from "portal/i18n.js";
import { useEffect, useState } from "react";
import { placesDistanceLabel } from "../places-copy.js";
import { placeDistanceKm } from "portal/planner/state.js";
import {
  defaultPlaceOf,
  knownPlaceLinkOf,
  placeKindOf,
  placeLabel,
  placesReferenceOf,
} from "../places-rules.js";
import { PlaceSuggestedDetail } from "./PlaceSuggestedDetail.js";
import {
  PlacesSuggestedPane,
  initialPlacesSettings,
} from "./PlacesSuggestedPane.js";
import {
  PlaceExternalIcon,
  PlaceKindLine,
  PlaceLocateIcon,
  PlacePlusIcon,
  PlaceSearchIcon,
  PlaceSkyLine,
  usePlaceSky,
} from "./PlacesParts.js";
import {
  shownPlaceSky,
  usePlaceSkyMeasuresOfPage,
} from "./SkyBrightnessParts.js";

// "Choisir un lieu": the content that replaces the place list of the planner's
// stage 1. On a narrow screen it is a sheet at the bottom, on a wide one a
// dialog at the side (the CSS of `.places-picker-panel`); it is the shared web
// dialog, so the focus stays in it, Escape closes it and the focus goes back to
// the button that opened it.
//
// The saved places as radio rows (name, then what the card of "Mes lieux" says:
// "Lieu par défaut · Point de vue" / "Camping · 52 km" and "Bortle N · valeur ·
// mesuré, saisi ou estimation"; "Détails" on the chosen one — the sheet of any
// place — and "Site internet" for a linked place), then the three ways to
// change place, all tertiary: "Trouver un lieu idéal" (the suggested places
// around the chosen place; "Ajouter" there adds and chooses), "Utiliser ma
// position", "Ajouter un lieu à la main" — and "Choisir ce lieu", the only
// primary. The sheet only answers what was chosen: the planner applies it. The
// foot has "Mes lieux" (a link, against the left edge) facing "Choisir ce lieu"
// (the primary, against the right one); there is no help line under "Trouver un
// lieu idéal".

function PickerRow({
  locale,
  place,
  selected,
  isDefault,
  reference,
  website,
  onSelect,
  onDetails,
}) {
  // The measured or typed value first, with
  // its source — the very lines of the card of "Mes lieux".
  const { sky, source } = shownPlaceSky({
    place,
    estimate: usePlaceSky(place),
    measures: usePlaceSkyMeasuresOfPage(),
  });
  const km =
    reference && reference.placeId !== place.id
      ? placeDistanceKm(reference, place)
      : null;
  return (
    <li className={`places-picker-item${selected ? " is-selected" : ""}`}>
      <label className="places-picker-row">
        <input
          type="radio"
          name="places-picker"
          value={place.id}
          checked={selected}
          data-autofocus={selected ? "" : undefined}
          onChange={() => onSelect(place.id)}
        />
        <span className="places-radio-mark" aria-hidden="true" />
        <span className="places-picker-text">
          <strong>{placeLabel(place)}</strong>
          <PlaceKindLine
            locale={locale}
            lead={isDefault ? message(locale, "placesDefault") : null}
            kind={placeKindOf(place)}
            distance={km === null ? null : placesDistanceLabel(locale, km)}
          />
          <PlaceSkyLine locale={locale} sky={sky} source={source} />
        </span>
      </label>
      {selected && (
        <div className="places-picker-extras">
          <button type="button" className="btn-tertiary" onClick={onDetails}>
            {message(locale, "placePickerDetails")}
          </button>
          {website && knownPlaceLinkOf(place) && (
            <a
              className="btn-tertiary"
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${message(locale, "placeFactWebsite")} ${message(locale, "placesNewTab")}`}
            >
              {message(locale, "placeFactWebsite")}
              <PlaceExternalIcon />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The picker. `places` are the planner's known places, `selectedId` the one in
 * use; `onChoose(place)` answers a choice (also a place just added from "Trouver
 * un lieu"); `onUsePosition` and `onAddByHand` hand over to the place dialog;
 * `onOpenMine` goes to "Mes lieux" (the link at the left of the foot);
 * `onAddSuggestion(suggestion)` adds a place of mine and answers it (or `null`).
 */
export function PlacePickerSheet({
  locale,
  places,
  selectedId = null,
  defaultId = null,
  client,
  onChoose,
  onUsePosition,
  onAddByHand,
  onOpenMine,
  onAddSuggestion,
  onViewHorizon,
  usageOf = (place) => place.usage ?? { pendingPlans: [], pastPlans: [] },
  onClose,
}) {
  const usable = places.filter((place) => placesReferenceOf(place) !== null);
  // The same reference as the cards of "Mes lieux" before "Depuis ma
  // position" is pressed: the default place. The picker never reads the
  // browser's position by itself (N-1); "Utiliser ma position" below is its
  // own, explicit gesture.
  const reference = placesReferenceOf(defaultPlaceOf(usable, defaultId));
  const [chosenId, setChosenId] = useState(
    usable.some((place) => place.id === selectedId) ? selectedId : null,
  );
  const [pane, setPane] = useState("list");
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState(() =>
    initialPlacesSettings(chosenId),
  );
  const [websites, setWebsites] = useState({});
  const chosen = usable.find((place) => place.id === chosenId) ?? null;
  const chosenLink = chosen ? knownPlaceLinkOf(chosen)?.id : null;
  useEffect(() => {
    if (!chosenLink || websites[chosenLink] !== undefined) return undefined;
    const controller = new AbortController();
    client
      .known(chosenLink, { locale, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted)
          setWebsites((current) => ({
            ...current,
            [chosenLink]: result.place?.website ?? null,
          }));
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenLink, client, locale]);

  const back = () => {
    setDetail(null);
    setPane(detail?.from === "find" ? "find" : "list");
  };
  return (
    <FormSheet
      title={message(locale, "placePickerTitle")}
      closeLabel={message(locale, "placePickerClose")}
      onClose={onClose}
    >
      {pane === "detail" && detail ? (
        <PlaceSuggestedDetail
          locale={locale}
          client={client}
          suggestion={detail.suggestion ?? null}
          linked={detail.linked ?? null}
          places={places}
          reference={detail.reference ?? null}
          pickMode
          owned={
            detail.linked
              ? {
                  isDefault: detail.linked.id === defaultId,
                  usage: usageOf(detail.linked),
                }
              : null
          }
          onBack={back}
          onAdd={onAddSuggestion}
          onPicked={onChoose}
          onViewHorizon={onViewHorizon}
        />
      ) : pane === "find" ? (
        <section className="places-picker-find">
          <header className="places-detail-header">
            <button
              type="button"
              className="btn-link places-back"
              onClick={() => setPane("list")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="places-icon"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
              {message(locale, "placesBack")}
            </button>
            <h3>{message(locale, "placesTabSuggested")}</h3>
          </header>
          <PlacesSuggestedPane
            locale={locale}
            places={places}
            defaultPlaceId={defaultId}
            position={null}
            settings={settings}
            onSettings={setSettings}
            pickMode
            client={client}
            onAdd={onAddSuggestion}
            onPicked={onChoose}
            onOpen={(suggestion, reference) => {
              setDetail({ suggestion, reference, from: "find" });
              setPane("detail");
            }}
          />
        </section>
      ) : (
        <>
          <p className="places-picker-label" id="places-picker-saved">
            {message(locale, "placePickerSaved")}
          </p>
          {!usable.length && (
            <p className="places-muted">{message(locale, "placesNoneSaved")}</p>
          )}
          <ul
            className="places-picker-list"
            role="radiogroup"
            aria-labelledby="places-picker-saved"
          >
            {usable.map((place) => (
              <PickerRow
                key={place.id}
                locale={locale}
                place={place}
                selected={place.id === chosenId}
                isDefault={place.id === defaultId}
                reference={reference}
                website={websites[knownPlaceLinkOf(place)?.id] ?? null}
                onSelect={(id) => {
                  setChosenId(id);
                  setSettings((current) => ({ ...current, around: id }));
                }}
                onDetails={() => {
                  setDetail({
                    linked: place,
                    reference: reference
                      ? reference.placeId === place.id
                        ? null
                        : reference
                      : null,
                    from: "list",
                  });
                  setPane("detail");
                }}
              />
            ))}
          </ul>
          <div className="places-picker-actions">
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setPane("find")}
            >
              <PlaceSearchIcon />
              {message(locale, "placePickerFind")}
            </button>
            <button
              type="button"
              className="btn-tertiary"
              onClick={onUsePosition}
            >
              <PlaceLocateIcon />
              {message(locale, "placePickerUsePosition")}
            </button>
            <button
              type="button"
              className="btn-tertiary"
              onClick={onAddByHand}
            >
              <PlacePlusIcon />
              {message(locale, "placePickerAddByHand")}
            </button>
          </div>
          <div className="places-picker-foot">
            <button type="button" className="btn-link" onClick={onOpenMine}>
              {message(locale, "placesTabMine")}
            </button>
            {/* Nothing saved, nothing to choose: no button that cannot act. */}
            {usable.length > 0 && (
              <button
                type="button"
                className="btn-primary"
                disabled={!chosen}
                onClick={() => onChoose(chosen)}
              >
                {message(locale, "placePickerChoose")}
              </button>
            )}
          </div>
        </>
      )}
    </FormSheet>
  );
}
