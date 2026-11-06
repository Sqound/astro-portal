"use client";

import { useEffect, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { integrationText } from "portal/components/sessions/night-detail-view.js";
import { message } from "portal/i18n.js";
import { LockedChip, NightsOfferDialog } from "../../offers-slot.js";
import {
  attachProjectNights,
  detachProjectNight,
  isPlanningRefusal,
  listProjectNights,
  nightsChanged,
  useMultiNightStore,
} from "./client.js";
import { say } from "./copy.js";
import { multiNightLineDate } from "./model.js";
import {
  detachId,
  initialTicks,
  nightKey,
  nightsBody,
  nightsSummary,
  nightTickable,
  projectLabel,
  tickedLines,
} from "../nights.js";

// Attaching existing nights to a multi-night plan, the pieces the screens
// share: a night of the list and its tick, the whole tickable list, the dialog
// "Ajouter une nuit du journal", the status line with "Annuler", and the
// offers' dialog a gesture opens without the right (the feature drawn, its
// price and "Voir les offres", never a label and a sentence).

/** Reads `load()` for `key`; `retry` reads again. */
export function useRead(load, key) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ status: "loading", data: null });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      () => current && setState({ status: "error", data: null }),
    );
    return () => {
      current = false;
    };
    // `key` stands for what `load` reads.
  }, [key, attempt]);
  return [state, () => setAttempt((value) => value + 1)];
}

/**
 * The ticks of a list of candidates: every tickable one ticked in advance
 * from the first picture the list is shown in (never "0 of 3" for a moment),
 * then what the person ticks. A list read again (another target) starts over.
 */
export function useTicks(candidates) {
  const [edited, setEdited] = useState(null);
  const ticked =
    edited && edited.source === candidates
      ? edited.ticked
      : initialTicks(candidates);
  return [ticked, (next) => setEdited({ source: candidates, ticked: next })];
}

const STATUS_KEYS = {
  finished: "debriefStatusFinished",
  open: "debriefStatusOpen",
  paused: "debriefStatusPaused",
};

/** The tag of a night: how its session stands, "À venir" for a plan not run. */
function nightTag(locale, line) {
  const key = STATUS_KEYS[line.sessionStatus];
  return key ? message(locale, key) : say(locale, "upcoming");
}

/** The name a night goes by: its plan's name, "Nuit sans plan" without one. */
export function nightName(locale, line) {
  if (line.planName) return line.planName;
  return line.sessionId ? message(locale, "debriefSessionNoPlan") : "";
}

/** The second line of a night: its Astro Sync integrations, or that its plan is not run. */
function nightSub(locale, line) {
  if (!line.sessionId) return say(locale, "nightNotRun");
  if (line.integrationCount > 0)
    return say(locale, "nightSync", {
      duration: integrationText(line.integrationSeconds, locale),
    });
  return "";
}

/** One night of the list: its tick, its date, its name, its tag, its integrations. */
function NightChoice({ locale, line, checked, onChange, ownerName }) {
  const tickable = nightTickable(line);
  const name = nightName(locale, line);
  const sub = tickable ? nightSub(locale, line) : "";
  return (
    <li
      className={`nights-choice${tickable ? "" : " is-disabled"}`}
      data-night={nightKey(line)}
    >
      <label>
        <input
          type="checkbox"
          checked={tickable && checked}
          disabled={!tickable}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="nights-choice-text">
          <span className="nights-choice-main">
            <strong>{multiNightLineDate(locale, line.eveningDate)}</strong>
            {tickable
              ? name
                ? ` · ${name}`
                : ""
              : ` · ${say(locale, "nightInOtherPlan", { name: ownerName })}`}
          </span>
          {sub && <span className="nights-choice-sub">{sub}</span>}
        </span>
        <span
          className={`nights-choice-tag is-${line.sessionStatus ?? "planned"}`}
        >
          {nightTag(locale, line)}
        </span>
      </label>
    </li>
  );
}

/**
 * The nights of a target, tickable ("Nuits à rattacher"): the heading with
 * "Tout décocher" / "Tout cocher", the summary and the list. `lines` are
 * the service's, `ticked` the keys ticked, `projects` the space's multi-night
 * plans (to name the one a greyed night is in).
 */
