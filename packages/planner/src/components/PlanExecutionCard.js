"use client";

import { useMemo } from "react";
import { StatusTag } from "portal/components/status/StatusTag.js";
import { message } from "portal/i18n.js";
import { launchedPlanOf, launchedSlotsOf } from "../plan-execution.js";
import { planFriseInput, planFriseOf } from "../plan-frise-input.js";
import { planNightWindow } from "../planner.js";
import { fill } from "../wind-section.js";
import { PlanFrise } from "./PlanFrise.js";

/**
 * "Nuit en cours" as the web says it for a plan whose night runs on a phone:
 * the tag, the sentence that says where, and the slots as they were launched —
 * the frozen `launchedSchedule`, drawn as the plan's frise and listed —
 * read-only. No control: the plan is not edited from here while its night runs.
 *
 * `execution` is `{ state: "running" | "paused" }`; `clock(iso)` writes an
 * instant in the time of the place the page shows.
 */
export function PlanExecutionTag({ locale, execution }) {
  // ONE state. "En pause" while a pause is open, and then nothing says
  // "Nuit en cours" beside it; else "Nuit en cours".
  const paused = execution?.state === "paused";
  return (
    <StatusTag
      tone="planned"
      glyph={paused ? "paused" : "running"}
      scheme={false}
      locale={locale}
      label={message(
        locale,
        paused ? "debriefStatusPaused" : "planExecutionRunning",
      )}
      data-plan-execution={execution?.state ?? "running"}
      {...(paused ? { "data-plan-execution-paused": "true" } : {})}
    />
  );
}

/**
 * "En cours sur votre téléphone", said while the night runs; a paused night
 * is not "en cours", so it says nothing of the sort.
 */
export function PlanExecutionWhere({ locale, execution, ...rest }) {
  if (execution?.state === "paused") return null;
  return (
    <p className="plan-execution-where" {...rest}>
      {message(locale, "planExecutionOnPhone")}
    </p>
  );
}

export function PlanExecutionCard({
  locale,
  plan,
  execution,
  place = null,
  timeZone,
  clock = (value) => value,
  variant = "full",
  showTag = true,
}) {
  const slots = useMemo(() => launchedSlotsOf(plan), [plan]);
  const frise = useMemo(() => {
    const launched = launchedPlanOf(plan);
    return launched
      ? planFriseOf(planFriseInput(launched, { place, timeZone }))
      : null;
  }, [plan, place, timeZone]);
  const rows = useMemo(() => {
    const window = (() => {
      try {
        return planNightWindow(plan, plan?.location ?? place);
      } catch {
        return null;
      }
    })();
    const start = Date.parse(window?.darkStart ?? "");
    return slots.map((slot) => ({
      ...slot,
      at: Number.isFinite(start)
        ? fill(message(locale, "tonightCandidateWindow"), {
            start: clock(
              new Date(start + slot.startMinute * 60000).toISOString(),
            ),
            end: clock(new Date(start + slot.endMinute * 60000).toISOString()),
          })
        : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, plan, place, locale]);
  return (
    <section
      className="plan-execution"
      data-testid="plan-execution"
      data-plan-execution-state={execution?.state ?? "running"}
      aria-label={message(
        locale,
        execution?.state === "paused"
          ? "debriefStatusPaused"
          : "planExecutionRunning",
      )}
    >
      {showTag ? (
        <p className="plan-execution-tags">
          <PlanExecutionTag locale={locale} execution={execution} />
        </p>
      ) : null}
      <PlanExecutionWhere
        locale={locale}
        execution={execution}
        data-testid="plan-execution-where"
      />
      {slots.length ? (
        <div className="plan-execution-rail" data-testid="plan-execution-rail">
          <p className="plan-execution-rail-title">
            {message(locale, "nightSummaryPlanned")}
          </p>
          {frise ? (
            <PlanFrise
              frise={frise}
              locale={locale}
              clock={clock}
              variant={variant}
            />
          ) : null}
          <ul
            className="plan-execution-slots"
            data-testid="plan-execution-slots"
          >
            {rows.map((row) => (
              <li key={row.key} data-launched-slot={row.planItemId}>
                <strong>{row.label}</strong>
                {row.at ? (
                  <span className="plan-execution-slot-time">{row.at}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p
          className="plan-execution-pending muted"
          data-testid="plan-execution-no-slots"
        >
          {message(locale, "planExecutionNoSlots")}
        </p>
      )}
    </section>
  );
}
