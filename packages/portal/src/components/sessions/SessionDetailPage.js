"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { message } from "portal/i18n.js";
import { InfoButton, InfoLine } from "../dialog/InfoButton.js";
import { headerStale } from "../header-refresh.js";
import { StatusTag } from "../status/StatusTag.js";
import { SessionDeleteDialog } from "./JournalSessionMenu.js";
import { WebConfirmDialog, WebDialog } from "../dialog/WebDialog.js";
import { debriefTimeZone, formatSessionInstant } from "./debrief-decision.js";
import { journalEntries } from "./journal-rows.js";
import { NightFieldCard, NightNotesCard } from "./NightFieldEditor.js";
import { NightGuidingSection } from "./NightGuidingChart.js";
import { SessionGuidingSection } from "./SessionGuiding.js";
import { SessionPosesSection } from "./SessionPoses.js";
import { NightQualitySection } from "./NightQualityCharts.js";
import { NightStepsTable } from "./NightStepsTable.js";
import {
  equipmentLine,
  framesText,
  hasGuiding,
  integrationText,
  nightDateOf,
  say,
  stepsTotal,
  utcClock,
  utcDay,
  utcShortDay,
} from "./night-detail-view.js";
import { clockText, durationText } from "../../written-forms.js";
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
import { astroSyncDownloadUrl } from "../../captures/astro-sync-link.js";
import { managePath } from "../manage/manage-copy.js";
import {
  nightPassages,
  nightSkipGaps,
  sessionCards,
  sessionFigures,
  sessionFrise,
  sessionFromKind,
  sessionOutcomeKind,
  REPORT_KINDS,
  sessionReports,
  UNKNOWN_REPORT_KIND,
  wholeNightReports,
} from "./session-page-model.js";
import {
  detectedSentence,
  figureRows,
  notExecutedLine,
  originLine,
  outcomeLabel,
  deviceLineText,
  outcomeTone,
  photoAnswerOf,
  REPORT_KIND_KEY,
  sessionHours,
  sessionSendingState,
  sessionHeading,
} from "./session-page-view.js";
import { SessionFrise } from "./SessionFrise.js";
import { SessionDevices } from "./SessionDevices.js";
import { sessionDeviceLines } from "./session-device-lines.js";
import {
  SessionInstrument,
  instrumentTargetLine,
  withoutInstrumentSamples,
} from "./SessionInstrument.js";
import { sessionInstrumentSummary } from "./session-instrument-lines.js";
import { isDeviceEventType } from "../../session-events/device-event-types.js";
import { SessionPhotoSender } from "./SessionPhotoSender.js";
import { SessionQualityCard } from "./SessionQualityCard.js";
import {
  BarsGlyph,
  BinGlyph,
  PencilGlyph,
  ReportLine,
  SessionTargetCard,
} from "./SessionTargetCard.js";
import { RemoveTargetDialog } from "./RemoveTargetDialog.js";
import {
  AddEventDialog,
  AddTargetDialog,
  EditTargetDialog,
  MoveReportDialog,
} from "./SessionReworkDialogs.js";
import {
  applyDraft,
  draftChanged,
  draftEventId,
  dropTarget,
  editReport,
  moveReport,
  reportForm,
  revertReport,
  seenByNight,
  emptyDraft,
  heldOrder,
  moveTarget,
  reportIsEditable,
  reportIsRemovable,
  reworkBody,
  stepTarget,
} from "./session-rework.js";
import { clockValue } from "./debrief-moment.js";
import { postJson, requestJson, responseData } from "./portal-fetch.js";
import { SessionPackageImportDialog } from "./SessionPackageImportDialog.js";

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

function statusLabel(status, locale) {
  if (status === "open") return message(locale, "debriefStatusOpen");
  if (status === "paused") return message(locale, "debriefStatusPaused");
  return message(locale, "debriefStatusFinished");
}

function timingLabel(timing, locale) {
  if (timing === "observed") return message(locale, "debriefTimingObserved");
  if (timing === "planned") return message(locale, "debriefTimingPlanned");
  if (timing === "reconstructed")
    return message(locale, "debriefTimingReconstructed");
  return null;
}

const EVENT_TYPE_KEY = {
  note: "debriefEventNote",
  target_started: "debriefEventTargetStarted",
  target_finished: "debriefEventTargetFinished",
  target_skipped: "debriefEventTargetSkipped",
  pause: "debriefEventPause",
  resume: "debriefEventResume",
  condition: "debriefEventCondition",
  equipment_issue: "debriefEventEquipmentIssue",
  auto_time_confirmed: "debriefEventAutoTimeConfirmed",
  // The plan changed while the night ran.
  plan_edited: "debriefEventPlanEdited",
  // GUIDED-EVENING-04: a guided evening ran under the night.
  guided_evening: "debriefEventGuidedEvening",
};

/**
 * The name of an event type in the journal list. The four kinds Astro Sync
 * detects take the name of their legend; a type this version does not know (a
 * newer service wrote it) is « Signalement », never « Note ».
 */
export function eventTypeLabel(type, locale) {
  if (EVENT_TYPE_KEY[type]) return message(locale, EVENT_TYPE_KEY[type]);
  // The pointing devices' events, under the name of their section.
  if (isDeviceEventType(type)) return message(locale, "sessionDevicesTitle");
  const kind = REPORT_KINDS[type] ?? UNKNOWN_REPORT_KIND;
  return message(locale, REPORT_KIND_KEY[kind]).replace(/^./u, (letter) =>
    letter.toLocaleUpperCase(locale),
  );
}

/** An event of the journal list as the report the sentences read. */
const eventAsReport = (event) => ({
  kind: REPORT_KINDS[event.type] ?? UNKNOWN_REPORT_KIND,
  at: Date.parse(event.recordedAt),
  payload: event.payload ?? {},
});

/**
 * One equipment "slot" (telescope/camera/eyepiece/modifier)'s own display
 * value: the name of the catalogue or inventory id it stores
 * (`telescopeId: "askar-50p"`), else the id itself. Nothing chosen (`null`)
 * and `"none"` are "nothing to show".
 */
function equipmentSlotValue(equipment, idKey, equipmentNames) {
  const id = equipment?.[idKey];
  if (!id || id === "none") return null;
  return equipmentNames[id] || String(id);
}

/**
 * The equipment line of a visual night read through its plan (the night's
 * own equipment has no eyepiece): « Visuel · <oculaire> ». Empty for an imaging
 * night.
 */
function visualPlanLine(plan, names, locale) {
  const equipment = plan?.equipment;
  if (equipment?.mode !== "visual") return "";
  return [
    message(locale, "debriefEquipmentModeVisual"),
    equipmentSlotValue(equipment, "telescopeId", names),
    equipmentSlotValue(equipment, "eyepieceId", names),
  ]
    .filter(Boolean)
    .join(" · ");
}

const SKIP_REASON_KEY = {
  weather: "debriefReasonWeather",
  equipment: "debriefReasonEquipment",
  time: "debriefReasonTime",
  visibility: "debriefReasonVisibility",
  other: "debriefReasonOther",
};

/**
 * What a `plan_edited` event says, one sentence per kind of change — « Ajoutées
 * au plan : M45 (02:54 → 03:54) », « Déplacées : NGC 253 (03:14 → 03:34) ».
 * `hourAt(minute)` turns a slot's minute (counted from the start of the night
 * of the plan) into the place's hour; without it (the plan's night is unknown)
 * the slot is left out and the names stand alone.
 */
