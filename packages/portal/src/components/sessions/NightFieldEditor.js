"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { clockText } from "../../written-forms.js";
import {
  debriefTimeZone,
  fromDateTimeLocalInputValue,
  toDateTimeLocalInputValue,
} from "./debrief-decision.js";
import {
  equipmentLine,
  nightDateRow,
  say,
  utcClock,
} from "./night-detail-view.js";
import { requestJson, responseData } from "./portal-fetch.js";

// The map of « Choisir sur la carte… » is the planner's (`PlaceMap`), loaded
// only when asked: Leaflet and its style sheet never weigh on the page.
const PlaceMap = lazy(() =>
  import("../planner/PlannerPlaceDialog.js").then((module) => ({
    default: module.PlaceMap,
  })),
);

/**
 * « La nuit » and « Notes » of the page of a night: five rows — Nom, Date, Lieu, Matériel,
 * Cibles — each with its pencil on the right that names its object
 * (« Modifier le lieu »). A click on the value or on the
 * pencil opens the field in place, one at a time, with its own primary
 * « Enregistrer le lieu » and « Annuler » as a link on one line on the right;
 * Échap cancels. Each save is `PATCH
 * /api/v1/sessions/{id}/night` with that field alone: what the person
 * changes is the night's, never the plan's. The place is chosen among the
 * space's saved places (no geocoding) or on the map; the date is two hours
 * in the place's time zone (UTC when it has none) within the night's two days; the equipment, the space's; the
 * targets, the catalogue's and the space's own. A shell may add a sixth row
 * after them (`planRow`, « Plan multi-nuits ») and a status line above them
 * (`planStatus`): the page does not know the multi-night plans.
 */

