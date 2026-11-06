"use client";

import { useState } from "react";
import { causeLabel } from "portal/components/sessions/night-summary-view.js";
import { labelValueSeparator } from "portal/written-forms.js";
import { openMultiNightRoute } from "./client.js";
import { say } from "./copy.js";
import {
  createMultiNightDrafts,
  HeldMultiNightAllocation,
  MultiNightAllocationBlock,
  useMultiNightAllocation,
} from "./MultiNightAllocation.js";
import { AdjustGoalDialog } from "./MultiNightDialogs.js";
import {
  multiNightDayMonthShort,
  multiNightDuration,
  multiNightIssue,
  multiNightLossNights,
  multiNightNextNightPlan,
  multiNightNextWorkableDate,
  multiNightPercent,
  multiNightShortDate,
} from "./model.js";
import { MultiNightBack, MultiNightProgressBar } from "./MultiNightParts.js";

// "Avancement du plan": planned, acquired and remaining hours, the losses by
// cause, the hours acquired night by night, from the debriefings; then "Nuits
// suivantes reproposées", the assisted allocation (`MultiNightAllocation.js`),
// whose "Créer les N brouillons" is the primary action while nights are
// proposed — else "Planifier la prochaine nuit".

const CHART_NIGHTS = 6;

function PerNightChart({ locale, nights }) {
  const shown = nights.slice(-CHART_NIGHTS);
  const top = Math.max(60, ...shown.map((night) => night.plannedMinutes));
  const hours = Math.ceil(top / 60);
  const width = 300;
  const height = 150;
  const plot = 100;
  const base = 120;
  const left = 26;
  const step = (width - left) / Math.max(shown.length, 3);
  const scale = (minutes) => (minutes / (hours * 60)) * plot;
  const label = shown
    .map((night, index) =>
      say(locale, index ? "chartNext" : "chartFirst", {
        date: multiNightDayMonthShort(locale, night.date),
        acquired: multiNightDuration(locale, night.acquiredMinutes),
        planned: multiNightDuration(locale, night.plannedMinutes),
      }),
    )
    .join(" ");
  return (
    <svg
      className="multi-night-per-night-chart"
      viewBox={`0 0 ${width} ${height + 24}`}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: hours + 1 }, (_, hour) => (
        <text key={hour} x="0" y={base - scale(hour * 60) + 3}>
          {hour ? `${hour} h` : "0"}
        </text>
      ))}
      {shown.map((night, index) => {
        const x = left + index * step + step * 0.2;
        const w = step * 0.6;
        return (
          <g key={night.planId}>
            <rect
              className="multi-night-chart-frame"
              x={x}
              width={w}
              y={base - scale(night.plannedMinutes)}
              height={scale(night.plannedMinutes)}
            />
            <rect
              className="multi-night-chart-acquired"
              x={x}
              width={w}
              y={base - scale(night.acquiredMinutes)}
              height={scale(night.acquiredMinutes)}
            />
            <text
              className="multi-night-chart-value"
              x={x + w / 2}
              y={base - scale(night.plannedMinutes) - 4}
              textAnchor="middle"
            >
              {multiNightDuration(locale, night.acquiredMinutes)}
            </text>
            <text x={x + w / 2} y={base + 14} textAnchor="middle">
              {multiNightDayMonthShort(locale, night.date)}
            </text>
            <text
              className="multi-night-chart-tick"
              x={x + w / 2}
              y={base + 28}
              textAnchor="middle"
            >
              {say(locale, "chartOf", {
                duration: multiNightDuration(locale, night.plannedMinutes),
              })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MultiNightProgress({
  host,
  view,
  season,
  target,
  night = null,
  data = null,
}) {
  const { locale } = host;
  const { project, progress } = view;
  const [adjusting, setAdjusting] = useState(false);
  const allocation = useMultiNightAllocation(host, data, project.id);
  const proposed = allocation?.proposed.length ?? 0;
  const debriefed = progress.nights.filter((entry) =>
    ["done", "partial", "lost"].includes(entry.state),
  );
  const noticed = night
    ? debriefed.find((entry) => entry.planId === night) || null
    : null;
  const percent = multiNightPercent(
    progress.acquiredMinutes,
    progress.goalMinutes,
  );
  const nextDate = multiNightNextWorkableDate(
    season,
    progress.nights.map((entry) => entry.date),
  );
  const timeZone = project.place?.timeZone;
  return (
    <main className="multi-night-screen multi-night-progress-screen">
      <header className="multi-night-screen-header">
        <MultiNightBack
          label={say(locale, "progressBack")}
          onBack={() =>
            openMultiNightRoute({ screen: "detail", projectId: project.id })
          }
        />
      </header>
      <h2 className="multi-night-screen-title">
        {say(locale, "progressTitle")}
      </h2>
      {noticed && (
        <p className="multi-night-status" role="status">
          {say(locale, "progressNotice", {
            date: multiNightShortDate(locale, noticed.date),
            issue: multiNightIssue(locale, noticed),
          })}
        </p>
      )}
      <div className="multi-night-target-name">
        <h3>
          <span>{project.target?.name}</span>
          {project.target?.commonName && (
            <small>{project.target.commonName}</small>
          )}
        </h3>
        <p>
          {say(locale, "debriefedNights", {
            place: project.place?.name,
            count: debriefed.length,
          })}
        </p>
      </div>
      <section
        className="multi-night-panel"
        aria-label={say(locale, "hoursSection")}
      >
        <dl className="multi-night-hours">
          <div>
            <dt>{say(locale, "planned")}</dt>
            <dd>{multiNightDuration(locale, progress.goalMinutes)}</dd>
            <small>{say(locale, "goalWord")}</small>
          </div>
          <div className="is-acquired">
            <dt>{say(locale, "acquired")}</dt>
            <dd>{multiNightDuration(locale, progress.acquiredMinutes)}</dd>
            <small>{say(locale, "percent", { percent })}</small>
          </div>
          <div>
            <dt>{say(locale, "remainingColumn")}</dt>
            <dd>{multiNightDuration(locale, progress.remainingMinutes)}</dd>
            <small>{say(locale, "percent", { percent: 100 - percent })}</small>
          </div>
        </dl>
        <MultiNightProgressBar locale={locale} percent={percent} />
      </section>
      <section
        className="multi-night-panel"
        aria-labelledby="multi-night-losses"
      >
        <div className="multi-night-section-heading">
          <h3 id="multi-night-losses">{say(locale, "losses")}</h3>
          <span>
            {say(locale, "lossesOf", {
              lost: multiNightDuration(locale, progress.lostMinutes),
              planned: multiNightDuration(
                locale,
                progress.debriefedPlannedMinutes,
              ),
            })}
          </span>
        </div>
        {progress.lostByCause.length ? (
          <ul className="multi-night-losses">
            {progress.lostByCause.map((loss) => (
              <li key={loss.cause}>
                <p>
                  {causeLabel(locale, loss.cause)}
                  {labelValueSeparator(locale)}
                  <strong>{multiNightDuration(locale, loss.minutes)}</strong>
                </p>
                <span className="multi-night-loss-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(100, (loss.minutes / Math.max(1, progress.lostByCause[0].minutes)) * 100)}%`,
                    }}
                  />
                </span>
                <small>{multiNightLossNights(locale, loss, timeZone)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="multi-night-help">{say(locale, "noLosses")}</p>
        )}
        <p className="multi-night-help">{say(locale, "onlyUsable")}</p>
      </section>
      <section
        className="multi-night-panel"
        aria-labelledby="multi-night-per-night"
      >
        <h3 id="multi-night-per-night">{say(locale, "perNight")}</h3>
        {debriefed.length ? (
          <>
            <PerNightChart locale={locale} nights={debriefed} />
            <p className="multi-night-chart-legend">
              <span className="is-acquired">
                {say(locale, "chartAcquired")}
              </span>
              <span className="is-lost">{say(locale, "chartLost")}</span>
              <span>{say(locale, "chartFrame")}</span>
            </p>
          </>
        ) : (
          <p className="multi-night-help">{say(locale, "noDebriefedNight")}</p>
        )}
      </section>
      {host.access === "heldBack" && (
        <HeldMultiNightAllocation
          locale={locale}
          project={project}
          goalMinutes={progress.goalMinutes}
        />
      )}
      {allocation && (
        <MultiNightAllocationBlock
          locale={locale}
          allocation={allocation}
          project={project}
        />
      )}
      <footer className="multi-night-footer">
        <p className="multi-night-help">{say(locale, "fromDebriefings")}</p>
        <div className="multi-night-footer-actions">
          {host.access === "open" && (
            <button
              className="btn-tertiary"
              type="button"
              onClick={() => setAdjusting(true)}
            >
              {say(locale, "adjust")}
            </button>
          )}
          {proposed > 0 ? (
            <button
              className="btn-primary"
              type="button"
              data-allocation-create=""
              onClick={() =>
                createMultiNightDrafts(host, { project, target, allocation })
              }
            >
              {say(locale, "createDrafts", { count: proposed })}
            </button>
          ) : (
            <button
              className="btn-primary"
              type="button"
              disabled={!nextDate || host.access !== "open"}
              onClick={() =>
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
                )
              }
            >
              {say(locale, "planNext")}
            </button>
          )}
        </div>
      </footer>
      {adjusting && (
        <AdjustGoalDialog
          locale={locale}
          project={project}
          onClose={() => setAdjusting(false)}
        />
      )}
    </main>
  );
}
