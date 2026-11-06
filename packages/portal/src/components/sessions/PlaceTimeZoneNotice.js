"use client";

import { useMemo, useState } from "react";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import {
  isSamePlace,
  isKnownTimeZone,
  offlineTimeZoneForCoordinates,
} from "portal/planner/place-time-zone.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { say } from "./night-detail-view.js";
import { requestJson } from "./portal-fetch.js";

// « Le fuseau horaire de ce lieu n'a pas pu être
// déterminé : les heures sont en UTC. » and the dialog behind « Choisir le
// fuseau ». The same component, the same words: on the page of a session and on the
// debriefing (hours in UTC, said as such), in the editor of a place (no
// hours, no « UTC »). The zone chosen is written into the place of the
// space; a plan that was executed is frozen and keeps its copy, so a session
// reads the place's zone (`sessionPlaceWithZone`).

/** The zones this browser reads, sorted, region names and « UTC ». */
export function selectableTimeZones() {
  let names = [];
  try {
    names = Intl.supportedValuesOf("timeZone");
  } catch {
    names = [];
  }
  const regions = names
    .filter((name) =>
      /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\//.test(
        name,
      ),
    )
    .sort();
  return [...regions, "UTC"];
}

/** « UTC+2 », « UTC−3 », « UTC+5:30 »: the offset of `zone` at `at`. */
export function timeZoneOffsetLabel(zone, at) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT(?:([+−-])(\d{1,2})(?::(\d{2}))?)?/.exec(raw);
    if (!match) return "";
    if (!match[1]) return "UTC+0";
    const sign = match[1] === "+" ? "+" : "−";
    const minutes = match[3] && match[3] !== "00" ? `:${match[3]}` : "";
    return `UTC${sign}${Number(match[2])}${minutes}`;
  } catch {
    return "";
  }
}

const fold = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("/", " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export function timeZoneMatches(zone, query) {
  const needle = fold(query);
  return needle === "" || fold(zone).includes(needle);
}

/** The browser's own zone, offered first. */
export function deviceTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isKnownTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Writes `zone`, chosen by the person, into the place of the space that is
 * `place` (the same id, position or name). Answers `true` when a place was
 * written, `false` when the space keeps none that is this one.
 */
export async function saveChosenPlaceTimeZone(place, zone) {
  const list = await requestJson("/api/v1/places");
  if (!list.ok) return false;
  const places = (await list.json())?.places ?? [];
  const match = places.find((entry) => isSamePlace(entry, place));
  if (!match) return false;
  const answer = await requestJson(
    `/api/v1/places/${encodeURIComponent(match.id)}`,
    {
      method: "PUT",
      body: {
        ...match,
        timeZone: zone,
        timeZoneSource: "chosen",
        editedAt: new Date().toISOString(),
      },
    },
  );
  return answer.ok;
}

/**
 * The places of the space that are `place` and have no zone are written
 * again without one: the service reads the zone from the position (the exact
 * boundaries) and keeps it. Silent; the page already reads the table's.
 */
export async function repairPlaceTimeZone(place) {
  const list = await requestJson("/api/v1/places");
  if (!list.ok) return null;
  const places = (await list.json())?.places ?? [];
  const match = places.find((entry) => isSamePlace(entry, place));
  if (!match || isKnownTimeZone(match.timeZone)) return match ?? null;
  const answer = await requestJson(
    `/api/v1/places/${encodeURIComponent(match.id)}`,
    {
      method: "PUT",
      body: { ...match, editedAt: new Date().toISOString() },
    },
  );
  return answer.ok ? ((await answer.json())?.place ?? null) : null;
}

/**
 * The encadré and its dialog. `place` is the place the hours belong to,
 * `at` the date whose offsets the dialog gives, `onChosen(zone, saved)` is
 * told the zone picked (and whether the space's place was written).
 */
