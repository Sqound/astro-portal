"use client";

import { rememberPlannerOpening } from "../planner-opening.js";
import { rememberFramingEditorDraft } from "../framing-editor-draft.js";
import { defineEquipmentHref } from "../equipment-picker.js";
import {
  equipmentPickerLists,
  equipmentPickerPropsFrom,
} from "../equipment-picker-lists.js";
import { useEquipmentReturn } from "./useEquipmentReturn.js";
import {
  CHANGE_SIGNAL_EVENT,
  startChangeSubscription,
} from "portal/planner/change-subscription.js";
import { executionByPlanIdOf, planExecutionOf } from "../plan-execution.js";
import {
  loadPlanSessions,
  planSessionHref,
  planToDebrief,
} from "../plan-sessions.js";
import {
  tonightDebriefDue,
  tonightDebriefWords,
} from "../tonight-debrief-due.js";
import { StatusTag } from "portal/components/status/StatusTag.js";
import { PlanExecutionCard } from "./PlanExecutionCard.js";
import {
  readTonightChoice,
  rememberTonightChoice,
} from "../tonight-place-choice.js";
import { Body, Illumination } from "astronomy-engine";
import {
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";
import { PlannerPlaceDetails } from "portal/components/planner/PlannerPlaceDetails.js";
import { PlannerPlaceDialog } from "portal/components/planner/PlannerPlaceDialog.js";
import { HourlyForecast } from "./HourlyForecast.js";
import { NightZone, VerdictSection } from "./NightDetailParts.js";
import { DarknessSettingButton } from "./DarknessDialog.js";
import { TonightSlotDialog } from "./TonightSlotDialog.js";
import { nightStory } from "portal/night-story.js";
import { darknessLabelKey } from "../darkness-setting.js";
import { keepLastCharactersTogether } from "../line-break.js";
import { zoneOffsetMinutes } from "../horizon-path-mode.js";
import {
  plansWithTonightSlot,
  readTonightSlotRecord,
  tonightChosenSlot,
  tonightSlotPlan,
  tonightSnappedSlot,
  writeTonightSlotRecord,
} from "../tonight-slot.js";
import { writePlannerDocument } from "../quick-plan-web.js";
import { useSpacePlaces } from "./useSpacePlaces.js";
import { readDefaultPlaceId } from "../places-preferences.js";
import { transposeDeviceSlot } from "../night-slot-transpose.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { requestAstronomyWeather } from "portal/astronomy-weather.js";
import { message } from "portal/i18n.js";
import {
  isSelectionTarget,
  selectionModeOfEquipmentMode,
  targetMatchesSelectionMode,
} from "astro-core/target-selection.js";
import {
  requestPlannerSkyDirection,
  requestPlannerSkyQuality,
} from "portal/planner/sky-quality.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadTonightDocument, readStorage } from "../tonight-document.js";
import {
  applyDarknessToPlans,
  readDarknessPreference,
  writeDarknessPreference,
} from "../darkness-setting.js";
import { ownedFiltersUnion, readOwnedFilters } from "../owned-filters.js";
import {
  fieldOfView,
  equipmentProfilesFromInventory,
  resolveEquipmentProfiles,
  forecastMoonOfNight,
  planNight,
  planNightSpanSky,
  planningTargets,
  resolveEquipment,
} from "../planner.js";
import {
  observationComfortFamily,
  observationComfortRange,
  readObservationComfort,
  writeObservationComfort,
} from "../observation-comfort.js";
import { hipsPreviewUrl, withHorizonMask } from "../recommendations.js";
import { targetNightPath } from "../target-path.js";
import { targetTonightScore } from "../target-score.js";
import {
  placeForecastAvailability,
  placeForecastIsNear,
  tonightOverview,
  tonightDate,
  tonightPlansHavePlacedTarget,
  tonightSubject,
} from "../tonight-overview.js";
import { fill } from "../wind-section.js";
import {
  tonightSuggestions,
  tonightVisibleSuggestions,
  tonightSuggestionPosition,
  tonightPlacementInputs,
  withMaskHidden,
} from "../tonight-suggestions.js";
import { suggestNight } from "../suggest-night.js";
import { suggestionSpanFromNow } from "../suggest-span.js";
import { targetIdsTakenOnNight } from "../night-taken-targets.js";
import { ordinalRank } from "../ordinal-rank.js";
import { quickPlanEquipment } from "../quick-plan-equipment.js";
import {
  observingBinoculars,
  readTonightSuggestionsMode,
  subscribeTonightSuggestionsMode,
  tonightSuggestionsEquipment,
  tonightSuggestionsMode,
  tonightSuggestionsModeLine,
  tonightVisualFactsLine,
  writeTonightSuggestionsMode,
} from "../tonight-suggestions-mode.js";
import { planStartEquipment } from "portal/planner/default-configuration.js";
import { loadSuggestionHistory } from "../suggest-history-client.js";
import { suggestionNoteNow } from "../suggestion-note.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { placeLightMapEntry } from "../places-light-map-access.js";
import { LockedCardDialog } from "../offers-slot.js";
import { suggestMessage } from "../suggest-messages.js";
import {
  createWebQuickPlanAction,
  planMadeElsewhere,
  quickPlanDialogData,
  readQuickPlanEraseState,
  quickPlanOffersHref,
} from "../quick-plan-web.js";
import { SuggestNightDialog } from "./SuggestNightDialog.js";
import { SuggestFiltersDialog } from "./SuggestFiltersDialog.js";
import {
  filterSuggestionPool,
  nightPeriods,
  normalizeSuggestFilters,
  suggestFiltersActiveCount,
  suggestionFilteredCount,
  suggestionPeriodSpans,
  suggestionPoolQuery,
  suggestionTargetMatches,
} from "../suggest-filters.js";
import { horizonMaskHasProfile } from "portal/planner/horizon-mask.js";
import {
  readSuggestFilters,
  subscribeSuggestFilters,
  suggestFilterBadges,
  suggestFiltersButtonLabel,
  suggestFiltersLine,
  writeSuggestFilters,
} from "../suggest-filters-web.js";
import { nextNightDate, suggestionDefaults } from "../suggest-dialog-model.js";
import { TargetTile } from "portal/components/ObjectPictogram.js";
import { AvailabilityGraph } from "./AvailabilityGraph.js";
import { quickPlanMessage } from "../quick-plan-messages.js";
import { PlanExistsDialog, planExistsIntro } from "./PlanExistsDialog.js";
import {
  tonightStickyPlaceHidden,
  tonightVerdictStatus,
  tonightWords,
} from "../tonight-words.js";
import { planFriseScale } from "../plan-frise.js";
import { planFriseSpanLine } from "../plan-frise-words.js";
import { planFriseInput, planFriseOf } from "../plan-frise-input.js";
import { clock } from "../wind-section.js";
import {
  PlanFrise,
  PlanTargetViewButtons,
  usePlanTargetView,
} from "./PlanFrise.js";
import { PlanTargetDialog } from "./PlanTargetDialog.js";
import { planTargetRowWords } from "../plan-target-words.js";
import { scorePlanTargets } from "../tonight-plan-targets.js";
import {
  tonightPlanIsVisual,
  tonightPlanTelescope,
} from "../tonight-plan-telescope.js";
import { normalizeWindTolerance } from "../wind.js";
import {
  placeScoreSky,
  placeSkyBrightness,
  placeSkyLoading,
  previewSkyProps,
  scoreSkyOfChoice,
} from "../sky-brightness.js";
import { SkyQualityCards, usePlaceSkyMeasures } from "./SkyBrightnessParts.js";
import { TargetScoreExplained } from "./TargetScoreExplained.js";
import { useTargetPhotoViewer } from "./TargetPhotoViewer.js";
// The multi-night plans, the open core's.
import {
  noteSuggestionRead,
  suggestionsForecastNoticeDuration,
} from "../suggestions-forecast-notice.js";
import { visualCardAdviceText } from "../visual-filter-advice.js";
import { visualInventoryOf } from "../visual-pairs.js";
import "../projects/components/register.js";

// "Cette nuit" on the web: the night at a glance for the place of tonight's
// plan — the dark night and its timeline, the weather tiles, the sky quality,
// tonight's plans and "À voir ce soir". The numbers come from `tonightOverview`
// (`tonight-overview.js`); the words from `tonight-words.js`. A visitor's plans
// are the browser's (its planner document); a signed-in person's, the space's.
// Nothing here writes a plan: the planner opens from the page.

const coordinatesOf = (place) =>
  place &&
  Number.isFinite(Number(place.latitude)) &&
  Number.isFinite(Number(place.longitude))
    ? { latitude: Number(place.latitude), longitude: Number(place.longitude) }
    : null;

// The saved place of the same id (its typed sky background), else the
// place itself.
function knownPlaceOf(document, place) {
  if (!place?.id) return place;
  const known = Array.isArray(document?.knownLocations)
    ? document.knownLocations.find((entry) => entry?.id === place.id)
    : null;
  return known ? { ...place, skyEntered: known.skyEntered } : place;
}

// The glyph of `map_outlined`, as the other entries of the light-pollution
// map draw it (`PlaceLightMapEntry.js`).
function MapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" />
    </svg>
  );
}

/**
 * The light-pollution button of the place's details, from
 * `placeLightMapEntry`: the glyph and the gesture added. `open` opens the map
 * centred on the place, `heldBack` the purchase box (a dialog).
 */
function placeDetailsLightMap({ onOpen, onHeld, ...entry }) {
  const found = placeLightMapEntry(entry);
  if (!found) return null;
  return {
    ...found,
    icon: <MapIcon />,
    onOpen: found.access === "open" ? () => onOpen(found.focus) : onHeld,
  };
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

// The pencil of the site (the one of the session pages' « Modifier »), drawn
// with the button's own text colour.
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
    </svg>
  );
}

// Once the place section has gone under the portal's header, a bar laid over
// the page right under that header sums the night up — the place and the
// date, tonight's plans and the night's length, the score in its level's
// tint with the level's word — and takes the page back to its top. It takes
// no room (a fixed box, the page under it is laid out as without it).
// Whether the place has gone under the line is read at every scroll, on the
// DOM node directly: the page never renders for it, and the bar can never
// lag behind the scroll. Faded in and out over 150 ms by the stylesheet, at
// once under "reduce motion".
function StickyPlaceBar({ sticky, onOpenPlace }) {
  const box = useRef(null);
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const update = () => {
      const header = document.querySelector(".portal-header");
      const place = document.querySelector('[data-testid="tonight-place"]');
      const line = header
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0;
      const top = `${line}px`;
      if (node.style.top !== top) node.style.top = top;
      const hidden = tonightStickyPlaceHidden({
        placeBottom: place ? place.getBoundingClientRect().bottom : NaN,
        line,
      });
      const visible = hidden ? "true" : "false";
      if (node.dataset.visible !== visible) node.dataset.visible = visible;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const toTop = () => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };
  const score = sticky.score;
  // The place part of the bar — the name and the date of line 1 — is a
  // button of its own, which opens the place's details; the rest of the bar
  // takes the page back to its top. Two buttons never nest:
  // `tonight-sticky-top` fills the bar under its content
  // (`tonight-sticky-inner` lets the touches through), and the place button,
  // in the flow of line 1, answers first.
  return (
    <div
      ref={box}
      className="tonight-sticky"
      data-visible="false"
      data-testid="tonight-sticky"
    >
      <div className="tonight-sticky-bar" onClick={toTop}>
        <button
          type="button"
          className="tonight-sticky-top"
          aria-label={sticky.label}
        />
        <span className="tonight-sticky-inner">
          <span className="tonight-sticky-lines">
            {onOpenPlace ? (
              <button
                type="button"
                className="tonight-sticky-place-open tonight-sticky-first"
                aria-label={sticky.placeOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPlace();
                }}
              >
                <span className="tonight-sticky-place">
                  {keepLastCharactersTogether(sticky.place)}
                </span>
                <span className="tonight-sticky-date">· {sticky.date}</span>
              </button>
            ) : (
              <span className="tonight-sticky-first">
                <span className="tonight-sticky-place">
                  {keepLastCharactersTogether(sticky.place)}
                </span>
                <span className="tonight-sticky-date">· {sticky.date}</span>
              </span>
            )}
            <span className="tonight-sticky-line">{sticky.line}</span>
          </span>
          {score.state === "ready" ? (
            <span
              className="tonight-sticky-score"
              data-level={score.level}
              data-testid="tonight-sticky-score"
            >
              <span className="tonight-sticky-score-value">{score.value}</span>
              <span className="tonight-sticky-score-word">{score.word}</span>
            </span>
          ) : score.state === "waiting" ? (
            <span
              className="tonight-sticky-score is-waiting"
              data-testid="tonight-sticky-score"
            >
              <BrandLoader size={24} />
            </span>
          ) : (
            <span
              className="tonight-sticky-score is-none"
              data-testid="tonight-sticky-score"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z" />
                <path d="M4 4l16 16" />
              </svg>
              <span className="tonight-sticky-score-word">{score.none}</span>
            </span>
          )}
          <svg
            className="tonight-sticky-chevron"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M6 15l6-6 6 6" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/**
 * The icon of the photo / visual button of « À voir ce soir »: the plan
 * type's drawings, at the size of the ↻ beside it.
 */
function SuggestionsModeIcon({ visual }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-mode={visual ? "visual" : "photo"}
    >
      {visual ? (
        <>
          <path d="M2.8 12s3.3-5.6 9.2-5.6 9.2 5.6 9.2 5.6-3.3 5.6-9.2 5.6S2.8 12 2.8 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </>
      ) : (
        <>
          <path d="M4.5 8.5h3l1.3-2h6.4l1.3 2h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
          <circle cx="12" cy="14" r="3.2" />
        </>
      )}
    </svg>
  );
}

