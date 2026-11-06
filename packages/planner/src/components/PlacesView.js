"use client";

import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { message } from "portal/i18n.js";
import { placeCoordinates, placeDistanceKm } from "portal/planner/state.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  placesDistanceLabel,
  placesDuplicateLine,
  placesMineCountLabel,
} from "../places-copy.js";
import { createPlacesReturnMemory } from "../places-return.js";
import {
  readDefaultPlaceId,
  writeDefaultPlaceId,
} from "../places-preferences.js";
import {
  compareSky,
  defaultPlaceOf,
  placeDuplicates,
  placeKindOf,
  placeHorizonRecorded,
  placeLabel,
  placesReferenceOf,
} from "../places-rules.js";
import {
  PlaceDeleteDialog,
  PlaceSuggestedDetail,
} from "./PlaceSuggestedDetail.js";
import { PlaceLightMapContext } from "./PlaceLightMapEntry.js";
import {
  HeldChip,
  lightMapRowLabel,
  offersRegistered,
} from "../offers-slot.js";
import {
  shownPlaceSky,
  usePlaceSkyMeasuresOfPage,
} from "./SkyBrightnessParts.js";
import {
  PlacesSuggestedPane,
  initialPlacesSettings,
} from "./PlacesSuggestedPane.js";
import {
  PlaceChevron,
  PlaceKindBadge,
  SkyDeltaBadge,
  PlacePlusIcon,
  PlaceSkyLine,
  PlaceTag,
  PlacesFromPositionButton,
  usePlaceSky,
  usePlacesPositionRead,
} from "./PlacesParts.js";

// "Lieux": "Mes lieux", the places of the planner's document with their
// distance, sky and horizon; "Lieux suggérés", the named places the service
// finds around one of them or around the browser's position, with their
// darkness compared; and the detail of either. A visitor's places live in this
// browser's plans document; a signed-in person's in the space (`/v1/places`):
// the planner page hands the view the list either way and takes its gestures. A
// card opens the sheet of the place (Edit this place · Make it the default
// place · Remove from my places), which replaces the former dialog "Actions
// pour ce lieu".

/** One of my places: name, kind and distance, sky, and its tags. */
export function MyPlaceCard({
  locale,
  place,
  isDefault,
  reference,
  skyOverride,
  measures = null,
  referenceSky = null,
  duplicate = false,
  onOpen,
}) {
  const fetchedSky = usePlaceSky(skyOverride === undefined ? place : null);
  const pageMeasures = usePlaceSkyMeasuresOfPage();
  // The measured or typed value first.
  const { sky, source } = shownPlaceSky({
    place,
    estimate: skyOverride === undefined ? fetchedSky : skyOverride,
    measures: measures ?? pageMeasures,
  });
  // The type of the place itself (chosen, or filled by its link), else none.
  const kind = placeKindOf(place);
  const km =
    reference && reference.placeId !== place.id
      ? placeDistanceKm(reference, place)
      : null;
  const recorded = placeHorizonRecorded(place);
  // The gap to the reference of
  // the distances, in front of the state tags; none on the reference itself
  // nor for a place whose sky is unknown.
  const comparison =
    reference && reference.placeId !== place.id
      ? compareSky(sky?.sqm, referenceSky?.sqm)
      : null;
  return (
    <li className="places-card" data-place-id={place.id}>
      <button
        type="button"
        className="places-card-open"
        aria-haspopup="dialog"
        onClick={() => onOpen(place)}
      >
        <span className="places-card-body">
          <strong className="places-card-name">{placeLabel(place)}</strong>
          {(kind || km !== null) && (
            <span className="places-kind-line">
              {kind && <PlaceKindBadge locale={locale} kind={kind} />}
              {km !== null && <span>{placesDistanceLabel(locale, km)}</span>}
            </span>
          )}
          <PlaceSkyLine locale={locale} sky={sky} source={source} />
        </span>
        <PlaceChevron />
      </button>
      <div className="places-card-actions">
        <span className="places-tags">
          {comparison && (
            <SkyDeltaBadge
              locale={locale}
              comparison={comparison}
              place={{ name: placeLabel(place), sqm: sky.sqm }}
              reference={reference}
              referenceSky={referenceSky}
              testId="places-mine-delta"
            />
          )}
          {isDefault && (
            <PlaceTag tone="gold">{message(locale, "placesDefault")}</PlaceTag>
          )}
          <PlaceTag tone={recorded ? "success" : "warning"}>
            {message(
              locale,
              recorded ? "placesHorizonRecorded" : "placesHorizonToRecord",
            )}
          </PlaceTag>
          {duplicate && (
            <PlaceTag tone="warning">
              {message(locale, "placesDuplicate")}
            </PlaceTag>
          )}
        </span>
      </div>
    </li>
  );
}

