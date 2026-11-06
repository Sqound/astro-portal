"use client";

import { useEffect, useState } from "react";
import { requestJson } from "portal/components/sessions/portal-fetch.js";
import { durationText, labelValue } from "portal/written-forms.js";
import { multiNightCoreCopy, planProjectIds } from "../multi-night-access.js";

// The multi-night plans in the read-only window of an ended subscription: the
// ones the space holds are shown read-only, by the open core itself: the list
// of those in progress and, from a card, the content of one — its target, its
// goal, its place and its nights (the one-night plans that follow it, which
// open as any plan). Nothing is edited nor created, and one line says why. They
// are never shown read-only where nothing restricts them.

const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The space's multi-night plans, read once for the page from
 * `GET /api/v1/projects` when `enabled` (the read-only window), the
 * archived ones left out: `{ status, projects }`, `status` one of `idle`,
 * `loading`, `ready`, `error`.
 */
export function useReadOnlyMultiNightPlans(enabled) {
  const [state, setState] = useState({ status: "idle", projects: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    requestJson("/api/v1/projects")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error("project_list_failed");
        return Array.isArray(payload?.projects) ? payload.projects : [];
      })
      .then((projects) => {
        if (!cancelled)
          setState({
            status: "ready",
            projects: projects.filter(
              (project) => project && project.status !== "archived",
            ),
          });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", projects: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}

/**
 * The nights of one multi-night plan as the service counts them
 * (`GET /api/v1/projects/{id}`, `nights[].state`: `upcoming`, `to_debrief`,
 * `done`), read once when the plan opens: `[]` while it is read or when it
 * cannot be (the page then lists the plan's own one-night plans, as before).
 */
export function useReadOnlyProjectNights(projectId) {
  const [nights, setNights] = useState([]);
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    requestJson(`/api/v1/projects/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        return response.ok && Array.isArray(payload?.nights)
          ? payload.nights
          : [];
      })
      .then((value) => !cancelled && setNights(value))
      .catch(() => !cancelled && setNights([]));
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return nights;
}

/**
 * "À venir" and "Sessions faites" of a multi-night plan read-only: the
 * sessions the service counts as run (`done`, `to_debrief`), each a link to its
 * session's page; the plans of the planner that no session covers yet, as the
 * promise. A session attached afterwards is among the sessions done.
 */
export function readOnlyMultiNightParts({ plans, serviceNights }) {
  const done = (Array.isArray(serviceNights) ? serviceNights : [])
    .filter((night) => night && night.state !== "upcoming")
    .sort((left, right) =>
      String(left.eveningDate).localeCompare(String(right.eveningDate)),
    );
  const covered = new Set(done.map((night) => night.eveningDate));
  return {
    upcoming: (plans || []).filter((plan) => !covered.has(plan.date)),
    done,
  };
}

/** The one-night plans that follow a multi-night plan, by date. */
export function readOnlyMultiNightNights(project, plans) {
  return (Array.isArray(plans) ? plans : [])
    .filter((plan) => planProjectIds(plan).includes(project?.id))
    .sort(
      (left, right) =>
        String(left.date).localeCompare(String(right.date)) ||
        String(left.id).localeCompare(String(right.id)),
    );
}

function nightDate(value, locale) {
  const day = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(day);
}

/**
 * In the read-only window of an ended subscription: "Your subscription
 * has ended: your multi-night plans stay visible, but can no longer be
 * edited."
 */
export function MultiNightReadOnlyLine({ locale }) {
  return (
    <p className="multi-night-readonly-line" role="note">
      {multiNightCoreCopy(locale).windowLine}
    </p>
  );
}

/** "Nouveau plan multi-nuits", greyed: the read-only window creates nothing. */
function GreyedNewButton({ locale }) {
  return (
    <button
      className="btn-primary multi-night-readonly-new"
      type="button"
      disabled
      aria-disabled="true"
      data-greyed=""
    >
      {multiNightCoreCopy(locale).newMultiNight}
    </button>
  );
}

function ProjectTitle({ project, as: Heading = "strong" }) {
  const name = text(project?.target?.name) || text(project?.id);
  const common = text(project?.target?.commonName);
  return (
    <span className="multi-night-readonly-title">
      <Heading>{name}</Heading>
      {common && <small>{common}</small>}
    </span>
  );
}

function Facts({ locale, project }) {
  const copy = multiNightCoreCopy(locale);
  const goal = Number(project?.goalMinutes);
  const place = text(project?.place?.name);
  return (
    <p className="multi-night-readonly-facts">
      {Number.isFinite(goal) && goal > 0 && (
        <span>{labelValue(copy.goal, durationText(goal, locale), locale)}</span>
      )}
      {place && <span>{labelValue(copy.place, place, locale)}</span>}
    </p>
  );
}

/** The content of one multi-night plan, read-only. */
export function MultiNightReadOnlyDetail({
  locale,
  project,
  plans,
  onBack,
  onOpenPlan,
}) {
  const copy = multiNightCoreCopy(locale);
  const nights = readOnlyMultiNightNights(project, plans);
  const { upcoming, done } = readOnlyMultiNightParts({
    plans: nights,
    serviceNights: useReadOnlyProjectNights(project.id),
  });
  return (
    <section
      className="multi-night-readonly-detail"
      data-multi-night-access="readOnly"
      data-project-id={project.id}
      aria-labelledby="multi-night-readonly-detail-title"
    >
      <button className="btn-link" type="button" onClick={onBack}>
        ‹ {copy.back}
      </button>
      <p className="multi-night-readonly-eyebrow">{copy.eyebrow}</p>
      <div id="multi-night-readonly-detail-title">
        <ProjectTitle project={project} as="h2" />
      </div>
      <MultiNightReadOnlyLine locale={locale} />
      <Facts locale={locale} project={project} />
      {upcoming.length ? (
        <>
          <h3>{copy.upcoming}</h3>
          <ul
            className="multi-night-readonly-nights"
            data-multi-night-part="upcoming"
          >
            {upcoming.map((plan) => (
              <li key={plan.id}>
                <button
                  className="btn-link"
                  type="button"
                  onClick={() => onOpenPlan?.(plan.id)}
                >
                  {nightDate(plan.date, locale)} · {text(plan.name)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {done.length ? (
        <>
          <h3>{copy.sessionsDone}</h3>
          <ul
            className="multi-night-readonly-nights"
            data-multi-night-part="done"
          >
            {done.map((night) => (
              <li key={night.sessionId ?? night.planId ?? night.eveningDate}>
                <a
                  className="btn-link"
                  href={
                    night.sessionId
                      ? `/${locale}/sessions/${encodeURIComponent(night.sessionId)}`
                      : `/${locale}/sessions/debrief/${encodeURIComponent(night.planId)}`
                  }
                >
                  {nightDate(night.eveningDate, locale)} ·{" "}
                  {text(night.planName) || copy.seeSession}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!upcoming.length && !done.length ? (
        <p className="multi-night-readonly-help">{copy.noNights}</p>
      ) : null}
    </section>
  );
}

/**
 * The multi-night side of the plans library in the read-only window: "En
 * cours", "Nouveau plan multi-nuits" greyed, the line that says why, one
 * card per multi-night plan in progress; a card opens its content. `selectedId` / `onSelect` hold the plan open
 * (`null`: the list).
 */
export function MultiNightReadOnlyView({
  locale,
  projects,
  plans,
  kindSwitch = null,
  selectedId = null,
  onSelect,
  onOpenPlan,
}) {
  const copy = multiNightCoreCopy(locale);
  const selected = selectedId
    ? (projects || []).find((project) => project.id === selectedId) || null
    : null;
  const active = (projects || []).filter(
    (project) => project.status === "active",
  );
  return (
    <main className="planner-library multi-night-readonly">
      {kindSwitch}
      {selected ? (
        <MultiNightReadOnlyDetail
          locale={locale}
          project={selected}
          plans={plans}
          onBack={() => onSelect?.(null)}
          onOpenPlan={onOpenPlan}
        />
      ) : (
        <section
          className="multi-night-readonly-list"
          data-multi-night-access="readOnly"
          data-multi-night-window="ended"
          aria-labelledby="multi-night-readonly-title"
        >
          <div className="multi-night-heading">
            <h2 id="multi-night-readonly-title">{copy.inProgress}</h2>
            <GreyedNewButton locale={locale} />
          </div>
          <MultiNightReadOnlyLine locale={locale} />
          {active.length ? (
            <div className="multi-night-readonly-cards">
              {active.map((project) => (
                <article
                  className="multi-night-readonly-card"
                  key={project.id}
                  data-project-id={project.id}
                >
                  <button
                    className="multi-night-readonly-card-open"
                    type="button"
                    onClick={() => onSelect?.(project.id)}
                  >
                    <ProjectTitle project={project} />
                    <span
                      className="multi-night-readonly-chevron"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                  <Facts locale={locale} project={project} />
                </article>
              ))}
            </div>
          ) : (
            <p className="multi-night-readonly-help">{copy.noneInProgress}</p>
          )}
        </section>
      )}
    </main>
  );
}