export function NightsPicker({
  locale,
  lines,
  ticked,
  onTicked,
  heading,
  projects,
  summary = true,
}) {
  const tickable = lines.filter(nightTickable);
  const counts = nightsSummary(lines, ticked);
  const all = counts.total > 0 && counts.ticked === counts.total;
  const ownerOf = (id) =>
    projectLabel(projects.find((project) => project.id === id)) || "";
  return (
    <section className="nights-picker" aria-label={heading}>
      <div className="nights-picker-heading">
        <h3>{heading}</h3>
        {tickable.length > 0 && (
          <button
            className="btn-link"
            type="button"
            onClick={() =>
              onTicked(all ? new Set() : new Set(tickable.map(nightKey)))
            }
          >
            {say(locale, all ? "untickAll" : "tickAll")}
          </button>
        )}
      </div>
      {summary && (
        <p className="multi-night-help nights-picker-summary">
          {say(
            locale,
            counts.seconds > 0
              ? "fromExistingSummaryAcquired"
              : "fromExistingSummary",
            {
              ticked: counts.ticked,
              total: counts.total,
              acquired: integrationText(counts.seconds, locale),
            },
          )}
        </p>
      )}
      <ul className="nights-choices">
        {lines.map((line) => (
          <NightChoice
            key={nightKey(line)}
            locale={locale}
            line={line}
            checked={ticked.has(nightKey(line))}
            ownerName={ownerOf(line.projectId)}
            onChange={(on) => {
              const next = new Set(ticked);
              if (on) next.add(nightKey(line));
              else next.delete(nightKey(line));
              onTicked(next);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

/** "Impossible de lire vos nuits pour l’instant." and "Réessayer". */
export function NightsReadFailed({ locale, onRetry }) {
  return (
    <p className="nights-read-failed" role="alert">
      <span>{say(locale, "nightsReadFailed")}</span>
      <button className="btn-link" type="button" onClick={onRetry}>
        {say(locale, "retry")}
      </button>
    </p>
  );
}

/** The status line after an attachment or a detachment, with "Annuler". */
export function NightsStatus({ locale, status, onUndo }) {
  if (!status) return null;
  return (
    <p className="nights-status" role="status">
      <span>{status.text}</span>
      {status.undo && (
        <button className="btn-link" type="button" onClick={onUndo}>
          {say(locale, "undo")}
        </button>
      )}
    </p>
  );
}

/** "Ajouter une nuit du journal": the nights of the plan's target not yet in it, tickable. */
export function AddNightsDialog({
  locale,
  project,
  onClose,
  onAdded,
  onLocked,
}) {
  const { projects } = useMultiNightStore();
  const [read, retry] = useRead(
    () => listProjectNights(project.id),
    project.id,
  );
  const [ticked, setTicked] = useTicks(read.data?.candidates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lines = (read.data?.candidates ?? []).filter(nightTickable);
  const target = project.target?.name || "";
  const chosen = tickedLines(lines, ticked);
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await attachProjectNights(project.id, nightsBody(chosen));
      nightsChanged();
      onAdded(chosen);
      onClose();
    } catch (failure) {
      if (isPlanningRefusal(failure)) {
        onLocked();
        return;
      }
      setError(
        say(
          locale,
          failure.code === "target_mismatch" ? "attachMismatch" : "writeFailed",
        ),
      );
      setBusy(false);
    }
  };
  const empty = read.status === "ready" && lines.length === 0;
  return (
    <WebDialog
      className="multi-night-dialog nights-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "addJournalNight")}
      footer={
        read.status === "ready" && !empty ? (
          <>
            <button className="btn-link" type="button" onClick={onClose}>
              {say(locale, "cancel")}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={busy || chosen.length === 0}
              onClick={add}
            >
              {say(locale, "addNights", { count: chosen.length })}
            </button>
          </>
        ) : (
          <button className="btn-link" type="button" onClick={onClose}>
            {say(locale, "close")}
          </button>
        )
      }
    >
      <p className="multi-night-dialog-subtitle">
        {say(locale, "addSheetSub", { target })}
      </p>
      {read.status === "loading" && (
        <p className="multi-night-help" aria-busy="true">
          …
        </p>
      )}
      {read.status === "error" && (
        <NightsReadFailed locale={locale} onRetry={retry} />
      )}
      {empty && (
        <div className="nights-empty">
          <p>{say(locale, "addSheetEmpty", { target })}</p>
          <p className="multi-night-help">{say(locale, "addSheetEmptyNote")}</p>
        </div>
      )}
      {read.status === "ready" && !empty && (
        <NightsPicker
          locale={locale}
          lines={lines}
          ticked={ticked}
          onTicked={setTicked}
          heading={say(locale, "fromExistingNights")}
          projects={projects}
        />
      )}
      {error && (
        <p className="multi-night-error" role="alert">
          {error}
        </p>
      )}
    </WebDialog>
  );
}

/**
 * The nights of `project` as the service counts them (`nights` of
 * `GET …/nights`), read again when nights are attached or detached
 * anywhere on the page; `[]` while reading or when they cannot be read.
 */
export function useProjectNights(project) {
  const { nightsVersion } = useMultiNightStore();
  const [nights, setNights] = useState([]);
  useEffect(() => {
    let current = true;
    listProjectNights(project.id).then(
      (value) => current && setNights(value?.nights ?? []),
      () => current && setNights([]),
    );
    return () => {
      current = false;
    };
  }, [project.id, project.revision, nightsVersion]);
  return nights;
}

/** Detaches `lines` from `project`, one after the other (the "Annuler" of an addition). */
export async function detachLines(project, lines) {
  for (const line of lines)
    await detachProjectNight(project.id, detachId(line));
  nightsChanged();
}

/**
 * "Ajouter une nuit du journal" under "Nuits du plan": the tertiary, alone
 * in its zone, on the right; with the right it opens the dialog of the
 * nights, without it the offers' dialog (the tag beside it says why); the
 * status line, once added, with "Annuler".
 */
export function MultiNightAddAction({ locale, project, locked }) {
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(null);
  const undo = async () => {
    const lines = status?.lines ?? [];
    setStatus(null);
    try {
      await detachLines(project, lines);
    } catch {
      setStatus({ text: say(locale, "writeFailed") });
    }
  };
  return (
    <div className="nights-add">
      <NightsStatus locale={locale} status={status} onUndo={undo} />
      <div className="nights-add-row">
        <span className="locked-chip-slot">
          {locked && <LockedChip locale={locale} feature="multiNight" />}
          <button
            className="btn-tertiary"
            type="button"
            data-nights-action="add"
            onClick={() => setDialog(locked ? "offer" : "add")}
          >
            {say(locale, "addJournalNight")}
          </button>
        </span>
      </div>
      {dialog === "add" && (
        <AddNightsDialog
          locale={locale}
          project={project}
          onClose={() => setDialog(null)}
          onLocked={() => setDialog("offer")}
          onAdded={(lines) =>
            setStatus({
              text: say(locale, "nightsAdded", { count: lines.length }),
              lines,
              undo: true,
            })
          }
        />
      )}
      {dialog === "offer" && (
        <NightsOfferDialog
          locale={locale}
          sentence="lockAdd"
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
