// The words of a plan's dialog in the web library: the name, the state
// and the sync line, the framed block (the night and its time left, the place
// and its Bortle, the rig and its mode, the astronomical night), the read-only
// line of a plan that is no longer pending, "N cibles · … placées", the
// targets in the order of the night with their score for the slot, and which
// actions the dialog offers. Kept apart from the component so it is tested
// without rendering.
import { localizedPlanName } from "./quick-plan-messages.js";
import { message } from "portal/i18n.js";
import { durationText, scoreOn100 } from "portal/written-forms.js";
import { planDetailsWords } from "./components/PlanDetailsRows.js";
import {
  planLibraryStatus,
  planLibraryStatusKey,
  planNightWindow,
} from "./planner.js";
import {
  planSessionHref,
  planSessionLine,
  planToDebrief,
} from "./plan-sessions.js";
import { planTimeLeft, planTimeLeftText } from "./plan-time-left.js";
import { planStatusTags } from "./plan-library-filters.js";
import { planDisplayTags } from "./plan-readiness.js";
import {
  planTargetCount,
  tonightDate,
  tonightPlanCard,
} from "./tonight-overview.js";
import { fill } from "./wind-section.js";

const day = 86400000;
const dayNumber = (date) => Math.round(Date.parse(`${date}T12:00:00Z`) / day);

const statusOf = (plan) => {
  const status = String(plan?.status || "pending");
  return status === "active" ? "pending" : status;
};

/**
 * `"tonight"` for a pending plan whose night is the one the place is in (until
 * that night is over), `"later"` for another pending plan, `"past"` for a plan
 * that is no longer pending (executed, abandoned, archived). The web runs no
 * plan (no execution page): tonight's plan has the actions of a
 * later one.
 */
export function planSheetKind(plan, { now = Date.now() } = {}) {
  if (statusOf(plan) !== "pending") return "past";
  const left = planTimeLeft({
    date: plan?.date,
    location: plan?.location ?? null,
    darkness: plan?.darkness,
    now,
  });
  return left && left.kind !== "inDays" ? "tonight" : "later";
}

/** How many days ago a past night was (at least 1); `null` otherwise. */
export function planDaysAgo(plan, { now = Date.now() } = {}) {
  const date = plan?.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  if (
    planTimeLeft({
      date,
      location: plan?.location ?? null,
      darkness: plan?.darkness,
      now,
    })
  )
    return null;
  const lived = tonightDate({ now, place: plan?.location ?? null });
  if (date > lived) return null;
  return Math.max(1, dayNumber(lived) - dayNumber(date));
}

function shortDate(date, locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}

/**
 * "Ce soir · mer. 14 oct. · commence dans 1 h 39", "Sam. 17 oct. · dans 3
 * jours", "Sam. 10 oct. · il y a 4 jours".
 */
export function planSheetNightLine(locale, plan, { now = Date.now() } = {}) {
  const date = plan?.date;
  if (typeof date !== "string" || !date) return "";
  const shown = shortDate(date, locale);
  const left = planTimeLeft({
    date,
    location: plan?.location ?? null,
    darkness: plan?.darkness,
    now,
  });
  if (left && left.kind !== "inDays")
    return [
      message(locale, "planTimeLeftTonight"),
      shown,
      planTimeLeftText(locale, left),
    ]
      .filter(Boolean)
      .join(" · ");
  const opening = shown ? `${shown[0].toUpperCase()}${shown.slice(1)}` : "";
  if (left) return [opening, planTimeLeftText(locale, left)].join(" · ");
  const ago = planDaysAgo(plan, { now });
  return ago === null
    ? opening
    : [
        opening,
        message(
          locale,
          ago === 1 ? "planTimeLeftDaysAgoOne" : "planTimeLeftDaysAgo",
        ).replace("{count}", String(ago)),
      ].join(" · ");
}

const darknessKeys = {
  nautical: "plannerDarknessNautical",
  civil: "plannerDarknessCivil",
};

/**
 * Everything the dialog shows, in order. `clock(iso)` writes an hour in the
 * place's time; `rigName` is the name the planner resolves for the plan's
 * equipment; `nights` the score of each item for its slot (`scorePlanTargets`,
 * keyed by the item's index); `unsyncedLabel` the badge of a plan kept in this
 * browser.
 */