export function PlaceTimeZoneNotice({
  locale,
  place,
  placeName,
  at,
  editor = false,
  onChosen,
  onRetry = null,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p
        className="session-time-zone-notice"
        role="note"
        data-testid="session-time-zone-unresolved"
      >
        <span>
          {message(
            locale,
            editor
              ? "placeTimeZoneUnresolvedEditor"
              : "placeTimeZoneUnresolved",
          )}
        </span>{" "}
        <button
          type="button"
          className="btn-link"
          data-testid="place-time-zone-pick"
          onClick={() => setOpen(true)}
        >
          {message(locale, "placeTimeZonePick")}
        </button>
        {onRetry ? (
          <button
            type="button"
            className="btn-link"
            data-testid="place-time-zone-retry"
            onClick={onRetry}
          >
            {flow(locale, "retry")}
          </button>
        ) : null}
      </p>
      {open ? (
        <PlaceTimeZoneDialog
          locale={locale}
          place={place}
          placeName={placeName}
          at={at}
          onClose={() => setOpen(false)}
          onChosen={(zone, saved) => {
            setOpen(false);
            onChosen?.(zone, saved);
          }}
        />
      ) : null}
    </>
  );
}

export function PlaceTimeZoneDialog({
  locale,
  place,
  placeName,
  at,
  persist = true,
  onClose,
  onChosen,
}) {
  const device = useMemo(deviceTimeZone, []);
  const zones = useMemo(selectableTimeZones, []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(device);
  const [busy, setBusy] = useState(false);
  const moment =
    at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();
  const shown = zones.filter(
    (zone) => zone !== device && timeZoneMatches(zone, query),
  );
  const noMatch =
    shown.length === 0 && (!device || !timeZoneMatches(device, query));
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    let saved = false;
    if (persist) {
      try {
        saved = await saveChosenPlaceTimeZone(place, selected);
      } catch {
        saved = false;
      }
    }
    setBusy(false);
    onChosen(selected, saved);
  }
  return (
    <WebDialog
      className="place-time-zone-dialog"
      bodyClassName="place-time-zone-body"
      closeLabel={message(locale, "nightPageCancel")}
      title={message(locale, "placeTimeZoneSheetTitle")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-link" onClick={onClose}>
            {message(locale, "nightPageCancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="place-time-zone-use"
            disabled={!selected || busy}
            onClick={confirm}
          >
            {selected
              ? say(locale, "placeTimeZoneUse", { zone: selected })
              : message(locale, "placeTimeZoneUseNone")}
          </button>
        </>
      }
    >
      <p className="place-time-zone-lead">
        {say(locale, "placeTimeZoneSheetBody", { place: placeName ?? "" })}
      </p>
      {device && timeZoneMatches(device, query) ? (
        <label
          className={`place-time-zone-device${selected === device ? " is-selected" : ""}`}
          data-testid="place-time-zone-device"
        >
          <input
            type="radio"
            name="place-time-zone"
            checked={selected === device}
            onChange={() => setSelected(device)}
          />
          <span>
            <small>{message(locale, "placeTimeZonePhone")}</small>
            <strong>{device}</strong>
            <small>{message(locale, "placeTimeZonePhoneHint")}</small>
          </span>
          <span className="place-time-zone-offset">
            {timeZoneOffsetLabel(device, moment)}
          </span>
        </label>
      ) : null}
      <label className="place-time-zone-search">
        <span>{message(locale, "placeTimeZoneOthers")}</span>
        <input
          type="search"
          data-testid="place-time-zone-search"
          placeholder={message(locale, "placeTimeZoneSearch")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {noMatch ? (
        <p
          className="place-time-zone-none"
          data-testid="place-time-zone-no-match"
        >
          {message(locale, "placeTimeZoneNoMatch")}
        </p>
      ) : (
        <ul className="place-time-zone-list" role="radiogroup">
          {shown.map((zone) => (
            <li key={zone}>
              <label>
                <input
                  type="radio"
                  name="place-time-zone"
                  checked={selected === zone}
                  onChange={() => setSelected(zone)}
                />
                <span>{zone}</span>
                <span className="place-time-zone-offset">
                  {timeZoneOffsetLabel(zone, moment)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {!selected ? (
        <p className="place-time-zone-reason" role="note">
          {message(locale, "placeTimeZoneUseNoneHint")}
        </p>
      ) : null}
    </WebDialog>
  );
}

/** The zone the table gives, for the callers that only need it. */
export const tableTimeZone = offlineTimeZoneForCoordinates;
