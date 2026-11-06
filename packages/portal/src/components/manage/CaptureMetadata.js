"use client";

import { useEffect, useRef, useState } from "react";
import { InfoLine } from "../dialog/InfoButton.js";
import { WebConfirmDialog } from "../dialog/WebDialog.js";
import { durationText, clockText } from "../../written-forms.js";
import { PencilIcon, BinIcon } from "../sessions/NightFieldEditor.js";
import { utcDay, zonedDay } from "../sessions/night-detail-view.js";
import { debriefTimeZone } from "../sessions/debrief-decision.js";
import { message } from "portal/i18n.js";
import { METADATA_LIMITS } from "../../captures/metadata-limits.js";
import { generatedTextFor } from "../../captures/image-texts.js";

// The id the service gives the camera built into a smart telescope
// (`capture-metadata-reading.js`).
const INTEGRATED_CAMERA = "integrated";
import { dayMonth } from "./captures-format.js";
import { usePlanImageName } from "./plan-image-name.js";

/**
 * The metadata of a capture on its owner's detail: a pencil per value,
 * named by its object for a screen reader (« Modifier le titre », « Changer
 * la caméra »), the whole row reactive on hover; a click opens the field **in
 * place**, one at a time, with its own primary « Enregistrer … » and
 * « Annuler » as a link, a counter, a help line and the
 * error line under the field (the input kept, the primary active and
 * checking again). Under each zone's title, the origin in one line + ⓘ
 * « · modifié » on a value the owner corrected, « · calculé » on a
 * computed one (no pencil). Read only: no pencil, no button of writing.
 * The place is the night's: no pencil, changed on the night's page
 * (« Ouvrir la nuit »).
 *
 * Each save is `PATCH /api/v1/manage/captures/{id}` with one field of
 * `metadata` (`actions.saveMetadata`); the service checks every limit
 * again.
 */

/**
 * Whether the answer of a save means « the save did not happen and nothing
 * says why »: a `conflict` is not that — the page says which field changed
 * elsewhere, the editor stays open with the entry as typed.
 */
const notSaved = (outcome) =>
  Boolean(outcome) && outcome.kind !== "ok" && outcome.kind !== "conflict";

/**
 * The save of a card's form: the fields that changed are saved one after the
 * other — the service takes one field per request — each on the capture the
 * previous save answered (a stale revision would be a conflict with
 * ourselves); every save but the last keeps the form open
 * (`run.current.keep`), the last closes it. Answers `"unchanged"` (nothing
 * to save), `"invalid"` (a field is not valid: nothing is sent), `"stopped"`
 * (a save was refused, conflicted or failed: the form stays open, the fields
 * saved before are no longer changed) or `"saved"`.
 */
export async function saveChangedSlots({ slots, capture, run }) {
  const changed = [...slots.values()].filter((slot) => slot.dirty);
  if (changed.some((slot) => !slot.valid)) return "invalid";
  if (!changed.length) return "unchanged";
  let current = capture;
  for (const [index, slot] of changed.entries()) {
    run.current = { capture: current, keep: index < changed.length - 1 };
    let outcome;
    try {
      outcome = await slot.run();
    } finally {
      run.current = null;
    }
    if (outcome?.kind !== "ok") return "stopped";
    current = outcome.capture ?? current;
  }
  return "saved";
}

const length = (text) => [...String(text ?? "").trim()].length;

/** The words of a value's origin: « Saisie par vous », « D'après Astro Sync ». */
const originWords = (meta, source) =>
  source ? (meta.origin[source] ?? null) : null;

/** One row of a zone: its label, its value, its marks, its pencil. */
export function MetaRow({
  field,
  label,
  value,
  marks = [],
  pencil = null,
  onEdit = null,
  readOnly = false,
  open = false,
  editor = null,
  muted = null,
}) {
  const editable = Boolean(pencil && onEdit && !readOnly);
  return (
    <div
      className={`capture-meta-row${editable ? " is-editable" : ""}${open ? " is-open" : ""}`}
      data-field={field}
      onClick={
        editable && !open
          ? (event) => {
              if (event.target.closest?.("button, a, input, select, textarea"))
                return;
              onEdit();
            }
          : undefined
      }
    >
      <dt>{label}</dt>
      <dd>
        {open ? (
          editor
        ) : (
          <>
            <span className="capture-meta-value">{value}</span>
            {muted ? (
              <span className="capture-meta-muted"> {muted}</span>
            ) : null}
            {marks.filter(Boolean).map((mark) => (
              <span key={mark} className="capture-meta-mark">
                {` ${mark}`}
              </span>
            ))}
          </>
        )}
      </dd>
      {editable && !open ? (
        <button
          type="button"
          className="capture-pencil"
          aria-label={pencil}
          title={pencil}
          onClick={onEdit}
        >
          <PencilIcon />
        </button>
      ) : null}
    </div>
  );
}

/**
 * An open field's own zone: its control (or controls), the help line or
 * the error line, the counter, then « Annuler » a link and the field's
 * primary on one line on the right.
 */
export function FieldEditor({
  meta,
  id,
  controls,
  help = null,
  error = null,
  conflict = null,
  yours = null,
  counter = null,
  over = false,
  saveLabel,
  busy = false,
  canSave = true,
  bare = false,
  onCancel,
  onSave,
}) {
  // Inside a zone's form the field draws its control, its help and its
  // error only; the zone's own « Annuler » and primary answer for every
  // field (one form per card, not one per line).
  const Shell = bare ? "div" : "form";
  return (
    <Shell
      className={`capture-meta-editor${error ? " is-error" : ""}${bare ? " is-bare" : ""}`}
      data-editor={id}
      {...(bare
        ? {}
        : {
            onSubmit: (event) => {
              event.preventDefault();
              onSave();
            },
          })}
    >
      <div className="capture-meta-controls">{controls}</div>
      <div className="capture-meta-help">
        {conflict ? (
          <ConflictCompare meta={meta} conflict={conflict} yours={yours} />
        ) : error ? (
          <p className="capture-meta-error" role="alert">
            {error}
          </p>
        ) : help ? (
          <p className="account-muted">{help}</p>
        ) : (
          <span />
        )}
        {counter ? (
          <p className={`capture-meta-count${over ? " is-over" : ""}`}>
            {counter}
          </p>
        ) : null}
      </div>
      {conflict ? (
        <ConflictActions meta={meta} busy={busy} onKeepCurrent={onCancel} />
      ) : bare ? null : (
        <div className="night-field-actions">
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={onCancel}
          >
            {meta.cancel}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !canSave}
            aria-busy={busy || undefined}
          >
            {saveLabel}
          </button>
        </div>
      )}
    </Shell>
  );
}

/**
 * The two versions of a field that changed elsewhere: « Votre saisie : … » and « Valeur actuelle : … » (with
 * « (Astro Sync) » when Astro Sync is where the current value comes from —
 * the contract cannot tell the web from a device). A line of « Intégrations »
 * puts the two versions side by side, three cells each (filter, poses,
 * time). `yours` is the entry as typed: a string, or the three cells of a
 * line.
 */
