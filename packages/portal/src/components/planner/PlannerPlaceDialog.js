"use client";
import { randomUuid } from "../../random-uuid.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  emptyHorizon,
  knownElevation,
  normalizeKnownPlaceLink,
  normalizePlace,
  placeCoordinates,
  placeKinds,
  MODIFY_CONFIRMATION_KM,
  placeDistanceKm,
  resolvedPlaceNaming,
} from "portal/planner/state.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import {
  distinctPlaceResults,
  placeResultLines,
} from "portal/planner/place-results.js";
import {
  applyPlaceTimeZone,
  isChosenTimeZone,
  isKnownTimeZone,
  offlineTimeZoneForCoordinates,
  placeSaveBlock,
  timeZoneShownName,
} from "portal/planner/place-time-zone.js";
import { PlaceTimeZoneNotice } from "../sessions/PlaceTimeZoneNotice.js";
import { floatingPopoverPosition } from "portal/floating-popover.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import { decimalText, message } from "../../i18n.js";
import {
  normalizeSkyEntered,
  skyEnteredFromInput,
} from "../../sky-brightness-source.js";
import {
  PlannerHorizonEditor,
  PlannerHorizonSectorsLegend,
} from "./PlannerHorizonEditor.js";
import { placeHasUnsavedChoices } from "portal/planner/place-leave-guard.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { BaseMapCredit } from "../BaseMapCredit.js";
import { bindPlaceMapChoice } from "./place-map-choice.js";
import {
  BASE_MAP_DARK_FILTER_CLASS,
  BASE_MAP_SOURCE,
} from "../../base-map-source.js";
import "leaflet/dist/leaflet.css";

