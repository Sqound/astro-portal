"use client";

import { useEffect, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { nightOfText } from "portal/components/sessions/night-summary-view.js";
import { isHostedService } from "../../access-copy.js";
import { LockedChip, NightsOfferDialog } from "../../offers-slot.js";
import {
  attachProjectNights,
  detachProjectNight,
  isPlanningRefusal,
  listProjectNights,
  listProjectsOf,
  loadProjects,
  nightsChanged,
  planningLocked,
  useMultiNightStore,
} from "./client.js";
import { say } from "./copy.js";
import { multiNightDuration } from "./model.js";
import { NightsReadFailed, NightsStatus, useRead } from "./MultiNightNights.js";
import { projectLabel, projectMatches } from "../nights.js";

// The page of a night of the journal and its multi-night plan: a row "Plan
// multi-nuits" in the card "La nuit" — "Aucun" and "Rattacher à un plan
// multi-nuits", or the plan named and "Détacher de ce plan" —, the dialog of
// the plans (one click attaches, with "Annuler"; a search finds a plan that was
// not proposed; "Créer un plan multi-nuits"), and the status line above the
// card. Registered at `planner.projects` as `NightPlanSlot` and drawn by the
// page of a night through its shell, for a signed-in person; without
// "Planification avancée", every gesture opens the offers' dialog — where
// nothing restricts them, they are never held back.

const Glyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
    <path d="M4 12l8 4.5 8-4.5" />
    <path d="M4 16.5L12 21l8-4.5" />
  </svg>
);