export function planEditedLines(
  payload,
  locale,
  titleOf = (id) => id,
  hourAt = null,
) {
  const nameOf = (entry) =>
    entry.targetLabel ||
    (entry.targetId ? titleOf(entry.targetId) : entry.planItemId || "");
  const slotOf = (entry) => {
    if (
      !hourAt ||
      !Number.isFinite(entry.startMinute) ||
      !Number.isFinite(entry.endMinute)
    )
      return "";
    return ` (${hourAt(entry.startMinute)} → ${hourAt(entry.endMinute)})`;
  };
  const say = (key, entries, withSlot) =>
    Array.isArray(entries) && entries.length
      ? fillTemplate(message(locale, key), {
          targets: entries
            .map((entry) => `${nameOf(entry)}${withSlot ? slotOf(entry) : ""}`)
            .join("; "),
        })
      : null;
  return [
    say("debriefPlanEditedAdded", payload?.added, true),
    say("debriefPlanEditedRemoved", payload?.removed, false),
    say("debriefPlanEditedMoved", payload?.moved, true),
  ].filter(Boolean);
}

const GUIDED_MODE_KEY = {
  naked: "debriefGuidedModeNaked",
  binoculars: "debriefGuidedModeBinoculars",
  tripod: "debriefGuidedModeTripod",
  mount: "debriefGuidedModeMount",
  smartTelescope: "debriefGuidedModeSmart",
};

const GUIDED_HELP_KEY = {
  aim: "debriefGuidedHelpAim",
  refine: "debriefGuidedHelpRefine",
};

/**
 * GUIDED-EVENING-04: what a `guided_evening` event says, as the phone's
 * Journal card does — « Les dix étoiles les plus brillantes · sur pied, aide
 * au pointage · étapes vues : 7 sur 10 · 1 h 05 · pour les enfants ». A field
 * this version does not know is left out (the payload is versioned).
 */
