"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { labelValueSeparator, durationText } from "portal/written-forms.js";
import { debriefSummary } from "portal/debrief-summary.js";
import { newEventId } from "portal/event-id.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { astroSyncDownloadUrl } from "../../captures/astro-sync-link.js";
import {
  buildDebriefDecisionBody,
  debriefTimeZone,
  formatVersionDate,
} from "./debrief-decision.js";
import {
  addedMomentRow,
  clockValue,
  initialMomentRows,
  noTimeItemsOf,
  pendingProposal,
  presetNoTimeReasons,
  momentRowsInZone,
  momentRowsToDecision,
  planItemSlot,
  takePlanned,
} from "./debrief-moment.js";
import {
  applyPlaceTimeZone,
  isKnownTimeZone,
  resolvePlaceTimeZone,
  sessionPlaceWithZone,
} from "portal/planner/place-time-zone.js";
import {
  PlaceTimeZoneNotice,
  repairPlaceTimeZone,
} from "./PlaceTimeZoneNotice.js";
import { say } from "./night-detail-view.js";
import { ImageOrPictogram } from "../ObjectPictogram.js";
import { pictogramTargetOf } from "./journal-list-view.js";
import {
  frozenShooting,
  plannedShootingText,
  prefilledShooting,
} from "./acquisition-figures.js";
import { autoConfirmationPayloads } from "./night-summary-view.js";
import { postJson, responseData } from "./portal-fetch.js";
import {
  nightPassages,
  sessionCards,
  sessionFrise,
  sessionReports,
} from "./session-page-model.js";
import {
  detectedSentence,
  fromLine,
  nightTitle,
  outcomeLabel,
} from "./session-page-view.js";
import { SessionFrise } from "./SessionFrise.js";
import { SessionDevices } from "./SessionDevices.js";
import { SessionInstrument } from "./SessionInstrument.js";
import { sessionDeviceLines } from "./session-device-lines.js";
import { ReasonChips, RemoveTargetDialog } from "./RemoveTargetDialog.js";
import { AddEventDialog, MoveReportDialog } from "./SessionReworkDialogs.js";
import {
  addedEventsBody,
  draftEventId,
  editReport,
  eventMovesBody,
  eventReplacementsBody,
  moveReport,
  reportForm,
  reportIsEditable,
  reportsWithDraft,
  revertReport,
} from "./session-rework.js";
import { BarsGlyph, BinGlyph, ReportLine } from "./SessionTargetCard.js";

// Maps the error codes of the sessions API (debrief.schema.json /
// api/v1.md) a debrief decision can answer with onto one sober,
// localized sentence each — never the raw code. Codes this screen
// cannot really provoke in ordinary use (a missing CSRF token, storage
// being unavailable) fall through to the generic message.
const ERROR_KEY_BY_CODE = {
  plan_not_found: "debriefErrorPlanNotFound",
  plan_frozen: "debriefErrorPlanNotFound",
  plan_not_debriefable: "debriefErrorNotDebriefable",
  unknown_target_adjustment: "debriefErrorUnknownTargetAdjustment",
  set_aside_version_required: "debriefErrorVersionRequired",
  set_aside_version_not_found: "debriefErrorVersionRequired",
  event_already_replaced: "debriefErrorEventChanged",
  event_not_found: "debriefErrorEventChanged",
  event_not_replaceable: "sessionPageReworkEventNotEditable",
};

// « débriefez-la plutôt comme partielle » is advised only when the night
// holds field events; a night not over says so. A service that gives no
// reason keeps the message that names both causes.
const NOT_DEBRIEFABLE_KEY_BY_REASON = {
  session_has_events: "debriefErrorSessionHasEvents",
  night_in_future: "debriefErrorNightNotOver",
};

export function localizedErrorMessage(error, locale) {
  const key =
    error?.code === "plan_not_debriefable" &&
    NOT_DEBRIEFABLE_KEY_BY_REASON[error?.reason]
      ? NOT_DEBRIEFABLE_KEY_BY_REASON[error.reason]
      : ERROR_KEY_BY_CODE[error?.code] || "debriefErrorGeneric";
  return message(locale, key);
}

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function targetTitle(item, locale) {
  return (
    item.target?.title ||
    item.targetId ||
    item.id ||
    message(locale, "debriefTargetUntitled")
  );
}

function StaleDeviceBanner({ locale, staleDevices, timeZone, onContinue }) {
  const [dismissed, setDismissed] = useState(false);
  if (!staleDevices?.length || dismissed) return null;
  return (
    <div className="debrief-stale-banner" role="status">
      {staleDevices.map((device) => (
        <p key={device.deviceId || device.label}>
          {fillTemplate(message(locale, "debriefStaleDeviceBanner"), {
            device: device.label,
            time: formatVersionDate(device.lastSyncAt, locale, timeZone),
          })}
        </p>
      ))}
      <div className="debrief-stale-banner-actions">
        <a className="btn-tertiary" href={`/${locale}/sessions`}>
          {message(locale, "debriefStaleDeviceOpenApp")}
        </a>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setDismissed(true);
            onContinue?.();
          }}
        >
          {message(locale, "debriefStaleDeviceContinue")}
        </button>
      </div>
    </div>
  );
}

