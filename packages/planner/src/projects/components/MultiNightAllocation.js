"use client";

import { useEffect, useMemo, useState } from "react";
import { LockedCard, LockedChip } from "../../offers-slot.js";
import { allocateRemainingHours } from "../allocation.js";
import { multiNightCalendar } from "../multi-night-calendar.js";
import { say } from "./copy.js";
import {
  multiNightAllocationInput,
  multiNightAllocationNights,
  multiNightAllocationOf,
  multiNightAllocationReason,
  multiNightAllocationSentences,
  multiNightAllocationTitle,
  multiNightClock,
  multiNightDateList,
  multiNightDraftPlan,
  multiNightDuration,
  multiNightFilterKind,
  multiNightLineDate,
  multiNightPlaceDiffers,
  readAvailableNights,
} from "./model.js";

// The assisted allocation of the remaining hours of a multi-night plan on the
// web: "Nuits suivantes reproposées" in "Avancement du plan", the line "5 h
// restent à placer: 2 nuits proposées, 10 et 17 oct." of the detail, and "Créer
// les N brouillons", one ordinary draft per proposed night through the host's
// `addPlanForNight` — the function of "Planifier la prochaine nuit". Nothing is
// stored: the proposals are worked out again from the plans, the calendar and
// the nights declared in this browser.

/**
 * The allocation of `projectId` with every plan followed at its place, or
 * `null` (not open, not ready, or `data` absent). The nights take a few
 * tenths of a second: worked out after the screen is drawn.
 */
