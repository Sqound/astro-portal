"use client";

import { useMemo, useState } from "react";
import { PlanActionsMenu } from "../../components/MultiNightEntries.js";
import { SeasonCard } from "../../components/SeasonCard.js";
import { seasonRulesLine } from "../../season-card-model.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import { archive, openMultiNightRoute, planningLocked } from "./client.js";
import { choose, say } from "./copy.js";
import {
  multiNightDuration,
  multiNightFilters,
  multiNightIntegrationOf,
  multiNightLineDate,
  multiNightNextNightPlan,
  multiNightNextWorkableDate,
  multiNightNightLine,
  multiNightPercent,
  multiNightSeasonEndCause,
  projectDateAfter,
} from "./model.js";
import {
  multiNightUnplacedText,
  useMultiNightAllocation,
} from "./MultiNightAllocation.js";
import { MultiNightBack, MultiNightProgressBar } from "./MultiNightParts.js";
import { MultiNightAddAction, nightName } from "./MultiNightNights.js";
import { nightSessionHref, splitProjectNights } from "../nights.js";
import { integrationText } from "portal/components/sessions/night-detail-view.js";
import { message } from "portal/i18n.js";
import { journalStatisticsHref } from "portal/components/sessions/journal-list-view.js";
import {
  MultiNightIntegrations,
  useProjectDetail,
} from "./MultiNightIntegrations.js";

// "Plan multi-nuits" — the detail of one: its progress, its equipment and
// place, its season and the nights of the plan, then "Planifier la prochaine
// nuit". The proposed nights of an assisted allocation are not built: the
// remaining hours are said. "Intégrations" and "Image du plan" come after
// "Nuits du plan" (`MultiNightIntegrations.js`).

/**
 * A night of the promise ("À venir"): a plan of the planner not run yet —
 * its date, "3 h 00 prévues · 21:29 → 00:29", "Planifié", "Ouvrir le plan".
 */
function UpcomingRow({ host, row, plan }) {
  const { locale } = host;
  const night = row.planner;
  if (!night)
    // A night the planner does not hold (a session still open or paused).
    return (
      <li className="multi-night-night is-planned" data-upcoming="service">
        <span className="multi-night-night-row">
          <span className="multi-night-night-date">
            {multiNightLineDate(locale, row.date)}
          </span>
          <span className="multi-night-night-line">
            <strong>{nightName(locale, row.night)}</strong>
          </span>
        </span>
      </li>
    );
  const parts = multiNightNightLine(locale, night, plan?.location?.timeZone);
  return (
    <li className="multi-night-night is-planned" data-upcoming="plan">
      <button
        className="multi-night-night-row has-chip"
        type="button"
        onClick={() => plan && host.openPlan(plan.id)}
        disabled={!plan}
      >
        <span className="multi-night-night-date">
          {multiNightLineDate(locale, night.date)}
        </span>
        <span className="multi-night-night-line">{parts.join(" · ")}</span>
        <span className="planner-plan-status is-planned">
          {message(locale, "plannerPlanStatusPending")}
        </span>
        <span className="multi-night-night-open">
          {say(locale, "openPlanShort")}
        </span>
      </button>
    </li>
  );
}

/** The word on a session done: "Exécutée", "En partie", "À débriefer". */
function sessionChip(locale, night, planner) {
  if (night?.state === "to_debrief")
    return { key: "toDebrief", text: say(locale, "sessionToDebrief") };
  if (planner?.state === "partial")
    return { key: "partial", text: say(locale, "sessionPartial") };
  if (planner?.state === "lost")
    return { key: "abandoned", text: say(locale, "sessionNotExecuted") };
  return { key: "executed", text: say(locale, "sessionExecuted") };
}

/**
 * A session done ("Sessions faites"): its date, what it gave, its issue and
 * "Voir la session" — the whole row opens the session's page (a session
 * attached afterwards is there like the others; a night still to debrief
 * opens its debriefing). A night only the planner knows keeps its old row.
 */