function VersionChoice({
  locale,
  versions,
  timeZone,
  webDate,
  fieldDate,
  value,
  onChange,
}) {
  const prompt = fillTemplate(message(locale, "debriefVersionChoicePrompt"), {
    webDate,
    fieldDate,
  });
  return (
    <fieldset className="debrief-version-choice">
      <legend>{prompt}</legend>
      <div className="debrief-version-options">
        {versions.map((version) => (
          <label
            key={version.base}
            className={`debrief-version-option${value === version.base ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="debrief-version"
              value={version.base}
              checked={value === version.base}
              onChange={() => onChange(version)}
            />
            <span>
              {version.origin === "field"
                ? message(locale, "debriefVersionFieldLabel")
                : message(locale, "debriefVersionWebLabel")}
            </span>
            <small>
              {formatVersionDate(version.createdAt, locale, timeZone)}
            </small>
            {version.deviceLabel && (
              <small>
                {fillTemplate(message(locale, "debriefVersionDeviceSuffix"), {
                  device: version.deviceLabel,
                })}
              </small>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const OUTCOME_KEYS = {
  executed: "Executed",
  partial: "Partial",
  abandoned: "Abandoned",
};

const RESULT_KEYS = [
  ["done", "debriefMomentTargetDone"],
  ["partial", "debriefMomentTargetPartial"],
  ["skipped", "debriefMomentTargetNotDone"],
];

/** One target of the moment: the answer on it (Faite / En partie / Non faite), its hours and frames or its reason. */
function MomentTargetRow({
  locale,
  row,
  label,
  thumbnail = null,
  planned,
  plannedShooting = null,
  noTime = false,
  reports,
  reportActions = () => null,
  visual = false,
  onChange,
  onRemove,
  onRestore,
}) {
  const observed = row.result !== "skipped";
  // The planned figures are a proposal until the person takes them.
  const proposal = pendingProposal(row, { visual });
  return (
    <li
      className={`debrief-moment-row${row.removed ? " is-removed" : ""}`}
      data-target-id={row.key}
      data-state={row.removed ? "removed" : row.kind}
    >
      {thumbnail}
      <div className="debrief-moment-target">
        <div className="debrief-moment-name">
          <h3 className="session-card-title">{label}</h3>
          {row.kind === "added" ? (
            <span className="session-card-badge is-added">
              {message(locale, "sessionPageTargetAdded")}
            </span>
          ) : null}
          {row.removed ? (
            <span className="session-card-badge is-removed">
              {message(locale, "sessionPageTargetRemoved")}
            </span>
          ) : null}
        </div>
        {planned ? (
          <p className="session-card-line is-planned">{planned}</p>
        ) : row.kind === "added" ? (
          <p className="session-card-line is-planned">
            {message(locale, "sessionPageNotInPlan")}
          </p>
        ) : null}
        {plannedShooting ? (
          <p
            className="session-card-line is-planned is-shooting"
            data-shooting="planned"
          >
            {plannedShooting}
          </p>
        ) : null}
        {plannedShooting && proposal ? (
          <p
            className="session-card-line is-planned is-shooting"
            data-shooting="proposal"
          >
            {message(locale, "debriefMomentPlannedNotDeclared")}{" "}
            <button
              type="button"
              className="btn-link"
              data-testid="debrief-take-planned"
              onClick={() => onChange(takePlanned(row))}
            >
              {message(locale, "debriefMomentTakePlanned")}
            </button>
          </p>
        ) : null}
        {noTime && !observed && !row.removed ? (
          <p
            className="session-card-line is-not-done"
            data-testid="debrief-no-time"
          >
            {message(locale, "sessionPageNoTimeTonight")}
          </p>
        ) : null}
        {reports.length ? (
          <ul className="session-reports">
            {reports.map((report) => (
              <ReportLine
                key={report.id}
                report={report}
                locale={locale}
                actions={reportActions(report)}
              />
            ))}
          </ul>
        ) : null}
      </div>
      {row.removed ? (
        <button type="button" className="btn-link" onClick={onRestore}>
          {message(locale, "sessionPageRestoreTarget")}
        </button>
      ) : (
        <>
          <span
            className="debrief-segmented"
            role="radiogroup"
            aria-label={label}
          >
            {RESULT_KEYS.map(([result, key]) =>
              row.kind === "added" && result === "skipped" ? null : (
                <button
                  key={result}
                  type="button"
                  role="radio"
                  aria-checked={row.result === result}
                  className={`debrief-segment${row.result === result ? " is-selected" : ""}`}
                  onClick={() => onChange({ result })}
                >
                  {message(locale, key)}
                </button>
              ),
            )}
          </span>
          {observed ? (
            <span className="debrief-moment-figures">
              <span className="debrief-hours">
                <input
                  type="time"
                  value={row.start}
                  aria-label={message(locale, "debriefMomentStart")}
                  onChange={(event) => onChange({ start: event.target.value })}
                />
                <span aria-hidden="true">→</span>
                <input
                  type="time"
                  value={row.end}
                  aria-label={message(locale, "debriefMomentEnd")}
                  onChange={(event) => onChange({ end: event.target.value })}
                />
              </span>
              <label className="debrief-frames">
                <span className="debrief-field-caption">
                  {message(locale, "debriefMomentFramesLabel")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={row.frames}
                  aria-label={message(locale, "debriefMomentFramesLabel")}
                  placeholder={
                    row.proposed?.frames
                      ? String(row.proposed.frames)
                      : message(locale, "debriefMomentFramesToFill")
                  }
                  onChange={(event) => onChange({ frames: event.target.value })}
                />
              </label>
              {row.kind === "planned" && !visual ? (
                <label className="debrief-frames debrief-exposure">
                  <span className="debrief-field-caption">
                    {message(locale, "debriefMomentExposureLabel")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={row.exposure ?? ""}
                    placeholder={
                      row.proposed?.exposure
                        ? String(row.proposed.exposure)
                        : ""
                    }
                    aria-label={message(locale, "debriefMomentExposureLabel")}
                    onChange={(event) =>
                      onChange({ exposure: event.target.value })
                    }
                  />
                </label>
              ) : null}
            </span>
          ) : (
            <ReasonChips
              locale={locale}
              value={row.reason}
              onChange={(reason) => onChange({ reason })}
            />
          )}
          <button
            type="button"
            className="night-icon-button night-icon-button-danger"
            aria-label={message(locale, "sessionPageRemoveTarget")}
            title={message(locale, "sessionPageRemoveTarget")}
            onClick={onRemove}
          >
            <BinGlyph />
          </button>
        </>
      )}
    </li>
  );
}

/**
 * The debriefing, the first moment of a session (it replaces the former screen
 * « Bilan de la nuit »): the page of the session the plan carried out makes,
 * « À débriefer ». At its head the night (« Session du plan « … » », « Nuit du
 * 10 au 11 oct. », the place and the planned hours in UTC); the stale-device
 * notice and the choice of a version when the plan has two, kept; then the
 * question — « Exécuté tel quel », « Exécuté en partie », « Non exécuté » —,
 * « Ce que la nuit a enregistré » when the night has a journal (the frise
 * counted by the application), the targets to tick (Faite / En partie / Non
 * faite, the hours, the frames, the reason), removed with their reason or
 * added, « Créer la session » (the only primary) — which leads to the
 * session's page, now the place of everything —, « Plus tard » (a link) and,
 * for a night not carried out, « Confirmer : non exécuté ». One primary, « Ajouter une cible » a tertiary,
 * « Plus tard » a link; the bin of a row is a tertiary icon in the destructive
 * tint.
 *
 * `plan` is always the live plan resource; `queueEntry` is its current
 * debrief-queue entry (null once it has left the queue: the screen then only
 * leads to the session, replaying the idempotent decision).
 */
export function DebriefScreen({
  locale = "en",
  planId,
  plan,
  queueEntry,
  summaryInput = null,
  spacePlaces = [],
  TargetsPicker = null,
  // The catalogue's picture and type of each target of the plan by id
  // (`targetPicturesOf`, read where the page is made).
  pictures = {},
}) {
  const items = useMemo(() => plan?.payload?.items || [], [plan]);
  // What the launch froze for each target (photo nights only): the « Prévu »
  // line of the form and the frames and exposure it starts with.
  const visual = plan?.payload?.equipment?.mode === "visual";
  const frozenByItem = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.id, frozenShooting(plan?.payload, item.id)]),
      ),
    [items, plan],
  );
  const projects = getPlannerExtensions("planner.projects")[0] || null;
  const multiNight = Boolean(projects && items.some((item) => item?.projectId));
  const nightStartAt = queueEntry?.nightStartAt ?? plan?.nightStartAt ?? null;
  const nightEndAt = queueEntry?.nightEndAt ?? plan?.nightEndAt ?? null;
  // The hours are the place's. The plan's copy of the place, the places
  // of the space, then the table by the position; UTC only when none can be
  // read, and the page says so.
  const [chosenZone, setChosenZone] = useState(null);
  const [zoneSaved, setZoneSaved] = useState("");
  const sessionPlace = sessionPlaceWithZone(
    null,
    plan?.payload?.location,
    spacePlaces,
  );
  const zonedPlace =
    chosenZone && sessionPlace
      ? applyPlaceTimeZone(sessionPlace, chosenZone, true)
      : sessionPlace;
  const zoneResolved = zonedPlace
    ? resolvePlaceTimeZone(zonedPlace)
    : { timeZone: null, source: null };
  const timeZone = debriefTimeZone(zoneResolved.timeZone);
  const zoneUnresolved = Boolean(
    zonedPlace &&
    (String(zonedPlace.name ?? "").trim() ||
      Number.isFinite(Number(zonedPlace.latitude))) &&
    !zoneResolved.timeZone,
  );
  const zoneToRepair =
    sessionPlace &&
    !isKnownTimeZone(sessionPlace.timeZone) &&
    zoneResolved.source === "table"
      ? sessionPlace
      : null;
  useEffect(() => {
    if (zoneToRepair) repairPlaceTimeZone(zoneToRepair).catch(() => {});
    // Once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(zoneToRepair)]);
  // With the night's journal in hand the moment shows what it recorded. A night
  // with field events is always confirmed as `partial` (the service refuses
  // `executed` over a journal, and the screen says why).
  const summaryMode = Boolean(summaryInput) && plan?.status === "active";
  const [outcome, setOutcome] = useState("partial");
  const [baseVersion, setBaseVersion] = useState(null);
  const [setAsideVersionId, setSetAsideVersionId] = useState(null);
  const [rows, setRows] = useState(() =>
    initialMomentRows({
      items,
      summary: summaryMode ? debriefSummary(summaryInput) : null,
      nightStartAt,
      timeZone,
      shooting: Object.fromEntries(
        Object.entries(frozenByItem).map(([id, planned]) => [
          id,
          prefilledShooting(planned),
        ]),
      ),
    }),
  );
  // The zone of the place chosen on this page: the rows are read again in it.
  const [rowsZone, setRowsZone] = useState(timeZone);
  if (rowsZone !== timeZone) {
    setRowsZone(timeZone);
    setRows((current) => momentRowsInZone(current, timeZone));
  }
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addedNames, setAddedNames] = useState({});
  // Events added and reports moved at the debriefing (« Ajouter un événement »,
  // « Déplacer ce signalement »): kept in a draft, sent with the answer as
  // `addedEvents` / `eventMoves`.
  const [eventDraft, setEventDraft] = useState({
    added: [],
    moves: {},
    removals: [],
    replacements: {},
  });
  const [eventDialog, setEventDialog] = useState(null);

  const versions = queueEntry?.versions || null;
  const summary = useMemo(
    () => (summaryMode ? debriefSummary(summaryInput) : null),
    [summaryMode, summaryInput],
  );
  const itemOf = (row) => items.find((entry) => entry.id === row.itemId);
  const titleOf = (targetId) => {
    const item = items.find(
      (entry) => (entry.targetId || entry.id) === targetId,
    );
    return item ? targetTitle(item, locale) : targetId;
  };
  // The thumbnail of a row: the catalogue's picture of its target, the
  // pictogram of its type where it has none.
  const pictureIdOf = (row) =>
    itemOf(row)?.target?.id ?? itemOf(row)?.targetId ?? row.targetId;
  const thumbnailOf = (row) => {
    const id = pictureIdOf(row);
    return (
      <ImageOrPictogram
        src={
          (visual ? pictures[id]?.visualUrl : null) || pictures[id]?.url || null
        }
        target={pictogramTargetOf(pictures, id, labelOfRow(row))}
        locale={locale}
        named={false}
        className="debrief-moment-image"
      />
    );
  };
  const labelOfRow = (row) =>
    row.kind === "added"
      ? (addedNames[row.targetId] ?? row.targetId)
      : targetTitle(itemOf(row) ?? {}, locale);
  const changeRow = (key, patch) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  // What the night recorded: the frise of its journal, the reports on their target.
  const recorded = useMemo(() => {
    if (!summaryMode || !summary) return null;
    const events = summaryInput.events ?? [];
    const windowEnd = summaryInput.window?.end ?? nightEndAt;
    const passages = nightPassages(events, windowEnd);
    const reports = sessionReports({ events, passages, windowEnd });
    const cards = sessionCards({
      targets: (summary.perTarget ?? []).map((entry) => ({
        targetId: entry.targetId,
        planItemId: entry.planItemId ?? null,
        label: titleOf(entry.targetId),
        state: entry.planItemId ? "planned" : "added",
        outcome: null,
      })),
      debriefSummary: summary,
      passages,
      reports,
      titleOf,
    });
    return {
      cards,
      reports,
      reports,
      frise: sessionFrise({
        cards,
        reports,
        windowStart: summaryInput.window?.start ?? nightStartAt,
        windowEnd,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryMode, summary, summaryInput]);
  // What the night's mount and pointing helps did, under what the night
  // recorded.
  const deviceLines = useMemo(
    () => (summaryMode ? sessionDeviceLines(summaryInput?.events ?? []) : []),
    [summaryMode, summaryInput],
  );
  // The targets the night left without time — « Non
  // faite », « Manque de temps » said for them (the person may change it).
  const noTimeItems = useMemo(
    () => noTimeItemsOf(recorded?.cards ?? []),
    [recorded],
  );
  const noTimeSet = useRef(false);
  useEffect(() => {
    if (noTimeSet.current || noTimeItems.size === 0) return;
    noTimeSet.current = true;
    setRows((current) => presetNoTimeReasons(current, noTimeItems));
  }, [noTimeItems]);
  // The reports of the night, with the draft's moves and added events applied:
  // each sits on its target, or on the whole night.
  const allReports = useMemo(
    () => reportsWithDraft(recorded?.reports ?? [], eventDraft),
    [recorded, eventDraft],
  );
  const keysOfRow = (row) =>
    new Set([row.targetId, row.itemId].filter(Boolean));
  const reportsOf = (row) =>
    allReports.filter(
      (report) => report.targetKey && keysOfRow(row).has(report.targetKey),
    );
  const looseReports = allReports.filter(
    (report) =>
      !report.targetKey ||
      !rows.some((row) => keysOfRow(row).has(report.targetKey)),
  );
  const shownFrise = useMemo(
    () =>
      recorded
        ? sessionFrise({
            cards: recorded.cards,
            reports: allReports,
            windowStart: summaryInput.window?.start ?? nightStartAt,
            windowEnd: summaryInput.window?.end ?? nightEndAt,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recorded, allReports],
  );
  const eventWindow = {
    start: summaryInput?.window?.start ?? nightStartAt,
    end: summaryInput?.window?.end ?? nightEndAt,
  };
  const canAddEvent =
    Number.isFinite(Date.parse(eventWindow.start)) &&
    Number.isFinite(Date.parse(eventWindow.end));
  const reportActions = (report) =>
    report.draft || summaryMode ? (
      <span className="session-report-actions">
        {reportIsEditable(report) ? (
          <button
            type="button"
            className="btn-link"
            onClick={() => setEventDialog({ kind: "edit-report", report })}
          >
            {message(locale, "sessionPageEditReport")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-link"
          onClick={() => setEventDialog({ kind: "move", report })}
        >
          {message(locale, "sessionPageMoveReport")}
        </button>
        {report.replaced ? (
          <button
            type="button"
            className="btn-link"
            onClick={() =>
              setEventDraft((current) => revertReport(current, report))
            }
          >
            {message(locale, "sessionPageRevertReport")}
          </button>
        ) : null}
        {report.draft ? (
          <button
            type="button"
            className="night-icon-button night-icon-button-danger"
            aria-label={message(locale, "sessionPageReportDelete")}
            title={message(locale, "sessionPageReportDelete")}
            onClick={() =>
              setEventDraft((current) => {
                const moves = { ...current.moves };
                delete moves[report.id];
                return {
                  ...current,
                  moves,
                  added: current.added.filter(
                    (event) => event.id !== report.id,
                  ),
                };
              })
            }
          >
            <BinGlyph />
          </button>
        ) : null}
      </span>
    ) : null;
  const eventTargets = rows
    .filter(
      (row) => !row.removed && (outcome === "partial" || row.kind !== "added"),
    )
    .map((row) => ({ key: row.targetId, label: labelOfRow(row) }));
  const plannedLine = (row) => {
    const slot = planItemSlot(itemOf(row), nightStartAt);
    return slot
      ? say(locale, "sessionPagePlannedSpan", {
          start: clockValue(slot.start, timeZone),
          end: clockValue(slot.end, timeZone),
          duration: durationText(
            Math.round((slot.end - slot.start) / 60_000),
            locale,
          ),
        })
      : null;
  };

  /**
   * Writes an `auto_time_confirmed` for each of `payloads` to the session's
   * journal (POST /v1/sessions/{id}/events, cookie and CSRF), dated just
   * after the latest event so it confirms everything written before it.
   */
  const writeAutoConfirmations = async (payloads) => {
    if (!payloads.length || !queueEntry?.sessionId) return;
    const journal = [...summaryInput.events];
    let at = Math.max(
      Date.now(),
      ...journal.map((event) => Date.parse(event.recordedAt) || 0),
    );
    const events = payloads.map((payload) => {
      at += 1;
      return {
        eventId: newEventId(at),
        type: "auto_time_confirmed",
        recordedAt: new Date(at).toISOString(),
        payload,
      };
    });
    const result = await responseData(
      await postJson(
        `/api/v1/sessions/${encodeURIComponent(queueEntry.sessionId)}/events`,
        { events },
      ),
      message(locale, "debriefErrorGeneric"),
    );
    if (result?.rejected?.length)
      throw new Error(message(locale, "debriefErrorGeneric"));
  };

  const goToSession = (payload) => {
    setLeaving(true);
    const id = payload?.session?.id;
    window.location.assign(
      id
        ? `/${locale}/sessions/${encodeURIComponent(id)}`
        : `/${locale}/sessions`,
    );
  };

  const submit = async (body) => {
    setSubmitting(true);
    setError("");
    try {
      // Confirming the night confirms the automatic time still left, in the
      // same gesture and before the plan is frozen.
      if (summaryMode && outcome !== "abandoned")
        await writeAutoConfirmations(autoConfirmationPayloads(summary));
      const payload = await responseData(
        await postJson(
          `/api/v1/plans/${encodeURIComponent(planId)}/debrief`,
          body,
        ),
        message(locale, "debriefErrorGeneric"),
      );
      goToSession(payload);
    } catch (submitError) {
      setError(localizedErrorMessage(submitError, locale));
      setSubmitting(false);
    }
  };

  const executedNeedsApp = summaryMode && outcome === "executed";
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!outcome || executedNeedsApp) return;
    if (versions?.length && !baseVersion) {
      setError(message(locale, "debriefErrorVersionRequired"));
      return;
    }
    const { targetRows, addedRows } = momentRowsToDecision(rows);
    submit(
      buildDebriefDecisionBody({
        outcome,
        baseVersion,
        setAsideVersionId,
        sessionStartedAt: outcome !== "abandoned" ? nightStartAt : null,
        sessionFinishedAt: outcome !== "abandoned" ? nightEndAt : null,
        targetRows,
        addedRows,
        reason,
        // Only « Exécuté en partie » shows the events: the other answers do
        // not carry them.
        addedEvents: outcome === "partial" ? addedEventsBody(eventDraft) : [],
        eventMoves: outcome === "partial" ? eventMovesBody(eventDraft) : [],
        eventReplacements:
          outcome === "partial" ? eventReplacementsBody(eventDraft) : [],
      }),
    );
  };

  // The plan already left the queue (debriefed on this surface or another).
  // POST .../debrief is idempotent, so a plain replay of its own recorded
  // outcome is a safe, silent way to recover the resulting session — no
  // second lookup route is needed (api/v1.md, "Idempotency").
  if (plan && plan.status !== "active") {
    return (
      <main className="debrief-screen">
        <a className="btn-link debrief-back" href={`/${locale}/sessions`}>
          {message(locale, "debriefSessionDetailBack")}
        </a>
        <h1>{message(locale, "debriefScreenTitle")}</h1>
        <div className="debrief-panel">
          <p>
            {message(locale, "debriefSuccessTitle")}
            {labelValueSeparator(locale)}
            {message(
              locale,
              `debriefOutcome${plan.status[0].toUpperCase()}${plan.status.slice(1)}Title`,
            )}
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={replaying || leaving}
            onClick={async () => {
              setReplaying(true);
              setError("");
              try {
                goToSession(
                  await responseData(
                    await postJson(
                      `/api/v1/plans/${encodeURIComponent(planId)}/debrief`,
                      { outcome: plan.status },
                    ),
                    message(locale, "debriefErrorGeneric"),
                  ),
                );
              } catch (replayError) {
                setError(localizedErrorMessage(replayError, locale));
                setReplaying(false);
              }
            }}
          >
            {message(locale, "debriefSuccessViewSession")}
          </button>
        </div>
        {error && (
          <p className="debrief-error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  const planDate = plan?.payload?.date;
  const title =
    nightTitle(planDate, locale) ?? message(locale, "debriefScreenTitle");
  const headLine = [
    plan?.payload?.location?.name || plan?.payload?.location?.locality || null,
    nightStartAt && nightEndAt
      ? say(locale, "debriefMomentPlannedLine", {
          hours: `${clockValue(nightStartAt, timeZone)} → ${clockValue(nightEndAt, timeZone)}${timeZone === "UTC" ? " UTC" : ""}`,
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const editable = outcome === "partial";
  const base = Date.parse(nightStartAt);
  const shown = rows.filter(
    (row) => outcome === "partial" || row.kind !== "added",
  );

  return (
    <main className="debrief-screen debrief-moment session-page">
      <a className="btn-link debrief-back" href={`/${locale}/sessions`}>
        {message(locale, "debriefSessionDetailBack")}
      </a>
      <header className="night-detail-header">
        <div className="night-detail-heading">
          <span className="night-detail-eyebrow">
            {fromLine(
              multiNight ? "multiNight" : "plan",
              plan?.payload?.name || null,
              locale,
            )}
          </span>
          <h1>{title}</h1>
          {headLine ? <p className="night-detail-line">{headLine}</p> : null}
          {zoneUnresolved ? (
            <PlaceTimeZoneNotice
              locale={locale}
              place={zonedPlace}
              placeName={zonedPlace?.name ?? ""}
              at={new Date(nightStartAt)}
              onChosen={(zone) => {
                setChosenZone(zone);
                setZoneSaved(
                  say(locale, "placeTimeZoneSaved", {
                    place: zonedPlace?.name ?? "",
                    zone,
                  }),
                );
              }}
            />
          ) : null}
          {zoneSaved ? (
            <p
              className="session-time-zone-saved"
              role="status"
              data-testid="place-time-zone-saved"
            >
              {zoneSaved}
            </p>
          ) : null}
          <p className="night-detail-line session-chips">
            <span className="night-detail-status session-outcome is-toDebrief">
              {outcomeLabel("toDebrief", locale)}
            </span>
          </p>
        </div>
      </header>

      <StaleDeviceBanner
        locale={locale}
        staleDevices={queueEntry?.staleDevices}
        timeZone={timeZone}
      />

      <form onSubmit={handleSubmit} className="debrief-form">
        {versions?.length === 2 && (
          <VersionChoice
            locale={locale}
            versions={versions}
            timeZone={timeZone}
            webDate={formatVersionDate(
              versions.find((version) => version.origin === "web")?.createdAt,
              locale,
              timeZone,
            )}
            fieldDate={formatVersionDate(
              versions.find((version) => version.origin === "field")
                ?.createdAt || versions[0]?.createdAt,
              locale,
              timeZone,
            )}
            value={baseVersion}
            onChange={(version) => {
              setBaseVersion(version.base);
              setSetAsideVersionId(
                version.base === "set_aside" ? version.versionId : null,
              );
            }}
          />
        )}

        <section
          className="night-card debrief-outcomes"
          role="radiogroup"
          aria-labelledby="debrief-outcome-title"
        >
          <h2 id="debrief-outcome-title">
            {message(locale, "debriefOutcomeLegend")}
          </h2>
          <div className="debrief-outcome-grid">
            {Object.keys(OUTCOME_KEYS).map((candidate) => (
              <label
                key={candidate}
                className={`debrief-outcome-option${outcome === candidate ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="debrief-outcome"
                  value={candidate}
                  checked={outcome === candidate}
                  onChange={() => setOutcome(candidate)}
                />
                <span>
                  <strong>
                    {message(
                      locale,
                      `debriefOutcome${OUTCOME_KEYS[candidate]}Title`,
                    )}
                  </strong>
                  <small>
                    {message(
                      locale,
                      `debriefOutcome${OUTCOME_KEYS[candidate]}Description`,
                    )}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {executedNeedsApp ? (
            <p className="debrief-error" role="status">
              {message(locale, "debriefMomentExecutedNeedsApp")}
            </p>
          ) : null}
        </section>

        {shownFrise && outcome !== "abandoned" ? (
          <>
            <SessionFrise
              locale={locale}
              frise={shownFrise}
              timeZone={timeZone}
              title={message(locale, "debriefMomentRecorded")}
              // « Modifier » on the sheet of an incident,
              // as on the report's own line.
              onEditEvent={
                summaryMode && canAddEvent
                  ? (report) => setEventDialog({ kind: "edit-report", report })
                  : null
              }
            />
          </>
        ) : null}
        {outcome !== "abandoned" && summaryMode ? (
          <SessionInstrument
            locale={locale}
            events={summaryInput?.events ?? []}
            timeZone={timeZone}
            chart={false}
          />
        ) : null}
        {outcome !== "abandoned" ? (
          <SessionDevices
            locale={locale}
            lines={deviceLines}
            timeZone={timeZone}
          />
        ) : null}

        {outcome === "abandoned" ? (
          <section className="night-card debrief-reason">
            <h2>{message(locale, "debriefTargetReasonLabel")}</h2>
            <ReasonChips locale={locale} value={reason} onChange={setReason} />
          </section>
        ) : (
          <section className="night-card debrief-moment-targets">
            <h2>
              {outcome === "executed"
                ? message(locale, "debriefMomentPromise")
                : message(locale, "sessionPageTargetsTitle")}
            </h2>
            {outcome === "executed" ? (
              <ul className="debrief-moment-promise">
                {rows
                  .filter((row) => row.kind === "planned")
                  .map((row) => (
                    <li key={row.key}>
                      {thumbnailOf(row)}
                      <strong>{labelOfRow(row)}</strong>
                      {plannedLine(row) ? (
                        <span className="night-row-muted">
                          {" · "}
                          {plannedLine(row)}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <ul className="debrief-moment-list">
                {shown.map((row) => (
                  <MomentTargetRow
                    key={row.key}
                    locale={locale}
                    row={row}
                    label={labelOfRow(row)}
                    thumbnail={thumbnailOf(row)}
                    planned={row.kind === "planned" ? plannedLine(row) : null}
                    plannedShooting={
                      row.kind === "planned"
                        ? plannedShootingText(frozenByItem[row.itemId], locale)
                        : null
                    }
                    visual={visual}
                    noTime={noTimeItems.has(row.itemId)}
                    reports={reportsOf(row)}
                    reportActions={reportActions}
                    onChange={(patch) => changeRow(row.key, patch)}
                    onRemove={() =>
                      row.kind === "added"
                        ? setRows((current) =>
                            current.filter((entry) => entry.key !== row.key),
                          )
                        : setRemoving(row)
                    }
                    onRestore={() =>
                      changeRow(row.key, { removed: false, result: "done" })
                    }
                  />
                ))}
              </ul>
            )}
            {outcome === "partial" && looseReports.length ? (
              <div className="debrief-moment-whole-night">
                <h3 className="session-card-title">
                  {message(locale, "sessionPageWholeNightTitle")}
                </h3>
                <ul className="session-reports">
                  {looseReports.map((report) => (
                    <ReportLine
                      key={report.id}
                      report={report}
                      locale={locale}
                      actions={reportActions(report)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {multiNight ? (
              <p className="night-card-line">
                {message(locale, "debriefMultiNightNoPhoto")}
              </p>
            ) : null}
            {summaryMode && projects?.DebriefLink ? (
              <projects.DebriefLink
                locale={locale}
                plan={plan}
                summary={summary}
                confirmed={false}
              />
            ) : null}
            {editable ? (
              <div className="btn-row debrief-moment-adders">
                {TargetsPicker ? (
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() => setAdding((open) => !open)}
                  >
                    {message(locale, "sessionPageAddTarget")}
                  </button>
                ) : null}
                {canAddEvent ? (
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() => setEventDialog({ kind: "add" })}
                  >
                    {message(locale, "sessionPageAddEvent")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {editable && adding && TargetsPicker ? (
              <div className="debrief-add-panel">
                <TargetsPicker
                  locale={locale}
                  sessionId={null}
                  visibleFor={{
                    planPlace: plan?.payload?.location ?? null,
                    recordedPlace: null,
                    date: plan?.payload?.date ?? null,
                    start: summaryInput?.window?.start ?? null,
                    end: summaryInput?.window?.end ?? null,
                    darkness: plan?.payload?.darkness,
                  }}
                  excludeIds={rows.map((row) => row.targetId)}
                  onPick={(target) => {
                    setAddedNames((current) => ({
                      ...current,
                      [target.id]: target.designation,
                    }));
                    setRows((current) => [
                      ...current,
                      addedMomentRow({ targetId: target.id, base, timeZone }),
                    ]);
                    setAdding(false);
                  }}
                />
              </div>
            ) : null}
          </section>
        )}

        <section className="night-card session-astro-sync">
          <span className="session-astro-sync-glyph">
            <BarsGlyph />
          </span>
          <div className="session-astro-sync-body">
            <p>{message(locale, "sessionPageAstroSyncComplete")}</p>
            <a
              className="btn-link"
              href={astroSyncDownloadUrl(locale)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {message(locale, "sessionPageAstroSyncDiscover")}
            </a>
          </div>
        </section>

        {error && (
          <p className="debrief-error" role="alert">
            {error}
          </p>
        )}

        <div className="debrief-moment-actions">
          <a className="btn-link" href={`/${locale}/sessions`}>
            {message(locale, "debriefMomentLater")}
          </a>
          <button
            type="submit"
            className="btn-primary"
            disabled={!outcome || submitting || leaving || executedNeedsApp}
          >
            {submitting
              ? message(locale, "debriefSubmitting")
              : outcome === "abandoned"
                ? message(locale, "debriefMomentConfirmNotExecuted")
                : message(locale, "debriefMomentCreateSession")}
          </button>
        </div>
      </form>

      {eventDialog?.kind === "add" ? (
        <AddEventDialog
          locale={locale}
          cards={eventTargets}
          windowStart={eventWindow.start}
          windowEnd={eventWindow.end}
          timeZone={timeZone}
          onClose={() => setEventDialog(null)}
          onAdd={(event) => {
            setEventDraft((current) => ({
              ...current,
              added: [...current.added, { id: draftEventId(), ...event }],
            }));
            setEventDialog(null);
          }}
        />
      ) : null}
      {eventDialog?.kind === "move" ? (
        <MoveReportDialog
          locale={locale}
          cards={eventTargets}
          current={eventDialog.report.targetKey}
          onClose={() => setEventDialog(null)}
          onMove={(targetKey) => {
            setEventDraft((current) =>
              moveReport(current, eventDialog.report, targetKey),
            );
            setEventDialog(null);
          }}
        />
      ) : null}
      {eventDialog?.kind === "edit-report" ? (
        <AddEventDialog
          locale={locale}
          cards={eventTargets}
          windowStart={eventWindow.start}
          windowEnd={eventWindow.end}
          timeZone={timeZone}
          initial={reportForm(
            eventDialog.report,
            detectedSentence(eventDialog.report, locale, timeZone),
          )}
          detected={eventDialog.report.detected === true}
          detectedReport={eventDialog.report}
          onClose={() => setEventDialog(null)}
          onAdd={(form) => {
            setEventDraft((current) =>
              editReport(current, eventDialog.report, form),
            );
            setEventDialog(null);
          }}
        />
      ) : null}
      {removing ? (
        <RemoveTargetDialog
          locale={locale}
          label={labelOfRow(removing)}
          slot={planItemSlot(itemOf(removing), nightStartAt)}
          initialReason={removing.reason}
          timeZone={timeZone}
          onCancel={() => setRemoving(null)}
          onConfirm={(chosen) => {
            changeRow(removing.key, {
              removed: true,
              result: "skipped",
              reason: chosen,
            });
            setRemoving(null);
          }}
        />
      ) : null}
    </main>
  );
}