export async function locationRequest(body, signal) {
  const response = await fetch("/api/planner-location", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Location unavailable.");
  return result;
}
// The place map of the editor. `readOnly` (the place's details of « Cette nuit
// ») draws it centred on the marker with neither zoom, nor pan, nor movable
// marker; a click on it calls `onOpen` (the editor), named `openLabel`.
export function PlaceMap({
  locale,
  location,
  onSelect,
  readOnly = false,
  onOpen,
  openLabel,
}) {
  const host = useRef(null),
    mapRef = useRef(null),
    markerRef = useRef(null),
    callback = useRef(onSelect),
    latestLocation = useRef(location);
  const [status, setStatus] = useState("loading");
  callback.current = onSelect;
  latestLocation.current = location;
  useEffect(() => {
    let disposed = false,
      resize,
      stopChoice;
    import("leaflet")
      .then((module) => {
        if (disposed) return;
        const L = module.default || module;
        const map = L.map(host.current, {
          ...(readOnly
            ? {
                dragging: false,
                touchZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                zoomControl: false,
              }
            : {}),
          scrollWheelZoom: false,
          // The credit is drawn by `BaseMapCredit`: in a corner of the map,
          // never behind a click (CARTO's attribution rule).
          attributionControl: false,
          maxZoom: 19,
        });
        mapRef.current = map;
        const coordinates = placeCoordinates(latestLocation.current);
        map.setView(
          coordinates ? [coordinates.latitude, coordinates.longitude] : [20, 0],
          coordinates ? 14 : 2,
        );
        // One dark base for the web (`base-map-source.js`, MD 2.14).
        const tile = L.tileLayer(BASE_MAP_SOURCE.urlTemplate, {
          maxZoom: 19,
          maxNativeZoom: BASE_MAP_SOURCE.maxNativeZoom,
          className: BASE_MAP_SOURCE.darkFilter
            ? BASE_MAP_DARK_FILTER_CLASS
            : undefined,
        }).addTo(map);
        tile.on("tileerror", () => !disposed && setStatus("error"));
        tile.on("load", () => !disposed && setStatus("ready"));
        const marker = L.marker(
          coordinates ? [coordinates.latitude, coordinates.longitude] : [20, 0],
          {
            draggable: !readOnly,
            keyboard: !readOnly,
            interactive: !readOnly,
            title: flow(locale, "position"),
            icon: L.divIcon({
              className: "planner-place-marker",
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
            opacity: coordinates ? 1 : 0,
          },
        ).addTo(map);
        markerRef.current = marker;
        const choose = (latlng) => {
          marker.setLatLng(latlng).setOpacity(1);
          callback.current({
            latitude: latlng.lat,
            longitude: ((((latlng.lng + 180) % 360) + 360) % 360) - 180,
          });
        };
        if (!readOnly) stopChoice = bindPlaceMapChoice(map, marker, choose);
        resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        resize.observe(host.current);
        setStatus("ready");
      })
      .catch(() => !disposed && setStatus("error"));
    return () => {
      disposed = true;
      resize?.disconnect();
      stopChoice?.();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);
  useEffect(() => {
    const coordinates = placeCoordinates(location);
    if (coordinates && mapRef.current && markerRef.current) {
      markerRef.current
        .setLatLng([coordinates.latitude, coordinates.longitude])
        .setOpacity(1);
      mapRef.current.setView(
        [coordinates.latitude, coordinates.longitude],
        Math.max(13, mapRef.current.getZoom()),
        { animate: false },
      );
    }
  }, [location.latitude, location.longitude]);
  return (
    <div className="planner-place-map-wrap">
      <div className="planner-place-map-frame">
        <div
          className="planner-place-map"
          ref={host}
          role="region"
          aria-label={flow(locale, "mapDark")}
        />
        {readOnly && onOpen && (
          <button
            type="button"
            className="planner-place-map-open"
            aria-label={openLabel}
            onClick={onOpen}
          />
        )}
        <BaseMapCredit source={BASE_MAP_SOURCE} />
      </div>
      {status !== "ready" && (
        <p role="status">
          {flow(locale, status === "error" ? "mapError" : "mapLoading")}
        </p>
      )}
    </div>
  );
}

// The types a place can be of: « Privé » — what a new place is — and the
// four of a known place.
const kindMessageKey = {
  private: "placesKindPrivate",
  viewpoint: "placesKindViewpoint",
  campsite: "placesKindCampsite",
  park: "placesKindPark",
  picnic: "placesKindPicnic",
};

/** « 40 m », « 27 km »: the distance of a possible duplicate. */
const duplicateDistance = (locale, metres) =>
  metres < 1000
    ? `${new Intl.NumberFormat(locale).format(metres)} m`
    : `${new Intl.NumberFormat(locale).format(Math.round(metres / 1000))} km`;

// A place met without a zone is given the table's, by its
// position, as it opens — never left to read as UTC.
function withTableZone(draft) {
  if (placeCoordinates(draft) && !isKnownTimeZone(draft.timeZone))
    return { ...draft, timeZone: offlineTimeZoneForCoordinates(draft) ?? "" };
  return draft;
}
/**
 * The editor of a place (create and edit: one editor). `IdealPlaces` is the
 * panel of the suggested places, a component of the planner package
 * (`{ locale, onUse, onClose, ...idealPlacesProps }`): without it the entry
 * « Trouver un lieu idéal » is not offered. `duplicatesOf(place)` answers the
 * places of mine that look like the one being written (`{ other, sameName,
 * distanceMetres }`), `onOpenPlace(place)` opens the sheet of one of them.
 */
export function PlannerPlaceDialog({
  locale,
  place,
  places,
  unassignedProfiles = [],
  onSave,
  onClose,
  autoLocate = true,
  IdealPlaces = null,
  idealPlacesProps = {},
  duplicatesOf = () => [],
  onOpenPlace = null,
}) {
  const [draft, setDraft] = useState(() =>
    withTableZone({
      name: "",
      locality: "",
      latitude: "",
      longitude: "",
      elevation: "0",
      timeZone: "",
      ...structuredClone(place || {}),
      // The type is chosen, or the suggestion's, else « private ».
      kind: placeKinds.includes(place?.kind)
        ? place.kind
        : (normalizeKnownPlaceLink(place?.knownPlace)?.type ?? "private"),
      // A mask saved on the former 30° grid is edited, and saved, on the
      // 10° grid: same curve, thirty-six points.
      horizonMask: {
        ...normaliseHorizonMask(place?.horizonMask || emptyHorizon()),
        enabled: true,
      },
    }),
  );
  const [step, setStep] = useState(1),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false),
    [searching, setSearching] = useState(false),
    [status, setStatus] = useState(place ? "locationKept" : "");
  const [error, setError] = useState("");
  const [destination, setDestination] = useState(
    places.some((entry) => entry.id === place?.id) ? place.id : "new",
  );
  const [idealOpen, setIdealOpen] = useState(false);
  // Closing with a position chosen (or a place changed) and not saved asks
  // first.
  const [leaveAsk, setLeaveAsk] = useState(false);
  // Modifying a saved place whose new position is more than
  // 50 km away asks first (`{ value, name, km }`), before anything is written.
  const [modifyConfirm, setModifyConfirm] = useState(null);
  // The sky background typed for the place: optional, mag/arcsec²,
  // checked against its range when the place is saved.
  const keptSky = normalizeSkyEntered(place?.skyEntered);
  const [skyText, setSkyText] = useState(() =>
    keptSky
      ? new Intl.NumberFormat(locale, {
          maximumFractionDigits: 2,
          useGrouping: false,
        }).format(keptSky.sqm)
      : "",
  );
  const [skyInvalid, setSkyInvalid] = useState(false);
  const [coordinatesDraft, setCoordinatesDraft] = useState({
    latitude: place?.latitude || "",
    longitude: place?.longitude || "",
    elevation: place?.elevation || "0",
  });
  // The floating results list: which option arrow-key navigation currently
  // highlights (-1 = none, the field's own text still rules), and the
  // computed position/size that keeps it anchored to the address field
  // instead of pushing the map down.
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [resultsStyle, setResultsStyle] = useState(null);
  const dialogRef = useRef(null),
    sequence = useRef(0),
    requestRef = useRef(null),
    searchRef = useRef(null),
    searchAnchorRef = useRef(null),
    searchInputRef = useRef(null),
    resultsListRef = useRef(null),
    live = useRef(true);
  const resolvedPosition = useRef(
    placeCoordinates(place) && place.timeZone
      ? `${place.latitude}:${place.longitude}`
      : "",
  );
  const coordinates = placeCoordinates(draft);
  // The zone the place is read in, and the last resort — a position and
  // no zone: the encadré offers to choose it, and « Enregistrer » says why it is
  // grey.
  const zoneRef = useRef(draft.timeZone);
  zoneRef.current = draft.timeZone;
  const zoneUnresolved =
    Boolean(coordinates) && !busy && !isKnownTimeZone(draft.timeZone);
  const destinationDistance = placeDistanceKm(
    draft,
    places.find((entry) => entry.id === destination),
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector('[aria-current="step"]')
        ?.focus({ preventScroll: true });
      dialogRef.current?.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  // Opening, closing and handing the focus back are the shared web dialog
  // shell's job (`WebDialog`);
  // this only starts and stops the dialog's own work.
  useEffect(() => {
    live.current = true;
    if (!place && autoLocate) locate();
    return () => {
      live.current = false;
      ++sequence.current;
      requestRef.current?.abort();
      searchRef.current?.abort();
    };
  }, []);
  async function resolvePosition(position, reverse = true) {
    const value = placeCoordinates(position);
    if (!value) {
      setError("invalidCoords");
      return;
    }
    const version = ++sequence.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const moved =
      Boolean(coordinates) &&
      Math.abs(coordinates.latitude - value.latitude) +
        Math.abs(coordinates.longitude - value.longitude) >
        0.00001;
    const changed = !coordinates || moved;
    // « Le point a changé » says a point that was there has moved -- never at
    // the first point of a place.
    if (moved) {
      setStatus("horizonMoved");
    }
    resolvedPosition.current = "";
    setBusy(true);
    setError("");
    const suppliedElevation =
      position.elevation !== undefined &&
      position.elevation !== null &&
      String(position.elevation).trim() !== ""
        ? String(position.elevation)
        : "";
    // The zone is the table's at once — the service refines
    // it when it answers — unless the person chose it for this very position.
    const tableZone = offlineTimeZoneForCoordinates(value) ?? "";
    setDraft((current) => {
      const keepChosen = !changed && isChosenTimeZone(current);
      const { timeZoneSource: _mark, ...rest } = current;
      return {
        ...(keepChosen ? current : rest),
        ...value,
        timeZone: keepChosen ? current.timeZone : tableZone,
        elevation: suppliedElevation,
      };
    });
    setCoordinatesDraft((current) => ({
      ...current,
      ...value,
      elevation: suppliedElevation,
    }));
    try {
      const result = await locationRequest(
        {
          operation: "resolve",
          ...value,
          ...(suppliedElevation ? { elevation: suppliedElevation } : {}),
          reverse,
          locale,
        },
        controller.signal,
      );
      if (!live.current || version !== sequence.current) return;
      const { elevationSource, ...resolved } = result;
      // The service answers "0" when its elevation provider failed and says
      // so in `elevationSource`: that zero is a placeholder, and the place
      // keeps no elevation rather than claim to be at sea level.
      const resolvedPlace =
        elevationSource === "unavailable"
          ? { ...resolved, elevation: "" }
          : resolved;
      setDraft((current) => ({
        ...current,
        ...resolvedPlace,
        // A zone the person chose is never replaced by a late answer.
        ...(isChosenTimeZone(current) ? { timeZone: current.timeZone } : {}),
        ...resolvedPlaceNaming(
          current,
          resolvedPlace,
          flow(locale, "position"),
        ),
      }));
      setCoordinatesDraft((current) => ({
        ...current,
        elevation: resolvedPlace.elevation ?? current.elevation,
      }));
      if (elevationSource === "unavailable") setStatus("elevationUnavailable");
      resolvedPosition.current = `${value.latitude}:${value.longitude}`;
    } catch (exception) {
      if (
        exception.name !== "AbortError" &&
        live.current &&
        version === sequence.current
      )
        // The table already gave a zone; without one, the encadré offers
        // to choose it.
        setError((current) =>
          current === "" && !isKnownTimeZone(zoneRef.current)
            ? "timezoneError"
            : current,
        );
    } finally {
      if (live.current && version === sequence.current) setBusy(false);
    }
  }
  async function locate() {
    requestRef.current?.abort();
    setBusy(false);
    setError("");
    if (!navigator.geolocation) {
      setStatus("gpsUnavailable");
      return;
    }
    const version = ++sequence.current;
    setStatus("locating");
    try {
      const permission = await navigator.permissions?.query?.({
        name: "geolocation",
      });
      if (!live.current || version !== sequence.current) return;
      if (permission?.state === "denied") {
        setStatus("gpsDenied");
        return;
      }
    } catch {
      // Some browsers expose geolocation without implementing Permissions API.
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!live.current || version !== sequence.current) return;
        setStatus("located");
        resolvePosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(position.coords.altitude !== null
            ? { elevation: String(Math.round(position.coords.altitude)) }
            : {}),
        });
      },
      (geolocationError) => {
        if (!live.current || version !== sequence.current) return;
        setStatus(
          geolocationError.code === 1
            ? "gpsDenied"
            : geolocationError.code === 3
              ? "gpsTimeout"
              : "gpsUnavailable",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }
  async function search() {
    if (query.trim().length < 2) return;
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    setSearching(true);
    setError("");
    setActiveResultIndex(-1);
    try {
      const payload = await locationRequest(
        { operation: "search", query, locale },
        controller.signal,
      );
      if (!live.current || controller.signal.aborted) return;
      // One line per place the person can tell apart, whatever the service
      // answered.
      const distinct = distinctPlaceResults(payload.results);
      setResults(distinct);
      if (!distinct.length) setError("noResults");
    } catch (exception) {
      if (exception.name !== "AbortError" && live.current)
        setError("searchError");
    } finally {
      if (live.current && !controller.signal.aborted) setSearching(false);
    }
  }
  function closeSearchResults() {
    setResults([]);
    setActiveResultIndex(-1);
  }
  function chooseResult(result) {
    ++sequence.current;
    requestRef.current?.abort();
    setBusy(false);
    setDraft((value) => ({
      ...value,
      ...result,
      name:
        !value.name || value.name === value.locality
          ? result.shortName || result.name
          : value.name,
    }));
    setCoordinatesDraft({
      latitude: result.latitude,
      longitude: result.longitude,
      elevation: "",
    });
    closeSearchResults();
    setError("");
    setStatus("located");
    // A mouse/touch selection can otherwise leave focus on the (now removed)
    // result button in browsers that focus buttons on click; the field is
    // where typing and re-searching continue from either way.
    searchInputRef.current?.focus();
    resolvePosition(result, false);
  }
  // Keeps the floating results list anchored under (or, lacking room, above)
  // the address field instead of the static in-flow block it used to be
  // — the pattern `TargetKnowledgeDetails`'s popover relies on
  // (`floatingPopoverPosition`). Measured against the *visual* viewport, not
  // the layout one: a phone browser's on-screen keyboard shrinks only the
  // former, and that is the space actually left below the field.
  useLayoutEffect(() => {
    if (!results.length) {
      setResultsStyle(null);
      return undefined;
    }
    let frame = null;
    const reposition = () => {
      frame = window.requestAnimationFrame(() => {
        const anchor = searchAnchorRef.current?.getBoundingClientRect();
        const list = resultsListRef.current;
        if (!anchor || !list) return;
        const naturalHeight =
          list.scrollHeight + list.offsetHeight - list.clientHeight;
        const viewport = window.visualViewport;
        const position = floatingPopoverPosition({
          anchor,
          viewport: {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? window.innerWidth,
            height: viewport?.height ?? window.innerHeight,
          },
          popover: { width: anchor.width, height: naturalHeight },
        });
        setResultsStyle((current) => {
          const next = {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`,
          };
          return Object.entries(next).every(
            ([key, value]) => current?.[key] === value,
          )
            ? current
            : next;
        });
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    const observer = new ResizeObserver(reposition);
    if (searchAnchorRef.current) observer.observe(searchAnchorRef.current);
    if (resultsListRef.current) observer.observe(resultsListRef.current);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      observer.disconnect();
    };
  }, [results]);
  // A tap/click outside the field or the floating list closes it, the way a
  // native dropdown does.
  useEffect(() => {
    if (!results.length) return undefined;
    const dismissWhenOutside = (event) => {
      if (
        !searchAnchorRef.current?.contains(event.target) &&
        !resultsListRef.current?.contains(event.target)
      )
        closeSearchResults();
    };
    document.addEventListener("pointerdown", dismissWhenOutside);
    return () =>
      document.removeEventListener("pointerdown", dismissWhenOutside);
  }, [results.length]);
  // « Europe/Paris », « Europe/Paris · choisi par vous », « Non déterminé ».
  function zoneText() {
    if (!draft.timeZone) {
      return coordinates ? message(locale, "placeTimeZoneUnknown") : "";
    }
    return isChosenTimeZone(draft)
      ? message(locale, "placeTimeZoneChosenByYou").replace(
          "{zone}",
          timeZoneShownName(draft.timeZone),
        )
      : timeZoneShownName(draft.timeZone);
  }
  function zoneChosen(zone) {
    setDraft((current) => applyPlaceTimeZone(current, zone, true) ?? current);
    setError("");
  }
  function goTo(next) {
    if (next > 1 && (!coordinates || busy)) {
      setError("timezoneError");
      return;
    }
    setStep(next);
    setError("");
  }
  // « Utiliser » on a suggested place: its point replaces the point of the
  // place being written, its type and its link come with it, and its name only
  // fills an empty name — nothing is created.
  function useSuggestion(suggestion) {
    setIdealOpen(false);
    setDraft((current) => ({
      ...current,
      name: current.name?.trim() ? current.name : suggestion.name,
      locality: current.locality?.trim() ? current.locality : suggestion.name,
      kind: suggestion.type,
      knownPlace: {
        source: "osm",
        id: String(suggestion.id).replace(/^osm:/, ""),
        type: suggestion.type,
        linkedAt: new Date().toISOString(),
      },
    }));
    resolvePosition(
      {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        ...(Number.isFinite(suggestion.elevation)
          ? { elevation: String(suggestion.elevation) }
          : {}),
      },
      false,
    );
  }
  function save() {
    if (!draft.name.trim()) {
      setError("nameNeeded");
      return;
    }
    if (!coordinates || busy) {
      setError("timezoneError");
      return;
    }
    // A place with no zone is not saved.
    if (placeSaveBlock({ ...coordinates, timeZone: draft.timeZone })) {
      setError("timezoneBlocked");
      return;
    }
    const typed = skyEnteredFromInput(
      skyText,
      keptSky,
      new Date().toISOString(),
    );
    if (typed.error) {
      setSkyInvalid(true);
      return;
    }
    const { skyEntered } = typed;
    const previous = places.find((entry) => entry.id === destination);
    const note = String(draft.note ?? "").trim();
    const value = normalizePlace({
      ...draft,
      kind: draft.kind || "private",
      note: note || undefined,
      skyEntered,
      id: destination === "new" ? randomUuid() : destination,
      version: (previous?.version || 0) + 1,
      horizonStatus: "verified",
      horizonMask: { ...draft.horizonMask, enabled: true },
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      name: draft.name.trim(),
    });
    const moved = placeDistanceKm(previous, value);
    if (previous && moved > MODIFY_CONFIRMATION_KM) {
      setModifyConfirm({
        value,
        name: previous.name || previous.locality || "",
        km: Math.round(moved),
      });
      return;
    }
    onSave(value);
  }
  // « Créer un nouveau lieu » of the confirmation: the position becomes a new
  // place and the old one stays untouched.
  function saveAsNew() {
    const { value } = modifyConfirm;
    setDestination("new");
    setModifyConfirm(null);
    onSave({ ...value, id: randomUuid(), version: 1 });
  }
  function requestClose() {
    if (placeHasUnsavedChoices({ place, draft })) setLeaveAsk(true);
    else onClose();
  }
  // The place being written against the others: the same name once folded, or
  // under 100 m. Only at the last step.
  const duplicateOf =
    step === 3 && coordinates && draft.name?.trim()
      ? duplicatesOf({
          id: destination === "new" ? "draft" : destination,
          name: draft.name,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        })[0]
      : null;
  return (
    <WebDialog
      bodyRef={dialogRef}
      className="planner-place-dialog"
      closeLabel={flow(locale, "cancel")}
      closeOnBackdrop
      eyebrow={flow(locale, "where")}
      footerClassName="planner-place-footer"
      onClose={requestClose}
      title={flow(locale, place ? "editPlaceTitle" : "newPlaceTitle")}
      footer={
        <>
          <button
            className="btn-link"
            type="button"
            onClick={() => (step === 1 ? requestClose() : goTo(step - 1))}
          >
            {flow(locale, step === 1 ? "cancel" : "back")}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={
              busy ||
              (step === 1 && !coordinates) ||
              (step === 3 && zoneUnresolved)
            }
            onClick={() => (step === 3 ? save() : goTo(step + 1))}
          >
            {flow(
              locale,
              step === 1
                ? "nextHorizon"
                : step === 2
                  ? "nextName"
                  : "savePlace",
            )}
          </button>
        </>
      }
    >
      <nav
        className="planner-place-steps"
        aria-label={flow(locale, "newPlaceTitle")}
      >
        {["locationStep", "horizonStep", "saveStep"].map((label, i) => (
          <button
            type="button"
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            onClick={() => goTo(i + 1)}
          >
            <strong>{i + 1}</strong>
            <span>{flow(locale, label)}</span>
          </button>
        ))}
      </nav>
      {step === 1 && (
        <section>
          {IdealPlaces && (
            // A whole row that opens, outside the four levels of buttons (like
            // « Carte de la pollution lumineuse »): the tool is put forward at
            // the top of « Localisation ».
            <button
              type="button"
              className="planner-place-ideal"
              aria-haspopup="dialog"
              onClick={() => setIdealOpen(true)}
            >
              <span className="planner-place-ideal-mark" aria-hidden="true">
                ★
              </span>
              <span className="planner-place-ideal-text">
                <strong>{message(locale, "placeIdealEntry")}</strong>
                <small>{message(locale, "placeIdealEntryHelp")}</small>
              </span>
            </button>
          )}
          <div className="planner-place-locate">
            <h3>{flow(locale, "locationStep")}</h3>
            <button
              className="btn-secondary planner-place-locate-button"
              type="button"
              onClick={locate}
              disabled={status === "locating"}
              aria-busy={status === "locating"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
              {flow(locale, status === "locating" ? "locating" : "locate")}
            </button>
          </div>
          {/* The button already says « Recherche de votre position… »: the
              line under it does not say it again. */}
          {status && status !== "locating" && (
            <p
              className={`planner-place-status${status.startsWith("gps") ? " is-error" : ""}`}
              role={status.startsWith("gps") ? "alert" : "status"}
            >
              {flow(locale, status)}
            </p>
          )}
          <label className="planner-place-search">
            <span>{flow(locale, "address")}</span>
            <div>
              <div className="planner-place-search-field" ref={searchAnchorRef}>
                <input
                  ref={searchInputRef}
                  type="search"
                  role="combobox"
                  aria-expanded={!!results.length}
                  aria-haspopup="listbox"
                  aria-controls="planner-place-results-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeResultIndex >= 0
                      ? `planner-place-result-${activeResultIndex}`
                      : undefined
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveResultIndex(-1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && results.length) {
                      e.preventDefault();
                      setActiveResultIndex((current) =>
                        Math.min(current + 1, results.length - 1),
                      );
                    } else if (e.key === "ArrowUp" && results.length) {
                      e.preventDefault();
                      setActiveResultIndex((current) =>
                        Math.max(current - 1, -1),
                      );
                    } else if (e.key === "Escape" && results.length) {
                      // Only the results list: a browser that ignores this
                      // `preventDefault` still falls back to the dialog's own
                      // Escape-to-close, which is an acceptable second best.
                      e.preventDefault();
                      e.stopPropagation();
                      closeSearchResults();
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (activeResultIndex >= 0 && results[activeResultIndex])
                        chooseResult(results[activeResultIndex]);
                      else search();
                    }
                  }}
                />
              </div>
              <button
                className="btn-primary"
                type="button"
                onClick={search}
                disabled={searching || query.trim().length < 2}
              >
                {flow(locale, searching ? "searching" : "search")}
              </button>
            </div>
          </label>
          {!!results.length && (
            <div
              className="planner-place-results"
              id="planner-place-results-listbox"
              role="listbox"
              aria-label={flow(locale, "address")}
              ref={resultsListRef}
              style={resultsStyle || undefined}
            >
              {results.map((result, i) => (
                <button
                  type="button"
                  key={i}
                  id={`planner-place-result-${i}`}
                  role="option"
                  aria-selected={i === activeResultIndex}
                  tabIndex={-1}
                  className={
                    i === activeResultIndex
                      ? "planner-place-result-active"
                      : undefined
                  }
                  onPointerEnter={() => setActiveResultIndex(i)}
                  onClick={() => chooseResult(result)}
                >
                  {placeResultLines(result).title}
                  {placeResultLines(result).detail ? (
                    <small>{placeResultLines(result).detail}</small>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          <PlaceMap
            locale={locale}
            location={draft}
            onSelect={resolvePosition}
          />
          <p className="planner-place-help">{flow(locale, "mapHelp")}</p>
          <div className="planner-place-coordinate-readout">
            {coordinates && (
              <span>
                {decimalText(coordinates.latitude, 5, locale)}° ·{" "}
                {decimalText(coordinates.longitude, 5, locale)}°
              </span>
            )}
            <span
              aria-live="polite"
              className={zoneUnresolved ? "is-unresolved" : undefined}
            >
              {busy ? flow(locale, "timezoneBusy") : zoneText()}
            </span>
          </div>
          <details className="planner-place-coordinates">
            <summary>
              {flow(locale, "coords")}
              {/* The providers of the search and of the elevation, moved
                  behind this ⓘ: nothing deleted. */}
              <InfoButton
                locale={locale}
                label={flow(locale, "coordsInfo")}
                body={flow(locale, "positionPrivacy")}
                className="planner-place-coordinates-info"
                testId="planner-place-coordinates-info"
              />
            </summary>
            <div className="planner-place-coordinate-inputs">
              {["latitude", "longitude", "elevation"].map((key) => (
                <label key={key}>
                  <span>{flow(locale, key)}</span>
                  <input
                    type="number"
                    step={key === "elevation" ? "1" : "0.00001"}
                    value={coordinatesDraft[key]}
                    onChange={(e) =>
                      setCoordinatesDraft((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => resolvePosition(coordinatesDraft)}
            >
              {flow(locale, "applyCoords")}
            </button>
          </details>
        </section>
      )}
      {step === 2 && (
        <section>
          <h3>{flow(locale, "horizonStep")}</h3>
          {/* What the horizon is for, under the title.
              The banner and the help said the same thing twice; one line,
              then ⓘ: the help (how to draw, word for word) is behind the
              banner's ⓘ. */}
          <p className="planner-place-why" role="note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5.5M12 7.6v.1" />
            </svg>
            {/* Where to record it from follows what it is for, in the same
                note. */}
            <span>
              {flow(locale, "horizonWhy")} {flow(locale, "horizonCloseToMount")}
            </span>
            <InfoButton
              locale={locale}
              title={flow(locale, "horizonStep")}
              body={flow(locale, "horizonHelp")}
              className="planner-place-horizon-help-info"
              testId="planner-place-horizon-help-info"
            />
          </p>
          {!!unassignedProfiles.length && (
            <details className="planner-place-old-masks">
              <summary>{flow(locale, "oldMasks")}</summary>
              <p>{flow(locale, "oldMasksHelp")}</p>
              <select
                aria-label={flow(locale, "oldMasks")}
                defaultValue=""
                onChange={(event) => {
                  const profile = unassignedProfiles.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (profile) {
                    setDraft((current) => ({
                      ...current,
                      horizonMask: {
                        ...normaliseHorizonMask(profile.mask),
                        enabled: true,
                      },
                      sourceProfileId: profile.id,
                    }));
                  }
                }}
              >
                <option value="">—</option>
                {unassignedProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </details>
          )}
          <PlannerHorizonEditor
            locale={locale}
            mask={draft.horizonMask}
            showSurveyedSectors
            timeZone={draft.timeZone || null}
            onChange={(mask) => {
              setDraft((current) => ({ ...current, horizonMask: mask }));
              setError("");
            }}
          />
          <div className="planner-place-horizon-actions">
            <PlannerHorizonSectorsLegend locale={locale} />
            <button
              className="btn-tertiary is-destructive planner-place-horizon-reset"
              type="button"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  horizonMask: emptyHorizon(),
                }));
                setError("");
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 8V4m0 0h4M5 4l3.2 3.2A7.5 7.5 0 1 1 4.7 13" />
              </svg>
              {flow(locale, "horizonReset")}
            </button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section>
          <div className="planner-place-save-fields">
            {/* « Modifier un lieu | Créer un
                lieu », preselected by context (an opened place → Modifier, a
                new one → Créer). The group is the section's only control of
                its level; the list only shows under « Modifier »; switching
                keeps the typed name. */}
            {/* With no place saved there is nothing to modify: no choice. */}
            {places.length > 0 && (
              <div
                className="planner-horizon-projection-switch planner-place-mode-switch"
                role="group"
                aria-label={flow(locale, "placeModeLabel")}
              >
                <button
                  type="button"
                  data-testid="planner-place-mode-modify"
                  className={destination !== "new" ? "is-active" : ""}
                  aria-pressed={destination !== "new"}
                  onClick={() =>
                    setDestination(
                      places.some((entry) => entry.id === place?.id)
                        ? place.id
                        : places[0].id,
                    )
                  }
                >
                  {flow(locale, "placeModeModify")}
                </button>
                <button
                  type="button"
                  data-testid="planner-place-mode-create"
                  className={destination === "new" ? "is-active" : ""}
                  aria-pressed={destination === "new"}
                  onClick={() => setDestination("new")}
                >
                  {flow(locale, "placeModeCreate")}
                </button>
              </div>
            )}
            {destination !== "new" && (
              <label>
                <span>{flow(locale, "destination")}</span>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {places.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {destination !== "new" && destinationDistance > 10 && (
              <p className="planner-place-warning" role="alert">
                {flow(locale, "distantPlace").replace(
                  "{distance}",
                  new Intl.NumberFormat(locale).format(
                    Math.floor(destinationDistance),
                  ),
                )}
              </p>
            )}
            <label>
              <span>{flow(locale, "name")}</span>
              <input
                value={draft.name}
                maxLength={100}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, name: e.target.value }))
                }
              />
            </label>
            <label>
              <span>{message(locale, "placeTypeLabel")}</span>
              <select
                value={draft.kind || "private"}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    kind: e.target.value,
                  }))
                }
              >
                {Object.keys(kindMessageKey).map((kind) => (
                  <option key={kind} value={kind}>
                    {message(locale, kindMessageKey[kind])}
                  </option>
                ))}
              </select>
            </label>
            <label className="planner-place-sky-entered">
              <span>{message(locale, "placeSkyEnteredLabel")}</span>
              <span className="planner-place-sky-entered-field">
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={skyText}
                  aria-invalid={skyInvalid || undefined}
                  aria-describedby="planner-place-sky-entered-note"
                  onChange={(e) => {
                    setSkyText(e.target.value);
                    setSkyInvalid(false);
                  }}
                />
                <span aria-hidden="true">mag/arcsec²</span>
              </span>
            </label>
            <p
              id="planner-place-sky-entered-note"
              className={
                skyInvalid ? "planner-place-warning" : "planner-place-help"
              }
              role={skyInvalid ? "alert" : undefined}
            >
              {message(
                locale,
                skyInvalid ? "placeSkyEnteredError" : "placeSkyEnteredHelp",
              )}
            </p>
            <label className="planner-place-note">
              <span>{message(locale, "placeNoteLabel")}</span>
              <textarea
                rows={3}
                maxLength={500}
                value={draft.note || ""}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, note: e.target.value }))
                }
              />
            </label>
            {duplicateOf && (
              // Flagged, never blocked: « Enregistrer ce lieu » stays the
              // primary; the existing place can be opened instead.
              <p className="planner-place-duplicate" role="status">
                <span>
                  {message(locale, "placeDuplicateSave")
                    .replace("{place}", duplicateOf.other.name)
                    .replace(
                      "{distance}",
                      duplicateDistance(locale, duplicateOf.distanceMetres),
                    )}
                </span>
                {onOpenPlace && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => onOpenPlace(duplicateOf.other)}
                  >
                    {message(locale, "placeDuplicateOpen")}
                  </button>
                )}
              </p>
            )}
          </div>
          <dl className="planner-place-review">
            <div>
              <dt>{flow(locale, "locationStep")}</dt>
              <dd>{draft.locality}</dd>
            </div>
            <div>
              <dt>{flow(locale, "coords")}</dt>
              <dd>
                {decimalText(coordinates?.latitude, 5, locale)}° ·{" "}
                {decimalText(coordinates?.longitude, 5, locale)}°
                {knownElevation(draft.elevation) !== null &&
                  ` · ${draft.elevation} m`}
              </dd>
            </div>
            <div>
              <dt>
                {isChosenTimeZone(draft) || zoneUnresolved
                  ? message(locale, "placeTimeZoneRow")
                  : flow(locale, "timezone")}
              </dt>
              <dd className={zoneUnresolved ? "is-unresolved" : undefined}>
                {zoneText()}
              </dd>
            </div>
            <div>
              <dt>{flow(locale, "horizonStep")}</dt>
              <dd>
                {flow(
                  locale,
                  draft.horizonMask.points.some((point) => point.altitude > 0)
                    ? "horizonSaved"
                    : "horizonClear",
                )}
              </dd>
            </div>
          </dl>
          {/* Earlier sessions only exist for a place that exists. */}
          {(place?.id || destination !== "new") && (
            <p
              className="planner-place-help"
              data-testid="planner-place-historical-note"
            >
              {flow(locale, "historicalPlace")}
            </p>
          )}
        </section>
      )}
      {zoneUnresolved && (
        <PlaceTimeZoneNotice
          locale={locale}
          editor
          place={{ ...draft, ...coordinates }}
          placeName={draft.name?.trim() || draft.locality || ""}
          at={new Date()}
          onChosen={zoneChosen}
          onRetry={() => resolvePosition(draft, false)}
        />
      )}
      {zoneUnresolved && step === 3 && (
        <p
          className="planner-place-reason"
          role="note"
          data-testid="planner-place-save-blocked"
        >
          {message(locale, "placeTimeZoneSaveBlocked")}
        </p>
      )}
      {error && !(error === "timezoneError" && coordinates) && (
        <p className="planner-place-error" role="alert">
          {error === "timezoneBlocked"
            ? message(locale, "placeTimeZoneSaveBlocked")
            : flow(locale, error)}
        </p>
      )}
      {leaveAsk && (
        <WebDialog
          className="planner-confirmation-dialog planner-place-leave-dialog"
          closeLabel={flow(locale, "leaveKeep")}
          onClose={() => setLeaveAsk(false)}
          role="alertdialog"
          title={flow(locale, "leaveTitle")}
          titleAs="h3"
          footer={
            <>
              <button
                className="btn-link"
                data-testid="planner-place-leave-keep"
                type="button"
                onClick={() => setLeaveAsk(false)}
              >
                {flow(locale, "leaveKeep")}
              </button>
              <button
                className="btn-primary is-destructive"
                data-testid="planner-place-leave-confirm"
                type="button"
                onClick={onClose}
              >
                {flow(locale, "leaveConfirm")}
              </button>
            </>
          }
        >
          <p>{flow(locale, place ? "leaveEditBody" : "leaveNewBody")}</p>
        </WebDialog>
      )}
      {modifyConfirm && (
        <WebDialog
          className="planner-confirmation-dialog planner-place-modify-dialog"
          closeLabel={flow(locale, "cancel")}
          onClose={() => setModifyConfirm(null)}
          role="alertdialog"
          title={flow(locale, "modifyTitle").replace(
            "{name}",
            modifyConfirm.name,
          )}
          titleAs="h3"
          footer={
            <>
              <button
                className="btn-link"
                data-testid="planner-place-modify-cancel"
                type="button"
                onClick={() => setModifyConfirm(null)}
              >
                {flow(locale, "cancel")}
              </button>
              <button
                className="btn-tertiary"
                data-testid="planner-place-modify-create"
                type="button"
                onClick={saveAsNew}
              >
                {flow(locale, "newEntry")}
              </button>
              <button
                className="btn-primary"
                data-testid="planner-place-modify-apply"
                type="button"
                onClick={() => onSave(modifyConfirm.value)}
              >
                {flow(locale, "modifyConfirm")}
              </button>
            </>
          }
        >
          <p>
            {flow(locale, "modifyBody").replace("{distance}", modifyConfirm.km)}
          </p>
        </WebDialog>
      )}
      {idealOpen && IdealPlaces && (
        <IdealPlaces
          locale={locale}
          {...idealPlacesProps}
          places={places}
          onUse={useSuggestion}
          onClose={() => setIdealOpen(false)}
        />
      )}
    </WebDialog>
  );
}