function SessionRow({ host, row, plan }) {
  const { locale } = host;
  if (row.kind === "planner") {
    const night = row.planner;
    const parts = multiNightNightLine(locale, night, plan?.location?.timeZone);
    return (
      <li className={`multi-night-night is-${night.state}`}>
        <button
          className="multi-night-night-row"
          type="button"
          onClick={() => plan && host.openPlan(plan.id)}
          disabled={!plan}
        >
          <span className="multi-night-night-date">
            {multiNightLineDate(locale, night.date)}
          </span>
          <span className="multi-night-night-line">
            <strong>{choose(locale, "outcome", night.state)}</strong>
            {parts.map((part) => ` · ${part}`).join("")}
          </span>
          <span className="multi-night-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </li>
    );
  }
  const { night, planner } = row;
  const chip = sessionChip(locale, night, planner);
  const href = nightSessionHref(locale, night);
  const parts = [
    nightName(locale, night),
    planner && ["done", "partial"].includes(planner.state)
      ? multiNightDuration(locale, planner.acquiredMinutes)
      : null,
    night.integrationCount > 0
      ? say(locale, "nightSync", {
          duration: integrationText(night.integrationSeconds, locale),
        })
      : null,
  ].filter(Boolean);
  const content = (
    <>
      <span className="multi-night-night-date">
        {multiNightLineDate(locale, row.date)}
      </span>
      <span className="multi-night-night-line">{parts.join(" · ")}</span>
      <span className={`planner-plan-status is-${chip.key}`}>{chip.text}</span>
      <span className="multi-night-night-open">
        {say(locale, "seeSession")}
      </span>
    </>
  );
  return (
    <li
      className="multi-night-night is-done"
      data-session-night={night.sessionId ?? night.planId}
      data-own-link-night={night.link === "night" ? night.sessionId : undefined}
      data-state={night.state}
    >
      {href ? (
        <a className="multi-night-night-row has-chip" href={href}>
          {content}
        </a>
      ) : (
        <span className="multi-night-night-row has-chip">{content}</span>
      )}
    </li>
  );
}