export function guidedEveningLine(payload, locale) {
  const mode = GUIDED_MODE_KEY[payload?.mode]
    ? message(locale, GUIDED_MODE_KEY[payload.mode])
    : null;
  const help = GUIDED_HELP_KEY[payload?.help]
    ? message(locale, GUIDED_HELP_KEY[payload.help])
    : null;
  const steps =
    Number.isInteger(payload?.stepsSeen) && Number.isInteger(payload?.stepCount)
      ? fillTemplate(message(locale, "debriefGuidedSteps"), {
          seen: payload.stepsSeen,
          total: payload.stepCount,
        })
      : null;
  const minutes = Number.isFinite(payload?.durationMinutes)
    ? payload.durationMinutes
    : Number.isFinite(Date.parse(payload?.finishedAt ?? "")) &&
        Number.isFinite(Date.parse(payload?.startedAt ?? ""))
      ? Math.max(
          0,
          (Date.parse(payload.finishedAt) - Date.parse(payload.startedAt)) /
            60000,
        )
      : null;
  return [
    payload?.title || payload?.evening || null,
    [mode, help].filter(Boolean).join(", ") || null,
    steps,
    minutes === null ? null : durationText(minutes, locale),
    payload?.kids === true ? message(locale, "debriefGuidedKids") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A short, human line for an event's own payload — the registry's fields, plainly said. */
export function eventDetail(
  event,
  locale,
  titleOf = (id) => id,
  hourAt = null,
  zone = null,
) {
  const payload = event.payload || {};
  const target =
    payload.targetLabel ||
    (payload.targetId ? titleOf(payload.targetId) : null);
  switch (event.type) {
    case "note":
      return [target, payload.text].filter(Boolean).join(" — ");
    case "target_started":
    case "target_finished":
      // A start or finish the device's clock wrote in automatic mode says
      // so (`auto: true`); a start in manual mode says that the target
      // waited for the observer's gesture.
      return [
        target,
        payload.auto === true ? message(locale, "debriefEventAutoMark") : null,
        payload.advance === "manual"
          ? message(locale, "debriefEventAdvanceManual")
          : null,
        payload.notes,
      ]
        .filter(Boolean)
        .join(" — ");
    case "auto_time_confirmed":
      return target || "";
    case "plan_edited":
      return planEditedLines(payload, locale, titleOf, hourAt).join(" — ");
    case "guided_evening":
      return guidedEveningLine(payload, locale);
    case "target_skipped":
      return [
        target,
        payload.reason
          ? message(locale, SKIP_REASON_KEY[payload.reason])
          : null,
        payload.notes,
      ]
        .filter(Boolean)
        .join(" — ");
    case "pause":
      return payload.reason || "";
    case "resume":
      return payload.note || "";
    case "condition":
      return [
        payload.sky,
        Number.isFinite(payload.seeing) ? `seeing ${payload.seeing}/5` : null,
        Number.isFinite(payload.transparency)
          ? `transparency ${payload.transparency}/5`
          : null,
        payload.notes,
      ]
        .filter(Boolean)
        .join(" — ");
    case "equipment_issue":
      return [payload.description, payload.severity]
        .filter(Boolean)
        .join(" — ");
    case "exposure_change":
    case "guiding_timeouts":
    case "sensor_temperature_drift":
    case "guiding_spikes":
      return detectedSentence(eventAsReport(event), locale, zone) ?? "";
    default:
      if (isDeviceEventType(event.type)) {
        // The sentence of the line this event alone makes.
        const [line] = sessionDeviceLines([event]);
        return line ? deviceLineText(line, locale) : "";
      }
      return typeof payload.description === "string" ? payload.description : "";
  }
}

function SupplementCard({ locale, sessionId, supplement, onDecided }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (supplement.status !== "proposed") return null;
  const decide = async (decision) => {
    setBusy(true);
    setError("");
    try {
      const payload = await responseData(
        await postJson(
          `/api/v1/sessions/${encodeURIComponent(sessionId)}/supplements/${encodeURIComponent(supplement.id)}`,
          { decision },
        ),
        message(locale, "debriefErrorGeneric"),
      );
      onDecided(payload.supplement);
    } catch (decisionError) {
      setError(decisionError.message || message(locale, "debriefErrorGeneric"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="debrief-supplement-card">
      <p>
        {fillTemplate(message(locale, "debriefSupplementPrompt"), {
          device: supplement.deviceLabel || "",
        })}
      </p>
      <div className="debrief-supplement-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => decide("accept")}
        >
          {message(locale, "debriefSupplementAccept")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => decide("dismiss")}
        >
          {message(locale, "debriefSupplementDismiss")}
        </button>
      </div>
      {error && (
        <p className="debrief-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The source of the measures (5 and 6): who sent them and when, an ⓘ,
 * « Remplacer par une nouvelle analyse » (a tertiary: a dialog that names
 * Astro Sync, the replacement happens when the new sending arrives) and
 * « Supprimer cette analyse » (a tertiary in the destructive tint, confirmed
 * by the dialog's primary in the same tint, rule 4) — one zone, two
 * tertiaries, no primary.
 */
export function MeasuresSourceBar({
  locale = "en",
  sessionId,
  meta,
  onDeleted = () => {},
  remove = null,
}) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sent = meta?.sentAt ?? null;
  const values = {
    date: utcDay(sent, locale),
    time: utcClock(sent),
    device: meta?.deviceName ?? "",
  };
  const line =
    meta?.producer === "import"
      ? say(locale, "nightPageMeasuresImported", values)
      : meta?.deviceName
        ? say(locale, "nightPageMeasuresFrom", values)
        : say(locale, "nightPageMeasuresFromNoDevice", values);
  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      if (remove) await remove();
      else {
        const response = await requestJson(
          `/api/v1/sessions/${encodeURIComponent(sessionId)}/analyses`,
          { method: "DELETE" },
        );
        if (!response.ok)
          await responseData(response, message(locale, "nightPageSaveFailed"));
      }
      setDialog(null);
      await onDeleted();
    } catch {
      setError(message(locale, "nightPageSaveFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="night-card night-source"
      aria-label={message(locale, "nightPageMeasuresLabel")}
    >
      <span className="night-source-glyph">
        <BarsGlyph />
      </span>
      <p className="night-source-text">{line}</p>
      <InfoButton
        locale={locale}
        label={message(locale, "nightPageMeasuresInfoLabel")}
        title={message(locale, "nightPageMeasuresLabel")}
        body={message(locale, "nightPageMeasuresInfo")}
      />
      <div className="night-source-actions">
        <button
          type="button"
          className="btn-tertiary"
          onClick={() => setDialog("replace")}
        >
          {message(locale, "nightPageReplaceAnalysis")}
        </button>
        <button
          type="button"
          className="btn-tertiary is-destructive"
          onClick={() => setDialog("delete")}
        >
          {message(locale, "nightPageDeleteAnalysis")}
        </button>
      </div>
      {error ? (
        <p className="debrief-error" role="alert">
          {error}
        </p>
      ) : null}
      {dialog === "replace" ? (
        <WebDialog
          className="info-dialog"
          bodyClassName="info-dialog-body"
          closeLabel={message(locale, "infoClose")}
          closeOnBackdrop
          focusTitle
          title={message(locale, "nightPageReplaceTitle")}
          onClose={() => setDialog(null)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setDialog(null)}
            >
              {message(locale, "infoClose")}
            </button>
          }
        >
          <p className="info-dialog-text">
            {message(locale, "nightPageReplaceBody")}
          </p>
        </WebDialog>
      ) : null}
      {dialog === "delete" ? (
        <WebConfirmDialog
          busy={busy}
          title={message(locale, "nightPageDeleteAnalysisTitle")}
          description={message(locale, "nightPageDeleteAnalysisBody")}
          cancelLabel={message(locale, "nightPageCancel")}
          confirmLabel={message(locale, "nightPageDeleteAnalysisConfirm")}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  );
}

/** A folded section of « Détails de la nuit »: its title, one line, and what the old page held. */
function Fold({ id, title, hint, open, onToggle, children }) {
  return (
    <details
      className="night-card night-fold"
      id={id}
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
    >
      <summary>
        <span className="night-fold-title">
          <strong>{title}</strong>
          {hint ? <span className="night-row-muted">{hint}</span> : null}
        </span>
      </summary>
      <div className="night-fold-body">{children}</div>
    </details>
  );
}

/**
 * The message of Astro Sync under the page: the invitation until the night was
 * analysed, then what it did (`sessionAstroSyncDone`) with « Envoyer de nouveau
 * depuis Astro Sync » that opens the instructions of « Remplacer par une nouvelle
 * analyse ».
 */
export function SessionAstroSyncMessage({
  locale = "en",
  meta = null,
  fromAstroSync = false,
}) {
  const [dialog, setDialog] = useState(false);
  const done = Boolean(meta?.sentAt);
  // The invitation to discover Astro Sync is not made to a person whose night
  // Astro Sync created and sent.
  if (fromAstroSync && !done) return null;
  return (
    <section className="night-card session-astro-sync">
      <span className="session-astro-sync-glyph">
        <BarsGlyph />
      </span>
      <div className="session-astro-sync-body">
        <p>
          {done
            ? say(locale, "sessionPageAstroSyncDone", {
                date: utcShortDay(meta.sentAt, locale),
                device: meta.deviceName ?? "",
              })
            : message(locale, "sessionPageAstroSyncComplete")}
        </p>
        {done ? (
          <button
            type="button"
            className="btn-link"
            onClick={() => setDialog(true)}
          >
            {message(locale, "sessionPageAstroSyncAgain")}
          </button>
        ) : (
          <a
            className="btn-link"
            href={astroSyncDownloadUrl(locale)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {message(locale, "sessionPageAstroSyncDiscover")}
          </a>
        )}
      </div>
      {dialog ? (
        <WebDialog
          className="info-dialog"
          bodyClassName="info-dialog-body"
          closeLabel={message(locale, "infoClose")}
          closeOnBackdrop
          focusTitle
          title={message(locale, "nightPageReplaceTitle")}
          onClose={() => setDialog(false)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setDialog(false)}
            >
              {message(locale, "infoClose")}
            </button>
          }
        >
          <p className="info-dialog-text">
            {message(locale, "nightPageReplaceBody")}
          </p>
        </WebDialog>
      ) : null}
    </section>
  );
}

/**
 * The page of a session: the head — where the session
 * comes from, the night (« Nuit du 7 au 8 oct. »), the place, the hours in UTC,
 * the equipment, the outcome —, the figures, **the frise** of the night with
 * the reports on their target, **a card per target** (the plan's promise, what
 * the night gave, the final photo and its send button), « Qualité des
 * captures », the message of Astro Sync, then **everything the old page held**
 * under « Détails de la nuit », in folded sections (« La nuit » field by field,
 * the steps, the quality and guiding in detail, the notes, the journal). Hours
 * in UTC (the rule of the place without a time zone). No JSON and no
 * identifier on screen.
 *
 * `targets` are the service's (`GET /v1/sessions/{id}`): the order of the
 * night, the figures, the final photo of each. `readOnly`: a night read from
 * the operator's catalogue on a private server, of origin « importée » — no
 * send, no rework.
 */
export function SessionDetailPage({
  locale = "en",
  sessionId,
  session: initialSession,
  supplements: initialSupplements = [],
  events: initialEvents,
  targets: initialTargets = [],
  plan,
  analysis: initialAnalysis = null,
  debriefSummary = null,
  nightData = null,
  online = null,
  captureCards = {},
  targetNames = {},
  equipmentNames = {},
  equipmentOptions = [],
  places = [],
  spacePlaces = [],
  TargetsPicker = null,
  fieldsNotice = null,
  planRow = null,
  planStatus = null,
  readOnly = false,
}) {
  const [supplements, setSupplements] = useState(initialSupplements);
  const [importOpen, setImportOpen] = useState(false);
  const [data, setData] = useState(nightData);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [analysisMeta, setAnalysisMeta] = useState(online?.analysis ?? null);
  const [names, setNames] = useState(targetNames);
  const [session, setSession] = useState(initialSession);
  const [events, setEvents] = useState(initialEvents);
  const [targets, setTargets] = useState(initialTargets);
  const [sending, setSending] = useState(null);
  const [answers, setAnswers] = useState({});
  const [sent, setSent] = useState({});
  const [folds, setFolds] = useState({});
  const [draft, setDraft] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const router = useRouter();
  const [dragKey, setDragKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  // The zone the person chose on this page, and where it was kept.
  const [chosenZone, setChosenZone] = useState(null);
  const [zoneSaved, setZoneSaved] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const handleFocus = useRef(null);
  // The arrow keys move a card in the list: its handle keeps the focus (the
  // cards are reordered in the document, which can drop it).
  const orderSignature = draft ? heldOrder(draft).join("\u0000") : "";
  useEffect(() => {
    const key = handleFocus.current;
    if (!key) return;
    handleFocus.current = null;
    [...document.querySelectorAll(".session-card-handle")]
      .find(
        (node) => node.closest("[data-target-id]")?.dataset.targetId === key,
      )
      ?.focus();
  }, [orderSignature]);

  const night = data?.night ?? null;
  // A night at the eyepiece: nothing is acquired, no frame is taken, the
  // words are the eyepiece's.
  const visualNight =
    plan?.equipment?.mode === "visual" ||
    night?.equipment?.value?.mode === "visual";
  const steps = data?.steps ?? [];
  // A target met in the field has no plan item to name it: the journal does.
  const eventTitles = {};
  for (const event of events?.events ?? [])
    if (event.payload?.targetId && event.payload?.targetLabel)
      eventTitles[event.payload.targetId] ??= event.payload.targetLabel;
  const titleOf = (targetId) =>
    names[targetId] ??
    plan?.targetTitles?.[targetId] ??
    eventTitles[targetId] ??
    targetId;
  const proposed = supplements.filter(
    (supplement) => supplement.status === "proposed",
  );
  const updateSupplement = (updated) =>
    setSupplements((current) =>
      current.map((supplement) =>
        supplement.id === updated.id ? updated : supplement,
      ),
    );

  /** Reads the session again after a change (its steps, figures and targets move with it). */
  async function reload() {
    if (readOnly) return;
    const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
    const detail = await responseData(
      await requestJson(base),
      message(locale, "nightPageSaveFailed"),
    );
    setData({
      night: detail.night,
      steps: detail.steps ?? [],
      qualitySummary: detail.qualitySummary ?? null,
      guidingSummary: detail.guidingSummary ?? null,
      guidingSeries: detail.guidingSeries ?? [],
      guidingTrace: detail.guidingTrace ?? null,
      posesSummary: detail.posesSummary ?? null,
      zone: detail.zone ?? null,
    });
    if (detail.session) setSession(detail.session);
    if (detail.events) setEvents(detail.events);
    if (detail.targets) setTargets(detail.targets);
    const answer = await requestJson(`${base}/analyses`);
    setAnalysis(answer.ok ? await answer.json() : null);
    if (!answer.ok) setAnalysisMeta(null);
  }

  // A sample of the instrument is no entry of the journal (about every 5
  // minutes): its facts are the card « Instrument ».
  const journal = withoutInstrumentSamples(
    journalEntries(events?.events ?? []),
  );
  const instrumentSummary = sessionInstrumentSummary(events?.events ?? []);
  const finishedAt = night?.finishedAt?.value ?? session.finishedAt ?? null;
  const startedAt = night?.startedAt?.value ?? session.startedAt;
  const passages = nightPassages(events?.events ?? [], finishedAt);
  const skipGaps = nightSkipGaps(events?.events ?? []);
  const bounds = { start: startedAt, end: finishedAt ?? startedAt };
  const placeName = night?.place?.value?.name ?? null;
  // The hours are the place's. The service gives a session's place no
  // zone; it is found in the plan's copy, in the places of the space, then
  // read from the table by the position — UTC only when none can be read, and
  // the page says so.
  const sessionPlace = sessionPlaceWithZone(
    night?.place?.value,
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
  // The frise reads the hours of the place (UTC without a zone).
  const placeTimeZone = debriefTimeZone(zoneResolved.timeZone);
  // A slot of a `plan_edited` event is minutes after the plan's night start;
  // the journal says it in the place's hours.
  const planNightStart = Date.parse(plan?.nightStartAt ?? "");
  const journalHourAt = Number.isFinite(planNightStart)
    ? (minute) =>
        clockValue(planNightStart + Math.round(minute) * 60000, placeTimeZone)
    : null;
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
    // The zone read by the table is kept in the place of the space, read again
    // by the service from the exact boundaries; the page reads on.
    if (zoneToRepair) repairPlaceTimeZone(zoneToRepair).catch(() => {});
    // Once per page: the place of the space is written, not this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(zoneToRepair)]);
  const nightDate =
    session.eveningDate ??
    nightDateOf({
      planDate: plan?.date ?? null,
      startedAt,
      longitude: night?.place?.value?.longitude ?? null,
    });
  // « Session · Nuit du 14 au 15 oct. » (the night is the title; the
  // plan it comes from is the link under it).
  // The name the person gave to the session, when one was
  // given, with the night under it.
  const heading = sessionHeading({ night, eveningDate: nightDate, locale });
  const title = heading.title ?? message(locale, "sessionPageNoPlan");
  const fromKind = sessionFromKind(session);
  const outcomeKind = sessionOutcomeKind(session);
  const report = analysis?.report ?? null;
  // The curve of the guiding (one point per 10 s) has its own section; a
  // night with only the RMS by slices of 2 minutes (an import of the old
  // portal) keeps its chart in « Qualité et guidage en détail ».
  const guidingTrace = data?.guidingTrace ?? null;
  const legacyGuiding =
    !(guidingTrace?.points?.length > 0) &&
    hasGuiding(data?.guidingSummary ?? null, data?.guidingSeries ?? []);
  const meta = analysisMeta?.present
    ? analysisMeta
    : analysis
      ? {
          present: true,
          sentAt: analysis.createdAt ?? report?.generatedAtUtc ?? null,
          deviceName: analysis.deviceName ?? null,
          producer: report?.producer ?? null,
        }
      : null;
  const reports = sessionReports({
    events: events?.events ?? [],
    passages,
    windowEnd: finishedAt,
  });
  // What the night's mount and pointing helps did.
  const deviceLines = sessionDeviceLines(events?.events ?? []);
  const cards = sessionCards({
    targets,
    debriefSummary,
    passages,
    skipGaps,
    reports,
    steps,
    captureCards: { ...captureCards, ...sent },
    titleOf,
    imported: readOnly,
    unpromised: plan?.blankExecution === true,
  });
  const frise = sessionFrise({
    cards,
    reports,
    windowStart: startedAt,
    windowEnd: finishedAt,
  });
  const figures = sessionFigures({
    cards,
    fwhmPixels: data?.qualitySummary?.night?.fwhmPixels ?? null,
  });
  const editing = draft !== null;
  // « Remanier la session »: the page shows the draft applied, nothing is
  // written until the person saves.
  const view = editing
    ? applyDraft({
        cards,
        reports,
        draft,
        sessionStart: startedAt,
        timeZone: placeTimeZone,
      })
    : { cards, reports, loose: wholeNightReports(reports, cards) };
  // In the rework the frise is the draft's: a target taken out is hatched,
  // one added is dashed, and each box held is a handle (`reorder`).
  const shownFrise = editing
    ? sessionFrise({
        cards: view.cards,
        reports: view.reports,
        windowStart: startedAt,
        windowEnd: finishedAt,
      })
    : frise;
  const shownFigures = editing
    ? sessionFigures({
        cards: view.cards,
        fwhmPixels: data?.qualitySummary?.night?.fwhmPixels ?? null,
      })
    : figures;
  const loose = view.loose;
  const canRework =
    !readOnly &&
    session.status === "finished" &&
    outcomeKind !== "toDebrief" &&
    cards.length > 0;
  const canDelete =
    !readOnly &&
    !editing &&
    session.status === "finished" &&
    !String(sessionId).startsWith("catalogue:");
  const canSend =
    !readOnly &&
    !editing &&
    session.status === "finished" &&
    fromKind !== "multiNight";
  const addNight = {
    sessionId,
    planId: session.planId ?? null,
    night: nightDate,
    place: placeName,
    targets: cards.map((card) => ({
      id: card.key,
      designation: card.label,
      name: null,
      outcome: card.outcome,
      integrationMinutes: null,
      captureCount: card.capture ? 1 : 0,
    })),
  };
  const fieldNotes = (events?.events ?? [])
    .filter((event) => event.type === "note" && event.payload?.text)
    .map((event) => ({
      eventId: event.eventId,
      recordedAt: event.recordedAt,
      target: event.payload.targetId
        ? titleOf(event.payload.targetId)
        : (event.payload.targetLabel ?? null),
      text: event.payload.text,
    }));
  const totals = stepsTotal(steps);
  const equipment =
    visualPlanLine(plan, equipmentNames, locale) ||
    equipmentLine(night?.equipment?.value, equipmentNames, locale);
  // The hours of the place when it has a time zone, else « UTC » written
  // once, at the end of the hours.
  const hours = sessionHours(startedAt, finishedAt, placeTimeZone);
  const headLine = [placeName, hours, equipment || null]
    .filter(Boolean)
    .join(" · ");
  // A note of the night written in the field or at the debriefing is a note:
  // the fold says so when the night's own notes are empty.
  const notesPreview = (
    night?.notes?.value ||
    fieldNotes[0]?.text ||
    ""
  ).trim();
  const setFold = (name) => (open) =>
    setFolds((current) => ({ ...current, [name]: open }));

  /** What the service answered to a photo of a target: the card says it. */
  function photoSent(card, outcome) {
    const capture = outcome?.capture ?? null;
    if (capture)
      setSent((current) => ({
        ...current,
        [capture.id]: {
          id: capture.id,
          stage: capture.stage,
          visibility: capture.visibility,
          thumbnail: Boolean(capture.thumbnail),
          preview: Boolean(capture.preview),
          state: capture.state?.teamLine
            ? { teamLine: capture.state.teamLine }
            : null,
        },
      }));
    setTargets((current) =>
      current.map((target) =>
        target.targetId === card.key && capture
          ? {
              ...target,
              captureId: capture.id,
              thumbnailUrl:
                capture.thumbnail || capture.preview
                  ? `/v1/captures/${capture.id}/media?variant=thumbnail`
                  : target.thumbnailUrl,
            }
          : target,
      ),
    );
    setAnswers((current) => ({
      ...current,
      [card.key]: photoAnswerOf(outcome),
    }));
    setSending(null);
  }

  function startRework() {
    setNotice("");
    setDraft(emptyDraft(cards));
    // The button stands at the foot of the page: the editing begins at the
    // cards, which are brought into view.
    requestAnimationFrame(() =>
      document
        .getElementById("session-cards-title")
        ?.scrollIntoView({ block: "start" }),
    );
  }
  /** The soft deletion; the Journal says where the session went. */
  async function deleteSession() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await responseData(
        await requestJson(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        }),
        message(locale, "sessionDeleteFailed"),
      );
      headerStale();
      router.push(`/${locale}/sessions?deleted=1`);
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  }
  function leaveRework() {
    setDraft(null);
    setDialog(null);
  }
  function cancelRework() {
    if (draftChanged(draft, cards)) setDialog({ kind: "leave" });
    else leaveRework();
  }
  const changeTarget = (key, changes) =>
    setDraft((current) => ({
      ...current,
      targets: current.targets.map((target) =>
        target.key === key ? { ...target, ...changes } : target,
      ),
    }));
  function removeReport(report) {
    setDraft((current) => {
      const moves = { ...current.moves };
      delete moves[report.id];
      return report.draft
        ? {
            ...current,
            moves,
            added: current.added.filter((event) => event.id !== report.id),
          }
        : {
            ...current,
            moves,
            removals: [...current.removals, ...report.ids],
          };
    });
  }
  /** « Enregistrer les changements »: one PUT, `If-Match` the revision read. */
  async function saveRework(next = draft) {
    setSaving(true);
    setNotice("");
    try {
      const response = await requestJson(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/rework`,
        {
          method: "PUT",
          body: reworkBody(next, {
            sessionStart: startedAt,
            timeZone: placeTimeZone,
          }),
          ifMatch: `"${session.reworkRevision ?? 0}"`,
        },
      );
      if (response.status === 409 || response.status === 404) {
        // Changed on another device: the page is read again, the changes are
        // to be taken up again (« Cette session a changé… »). A report that
        // was edited since, that cannot be, or that is gone says so.
        const refusal = await response.json().catch(() => null);
        const code = refusal?.error?.code ?? null;
        await reload();
        setDraft(null);
        setNotice(
          message(
            locale,
            code === "event_already_replaced"
              ? "sessionPageReworkEventReplaced"
              : code === "event_not_replaceable"
                ? "sessionPageReworkEventNotEditable"
                : code === "event_not_found"
                  ? "sessionPageReworkEventGone"
                  : "sessionPageReworkConflict",
          ),
        );
        return;
      }
      await responseData(response, message(locale, "nightPageSaveFailed"));
      await reload();
      setDraft(null);
    } catch {
      setNotice(message(locale, "nightPageSaveFailed"));
    } finally {
      setSaving(false);
    }
  }
  /** Puts a new order in the draft and says where the target now is (« NGC 7000 : 2 sur 4 »). */
  function reorderTo(next, key) {
    if (next === draft) return;
    setDraft(next);
    const order = heldOrder(next);
    const place = order.indexOf(key);
    const label = view.cards.find((card) => card.key === key)?.label ?? key;
    if (place >= 0)
      setAnnouncement(
        say(locale, "sessionPageReworkMoved", {
          target: label,
          place: place + 1,
          count: order.length,
        }),
      );
  }
  const dragPropsFor = (card) =>
    editing
      ? {
          item: {
            onDragOver: (event) => {
              if (dragKey) event.preventDefault();
            },
            onDrop: (event) => {
              event.preventDefault();
              if (dragKey)
                reorderTo(moveTarget(draft, dragKey, card.key), dragKey);
              setDragKey(null);
            },
          },
          handle: {
            draggable: true,
            role: "button",
            tabIndex: 0,
            onDragStart: (event) => {
              event.dataTransfer?.setData("text/plain", card.key);
              setDragKey(card.key);
            },
            onDragEnd: () => setDragKey(null),
            "aria-label": say(locale, "sessionPageReworkFriseBox", {
              target: card.label,
              place: heldOrder(draft).indexOf(card.key) + 1,
              count: heldOrder(draft).length,
            }),
            onKeyDown: (event) => {
              const step =
                event.key === "ArrowUp"
                  ? -1
                  : event.key === "ArrowDown"
                    ? 1
                    : 0;
              if (!step) return;
              event.preventDefault();
              handleFocus.current = card.key;
              reorderTo(stepTarget(draft, card.key, step), card.key);
            },
          },
        }
      : null;
  const reportActions = (report) =>
    editing ? (
      <span className="session-report-actions">
        {reportIsEditable(report) ? (
          <button
            type="button"
            className="btn-link"
            onClick={() => setDialog({ kind: "edit-report", report })}
          >
            {message(locale, "sessionPageEditReport")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-link"
          onClick={() => setDialog({ kind: "move", report })}
        >
          {message(locale, "sessionPageMoveReport")}
        </button>
        {report.replaced ? (
          <button
            type="button"
            className="btn-link"
            onClick={() => setDraft((current) => revertReport(current, report))}
          >
            {message(locale, "sessionPageRevertReport")}
          </button>
        ) : null}
        {reportIsRemovable(report) ? (
          <button
            type="button"
            className="night-icon-button night-icon-button-danger"
            aria-label={message(locale, "sessionPageReportDelete")}
            title={message(locale, "sessionPageReportDelete")}
            onClick={() => removeReport(report)}
          >
            <BinGlyph />
          </button>
        ) : null}
      </span>
    ) : null;
  const dialogRow = dialog?.key
    ? draft?.targets.find((target) => target.key === dialog.key)
    : null;
  const dialogCard = dialog?.key
    ? view.cards.find((card) => card.key === dialog.key)
    : null;

  return (
    <main className="debrief-session-detail night-detail session-page">
      <a className="btn-link debrief-back" href={`/${locale}/sessions`}>
        {message(locale, "debriefSessionDetailBack")}
      </a>
      <header className="night-detail-header">
        <div className="night-detail-heading">
          <h1>{title}</h1>
          {heading.nightLine ? (
            <p
              className="night-detail-line session-night-line"
              data-testid="session-night-line"
            >
              {heading.nightLine}
            </p>
          ) : null}
          {plan?.name && fromKind !== "noPlan" && !plan.blankExecution ? (
            <a
              className="night-detail-eyebrow session-origin"
              href={`/${locale}/planner?view=plans`}
            >
              {originLine(plan.name, locale)}
            </a>
          ) : null}
          {headLine ? <p className="night-detail-line">{headLine}</p> : null}
          {zoneUnresolved ? (
            <PlaceTimeZoneNotice
              locale={locale}
              place={zonedPlace}
              placeName={placeName ?? zonedPlace?.name ?? ""}
              at={new Date(startedAt)}
              onChosen={(zone) => {
                setChosenZone(zone);
                setZoneSaved(
                  say(locale, "placeTimeZoneSaved", {
                    place: placeName ?? zonedPlace?.name ?? "",
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
          {session.closedBy === "automatic" && finishedAt ? (
            <p
              className="night-detail-line night-detail-closed"
              data-testid="session-closed-automatically"
            >
              {say(locale, "sessionPageClosedAutomatically", {
                time:
                  placeTimeZone === "UTC"
                    ? `${utcClock(finishedAt)} UTC`
                    : clockText(finishedAt, placeTimeZone),
              })}
            </p>
          ) : null}
          <p className="night-detail-line session-chips">
            {session.status === "finished" && outcomeTone(outcomeKind) ? (
              <StatusTag
                tone={outcomeTone(outcomeKind)}
                locale={locale}
                session
                className="session-outcome"
                data-outcome={outcomeKind}
              />
            ) : (
              <span
                className={`night-detail-status session-outcome is-${
                  session.status === "finished" ? outcomeKind : session.status
                }`}
              >
                {session.status === "finished"
                  ? outcomeLabel(outcomeKind, locale)
                  : statusLabel(session.status, locale)}
              </span>
            )}
            {readOnly || session.origin === "import" ? (
              <span className="night-detail-status session-measured">
                {message(locale, "sessionPageImportedBadge")}
              </span>
            ) : null}
            {meta ? (
              <span className="night-detail-status session-measured">
                {message(locale, "sessionMeasuredBadge")}
              </span>
            ) : null}
          </p>
        </div>
        {readOnly || editing ? null : (
          <div className="night-detail-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setImportOpen(true)}
            >
              {message(locale, "sessionImportAction")}
            </button>
          </div>
        )}
      </header>

      {!readOnly && !editing && session.status === "finished" ? (
        <SessionSendingState
          locale={locale}
          state={sessionSendingState({
            outcomeKind,
            visual: visualNight,
            hasCaptures: targets.some((target) => target.captureId),
            hasLogs: Boolean(meta),
            fromAstroSync: session.origin === "astro-sync",
          })}
        />
      ) : null}
      {notice ? (
        <p className="session-rework-notice" role="alert">
          {notice}
        </p>
      ) : null}
      {editing ? (
        <p className="session-rework-hint" role="status">
          {message(locale, "sessionPageReworkHint")}
        </p>
      ) : null}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {readOnly ? (
        <p className="night-card-line session-imported-notice" role="note">
          {message(locale, "sessionPageImportedNotice")}
        </p>
      ) : null}

      {importOpen && (
        <SessionPackageImportDialog
          locale={locale}
          sessionId={sessionId}
          onClose={() => setImportOpen(false)}
        />
      )}

      {proposed.length > 0 && (
        <section
          className="debrief-panel"
          aria-labelledby="debrief-supplements-heading"
        >
          <h2 id="debrief-supplements-heading">
            {message(locale, "debriefSupplementsTitle")}
          </h2>
          <ul className="debrief-supplement-list">
            {proposed.map((supplement) => (
              <SupplementCard
                key={supplement.id}
                locale={locale}
                sessionId={sessionId}
                supplement={supplement}
                onDecided={updateSupplement}
              />
            ))}
          </ul>
        </section>
      )}

      {cards.length && outcomeKind !== "notExecuted" ? (
        <dl className="session-figures">
          {figureRows(shownFigures, locale, { visual: visualNight }).map(
            (figure) => (
              <div key={figure.key} className="session-figure">
                <dt>{figure.value}</dt>
                <dd>{figure.label}</dd>
              </div>
            ),
          )}
        </dl>
      ) : null}

      {outcomeKind === "notExecuted" ? (
        notExecutedLine(cards, locale) ? (
          <p className="night-card-line session-not-executed">
            {notExecutedLine(cards, locale)}
          </p>
        ) : null
      ) : (
        <SessionFrise
          locale={locale}
          frise={shownFrise}
          visual={visualNight}
          timeZone={placeTimeZone}
          // « Modifier » on the sheet of an incident — in
          // the rework it joins the draft, outside it is one correction sent
          // at once (the same replacement).
          onEditEvent={
            canRework
              ? (report) =>
                  setDialog({
                    kind: editing ? "edit-report" : "edit-report-now",
                    report,
                  })
              : null
          }
          reorder={
            editing
              ? {
                  order: heldOrder(draft),
                  onDrop: (key, overKey, after) =>
                    reorderTo(dropTarget(draft, key, overKey, after), key),
                  onStep: (key, step) =>
                    reorderTo(stepTarget(draft, key, step), key),
                }
              : null
          }
        />
      )}

      {view.cards.length || loose.length || editing ? (
        <section
          className="session-cards"
          aria-labelledby="session-cards-title"
        >
          <div className="night-section-head">
            <h2 id="session-cards-title">
              {message(locale, "sessionPageTargetsTitle")}
            </h2>
            {editing ? null : (
              <a className="btn-link" href={managePath(locale, "captures")}>
                {message(locale, "sessionPageSeeGallery")}
              </a>
            )}
          </div>
          {fromKind === "multiNight" ? (
            <p className="night-card-line">
              {message(locale, "debriefMultiNightNoPhoto")}
            </p>
          ) : null}
          <ul className="session-card-list">
            {view.cards.map((card) => (
              <SessionTargetCard
                key={card.key}
                locale={locale}
                card={card}
                visual={visualNight}
                timeZone={placeTimeZone}
                colour={shownFrise?.colours?.[card.key] ?? null}
                instrument={instrumentTargetLine(
                  instrumentSummary,
                  card,
                  locale,
                )}
                canSend={canSend}
                answer={answers[card.key] ?? null}
                onSend={() => setSending(card)}
                editing={editing}
                dragProps={dragPropsFor(card)}
                reportActions={reportActions}
                onEdit={() => setDialog({ kind: "edit", key: card.key })}
                onRemove={() =>
                  card.state === "added" && !seenByNight(card)
                    ? changeTarget(card.key, { removed: true })
                    : setDialog({ kind: "remove", key: card.key })
                }
                onRestore={() =>
                  changeTarget(card.key, { removed: false, reason: null })
                }
              />
            ))}
            {loose.length ? (
              <li className="session-card is-whole-night">
                <div className="session-card-body">
                  <h3 className="session-card-title">
                    {message(locale, "sessionPageWholeNightTitle")}
                  </h3>
                  <ul className="session-reports">
                    {loose.map((entry) => (
                      <ReportLine
                        key={entry.id}
                        report={entry}
                        locale={locale}
                        timeZone={placeTimeZone}
                        actions={reportActions(entry)}
                      />
                    ))}
                  </ul>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {editing || visualNight || legacyGuiding ? null : (
        <SessionGuidingSection
          locale={locale}
          guidingTrace={guidingTrace}
          summary={data?.guidingSummary ?? null}
          report={report}
          analysed={Boolean(report)}
          fromAstroSync={session.origin === "astro-sync"}
          bounds={bounds}
          zone={placeTimeZone}
        />
      )}
      {editing || visualNight ? null : (
        <SessionPosesSection
          locale={locale}
          summary={data?.posesSummary ?? null}
          report={report}
          guidingTrace={guidingTrace}
          bounds={bounds}
          zone={placeTimeZone}
        />
      )}
      {editing ? null : (
        <SessionInstrument
          locale={locale}
          events={events?.events ?? []}
          timeZone={placeTimeZone}
        />
      )}
      {editing ? null : (
        <SessionDevices
          locale={locale}
          lines={deviceLines}
          timeZone={placeTimeZone}
        />
      )}
      {editing ? (
        <>
          <div className="btn-row session-rework-adders">
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setDialog({ kind: "add-target" })}
            >
              {message(locale, "sessionPageAddTarget")}
            </button>
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setDialog({ kind: "event" })}
            >
              {message(locale, "sessionPageAddEvent")}
            </button>
          </div>
          <div className="session-rework-footer">
            <button
              type="button"
              className="btn-link"
              disabled={saving}
              onClick={cancelRework}
            >
              {message(locale, "nightPageCancel")}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !draftChanged(draft, cards)}
              onClick={() => void saveRework()}
            >
              {saving
                ? message(locale, "debriefSubmitting")
                : message(locale, "sessionPageReworkSave")}
            </button>
          </div>
        </>
      ) : null}
      {sending ? (
        <SessionPhotoSender
          locale={locale}
          night={addNight}
          card={sending}
          onClose={() => setSending(null)}
          onSent={(outcome) => photoSent(sending, outcome)}
        />
      ) : null}

      {dialog?.kind === "add-target" ? (
        <AddTargetDialog
          locale={locale}
          TargetsPicker={TargetsPicker}
          visibleFor={{
            planPlace: plan?.location ?? null,
            recordedPlace: night?.place?.value ?? null,
            date: nightDate,
            start: startedAt,
            end: finishedAt,
            darkness: plan?.darkness,
          }}
          excludeIds={draft.targets
            .filter((target) => !target.removed)
            .map((target) => target.key)}
          onClose={() => setDialog(null)}
          onPick={(target) => {
            setDraft((current) =>
              current.targets.some((entry) => entry.key === target.id)
                ? {
                    ...current,
                    targets: current.targets.map((entry) =>
                      entry.key === target.id
                        ? { ...entry, removed: false, reason: null }
                        : entry,
                    ),
                  }
                : {
                    ...current,
                    targets: [
                      ...current.targets,
                      {
                        key: target.id,
                        planItemId: null,
                        label: target.designation,
                        origin: "added",
                        removed: false,
                        reason: null,
                        start: "",
                        end: "",
                        frames: "",
                        filter: "",
                      },
                    ],
                  },
            );
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "edit" && dialogRow && dialogCard ? (
        <EditTargetDialog
          locale={locale}
          label={dialogCard.label}
          timeZone={placeTimeZone}
          row={{
            ...dialogRow,
            start:
              dialogRow.start ||
              clockValue(dialogCard.realStart, placeTimeZone),
            end: dialogRow.end || clockValue(dialogCard.realEnd, placeTimeZone),
          }}
          onClose={() => setDialog(null)}
          onApply={(changes) => {
            const same = (value, shown) => (value === shown ? "" : value);
            changeTarget(dialog.key, {
              ...changes,
              start: same(
                changes.start,
                clockValue(dialogCard.realStart, placeTimeZone),
              ),
              end: same(
                changes.end,
                clockValue(dialogCard.realEnd, placeTimeZone),
              ),
            });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "remove" && dialogRow && dialogCard ? (
        <RemoveTargetDialog
          locale={locale}
          label={dialogCard.label}
          slot={dialogCard.slot}
          initialReason={dialogRow.reason ?? ""}
          timeZone={placeTimeZone}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => {
            changeTarget(dialog.key, { removed: true, reason: reason || null });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "event" ? (
        <AddEventDialog
          locale={locale}
          cards={view.cards.filter((card) => card.state !== "removed")}
          windowStart={startedAt}
          windowEnd={finishedAt ?? startedAt}
          timeZone={placeTimeZone}
          onClose={() => setDialog(null)}
          onAdd={(event) => {
            setDraft((current) => ({
              ...current,
              added: [...current.added, { id: draftEventId(), ...event }],
            }));
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "move" ? (
        <MoveReportDialog
          locale={locale}
          cards={view.cards.filter((card) => card.state !== "removed")}
          current={dialog.report.targetKey}
          onClose={() => setDialog(null)}
          onMove={(targetKey) => {
            setDraft((current) =>
              moveReport(current, dialog.report, targetKey),
            );
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "edit-report" ? (
        <AddEventDialog
          locale={locale}
          cards={view.cards.filter((card) => card.state !== "removed")}
          windowStart={startedAt}
          windowEnd={finishedAt ?? startedAt}
          timeZone={placeTimeZone}
          initial={reportForm(
            dialog.report,
            detectedSentence(dialog.report, locale, placeTimeZone),
          )}
          detected={dialog.report.detected === true}
          detectedReport={dialog.report}
          onClose={() => setDialog(null)}
          onAdd={(form) => {
            setDraft((current) => editReport(current, dialog.report, form));
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "edit-report-now" ? (
        <AddEventDialog
          locale={locale}
          cards={view.cards.filter((card) => card.state !== "removed")}
          windowStart={startedAt}
          windowEnd={finishedAt ?? startedAt}
          timeZone={placeTimeZone}
          initial={reportForm(
            dialog.report,
            detectedSentence(dialog.report, locale, placeTimeZone),
          )}
          detected={dialog.report.detected === true}
          detectedReport={dialog.report}
          onClose={() => setDialog(null)}
          onAdd={(form) => {
            const report = dialog.report;
            setDialog(null);
            void saveRework(editReport(emptyDraft(cards), report, form));
          }}
        />
      ) : null}
      {dialog?.kind === "leave" ? (
        <WebConfirmDialog
          tone="primary"
          title={message(locale, "sessionPageReworkLeaveTitle")}
          description={message(locale, "sessionPageReworkLeaveBody")}
          cancelLabel={message(locale, "sessionPageReworkLeaveStay")}
          confirmLabel={message(locale, "sessionPageReworkLeaveConfirm")}
          onCancel={() => setDialog(null)}
          onConfirm={leaveRework}
        />
      ) : null}

      {editing ? null : (
        <SessionQualityCard
          locale={locale}
          summary={data?.qualitySummary ?? null}
          guidingSummary={data?.guidingSummary ?? null}
          report={report}
          onSeeGuiding={() => {
            const section = document.getElementById("session-guiding");
            if (section) section.scrollIntoView({ behavior: "smooth" });
            else setFolds((current) => ({ ...current, quality: true }));
          }}
        />
      )}

      {readOnly || editing ? null : (
        <SessionAstroSyncMessage
          locale={locale}
          meta={report ? meta : null}
          fromAstroSync={session.origin === "astro-sync"}
        />
      )}

      {readOnly || editing ? null : (
        <section
          className="session-details"
          aria-labelledby="session-details-title"
        >
          <h2 id="session-details-title" className="night-section-head">
            {message(locale, "sessionPageDetailsTitle")}
          </h2>
          {night ? (
            <Fold
              id="session-details-night"
              title={message(locale, "nightPageNightTitle")}
              hint={message(locale, "sessionPageDetailsNightHint")}
              open={Boolean(folds.night)}
              onToggle={setFold("night")}
            >
              <NightFieldCard
                locale={locale}
                sessionId={sessionId}
                night={night}
                planName={plan?.name ?? null}
                names={{ equipment: equipmentNames, targets: names }}
                places={places}
                timeZone={placeTimeZone}
                equipmentOptions={equipmentOptions}
                planEquipmentLine={visualPlanLine(plan, equipmentNames, locale)}
                TargetsPicker={TargetsPicker}
                notice={fieldsNotice}
                planRow={planRow}
                planStatus={planStatus}
                onSaved={(saved, added = {}) => {
                  setNames((current) => ({ ...current, ...added }));
                  setData((current) => ({ ...current, night: saved }));
                }}
              />
            </Fold>
          ) : null}
          {night ? (
            <Fold
              id="session-details-steps"
              title={message(locale, "nightPageStepsTitle")}
              hint={
                steps.length
                  ? [
                      say(
                        locale,
                        steps.length === 1
                          ? "sessionPageDetailsStepsOne"
                          : "sessionPageDetailsStepsOther",
                        { count: steps.length },
                      ),
                      framesText(totals.frames, locale),
                      integrationText(totals.seconds, locale),
                    ].join(" · ")
                  : message(locale, "sessionPageDetailsStepsNone")
              }
              open={Boolean(folds.steps)}
              onToggle={setFold("steps")}
            >
              <NightStepsTable
                locale={locale}
                sessionId={sessionId}
                steps={steps}
                targetIds={night?.targetIds?.value ?? []}
                names={names}
                analysisMeta={meta}
                dayOf={(value) => utcShortDay(value, locale)}
                clockOf={utcClock}
                onChanged={reload}
              />
            </Fold>
          ) : null}
          <Fold
            id="session-details-quality"
            title={message(
              locale,
              legacyGuiding
                ? "sessionPageDetailsQualityTitle"
                : "sessionPageDetailsQualityOnlyTitle",
            )}
            hint={message(
              locale,
              legacyGuiding
                ? "sessionPageDetailsQualityHint"
                : "sessionPageDetailsQualityOnlyHint",
            )}
            open={Boolean(folds.quality)}
            onToggle={setFold("quality")}
          >
            {report ? (
              <>
                <MeasuresSourceBar
                  locale={locale}
                  sessionId={sessionId}
                  meta={meta}
                  onDeleted={reload}
                />
                <NightQualitySection
                  locale={locale}
                  zone={placeTimeZone}
                  summary={data?.qualitySummary ?? null}
                  report={report}
                  steps={steps}
                  names={names}
                  bounds={bounds}
                  passages={passages}
                  titleOf={titleOf}
                />
                {legacyGuiding ? (
                  <NightGuidingSection
                    locale={locale}
                    zone={placeTimeZone}
                    summary={data?.guidingSummary ?? null}
                    series={data?.guidingSeries ?? []}
                    report={report}
                    bounds={bounds}
                    passages={passages}
                    titleOf={titleOf}
                  />
                ) : null}
              </>
            ) : (
              <section
                className="night-card night-no-analysis"
                aria-labelledby="night-no-analysis-title"
              >
                <h2 id="night-no-analysis-title">
                  {message(locale, "nightPageQualityGuidingTitle")}
                </h2>
                <InfoLine
                  locale={locale}
                  className="night-card-line"
                  text={message(locale, "nightPageNoMeasures")}
                  title={message(locale, "nightPageQualityGuidingTitle")}
                  body={message(locale, "nightPageNoMeasuresInfo")}
                />
              </section>
            )}
          </Fold>
          {night ? (
            <Fold
              id="session-details-notes"
              title={message(locale, "nightPageNotesTitle")}
              hint={
                notesPreview
                  ? notesPreview.length > 48
                    ? `${notesPreview.slice(0, 48).trimEnd()}…`
                    : notesPreview
                  : message(locale, "nightPageNotesEmpty")
              }
              open={Boolean(folds.notes)}
              onToggle={setFold("notes")}
            >
              <NightNotesCard
                locale={locale}
                sessionId={sessionId}
                night={night}
                fieldNotes={fieldNotes}
                onSaved={(saved) =>
                  setData((current) => ({ ...current, night: saved }))
                }
              />
            </Fold>
          ) : null}
          <Fold
            id="session-details-journal"
            title={message(locale, "nightPageJournalTitle")}
            hint={say(
              locale,
              journal.length === 1
                ? "nightPageJournalCountOne"
                : "nightPageJournalCountOther",
              { count: journal.length },
            )}
            open={Boolean(folds.journal)}
            onToggle={setFold("journal")}
          >
            {journal.length ? (
              <ul className="debrief-journal-list">
                {journal.map((event) => (
                  <li className="debrief-journal-entry" key={event.eventId}>
                    <div className="debrief-journal-entry-heading">
                      <strong>{eventTypeLabel(event.type, locale)}</strong>
                      <span>
                        {formatSessionInstant(
                          event.recordedAt,
                          locale,
                          placeTimeZone,
                        )}
                      </span>
                      {timingLabel(event.timing, locale) && (
                        <em>{timingLabel(event.timing, locale)}</em>
                      )}
                    </div>
                    {eventDetail(
                      event,
                      locale,
                      titleOf,
                      journalHourAt,
                      placeTimeZone,
                    ) && (
                      <p>
                        {eventDetail(
                          event,
                          locale,
                          titleOf,
                          journalHourAt,
                          placeTimeZone,
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="debrief-muted">
                {message(locale, "debriefSessionDetailNoEvents")}
              </p>
            )}
          </Fold>
        </section>
      )}
      <SessionFootActions
        locale={locale}
        canRework={canRework && !editing}
        canDelete={canDelete}
        onRework={() => setDialog({ kind: "rework" })}
        onDelete={() => {
          setDeleteFailed(false);
          setDialog({ kind: "delete-session" });
        }}
      />
      {dialog?.kind === "rework" ? (
        <WebConfirmDialog
          tone="primary"
          title={message(locale, "sessionReworkConfirmTitle")}
          description={message(locale, "sessionReworkConfirmBody")}
          cancelLabel={message(locale, "nightPageCancel")}
          confirmLabel={message(locale, "sessionReworkAction")}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            startRework();
          }}
        />
      ) : null}
      {dialog?.kind === "delete-session" ? (
        <SessionDeleteDialog
          locale={locale}
          item={{
            captureCount: targets.filter((target) => target.captureId).length,
          }}
          busy={deleting}
          failed={deleteFailed}
          onCancel={() => setDialog(null)}
          onConfirm={() => void deleteSession()}
        />
      ) : null}
    </main>
  );
}

/**
 * The state of the sending of a session, under its head: what it still waits for from Astro Sync,
 * that it is complete, that a visual session waits for nothing, or that it
 * waits for its debriefing. The icon is blue while something is waited for,
 * grey once everything is there.
 */
function SessionSendingState({ locale, state }) {
  return (
    <p
      className={`session-sending-state${state.waits ? " is-waiting" : ""}`}
      data-testid="session-sending-state"
      role="status"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {state.waits ? (
          <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 4.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 4.5-4 8.5s4 4.5 4 8.5" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M8 12.3l2.6 2.6L16 9.4" />
          </>
        )}
      </svg>
      <span>{message(locale, state.key)}</span>
    </p>
  );
}

/**
 * The foot of the page of a session: « Remanier cette session »,
 * the global action of the page, a secondary at the foot (it asks first), then
 * « Autres actions » with « Supprimer la session » (a tertiary in the
 * destructive tint, the removing action last).
 */
function SessionFootActions({
  locale,
  canRework,
  canDelete,
  onRework,
  onDelete,
}) {
  return (
    <>
      {canRework ? (
        <div className="session-foot-actions">
          <button
            type="button"
            className="btn-secondary session-rework-start"
            onClick={onRework}
          >
            <PencilGlyph />
            {message(locale, "sessionReworkAction")}
          </button>
        </div>
      ) : null}
      {canDelete ? (
        <section className="session-others" aria-labelledby="session-others">
          <h2 id="session-others">{message(locale, "otherActionsTitle")}</h2>
          <div className="session-foot-actions">
            <button
              type="button"
              className="btn-tertiary is-destructive"
              data-action="delete-session"
              onClick={onDelete}
            >
              {message(locale, "sessionDeleteAction")}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