/** "Mes lieux": the count, the cards and "Ajouter un lieu". */
export function MyPlacesList({
  locale,
  places,
  defaultId,
  position,
  positionPending = false,
  positionFailed = false,
  onLocate = null,
  skies,
  visitor = false,
  onOpen,
  onNewPlace,
}) {
  const usable = places.filter((place) => placeCoordinates(place));
  // The possible duplicates, over the whole list: flagged, never blocked.
  const { duplicates, flagged } = useMemo(
    () => placeDuplicates(usable),
    [places],
  );
  const first = duplicates[0]
    ? {
        left: usable.find((place) => place.id === duplicates[0].ids[0]),
        right: usable.find((place) => place.id === duplicates[0].ids[1]),
        metres: duplicates[0].distanceMetres,
      }
    : null;
  const reference = position
    ? { name: "", ...position, placeId: null }
    : placesReferenceOf(defaultPlaceOf(usable, defaultId));
  // The sky of the reference the gaps are measured from — the browser's
  // position, else the default place (its measured or typed value first).
  const defaultPlace = defaultPlaceOf(usable, defaultId);
  const referenceModel = usePlaceSky(position ?? (skies ? null : defaultPlace));
  const pageMeasures = usePlaceSkyMeasuresOfPage();
  const referenceSky = position
    ? referenceModel
    : defaultPlace
      ? shownPlaceSky({
          place: defaultPlace,
          estimate: skies ? (skies[defaultPlace.id] ?? null) : referenceModel,
          measures: pageMeasures,
        }).sky
      : null;
  return (
    <section
      className="places-mine"
      aria-label={message(locale, "placesTabMine")}
    >
      {visitor && (
        // "Une ligne, puis ⓘ": the visitor's places stay in this
        // browser until they sign in.
        <InfoLine
          locale={locale}
          className="places-visitor-line"
          text={message(locale, "placesVisitorLine")}
          title={message(locale, "placesTitle")}
          body={message(locale, "placesVisitorInfo")}
          testId="places-visitor-info"
        />
      )}
      <p className="places-muted">
        {placesMineCountLabel(locale, usable.length, Boolean(position))}
      </p>
      {onLocate && (
        <PlacesFromPositionButton
          locale={locale}
          pending={positionPending}
          failed={positionFailed}
          onLocate={onLocate}
        />
      )}
      {first && (
        <InfoLine
          locale={locale}
          className="places-duplicate-line"
          text={placesDuplicateLine(
            locale,
            placeLabel(first.left),
            placeLabel(first.right),
            first.metres,
          )}
          title={message(locale, "placesDuplicate")}
          body={message(locale, "placesDuplicateInfo")}
          testId="places-duplicate-info"
        />
      )}
      {!usable.length && (
        <p className="places-muted">{message(locale, "placesNoneSaved")}</p>
      )}
      <ul className="places-list">
        {usable.map((place) => (
          <MyPlaceCard
            key={place.id}
            locale={locale}
            place={place}
            isDefault={place.id === defaultId}
            reference={reference}
            referenceSky={referenceSky}
            skyOverride={skies ? (skies[place.id] ?? null) : undefined}
            duplicate={flagged.includes(place.id)}
            onOpen={onOpen}
          />
        ))}
      </ul>
      <div className="places-add">
        <button type="button" className="btn-primary" onClick={onNewPlace}>
          <PlacePlusIcon />
          {message(locale, "placesAdd")}
        </button>
      </div>
    </section>
  );
}

/**
 * The one entry of the map, under the title, above "Mes lieux" / "Lieux
 * suggérés":
 * "Carte de la pollution lumineuse", the chip of "Planification avancée"
 * under it while the map is held back and sold here, and a chevron. A paid
 * function hidden behind a button without a word is not found, so the title
 * line carries no map button any more.
 */
