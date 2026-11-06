"use client";

import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { message } from "portal/i18n.js";
import { placeCoordinates, placeDistanceKm } from "portal/planner/state.js";
import { useEffect, useMemo, useState } from "react";
import {
  driveDurationLabel,
  placeKindsLabel,
  placeRankFactsLabel,
  placesCaptionWords,
  placesDateLabel,
  placesDistanceLabel,
  placesFoundLabel,
  placesText,
} from "../places-copy.js";
import { readPlaceClouds } from "../places-forecast.js";
import { driveTimeEstimate, placeNightRank } from "../places-rank.js";
import { placesReferenceNight } from "../places-weather.js";
import {
  alreadyMinePlace,
  compareSky,
  defaultPlaceOf,
  formatMagnitude,
  itineraryUrl,
  placeKinds,
  placeLabel,
  placesRadiiKm,
  placesReferenceOf,
  sortSuggestions,
  suggestionLinkId,
} from "../places-rules.js";
import {
  PlaceAttribution,
  PlaceCaution,
  PlaceChevron,
  PlaceFactsLine,
  PlaceKindBadge,
  PlaceKindIcon,
  PlacePlusIcon,
  PlaceRouteIcon,
  PlaceSkyLine,
  PlacesFromPositionButton,
  SkyDeltaBadge,
  usePlaceSky,
} from "./PlacesParts.js";

// "Lieux suggérés": the named places the service finds around one of my places
// or around the browser's position, with their darkness compared. It lives in
// two places — the "Lieux" view and the place picker's "Trouver un lieu idéal"
// — with the same controls, list, states, attribution and caution; from the
// editor of a place (`useMode`) each card offers "Utiliser" instead of
// "Ajouter"; in the picker (`pickMode`) "Ajouter" adds the place and hands it
// back to be chosen.

/** The settings of a search, as the screens start them. */
export function initialPlacesSettings(around = null) {
  return {
    around,
    radiusKm: 60,
    sort: "darkest",
    kinds: ["viewpoint", "campsite", "park"],
  };
}

const failureKeys = {
  offline: "placesOffline",
  disabled: "placesDisabled",
  source: "placesSourceUnavailable",
  gone: "placesSourceUnavailable",
};

/** Why the list is not fresh, and the date of the places kept when there are some. */
export function PlacesFailureNotice({ locale, failure, keptAt = null }) {
  return (
    <div className="places-notice" role="status" data-failure={failure}>
      {!(failure === "offline" && keptAt) && (
        <p>{message(locale, failureKeys[failure] || failureKeys.source)}</p>
      )}
      {keptAt && (
        <p className="places-muted">
          {placesText(
            locale,
            failure === "offline"
              ? "placesOfflineResults"
              : "placesKeptResults",
            {
              date: placesDateLabel(locale, keptAt),
            },
          )}
        </p>
      )}
    </div>
  );
}

/**
 * One suggestion: its name, kind and distance, its sky and how it compares,
 * "Ajouter" or "Déjà dans vos lieux". A press on the card opens its detail.
 */