const Icon = ({ children, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);
export const BinIcon = () => (
  <Icon>
    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
const ROW_ICONS = {
  title: (
    <Icon>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M10 12h5M10 16h5" />
    </Icon>
  ),
  date: (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Icon>
  ),
  place: (
    <Icon>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </Icon>
  ),
  equipment: (
    <Icon>
      <path d="M3 14l12-6 2 4-12 6z" />
      <path d="M9 17l-2 4M11 16l3 5" />
    </Icon>
  ),
  targets: (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
};
const TargetGlyph = () => (
  <Icon size={13}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

const FIELD_KEYS = {
  title: {
    label: "nightPageFieldName",
    edit: "nightPageEditName",
    save: "nightPageSaveName",
  },
  date: {
    label: "nightPageFieldDate",
    edit: "nightPageEditDate",
    save: "nightPageSaveDate",
  },
  place: {
    label: "nightPageFieldPlace",
    edit: "nightPageEditPlace",
    save: "nightPageSavePlace",
  },
  equipment: {
    label: "nightPageFieldEquipment",
    edit: "nightPageEditEquipment",
    save: "nightPageSaveEquipment",
  },
  targets: {
    label: "nightPageFieldTargets",
    edit: "nightPageEditTargets",
    save: "nightPageSaveTargets",
  },
};

/**
 * « 21:08 » → the instant of the night that holds it (two days at most), the
 * clock read in `timeZone` (the place's; UTC by default).
 */
export function nightInstant(
  startIso,
  clock,
  { after = null, timeZone = "UTC" } = {},
) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(clock || ""));
  const start = Date.parse(startIso ?? "");
  if (!match || !Number.isFinite(start)) return null;
  const zone = debriefTimeZone(timeZone);
  let at;
  if (zone === "UTC") {
    const day = new Date(start);
    at = Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
    );
  } else {
    // The day of the start on the place's wall clock, then the typed hour.
    const wallDay = toDateTimeLocalInputValue(startIso, zone).slice(0, 10);
    at = Date.parse(
      fromDateTimeLocalInputValue(`${wallDay}T${match[0]}`, zone) ?? "",
    );
    if (!Number.isFinite(at)) return null;
  }
  const floor = after === null ? null : Date.parse(after);
  // The end passes to the next day when it would come before the start.
  return new Date(
    floor !== null && at <= floor ? at + 86400000 : at,
  ).toISOString();
}

/** The body of `PATCH …/night` for an open field and its draft. */
export function nightPatchFor(field, draft, night, timeZone = "UTC") {
  if (field === "title") return { title: draft.title.trim() || null };
  if (field === "date") {
    const startedAt = nightInstant(night.startedAt.value, draft.start, {
      timeZone,
    });
    const body = { startedAt };
    if (night.finishedAt.value)
      body.finishedAt = nightInstant(night.startedAt.value, draft.end, {
        after: startedAt,
        timeZone,
      });
    return body;
  }
  if (field === "place")
    return {
      place: {
        name: draft.placeName.trim(),
        ...(draft.latitude !== null && draft.longitude !== null
          ? { latitude: draft.latitude, longitude: draft.longitude }
          : {}),
      },
    };
  if (field === "equipment")
    return {
      equipment: {
        telescopeId: draft.telescopeId || null,
        cameraId: draft.cameraId || null,
        mountId: draft.mountId || null,
        filterIds: draft.filterIds,
      },
    };
  if (field === "targets") return { targetIds: draft.targetIds };
  if (field === "notes") return { notes: draft.notes };
  return {};
}

function draftFor(field, night, timeZone = "UTC") {
  const place = night.place?.value ?? null;
  const equipment = night.equipment?.value ?? {};
  return {
    title: night.title?.value ?? "",
    start: clockText(night.startedAt?.value, debriefTimeZone(timeZone)),
    end: night.finishedAt?.value
      ? clockText(night.finishedAt.value, debriefTimeZone(timeZone))
      : "",
    placeName: place?.name ?? "",
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    telescopeId: equipment?.telescopeId ?? "",
    cameraId: equipment?.cameraId ?? "",
    mountId: equipment?.mountId ?? "",
    filterIds: [...(equipment?.filterIds ?? [])],
    targetIds: [...(night.targetIds?.value ?? [])],
    notes: night.notes?.value ?? "",
    field,
  };
}

/** Whether the open field can be saved. */
function savable(field, draft) {
  if (field === "place") return draft.placeName.trim().length > 0;
  if (field === "date") return /^\d{2}:\d{2}$/.test(draft.start);
  return true;
}

function errorText(error, locale) {
  if (error?.code === "night_not_finished")
    return message(locale, "nightPageErrorNotFinished");
  return message(locale, "nightPageSaveFailed");
}

/**
 * One open field's own zone: its control, then the line on the right —
 * « Annuler » a link and the field's primary (rules 1, 6, 9).
 */
function FieldActions({ locale, field, busy, canSave, onCancel, onSave }) {
  return (
    <div className="night-field-actions">
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        onClick={onCancel}
      >
        {message(locale, "nightPageCancel")}
      </button>
      <button
        type="button"
        className="btn-primary"
        disabled={busy || !canSave}
        aria-busy={busy || undefined}
        onClick={onSave}
      >
        {message(locale, FIELD_KEYS[field]?.save ?? "nightPageSaveNotes")}
      </button>
    </div>
  );
}

function PlaceEditor({ locale, draft, setDraft, places }) {
  const [mapOpen, setMapOpen] = useState(false);
  const query = draft.placeName.trim().toLocaleLowerCase(locale);
  const matches = places
    .filter(
      (place) => !query || place.name.toLocaleLowerCase(locale).includes(query),
    )
    .slice(0, 6);
  return (
    <div className="night-field-place">
      <input
        type="text"
        className="night-field-input"
        value={draft.placeName}
        maxLength={120}
        data-autofocus=""
        aria-label={message(locale, "nightPagePlaceSearch")}
        placeholder={message(locale, "nightPagePlaceSearch")}
        onChange={(event) =>
          setDraft({
            placeName: event.target.value,
            latitude: null,
            longitude: null,
          })
        }
      />
      <ul className="night-field-options" role="listbox">
        {matches.map((place) => (
          <li key={place.name}>
            <button
              type="button"
              role="option"
              aria-selected={draft.placeName === place.name}
              className="night-field-option"
              onClick={() =>
                setDraft({
                  placeName: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
            >
              <span>{place.name}</span>
              <span className="night-field-option-note">
                {[
                  message(locale, "nightPagePlaceSaved"),
                  place.bortle
                    ? say(locale, "nightPagePlaceBortle", {
                        value: place.bortle,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="night-field-option is-map"
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((open) => !open)}
          >
            {message(locale, "nightPageChooseOnMap")}
          </button>
        </li>
      </ul>
      {mapOpen ? (
        <Suspense fallback={null}>
          <div className="night-field-map">
            <PlaceMap
              locale={locale}
              location={{
                latitude: draft.latitude,
                longitude: draft.longitude,
              }}
              onSelect={({ latitude, longitude }) =>
                setDraft({ latitude, longitude })
              }
            />
            <p className="night-field-hint">
              {message(locale, "nightPagePlaceMapHint")}
            </p>
          </div>
        </Suspense>
      ) : null}
      <p className="night-field-hint">
        {message(locale, "nightPagePlaceHint")}
      </p>
    </div>
  );
}

function EquipmentEditor({ locale, draft, setDraft, options }) {
  const ofType = (...types) =>
    options.filter((item) => types.includes(item.type));
  const select = (key, label, items) => (
    <label className="night-field-select">
      <span>{message(locale, label)}</span>
      <select
        value={draft[key] || ""}
        onChange={(event) => setDraft({ [key]: event.target.value })}
      >
        <option value="">{message(locale, "nightPageEquipmentNone")}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  const filters = ofType("filter");
  return (
    <div className="night-field-equipment">
      {select(
        "telescopeId",
        "nightPageEquipmentTelescope",
        ofType("telescope", "lens"),
      )}
      {select("cameraId", "nightPageEquipmentCamera", ofType("camera"))}
      {select("mountId", "nightPageEquipmentMount", ofType("mount"))}
      {filters.length ? (
        <fieldset className="night-field-filters">
          <legend>{message(locale, "nightPageEquipmentFilters")}</legend>
          {filters.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={draft.filterIds.includes(item.id)}
                onChange={(event) =>
                  setDraft({
                    filterIds: event.target.checked
                      ? [...draft.filterIds, item.id]
                      : draft.filterIds.filter((id) => id !== item.id),
                  })
                }
              />
              {item.name}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

/**
 * « Cibles »: the targets of the night as chips with their cross, and under
 * them the search that adds one. The search (the catalogue's, the space's own
 * targets, the labels with their preview, the states) is the planner's
 * `NightTargetsPicker`, handed in by the page's shell (`TargetsPicker`); this
 * package does not import the planner. Without it the chips are all there is
 * to edit.
 */
function TargetsEditor({
  locale,
  sessionId,
  draft,
  setDraft,
  names,
  onName,
  TargetsPicker = null,
}) {
  return (
    <div className="night-field-targets">
      <ul className="night-target-chips">
        {draft.targetIds.map((id) => (
          <li key={id} className="night-target-chip">
            <TargetGlyph />
            <span>{names[id] ?? id}</span>
            <button
              type="button"
              className="night-target-chip-remove"
              aria-label={say(locale, "nightPageTargetRemove", {
                target: names[id] ?? id,
              })}
              onClick={() =>
                setDraft({
                  targetIds: draft.targetIds.filter((entry) => entry !== id),
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {TargetsPicker ? (
        <TargetsPicker
          locale={locale}
          sessionId={sessionId}
          excludeIds={draft.targetIds}
          onPick={(target) => {
            onName(target.id, target.designation);
            setDraft({ targetIds: [...draft.targetIds, target.id] });
          }}
        />
      ) : null}
    </div>
  );
}

function DateEditor({ locale, draft, setDraft, finished, utc }) {
  return (
    <div className="night-field-date">
      <label className="night-field-select">
        <span>{message(locale, "nightPageDateStart")}</span>
        <input
          type="time"
          value={draft.start}
          data-autofocus=""
          onChange={(event) => setDraft({ start: event.target.value })}
        />
      </label>
      {finished ? (
        <label className="night-field-select">
          <span>{message(locale, "nightPageDateEnd")}</span>
          <input
            type="time"
            value={draft.end}
            onChange={(event) => setDraft({ end: event.target.value })}
          />
        </label>
      ) : null}
      {utc ? (
        <span className="night-field-zone">
          {message(locale, "nightPageUtc")}
        </span>
      ) : null}
      <p className="night-field-hint">
        {message(locale, utc ? "nightPageDateHint" : "nightPageDateHintPlace")}
      </p>
    </div>
  );
}

/** The value of a row as the card reads it. */
function RowValue({
  field,
  night,
  locale,
  names,
  planEquipmentLine,
  timeZone,
}) {
  if (field === "title")
    return (
      <span>{night.title?.value || message(locale, "nightPageNoValue")}</span>
    );
  if (field === "date") {
    const row = nightDateRow(night, locale, timeZone);
    return (
      <span>
        {row.main}
        {row.endDay ? (
          <span className="night-row-muted"> ({row.endDay})</span>
        ) : null}
        {row.zone ? ` · ${row.zone}` : null}
      </span>
    );
  }
  if (field === "place")
    return (
      <span>
        {night.place?.value?.name || message(locale, "nightPageNoValue")}
      </span>
    );
  if (field === "equipment") {
    const line =
      night.equipment?.source === "plan" && planEquipmentLine
        ? planEquipmentLine
        : equipmentLine(night.equipment?.value, names.equipment, locale);
    return <span>{line || message(locale, "nightPageNoValue")}</span>;
  }
  if (field === "targets") {
    const ids = night.targetIds?.value ?? [];
    if (!ids.length) return <span>{message(locale, "nightPageNoValue")}</span>;
    return (
      <ul className="night-target-chips">
        {ids.map((id) => (
          <li key={id} className="night-target-chip">
            <TargetGlyph />
            <span>{names.targets[id] ?? id}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export function NightFieldCard({
  locale = "en",
  sessionId,
  night,
  planName = null,
  names = { equipment: {}, targets: {} },
  places = [],
  timeZone = null,
  equipmentOptions = [],
  planEquipmentLine = "",
  onSaved = () => {},
  saveNight = null,
  TargetsPicker = null,
  notice = null,
  planRow = null,
  planStatus = null,
}) {
  // The hours of the row and of its editor are the place's.
  const zone = debriefTimeZone(timeZone);
  const [open, setOpen] = useState(null);
  const [draft, setDraftState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extraNames, setExtraNames] = useState({});
  const targetNames = { ...names.targets, ...extraNames };
  const setDraft = (changes) =>
    setDraftState((current) => ({ ...current, ...changes }));
  const cancel = () => {
    setOpen(null);
    setDraftState(null);
    setError("");
  };
  const start = (field) => {
    if (busy) return;
    setOpen(field);
    setDraftState(draftFor(field, night, zone));
    setError("");
  };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = nightPatchFor(open, draft, night, zone);
      const result = saveNight
        ? await saveNight(body)
        : await responseData(
            await requestJson(
              `/api/v1/sessions/${encodeURIComponent(sessionId)}/night`,
              { method: "PATCH", body },
            ),
            message(locale, "nightPageSaveFailed"),
          );
      onSaved(result.night, extraNames);
      cancel();
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      setBusy(false);
    }
  }

  const rows = Object.keys(FIELD_KEYS);
  return (
    <section
      className="night-card night-fields"
      aria-labelledby="night-fields-title"
    >
      <h2 id="night-fields-title">{message(locale, "nightPageNightTitle")}</h2>
      {planName ? (
        <p className="night-card-line">
          {say(locale, "nightPageNightLineFromPlan", { plan: planName })}
        </p>
      ) : null}
      {notice ? (
        <p className="night-card-line night-field-notice" role="status">
          {notice}
        </p>
      ) : null}
      {planStatus}
      <dl className="night-field-rows">
        {rows.map((field) => {
          const keys = FIELD_KEYS[field];
          const isOpen = open === field;
          return (
            <div
              key={field}
              className={`night-field-row${isOpen ? " is-open" : ""}`}
              data-field={field}
            >
              <dt>
                {ROW_ICONS[field]}
                <span>{message(locale, keys.label)}</span>
              </dt>
              <dd>
                {isOpen ? (
                  <div className="night-field-editor">
                    <div className="night-field-control">
                      {field === "title" ? (
                        <input
                          type="text"
                          className="night-field-input"
                          value={draft.title}
                          maxLength={80}
                          data-autofocus=""
                          aria-label={message(locale, keys.label)}
                          onChange={(event) =>
                            setDraft({ title: event.target.value })
                          }
                        />
                      ) : field === "date" ? (
                        <DateEditor
                          locale={locale}
                          draft={draft}
                          setDraft={setDraft}
                          finished={Boolean(night.finishedAt?.value)}
                          utc={zone === "UTC"}
                        />
                      ) : field === "place" ? (
                        <PlaceEditor
                          locale={locale}
                          draft={draft}
                          setDraft={setDraft}
                          places={places}
                        />
                      ) : field === "equipment" ? (
                        <EquipmentEditor
                          locale={locale}
                          draft={draft}
                          setDraft={setDraft}
                          options={equipmentOptions}
                        />
                      ) : (
                        <TargetsEditor
                          locale={locale}
                          sessionId={sessionId}
                          TargetsPicker={TargetsPicker}
                          draft={draft}
                          setDraft={setDraft}
                          names={targetNames}
                          onName={(id, name) =>
                            setExtraNames((current) => ({
                              ...current,
                              [id]: name,
                            }))
                          }
                        />
                      )}
                      {error ? (
                        <p className="debrief-error" role="alert">
                          {error}
                        </p>
                      ) : null}
                    </div>
                    <FieldActions
                      locale={locale}
                      field={field}
                      busy={busy}
                      canSave={savable(field, draft)}
                      onCancel={cancel}
                      onSave={() => void save()}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="night-field-value"
                    onClick={() => start(field)}
                  >
                    <RowValue
                      field={field}
                      night={night}
                      locale={locale}
                      names={{ ...names, targets: targetNames }}
                      planEquipmentLine={planEquipmentLine}
                      timeZone={zone}
                    />
                  </button>
                )}
              </dd>
              {isOpen ? null : (
                <button
                  type="button"
                  className="night-icon-button"
                  aria-label={message(locale, keys.edit)}
                  title={message(locale, keys.edit)}
                  onClick={() => start(field)}
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          );
        })}
        {planRow}
      </dl>
    </section>
  );
}

/**
 * « Notes »: the night's own note, editable by its pencil (« Modifier la
 * note »), and, read only, the notes taken in the field (the journal's
 * `note` events: « 02:08 · M31 — … »).
 */
export function NightNotesCard({
  locale = "en",
  sessionId,
  night,
  fieldNotes = [],
  onSaved = () => {},
  saveNight = null,
}) {
  const [draft, setDraftText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notes = night.notes?.value ?? "";
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { notes: draft };
      const result = saveNight
        ? await saveNight(body)
        : await responseData(
            await requestJson(
              `/api/v1/sessions/${encodeURIComponent(sessionId)}/night`,
              { method: "PATCH", body },
            ),
            message(locale, "nightPageSaveFailed"),
          );
      onSaved(result.night);
      setDraftText(null);
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="night-card night-notes"
      aria-labelledby="night-notes-title"
    >
      <div className="night-card-head">
        <h2 id="night-notes-title">{message(locale, "nightPageNotesTitle")}</h2>
        {draft === null ? (
          <button
            type="button"
            className="night-icon-button"
            aria-label={message(locale, "nightPageEditNotes")}
            title={message(locale, "nightPageEditNotes")}
            onClick={() => setDraftText(notes)}
          >
            <PencilIcon />
          </button>
        ) : null}
      </div>
      {draft === null ? (
        // « Aucune note » is not said above notes taken in the field or at the
        // debriefing, which are listed under it.
        notes || !fieldNotes.length ? (
          <p className={notes ? "night-notes-text" : "night-card-line"}>
            {notes || message(locale, "nightPageNotesEmpty")}
          </p>
        ) : null
      ) : (
        <div className="night-field-editor">
          <textarea
            className="night-field-input night-notes-input"
            value={draft}
            maxLength={4000}
            rows={4}
            data-autofocus=""
            aria-label={message(locale, "nightPageNotesLabel")}
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) setDraftText(null);
            }}
          />
          {error ? (
            <p className="debrief-error" role="alert">
              {error}
            </p>
          ) : null}
          <FieldActions
            locale={locale}
            field="notes"
            busy={busy}
            canSave
            onCancel={() => setDraftText(null)}
            onSave={() => void save()}
          />
        </div>
      )}
      {fieldNotes.length ? (
        <div className="night-field-notes">
          <h3>{message(locale, "nightPageFieldNotes")}</h3>
          <ul>
            {fieldNotes.map((note) => (
              <li key={note.eventId}>
                <span className="night-row-muted">
                  {[utcClock(note.recordedAt), note.target]
                    .filter(Boolean)
                    .join(" · ")}
                  {" — "}
                </span>
                {note.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
