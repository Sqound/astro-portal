"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { clockValue, instantOfClock } from "./debrief-moment.js";
import { causeLabel } from "./night-summary-view.js";
import { editableKinds } from "./session-rework.js";
import { DetectedMention } from "./DetectedMention.js";
import { ReportGlyph } from "./SessionFrise.js";
import {
  detectedSentence,
  isDetectedKind,
  reportKindName,
} from "./session-page-view.js";

// The dialogs of « Remanier la session »: choose a target to add (the
// planner's search, handed in), correct the figures of one, add an event of
// the night after the fact (the four gestures of « Nuit en cours »), place a
// report on another target or on the whole night. A dialog's action is its primary, « Annuler » a
// link.

// The hours of a dialog are the place's; « UTC » is written only for a
// place without a time zone (the page's head line says it the same way).
const utcMark = (timeZone) => (timeZone === "UTC" ? " (UTC)" : "");

function Dialog({ locale, title, onClose, action, children }) {
  return (
    <WebDialog
      className="info-dialog session-rework-dialog"
      bodyClassName="info-dialog-body"
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      focusTitle
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-link" onClick={onClose}>
            {message(locale, "nightPageCancel")}
          </button>
          {action}
        </>
      }
    >
      {children}
    </WebDialog>
  );
}

/** « Ajouter une cible »: the planner's search; the choice adds the target. */
export function AddTargetDialog({
  locale,
  TargetsPicker,
  excludeIds,
  visibleFor = null,
  onPick,
  onClose,
}) {
  return (
    <Dialog
      locale={locale}
      title={message(locale, "sessionPageAddTarget")}
      onClose={onClose}
    >
      <p className="night-card-line">
        {message(locale, "sessionPageAddTargetNote")}
      </p>
      {TargetsPicker ? (
        <TargetsPicker
          locale={locale}
          sessionId={null}
          excludeIds={excludeIds}
          visibleFor={visibleFor}
          onPick={onPick}
        />
      ) : null}
    </Dialog>
  );
}

/** The pencil of a card: the hours, the frames and the filter of the target. */
export function EditTargetDialog({
  locale,
  label,
  row,
  timeZone = "UTC",
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState({
    start: row.start,
    end: row.end,
    frames: row.frames,
    filter: row.filter,
  });
  const set = (changes) => setDraft((current) => ({ ...current, ...changes }));
  return (
    <Dialog
      locale={locale}
      title={`${message(locale, "sessionPageEditTarget")} · ${label}`}
      onClose={onClose}
      action={
        <button
          type="button"
          className="btn-primary"
          onClick={() => onApply(draft)}
        >
          {message(locale, "sessionPageApplyChange")}
        </button>
      }
    >
      <div className="session-rework-fields">
        <label>
          <span>
            {message(locale, "debriefMomentStart")}
            {utcMark(timeZone)}
          </span>
          <input
            type="time"
            value={draft.start}
            onChange={(event) => set({ start: event.target.value })}
          />
        </label>
        <label>
          <span>
            {message(locale, "debriefMomentEnd")}
            {utcMark(timeZone)}
          </span>
          <input
            type="time"
            value={draft.end}
            onChange={(event) => set({ end: event.target.value })}
          />
        </label>
        <label>
          <span>{message(locale, "debriefMomentFramesLabel")}</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={draft.frames}
            onChange={(event) => set({ frames: event.target.value })}
          />
        </label>
        <label>
          <span>{message(locale, "sessionPageFilterLabel")}</span>
          <input
            type="text"
            maxLength={40}
            value={draft.filter}
            onChange={(event) => set({ filter: event.target.value })}
          />
        </label>
      </div>
    </Dialog>
  );
}

const KINDS = {
  note: "sessionPageEventNote",
  sky: "sessionPageEventKindSky",
  incident: "sessionPageEventKindIncident",
  pause: "sessionPagePause",
};
// The closed list of the causes of a pause (`session-events/pause`).
const PAUSE_CAUSES = [
  "clouds",
  "wind",
  "dew",
  "guiding",
  "meridian_flip",
  "equipment",
  "fatigue",
  "other",
];
const SKIES = {
  clear: "sessionPageSkyClear",
  mostly_clear: "sessionPageSkyMostlyClear",
  partly_cloudy: "sessionPageSkyPartlyCloudy",
  mostly_cloudy: "sessionPageSkyMostlyCloudy",
  overcast: "sessionPageSkyOvercast",
  fog: "sessionPageSkyFog",
  hazy: "sessionPageSkyHazy",
  cloudy: "sessionPageSkyCloudy",
};
// What in the sky is the trouble (`session-events/condition`).
const SKY_CAUSES = ["clouds", "wind", "dew"];

/** The place choices: the whole night, then each target. */
function PlaceSelect({ locale, cards, value, onChange }) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{message(locale, "sessionPageWholeNight")}</option>
      {cards.map((card) => (
        <option key={card.key} value={card.key}>
          {card.label}
        </option>
      ))}
    </select>
  );
}