/** The icon of a plan's type (the planner's mode icons). */
function PlanTypeIcon({ visual }) {
  return (
    <svg
      className="tonight-plan-type"
      data-plan-type={visual ? "visual" : "photo"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {visual ? (
        <>
          <path d="M2.8 12s3.3-5.6 9.2-5.6 9.2 5.6 9.2 5.6-3.3 5.6-9.2 5.6S2.8 12 2.8 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </>
      ) : (
        <>
          <path d="M4.5 8.5h3l1.3-2h6.4l1.3 2h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
          <circle cx="12" cy="14" r="3.2" />
        </>
      )}
    </svg>
  );
}

export function TonightPage({ locale, capabilities = null }) {
  const [loaded, setLoaded] = useState(null);
  // The choice of "Changer" is kept until the next local noon of its place
  // (`tonight-place-choice.js`) and wins over the plans while it holds.
  const [choice, setChoice] = useState(null);
  const [choosing, setChoosing] = useState(false);
  // The place's details (the position on the map, the drawn horizon), and the
  // place editor opened from them.
  const [placeDetails, setPlaceDetails] = useState(false);
  const [placeEditor, setPlaceEditor] = useState(null);
  // The light-pollution map opened from the details (`{ focus }`), and the
  // purchase box a held back button opens.
  const [lightMapOpen, setLightMapOpen] = useState(null);
  const [lightMapBox, setLightMapBox] = useState(false);
  const [now] = useState(() => Date.now());
  const chosen = choice && now < choice.until ? choice.place : null;
  function setChosen(place) {
    setChoice(rememberTonightChoice(place, Date.now()));
  }
  useEffect(() => {
    const kept = readTonightChoice(Date.now());
    if (kept) setChoice(kept);
  }, []);
  const [forecast, setForecast] = useState({ status: "idle", hourly: null });
  // The hourly strip's refresh keeps the night on screen while it asks.
  const [forecastRefresh, setForecastRefresh] = useState(0);
  // "Réessayer" under "Prévision indisponible" asks again.
  const [forecastAttempt, setForecastAttempt] = useState(0);
  const [skyQuality, setSkyQuality] = useState({ status: "idle", value: null });
  const placeSkyMeasures = usePlaceSkyMeasures(Boolean(loaded?.authenticated));
  // The grid of the horizon map's light layer, for the ranking of "À voir
  // ce soir" (null without a raster or a place).
  const [skyDirection, setSkyDirection] = useState(null);
  const [targets, setTargets] = useState({ status: "idle", list: [] });
  const [explained, setExplained] = useState(null);
  // The target of tonight's plan whose dialog is
  // open, `{ plan, item }`.
  const [planTarget, setPlanTarget] = useState(null);
  // The full-screen photo of a target, opened from a row's thumbnail.
  const photo = useTargetPhotoViewer({ locale });
  const [inventory, setInventory] = useState([]);
  // "Ma configuration par défaut" of the signed-in space.
  const [defaultConfiguration, setDefaultConfiguration] = useState(null);
  // « Matériel par défaut » of the space (`defaults` of `GET
  // /api/equipment`, `null` until it is read) and whether the space hides it.
  const [defaultEquipment, setDefaultEquipment] = useState(null);
  const [hideDefaultEquipment, setHideDefaultEquipment] = useState(false);
  // The pieces « Définir mon matériel » brought back (`{ telescope: id, … }`),
  // waiting for « Matériel de l'aperçu » to take them into its draft.
  const [returnedEquipment, setReturnedEquipment] = useState(null);
  const [position, setPosition] = useState({
    key: null,
    tier: 1,
    exhausted: false,
  });
  const [expanded, setExpanded] = useState(false);
  // The mode « À voir ce soir » was switched to in this browser (`null`:
  // never), read after the first render so that the server's matches.
  const [chosenSuggestionsMode, setChosenSuggestionsMode] = useState(null);
  useEffect(() => {
    setChosenSuggestionsMode(readTonightSuggestionsMode());
    return subscribeTonightSuggestionsMode(setChosenSuggestionsMode);
  }, []);
  const [suggesting, setSuggesting] = useState(null);
  // SUGGEST-FILTERS-01: the filters of the suggestions kept in this browser
  // (read after the first render so that the server's matches), the sheet
  // that changes them, and the « Suggérer » dialog to open again with them.
  const [suggestFilters, setSuggestFilters] = useState(() =>
    normalizeSuggestFilters(null),
  );
  useEffect(() => {
    setSuggestFilters(readSuggestFilters());
    return subscribeSuggestFilters(setSuggestFilters);
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reopenSuggest, setReopenSuggest] = useState(false);
  const [planExists, setPlanExists] = useState(null);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState(null);
  // A plan made or filled for another night than the one on screen (the
  // next night, from "Suggest for the night of …") shows nowhere on this
  // page: the page says so and leads to the plan.
  const [madeElsewhere, setMadeElsewhere] = useState(null);
  const [suggestionInputs, setSuggestionInputs] = useState({
    history: [],
    continuing: [],
  });
  const say = (key, values = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      message(locale, key),
    );

  useEffect(() => {
    let cancelled = false;
    loadTonightDocument().then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A night that starts, pauses or ends on a phone changes what this page
  // says of the plan ("Nuit en cours"): the page follows the change signal
  // of a signed-in space and reads the document again, keeping what is on
  // screen when nothing changed.
  const signedIn = Boolean(loaded?.authenticated);
  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    const reread = () => {
      loadTonightDocument().then((result) => {
        if (cancelled || !result?.authenticated) return;
        setLoaded((previous) =>
          previous &&
          JSON.stringify(previous.document) === JSON.stringify(result.document)
            ? previous
            : { ...previous, ...result },
        );
      });
    };
    window.addEventListener(CHANGE_SIGNAL_EVENT, reread);
    const stop = startChangeSubscription();
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_SIGNAL_EVENT, reread);
      stop();
    };
  }, [signedIn]);
  // The plans whose night runs on a phone, by plan id (read-only here).
  const executing = useMemo(
    () => executionByPlanIdOf(loaded?.document),
    [loaded],
  );
  // The sessions of the space (the Journal's `to_debrief` lines say which
  // plans wait for their debriefing), read again on a change signal.
  const [planSessions, setPlanSessions] = useState(null);
  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    const read = () => {
      loadPlanSessions().then((result) => {
        if (!cancelled) setPlanSessions(result);
      });
    };
    read();
    window.addEventListener(CHANGE_SIGNAL_EVENT, read);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_SIGNAL_EVENT, read);
    };
  }, [signedIn]);
  const waitingPlanIds = useMemo(() => {
    const waiting = new Set();
    for (const [plannerId, entry] of planSessions ?? [])
      if (planToDebrief(entry)) waiting.add(String(plannerId));
    return waiting;
  }, [planSessions]);

  // The threshold can be changed from the night card (a dialog), so the
  // browser's preference is state.
  const [darknessPreference, setDarknessPreference] = useState(() =>
    readStorage(readDarknessPreference, "astronomical"),
  );
  // A signed-in person's places are the space's (`/v1/places`), the
  // planner's own source, with their default place; a visitor's are the
  // browser's. "Cette nuit" used to read only the plans' places and said
  // "Choisissez un lieu" to a space that had a default one.
  const placesFromSpace = Boolean(loaded?.authenticated);
  const spacePlaces = useSpacePlaces({
    active: placesFromSpace,
    email: loaded?.email || null,
    // Offline, the copy this browser keeps is shown; a failure says nothing
    // here (the planner's notice is the one that tells it).
    onError: () => {},
  });
  const knownPlaces = useMemo(() => {
    if (placesFromSpace)
      return [
        ...spacePlaces.places.filter(
          (entry) => entry.id === spacePlaces.defaultId,
        ),
        ...spacePlaces.places.filter(
          (entry) => entry.id !== spacePlaces.defaultId,
        ),
      ].filter((entry) => coordinatesOf(entry));
    return (
      Array.isArray(loaded?.document?.knownLocations)
        ? loaded.document.knownLocations
        : []
    ).filter((entry) => coordinatesOf(entry));
  }, [placesFromSpace, spacePlaces.places, spacePlaces.defaultId, loaded]);
  const defaultPlace = useMemo(() => {
    const id = placesFromSpace ? spacePlaces.defaultId : readDefaultPlaceId();
    return knownPlaces.find((entry) => entry.id && entry.id === id) ?? null;
  }, [placesFromSpace, spacePlaces.defaultId, knownPlaces]);
  // The space's places are read once before the page decides it has no place.
  const waitingForPlaces = Boolean(
    placesFromSpace && loaded?.email && !spacePlaces.loaded,
  );
  const subject = useMemo(
    () => ({
      ...tonightSubject({
        document: loaded?.document,
        now,
        chosen,
        darkness: darknessPreference,
        defaultPlace,
        knownPlaces,
      }),
      // A plan whose night runs on a phone takes no slot, no
      // threshold: it is read here, not written.
      executing,
    }),
    [
      chosen,
      darknessPreference,
      loaded,
      now,
      defaultPlace,
      knownPlaces,
      executing,
    ],
  );
  const place = subject.place;
  // The plans waiting for their debriefing at ANOTHER night or place than the
  // one on screen (the last three nights, two cards at most, then a line);
  // the plans of the night on screen carry their own button.
  const debriefWords = useMemo(() => {
    const due = tonightDebriefDue({
      plans: loaded?.document?.plans,
      waiting: waitingPlanIds,
      shownDate: subject.date,
      shownPlace: subject.place,
    });
    return due.cards.length || due.others
      ? tonightDebriefWords({ due, sessions: planSessions, locale })
      : null;
  }, [
    loaded,
    waitingPlanIds,
    subject.date,
    subject.place,
    planSessions,
    locale,
  ]);
  const coordinates = coordinatesOf(place);
  const coordinateKey = coordinates
    ? `${coordinates.latitude}|${coordinates.longitude}`
    : "";
  const timeZone = place?.timeZone || "UTC";
  const sky = useMemo(() => {
    if (!place) return null;
    try {
      return planNightSpanSky(
        { date: subject.date, darkness: subject.darkness },
        place,
      );
    } catch {
      return null;
    }
  }, [place, subject.date, subject.darkness]);

  useEffect(() => {
    if (
      !coordinates ||
      !placeForecastIsNear({ date: subject.date, now, place })
    ) {
      setForecast({ status: "idle", hourly: null });
      return undefined;
    }
    const controller = new AbortController();
    // A refresh of a night already shown keeps it; any other read
    // starts from "loading".
    setForecast((current) =>
      forecastRefresh > 0 && current.status === "ready"
        ? { ...current, refreshing: true }
        : { status: "loading", hourly: null },
    );
    requestAstronomyWeather(coordinates, {
      signal: controller.signal,
      // The person's own "Réessayer" and refresh always ask: the page
      // otherwise leaves a failed place alone until its Retry-After is over.
      refresh: forecastRefresh > 0 || forecastAttempt > 0,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setForecast({
            status: "ready",
            hourly: data.hourly,
            fetchedAt: data.fetchedAt ?? null,
            stale: data.stale === true,
          });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // The card says why — nothing answered (no connection), or the
        // service answered with an error.
        const offline =
          error instanceof TypeError ||
          (typeof navigator !== "undefined" && navigator.onLine === false);
        setForecast({
          status: "unavailable",
          hourly: null,
          failure: offline ? "network_error" : error?.code || "service_error",
        });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey, subject.date, forecastAttempt, forecastRefresh]);

  useEffect(() => {
    if (!coordinates) {
      setSkyQuality({ status: "idle", value: null });
      return undefined;
    }
    const controller = new AbortController();
    setSkyQuality({ status: "loading", value: null });
    requestPlannerSkyQuality(coordinates, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setSkyQuality({ status: "ready", value });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSkyQuality({ status: "unavailable", value: null });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey]);

  useEffect(() => {
    setSkyDirection(null);
    if (!coordinates) return undefined;
    const controller = new AbortController();
    requestPlannerSkyDirection(coordinates, { signal: controller.signal })
      .then((grid) => {
        if (!controller.signal.aborted) setSkyDirection(grid);
      })
      .catch(() => {
        // Without the grid the ranking reads the zenith sky alone.
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey]);

  const settings = subject.settings;
  const minAltitude = Number.isFinite(Number(settings?.minAltitude))
    ? Number(settings.minAltitude)
    : 30;
  const moonSeparationMinimum = Number.isFinite(
    Number(settings?.moonSeparationMinimum),
  )
    ? Number(settings.moonSeparationMinimum)
    : 25;
  // Decision of 03/11/2026: « Essentielles » + « Étendues »,
  // or the whole of the catalogues ticked.
  const poolQuery = suggestionPoolQuery(suggestFilters);
  const poolCatalogues = poolQuery.catalogues.join(",");
  const selection = poolQuery.selection;
  useEffect(() => {
    if (!coordinates) {
      setTargets({ status: "idle", list: [] });
      return undefined;
    }
    let cancelled = false;
    setTargets({ status: "loading", list: [] });
    const parameters = new URLSearchParams({
      locale,
      latitude: String(coordinates.latitude),
      minimumAltitude: String(minAltitude),
      ...(selection ? { selection } : {}),
      ...(poolCatalogues ? { catalogues: poolCatalogues } : {}),
      limit: String(poolQuery.limit),
    });
    fetch(`/api/planner-targets?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error("Planner targets unavailable.");
        return data.targets || [];
      })
      .then((list) => !cancelled && setTargets({ status: "ready", list }))
      .catch(() => !cancelled && setTargets({ status: "ready", list: [] }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey, locale, minAltitude, selection, poolCatalogues]);

  const hourly = useMemo(
    () =>
      forecast.status === "ready" && sky
        ? hourlyAstronomyForecast({
            hourly: forecast.hourly,
            night: { start: sky.darkStart, end: sky.darkEnd },
            moon: forecastMoonOfNight(sky),
          })
        : [],
    [forecast, sky],
  );
  // Tonight's slot — the pending plan's, else this
  // browser's record for tonight — and the dialog that chooses it.
  const [slotRecord, setSlotRecord] = useState(null);
  const [slotDialog, setSlotDialog] = useState(null);
  // The place change put this browser's slot back on the
  // whole astronomical night — said once, under the card.
  const [slotFellBack, setSlotFellBack] = useState(false);
  useEffect(() => {
    try {
      setSlotRecord(readTonightSlotRecord(window.localStorage));
    } catch {
      // Storage refused: no record.
    }
  }, []);
  const chosenSlot = useMemo(
    () => tonightChosenSlot(subject, slotRecord),
    [subject, slotRecord],
  );
  const forecastSummary = useMemo(() => {
    if (forecast.status !== "ready" || !sky) return null;
    try {
      return summarizeAstronomyForecast({
        hourly: forecast.hourly,
        night: {
          start: chosenSlot?.start ?? sky.darkStart,
          end: chosenSlot?.end ?? sky.darkEnd,
        },
        moon: forecastMoonOfNight(sky),
      });
    } catch {
      return null;
    }
  }, [forecast, sky, chosenSlot]);
  const moonIllumination = useMemo(
    () =>
      sky
        ? Math.round(
            Illumination(Body.Moon, new Date(sky.darkStart)).phase_fraction *
              100,
          )
        : null,
    [sky],
  );
  useEffect(() => {
    if (!loaded?.authenticated) {
      setInventory([]);
      return;
    }
    let cancelled = false;
    setInventory(null);
    fetch("/api/equipment", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("planOperationFailed");
        return r.json();
      })
      .catch(() => ({}))
      .then((payload) => {
        if (cancelled) return;
        keepEquipment(payload);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded?.authenticated]);
  // What `GET /api/equipment` answered, laid in the page.
  function keepEquipment(payload) {
    setInventory(payload.equipment || []);
    setDefaultConfiguration(payload.defaultConfiguration ?? null);
    setDefaultEquipment(
      Array.isArray(payload.defaults) ? payload.defaults : null,
    );
    setHideDefaultEquipment(payload.hideDefaultEquipment === true);
  }
  // The pickers of « Matériel de l'aperçu », the planner's own: « Mon
  // matériel » first then « Matériel par défaut » for a person signed in, the
  // catalogue for a visitor; the preview resolves over the same lists.
  const pickerLists = useMemo(
    () =>
      equipmentPickerLists({
        locale,
        signedIn: Boolean(loaded?.authenticated),
        inventory: inventory || [],
        defaults: defaultEquipment,
        hideDefaults: hideDefaultEquipment,
      }),
    [
      locale,
      loaded?.authenticated,
      inventory,
      defaultEquipment,
      hideDefaultEquipment,
    ],
  );
  // « Définir mon matériel »: « Mon espace » → « Matériel » (noting the
  // equipment known, for the way back), or the sign-in page for a visitor of
  // a service with spaces.
  const defineEquipment = useMemo(() => {
    const authenticated = Boolean(loaded?.authenticated);
    if (!authenticated && !loaded?.auth?.enabled) return null;
    return {
      href: defineEquipmentHref({
        locale,
        signedIn: authenticated,
        auth: loaded?.auth || {},
      }),
      inventory: authenticated ? inventory || [] : null,
    };
  }, [locale, loaded?.authenticated, loaded?.auth, inventory]);
  const previewPickerProps = useMemo(
    () =>
      equipmentPickerPropsFrom(pickerLists.lists, {
        locale,
        define: defineEquipment,
      }),
    [pickerLists, locale, defineEquipment],
  );
  // The way back from « Définir mon matériel »: the equipment is read again,
  // and the piece that is the only new one of its kind goes into the draft of
  // « Matériel de l'aperçu » (open, or the next one opened) — nothing is
  // kept before « Appliquer ».
  useEquipmentReturn({
    enabled: Boolean(loaded?.authenticated),
    reload: async () => {
      const response = await fetch("/api/equipment", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Equipment loading failed.");
      keepEquipment(payload);
      return payload.equipment || [];
    },
    onChosen: (chosen) => setReturnedEquipment({ chosen }),
  });
  const profileSets = useMemo(
    () => equipmentProfilesFromInventory(inventory || []),
    [inventory],
  );
  // Tonight's plan's equipment, else the one the plan created from here would
  // carry (`quickPlanEquipment`: the inventory's first when signed in, the
  // empty custom profile otherwise), never the resolver's first common profile.
  // With "Ma configuration par défaut" set, the plan created from here
  // starts from it, and the suggestions are ranked for it.
  const equipmentSelection = useMemo(
    () =>
      settings?.equipment ||
      planStartEquipment(
        quickPlanEquipment({
          paired: Boolean(loaded?.authenticated),
          profiles: profileSets,
        }),
        loaded?.authenticated ? defaultConfiguration : null,
      ),
    [settings, loaded?.authenticated, profileSets, defaultConfiguration],
  );
  // The mode of « À voir ce soir »: the person's choice, else the rule of
  // before (tonight's plan, else the default configuration, else photo);
  // and the equipment of that mode the list is made for — the night's own
  // while it is of that mode.
  const suggestionsMode = tonightSuggestionsMode({
    chosen: chosenSuggestionsMode,
    planEquipment: settings?.equipment || null,
    defaultConfiguration: loaded?.authenticated ? defaultConfiguration : null,
  });
  const listEquipment = useMemo(() => {
    const inventoryStart = quickPlanEquipment({
      paired: Boolean(loaded?.authenticated),
      profiles: profileSets,
    });
    const configuration = loaded?.authenticated ? defaultConfiguration : null;
    return tonightSuggestionsEquipment({
      mode: suggestionsMode,
      own: equipmentSelection,
      plans: subject.plans,
      configurationStart: configuration
        ? planStartEquipment(inventoryStart, configuration)
        : null,
      inventoryStart,
    });
  }, [
    suggestionsMode,
    equipmentSelection,
    subject.plans,
    loaded?.authenticated,
    profileSets,
    defaultConfiguration,
  ]);
  // The equipment a plan made from the list carries: `null` when the rule
  // of before (the default configuration, else the quick plan's) already
  // gives the mode shown.
  const suggestionsPlanEquipment =
    listEquipment === equipmentSelection &&
    ((loaded?.authenticated ? defaultConfiguration : null)?.mode === "visual"
      ? "visual"
      : "imaging") === suggestionsMode
      ? null
      : listEquipment;
  // The place's measured value, else the one typed in its form, else
  // the model's — shown with its pill.
  const skyBrightness = placeSkyBrightness({
    place: knownPlaceOf(loaded?.document, place),
    model: skyQuality.status === "ready" ? skyQuality.value : null,
    measures: placeSkyMeasures,
  });
  // That sky, for the visual limit of the suggestions (`visualSuitability`),
  // read by its two numbers.
  const visualSkySqm = skyBrightness.choice?.shown?.sqm ?? null;
  const visualSkyBortle = skyBrightness.choice?.shown?.bortleClass ?? null;
  // The same value for the note (TARGET-STATS-SKY-PLACE-01, Q4): the one the
  // place shows, with where it comes from when a person gave it.
  const scoreSkySource = skyBrightness.choice?.source ?? null;
  // The visual limit of each plan's targets reads that same sky:
  // without it `scorePlanTargets` judged every visual slot under a dark sky.
  const planVisualSky = useMemo(
    () =>
      visualSkySqm === null && visualSkyBortle === null
        ? null
        : { sqm: visualSkySqm, bortleClass: visualSkyBortle },
    [visualSkySqm, visualSkyBortle],
  );
  const scoreSky = useMemo(
    () => scoreSkyOfChoice(skyBrightness.choice),
    // The choice is read by the three values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreSkySource, visualSkySqm, visualSkyBortle],
  );
  const candidates = useMemo(() => {
    if (!sky || !place || !targets.list.length) return [];
    try {
      const profile = resolveEquipment(listEquipment, profileSets);
      // The types ticked filter the pool (the catalogues made it); the
      // selections' pool (the service's answer) keeps the targets of the
      // profile's mode (TARGET-SELECTIONS-TAGS-01), a catalogue ticked stays
      // whole.
      const selectionMode = selection
        ? selectionModeOfEquipmentMode(profile.mode)
        : "";
      const pool = filterSuggestionPool(
        planningTargets(
          [],
          locale,
          {},
          {
            catalogueTargets: targets.list,
          },
        ).filter(
          (target) =>
            !isSelectionTarget(target) ||
            targetMatchesSelectionMode(target, selectionMode),
        ),
        { families: suggestFilters.families },
        poolQuery.limit,
      );
      const night = planNight({
        date: subject.date,
        location: place,
        targets: pool,
        profile,
        locale,
        minAltitude,
        moonSeparationMinimum,
        planetReferences: { planets: [] },
        darkness: subject.darkness,
        skyQuality:
          visualSkySqm === null && visualSkyBortle === null
            ? null
            : { sqm: visualSkySqm, bortleClass: visualSkyBortle },
        // VISUAL-SIM-02a: the best pair of « Mon matériel », as the preview.
        visualInventory: visualInventoryOf(profileSets),
      });
      if (!night) return [];
      // « Ignorer le masque d'horizon »: the cards without it, each with the
      // stretches it spends behind it.
      const mask = suggestFilters.ignoreMask ? {} : place.horizonMask;
      const mountSafety = settings?.mountSafety;
      const cards = withHorizonMask(
        night.cards,
        mask,
        minAltitude,
        moonSeparationMinimum,
        mountSafety,
      );
      if (suggestFilters.ignoreMask)
        withMaskHidden(cards, night.cards, place.horizonMask, {
          minAltitude,
          moonSeparationMinimum,
          mountSafety,
        });
      const ownedFilters = ownedFiltersUnion({
        inventory: inventory || [],
        local: readStorage(readOwnedFilters, []),
      });
      const windTolerance = normalizeWindTolerance(
        (listEquipment === equipmentSelection
          ? settings?.equipment
          : listEquipment
        )?.windTolerance,
      );
      const window = {
        start: sky.start,
        end: sky.end,
        darkStart: sky.darkStart,
        darkEnd: sky.darkEnd,
        moonIllumination,
      };
      const equipment = {
        field: fieldOfView(profile),
        mode: profile?.mode,
        filters: profile?.filters,
      };
      return cards.map((card) => ({
        card,
        score: targetTonightScore({
          card,
          window,
          hourly,
          moonSeries: sky.moonSeries,
          skyQuality: scoreSky,
          skyDirection,
          maskPath: targetNightPath({
            series: card.series || [],
            mask,
            minAltitude,
            moonSeparationMinimum: card.constraints?.moonSeparationMinimum ?? 0,
            mountSafety,
          }),
          equipment,
          ownedFilters,
          windTolerance,
          minAltitude,
        }),
      }));
    } catch {
      return [];
    }
  }, [
    hourly,
    locale,
    minAltitude,
    moonIllumination,
    moonSeparationMinimum,
    place,
    settings,
    sky,
    skyDirection,
    scoreSky,
    visualSkySqm,
    visualSkyBortle,
    subject.date,
    subject.darkness,
    targets.list,
    inventory,
    profileSets,
    equipmentSelection,
    listEquipment,
    suggestFilters.families,
    suggestFilters.ignoreMask,
    poolQuery.limit,
    selection,
  ]);

  useEffect(() => {
    if (!loaded?.authenticated) {
      setSuggestionInputs({ history: [], continuing: [] });
      return;
    }
    let cancelled = false;
    setSuggestionInputs(null);
    const projects = getPlannerExtensions("planner.projects")[0];
    Promise.all([
      loadSuggestionHistory().catch(() => []),
      projects?.loadContinuingSuggestions
        ? projects
            .loadContinuingSuggestions({
              plans: loaded.document?.plans || [],
              today: subject.date,
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]).then(([history, continuing]) => {
      if (!cancelled) setSuggestionInputs({ history, continuing });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded?.authenticated, loaded?.document, subject.date]);
  const identity = JSON.stringify([
    subject.date,
    place?.id,
    place?.latitude,
    place?.longitude,
  ]);
  useEffect(() => {
    setPosition(tonightSuggestionPosition(identity));
    setExpanded(false);
  }, [identity]);
  // Another mode, other filters, start with their best ten.
  const positionKey = JSON.stringify([
    identity,
    suggestionsMode,
    suggestFilters,
  ]);
  const tier = position.key === positionKey ? position.tier : 1;
  const exhausted = position.key === positionKey && position.exhausted;
  const suggestionsAt = (nextTier) =>
    tonightSuggestions({
      ...suggestionInputs,
      noteNow: suggestionNoteNow({ summary: forecastSummary }),
      candidates,
      plans: subject.plans,
      place,
      date: subject.date,
      night: sky,
      tier: nextTier,
      hourly,
      // The periods of the night ticked.
      ...(sky && suggestFilters.periods.length
        ? {
            spans: suggestionPeriodSpans(
              { start: sky.darkStart, end: sky.darkEnd },
              suggestFilters.periods,
            ),
          }
        : {}),
      mode: resolveEquipment(listEquipment, profileSets).mode,
      ownedFilters: ownedFiltersUnion({
        inventory: inventory || [],
        local: readStorage(readOwnedFilters, []),
      }),
    });
  const proposal = suggestionsAt(tier);
  const visible = tonightVisibleSuggestions(
    suggestionInputs === null || inventory === null
      ? { candidates: [] }
      : proposal,
    subject.plans.length > 0,
    expanded,
  );
  // The list is shown at once; when the forecast comes in afterwards and
  // changes it, a notice says so (once per arrival, then it fades).
  const listRead = useRef(null);
  const [weatherNotice, setWeatherNotice] = useState(false);
  const listKey = visible.map((candidate) => candidate.id).join("|");
  const listHasForecast = hourly.length > 0;
  useEffect(() => {
    listRead.current = null;
    setWeatherNotice(false);
  }, [identity]);
  useEffect(() => {
    const { read, notice } = noteSuggestionRead(listRead.current, {
      ids: listKey ? listKey.split("|") : [],
      hasForecast: listHasForecast,
    });
    listRead.current = read;
    if (notice) setWeatherNotice(true);
  }, [listKey, listHasForecast]);
  useEffect(() => {
    if (!weatherNotice) return undefined;
    const timer = setTimeout(
      () => setWeatherNotice(false),
      suggestionsForecastNoticeDuration,
    );
    return () => clearTimeout(timer);
  }, [weatherNotice]);
  // For an eyepiece, a target that needs a filter says which.
  const visualList =
    resolveEquipment(listEquipment, profileSets).mode === "visual";
  // The sky the instrument word of a visual row is computed under.
  const visualSky =
    visualSkySqm === null && visualSkyBortle === null
      ? null
      : { sqm: visualSkySqm, bortleClass: visualSkyBortle };
  // The binoculars the visual rule reads: « Mon matériel »'s first, else
  // the generic 7×50 (EQUIPMENT-INSTRUMENTS-01).
  const visualBinoculars = observingBinoculars(profileSets?.telescopes);
  // SUGGEST-FILTERS-01: the « Suggérer » dialog closed by a change of
  // filters opens again once the section's list is made with them.
  useEffect(() => {
    if (
      !reopenSuggest ||
      targets.status !== "ready" ||
      suggestionInputs === null ||
      inventory === null
    )
      return;
    setReopenSuggest(false);
    openSuggestedPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenSuggest, targets.status, listKey]);
  // SUGGEST-FILTERS-01: keeps the filters (this browser); the « Suggérer »
  // dialog that was open opens again on the list the section shows with them.
  function applyFilters(next) {
    const value = normalizeSuggestFilters(next);
    writeSuggestFilters(value);
    setSuggestFilters(value);
    if (suggesting && (suggesting.date ?? subject.date) === subject.date) {
      setSuggesting(null);
      setReopenSuggest(true);
    }
  }
  function refreshSuggestions() {
    if (!suggestionsAt(tier + 1).items.length)
      setPosition(tonightSuggestionPosition(positionKey, { exhausted: true }));
    else
      setPosition(
        tonightSuggestionPosition(positionKey, {
          tier: tier + 1,
          exhausted: false,
        }),
      );
  }
  const overview = tonightOverview({
    place,
    date: subject.date,
    night: sky,
    plans: subject.plans,
    hourly,
    moonIllumination,
    skyQuality:
      skyBrightness.choice?.shown ??
      (skyQuality.status === "ready" ? skyQuality.value : null),
    darkness: subject.darkness,
    candidates,
    forecast: forecastSummary,
    slot: chosenSlot,
  });
  overview.candidates = visible;
  const words = tonightWords(overview, {
    locale,
    timeZone,
    // The card's state while it has no score, and the hours of its
    // filigree and sheet.
    verdictStatus: tonightVerdictStatus(forecast, {
      date: subject.date,
      availability: placeForecastAvailability({
        date: subject.date,
        now,
        place,
      }),
    }),
    verdictHours: hourly,
    forecastUpdated: forecast.fetchedAt
      ? { fetchedAt: forecast.fetchedAt, stale: forecast.stale === true }
      : null,
    skySource: skyBrightness.choice?.source ?? null,
    loading: {
      weather: forecast.status === "loading",
      skyQuality: skyQuality.status === "loading",
      candidates:
        targets.status === "loading" ||
        suggestionInputs === null ||
        inventory === null,
    },
  });
  // The plans as a frise: the choice is the browser's; the
  // planner's own heights are computed for the plans shown, once per version of
  // each, and only when the frise view is chosen. One hour scale for the page.
  // One choice of three values, compact (the
  // labels), details or frise.
  const [targetView, setTargetView] = usePlanTargetView();
  const friseView = targetView === "frise";
  // Each target of tonight's plans over its
  // slot — its heights and its score for the slot.
  const planNights = useMemo(() => {
    const nights = {};
    for (const plan of subject.plans)
      nights[plan.id] = scorePlanTargets({
        plan,
        place,
        date: subject.date,
        darkness: subject.darkness,
        profileSets,
        hourly,
        skyQuality: scoreSky,
        visualSkyQuality: planVisualSky,
        skyDirection,
        ownedFilters: ownedFiltersUnion({
          inventory: inventory || [],
          local: readStorage(readOwnedFilters, []),
        }),
        locale,
      });
    return nights;
  }, [
    subject.plans,
    subject.date,
    subject.darkness,
    place,
    profileSets,
    hourly,
    scoreSky,
    planVisualSky,
    skyDirection,
    inventory,
    locale,
  ]);
  const planCards = overview.plans;
  const friseInputs = useMemo(
    () =>
      friseView
        ? subject.plans.map((plan) => planFriseInput(plan, { place, timeZone }))
        : [],
    [friseView, subject.plans, place, timeZone],
  );
  const friseScale = useMemo(
    () => planFriseScale(friseInputs.filter(Boolean)),
    [friseInputs],
  );
  const frises = useMemo(
    () => friseInputs.map((input) => planFriseOf(input, { scale: friseScale })),
    [friseInputs, friseScale],
  );
  const friseClock = (value) => clock(value, locale, timeZone);
  const plannerHref = `/${locale}/planner`;
  const ready = overview.state === "ready";

  // The slot written on the pending plan of tonight,
  // where the page read it, or in this browser without such a plan.
  async function applySlot(slot) {
    setSlotDialog(null);
    setSlotFellBack(false);
    const span = slot ? { start: slot.start, end: slot.end } : null;
    if (!tonightSlotPlan(subject)) {
      const record = span ? { date: subject.date, ...span } : null;
      try {
        writeTonightSlotRecord(window.localStorage, record);
      } catch {
        // Storage refused: the choice holds for this page.
      }
      setSlotRecord(record);
      return;
    }
    const document = loaded?.document;
    if (!document) return;
    const next = {
      ...document,
      plans: plansWithTonightSlot(document.plans, subject, span).plans,
    };
    setLoaded((previous) => ({ ...previous, document: next }));
    try {
      await writePlannerDocument({
        state: next,
        previous: document,
        signedIn: Boolean(loaded?.authenticated),
        email: loaded?.email || "",
      });
    } catch {
      // Refused by the space: the plan keeps its slot.
      setLoaded((previous) => ({ ...previous, document }));
    }
  }
  // The browser's slot of a night without plan follows the
  // place's local hours, within the new night; the plan's own slot belongs to
  // the plan, which keeps its place.
  function chooseTonightPlace(entry) {
    if (
      slotRecord &&
      slotRecord.date === subject.date &&
      !tonightSlotPlan(subject)
    ) {
      const moved = transposeDeviceSlot({
        record: slotRecord,
        darkness: darknessPreference,
        from: place,
        to: entry,
      });
      try {
        writeTonightSlotRecord(window.localStorage, moved.record);
      } catch {
        // Storage refused: the choice holds for this page.
      }
      setSlotRecord(moved.record);
      setSlotFellBack(moved.fellBack);
    }
    setChosen(entry);
  }
  const idealSlot =
    sky && hourly.length
      ? tonightSnappedSlot(
          sky,
          nightStory({
            hours: hourly,
            night: { start: sky.darkStart, end: sky.darkEnd },
          }).ideal,
        )
      : null;
  const slotHourly =
    slotDialog && sky && forecast.status === "ready"
      ? hourlyAstronomyForecast({
          hourly: forecast.hourly,
          night: {
            start: new Date(Date.parse(sky.scaleStart) - 3600000).toISOString(),
            end: new Date(Date.parse(sky.scaleEnd) + 3600000).toISOString(),
          },
          moon: forecastMoonOfNight(sky),
        })
      : [];

  // The threshold chosen from the night card's dialog — the browser's
  // preference, as the planner writes it, and the plans that can still take
  // it (`applyDarknessToPlans`), written where the page read them.
  async function chooseDarkness(value) {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the choice still applies to this page.
    }
    writeDarknessPreference(storage, value);
    setDarknessPreference(value);
    const document = loaded?.document;
    if (!document) return;
    const { plans, changedIds } = applyDarknessToPlans(document.plans, value, {
      now: Date.now(),
      // A plan whose night runs on a phone keeps its threshold.
      sessionPlanIds: Object.keys(executing),
    });
    if (!changedIds.length) return;
    const next = { ...document, plans };
    setLoaded((previous) => ({ ...previous, document: next }));
    try {
      await writePlannerDocument({
        state: next,
        previous: document,
        signedIn: Boolean(loaded?.authenticated),
        email: loaded?.email || "",
        ...(storage ? { storage } : {}),
      });
    } catch {
      // Refused by the space: the plans keep their threshold.
      setLoaded((previous) => ({ ...previous, document }));
    }
  }

  // What "Éditer ce lieu" of the place's details writes — the place in the
  // places of the document, where the page read it — and what the page then
  // shows.
  async function writePlacesDocument(next, previous) {
    setLoaded((current) => ({ ...current, document: next }));
    try {
      await writePlannerDocument({
        state: next,
        previous,
        signedIn: Boolean(loaded?.authenticated),
        email: loaded?.email || "",
      });
    } catch {
      // Refused by the space: the places keep what they were.
      setLoaded((current) => ({ ...current, document: previous }));
    }
  }
  function savePlace(saved) {
    if (placesFromSpace) {
      setPlaceEditor(null);
      setChosen(saved);
      return spacePlaces.save(saved);
    }
    const document = loaded?.document || { plans: [] };
    const known = Array.isArray(document.knownLocations)
      ? document.knownLocations
      : [];
    setPlaceEditor(null);
    setChosen(saved);
    return writePlacesDocument(
      {
        ...document,
        knownLocations: [
          ...known.filter((entry) => entry.id !== saved.id),
          structuredClone(saved),
        ],
      },
      document,
    );
  }
  function deletePlace(id) {
    if (placesFromSpace) {
      setPlaceEditor(null);
      setPlaceDetails(false);
      setChosen(null);
      return spacePlaces.remove(id);
    }
    const document = loaded?.document;
    setPlaceEditor(null);
    setPlaceDetails(false);
    setChosen(null);
    if (!document) return undefined;
    return writePlacesDocument(
      {
        ...document,
        knownLocations: (document.knownLocations || []).filter(
          (entry) => entry.id !== id,
        ),
      },
      document,
    );
  }

  async function inputsFor(plan, equipmentInventory = inventory || []) {
    const location = plan.location;
    const coords = coordinatesOf(location);
    if (!coords)
      return {
        candidates: [],
        night: null,
        mode: resolveEquipment(plan.equipment || {}).mode,
      };
    const params = new URLSearchParams({
      locale,
      latitude: String(coords.latitude),
      minimumAltitude: String(plan.minAltitude ?? 30),
      selection: plan.catalogueSelection || "best",
    });
    const response = await fetch(`/api/planner-targets?${params}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("planOperationFailed");
    const catalogue = (await response.json()).targets || [];
    const same =
      coords.latitude === coordinates?.latitude &&
      coords.longitude === coordinates?.longitude;
    const forecastRead = same
      ? { hourly: forecast.hourly }
      : await requestAstronomyWeather(coords).catch(() => ({ hourly: null }));
    const quality = same
      ? skyQuality.value
      : await requestPlannerSkyQuality(coords).catch(() => null);
    const direction = same
      ? skyDirection
      : await requestPlannerSkyDirection(coords).catch(() => null);
    const night = planNightSpanSky(
      { date: plan.date, darkness: plan.darkness },
      location,
    );
    const hours = forecastRead.hourly
      ? hourlyAstronomyForecast({
          hourly: forecastRead.hourly,
          night: { start: night.darkStart, end: night.darkEnd },
          moon: forecastMoonOfNight(night),
        })
      : [];
    const kept =
      suggesting?.inputs.candidates.map((c) => c.card.target) ||
      visible.map((c) => c.card.target);
    const placement = tonightPlacementInputs({
      plan,
      inventory: equipmentInventory,
      targets: [
        ...kept,
        ...catalogue.filter((t) => !kept.some((k) => k.id === t.id)),
      ],
      locale,
      hourly: hours,
      skyQuality: placeScoreSky({
        place: knownPlaceOf(loaded?.document, location),
        model: quality,
        measures: placeSkyMeasures,
      }),
      // The visual limit reads the plan's place's sky as the sky-brightness
      // rule shows it (measured, else typed, else the model's).
      visualSkyQuality:
        placeSkyBrightness({
          place: knownPlaceOf(loaded?.document, location),
          model: quality,
          measures: placeSkyMeasures,
        }).choice?.shown ?? null,
      skyDirection: direction,
      ownedFilters: ownedFiltersUnion({
        inventory: equipmentInventory,
        local: readStorage(readOwnedFilters, []),
      }),
      // SUGGEST-FILTERS-01: the mask ignored as the list ignored it (the
      // plan made keeps the place's mask all the same).
      ignoreMask: suggestFilters.ignoreMask,
    });
    // The note of the night suggested for, against which the targets
    // already done are compared.
    let summary = null;
    try {
      summary = forecastRead.hourly
        ? summarizeAstronomyForecast({
            hourly: forecastRead.hourly,
            night: { start: night.darkStart, end: night.darkEnd },
            moon: forecastMoonOfNight(night),
          })
        : null;
    } catch {
      summary = null;
    }
    return { ...placement, noteNow: suggestionNoteNow({ summary }) };
  }
  // `date` is the night the list is made for: tonight's (the targets shown),
  // or, the night after when what is left of this one is too short for one
  // target — the same list for it, same place and equipment, from the
  // catalogue (the targets shown were chosen for tonight).
  async function openSuggestedPlan(date = subject.date) {
    setCreationError(null);
    try {
      const plan = {
        ...settings,
        equipment: listEquipment,
        date,
        location: place,
        items: [],
      };
      const inputs = await inputsFor(plan);
      const ids = visible.map((c) => c.id);
      const defaults = suggestionDefaults(inputs.mode === "visual");
      // « Confort », the choice every suggestion
      // dialog of this browser shares, for this rig.
      const comfortFamily = observationComfortFamily({
        mode: inputs.mode,
        telescope:
          resolveEquipmentProfiles(
            plan.equipment || {},
            equipmentProfilesFromInventory(inventory || []),
          ).telescope ?? null,
      });
      // "Cette nuit" suggests what is left of the night when it is running --
      // from now -- and the whole of another night.
      const span =
        date === subject.date
          ? suggestionSpanFromNow(inputs.night, Date.now())
          : null;
      // SUGGEST-FILTERS-01: the periods of the night ticked.
      const spans = suggestionPeriodSpans(inputs.night, suggestFilters.periods);
      const initial = suggestNight({
        ...inputs,
        ...(span ? { span } : {}),
        ...(spans ? { spans } : {}),
        ...(date === subject.date
          ? { count: ids.length, only: ids }
          : { count: defaults.count }),
        layout: "night",
        // Nothing another plan of that night of the same nature (photo
        // with photo, visual with visual) already holds.
        excluded: targetIdsTakenOnNight(loaded?.document?.plans || [], {
          date,
          visual: inputs.mode === "visual",
        }),
        // The same ids, so that an empty list can say the other plans took
        // every target (`suggestNight`).
        takenByOtherPlans: targetIdsTakenOnNight(
          loaded?.document?.plans || [],
          { date, visual: inputs.mode === "visual" },
        ),
        // The dialog opens on the plan's mode default (visual
        // "Rapproché", photo "Idéal"): the proposal is made with it.
        placement: defaults.placement,
        comfort: comfortNow(comfortFamily),
      });
      setSuggesting({
        initial,
        inputs,
        ids,
        date,
        span,
        spans,
        comfortFamily,
      });
    } catch {
      setCreationError(message(locale, "planOperationFailed"));
    }
  }
  function created(result, action) {
    // "Effacer et recommencer" on a night that keeps a plan that was run:
    // refused before anything was erased -- the sentence says why.
    if (result.kind === "taken") {
      setPlanExists(null);
      setCreationError(planExistsIntro(locale));
    }
    if (result.kind === "created" || result.kind === "merged") {
      setLoaded((previous) => ({ ...previous, document: action.document }));
      setPlanExists(null);
      setSuggesting(null);
      setMadeElsewhere(planMadeElsewhere(result, subject.date, locale));
    } else if (result.kind !== "taken" && result.kind !== "cancelled") {
      // A result that made no plan -- nothing the ticked targets could be
      // placed on, an erase the plan's state refuses -- closes the dialogs and
      // says why. "Fusionner" used to leave the dialog frozen with every button
      // disabled, and Escape shut.
      setPlanExists(null);
      setSuggesting(null);
      setCreationError(
        result.kind === "eraseDisabled"
          ? quickPlanMessage(
              locale,
              planExists?.data?.running
                ? "planExistsRunning"
                : "planExistsDebrief",
            )
          : result.kind === "empty"
            ? quickPlanMessage(locale, "planExistsNothingPlaced")
            : message(locale, "planOperationFailed"),
      );
    }
    setCreating(false);
  }
  // `placement` is the one the dialog showed: the plan gets the slots
  // that were drawn.
  async function createSuggestedPlan(ids, placement = "ideal") {
    setCreating(true);
    setCreationError(null);
    setMadeElsewhere(null);
    try {
      const signedIn = Boolean(loaded?.authenticated);
      let creationInventory = inventory || [];
      let creationConfiguration = defaultConfiguration;
      if (signedIn) {
        const response = await fetch("/api/equipment", { cache: "no-store" });
        if (!response.ok) throw new Error("planOperationFailed");
        const payload = await response.json();
        creationInventory = payload.equipment || [];
        creationConfiguration = payload.defaultConfiguration ?? null;
      }
      const action = createWebQuickPlanAction({
        document: loaded.document || { plans: [] },
        // The night the dialog was opened for (the next one, once).
        date: suggesting?.date ?? subject.date,
        location: place,
        locale,
        signedIn,
        email: loaded.email || "",
        capabilities,
        inventory: creationInventory,
        defaultConfiguration: creationConfiguration,
        // SUGGEST-FILTERS-01: placed as the dialog drew them (the periods).
        inputsFor: async (plan) => ({
          ...(await inputsFor(plan, creationInventory)),
          ...(suggesting?.spans ? { spans: suggesting.spans } : {}),
        }),
        placement,
        span: suggesting?.span ?? null,
        comfort: comfortNow(suggesting?.comfortFamily),
        // A plan of the mode « À voir ce soir » shows.
        equipment: suggestionsPlanEquipment,
      });
      const selected = new Set(ids);
      const result = await action.create(selected);
      if (result.kind === "exists" || result.kind === "taken") {
        const eraseState = () =>
          readQuickPlanEraseState({
            plan: action.existing,
            signedIn,
            email: loaded.email || "",
          });
        const data = await quickPlanDialogData({
          action,
          ids: selected,
          locale,
          eraseState,
          tonightDate: subject.date,
        });
        setPlanExists({ action, ids: selected, data, eraseState });
        setCreating(false);
      } else created(result, action);
    } catch {
      setCreationError(message(locale, "planOperationFailed"));
      setCreating(false);
    }
  }
  const lightMap = placeDetailsLightMap({
    locale,
    place,
    auth: loaded?.auth,
    capabilities,
    onOpen: (focus) => setLightMapOpen({ focus }),
    onHeld: () => setLightMapBox(true),
  });
  // The map is a page of its own, as it is from "Lieux": ← gives the page
  // back, with the place's details as they were.
  if (lightMapOpen && lightMap?.View)
    return (
      <main
        className="planner-page places-page"
        data-testid="tonight-light-map"
      >
        <lightMap.View
          locale={locale}
          places={knownPlaces}
          place={place}
          focus={lightMapOpen.focus}
          nearMe={false}
          held={false}
          onBack={() => setLightMapOpen(null)}
        />
      </main>
    );
  return (
    <main className="tonight-page" data-state={loaded ? "loaded" : "loading"}>
      <h1 className="tonight-title">{words.title}</h1>
      {!loaded || waitingForPlaces ? (
        <LoadingState className="tonight-loading" testId="tonight-loading">
          {message(locale, "tonightLoading")}
        </LoadingState>
      ) : (
        <>
          {debriefWords ? (
            <section
              className="tonight-debrief"
              data-testid="tonight-debrief-due"
              aria-labelledby="tonight-debrief-title"
            >
              <h2
                id="tonight-debrief-title"
                data-testid="tonight-debrief-title"
              >
                {debriefWords.title}
              </h2>
              {debriefWords.cards.map((night) => (
                <article
                  key={night.key}
                  className="tonight-card tonight-debrief-night"
                  data-night={night.key}
                >
                  <StatusTag
                    tone="to_debrief"
                    locale={locale}
                    scheme={false}
                    label={debriefWords.status}
                  />
                  <h3>{night.label}</h3>
                  {night.plans.map((plan) => (
                    <div key={plan.id} className="tonight-debrief-plan">
                      {plan.name ? (
                        <p className="tonight-muted">{plan.name}</p>
                      ) : null}
                      {plan.href ? (
                        <a
                          className="btn-secondary is-debrief tonight-debrief-open"
                          data-plan-id={plan.id}
                          href={plan.href}
                        >
                          {debriefWords.button}
                        </a>
                      ) : null}
                    </div>
                  ))}
                </article>
              ))}
              {debriefWords.others ? (
                <a
                  className="btn-link tonight-debrief-others"
                  data-testid="tonight-debrief-others"
                  href={debriefWords.others.href}
                >
                  {debriefWords.others.label}
                </a>
              ) : null}
            </section>
          ) : null}
          <section
            aria-label={words.placeAndDate}
            className="tonight-place"
            data-testid="tonight-place"
          >
            {ready ? (
              // The icon, the name and the date are one button, 56 px high,
              // that opens the place's details; "Changer" is beside it and
              // chooses another place.
              <button
                type="button"
                className="tonight-place-open"
                aria-label={words.placeOpen}
                data-testid="tonight-place-open"
                onClick={() => setPlaceDetails(true)}
              >
                <span className="tonight-place-icon">
                  <PinIcon />
                </span>
                <span className="tonight-place-text">
                  <span className="tonight-place-name">
                    {keepLastCharactersTogether(words.placeName)}
                  </span>
                  <span className="tonight-muted">{words.date}</span>
                </span>
              </button>
            ) : (
              <>
                <span className="tonight-place-icon">
                  <PinIcon />
                </span>
                <p className="tonight-place-text">{words.choosePlacePrompt}</p>
              </>
            )}
            {knownPlaces.length ? (
              // The places of the space are listed on the spot, with or without
              // a place already in use; the link to the planner is for a person
              // who has none yet.
              <button
                type="button"
                className={ready ? "btn-link" : "btn-secondary"}
                aria-expanded={choosing}
                onClick={() => setChoosing((open) => !open)}
              >
                {ready ? words.change : words.choosePlace}
              </button>
            ) : (
              <a
                className={ready ? "btn-link" : "btn-secondary"}
                href={plannerHref}
              >
                {ready ? words.change : words.choosePlace}
              </a>
            )}
          </section>
          {ready && words.sticky ? (
            <StickyPlaceBar
              sticky={words.sticky}
              onOpenPlace={() => setPlaceDetails(true)}
            />
          ) : null}
          {choosing ? (
            <ul
              className="tonight-place-list"
              role="listbox"
              aria-label={words.placeAndDate}
            >
              {knownPlaces.map((entry) => (
                <li key={entry.id || `${entry.latitude},${entry.longitude}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={entry.id === place?.id}
                    onClick={() => {
                      chooseTonightPlace(entry);
                      setChoosing(false);
                    }}
                  >
                    {entry.name || entry.locality || words.placeName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {choosing && ready && place ? (
            // TONIGHT-PLACE-LINK-01: the editor of the place in use, a link
            // under the list (the same place as « Éditer ce lieu » of the
            // details, one toucher less).
            <button
              type="button"
              className="btn-link tonight-place-edit"
              data-testid="tonight-place-edit"
              onClick={() => {
                setChoosing(false);
                setPlaceEditor(
                  knownPlaces.find(
                    (entry) => entry.id && entry.id === place.id,
                  ) || place,
                );
              }}
            >
              <PencilIcon />
              <span>
                {fill(message(locale, "tonightEditPlace"), {
                  place: words.placeName,
                })}
              </span>
            </button>
          ) : null}

          {ready ? (
            <VerdictSection
              words={words}
              locale={locale}
              onRetry={() => setForecastAttempt((attempt) => attempt + 1)}
              onUseIdeal={(slot) =>
                setSlotDialog({ preselect: tonightSnappedSlot(sky, slot) })
              }
              // Journal answer (1): "Créneau choisi" on the card only when
              // a plan holds the slot.
              onWholeNight={
                tonightSlotPlan(subject) ? () => applySlot(null) : null
              }
              // [NOTE]'s access card to
              // "Conditions à {lieu}" on the night being lived, for a saved
              // place — the same subtitle for every profile.
              conditions={
                place?.id
                  ? {
                      title: fill(message(locale, "conditionsTitle"), {
                        place: place.name || place.locality || "",
                      }),
                      subtitle: message(locale, "conditionsCardSubtitle"),
                      href: `${plannerHref}?${new URLSearchParams({
                        view: "conditions",
                        place: place.id,
                        date: tonightDate({ now, place }),
                      })}`,
                    }
                  : null
              }
            />
          ) : null}
          {ready && slotFellBack ? (
            <p
              className="tonight-slot-notice"
              data-testid="tonight-slot-notice"
              role="status"
            >
              {message(locale, "tonightSlotFellBack")}
            </p>
          ) : null}

          {ready ? (
            <NightZone
              words={words}
              overview={overview}
              onChooseSlot={() => setSlotDialog({ preselect: null })}
              onWholeNight={() => applySlot(null)}
              darknessSetting={
                <DarknessSettingButton
                  locale={locale}
                  darkness={subject.darkness}
                  place={place}
                  date={subject.date}
                  timeZone={timeZone}
                  onChoose={chooseDarkness}
                />
              }
            >
              {/* The note under the tiles is gone; the planner's hourly
                  strip stands here, « Estimation météo heure par heure
                  », each column with its hour's score. */}
              {hourly.length ? (
                <HourlyForecast
                  className="tonight-card tonight-hourly"
                  forecast={{ hourly, fetchedAt: forecast.fetchedAt }}
                  locale={locale}
                  night={{ start: sky.darkStart, end: sky.darkEnd }}
                  onRefresh={() => setForecastRefresh((count) => count + 1)}
                  refreshing={Boolean(forecast.refreshing)}
                  timeZone={timeZone}
                  title={message(locale, "tonightHourlyForecastTitle")}
                  hourScores
                  infoInCorner
                  slot={overview.slot}
                />
              ) : null}
            </NightZone>
          ) : null}
          {slotDialog && sky ? (
            <TonightSlotDialog
              locale={locale}
              sky={sky}
              hourly={slotHourly}
              date={subject.date}
              darknessLabel={message(
                locale,
                darknessLabelKey(subject.darkness),
              )}
              utcOffsetMinutes={zoneOffsetMinutes(sky.scaleStart, timeZone)}
              clock={(value) => (value ? clock(value, locale, timeZone) : "—")}
              current={chosenSlot}
              preselect={slotDialog.preselect}
              ideal={idealSlot}
              planName={tonightSlotPlan(subject)?.name || null}
              onApply={applySlot}
              onClose={() => setSlotDialog(null)}
            />
          ) : null}

          {ready ? (
            <SkyQualityCards
              locale={locale}
              sky={skyBrightness}
              words={words.skyQuality}
            />
          ) : null}

          <section
            aria-labelledby="tonight-plans-title"
            className="tonight-plans"
          >
            {words.plans.length ? (
              <div className="tonight-plans-heading">
                <h2 id="tonight-plans-title">{words.plansTitle}</h2>
                <PlanTargetViewButtons
                  locale={locale}
                  view={targetView}
                  onChange={setTargetView}
                  disabled={!tonightPlansHavePlacedTarget(words.plans)}
                />
              </div>
            ) : (
              <h2 id="tonight-plans-title">{words.plansTitle}</h2>
            )}
            {words.plans.length ? (
              words.plans.map((plan, index) => {
                // The plan's type before its name, its telescope under
                // the line of targets, the previews of its mode.
                const stored = subject.plans.find(
                  (entry) => entry.id === plan.id,
                );
                // The night of this plan runs on a phone.
                const execution = planExecutionOf(executing, stored ?? plan);
                const visual = tonightPlanIsVisual(stored?.equipment);
                const telescope = tonightPlanTelescope(
                  profileSets,
                  stored?.equipment,
                );
                return (
                  <article
                    key={plan.id || plan.name}
                    className="tonight-card tonight-plan"
                    {...(execution
                      ? { "data-plan-execution": execution.state }
                      : {})}
                  >
                    <h3 className="tonight-plan-name">
                      <PlanTypeIcon visual={visual} />
                      <span>{plan.name}</span>
                    </h3>
                    {plan.state ? (
                      <p className="tonight-plan-state">
                        <StatusTag
                          tone={plan.state.tone}
                          locale={locale}
                          scheme={false}
                          label={plan.state.label}
                          data-plan-state={plan.state.tone}
                        />
                      </p>
                    ) : null}
                    <p className="tonight-muted tonight-numbers">
                      {plan.summary}
                    </p>
                    {telescope !== null ? (
                      <p
                        className="tonight-muted tonight-plan-telescope"
                        data-telescope={plan.id}
                      >
                        {telescope}
                      </p>
                    ) : null}
                    {!execution && friseView && frises[index]?.span ? (
                      // The night the plan chose, when it
                      // chose one — nothing for the whole night.
                      <p
                        className="tonight-muted tonight-numbers tonight-plan-span"
                        data-plan-span={plan.id}
                      >
                        {planFriseSpanLine(frises[index], {
                          locale,
                          clock: friseClock,
                        })}
                      </p>
                    ) : null}
                    {execution ? (
                      <PlanExecutionCard
                        locale={locale}
                        plan={stored ?? plan}
                        execution={execution}
                        place={place}
                        timeZone={timeZone}
                        clock={friseClock}
                      />
                    ) : friseView && frises[index] ? (
                      <PlanFrise
                        frise={frises[index]}
                        locale={locale}
                        clock={friseClock}
                        onBlock={(key) => {
                          const item = planCards[index]?.items.find(
                            (entry) => entry.key === key,
                          );
                          if (item)
                            setPlanTarget({ plan: planCards[index], item });
                        }}
                      />
                    ) : targetView === "details" &&
                      planCards[index]?.items.length ? (
                      <ul className="tonight-plan-rows">
                        {planCards[index].items.map((item) => {
                          const night = planNights[plan.id]?.[item.index];
                          const row = planTargetRowWords(item, night, {
                            locale,
                            at: friseClock,
                          });
                          return (
                            <li key={item.key} className="tonight-row-item">
                              <button
                                type="button"
                                className="tonight-plan-row"
                                data-item={item.key}
                                onClick={() =>
                                  setPlanTarget({
                                    plan: planCards[index],
                                    item,
                                  })
                                }
                              >
                                <AvailabilityGraph
                                  card={{
                                    ...(night?.card || {}),
                                    target: item.target,
                                    series: night?.card?.series || [],
                                    minAltitude,
                                  }}
                                />
                                {/* The tile is laid over this place, outside
                                  the row's button, so that its photo opens
                                  the full-screen viewer. */}
                                <span
                                  className="tonight-tile-slot"
                                  aria-hidden="true"
                                />
                                <span className="tonight-candidate-text">
                                  <span className="tonight-candidate-name">
                                    {row.designation}
                                    {row.name ? (
                                      <span className="tonight-muted">
                                        {` · ${row.name}`}
                                      </span>
                                    ) : null}
                                  </span>
                                  {row.slot ? (
                                    <span className="tonight-numbers">
                                      {row.slot}
                                    </span>
                                  ) : null}
                                  {row.facts ? (
                                    <span className="tonight-muted tonight-small">
                                      {row.facts}
                                    </span>
                                  ) : null}
                                </span>
                                {row.score ? (
                                  <span className="tonight-numbers">
                                    {row.score}
                                  </span>
                                ) : null}
                                <svg
                                  viewBox="0 0 24 24"
                                  aria-hidden="true"
                                  className="tonight-chevron"
                                >
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                              </button>
                              <TargetTile
                                className="tonight-tile-over"
                                target={item.target}
                                visualMode={visual}
                                previewUrl={hipsPreviewUrl(
                                  night?.card || { target: item.target },
                                )}
                                locale={locale}
                                named
                                openLabel={say("planTargetSheetPhoto", {
                                  target: row.designation,
                                })}
                                onOpen={({ url, credit }) =>
                                  photo.open({
                                    target: item.target,
                                    url,
                                    credit,
                                    window:
                                      item.start && item.end
                                        ? {
                                            start: friseClock(item.start),
                                            end: friseClock(item.end),
                                            maxAltitude: night?.maxAltitude,
                                            inPlan: true,
                                          }
                                        : null,
                                  })
                                }
                              />
                            </li>
                          );
                        })}
                      </ul>
                    ) : plan.targets.length ? (
                      <ul className="tonight-chips">
                        {plan.targets.map((target) => {
                          const item = planCards[index]?.items.find(
                            (entry) => entry.label === target,
                          );
                          return (
                            <li key={target}>
                              {item ? (
                                <button
                                  type="button"
                                  className="tonight-chip"
                                  onClick={() =>
                                    setPlanTarget({
                                      plan: planCards[index],
                                      item,
                                    })
                                  }
                                >
                                  {target}
                                </button>
                              ) : (
                                <span className="tonight-chip">{target}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {waitingPlanIds.has(String(plan.id)) &&
                    planSessionHref(locale, planSessions?.get(plan.id)) ? (
                      // The plan of this night waits for its debriefing.
                      <a
                        className="btn-secondary is-debrief tonight-debrief-open"
                        data-plan-id={plan.id}
                        href={planSessionHref(
                          locale,
                          planSessions.get(plan.id),
                        )}
                      >
                        {message(locale, "journalDebriefSession")}
                      </a>
                    ) : null}
                    <a
                      // The same level on every card -- the only action of
                      // its zone, running plan or not.
                      className="btn-primary tonight-plan-open"
                      href={plannerHref}
                      onClick={() =>
                        rememberPlannerOpening({ date: subject.date, place })
                      }
                    >
                      {words.openPlan}
                    </a>
                  </article>
                );
              })
            ) : (
              <>
                <p className="tonight-muted">{words.noPlan}</p>
                <a
                  className="btn-primary tonight-new-plan"
                  href={plannerHref}
                  // "Nouveau plan" opens the planner on a new plan of
                  // this night, at this place, its tab selected.
                  onClick={() =>
                    rememberPlannerOpening({
                      date: subject.date,
                      place,
                      newPlan: true,
                    })
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  {words.newPlan}
                </a>
              </>
            )}
          </section>

          {
            <section
              aria-labelledby="tonight-see-title"
              className="tonight-see"
            >
              {/* The title and its actions on one line when they fit;
                  otherwise the actions go under the title, on the right
                  (320 px, German, Russian): nothing is squeezed. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  width: "100%",
                  minWidth: 0,
                  gap: 8,
                }}
              >
                <h2
                  id="tonight-see-title"
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    textAlign: "left",
                  }}
                >
                  {words.toSee}
                </h2>
                <div
                  className="tonight-see-actions"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginLeft: "auto",
                    minWidth: 0,
                  }}
                >
                  {/* « Voir plus » (a link, rule 6) unfolds up to ten
                    rows and becomes « Voir moins », which folds them back. */}
                  {visible.length > 0 && (
                    <button
                      type="button"
                      className="btn-link tonight-see-more"
                      aria-expanded={expanded}
                      style={{
                        flex: "0 0 auto",
                        width: "auto",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => setExpanded(!expanded)}
                    >
                      {say(expanded ? "tonightSeeLess" : "tonightSeeMore")}
                    </button>
                  )}
                  {/* The mode of the list (the app's button): the icon shows
                    the mode shown, a click switches to the other one. */}
                  {place && (
                    <button
                      type="button"
                      className="btn-tertiary"
                      data-testid="tonight-suggestions-mode"
                      data-mode={suggestionsMode}
                      aria-label={say(
                        suggestionsMode === "visual"
                          ? "tonightSuggestionsModeVisual"
                          : "tonightSuggestionsModePhoto",
                      )}
                      title={say(
                        suggestionsMode === "visual"
                          ? "tonightSuggestionsModeVisual"
                          : "tonightSuggestionsModePhoto",
                      )}
                      onClick={() =>
                        writeTonightSuggestionsMode(
                          suggestionsMode === "visual" ? "imaging" : "visual",
                        )
                      }
                    >
                      <SuggestionsModeIcon
                        visual={suggestionsMode === "visual"}
                      />
                    </button>
                  )}
                  {visible.length > 0 && (
                    <button
                      type="button"
                      className="btn-tertiary"
                      aria-label={say("tonightRefreshTargets")}
                      disabled={exhausted}
                      onClick={refreshSuggestions}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {/* « Suggestions pour la photo · Maison »; from the second ten
                  it takes in « Suggestions 11 à 20 ». The filter
                  icon at its right; filters in
                  use fuse their summary into it, one line cut by « … ». */}
              {place && place.name ? (
                <div
                  className="tonight-see-line"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  {(() => {
                    const filtered = suggestFiltersLine(locale, {
                      mode: suggestionsMode,
                      tier: visible.length > 0 ? tier : 1,
                      placeName: place.name,
                      filters: suggestFilters,
                    });
                    return (
                      <p
                        className={`tonight-muted${filtered ? " is-filtered" : ""}`}
                        data-testid={
                          filtered
                            ? "tonight-suggestions-filtered-line"
                            : visible.length > 0 && tier > 1
                              ? "tonight-positions"
                              : "tonight-suggestions-mode-line"
                        }
                        title={filtered || undefined}
                        onClick={() => setFiltersOpen(true)}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 0,
                          margin: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: "pointer",
                          ...(filtered
                            ? { color: "var(--active-gold-text)" }
                            : {}),
                        }}
                      >
                        {filtered ||
                          tonightSuggestionsModeLine(locale, {
                            mode: suggestionsMode,
                            tier: visible.length > 0 ? tier : 1,
                            placeName: place.name,
                          })}
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    className="btn-tertiary tonight-suggestions-filters"
                    data-testid="tonight-suggestions-filters"
                    aria-haspopup="dialog"
                    aria-label={suggestFiltersButtonLabel(
                      locale,
                      suggestFilters,
                    )}
                    title={suggestFiltersButtonLabel(locale, suggestFilters)}
                    onClick={() => setFiltersOpen(true)}
                    style={{ position: "relative", flex: "0 0 auto" }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />
                    </svg>
                    {suggestFiltersActiveCount(suggestFilters) > 0 ? (
                      <span
                        className="filters-button-count"
                        data-testid="tonight-suggestions-filters-count"
                        aria-hidden="true"
                        style={{ position: "absolute", top: -6, right: -6 }}
                      >
                        {suggestFiltersActiveCount(suggestFilters)}
                      </span>
                    ) : null}
                  </button>
                </div>
              ) : (
                visible.length > 0 &&
                tier > 1 && (
                  <p className="tonight-muted" data-testid="tonight-positions">
                    {suggestMessage(locale, "suggestPosition", {
                      from: (tier - 1) * 10 + 1,
                      to: tier * 10,
                    })}
                  </p>
                )
              )}
              {weatherNotice && visible.length > 0 && (
                <p
                  className="tonight-muted"
                  role="status"
                  data-testid="tonight-weather-notice"
                >
                  {say("tonightListUpdatedWithWeather")}
                </p>
              )}
              {words.candidates.length ? (
                <ul
                  className="tonight-card tonight-candidates"
                  aria-label={say("tonightSuggestionsLabel")}
                >
                  {overview.candidates.map((candidate, index) => {
                    const line = words.candidates[index];
                    return (
                      <li
                        key={candidate.id || index}
                        className="tonight-row-item"
                      >
                        <a
                          href={`#pourquoi-${candidate.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            if (candidate.score) setExplained(candidate);
                          }}
                        >
                          {/* The target's night of altitude in filigree behind the
                              row, as the planner's cards draw it. */}
                          <AvailabilityGraph
                            card={{ ...candidate.card, minAltitude }}
                          />
                          {/* The tile is laid over this place, outside the
                              row's link, so that its photo opens the
                              full-screen viewer. */}
                          <span
                            className="tonight-tile-slot"
                            aria-hidden="true"
                          />
                          <span className="tonight-candidate-text">
                            <span className="tonight-candidate-name">
                              {line.designation}
                              {line.name ? (
                                <span className="tonight-muted">
                                  {` · ${line.name}`}
                                </span>
                              ) : null}
                            </span>
                            <span className="tonight-numbers">
                              {line.window}
                            </span>
                            {visualList &&
                              tonightVisualFactsLine(
                                locale,
                                candidate.card.target,
                                visualSky,
                                visualBinoculars,
                              ) && (
                                <span
                                  className="tonight-muted tonight-small"
                                  data-testid={`tonight-visual-facts-${candidate.id}`}
                                >
                                  {tonightVisualFactsLine(
                                    locale,
                                    candidate.card.target,
                                    visualSky,
                                    visualBinoculars,
                                  )}
                                </span>
                              )}
                            <span className="tonight-muted tonight-small">
                              {line.altitude}
                            </span>
                            {/* SUGGEST-FILTERS-01: the mask ignored, the
                                stretch of its window behind it. */}
                            {candidate.maskHidden && (
                              <span
                                className="tonight-muted tonight-small"
                                data-testid={`tonight-mask-hidden-${candidate.id}`}
                              >
                                {message(locale, "horizonPathMaskedBetween")
                                  .replace(
                                    "{start}",
                                    friseClock(candidate.maskHidden.start),
                                  )
                                  .replace(
                                    " {end}",
                                    `\u00a0${friseClock(candidate.maskHidden.end)}`,
                                  )
                                  .replace(
                                    "{end}",
                                    friseClock(candidate.maskHidden.end),
                                  )}
                              </span>
                            )}
                            {visualList &&
                              visualCardAdviceText(locale, candidate.card) && (
                                <span
                                  className="tonight-muted tonight-small"
                                  data-testid={`tonight-filter-advice-${candidate.id}`}
                                >
                                  {visualCardAdviceText(locale, candidate.card)}
                                </span>
                              )}
                          </span>
                          <span className="tonight-numbers">
                            {/* The later pages are laid out by start: the
                                rank says where the target stands. */}
                            {tier > 1 && candidate.rank ? (
                              <span
                                className="tonight-muted"
                                data-testid={`tonight-rank-${candidate.id}`}
                              >
                                {`${suggestMessage(locale, "suggestRank", {
                                  rank: ordinalRank(locale, candidate.rank),
                                })} · `}
                              </span>
                            ) : null}
                            {line.score}
                          </span>
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="tonight-chevron"
                          >
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </a>
                        <TargetTile
                          className="tonight-tile-over"
                          target={candidate.card.target}
                          previewUrl={hipsPreviewUrl(candidate.card)}
                          locale={locale}
                          named
                          openLabel={say("planTargetSheetPhoto", {
                            target: line.designation,
                          })}
                          onOpen={({ url, credit }) =>
                            photo.open({
                              target: candidate.card.target,
                              url,
                              credit,
                              window:
                                candidate.windowStart && candidate.windowEnd
                                  ? {
                                      start: friseClock(candidate.windowStart),
                                      end: friseClock(candidate.windowEnd),
                                      maxAltitude: candidate.maxAltitude,
                                    }
                                  : null,
                            })
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : words.toSeeLoading ? (
                <LoadingState
                  layout="inline"
                  className="tonight-to-see-loading"
                  testId="tonight-to-see-loading"
                >
                  {words.toSeeEmpty}
                </LoadingState>
              ) : suggestFiltersActiveCount(suggestFilters) > 0 && place ? (
                // Emptied by the filters,
                // the list says so and offers the gesture that widens it.
                <>
                  <p
                    className="tonight-muted"
                    data-testid="tonight-to-see-empty"
                  >
                    {message(locale, "suggestFiltersEmpty")}
                  </p>
                  <button
                    type="button"
                    className="btn-tertiary"
                    data-testid="tonight-suggestions-widen"
                    style={{ width: "100%" }}
                    onClick={() => setFiltersOpen(true)}
                  >
                    {message(locale, "suggestFiltersWiden")}
                  </button>
                </>
              ) : (
                <p className="tonight-muted">{words.toSeeEmpty}</p>
              )}
              {visible.length > 0 && (
                <div
                  className="planner-autofill-actions"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    width: "100%",
                    minWidth: 0,
                    gap: 8,
                  }}
                >
                  {/* The way back to the best targets is a
                      full-width tertiary under the list, above « Créer un
                      plan avec ces cibles » (two stacked tertiaries). */}
                  {tier > 1 && (
                    <button
                      type="button"
                      className="btn-tertiary"
                      data-testid="tonight-suggestions-best"
                      style={{
                        flex: "1 1 100%",
                        width: "auto",
                        minWidth: 0,
                        maxWidth: "100%",
                        minHeight: 44,
                        height: "auto",
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        lineHeight: 1.3,
                      }}
                      onClick={() =>
                        setPosition(
                          tonightSuggestionPosition(positionKey, {
                            tier: 1,
                            exhausted: false,
                          }),
                        )
                      }
                    >
                      {suggestMessage(locale, "suggestBest")}
                    </button>
                  )}
                  {/* « Plus de cibles à proposer » stays under the way back. */}
                  {exhausted && (
                    <p
                      className="tonight-muted"
                      data-testid="tonight-suggestions-exhausted"
                      style={{ flex: "1 1 100%", margin: 0 }}
                    >
                      {suggestMessage(locale, "suggestExhausted")}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn-tertiary"
                    style={{
                      flex: "1 1 200px",
                      width: "auto",
                      minWidth: 0,
                      maxWidth: "100%",
                      minHeight: 44,
                      height: "auto",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      lineHeight: 1.3,
                    }}
                    onClick={() => openSuggestedPlan()}
                  >
                    {say("tonightCreateSuggestions")}
                  </button>
                </div>
              )}
            </section>
          }
        </>
      )}
      {creationError && <p role="alert">{creationError}</p>}
      {madeElsewhere && (
        <p
          className="tonight-plan-elsewhere"
          data-testid="tonight-plan-elsewhere"
          role="status"
        >
          {quickPlanMessage(locale, "planCreatedOtherNight", {
            date: madeElsewhere,
          })}{" "}
          <a href={plannerHref}>{words.openPlan}</a>
        </p>
      )}
      {filtersOpen && place && (
        <SuggestFiltersDialog
          locale={locale}
          filters={suggestFilters}
          periods={
            sky
              ? nightPeriods({ start: sky.darkStart, end: sky.darkEnd })
              : null
          }
          clock={friseClock}
          hasMask={
            place.horizonMask?.enabled === true &&
            horizonMaskHasProfile(place.horizonMask)
          }
          // « Voir N cibles » on the pool of the list; a draft that changes
          // the pool (catalogues, mask) is counted once applied.
          countOf={(draft) =>
            draft.catalogues.join(",") ===
              suggestFilters.catalogues.join(",") &&
            draft.ignoreMask === suggestFilters.ignoreMask
              ? suggestionFilteredCount({
                  candidates: candidates.filter((entry) =>
                    suggestionTargetMatches(entry.card.target, {
                      families: draft.families,
                    }),
                  ),
                  spans: sky
                    ? suggestionPeriodSpans(
                        { start: sky.darkStart, end: sky.darkEnd },
                        draft.periods,
                      )
                    : null,
                  minimumMinutes: visualList ? 20 : 45,
                })
              : null
          }
          onApply={(next) => {
            setFiltersOpen(false);
            applyFilters(next);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {suggesting && (
        <SuggestNightDialog
          locale={locale}
          timeZone={timeZone}
          proposal={suggesting.initial}
          suspended={Boolean(planExists)}
          contextLine={suggestMessage(locale, "suggestContext", {
            place: place.name,
            date: new Date(
              `${suggesting.date ?? subject.date}T12:00:00Z`,
            ).toLocaleDateString(locale, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }),
          })}
          equipmentLine={suggesting.inputs.equipmentName || ""}
          visual={suggesting.inputs.mode === "visual"}
          filterAdviceFor={(entry) =>
            visualCardAdviceText(
              locale,
              suggesting.inputs.candidates.find(
                (candidate) => candidate.card.target.id === entry.target.id,
              )?.card,
            )
          }
          seedInputs={{ date: suggesting.date ?? subject.date, ...coordinates }}
          propose={(request) =>
            suggestNight({
              ...suggesting.inputs,
              ...(suggesting.span ? { span: suggesting.span } : {}),
              ...(suggesting.spans ? { spans: suggesting.spans } : {}),
              ...suggestionInputs,
              comfort: comfortNow(suggesting.comfortFamily),
              ...request,
              // What the other plans of the night hold, of the nature of this
              // rig (photo with photo, visual with visual).
              excluded: [
                ...targetIdsTakenOnNight(loaded?.document?.plans || [], {
                  date: suggesting.date ?? subject.date,
                  visual: suggesting.inputs.mode === "visual",
                }),
                ...(request.excluded || []),
              ],
              takenByOtherPlans: targetIdsTakenOnNight(
                loaded?.document?.plans || [],
                {
                  date: suggesting.date ?? subject.date,
                  visual: suggesting.inputs.mode === "visual",
                },
              ),
              layout: "night",
            })
          }
          onApply={createSuggestedPlan}
          comfort={
            observationComfortRange(suggesting.comfortFamily)
              ? {
                  family: suggesting.comfortFamily,
                  on: comfortNow(suggesting.comfortFamily) !== null,
                }
              : null
          }
          onComfort={(on) => writeObservationComfort(browserStorage(), on)}
          // The bar « Filtres » of the suggestions; a
          // change is kept, then the dialog opens again on the list the
          // section shows with it.
          filters={{
            badges: suggestFilterBadges(locale, suggestFilters, applyFilters),
            onOpen: () => setFiltersOpen(true),
            onReset: () => applyFilters(null),
          }}
          onClose={() => setSuggesting(null)}
          onChange={() => {
            setSuggesting(null);
            setChoosing(true);
          }}
          // A night too short for one target leads to the next night, never
          // back to this page.
          nextNightDate={nextNightDate(suggesting.date ?? subject.date)}
          onNextNight={() => {
            const next = nextNightDate(suggesting.date ?? subject.date);
            setSuggesting(null);
            if (next) openSuggestedPlan(next);
          }}
          renderFooter={({ selected, onClose, busy, placement }) => (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                minWidth: 0,
                gap: 8,
              }}
            >
              <p
                className="planner-autofill-later"
                style={{
                  width: "100%",
                  minWidth: 0,
                  margin: 0,
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  textAlign: "center",
                }}
              >
                {/* */}
                {suggestMessage(locale, "autoFillLater")}
              </p>
              <div
                className="planner-autofill-actions"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  width: "100%",
                  minWidth: 0,
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="btn-link"
                  style={{ flex: "0 0 auto", width: "auto", minHeight: 44 }}
                  disabled={creating}
                  onClick={onClose}
                >
                  {suggestMessage(locale, "autoFillCancel")}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    flex: "1 1 200px",
                    width: "auto",
                    minWidth: 0,
                    maxWidth: "100%",
                    minHeight: 44,
                    height: "auto",
                    padding: "10px 12px",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    lineHeight: 1.3,
                  }}
                  disabled={creating || busy || !selected.size}
                  onClick={() => createSuggestedPlan([...selected], placement)}
                >
                  {say("tonightCreatePlanWithTargets")}
                </button>
              </div>
            </div>
          )}
        />
      )}
      {planExists && (
        <PlanExistsDialog
          {...planExists}
          locale={locale}
          offersHref={quickPlanOffersHref({
            locale,
            signedIn: Boolean(loaded?.authenticated),
          })}
          onClose={() => setPlanExists(null)}
          onResult={(result) => created(result, planExists.action)}
          onError={() => {
            setCreationError(message(locale, "planOperationFailed"));
            setCreating(false);
          }}
        />
      )}
      {planTarget ? (
        <PlanTargetDialog
          item={planTarget.item}
          night={planNights[planTarget.plan.id]?.[planTarget.item.index]}
          locale={locale}
          at={friseClock}
          moonUp={overview.timeline?.moonUp || []}
          dew={overview.weather?.dew || null}
          onClose={() => setPlanTarget(null)}
        />
      ) : null}
      {photo.viewer}
      {placeDetails && place ? (
        <PlannerPlaceDetails
          locale={locale}
          place={
            knownPlaces.find((entry) => entry.id && entry.id === place.id) ||
            place
          }
          onEdit={() =>
            setPlaceEditor(
              knownPlaces.find((entry) => entry.id && entry.id === place.id) ||
                place,
            )
          }
          onClose={() => setPlaceDetails(false)}
          lightMap={lightMap}
        />
      ) : null}
      {lightMapBox ? (
        <LockedCardDialog
          locale={locale}
          kind="lightMap"
          feature="lightMap"
          onClose={() => setLightMapBox(false)}
        />
      ) : null}
      {placeEditor ? (
        <PlannerPlaceDialog
          locale={locale}
          place={placeEditor}
          places={knownPlaces}
          unassignedProfiles={loaded?.document?.unassignedHorizonProfiles || []}
          autoLocate={false}
          onSave={savePlace}
          onDelete={deletePlace}
          onClose={() => setPlaceEditor(null)}
        />
      ) : null}
      {explained ? (
        <TargetScoreExplained
          score={explained.score}
          card={explained.card}
          date={subject.date}
          locale={locale}
          placeName={words.placeName}
          timeZone={timeZone}
          // The night and the season of the target, judged as "À voir ce
          // soir" judges it: the place with its mask, the plan's minimum
          // height, the night's darkness.
          night={{
            place,
            constraints: { minAltitude },
            darkness: subject.darkness,
          }}
          filterAdvice={
            visualList ? visualCardAdviceText(locale, explained.card) : null
          }
          visualMode={Boolean(visualList)}
          // « Prévisualiser »: the browser's preference, else « Mon
          // matériel », under the place's sky. "À voir ce soir" has no plan
          // of the target: no line « Le plan utilise ».
          preview={{
            planEquipment: null,
            configuration: defaultConfiguration,
            profiles: pickerLists.profiles,
            visualInventory: visualInventoryOf(profileSets),
            // « Créer un cadrage »: this page mounts no editor — the planner
            // opens on it, handed the same note « Définir mon matériel »
            // leaves (`framing-editor-draft.js`), on this night and place.
            onCreateFraming: (seed) => {
              let storage = null;
              try {
                storage = window.sessionStorage;
              } catch {
                storage = null;
              }
              rememberFramingEditorDraft(storage, {
                editor: {
                  mode: "create",
                  initialDefaultEquipment: seed.defaultEquipment,
                },
                equipmentSelection: seed.equipment,
                view: { center: seed.center, fovDegrees: seed.fovDegrees },
              });
              rememberPlannerOpening({ date: subject.date, place });
              window.location.assign(plannerHref);
            },
            ...previewSkyProps({
              choice: skyBrightness.choice,
              place,
              loading: placeSkyLoading({
                choice: skyBrightness.choice,
                measures: placeSkyMeasures,
                modelStatus: skyQuality.status,
              }),
            }),
            // The planner's pickers in « Matériel de l'aperçu », « Définir
            // mon matériel » at its foot, and the piece it brought back.
            pickers: {
              props: previewPickerProps,
              define: defineEquipment,
              returned: returnedEquipment,
              onReturnedUsed: (used) =>
                setReturnedEquipment((current) =>
                  current === used ? null : current,
                ),
            },
          }}
          onClose={() => setExplained(null)}
        />
      ) : null}
    </main>
  );
}

// this browser's storage, or nothing (a page drawn
// without a window).
function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The `comfort` of the engine for `family`, from the shared choice as it
// stands now (`null` with « Sans restriction », or where it is not offered).
function comfortNow(family) {
  return readObservationComfort(browserStorage())
    ? observationComfortRange(family)
    : null;
}