export function PlacesLightMapRow({ locale, lightMap, onOpen }) {
  if (!lightMap || lightMap.access === "absent") return null;
  const held = lightMap.access === "heldBack" && offersRegistered();
  // A list row, not a button of the four levels: the whole row is one target
  //, the way the rows of the settings are.
  const open = (event) => {
    if (event.type === "click" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="light-map-row"
      data-light-map-row={lightMap.access}
      aria-label={held ? lightMapRowLabel(locale) : lightMap.label}
      onClick={open}
      onKeyDown={open}
    >
      <span className="light-map-row-text" aria-hidden="true">
        <span className="light-map-row-label">{lightMap.label}</span>
        {held && <HeldChip offer="planning" kind="locked" locale={locale} />}
      </span>
      <svg
        className="light-map-row-chevron"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </div>
  );
}

/**
 * The "Lieux" view of the planner. `places` is the list of mine (the space's
 * for a signed-in person, the browser's document for a visitor);
 * `onAddSuggestion` adds a suggestion to them and answers the place (or
 * `null`); `onEditPlace` and `onNewPlace` open the place dialog; `onViewHorizon`
 * shows a place's horizon; `onRemovePlace(id)` deletes one of mine and answers
 * `{ ok }` or `{ inUse, pendingPlans }` (a plan to execute uses it);
 * `onDetachPlace(place)` writes one of mine without its link to the
 * OpenStreetMap record (it keeps its type); `usageOf`
 * answers `{ pendingPlans, pastPlans }` for a place; `onOpenPlan(planId)` opens
 * a plan from the sheet; `showPlaceId` opens the sheet of that place once
 * (`onShown` says it did); `defaultPlaceId` / `onSetDefault(id)` are the space's
 * default place (absent: this browser's preference); `visitor` says the places
 * stay in this browser; `client` is the service's reads. `lightMap` is the
 * light-pollution map a shell registered, with its access (`{ access, View,
 * label, badge, offersHref, seeOffers, place }`), or null.
 */
export function PlacesView({
  locale,
  places,
  client,
  onAddSuggestion,
  onEditPlace,
  onNewPlace,
  onViewHorizon,
  onRemovePlace = null,
  onDetachPlace = null,
  usageOf = (place) => place.usage ?? { pendingPlans: [], pastPlans: [] },
  onOpenPlan = null,
  defaultPlaceId,
  onSetDefault,
  showPlaceId = null,
  onShown = () => {},
  visitor = false,
  lightMap = null,
  onConditions = null,
}) {
  const [tab, setTab] = useState("mine");
  // The light map's opening: `{ nearMe: true }` from the row, `{ focus }`
  // from a place; `null` closed. ← gives back what was under it.
  const [lightMapOpen, setLightMapOpen] = useState(null);
  const placeLightMap = useMemo(
    () =>
      lightMap && lightMap.access !== "absent" && lightMap.View
        ? {
            access: lightMap.access,
            open: (focus) => setLightMapOpen({ focus }),
          }
        : null,
    [lightMap?.access, lightMap?.View],
  );
  const [detail, setDetailState] = useState(null);
  // "Retour" gives the list back as it was: the tab and the filters stay in
  // this component's state, the position of the page is remembered when a
  // fiche opens and given back when it closes.
  const returnMemory = useRef(null);
  if (returnMemory.current === null)
    returnMemory.current = createPlacesReturnMemory();
  const setDetail = (next) => {
    if (next && !detail) returnMemory.current.remember();
    setDetailState(next);
  };
  useEffect(() => {
    if (!detail) returnMemory.current.restore();
  }, [detail]);
  const [deleting, setDeleting] = useState(null);
  const [settings, setSettings] = useState(() => initialPlacesSettings());
  const [markedId, setMarkedId] = useState(null);
  useEffect(() => setMarkedId(readDefaultPlaceId()), []);
  const {
    position,
    pending: positionPending,
    failed: positionFailed,
    locate,
  } = usePlacesPositionRead();
  // "Depuis ma position" (N-1): the only read of the browser's position.
  // Asked from either tab, the position then starts the search of "Lieux
  // suggérés" too, until the page is left.
  const askPosition = () => {
    setSettings((current) => ({ ...current, around: "position" }));
    locate();
  };
  // The space's default place when the page gives one, else this browser's.
  const controlled = typeof onSetDefault === "function";
  const defaultPlace = useMemo(
    () => defaultPlaceOf(places, controlled ? defaultPlaceId : markedId),
    [places, controlled, defaultPlaceId, markedId],
  );
  const makeDefault = (id) => {
    if (controlled) onSetDefault(id);
    else {
      writeDefaultPlaceId(id);
      setMarkedId(id);
    }
  };
  // The reference of the details of one of my places: the position, else the
  // default place — unless this place is the default one.
  const referenceFor = (place) =>
    position
      ? {
          name: message(locale, "placesAroundPosition"),
          ...position,
          placeId: null,
        }
      : defaultPlace && defaultPlace.id !== place.id
        ? placesReferenceOf(defaultPlace)
        : null;
  // The sheet of a place of mine reads the place from the list at each draw: a
  // new default place or an edit shows at once, a deleted place closes it.
  const sheetPlace =
    detail?.placeId && places.find((place) => place.id === detail.placeId);
  // Asked to open one (the editor's "Voir ce lieu").
  useEffect(() => {
    if (!showPlaceId) return;
    const place = places.find((entry) => entry.id === showPlaceId);
    if (place)
      setDetail({
        placeId: place.id,
        reference:
          defaultPlace && defaultPlace.id !== place.id
            ? placesReferenceOf(defaultPlace)
            : null,
      });
    onShown();
  }, [showPlaceId]);
  useEffect(() => {
    if (detail?.placeId && !sheetPlace) setDetail(null);
  }, [detail, sheetPlace]);
  const deletingPlace = deleting
    ? places.find((place) => place.id === deleting.id)
    : null;
  const askDelete = (place) => {
    // A plan to execute that uses the place refuses the deletion, decided from
    // the usage read with the place; the service says it again.
    const { pendingPlans } = usageOf(place);
    setDeleting({
      id: place.id,
      pendingPlans: pendingPlans.length ? pendingPlans : null,
    });
  };
  const confirmDelete = async () => {
    const id = deleting.id;
    const answer = await onRemovePlace?.(id);
    if (answer?.inUse) setDeleting({ id, pendingPlans: answer.pendingPlans });
    else {
      setDeleting(null);
      setDetail(null);
    }
  };

  return (
    <PlaceLightMapContext.Provider value={placeLightMap}>
      <main className="planner-page places-page">
        {lightMapOpen && lightMap?.View ? (
          <lightMap.View
            locale={locale}
            places={places}
            place={lightMap.place ?? defaultPlace}
            focus={lightMapOpen.focus ?? null}
            nearMe={Boolean(lightMapOpen.nearMe)}
            held={lightMap.access !== "open"}
            onBack={() => setLightMapOpen(null)}
          />
        ) : sheetPlace ? (
          <PlaceSuggestedDetail
            locale={locale}
            client={client}
            linked={sheetPlace}
            places={places}
            reference={detail.reference ?? null}
            owned={{
              isDefault: defaultPlace?.id === sheetPlace.id,
              usage: usageOf(sheetPlace),
              onOpenPlan,
              actions: {
                onEdit: () => onEditPlace(sheetPlace),
                onMakeDefault: () => makeDefault(sheetPlace.id),
                onDelete: () => askDelete(sheetPlace),
                onDetach: onDetachPlace
                  ? () => onDetachPlace(sheetPlace)
                  : undefined,
              },
            }}
            onBack={() => setDetail(null)}
            onViewHorizon={onViewHorizon}
            onConditions={onConditions}
          />
        ) : detail ? (
          <PlaceSuggestedDetail
            locale={locale}
            client={client}
            suggestion={detail.suggestion ?? null}
            places={places}
            reference={detail.reference ?? null}
            owned={null}
            onOpenPlan={onOpenPlan}
            onBack={() => setDetail(null)}
            onConditions={onConditions}
            onAdd={onAddSuggestion}
            onRemove={onRemovePlace}
            onViewHorizon={onViewHorizon}
          />
        ) : (
          <>
            <h2 className="places-title">{message(locale, "placesTitle")}</h2>
            <PlacesLightMapRow
              locale={locale}
              lightMap={lightMap}
              onOpen={() => setLightMapOpen({ nearMe: true })}
            />
            <div
              className={`session-view-switch places-switch${tab === "suggested" ? " is-suggested" : ""}`}
              role="tablist"
              aria-label={message(locale, "placesTitle")}
            >
              {["mine", "suggested"].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  className={tab === value ? "is-active" : ""}
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {message(
                    locale,
                    value === "mine" ? "placesTabMine" : "placesTabSuggested",
                  )}
                </button>
              ))}
            </div>
            {tab === "mine" ? (
              <MyPlacesList
                locale={locale}
                places={places}
                defaultId={defaultPlace?.id ?? null}
                position={position}
                positionPending={positionPending}
                positionFailed={positionFailed}
                onLocate={askPosition}
                visitor={visitor}
                onOpen={(place) =>
                  setDetail({
                    placeId: place.id,
                    reference: referenceFor(place),
                  })
                }
                onNewPlace={onNewPlace}
              />
            ) : (
              <PlacesSuggestedPane
                locale={locale}
                places={places}
                defaultPlaceId={defaultPlace?.id ?? null}
                position={position}
                positionPending={positionPending}
                positionFailed={positionFailed}
                onLocate={askPosition}
                settings={settings}
                onSettings={setSettings}
                client={client}
                onAdd={onAddSuggestion}
                onOpen={(suggestion, reference) =>
                  setDetail({ suggestion, reference })
                }
              />
            )}
          </>
        )}
        {deleting && deletingPlace && (
          <PlaceDeleteDialog
            locale={locale}
            name={placeLabel(deletingPlace)}
            pendingPlans={deleting.pendingPlans}
            onCancel={() => setDeleting(null)}
            onConfirm={confirmDelete}
            onOpenPlan={onOpenPlan}
          />
        )}
      </main>
    </PlaceLightMapContext.Provider>
  );
}