/** The report whose kind is a card, not a choice, or `null`. */
export const detectedKindCard = (editing, report) =>
  editing && report && isDetectedKind(report.kind) ? report : null;

/**
 * « Genre » of the dialog. The four kinds a person can declare as
 * chips (a pause is replaced by a pause: locked), and in « Ajouter » the grey
 * sentence that says where the four others are; or, correcting a report Astro
 * Sync detected in the guiding, a card.
 */
export function EventKindField({
  locale,
  editing,
  kinds,
  kind,
  kindLocked,
  detectedReport = null,
  timeZone = null,
  onChange = () => {},
}) {
  if (detectedReport)
    return (
      <KindCard locale={locale} report={detectedReport} timeZone={timeZone} />
    );
  return (
    <fieldset className="session-rework-kinds">
      <legend>
        {message(
          locale,
          editing ? "sessionPageEventGenre" : "sessionPageEventWhat",
        )}
      </legend>
      {Object.entries(KINDS)
        .filter(([value]) => kinds.includes(value))
        .map(([value, key]) => (
          <label
            key={value}
            className={`debrief-chip${kind === value ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="rework-event-kind"
              value={value}
              checked={kind === value}
              disabled={kindLocked}
              onChange={() => onChange(value)}
            />
            {message(locale, key)}
          </label>
        ))}
      {!editing ? (
        <p
          className="session-rework-kinds-help"
          data-testid="session-rework-kind-help"
        >
          {message(locale, "sessionPageEventDetectedKinds")}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * The report Astro Sync detected, read not chosen: the icon and
 * name of its kind, its mention, its sentence, then what the correction makes
 * of it. Replaces « Genre » and its chips.
 */
function KindCard({ locale, report, timeZone = null }) {
  const name = reportKindName(report.kind, locale);
  const sentence = detectedSentence(report, locale, timeZone);
  return (
    <div
      className="session-rework-kind-card"
      data-testid="session-rework-kind-card"
    >
      <p className="session-rework-kind-card-head">
        <ReportGlyph kind={report.kind} size={16} />
        <strong>{`${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)}`}</strong>
        <DetectedMention locale={locale} />
      </p>
      {sentence ? (
        <p className="session-rework-kind-card-sentence">{sentence}</p>
      ) : null}
      <p
        className="session-rework-kind-card-becomes"
        data-testid="session-rework-kind-becomes"
      >
        {message(locale, "sessionPageKindBecomes")}
      </p>
    </div>
  );
}

/**
 * « Ajouter un événement »: what happened, when (UTC, inside the night), on
 * which target. The four gestures of « Nuit en cours », after the fact; the
 * event is « reconstruit ». With `initial` (a report already there) the same
 * form is « Modifier le signalement »: its genre (not a pause's: a pause is
 * replaced by a pause), its text, its sky or its cause, and its hour are the
 * ones to edit; what Astro Sync wrote (`detected`) keeps its mention.
 *
 * The kind picker offers only the four kinds a person can declare.
 * The four kinds Astro Sync detects are shown, never chosen: a grey sentence
 * under the group in « Ajouter », and, when `detectedReport` is a report of
 * one of the two guiding kinds corrected as an incident, a card in place of
 * « Genre » (the kind is locked on the incident).
 */
export function AddEventDialog({
  locale,
  cards,
  windowStart,
  windowEnd,
  initial = null,
  detected = false,
  detectedReport = null,
  timeZone = "UTC",
  onAdd,
  onClose,
}) {
  const [kind, setKind] = useState(initial?.kind ?? "note");
  // The first whole minute inside the night (a clock has no seconds).
  const [when, setWhen] = useState(
    initial
      ? clockValue(initial.at, timeZone)
      : clockValue(
          Math.ceil(Date.parse(windowStart) / 60_000) * 60_000,
          timeZone,
        ),
  );
  const [until, setUntil] = useState(
    initial?.until ? clockValue(initial.until, timeZone) : "",
  );
  const [targetKey, setTargetKey] = useState(initial?.targetKey ?? null);
  const [text, setText] = useState(initial?.text ?? "");
  const [sky, setSky] = useState(initial?.sky ?? "hazy");
  const [cause, setCause] = useState(initial?.cause ?? "");
  const at = instantOfClock(when, windowStart, null, timeZone);
  const untilAt = until
    ? instantOfClock(until, windowStart, at, timeZone)
    : null;
  const inside = (instant) =>
    instant !== null &&
    instant >= Date.parse(windowStart) &&
    instant <= Date.parse(windowEnd);
  const needsText = kind === "note" || kind === "incident";
  const valid =
    inside(at) &&
    (kind !== "pause" ||
      (untilAt !== null && untilAt > at && inside(untilAt))) &&
    (!needsText || text.trim());
  const editing = initial !== null;
  // A pause is replaced by a pause; any other report can change genre.
  const kinds = editableKinds(initial);
  const kindLocked = kinds.length === 1;
  // The report Astro Sync detected in the guiding that is corrected here: its
  // kind is a card, not a choice.
  const kindCard = detectedKindCard(editing, detectedReport);
  const causes = kind === "pause" ? PAUSE_CAUSES : SKY_CAUSES;
  return (
    <Dialog
      locale={locale}
      title={message(
        locale,
        editing
          ? initial.kind === "incident"
            ? "sessionPageEditIncidentTitle"
            : "sessionPageEditReportTitle"
          : "sessionPageAddEvent",
      )}
      onClose={onClose}
      action={
        <button
          type="button"
          className="btn-primary"
          disabled={!valid}
          onClick={() =>
            onAdd({
              kind,
              at,
              until: kind === "pause" ? untilAt : null,
              targetKey,
              text: text.trim() || null,
              sky: kind === "sky" ? sky : null,
              cause:
                (kind === "pause" || kind === "sky") && cause ? cause : null,
            })
          }
        >
          {message(
            locale,
            editing ? "sessionPageApplyChange" : "sessionPageAddThisEvent",
          )}
        </button>
      }
    >
      <div className="session-rework-fields">
        {editing && detected && !kindCard ? (
          <p
            className="session-rework-wide"
            data-testid="session-rework-detected"
          >
            {message(locale, "sessionPageEditDetectedKept")}
          </p>
        ) : null}
        <EventKindField
          locale={locale}
          editing={editing}
          kinds={kinds}
          kind={kind}
          kindLocked={kindLocked}
          detectedReport={kindCard}
          timeZone={timeZone}
          onChange={setKind}
        />
        <label>
          <span>
            {message(locale, "sessionPageEventWhen")}
            {utcMark(timeZone)}
          </span>
          <input
            type="time"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </label>
        {kind === "pause" ? (
          <label>
            <span>
              {message(locale, "sessionPageEventPauseEnd")}
              {utcMark(timeZone)}
            </span>
            <input
              type="time"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </label>
        ) : null}
        {kind === "pause" || kind === "sky" ? (
          <label>
            <span>
              {message(
                locale,
                kind === "pause"
                  ? "sessionPageEventPauseCause"
                  : "sessionPageEventSkyCause",
              )}
            </span>
            <select
              value={cause}
              onChange={(event) => setCause(event.target.value)}
            >
              <option value="">
                {message(
                  locale,
                  kind === "pause"
                    ? "sessionPageEventPauseCauseNone"
                    : "sessionPageEventSkyCauseNone",
                )}
              </option>
              {causes.map((value) => (
                <option key={value} value={value}>
                  {causeLabel(locale, value)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === "sky" ? (
          <label>
            <span>{message(locale, "sessionPageEventSky")}</span>
            <select
              value={sky}
              onChange={(event) => setSky(event.target.value)}
            >
              {Object.entries(SKIES).map(([value, key]) => (
                <option key={value} value={value}>
                  {message(locale, key)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="session-rework-wide">
          <span>
            {kind === "incident"
              ? message(locale, "sessionPageEventKindIncident")
              : message(locale, "sessionPageEventNote")}
          </span>
          <textarea
            maxLength={300}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label>
          <span>{message(locale, "sessionPageEventTarget")}</span>
          <PlaceSelect
            locale={locale}
            cards={cards}
            value={targetKey}
            onChange={setTargetKey}
          />
        </label>
      </div>
    </Dialog>
  );
}

/** « Déplacer le signalement »: on which target, or on the whole night. */
export function MoveReportDialog({ locale, cards, current, onMove, onClose }) {
  const [targetKey, setTargetKey] = useState(current ?? null);
  return (
    <Dialog
      locale={locale}
      title={message(locale, "sessionPageMoveReportTitle")}
      onClose={onClose}
      action={
        <button
          type="button"
          className="btn-primary"
          onClick={() => onMove(targetKey)}
        >
          {message(locale, "sessionPageApplyChange")}
        </button>
      }
    >
      <div className="session-rework-fields">
        <label className="session-rework-wide">
          <span>{message(locale, "sessionPageEventTarget")}</span>
          <PlaceSelect
            locale={locale}
            cards={cards}
            value={targetKey}
            onChange={setTargetKey}
          />
        </label>
      </div>
    </Dialog>
  );
}