/** One multi-night plan as a frame of the dialog: its target and its goal. */
export function PlanFrame({
  locale,
  project,
  onChoose,
  busy,
  children = null,
}) {
  return (
    <button
      className="nights-plan-frame"
      type="button"
      data-project-id={project.id}
      disabled={busy}
      onClick={() => onChoose(project)}
    >
      <span className="nights-plan-frame-icon" aria-hidden="true">
        <Glyph />
      </span>
      <span className="nights-plan-frame-text">
        <strong>{projectLabel(project)}</strong>
        <small>
          {[
            project.target?.commonName,
            say(locale, "blockGoal", {
              duration: multiNightDuration(locale, project.goalMinutes),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
        {children}
      </span>
      <span className="multi-night-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/**
 * "Rattacher à un plan multi-nuits": the plans of the night's target — the
 * ones the service says this night can join —, a search of the others, and
 * "Créer un plan multi-nuits". A click attaches at once.
 */
function AttachToPlanDialog({
  locale,
  sessionId,
  nightLabel,
  targetNames,
  hasTarget,
  projects,
  onChoose,
  onClose,
  error,
  busy,
}) {
  const [query, setQuery] = useState("");
  const key = projects.map((project) => project.id).join(",");
  const [read, retry] = useRead(
    () =>
      Promise.all(
        projects.map((project) =>
          listProjectNights(project.id).then(
            (value) => ({
              project,
              joins: value.candidates.some(
                (line) => line.sessionId === sessionId && !line.projectId,
              ),
            }),
            () => ({ project, joins: false }),
          ),
        ),
      ),
    key,
  );
  const answers = read.data ?? [];
  const proposed = answers
    .filter((answer) => answer.joins)
    .map((a) => a.project);
  const proposedIds = new Set(proposed.map((project) => project.id));
  const found = projects.filter(
    (project) => !proposedIds.has(project.id) && projectMatches(project, query),
  );
  const targets = Object.values(targetNames).join(", ");
  return (
    <WebDialog
      className="multi-night-dialog nights-dialog nights-attach-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "attach")}
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {say(locale, "cancel")}
        </button>
      }
    >
      <p className="multi-night-dialog-subtitle">{nightLabel}</p>
      {!hasTarget && (
        <p className="multi-night-help">{say(locale, "attachNoTarget")}</p>
      )}
      <section
        className="nights-plans"
        aria-label={say(locale, "attachPlansHeading")}
      >
        <h3>{say(locale, "attachPlansHeading")}</h3>
        {read.status === "loading" && (
          <p className="multi-night-help" aria-busy="true">
            …
          </p>
        )}
        {read.status === "error" && (
          <NightsReadFailed locale={locale} onRetry={retry} />
        )}
        {read.status === "ready" && proposed.length === 0 && (
          <p className="multi-night-help">
            {targets
              ? say(locale, "attachNoPlans", { targets })
              : say(locale, "attachNoPlansAny")}
          </p>
        )}
        {proposed.map((project) => (
          <PlanFrame
            key={project.id}
            locale={locale}
            project={project}
            busy={busy}
            onChoose={onChoose}
          />
        ))}
      </section>
      {projects.length > 0 && (
        <div className="nights-plan-search">
          <input
            type="search"
            aria-label={say(locale, "searchPlan")}
            placeholder={say(locale, "searchPlan")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() && found.length === 0 && (
            <p className="multi-night-help">{say(locale, "searchNoResult")}</p>
          )}
          {found.map((project) => (
            <PlanFrame
              key={project.id}
              locale={locale}
              project={project}
              busy={busy}
              onChoose={onChoose}
            />
          ))}
        </div>
      )}
      <a
        className="nights-plan-frame is-create"
        href={`/${locale}/planner?view=plans&kind=multi&new=existing`}
      >
        <span className="nights-plan-frame-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="nights-plan-frame-text">
          <strong>{say(locale, "createCardTitle")}</strong>
          <small>{say(locale, "createCardBody")}</small>
        </span>
        <span className="multi-night-chevron" aria-hidden="true">
          ›
        </span>
      </a>
      {error && (
        <p className="multi-night-error" role="alert">
          {error}
        </p>
      )}
    </WebDialog>
  );
}

/**
 * What the page of a night draws for its multi-night plan: `children` is
 * called with `{ row, status }` (nodes, or `null` where nothing is drawn: a
 * person signed out, or the service not read yet) — `row` goes in the card
 * "La nuit", `status` above it.
 */
export function NightPlanSlot({
  locale,
  sessionId,
  startedAt = null,
  planDate = null,
  targetIds = [],
  targetNames = {},
  capabilities = null,
  children,
}) {
  // `null` until the service is read; then whether it sells "Planification
  // avancée" and whether a person is signed in.
  const [service, setService] = useState(null);
  const shown = Boolean(service?.signedIn);
  const store = useMultiNightStore();
  const [mine, setMine] = useState(undefined);
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then(
        (auth) =>
          current &&
          setService({
            hosted: isHostedService(auth),
            signedIn: Boolean(auth?.authenticated),
          }),
      )
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (shown) loadProjects();
  }, [shown]);
  useEffect(() => {
    if (!shown) return undefined;
    let current = true;
    listProjectsOf({ sessionId }).then(
      (list) =>
        current &&
        setMine(list.find((project) => project.status !== "archived") ?? null),
      () => current && setMine(null),
    );
    return () => {
      current = false;
    };
  }, [shown, sessionId, store.nightsVersion]);
  if (!shown) return children({ row: null, status: null });

  const locked = planningLocked(capabilities, { hosted: service.hosted });
  const projects = store.projects.filter(
    (project) => project.status !== "archived",
  );
  const date = planDate || (startedAt ? String(startedAt).slice(0, 10) : null);
  const nightLabel = date ? nightOfText(locale, date) : "";
  const names = Object.fromEntries(
    targetIds.map((id) => [id, targetNames[id] ?? id]),
  );

  const attach = async (project) => {
    setBusy(true);
    setError("");
    try {
      await attachProjectNights(project.id, { sessionIds: [sessionId] });
      nightsChanged();
      setDialog(null);
      setStatus({
        text: say(locale, "nightAttached", { name: projectLabel(project) }),
        undo: true,
        run: () => detach(project, true),
      });
    } catch (failure) {
      if (isPlanningRefusal(failure)) setDialog("offer");
      else
        // The three refusals of a link: the plan is gone (404) or the night is
        // not of its target (409), said under the control; the link was not
        // written.
        setError(
          say(
            locale,
            failure.code === "target_mismatch"
              ? "linkRefusedTargetMismatch"
              : failure.code === "project_not_found"
                ? "linkRefusedProjectGone"
                : "writeFailed",
          ),
        );
    } finally {
      setBusy(false);
    }
  };
  const detach = async (project, undoing = false) => {
    setStatus(null);
    try {
      await detachProjectNight(project.id, sessionId);
      nightsChanged();
      if (!undoing)
        setStatus({
          text: say(locale, "nightDetached", { name: projectLabel(project) }),
          undo: true,
          run: () => attach(project),
        });
    } catch (failure) {
      if (isPlanningRefusal(failure)) setDialog("offer");
      else setStatus({ text: say(locale, "writeFailed") });
    }
  };

  const href = mine
    ? `/${locale}/planner?${new URLSearchParams({
        view: "plans",
        kind: "multi",
        multiNight: mine.id,
        screen: "detail",
      })}`
    : null;
  const row = (
    <div className="night-field-row night-plan-row" data-field="project">
      <dt>
        <Glyph />
        <span>{say(locale, "blockTitle")}</span>
      </dt>
      <dd>
        {mine === undefined ? (
          <span className="night-row-muted" aria-busy="true">
            …
          </span>
        ) : mine ? (
          <>
            <a className="night-plan-link" href={href}>
              {projectLabel(mine)}
            </a>
            <span className="night-row-muted">
              {" · "}
              {say(locale, "blockGoal", {
                duration: multiNightDuration(locale, mine.goalMinutes),
              })}
            </span>
          </>
        ) : (
          <span className="night-row-muted">
            {say(locale, "blockNoneValue")}
          </span>
        )}
      </dd>
      {mine === undefined ? null : mine ? (
        <button
          className="btn-link is-destructive night-plan-action"
          type="button"
          data-nights-action="detach"
          onClick={() => (locked ? setDialog("offer") : detach(mine))}
        >
          {say(locale, "detachNight")}
        </button>
      ) : (
        <span className="locked-chip-slot night-plan-action">
          {locked && <LockedChip locale={locale} feature="multiNight" />}
          <button
            className="btn-tertiary"
            type="button"
            data-nights-action="attach"
            onClick={() => {
              setError("");
              setDialog(locked ? "offer" : "attach");
            }}
          >
            {say(locale, "attach")}
          </button>
        </span>
      )}
      {dialog === "attach" && (
        <AttachToPlanDialog
          locale={locale}
          sessionId={sessionId}
          nightLabel={nightLabel}
          targetNames={names}
          hasTarget={targetIds.length > 0}
          projects={projects}
          busy={busy}
          error={error}
          onChoose={attach}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "offer" && (
        <NightsOfferDialog
          locale={locale}
          sentence="lockAttach"
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
  return children({
    row,
    status: (
      <NightsStatus
        locale={locale}
        status={status}
        onUndo={() => status?.run?.()}
      />
    ),
  });
}