export function ConflictCompare({ meta, conflict, yours }) {
  const cells = Array.isArray(yours) ? yours : null;
  const heading = conflict.fromSync
    ? meta.captureCurrentSyncHeading
    : meta.captureCurrentHeading;
  const yoursText = cells ? cells.join(" · ") : (yours ?? "—");
  const currentText = conflict.current ?? "—";
  return (
    <div className="capture-meta-conflict" role="alert">
      <p className="capture-meta-error">{conflict.message}</p>
      {cells && conflict.currentLine ? (
        <div className="capture-conflict-lines" data-testid="capture-conflict">
          <dl data-side="yours">
            <dt>{meta.captureYoursHeading}</dt>
            {cells.map((cell, index) => (
              <dd key={index}>{cell}</dd>
            ))}
          </dl>
          <dl data-side="current">
            <dt>{heading}</dt>
            {conflict.currentLine.map((cell, index) => (
              <dd key={index}>{cell}</dd>
            ))}
          </dl>
        </div>
      ) : (
        <div data-testid="capture-conflict">
          <p data-side="yours">{meta.captureEditYours(shortened(yoursText))}</p>
          <p data-side="current">
            {conflict.fromSync
              ? meta.captureEditCurrentSync(currentText)
              : meta.captureEditCurrent(currentText)}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The two choices of a conflict, on the right, the strongest last: « Garder la version actuelle » a secondary
 * that writes nothing, « Garder ma version » the primary that sends the entry
 * again against the revision the page now holds.
 */
export function ConflictActions({ meta, busy, onKeepCurrent }) {
  return (
    <div className="night-field-actions">
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        data-testid="capture-conflict-keep-current"
        onClick={onKeepCurrent}
      >
        {meta.keepCurrent}
      </button>
      <button
        type="submit"
        className="btn-primary"
        disabled={busy}
        aria-busy={busy || undefined}
        data-testid="capture-conflict-keep-mine"
      >
        {meta.keepMine}
      </button>
    </div>
  );
}

const CONFLICT_SHORT = 140;

/** A long entry cut for the conflict's line. */
export const shortened = (text) =>
  [...String(text)].length > CONFLICT_SHORT
    ? `${[...String(text)].slice(0, CONFLICT_SHORT - 1).join("")}…`
    : String(text);

/** A text field (title, description, notes, calibration…). */
function TextEditor({
  meta,
  id,
  label,
  saved,
  max,
  what,
  help,
  multiline = false,
  saveLabel,
  busy,
  initial,
  conflict = null,
  zone = null,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = useState(initial?.draft ?? saved ?? "");
  const [error, setError] = useState(initial?.error ?? null);
  const count = length(draft);
  const over = count > max;
  const Field = multiline ? "textarea" : "input";
  const unchanged = draft.trim() === String(saved ?? "").trim();
  const shownError =
    error ??
    (over ? meta.tooLong(meta.tooLongWhat[what], max, count - max) : null);
  zone?.slots.set(id, {
    dirty: !unchanged,
    valid: !over,
    run: async () => {
      const outcome = await onSave(draft.trim() ? draft : null);
      if (notSaved(outcome)) setError(meta.saveFailed);
      return outcome;
    },
  });
  return (
    <FieldEditor
      meta={meta}
      id={id}
      bare={Boolean(zone)}
      controls={
        <label className="capture-meta-label">
          <span>{label}</span>
          <Field
            className="night-field-input"
            {...(multiline ? { rows: 3 } : { type: "text" })}
            value={draft}
            data-autofocus=""
            aria-invalid={shownError ? "true" : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </label>
      }
      help={help}
      error={shownError}
      conflict={conflict}
      yours={draft.trim() ? draft : "—"}
      counter={meta.count(count, max)}
      over={over}
      saveLabel={saveLabel}
      busy={busy}
      canSave={!unchanged}
      onCancel={onCancel}
      onSave={async () => {
        if (over) return;
        const outcome = await onSave(draft.trim() ? draft : null);
        if (notSaved(outcome)) setError(meta.saveFailed);
      }}
    />
  );
}

/** The line of an acquisition being corrected or added. */
export function lineProblems(meta, draft) {
  const frames = Number(draft.frameCount);
  const exposure = Number(draft.exposureSeconds);
  const gain = String(draft.gain ?? "").trim();
  const problems = [];
  if (length(draft.filter) > METADATA_LIMITS.filter)
    problems.push(
      meta.tooLong(
        meta.tooLongWhat.filter,
        METADATA_LIMITS.filter,
        length(draft.filter) - METADATA_LIMITS.filter,
      ),
    );
  if (!Number.isSafeInteger(frames) || frames < 1)
    problems.push(meta.framesInvalid);
  if (!Number.isFinite(exposure) || exposure <= 0)
    problems.push(meta.exposureInvalid);
  if (gain && !/^-?\d+$/.test(gain)) problems.push(meta.gainInvalid);
  return problems;
}

const lineBody = (draft) => ({
  filter: String(draft.filter ?? "").trim() || null,
  frameCount: Number(draft.frameCount),
  exposureSeconds: Number(draft.exposureSeconds),
  gain: String(draft.gain ?? "").trim() ? Number(draft.gain) : null,
});

const integration = (seconds, locale) =>
  Number.isFinite(seconds) && seconds > 0
    ? durationText(seconds / 60, locale)
    : "—";

/** A line in three cells for the conflict: filter, poses, time. */
export function conflictLineCells(meta, locale, line) {
  const frames = Number(line.frameCount);
  const exposure = Number(line.exposureSeconds);
  const known = frames > 0 && exposure > 0;
  return [
    String(line.filter ?? "").trim() || meta.noFilter,
    known ? meta.framesTimes(frames, exposure) : "—",
    integration(
      line.integrationSeconds ?? (known ? frames * exposure : NaN),
      locale,
    ),
  ];
}

function LineEditor({
  meta,
  locale,
  line,
  busy,
  initial,
  conflict = null,
  onCancel,
  onSave,
  onValidity = () => {},
}) {
  const [draft, setDraft] = useState(
    initial?.draft ?? {
      filter: line?.filter ?? "",
      frameCount: String(line?.frameCount ?? ""),
      exposureSeconds: String(line?.exposureSeconds ?? ""),
      gain:
        line?.gain === null || line?.gain === undefined
          ? ""
          : String(line.gain),
    },
  );
  const [failed, setFailed] = useState(initial?.failed ?? false);
  const [checked, setChecked] = useState(initial?.checked ?? false);
  const problems = lineProblems(meta, draft);
  useEffect(() => onValidity(problems.length > 0), [problems.length]);
  const seconds =
    problems.length === 0
      ? Number(draft.frameCount) * Number(draft.exposureSeconds)
      : NaN;
  const set = (changes) => {
    setDraft((current) => ({ ...current, ...changes }));
    setFailed(false);
  };
  const unchanged =
    line &&
    String(line.filter ?? "") === String(draft.filter ?? "").trim() &&
    String(line.frameCount) === String(draft.frameCount).trim() &&
    String(line.exposureSeconds) === String(draft.exposureSeconds).trim() &&
    String(line.gain ?? "") === String(draft.gain ?? "").trim();
  const shown = checked || initial?.checked ? problems : [];
  return (
    <tr className="capture-acquisition-edit" data-line={line?.id ?? "new"}>
      <td colSpan={7}>
        <FieldEditor
          meta={meta}
          id={`line-${line?.id ?? "new"}`}
          controls={
            <div className="capture-acquisition-controls">
              <label>
                <span className="visually-hidden">{meta.filterColumn}</span>
                <input
                  type="text"
                  className="night-field-input"
                  value={draft.filter}
                  placeholder={meta.noFilter}
                  data-autofocus=""
                  onChange={(event) => set({ filter: event.target.value })}
                />
              </label>
              <label>
                <span className="visually-hidden">{meta.framesColumn}</span>
                <input
                  type="number"
                  min="1"
                  className="night-field-input"
                  value={draft.frameCount}
                  onChange={(event) => set({ frameCount: event.target.value })}
                />
              </label>
              <label className="capture-acquisition-seconds">
                <span className="visually-hidden">{meta.exposureColumn}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="night-field-input"
                  aria-invalid={
                    shown.includes(meta.exposureInvalid) ? "true" : undefined
                  }
                  value={draft.exposureSeconds}
                  onChange={(event) =>
                    set({ exposureSeconds: event.target.value })
                  }
                />
                <span aria-hidden="true">s</span>
              </label>
              <label>
                <span className="visually-hidden">{meta.gainColumn}</span>
                <input
                  type="number"
                  className="night-field-input"
                  value={draft.gain}
                  onChange={(event) => set({ gain: event.target.value })}
                />
              </label>
              <span className="capture-acquisition-integration">
                {integration(seconds, locale)}
              </span>
            </div>
          }
          help={meta.lineHelp}
          error={shown[0] ?? (failed ? meta.saveFailed : null)}
          conflict={conflict}
          yours={conflictLineCells(meta, locale, {
            filter: draft.filter,
            frameCount: draft.frameCount,
            exposureSeconds: draft.exposureSeconds,
            integrationSeconds: seconds,
          })}
          saveLabel={meta.saveLine}
          busy={busy}
          canSave={!unchanged}
          onCancel={onCancel}
          onSave={async () => {
            setChecked(true);
            if (problems.length) return;
            const outcome = await onSave(lineBody(draft));
            if (notSaved(outcome)) setFailed(true);
          }}
        />
      </td>
    </tr>
  );
}

/** The origin line of a zone + ⓘ. */
function OriginLine({ meta, locale, text }) {
  if (!text) return null;
  return (
    <InfoLine
      locale={locale}
      className="capture-zone-line capture-meta-origin"
      text={text}
      title={meta.originInfoTitle}
      body={meta.originInfo}
    />
  );
}

const shortWhen = (meta, at, locale, timeZone) =>
  at
    ? meta.when(
        dayMonth(at, locale, { timeZone: timeZone || "UTC" }),
        clockText(at, timeZone || "UTC"),
      )
    : null;

/** « 5 oct. »: the evening of the session's night, for « la session du … ». */
export function sessionDayOf(night, locale) {
  const value = night?.value;
  const date = value?.startedAt
    ? value.startedAt.slice(0, 10)
    : (value?.date ?? null);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}

/**
 * The origin line of the zone « Intégrations »: « Synchronisées avec la
 * session du 5 oct., le 9 oct. à 03:32 ; … », « Mesurées par Astro Sync le
 * 9 oct. à 03:32 ; elles remplacent les lignes déclarées par la session.
 * … », else « D'après Astro Sync, le … ». Without the right to correct a
 * line, the sentence only says where the lines come from.
 */
export function acquisitionOriginText(
  meta,
  metadata,
  { locale, timeZone, targets, readOnly, plan = null },
) {
  const acquisition = metadata.acquisition;
  // The image of a multi-night plan: its lines come from the sessions it
  // combines, one line per session.
  if (plan) return meta.integrationsPlanOrigin(plan.name);
  if (!acquisition.lines.length) return meta.acquisitionNone;
  if (!acquisition.own) return meta.acquisitionNight(!readOnly);
  const when =
    acquisition.source === "owner"
      ? null
      : shortWhen(meta, acquisition.at, locale, timeZone);
  if (!readOnly && when) {
    if (acquisition.source === "astro-sync") {
      // « … depuis « MacBook de Camille » »: the computer Astro Sync measured
      // on, when it sent the name with the lines (`computerLabel`).
      const computers = [
        ...new Set(
          acquisition.lines
            .filter((line) => line.provenance === "measured")
            .map((line) => line.computerLabel)
            .filter(Boolean),
        ),
      ];
      return computers.length
        ? meta.integrationsMeasuredFrom(when, computers.join(", "))
        : meta.integrationsMeasured(when);
    }
    const day = sessionDayOf(metadata.night, locale);
    if (acquisition.source === "night" && day)
      return meta.integrationsSynced(day, when);
  }
  const from = originWords(meta, acquisition.source) ?? meta.origin.owner;
  return meta.acquisitionOrigin(
    from,
    when,
    acquisition.source === "astro-sync" || acquisition.source === "import"
      ? targets
      : null,
    !readOnly,
  );
}

/** What a line says of where it comes from. */
export function provenanceText(meta, line) {
  if (line.provenance === "measured" && line.edited)
    return meta.integrationsFromEdited;
  return (
    {
      declared: meta.integrationsFromDeclared,
      measured: meta.integrationsFromMeasured,
      manual: meta.integrationsFromManual,
    }[line.provenance] ?? meta.integrationsFromManual
  );
}

/** « Logiciel d'après Astro Sync ; les étapes sont saisies par vous. » */
export function processingOriginText(meta, metadata) {
  const { software, steps } = metadata.processing;
  const softwareText = software.value
    ? software.source === "owner"
      ? meta.softwareByYou
      : meta.fromWords[software.source]
        ? meta.softwareFrom(meta.fromWords[software.source])
        : null
    : null;
  const stepsText = steps.value
    ? steps.source === "owner"
      ? meta.stepsByYou
      : meta.fromWords[steps.source]
        ? meta.stepsFrom(meta.fromWords[steps.source])
        : null
    : null;
  if (!softwareText && !stepsText) return null;
  const text = meta.processingOrigin(softwareText, stepsText);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The origin line of the zone « Matériel ». */
export function equipmentOriginText(meta, metadata) {
  const roles = Object.values(metadata.equipment);
  if (
    !roles.some((role) =>
      Array.isArray(role.value) ? role.value.length : role.value,
    )
  )
    return null;
  if (roles.every((role) => role.source === "owner"))
    return meta.equipmentOriginOwn;
  const planName = metadata.night?.planName;
  return planName ? meta.equipmentOrigin(planName) : meta.equipmentOriginNight;
}

/**
 * « Nuit du dim. 5 oct. 2026 · 21:40 → 04:50 (lun. 6 oct.) ». The hours are
 * the place's, like the session's page reads them: `night.placeTimeZone`,
 * an IANA name. Without a zone they are UTC and written « UTC », once — the
 * rule of the places without a time zone.
 */
export function nightLine(meta, night, locale) {
  const value = night?.value;
  if (!value) return null;
  const start = value.startedAt;
  const end = value.finishedAt;
  if (!start)
    return value.date
      ? meta.nightValue(
          utcDay(`${value.date}T12:00:00.000Z`, locale, { year: true }),
        )
      : null;
  const zone = debriefTimeZone(night.placeTimeZone);
  const clock = (at) => clockText(at, zone);
  const day = (at) => zonedDay(at, locale, zone);
  const endDay = end && day(end) !== day(start) ? day(end) : null;
  // The night is named by its evening, as the session's title is; without
  // that date, by the day of its start in the place's zone.
  return [
    meta.nightValue(
      value.date
        ? utcDay(`${value.date}T12:00:00.000Z`, locale, { year: true })
        : zonedDay(start, locale, zone, { year: true }),
    ),
    end
      ? `${clock(start)} → ${clock(end)}${endDay ? ` (${endDay})` : ""}`
      : clock(start),
    zone === "UTC" ? meta.utc : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What a piece of equipment is called on the page: its name, never an
 * identifier. `null` when there is nothing to say.
 */
export function equipmentName(meta, entry, { locale = "en", telescope } = {}) {
  if (!entry) return null;
  // The camera built into a smart telescope, from the telescope's profile:
  // « Intégrée au Seestar S50 · IMX462 » (the planner's own sentence).
  if (entry.id === INTEGRATED_CAMERA && telescope?.name)
    return message(locale, "plannerIntegratedCamera")
      .replace("{telescope}", telescope.name)
      .replace("{sensor}", entry.name || "");
  return entry.name || null;
}

const equipmentRoles = [
  [
    "telescope",
    "telescopeId",
    "changeTelescope",
    "saveTelescope",
    ["telescope", "lens"],
  ],
  ["camera", "cameraId", "changeCamera", "saveCamera", ["camera"]],
  ["mount", "mountId", "changeMount", "saveMount", ["mount"]],
  ["filters", "filterIds", "changeFilter", "saveFilter", ["filter"]],
];

function EquipmentEditor({
  meta,
  role,
  current,
  options,
  busy,
  conflict = null,
  zone = null,
  onCancel,
  onSave,
}) {
  const [, key, , saveKey, types] = role;
  const choices = (options ?? []).filter((item) => types.includes(item.type));
  const multiple = key === "filterIds";
  const initial = multiple
    ? (current ?? []).map((entry) => entry.id)
    : current?.id && current.id !== "integrated"
      ? current.id
      : "";
  const [draft, setDraft] = useState(initial);
  const [failed, setFailed] = useState(false);
  const unchanged = JSON.stringify(draft) === JSON.stringify(initial);
  zone?.slots.set(`equipment-${key}`, {
    dirty: !unchanged && options !== null,
    valid: true,
    run: async () => {
      const outcome = await onSave({
        [`equipment.${key}`]: multiple ? draft : draft || null,
      });
      if (notSaved(outcome)) setFailed(true);
      return outcome;
    },
  });
  return (
    <FieldEditor
      meta={meta}
      id={`equipment-${key}`}
      bare={Boolean(zone)}
      controls={
        options === null ? (
          <p className="account-muted">{meta.equipmentLoading}</p>
        ) : multiple ? (
          <fieldset className="night-field-filters">
            <legend className="visually-hidden">{meta.filter}</legend>
            {choices.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={draft.includes(item.id)}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked
                        ? [...draft, item.id]
                        : draft.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        ) : (
          <select
            className="night-field-input"
            value={draft}
            data-autofocus=""
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="">{meta.noEquipment}</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )
      }
      error={failed ? meta.saveFailed : null}
      conflict={conflict}
      yours={
        multiple
          ? choices
              .filter((item) => draft.includes(item.id))
              .map((item) => item.name)
              .join(", ") || "—"
          : (choices.find((item) => item.id === draft)?.name ??
            meta.noEquipment)
      }
      saveLabel={meta[saveKey]}
      busy={busy}
      canSave={!unchanged && options !== null}
      onCancel={onCancel}
      onSave={async () => {
        const outcome = await onSave({
          [`equipment.${key}`]: multiple ? draft : draft || null,
        });
        if (notSaved(outcome)) setFailed(true);
      }}
    />
  );
}

function SensorEditor({
  meta,
  sensor,
  busy,
  conflict = null,
  zone = null,
  onCancel,
  onSave,
}) {
  const [temperature, setTemperature] = useState(
    sensor?.temperatureC === null || sensor?.temperatureC === undefined
      ? ""
      : String(sensor.temperatureC),
  );
  const [binning, setBinning] = useState(
    sensor?.binning ? String(sensor.binning) : "",
  );
  const [failed, setFailed] = useState(false);
  const value = {
    temperatureC: temperature.trim() === "" ? null : Number(temperature),
    binning: binning === "" ? null : Number(binning),
  };
  const invalid =
    value.temperatureC !== null &&
    (!Number.isFinite(value.temperatureC) ||
      value.temperatureC < -100 ||
      value.temperatureC > 60);
  zone?.slots.set("sensor", {
    dirty:
      (value.temperatureC ?? null) !== (sensor?.temperatureC ?? null) ||
      (value.binning ?? null) !== (sensor?.binning ?? null),
    valid: !invalid,
    run: async () => {
      const outcome = await onSave({
        sensor:
          value.temperatureC === null && value.binning === null ? null : value,
      });
      if (notSaved(outcome)) setFailed(true);
      return outcome;
    },
  });
  return (
    <FieldEditor
      meta={meta}
      id="sensor"
      bare={Boolean(zone)}
      controls={
        <div className="capture-acquisition-controls">
          <label className="capture-meta-label">
            <span>{meta.temperatureLabel}</span>
            <input
              type="number"
              step="any"
              className="night-field-input"
              value={temperature}
              data-autofocus=""
              onChange={(event) => setTemperature(event.target.value)}
            />
          </label>
          <label className="capture-meta-label">
            <span>{meta.binningLabel}</span>
            <select
              className="night-field-input"
              value={binning}
              onChange={(event) => setBinning(event.target.value)}
            >
              <option value="">{meta.noValue}</option>
              {[1, 2, 3, 4].map((step) => (
                <option key={step} value={String(step)}>
                  {`${step} × ${step}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      error={failed ? meta.saveFailed : null}
      conflict={conflict}
      yours={
        value.temperatureC === null && value.binning === null
          ? "—"
          : meta.sensorValue(
              value.temperatureC === null
                ? null
                : String(value.temperatureC).replace("-", "−"),
              value.binning,
            )
      }
      saveLabel={meta.saveSensor}
      busy={busy}
      canSave={!invalid}
      onCancel={onCancel}
      onSave={async () => {
        if (invalid) return;
        const outcome = await onSave({
          sensor:
            value.temperatureC === null && value.binning === null
              ? null
              : value,
        });
        if (notSaved(outcome)) setFailed(true);
      }}
    />
  );
}

function NightEditor({
  meta,
  locale,
  current,
  nights,
  busy,
  conflict = null,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = useState(current ?? "");
  const [failed, setFailed] = useState(false);
  const choices = (nights ?? []).filter((night) => night.sessionId);
  return (
    <FieldEditor
      meta={meta}
      id="night"
      controls={
        <select
          className="night-field-input"
          value={draft}
          data-autofocus=""
          aria-label={meta.nightLabel}
          onChange={(event) => setDraft(event.target.value)}
        >
          {current ? null : <option value="">{meta.noValue}</option>}
          {choices.map((night) => (
            <option key={night.sessionId} value={night.sessionId}>
              {[
                night.night
                  ? meta.nightValue(
                      utcDay(`${night.night}T12:00:00.000Z`, locale, {
                        year: true,
                      }),
                    )
                  : night.sessionId,
                night.place,
              ]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))}
        </select>
      }
      help={meta.nightHelp}
      error={failed ? meta.saveFailed : null}
      conflict={conflict}
      yours={
        choices.find((night) => night.sessionId === draft)?.night
          ? meta.nightValue(
              utcDay(
                `${choices.find((night) => night.sessionId === draft).night}T12:00:00.000Z`,
                locale,
                { year: true },
              ),
            )
          : "—"
      }
      saveLabel={meta.saveNight}
      busy={busy}
      canSave={Boolean(draft) && draft !== current}
      onCancel={onCancel}
      onSave={async () => {
        const outcome = await onSave({ sessionId: draft });
        if (notSaved(outcome)) setFailed(true);
      }}
    />
  );
}

/** The confirmation of a line's deletion (rule 4: a destructive primary). */
export function DeleteLineDialog({ meta, line, busy, onCancel, onConfirm }) {
  const name = line.filter || meta.noFilter;
  return (
    <WebConfirmDialog
      title={meta.deleteLineTitle(name)}
      cancelLabel={meta.cancel}
      closeLabel={meta.cancel}
      confirmLabel={meta.deleteLineConfirm}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="danger"
    >
      <p>{meta.deleteLineBody}</p>
    </WebConfirmDialog>
  );
}

/** « 4 h 54 »: what the plan gathered that night on the capture's target. */
function IntermediateDuration({ night, locale }) {
  if (!(night.acquiredSeconds > 0)) return null;
  return (
    <span className="capture-intermediate-duration">
      {integration(night.acquiredSeconds, locale)}
    </span>
  );
}

/** « Dim. 9 août »: the evening of a night, in the person's language. */
function intermediateDay(date, locale) {
  if (!date) return "";
  try {
    const text = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  } catch {
    return date;
  }
}

/**
 * « non combinée : 12 août · 4 h 00 »: the sessions of the plan that the
 * image of the plan leaves out (done, with a time, and not among the nights
 * it combines). `null` when there is none.
 */
function sessionsNotCombined(capture, meta, locale) {
  const combined = new Set(capture.plan?.combinedNightIds ?? []);
  const left = (capture.detail?.intermediate?.sessionsDone ?? []).filter(
    (night) =>
      night.sessionId &&
      !combined.has(night.sessionId) &&
      night.acquiredSeconds > 0,
  );
  if (!left.length) return null;
  return meta.integrationsNotCombined(
    left.length,
    left
      .map((night) =>
        [
          dayMonth(night.eveningDate, locale),
          integration(night.acquiredSeconds, locale),
        ].join(" · "),
      )
      .join(" ; "),
  );
}

/**
 * The line of a capture that is a step of a multi-night plan still in
 * progress (journal): « Cette image est une étape intermédiaire d'une série
 * prévue sur cette cible. », the sessions done (each opens its page), then,
 * greyed, those still planned, and the way to the plan. Nothing when
 * `capture.detail.intermediate` is `null`.
 */
export function CaptureIntermediate({ capture, meta, locale }) {
  const intermediate = capture.detail?.intermediate;
  if (!intermediate) return null;
  const done = intermediate.sessionsDone ?? [];
  const planned = intermediate.sessionsPlanned ?? [];
  return (
    <section
      className="capture-intermediate"
      aria-label={meta.captureIntermediate}
      data-intermediate={intermediate.projectId}
    >
      <p className="capture-intermediate-line">{meta.captureIntermediate}</p>
      <ul className="capture-intermediate-nights">
        {done.map((night) => (
          <li
            key={night.sessionId ?? night.planId ?? night.eveningDate}
            className="is-done"
            data-state="done"
          >
            <span className="capture-intermediate-day">
              <span aria-hidden="true">✓</span>{" "}
              {night.sessionId ? (
                <a
                  className="btn-link"
                  href={`/${locale}/sessions/${encodeURIComponent(night.sessionId)}`}
                >
                  {meta.intermediateDone(
                    intermediateDay(night.eveningDate, locale),
                  )}
                </a>
              ) : (
                meta.intermediateDone(
                  intermediateDay(night.eveningDate, locale),
                )
              )}
            </span>
            <IntermediateDuration night={night} locale={locale} />
          </li>
        ))}
        {planned.map((night) => (
          <li
            key={night.planId ?? night.sessionId ?? night.eveningDate}
            className="is-planned"
            data-state="planned"
          >
            <span className="capture-intermediate-day">
              <span aria-hidden="true">○</span>{" "}
              {meta.intermediatePlanned(
                intermediateDay(night.eveningDate, locale),
              )}
            </span>
            <IntermediateDuration night={night} locale={locale} />
          </li>
        ))}
      </ul>
      <a
        className="btn-link capture-intermediate-plan"
        href={`/${locale}/planner?view=plans&kind=multi&multiNight=${encodeURIComponent(intermediate.projectId)}`}
      >
        {meta.openMultiNight(intermediate.projectName ?? "")}
      </a>
    </section>
  );
}

/**
 * The zones under « État »: « La nuit », « Acquisition », « Matériel »,
 * « Traitement », « Notes ». `open` names the open field
 * (`context.editingField`), `initial` the draft a test or a capture starts it
 * with.
 */
export function CaptureMetadataZones({
  capture,
  meta,
  locale,
  timeZone = "UTC",
  readOnly = false,
  busy = false,
  open = null,
  initial = null,
  nights = [],
  equipmentOptions = null,
  nightHref = null,
  afterAcquisition = null,
  conflict = null,
  actions = {},
}) {
  const metadata = capture.metadata;
  const [deleting, setDeleting] = useState(null);
  const [lineInvalid, setLineInvalid] = useState(false);
  const planName = usePlanImageName(capture.projectId ?? null);
  if (!metadata) return null;
  const totalUnknown =
    Boolean(open?.startsWith?.("line:")) &&
    (lineInvalid ||
      Boolean(initial?.draft && lineProblems(meta, initial.draft).length));
  // One « Modifier » per card opens ONE form for the card (`open` is
  // `zone:<name>`); every field of the card draws its control and registers
  // in `slots`, the card's single « Enregistrer » saves the fields that
  // changed one after the other (the service takes one field per request),
  // each on the capture the previous save answered.
  const slots = useRef(new Map());
  const run = useRef(null);
  const edit = (field) => () => actions.editField?.(field);
  const cancel = () => {
    slots.current.clear();
    actions.editField?.(null);
  };
  const save = (body) =>
    actions.saveMetadata?.(
      run.current?.capture ?? capture,
      body,
      run.current ? { keepOpen: run.current.keep } : undefined,
    );
  const isOpen = (field) => !readOnly && open === field;
  const zoneOpen = (name) => !readOnly && open === `zone:${name}`;
  const zoneFor = (name) => (zoneOpen(name) ? { slots: slots.current } : null);
  const openZone = (name) => () => {
    slots.current.clear();
    if (name === "equipment") actions.loadEquipmentOptions?.();
    actions.editField?.(`zone:${name}`);
  };
  const saveZone = async () => {
    const outcome = await saveChangedSlots({
      slots: slots.current,
      capture,
      run,
    });
    if (outcome === "unchanged") cancel();
  };
  const zoneControls = (name, title) =>
    readOnly ? null : zoneOpen(name) ? null : (
      <div className="capture-zone-actions capture-zone-edit">
        <button
          type="button"
          className="btn-link"
          aria-label={meta.editZone(title)}
          disabled={busy}
          onClick={openZone(name)}
        >
          {meta.editShort}
        </button>
      </div>
    );
  const zoneFooter = (name, title) =>
    zoneOpen(name) ? (
      <div className="night-field-actions capture-zone-form-actions">
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={cancel}
        >
          {meta.cancel}
        </button>
        <button
          type="button"
          className="btn-primary"
          data-action="save-zone"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => void saveZone()}
        >
          {meta.saveZone(title)}
        </button>
      </div>
    ) : null;
  const editorProps = (field) => ({
    meta,
    busy,
    initial: open === field ? initial : null,
    conflict: conflict?.key === field ? conflict : null,
    onCancel: cancel,
  });
  const targets = (capture.detail?.targets ?? [])
    .map((target) => target.designation)
    .join(", ");
  const acquisition = metadata.acquisition;
  const modified = (value) => (value?.edited ? meta.modified : null);
  // « Synchroniser avec la session »: only a capture that has a session, on
  // the web session (the service answers `409 capture_without_session`).
  // The image of a multi-night plan syncs with the sessions it combines.
  const planImage = Boolean(capture.projectId);
  const canSync = Boolean(
    (metadata.sessionId || planImage) && actions.syncAcquisition,
  );
  const syncDay = planImage ? null : sessionDayOf(metadata.night, locale);
  const notCombined = planImage
    ? sessionsNotCombined(capture, meta, locale)
    : null;

  // ——— La nuit ———
  const nightZone = (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.nightZone}
      data-zone="night"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.nightZone}</h3>
        {nightHref ? (
          <div className="capture-zone-actions">
            <a className="btn-link" href={nightHref}>
              {meta.openNight}
            </a>
          </div>
        ) : null}
      </div>
      <OriginLine
        meta={meta}
        locale={locale}
        text={
          metadata.sessionId
            ? metadata.night.planName
              ? meta.nightOrigin(metadata.night.planName)
              : meta.nightOriginNoPlan
            : null
        }
      />
      <dl className="capture-meta-rows">
        <MetaRow
          field="night"
          label={meta.nightLabel}
          value={nightLine(meta, metadata.night, locale) ?? meta.noValue}
          pencil={meta.changeNight}
          onEdit={edit("night")}
          readOnly={readOnly}
          open={isOpen("night")}
          editor={
            isOpen("night") ? (
              <NightEditor
                {...editorProps("night")}
                locale={locale}
                current={metadata.sessionId}
                nights={nights}
                onSave={save}
              />
            ) : null
          }
        />
        {metadata.place?.value ? (
          <MetaRow
            field="place"
            label={meta.placeLabel}
            value={metadata.place.value.name}
            muted={meta.placeNever}
          />
        ) : null}
        {metadata.computed?.skyQuality ? (
          <MetaRow
            field="sky"
            label={meta.skyLabel}
            value={meta.bortle(metadata.computed.skyQuality.bortle)}
            marks={[meta.computed]}
          />
        ) : null}
        {metadata.computed?.moon ? (
          <MetaRow
            field="moon"
            label={meta.moonLabel}
            value={meta.moonValue(
              metadata.computed.moon.illumination,
              metadata.computed.moon.setsAt
                ? clockText(
                    metadata.computed.moon.setsAt,
                    debriefTimeZone(metadata.night?.placeTimeZone),
                  )
                : null,
            )}
            marks={[meta.computed]}
          />
        ) : null}
      </dl>
    </section>
  );

  // ——— Acquisition ———
  const lineName = (line) => line.filter || meta.noFilter;
  const acquisitionZone = (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.acquisitionZone}
      data-zone="acquisition"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.acquisitionZone}</h3>
      </div>
      <OriginLine
        meta={meta}
        locale={locale}
        text={acquisitionOriginText(meta, metadata, {
          locale,
          timeZone,
          targets,
          readOnly,
          plan: planImage
            ? {
                // « Image du plan multi-nuits IC 1805 »: the plan's name (its
                // target's), read once from the plan.
                name: capture.detail?.intermediate?.projectName || planName,
              }
            : null,
        })}
      />
      {acquisition.lines.length || isOpen("line:new") ? (
        <div className="capture-acquisition-scroll">
          <table className="capture-acquisition">
            <thead>
              <tr>
                <th scope="col">{meta.filterColumn}</th>
                <th scope="col">{meta.framesColumn}</th>
                <th scope="col">{meta.exposureColumn}</th>
                <th scope="col">{meta.gainColumn}</th>
                <th scope="col">{meta.integrationColumn}</th>
                <th scope="col">{meta.provenanceColumn}</th>
                <th scope="col">
                  {readOnly ? null : (
                    <span className="visually-hidden">{meta.editLine("")}</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {acquisition.lines.map((line) =>
                isOpen(`line:${line.id}`) ? (
                  <LineEditor
                    key={line.id}
                    {...editorProps(`line:${line.id}`)}
                    locale={locale}
                    line={line}
                    onValidity={setLineInvalid}
                    onSave={(body) =>
                      save({ acquisition: { line: line.id, set: body } })
                    }
                  />
                ) : (
                  <tr
                    key={line.id}
                    data-line={line.id}
                    className={readOnly ? undefined : "is-editable"}
                  >
                    <th scope="row">
                      {lineName(line)}
                      {line.edited && line.provenance !== "measured" ? (
                        <span className="capture-meta-mark">{` ${meta.modified}`}</span>
                      ) : null}
                    </th>
                    <td>
                      {line.frameCount > 0 ? line.frameCount : meta.noValue}
                    </td>
                    <td>
                      {line.exposureSeconds > 0
                        ? meta.seconds(line.exposureSeconds)
                        : meta.noValue}
                    </td>
                    <td>{line.gain ?? meta.noValue}</td>
                    <td>{integration(line.integrationSeconds, locale)}</td>
                    <td
                      className="capture-acquisition-provenance"
                      data-provenance={line.provenance}
                    >
                      {provenanceText(meta, line)}
                      {line.sessionId && line.eveningDate ? (
                        <span className="capture-acquisition-session">
                          {dayMonth(line.eveningDate, locale)}
                        </span>
                      ) : null}
                    </td>
                    <td className="capture-acquisition-actions">
                      {readOnly ? null : (
                        <>
                          <button
                            type="button"
                            className="capture-pencil"
                            aria-label={meta.editLine(lineName(line))}
                            title={meta.editLine(lineName(line))}
                            onClick={edit(`line:${line.id}`)}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="capture-pencil capture-line-bin"
                            aria-label={meta.deleteLine(lineName(line))}
                            title={meta.deleteLine(lineName(line))}
                            onClick={() => setDeleting(line)}
                          >
                            <BinIcon />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {isOpen("line:new") ? (
                <LineEditor
                  {...editorProps("line:new")}
                  locale={locale}
                  line={null}
                  onValidity={setLineInvalid}
                  onSave={(body) => save({ acquisition: { add: body } })}
                />
              ) : null}
            </tbody>
            {acquisition.lines.length ? (
              <tfoot>
                <tr>
                  <th scope="row">{meta.total}</th>
                  <td colSpan={3}>{meta.frames(acquisition.totalFrames)}</td>
                  <td>
                    {totalUnknown
                      ? "—"
                      : integration(acquisition.totalSeconds, locale)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
      {notCombined ? (
        <p className="capture-zone-line account-muted capture-acquisition-notcombined">
          {notCombined}
        </p>
      ) : null}
      {readOnly || isOpen("line:new") ? null : (
        <>
          {canSync && !acquisition.lines.length && syncDay ? (
            <p className="capture-meta-sync-hint">
              {meta.integrationsSyncHint(syncDay).replace(/\.\.$/, ".")}
            </p>
          ) : null}
          <div className="capture-actions capture-meta-add">
            <button
              type="button"
              className="btn-tertiary"
              disabled={busy}
              onClick={edit("line:new")}
            >
              {acquisition.lines.length ? meta.addLine : meta.addLineByHand}
            </button>
            {canSync ? (
              <button
                type="button"
                className="btn-secondary"
                data-action="sync-acquisition"
                disabled={busy}
                onClick={() => actions.syncAcquisition(capture)}
              >
                {planImage
                  ? meta.integrationsSyncPlan
                  : acquisition.lines.length
                    ? meta.integrationsSyncAgain
                    : meta.integrationsSyncSession}
              </button>
            ) : null}
          </div>
        </>
      )}
      {zoneControls(
        "acquisition",
        `${meta.calibrationLabel} · ${meta.sensorLabel}`,
      )}
      <dl className="capture-meta-rows">
        <MetaRow
          field="calibration"
          label={meta.calibrationLabel}
          value={metadata.calibration.value ?? meta.noValue}
          marks={[modified(metadata.calibration)]}
          readOnly={readOnly}
          open={isOpen("calibration") || zoneOpen("acquisition")}
          editor={
            isOpen("calibration") || zoneOpen("acquisition") ? (
              <TextEditor
                {...editorProps("calibration")}
                zone={zoneFor("acquisition")}
                id="calibration"
                label={meta.calibrationLabel}
                saved={metadata.calibration.value}
                max={METADATA_LIMITS.calibration}
                what="calibration"
                saveLabel={meta.saveCalibration}
                onSave={(value) => save({ calibration: value })}
              />
            ) : null
          }
        />
        <MetaRow
          field="sensor"
          label={meta.sensorLabel}
          value={
            metadata.sensor.value
              ? meta.sensorValue(
                  metadata.sensor.value.temperatureC === null
                    ? null
                    : String(metadata.sensor.value.temperatureC).replace(
                        "-",
                        "−",
                      ),
                  metadata.sensor.value.binning,
                )
              : meta.noValue
          }
          marks={[modified(metadata.sensor)]}
          readOnly={readOnly}
          open={isOpen("sensor") || zoneOpen("acquisition")}
          editor={
            isOpen("sensor") || zoneOpen("acquisition") ? (
              <SensorEditor
                {...editorProps("sensor")}
                zone={zoneFor("acquisition")}
                sensor={metadata.sensor.value}
                onSave={save}
              />
            ) : null
          }
        />
      </dl>
      {zoneFooter(
        "acquisition",
        `${meta.calibrationLabel} · ${meta.sensorLabel}`,
      )}
      {deleting ? (
        <DeleteLineDialog
          meta={meta}
          line={deleting}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await save({ acquisition: { line: deleting.id, delete: true } });
            setDeleting(null);
          }}
        />
      ) : null}
    </section>
  );

  // ——— Matériel ———
  const equipmentZone = (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.equipmentZone}
      data-zone="equipment"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.equipmentZone}</h3>
        {zoneControls("equipment", meta.equipmentZone)}
      </div>
      <OriginLine
        meta={meta}
        locale={locale}
        text={equipmentOriginText(meta, metadata)}
      />
      <dl className="capture-meta-rows">
        {equipmentRoles.map((role) => {
          const [name, key, pencilKey] = role;
          const value = metadata.equipment[name];
          const field = `equipment.${key}`;
          const shown = Array.isArray(value.value)
            ? value.value
                .map((entry) => equipmentName(meta, entry, { locale }))
                .filter(Boolean)
                .join(", ")
            : equipmentName(meta, value.value, {
                locale,
                telescope: metadata.equipment.telescope?.value,
              });
          return (
            <MetaRow
              key={name}
              field={field}
              label={meta[name === "filters" ? "filter" : name]}
              value={shown || meta.noValue}
              marks={[modified(value)]}
              readOnly={readOnly}
              open={isOpen(field) || zoneOpen("equipment")}
              editor={
                isOpen(field) || zoneOpen("equipment") ? (
                  <EquipmentEditor
                    {...editorProps(field)}
                    zone={zoneFor("equipment")}
                    role={role}
                    current={value.value}
                    options={equipmentOptions}
                    onSave={save}
                  />
                ) : null
              }
            />
          );
        })}
      </dl>
      {zoneFooter("equipment", meta.equipmentZone)}
    </section>
  );

  // ——— Traitement ———
  const processingZone = (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.processingZone}
      data-zone="processing"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.processingZone}</h3>
        {zoneControls("processing", meta.processingZone)}
      </div>
      <OriginLine
        meta={meta}
        locale={locale}
        text={processingOriginText(meta, metadata)}
      />
      <dl className="capture-meta-rows">
        {[
          ["software", "softwareLabel", "editSoftware", "saveSoftware"],
          ["steps", "stepsLabel", "editSteps", "saveSteps"],
        ].map(([part, labelKey, pencilKey, saveKey]) => {
          const field = `processing.${part}`;
          const value = metadata.processing[part];
          return (
            <MetaRow
              key={part}
              field={field}
              label={meta[labelKey]}
              value={value.value ?? meta.noValue}
              marks={[modified(value)]}
              readOnly={readOnly}
              open={isOpen(field) || zoneOpen("processing")}
              editor={
                isOpen(field) || zoneOpen("processing") ? (
                  <TextEditor
                    {...editorProps(field)}
                    zone={zoneFor("processing")}
                    id={field}
                    label={meta[labelKey]}
                    saved={value.value}
                    max={METADATA_LIMITS[part]}
                    what={part}
                    multiline={part === "steps"}
                    saveLabel={meta[saveKey]}
                    onSave={(text) => save({ [field]: text })}
                  />
                ) : null
              }
            />
          );
        })}
      </dl>
      {zoneFooter("processing", meta.processingZone)}
    </section>
  );

  // ——— Notes ———
  const notesZone = (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.notesZone}
      data-zone="notes"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.notesZone}</h3>
        {zoneControls("notes", meta.notesZone)}
      </div>
      <dl className="capture-meta-rows">
        <MetaRow
          field="notes"
          label={<span className="visually-hidden">{meta.notesZone}</span>}
          value={metadata.notes.value ?? meta.noValue}
          readOnly={readOnly}
          open={isOpen("notes") || zoneOpen("notes")}
          editor={
            isOpen("notes") || zoneOpen("notes") ? (
              <TextEditor
                {...editorProps("notes")}
                zone={zoneFor("notes")}
                id="notes"
                label={meta.notesZone}
                saved={metadata.notes.value}
                max={METADATA_LIMITS.notes}
                what="notes"
                multiline
                saveLabel={meta.saveNotes}
                onSave={(value) => save({ notes: value })}
              />
            ) : null
          }
        />
      </dl>
      {zoneFooter("notes", meta.notesZone)}
      <p className="capture-zone-line account-muted">{meta.notesPrivate}</p>
    </section>
  );

  return (
    <>
      {nightZone}
      {acquisitionZone}
      {afterAcquisition}
      {equipmentZone}
      {processingZone}
      {notesZone}
    </>
  );
}

/**
 * The capture's title with its pencil and its origin line (it opens in place),
 * then the zone « Description » under the meta line.
 */
export function CaptureTitleField({
  capture,
  meta,
  locale,
  fallback,
  readOnly = false,
  busy = false,
  open = null,
  initial = null,
  conflict = null,
  actions = {},
}) {
  const metadata = capture.metadata;
  const own = metadata?.title?.value ?? null;
  const hasTargets =
    (capture.detail?.targets ?? capture.targets ?? []).length > 0;
  const save = (body) => actions.saveMetadata?.(capture, body);
  if (!readOnly && open === "title")
    return (
      <div className="capture-title-field is-open">
        <TextEditor
          meta={meta}
          id="title"
          label={meta.titleLabel}
          saved={own ?? fallback}
          max={METADATA_LIMITS.title}
          what="title"
          help={meta.titleHelp(fallback)}
          saveLabel={meta.saveTitle}
          busy={busy}
          initial={initial}
          conflict={conflict?.key === "title" ? conflict : null}
          onCancel={() => actions.editField?.(null)}
          onSave={(value) =>
            save({
              title: value === null || value.trim() === fallback ? null : value,
            })
          }
        />
      </div>
    );
  return (
    <div className="capture-title-field">
      <div
        className={`capture-title-row${readOnly ? "" : " is-editable"}`}
        onClick={
          readOnly
            ? undefined
            : (event) => {
                if (event.target.closest?.("button")) return;
                actions.editField?.("title");
              }
        }
      >
        <h2 className="capture-detail-title">{own ?? fallback}</h2>
        {metadata?.title?.edited ? (
          <span className="capture-meta-mark">{` ${meta.modified}`}</span>
        ) : null}
        {readOnly || !metadata ? null : (
          <button
            type="button"
            className="capture-pencil"
            aria-label={meta.pencilTitle}
            title={meta.pencilTitle}
            onClick={() => actions.editField?.("title")}
          >
            <PencilIcon />
          </button>
        )}
      </div>
      {metadata ? (
        <InfoLine
          locale={locale}
          className="capture-zone-line capture-meta-origin"
          text={
            own
              ? meta.titleOwn
              : hasTargets
                ? meta.titleFromTargets
                : meta.titleNoTarget
          }
          title={meta.titleLabel}
          body={meta.titleInfo}
        />
      ) : null}
    </div>
  );
}

export function DescriptionZone({
  capture,
  meta,
  locale,
  readOnly = false,
  busy = false,
  open = null,
  initial = null,
  conflict = null,
  actions = {},
}) {
  const description = capture.metadata?.description;
  if (!description) return null;
  const save = (body) => actions.saveMetadata?.(capture, body);
  const isOpen = !readOnly && open === "description";
  const origin = description.value
    ? `${originWords(meta, description.source) ?? meta.origin.owner} · ${meta.visibleInGalleries}.`
    : null;
  return (
    <section
      className="capture-zone capture-meta-zone"
      aria-label={meta.descriptionZone}
      data-zone="description"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{meta.descriptionZone}</h3>
      </div>
      <dl className="capture-meta-rows">
        <MetaRow
          field="description"
          label={
            <span className="visually-hidden">{meta.descriptionZone}</span>
          }
          value={description.value ?? meta.noValue}
          marks={[
            description.edited && description.source !== "owner"
              ? meta.modified
              : null,
          ]}
          pencil={meta.editDescription}
          onEdit={() => actions.editField?.("description")}
          readOnly={readOnly}
          open={isOpen}
          editor={
            isOpen ? (
              <TextEditor
                meta={meta}
                id="description"
                label={meta.descriptionZone}
                saved={description.value}
                max={METADATA_LIMITS.description}
                what="description"
                help={meta.descriptionHelp}
                multiline
                saveLabel={meta.saveDescription}
                busy={busy}
                initial={initial}
                conflict={conflict?.key === "description" ? conflict : null}
                onCancel={() => actions.editField?.(null)}
                onSave={(value) => save({ description: value })}
              />
            ) : null
          }
        />
      </dl>
      {origin ? (
        <InfoLine
          locale={locale}
          className="capture-zone-line capture-meta-origin"
          text={origin}
          title={meta.originInfoTitle}
          body={meta.originInfo}
        />
      ) : null}
    </section>
  );
}

/**
 * The read-only notice: one line + ⓘ, « Voir les offres » a tertiary.: when a
 * payment failed it says so, with the day the read-only window ends (`until`,
 * already written), instead of « Votre abonnement est terminé ».
 */
/**
 * The text of the ⓘ of the read-only notice — the failed payment's own words
 * when the reading window began with one, the end of a subscription's
 * otherwise.
 */
export const readOnlyInfoFor = (meta, paymentFailed) =>
  paymentFailed && meta.readOnlyInfoPaymentFailed
    ? meta.readOnlyInfoPaymentFailed
    : meta.readOnlyInfo;

export function ReadOnlyNotice({
  meta,
  locale,
  offersHref = null,
  offersLabel,
  until = "",
  paymentFailed = false,
}) {
  return (
    <div
      className="capture-readonly-notice"
      role="status"
      {...(paymentFailed ? { "data-payment-failed": "true" } : {})}
    >
      <InfoLine
        locale={locale}
        className="capture-zone-line"
        text={
          paymentFailed && until
            ? meta.readOnlyPaymentFailed(until)
            : meta.readOnly
        }
        title={meta.readOnlyTitle}
        body={readOnlyInfoFor(meta, paymentFailed)}
      />
      {offersHref ? (
        <a className="btn-tertiary" href={offersHref}>
          {offersLabel}
        </a>
      ) : null}
    </div>
  );
}

/**
 * The shared editing of an image's title and description: one pencil,
 * two fields, one primary « Enregistrer le titre et la description »
 * and « Annuler » a link.
 */
export function ImageTextsEditor({
  meta,
  image,
  busy,
  initial = null,
  fallback,
  // The generated description in the owner's language, shown while he
  // typed none (`image-texts.js`).
  descriptionFallback,
  onCancel,
  onSave,
}) {
  const [title, setTitle] = useState(initial?.title ?? image.title ?? "");
  const [description, setDescription] = useState(
    initial?.description ?? image.description ?? "",
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [title, description]);
  const titleCount = length(title);
  const descriptionCount = length(description);
  const titleOver = titleCount > METADATA_LIMITS.variantTitle;
  const descriptionOver = descriptionCount > METADATA_LIMITS.variantDescription;
  const unchanged =
    title.trim() === String(image.title ?? "").trim() &&
    description.trim() === String(image.description ?? "").trim();
  const field = (
    id,
    label,
    value,
    set,
    count,
    max,
    over,
    help,
    what,
    multiline,
  ) => {
    const Field = multiline ? "textarea" : "input";
    return (
      <div className={`capture-meta-field${over ? " is-error" : ""}`}>
        <label className="capture-meta-label" htmlFor={id}>
          <span>{label}</span>
        </label>
        <Field
          id={id}
          className="night-field-input"
          {...(multiline ? { rows: 3 } : { type: "text" })}
          value={value}
          placeholder={id.endsWith("title") ? fallback : descriptionFallback}
          aria-invalid={over ? "true" : undefined}
          onChange={(event) => set(event.target.value)}
        />
        <div className="capture-meta-help">
          {over ? (
            <p className="capture-meta-error" role="alert">
              {meta.tooLong(meta.tooLongWhat[what], max, count - max)}
            </p>
          ) : (
            <p className="account-muted">{help}</p>
          )}
          <p className={`capture-meta-count${over ? " is-over" : ""}`}>
            {meta.count(count, max)}
          </p>
        </div>
      </div>
    );
  };
  return (
    <form
      className="capture-meta-editor capture-image-texts"
      data-editor={`image-${image.id}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (titleOver || descriptionOver) return;
        const outcome = await onSave({
          title: title.trim() ? title : null,
          description: description.trim() ? description : null,
        });
        if (outcome && outcome.kind !== "ok") setFailed(true);
      }}
    >
      {field(
        `capture-image-${image.id}-title`,
        meta.imageTitleLabel,
        title,
        setTitle,
        titleCount,
        METADATA_LIMITS.variantTitle,
        titleOver,
        meta.imageTitleHelp,
        "imageTitle",
        false,
      )}
      {field(
        `capture-image-${image.id}-description`,
        meta.imageDescriptionLabel,
        description,
        setDescription,
        descriptionCount,
        METADATA_LIMITS.variantDescription,
        descriptionOver,
        meta.imageDescriptionHelp,
        "imageDescription",
        true,
      )}
      {failed ? (
        <p className="capture-meta-error" role="alert">
          {meta.saveFailed}
        </p>
      ) : null}
      <div className="night-field-actions">
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={onCancel}
        >
          {meta.cancel}
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || unchanged}
          aria-busy={busy || undefined}
        >
          {meta.saveImageTexts}
        </button>
      </div>
    </form>
  );
}

/**
 * « Saisis par vous. », « D'après Astro Sync (pipeline « Rendu brut »). »:
 * the owner's texts, else the title Astro Sync generated, in the reader's
 * language (`image-texts.js`).
 */
export function imageOriginText(meta, image, locale = "en") {
  if (image.title || image.description) {
    if (image.edited || image.titleSource === "owner")
      return meta.imageOriginOwner;
    if (image.titleSource === "astro-sync" && image.title)
      return meta.imageOriginAstroSync(image.title);
    if (image.titleSource === "import") return meta.imageOriginImport;
  }
  const generated = generatedTextFor(image.generatedTitle, locale);
  return generated ? meta.imageOriginAstroSync(generated) : null;
}
