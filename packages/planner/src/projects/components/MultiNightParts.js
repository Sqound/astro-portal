"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiNightBadge } from "../../components/MultiNightEntries.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import {
  dismissNotice,
  loadProjects,
  loadSummaries,
  useMultiNightStore,
} from "./client.js";
import { say } from "./copy.js";
import { labelValue } from "portal/written-forms.js";
import {
  multiNightCardLines,
  multiNightCivilDate,
  multiNightPlannerTarget,
  multiNightSeason,
  multiNightView,
} from "./model.js";

// The words of the offers — "Planification avancée", "Voir les offres" —
// are the shell's that sells them (`planner.offers`); a server that sells
// nothing registers none, and these views never draw a held-back entry there.
const gateCopy = (locale) =>
  getPlannerExtensions("planner.offers")[0]?.gateCopy?.(locale) ?? {};

// What the views of the multi-night plans share: the data of the page —
// the list of the space, the summaries of the nights, the season of each
// plan — and the small pieces every screen draws.

/** "Planification avancée", in the words of the offers. */
export function AdvancedPlanningBadge({ locale }) {
  return (
    <MultiNightBadge
      locale={locale}
      label={gateCopy(locale).advancedPlanning}
    />
  );
}

/**
 * A section's heading: "En cours", "À venir". The "Planification avancée" tag
 * left the section titles for the switch "Une nuit | Multi-nuits", where it is
 * drawn only while the purchase is missing.
 */
export function MultiNightHeading({ id, title, children = null }) {
  return (
    <div className="multi-night-heading">
      <h2 id={id}>{title}</h2>
      {children}
    </div>
  );
}

/** The bar of the hours acquired on the goal. */
export function MultiNightProgressBar({ locale, percent }) {
  return (
    <span
      className="multi-night-progress"
      role="img"
      aria-label={labelValue(
        say(locale, "progressLabel"),
        `${percent} %`,
        locale,
      )}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </span>
  );
}

/** "Modifié sur un autre appareil …", when a write met a newer version. */
export function MultiNightNotice({ locale }) {
  const { notice } = useMultiNightStore();
  if (!notice) return null;
  return (
    <p className="multi-night-notice" role="status">
      <span>{say(locale, notice)}</span>
      <button className="btn-link" type="button" onClick={dismissNotice}>
        {say(locale, "close")}
      </button>
    </p>
  );
}

/**
 * The multi-night plans of the space, each with its progress and its
 * season, as of today in this browser. Loads the list (and the summaries of
 * the nights) once for the page.
 */
export function useMultiNightData(host) {
  const store = useMultiNightStore();
  // "Ce soir" is read at each plan's place, not on this browser's clock.
  const now = useMemo(() => new Date(), []);
  const todayAt = (place) => multiNightCivilDate(now, place);
  const reads = host.access === "open" || host.access === "heldBack";
  useEffect(() => {
    if (reads) loadProjects();
  }, [reads]);
  const linkedPlanIds = useMemo(
    () =>
      host.plans
        .filter(
          (plan) =>
            (plan.status !== "pending" || plan.date < todayAt(plan.location)) &&
            (plan.items || []).some((item) => item?.projectId),
        )
        .map((plan) => plan.id),
    [host.plans, now],
  );
  useEffect(() => {
    if (reads) loadSummaries(linkedPlanIds);
  }, [reads, linkedPlanIds]);
  const projects = useMemo(
    () => store.projects.filter((project) => project.status !== "archived"),
    [store.projects],
  );
  const views = useMemo(
    () =>
      projects.map((project) =>
        multiNightView({
          project,
          plans: host.plans,
          summaries: store.summaries,
          today: todayAt(project.place),
        }),
      ),
    [projects, host.plans, store.summaries, now],
  );
  const targetOf = (project) =>
    multiNightPlannerTarget({
      project,
      plans: host.plans,
      framings: host.framings,
      targets: host.targets,
    });
  // The seasons take a few tens of milliseconds each: worked out after the
  // cards are drawn.
  const [seasons, setSeasons] = useState({});
  const seasonKey = projects
    .map((project) => `${project.id}:${project.revision}`)
    .join(",");
  useEffect(() => {
    if (!projects.length) return undefined;
    const timer = setTimeout(() => {
      const next = {};
      for (const project of projects)
        next[project.id] = multiNightSeason({
          project,
          target: targetOf(project),
          from: todayAt(project.place),
        });
      setSeasons(next);
    }, 0);
    return () => clearTimeout(timer);
    // `targetOf` reads the planner's plans and framings, which `seasonKey`
    // and the plans' count stand for.
  }, [seasonKey, now, host.plans.length, host.framings.length]);
  return { store, projects, views, seasons, todayAt, targetOf };
}

/** One card of "En cours". */
export function MultiNightCard({ locale, view, season, onOpen }) {
  const lines = multiNightCardLines(locale, view, season);
  return (
    <article className="multi-night-card" data-project-id={view.project.id}>
      <button className="multi-night-card-open" type="button" onClick={onOpen}>
        <span className="multi-night-card-title">
          <strong>{lines.title}</strong>
          {lines.commonName && <small>{lines.commonName}</small>}
        </span>
        <span className="multi-night-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <MultiNightProgressBar locale={locale} percent={lines.percent} />
      <p className="multi-night-card-figures">
        <span>{lines.acquiredRemaining}</span>
        {lines.toDebrief && (
          <strong className="multi-night-to-debrief">{lines.toDebrief}</strong>
        )}
      </p>
      <p className="multi-night-card-line is-next">{lines.next}</p>
      <p className="multi-night-card-line is-season">{lines.season}</p>
    </article>
  );
}

/** "‹ Retour …", the way back of a screen. */
export function MultiNightBack({ label, onBack }) {
  return (
    <button
      className="btn-link multi-night-back"
      type="button"
      onClick={onBack}
    >
      ‹ {label}
    </button>
  );
}