export function planSheetWords(
  locale,
  plan,
  {
    now = Date.now(),
    clock = (value) => value,
    rigName = "",
    nights = {},
    unsyncedLabel = null,
    // What the Journal says of the plan (`plan-sessions.js`), or `null`.
    session = null,
    // The plan's night runs on another device (`{ state }`): "Nuit en cours",
    // read-only, the dialog draws the card of the launched slots.
    execution = null,
  } = {},
) {
  const status = statusOf(plan);
  const kind = planSheetKind(plan, { now });
  const details = planDetailsWords(locale, plan, { clock, rigName });
  let window = null;
  try {
    window = planNightWindow(
      { date: plan?.date, darkness: plan?.darkness },
      plan?.location ?? null,
    );
  } catch {
    window = null;
  }
  const card = tonightPlanCard(plan, plan?.location ?? null);
  const count = planTargetCount(plan);
  const targets = message(
    locale,
    count === 1 ? "nightSummaryTargetCountOne" : "nightSummaryTargetCountOther",
  ).replace("{count}", String(count));
  const placed = card.items.reduce(
    (sum, item) => sum + (Number.isFinite(item.minutes) ? item.minutes : 0),
    0,
  );
  const rows = card.items.map((item) => {
    const night = nights?.[item.index] ?? null;
    const score = night?.score ? scoreOn100(night.score) : null;
    return {
      key: item.key,
      item,
      night,
      designation: item.designation,
      name: item.name,
      score: score === null ? null : String(score),
      slot:
        item.start && item.end
          ? [
              fill(message(locale, "tonightCandidateWindow"), {
                start: clock(item.start),
                end: clock(item.end),
              }),
              Number.isFinite(item.minutes)
                ? durationText(item.minutes, locale)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
    };
  });
  const readOnlyKey = {
    executed: "plannerPlanReadOnlyExecuted",
    partial: "plannerPlanReadOnlyPartial",
    abandoned: "plannerPlanReadOnlyAbandoned",
    archived: "plannerPlanReadOnlyArchived",
  }[status];
  return {
    kind,
    title: plan?.name
      ? localizedPlanName(locale, plan.name, plan.date)
      : message(locale, "plannerUntitledPlan"),
    // The plan's one status ("À débriefer" is the Journal's).
    state: message(
      locale,
      planLibraryStatusKey(
        planLibraryStatus(plan, { toDebrief: planToDebrief(session) }),
      ),
    ),
    stateKey: planLibraryStatus(plan, { toDebrief: planToDebrief(session) }),
    // "Exécuté" then "À débriefer" for an executed plan whose
    // session waits for its debriefing; one tag otherwise.
    tags: planDisplayTags(
      plan,
      planStatusTags(plan, { toDebrief: planToDebrief(session) }),
    ),
    status,
    // A plan debriefed whose session was deleted ("Session
    // manquante"); it can be made again from the plan.
    sessionMissing: session?.state === "missing",
    sync: unsyncedLabel || message(locale, "plannerSyncSynced"),
    night: planSheetNightLine(locale, plan, { now }),
    place: details.place,
    rig: details.rig,
    darkness:
      window?.darkStart && window?.darkEnd
        ? fill(message(locale, "planSheetNightRow"), {
            darkness: message(
              locale,
              darknessKeys[plan?.darkness] || "plannerAstronomicalNight",
            ),
            start: clock(window.darkStart),
            end: clock(window.darkEnd),
          })
        : null,
    readOnly: readOnlyKey ? message(locale, readOnlyKey) : null,
    // What the plan's session gave and the page "Voir la session"
    // opens; nothing on a plan to come (it has no session).
    sessionLine: planSessionLine(locale, session, placed),
    sessionHref:
      session?.state === "missing" ? null : planSessionHref(locale, session),
    heading:
      placed > 0
        ? fill(message(locale, "planSheetTargetsPlaced"), {
            targets,
            placed: durationText(placed, locale),
          })
        : targets,
    rows,
    // The web's store edits a pending plan whose debriefing is not waiting,
    // and whose night does not run on another device.
    canEdit: status === "pending" && !planToDebrief(session) && !execution,
    execution,
  };
}