export function MultiNightDetail({ host, view, season, target, data = null }) {
  const { locale } = host;
  const { project, progress } = view;
  const allocation = useMultiNightAllocation(host, data, project.id);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const percent = multiNightPercent(
    progress.acquiredMinutes,
    progress.goalMinutes,
  );
  const recommended = useMemo(
    () =>
      target
        ? (multiNightIntegrationOf({
            integration: host.integrationFor(target, project.equipment),
          })?.recommended ?? null)
        : null,
    [target, project.equipment],
  );
  const maskOn = normaliseHorizonMask(project.place?.horizonMask).enabled;
  const nights = progress.nights;
  // One read of the plan gives the nights with their state ("À venir" /
  // "Sessions faites"), the integrations and whether every session is done.
  const [detail, reloadDetail] = useProjectDetail(project);
  const { upcoming, done } = splitProjectNights({
    plannerNights: nights,
    serviceNights: detail?.nights,
  });
  const allSessionsDone = detail?.allSessionsDone === true;
  const plannerPlanOf = (row) =>
    view.plansById[row.planner?.planId] ??
    view.plansById[row.night?.planId] ??
    null;
  const addLocked = planningLocked(host.capabilities, {
    hosted: host.hosted !== false,
  });
  const nextDate = multiNightNextWorkableDate(
    season,
    nights.map((night) => night.date),
  );
  const planNext = () => {
    if (!nextDate) return;
    host.addPlanForNight(
      multiNightNextNightPlan({
        project,
        target,
        date: nextDate,
        durationMinutes: Math.max(
          60,
          Math.min(720, progress.remainingMinutes || 60),
        ),
      }),
    );
  };
  const seasonEnd =
    season?.state === "ends" && season.workableUntil && target
      ? multiNightSeasonEndCause({
          project,
          target,
          dayAfter: projectDateAfter(season.workableUntil, 1),
        })
      : null;
  const rules = seasonRulesLine(locale, {
    constraints: project.constraints,
    filters: multiNightFilters(project),
    place: project.place,
    target,
  });
  const progressPanel = (
    <section
      className="multi-night-panel"
      aria-label={say(locale, "progressSection")}
    >
      <p className="multi-night-acquired">
        <strong>{multiNightDuration(locale, progress.acquiredMinutes)}</strong>{" "}
        {say(locale, "acquiredOf", {
          goal: multiNightDuration(locale, progress.goalMinutes),
        })}
        <span className="multi-night-percent">
          {say(locale, "percent", { percent })}
        </span>
      </p>
      <MultiNightProgressBar locale={locale} percent={percent} />
      <p className="multi-night-remaining">
        <strong>
          {say(locale, "remaining", {
            duration: multiNightDuration(locale, progress.remainingMinutes),
          })}
        </strong>
        <button
          className="btn-link"
          type="button"
          onClick={() =>
            openMultiNightRoute({ screen: "progress", projectId: project.id })
          }
        >
          {say(locale, "seeDetail")}
        </button>
      </p>
      <p className="multi-night-help">
        {recommended
          ? say(locale, "goalNote", {
              goal: multiNightDuration(locale, project.goalMinutes),
              recommended: multiNightDuration(locale, recommended),
            })
          : say(locale, "goalNoteNoAdvice", {
              goal: multiNightDuration(locale, project.goalMinutes),
            })}
      </p>
    </section>
  );
  const equipmentPanel = (
    <section
      className="multi-night-panel"
      aria-label={say(locale, "equipmentAndPlace")}
    >
      <dl className="multi-night-facts">
        <div>
          <dt>{say(locale, "keptEquipment")}</dt>
          <dd>
            {host.equipmentName(project.equipment) ||
              say(locale, "formEquipmentDefault")}
          </dd>
        </div>
        <div>
          <dt>{say(locale, "keptPlace")}</dt>
          <dd>
            {maskOn
              ? say(locale, "placeWithMask", { place: project.place?.name })
              : project.place?.name}
          </dd>
        </div>
      </dl>
    </section>
  );
  // The card's "étendre" button: the year of the same target by the same
  // rules, worked out only once it is asked for.
  const yearFrom = season?.nights?.[0]?.date;
  const yearArgs =
    target && yearFrom
      ? {
          target,
          place: project.place,
          constraints: project.constraints,
          filters: multiNightFilters(project),
          from: yearFrom,
        }
      : null;
  const seasonSection = (
    <SeasonCard
      locale={locale}
      season={season}
      rules={rules}
      endCause={seasonEnd}
      yearArgs={yearArgs}
      trailing={
        <button
          className="btn-link"
          type="button"
          onClick={() =>
            openMultiNightRoute({ screen: "calendar", projectId: project.id })
          }
        >
          {say(locale, "calendarTitle")}
        </button>
      }
    />
  );
  return (
    <main className="multi-night-screen multi-night-detail">
      <header className="multi-night-screen-header">
        <MultiNightBack
          label={say(locale, "back")}
          onBack={() => openMultiNightRoute({ screen: "list" })}
        />
        <PlanActionsMenu
          label={say(locale, "more")}
          items={[
            {
              key: "archive",
              label: say(locale, "archive"),
              onSelect: () => setConfirmArchive(true),
            },
          ]}
        />
      </header>
      {/* « Planifier la prochaine nuit », the one primary, at the right of the title; it is gone once every session is done. */}
      <div className="multi-night-title-row">
        <div className="multi-night-title-block">
          <p className="eyebrow">{say(locale, "eyebrow")}</p>
          <h2 className="multi-night-target-name">
            <span>{project.target?.name}</span>
            {project.target?.commonName && (
              <small>{project.target.commonName}</small>
            )}
          </h2>
          {/* Every night of the plan's target. */}
          {project.target?.targetId ? (
            <p className="multi-night-statistics">
              <a
                className="btn-link"
                href={journalStatisticsHref(locale, {
                  target: project.target.targetId,
                })}
                data-testid="multi-night-statistics-link"
              >
                {message(locale, "journalStatisticsAllNightsOf").replace(
                  "{target}",
                  project.target.name ?? project.target.targetId,
                )}
              </a>
            </p>
          ) : null}
        </div>
        {allSessionsDone ? null : (
          <button
            className="btn-primary multi-night-plan-next"
            type="button"
            disabled={!nextDate || host.access !== "open"}
            onClick={planNext}
          >
            {say(locale, "planNext")}
          </button>
        )}
      </div>
      {!nextDate && season && !allSessionsDone ? (
        <p className="multi-night-help">{say(locale, "noWorkableNight")}</p>
      ) : null}
      <div className="multi-night-columns">
        <div className="multi-night-column is-promise">
          {!allSessionsDone &&
          (upcoming.length || progress.unplacedMinutes > 0) ? (
            <section
              className="multi-night-section"
              aria-labelledby="multi-night-upcoming"
              data-multi-night-part="upcoming"
            >
              <div className="multi-night-section-heading">
                <h3 id="multi-night-upcoming">{say(locale, "upcoming")}</h3>
              </div>
              {upcoming.length ? (
                <ul className="multi-night-nights">
                  {upcoming.map((row) => (
                    <UpcomingRow
                      key={row.planner?.planId ?? row.night?.planId ?? row.date}
                      host={host}
                      row={row}
                      plan={plannerPlanOf(row)}
                    />
                  ))}
                </ul>
              ) : null}
              {progress.unplacedMinutes > 0 &&
                (host.access === "open" ? (
                  <button
                    className="multi-night-unplaced is-link"
                    type="button"
                    onClick={() =>
                      openMultiNightRoute({
                        screen: "progress",
                        projectId: project.id,
                      })
                    }
                  >
                    <span>
                      {multiNightUnplacedText(
                        locale,
                        progress.unplacedMinutes,
                        allocation,
                      )}
                    </span>
                    <span className="multi-night-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ) : (
                  <p className="multi-night-unplaced">
                    {multiNightUnplacedText(
                      locale,
                      progress.unplacedMinutes,
                      null,
                    )}
                  </p>
                ))}
            </section>
          ) : null}
          <section
            className="multi-night-section"
            aria-labelledby="multi-night-sessions-done"
            data-multi-night-part="done"
          >
            <div className="multi-night-section-heading">
              <h3 id="multi-night-sessions-done">
                {say(locale, "sessionsDone")}
              </h3>
            </div>
            {done.length ? (
              <ul className="multi-night-nights">
                {done.map((row) => (
                  <SessionRow
                    key={
                      row.night?.sessionId ??
                      row.night?.planId ??
                      row.planner?.planId ??
                      row.date
                    }
                    host={host}
                    row={row}
                    plan={plannerPlanOf(row)}
                  />
                ))}
              </ul>
            ) : (
              <p className="multi-night-help">{say(locale, "noNights")}</p>
            )}
          </section>
          {/* The nights of the journal that are not in the plan yet. */}
          {project.status === "active" && (
            <MultiNightAddAction
              locale={locale}
              project={project}
              locked={addLocked}
            />
          )}
        </div>
        <div className="multi-night-column is-figures">
          {progressPanel}
          {/* The lines of the sessions, then Astro Sync's, and the plan image. */}
          <MultiNightIntegrations
            host={host}
            project={project}
            detail={detail}
            onReload={reloadDetail}
          />
        </div>
      </div>
      {equipmentPanel}
      {seasonSection}
      {confirmArchive && (
        <WebDialog
          className="multi-night-dialog"
          closeLabel={say(locale, "close")}
          onClose={() => setConfirmArchive(false)}
          title={say(locale, "archive")}
          footer={
            <>
              <button
                className="btn-link"
                type="button"
                onClick={() => setConfirmArchive(false)}
              >
                {say(locale, "cancel")}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={async () => {
                  setConfirmArchive(false);
                  await archive(project).catch(() => null);
                  openMultiNightRoute({ screen: "list" });
                }}
              >
                {say(locale, "archive")}
              </button>
            </>
          }
        >
          <p>{say(locale, "archiveConfirm")}</p>
        </WebDialog>
      )}
    </main>
  );
}