export function useMultiNightAllocation(host, data, projectId) {
  const open = host.access === "open" && Boolean(data);
  const all = data?.projects ?? [];
  const plans = host.plans || [];
  const anchor = all.find((project) => project.id === projectId) || null;
  const today = data && anchor ? data.todayAt(anchor.place) : null;
  const projects = useMemo(
    () =>
      anchor
        ? all.filter(
            (project) =>
              project.status === "active" &&
              !multiNightPlaceDiffers(project.place, anchor),
          )
        : [],
    [all, anchor],
  );
  const key = projects
    .map((project) => `${project.id}:${project.revision}`)
    .join(",");
  const [calendar, setCalendar] = useState(null);
  const [weather, setWeather] = useState(null);
  const [available, setAvailable] = useState([]);
  useEffect(() => {
    if (today) setAvailable(readAvailableNights(today));
  }, [today]);
  useEffect(() => {
    if (!open || !anchor) return undefined;
    const timer = setTimeout(() => {
      try {
        setCalendar(
          multiNightCalendar({
            projects: projects.map((project) => ({
              id: project.id,
              target: data.targetOf(project),
              constraints: project.constraints,
              filters: project.equipment?.filterIds || [],
            })),
            place: anchor.place,
            from: today,
            nights: multiNightAllocationNights,
          }),
        );
      } catch {
        setCalendar(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, key, today, plans.length]);
  useEffect(() => {
    if (!open || !anchor?.place) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({
      latitude: String(anchor.place.latitude),
      longitude: String(anchor.place.longitude),
    });
    fetch(`/api/v1/weather?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setWeather(payload?.daily || null))
      .catch(() => {});
    return () => controller.abort();
  }, [open, anchor?.place?.latitude, anchor?.place?.longitude]);
  return useMemo(() => {
    if (!open || !calendar?.nights) return null;
    const views = data.views.filter((view) =>
      projects.some((project) => project.id === view.project.id),
    );
    const result = allocateRemainingHours(
      multiNightAllocationInput({
        views,
        seasons: data.seasons,
        nights: calendar.nights,
        available,
        weather,
        plans,
        today,
      }),
    );
    const allocation = multiNightAllocationOf(result, projectId);
    if (!allocation) return null;
    return {
      ...allocation,
      names: Object.fromEntries(
        views.map((view) => [view.project.id, view.project.target?.name || ""]),
      ),
    };
  }, [
    open,
    calendar,
    data?.views,
    data?.seasons,
    available,
    weather,
    host.plans,
  ]);
}

/**
 * "Créer les N brouillons": one draft per proposed night of `allocation`,
 * through `addPlanForNight` without leaving the screen. The number written.
 */
export function createMultiNightDrafts(host, { project, target, allocation }) {
  let created = 0;
  for (const row of allocation.proposed) {
    const id = host.addPlanForNight(
      multiNightDraftPlan({ project, target, row }),
      { open: false },
    );
    if (!id) break;
    created += 1;
  }
  return created;
}

/** "Nuits suivantes reproposées", its sentences and its rows. */
export function MultiNightAllocationBlock({ locale, allocation, project }) {
  const timeZone = project.place?.timeZone || null;
  const filterKind = multiNightFilterKind(project);
  return (
    <section
      className="multi-night-allocation"
      aria-labelledby="multi-night-allocation-title"
      data-allocation-state={allocation.summary.state}
    >
      <div className="multi-night-allocation-heading">
        <h3 id="multi-night-allocation-title">
          {multiNightAllocationTitle(locale, allocation.rows)}
        </h3>
        {multiNightAllocationSentences(locale, allocation).map((sentence) => (
          <p key={sentence} className="multi-night-help">
            {sentence}
          </p>
        ))}
      </div>
      {allocation.rows.length > 0 && (
        <ul className="multi-night-allocation-rows">
          {allocation.rows.map((row) => {
            const reason = multiNightAllocationReason(locale, row, {
              names: allocation.names,
              filterKind,
              timeZone,
            });
            return (
              <li
                key={`${row.date}-${row.planId || "proposed"}`}
                className={`multi-night-allocation-row is-${row.status}`}
                data-date={row.date}
              >
                <p className="multi-night-allocation-line">
                  <strong>{multiNightLineDate(locale, row.date)}</strong>
                  <span className="multi-night-allocation-duration">
                    {multiNightDuration(locale, row.durationMinutes)}
                  </span>
                </p>
                <p className="multi-night-allocation-span">
                  {row.start && row.end && (
                    <span>
                      {`${multiNightClock(row.start, timeZone)} → ${multiNightClock(row.end, timeZone)}`}
                    </span>
                  )}
                  <span className="multi-night-allocation-chip">
                    {say(
                      locale,
                      row.status === "existing"
                        ? "allocationExisting"
                        : "allocationProposed",
                    )}
                  </span>
                </p>
                {reason && <p className="multi-night-help">{reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * "5 h restent à placer : 2 nuits proposées, 10 et 17 oct." — the line of
 * the detail; "5 h restent à placer" alone while nothing is proposed.
 */
export function multiNightUnplacedText(locale, unplacedMinutes, allocation) {
  const duration = multiNightDuration(locale, unplacedMinutes);
  const proposed = allocation?.proposed ?? [];
  if (!proposed.length) return say(locale, "unplaced", { duration });
  return say(locale, "unplacedProposed", {
    duration,
    nights: say(locale, "proposedNights", { count: proposed.length }),
    dates: multiNightDateList(
      locale,
      proposed.map((row) => row.date),
    ),
  });
}

/**
 * Held back (place 5): where the allocation would sit on a multi-night plan,
 * the chip and the multi-night lock card. The plan's own hours are not
 * tonight's, so the card carries no figure — its headline names the goal.
 */
export function HeldMultiNightAllocation({ locale, project, goalMinutes }) {
  const total = multiNightDuration(locale, goalMinutes);
  return (
    <section
      className="multi-night-allocation is-held"
      aria-labelledby="multi-night-allocation-title"
      data-allocation-state="held"
    >
      <div className="multi-night-allocation-heading">
        <h3 id="multi-night-allocation-title">
          {say(locale, "allocationTitleEmpty")}
        </h3>
        <LockedChip locale={locale} feature="multiNight" />
      </div>
      <LockedCard
        locale={locale}
        kind="multiNight"
        feature="multiNight"
        noGain
        data={{
          target: project.target?.name || "",
          total,
          tonight: total,
          other: total,
          tonightFraction: 0,
        }}
      />
    </section>
  );
}