export function SuggestionCard({
  locale,
  place,
  reference,
  referenceSky,
  mine,
  adding = false,
  rank = null,
  useMode = false,
  onAdd,
  onUse = () => {},
  onOpen,
}) {
  const km = placeDistanceKm(reference, place);
  const comparison = compareSky(place.sky?.sqm, referenceSky?.sqm);
  const drive = driveTimeEstimate(km).minutes;
  return (
    <li className="places-card" data-place={suggestionLinkId(place)}>
      <button
        type="button"
        className="places-card-open"
        onClick={() => onOpen(place)}
      >
        <span className="places-card-body">
          <strong className="places-card-name">{place.name}</strong>
          {/* The type in the badge of its tint, then the distance and
              the drive time in grey. */}
          <span className="places-kind-line">
            <PlaceKindBadge locale={locale} kind={place.type} />
            {km !== null && (
              <span>
                {[
                  placesDistanceLabel(locale, km),
                  drive === null ? null : driveDurationLabel(locale, drive),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </span>
          <PlaceSkyLine locale={locale} sky={place.sky} fine />
          {/* What the source says, when it says it. */}
          {place.description && (
            <p className="places-description" data-testid="places-description">
              {place.description}
            </p>
          )}
          <PlaceFactsLine locale={locale} place={place} />
          {rank && (
            <p className="places-facts-line" data-facts>
              {placeRankFactsLabel(locale, rank)}
            </p>
          )}
        </span>
        <PlaceChevron />
      </button>
      <div className="places-card-actions">
        {comparison && referenceSky ? (
          <SkyDeltaBadge
            locale={locale}
            comparison={comparison}
            place={{ name: place.name, sqm: place.sky.sqm }}
            reference={reference}
            referenceSky={referenceSky}
          />
        ) : (
          <span />
        )}
        <span className="places-card-buttons">
          {!useMode && mine && (
            <span className="places-already">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m5 12 5 5 9-10" />
              </svg>
              {message(locale, "placesAlreadyMine")}
            </span>
          )}
          {/* « Itinéraire » is the direct alternative of « Ajouter », the
              primary of the card. */}
          <a
            className="btn-secondary places-route"
            href={itineraryUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${placesText(locale, "placesRouteSemantics", { name: place.name })} ${message(locale, "placesNewTab")}`}
          >
            <PlaceRouteIcon />
            {message(locale, "placesRoute")}
          </a>
          {useMode ? (
            // From the editor of a place: "Utiliser" fills its point, name
            // and type; nothing is created. It is the action of the card, as
            // "Ajouter" is.
            <button
              type="button"
              className="btn-primary"
              aria-label={placesText(locale, "placesUseSemantics", {
                name: place.name,
              })}
              onClick={() => onUse(place)}
            >
              {message(locale, "placesUse")}
            </button>
          ) : mine ? null : (
            <button
              type="button"
              className="btn-primary"
              disabled={adding}
              aria-label={placesText(locale, "placesAddSuggestionSemantics", {
                name: place.name,
              })}
              onClick={() => onAdd(place)}
            >
              <PlacePlusIcon />
              {message(locale, "placesAddSuggestion")}
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * What a search answered, as the screen shows it: the places in order with
 * their cards, or why there are none; the caution and the attribution close
 * the list. `outcome` is `null` while the service is being asked.
 */
export function SuggestedResults({
  locale,
  outcome,
  reference,
  referenceSky,
  sort,
  mine,
  addingId = null,
  clouds = null,
  night = null,
  useMode = false,
  onAdd,
  onUse,
  onOpen,
}) {
  if (!outcome)
    return (
      <LoadingState className="places-loading" testId="places-searching">
        {message(locale, "placesSearching")}
      </LoadingState>
    );
  const { page, failure } = outcome;
  // "Meilleur cette nuit" needs a live forecast: offline, the suggestions
  // kept from an earlier search show their estimates and nothing more.
  const wantsRank = sort === "bestTonight" && failure !== "offline";
  const ranking =
    wantsRank && page?.places.length && clouds
      ? placeNightRank({
          places: page.places.map((place) => ({
            id: place.id,
            distanceKm: placeDistanceKm(reference, place),
            sqm: place.sky?.sqm ?? null,
          })),
          forecasts: Object.fromEntries(
            page.places.map((place) => [
              place.id,
              Number.isFinite(clouds[place.id])
                ? { cloud: clouds[place.id] }
                : null,
            ]),
          ),
          referenceNight: night,
        })
      : null;
  const rankingLoading = wantsRank && !!page?.places.length && !clouds;
  const ranked = ranking?.anyForecast ? ranking : null;
  const rankNote =
    wantsRank && page?.places.length && clouds && !ranked
      ? message(locale, "placesForecastsUnavailable")
      : null;
  const byId = new Map((page?.places ?? []).map((place) => [place.id, place]));
  const places = !page
    ? []
    : ranked
      ? ranked.ranked.map((entry) => byId.get(entry.id))
      : sortSuggestions(
          page.places,
          sort === "bestTonight" ? "darkest" : sort,
          reference,
        );
  const caption = placesCaptionWords(locale, {
    reference,
    referenceSky,
    ranked: !!ranked,
  });
  const rankOf = new Map(
    (ranked?.ranked ?? []).map((entry) => [entry.id, entry]),
  );
  return (
    <>
      {failure && (
        <PlacesFailureNotice
          locale={locale}
          failure={failure}
          keptAt={page?.fetchedAt ?? null}
        />
      )}
      {page && (
        <>
          <h3 className="places-found">
            {placesFoundLabel(locale, places.length)}
          </h3>
          {/* « Une ligne, puis ⓘ »: one line of data warning under the
              counter — the ranking's when « Meilleur cette nuit » ranks, else
              the distances and the drive times — and today's whole caption
              behind the ⓘ. */}
          <InfoLine
            locale={locale}
            className="places-caption-line"
            text={caption.line}
            title={caption.title}
            body={caption.paragraphs[0]}
            testId="places-caption-info"
          >
            {caption.paragraphs.slice(1).map((paragraph) => (
              <p key={paragraph} className="info-dialog-text">
                {paragraph}
              </p>
            ))}
          </InfoLine>
          {rankNote && (
            <p className="places-muted" data-forecasts-unavailable>
              {rankNote}
            </p>
          )}
          {rankingLoading && (
            <LoadingState className="places-loading" data-ranking>
              {message(locale, "placesRanking")}
            </LoadingState>
          )}
          {!places.length && !failure && (
            <p className="places-muted">{message(locale, "placesNoResult")}</p>
          )}
          <ul className="places-list places-suggestions">
            {(rankingLoading ? [] : places).map((place) => (
              <SuggestionCard
                key={place.id}
                locale={locale}
                place={place}
                reference={reference}
                referenceSky={referenceSky}
                mine={alreadyMinePlace(place, mine)}
                adding={addingId === place.id}
                rank={rankOf.get(place.id) ?? null}
                useMode={useMode}
                onAdd={onAdd}
                onUse={onUse}
                onOpen={onOpen}
              />
            ))}
          </ul>
          {page.truncated && (
            <p className="places-muted">{message(locale, "placesTruncated")}</p>
          )}
          <PlaceCaution>{message(locale, "placesNotVerified")}</PlaceCaution>
        </>
      )}
      <PlaceAttribution locale={locale} />
    </>
  );
}

const sortChoices = ["distance", "darkest", "bestTonight"];
const sortLabelKey = {
  distance: "placesSortDistance",
  darkest: "placesSortDarkest",
  bestTonight: "placesSortBestTonight",
};

/** A small tick, the mark of the chosen row of a sheet. */
function ChoiceTick() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="places-choice-tick"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

function FieldChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="places-field-chevron"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * A field that opens a choice: the label above,
 * the value under it and a chevron, in the look of "Autour de" and
 * "Rayon".
 */
export function PlacesChoiceField({ label, value, onOpen, ...rest }) {
  return (
    <button
      type="button"
      className="places-field places-field-button"
      aria-haspopup="dialog"
      onClick={onOpen}
      {...rest}
    >
      <span className="places-field-text">
        <span className="places-field-label">{label}</span>
        <span className="places-field-value">{value}</span>
      </span>
      <FieldChevron />
    </button>
  );
}

/**
 * The rows of the sheet "Trier par": one row per sort, the current one
 * ticked, a tap chooses (and the sheet closes). "Meilleur cette nuit" says
 * how it ranks; offline it is greyed with its reason (the forecast of tonight
 * is what it needs).
 */
export function PlacesSortChoices({ locale, sort, offline, onChoose }) {
  return (
    <ul
      className="places-choices"
      role="radiogroup"
      aria-label={message(locale, "placesSortBy")}
    >
      {sortChoices.map((value) => {
        const unavailable = value === "bestTonight" && offline;
        const checked = sort === value && !unavailable;
        return (
          <li key={value}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={unavailable}
              className={`places-choice${checked ? " is-selected" : ""}`}
              data-sort={value}
              onClick={() => onChoose(value)}
            >
              <span className="places-choice-text">
                <span className="places-choice-label">
                  {message(locale, sortLabelKey[value])}
                </span>
                {value === "bestTonight" && (
                  <span className="places-choice-hint">
                    {message(
                      locale,
                      offline
                        ? "placesSortBestTonightOffline"
                        : "placesBestTonightCaption",
                    )}
                  </span>
                )}
              </span>
              {checked && <ChoiceTick />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The rows of the sheet "Types de lieux": four check rows with the cards'
 * pictograms, applied at once.
 */
export function PlacesKindChoices({ locale, kinds, onToggle }) {
  return (
    <ul
      className="places-choices"
      role="group"
      aria-label={message(locale, "placesKindsLabel")}
    >
      {placeKinds.map((kind) => (
        <li key={kind}>
          <label className="places-choice is-check" data-kind={kind}>
            <span className="places-choice-icon" aria-hidden="true">
              <PlaceKindIcon kind={kind} />
            </span>
            <span className="places-choice-label">
              {placeKindsLabel(locale, kind)}
            </span>
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={() => onToggle(kind)}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * The second line of fields of "Lieux suggérés": "Trier par" and "Types
 * de lieux · n sur 4", each opening a dialog — the same family of
 * controls as "Autour de" and "Rayon", in place of seven pills.
 */
export function PlacesFilterFields({
  locale,
  sort,
  kinds,
  offline = false,
  onSort,
  onKinds,
}) {
  const [open, setOpen] = useState(null);
  // Offline, "Meilleur cette nuit" cannot be the sort: the field says what
  // the list is actually sorted by.
  const shownSort = offline && sort === "bestTonight" ? "darkest" : sort;
  const toggleKind = (kind) =>
    onKinds(
      placeKinds.filter((entry) =>
        entry === kind ? !kinds.includes(kind) : kinds.includes(entry),
      ),
    );
  return (
    <>
      <div className="places-fields is-filters">
        <PlacesChoiceField
          data-field="sort"
          label={message(locale, "placesSortBy")}
          value={message(locale, sortLabelKey[shownSort])}
          onOpen={() => setOpen("sort")}
        />
        <PlacesChoiceField
          data-field="kinds"
          label={message(locale, "placesKindsLabel")}
          value={placesText(locale, "placesKindsValue", {
            n: kinds.length,
            total: placeKinds.length,
          })}
          onOpen={() => setOpen("kinds")}
        />
      </div>
      {open === "sort" && (
        <WebDialog
          className="places-choice-dialog"
          title={message(locale, "placesSortBy")}
          closeLabel={message(locale, "placePickerClose")}
          closeOnBackdrop
          onClose={() => setOpen(null)}
        >
          <PlacesSortChoices
            locale={locale}
            sort={shownSort}
            offline={offline}
            onChoose={(value) => {
              onSort(value);
              setOpen(null);
            }}
          />
        </WebDialog>
      )}
      {open === "kinds" && (
        <WebDialog
          className="places-choice-dialog"
          title={message(locale, "placesKindsLabel")}
          closeLabel={message(locale, "placePickerClose")}
          closeOnBackdrop
          onClose={() => setOpen(null)}
          footer={
            <button
              type="button"
              className="btn-link"
              onClick={() => setOpen(null)}
            >
              {message(locale, "placePickerClose")}
            </button>
          }
        >
          <PlacesKindChoices
            locale={locale}
            kinds={kinds}
            onToggle={toggleKind}
          />
        </WebDialog>
      )}
    </>
  );
}

/**
 * The reference of a search: "Autour de" a place of mine (the default one
 * until another is chosen) or the browser's position. With no place of mine to
 * start from, the position is the start (the case
 * of "Trouver un lieu idéal" at the first launch).
 */
export function placesSearchReference({
  locale,
  places,
  defaultPlaceId,
  around,
  position,
}) {
  const usable = places.filter((place) => placeCoordinates(place));
  if (position && (around === "position" || !usable.length))
    return {
      name: message(locale, "placesAroundPosition"),
      ...position,
      placeId: null,
    };
  return placesReferenceOf(
    usable.find((place) => place.id === around) ??
      defaultPlaceOf(usable, defaultPlaceId),
    undefined,
  );
}

/**
 * "Lieux suggérés": the controls, the search and its results. The settings
 * are the parent's (`settings`, `onSettings`) so that they survive a visit to
 * a detail; `client` is the service's reads (`createPlacesClient`); `onAdd`
 * adds a suggestion to my places and answers the place (or `null`).
 */
export function PlacesSuggestedPane({
  locale,
  places,
  defaultPlaceId = null,
  position = null,
  positionPending = false,
  positionFailed = false,
  onLocate = null,
  settings,
  onSettings,
  pickMode = false,
  useMode = false,
  client,
  onAdd = async () => null,
  onUse = () => {},
  onPicked = () => {},
  onOpen,
}) {
  const reference = useMemo(
    () =>
      placesSearchReference({
        locale,
        places,
        defaultPlaceId,
        around: settings.around,
        position,
      }),
    [locale, places, defaultPlaceId, settings.around, position],
  );
  const referenceSky = usePlaceSky(reference);
  const [outcome, setOutcome] = useState(null);
  const [clouds, setClouds] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [addFailed, setAddFailed] = useState(false);
  const kindsKey = settings.kinds.join(",");
  const latitude = reference?.latitude;
  const longitude = reference?.longitude;
  useEffect(() => {
    setOutcome(null);
    if (latitude === undefined || !settings.kinds.length) return undefined;
    const controller = new AbortController();
    client
      .search(
        {
          latitude,
          longitude,
          radiusKm: settings.radiusKm,
          kinds: settings.kinds,
          locale,
        },
        { signal: controller.signal },
      )
      .then((result) => {
        if (!controller.signal.aborted) setOutcome(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setOutcome({ page: null, failure: "source" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, latitude, longitude, settings.radiusKm, kindsKey, locale]);

  // "Meilleur cette nuit": tonight's clouds at each suggestion, read only
  // when the sort is chosen, five at a time, kept for the session.
  const offline = outcome?.failure === "offline";
  const referencePlace = useMemo(
    () =>
      places.find((place) => place.id === reference?.placeId) ??
      (reference
        ? { latitude: reference.latitude, longitude: reference.longitude }
        : null),
    [places, reference],
  );
  const night = useMemo(
    () =>
      referencePlace ? placesReferenceNight({ place: referencePlace }) : null,
    [referencePlace],
  );
  const suggestions = outcome?.page?.places;
  const wantsClouds = settings.sort === "bestTonight" && !offline;
  useEffect(() => {
    setClouds(null);
    if (!wantsClouds || !suggestions?.length) return undefined;
    if (!night) {
      setClouds({});
      return undefined;
    }
    const controller = new AbortController();
    readPlaceClouds({
      places: suggestions.map((place) => ({
        id: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
      night,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) setClouds(result);
    });
    return () => controller.abort();
  }, [wantsClouds, suggestions, night]);

  const add = async (place) => {
    setAddingId(place.id);
    setAddFailed(false);
    let added = null;
    try {
      added = await onAdd(place);
    } finally {
      setAddingId(null);
    }
    if (!added) setAddFailed(true);
    else if (pickMode) onPicked(added);
  };
  const change = (patch) => onSettings({ ...settings, ...patch });
  const usable = places.filter((place) => placeCoordinates(place));
  // What the field shows is the search's own start: a place's id, "position",
  // or nothing.
  const aroundValue = reference ? (reference.placeId ?? "position") : "";
  // "Recherche de votre position…" while the browser answers and
  // there is no place of mine to start from.
  const locating = !reference && positionPending && !usable.length;
  return (
    <div className="places-suggested" data-pick-mode={pickMode || undefined}>
      <div className="places-fields">
        <label className="places-field">
          <span>{message(locale, "placesAround")}</span>
          <select
            value={aroundValue}
            onChange={(event) => change({ around: event.target.value })}
          >
            {usable.map((place) => (
              <option key={place.id} value={place.id}>
                {placeLabel(place)}
              </option>
            ))}
            {position && (
              <option value="position">
                {message(locale, "placesAroundPosition")}
              </option>
            )}
            {!usable.length && !position && (
              <option value="">
                {locating ? message(locale, "placesAroundSearching") : "—"}
              </option>
            )}
          </select>
        </label>
        <label className="places-field is-radius">
          <span>{message(locale, "placesRadius")}</span>
          <select
            value={settings.radiusKm}
            onChange={(event) =>
              change({ radiusKm: Number(event.target.value) })
            }
          >
            {placesRadiiKm.map((km) => (
              <option key={km} value={km}>
                {placesText(locale, "placesRadiusValue", { km })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PlacesFilterFields
        locale={locale}
        sort={settings.sort}
        kinds={settings.kinds}
        offline={offline}
        onSort={(sort) => change({ sort })}
        onKinds={(kinds) => change({ kinds })}
      />
      {onLocate && (
        <PlacesFromPositionButton
          locale={locale}
          pending={positionPending}
          failed={positionFailed}
          onLocate={onLocate}
        />
      )}
      {addFailed && (
        <p className="places-notice is-error" role="alert">
          {message(locale, "placesAddFailed")}
        </p>
      )}
      {locating ? (
        <LoadingState className="places-loading" data-locating>
          {message(locale, "placesAroundSearching")}
        </LoadingState>
      ) : !reference ? (
        <p className="places-muted" role="status">
          {message(locale, "placesNoReference")}
        </p>
      ) : !settings.kinds.length ? (
        <p className="places-muted" role="status">
          {message(locale, "placesNoKinds")}
        </p>
      ) : (
        <SuggestedResults
          locale={locale}
          outcome={outcome}
          reference={reference}
          referenceSky={referenceSky}
          sort={settings.sort}
          clouds={clouds}
          night={night}
          mine={places}
          addingId={addingId}
          useMode={useMode}
          onAdd={add}
          onUse={onUse}
          onOpen={(place) => onOpen(place, reference)}
        />
      )}
    </div>
  );
}
