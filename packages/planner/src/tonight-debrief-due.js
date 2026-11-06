// A plan that is finished and waits for its
// debriefing stays visible on "Cette nuit", whatever night the page shows.
//
// A night is (the local date at the place, the place). "Cette nuit" shows ONE
// night; a plan carried out at another place, or on the evening before the
// night the page has moved on to, used to leave the page the moment its own
// night was no longer the shown one. The plans waiting are therefore read from
// the Journal's `to_debrief` lines (`loadPlanSessions`) — each attached to ITS
// night and place — and not from the night on screen.
//
// To keep the page uncluttered: only the LAST THREE nights
// (the shown night's date and the two before), at most TWO cards (a card is a
// night, the most recent first), then one line "N autres nuits à débriefer"
// that opens the Journal on "À débriefer". An older night leaves the page,
// never the Journal nor the library (the filter "À débriefer"): it is
// debriefed from there at any time, and the badge of the menu keeps reminding
// of it. The night on screen draws its own plans (their card carries the
// button).
import { message } from "portal/i18n.js";
import { nightPlaceKey } from "./tonight-overview.js";
import { localizedPlanName } from "./quick-plan-messages.js";
import { planSessionHref } from "./plan-sessions.js";
import { fill } from "./wind-section.js";

/** How many of the latest nights "Cette nuit" looks back over. */
export const tonightDebriefWindowNights = 3;

/** How many nights are drawn as a card; the others are a line. */
export const tonightDebriefMaxCards = 2;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const civil = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * The waiting nights of `plans` (the planner's plans: `{ id, name, date,
 * location }`), `waiting` being the set of the planner ids whose debriefing
 * waits. `shownDate` is the date of the night on screen and `shownPlace` its
 * place (its plans are left out).
 *
 * Returns `{ cards, others }`: `cards` the nights drawn (`{ date, placeKey,
 * placeName, plans: [{ id, name }] }`, the most recent first), `others` how
 * many other nights of the last three the line counts.
 */
export function tonightDebriefDue({
  plans = [],
  waiting = new Set(),
  shownDate = null,
  shownPlace = null,
} = {}) {
  if (typeof shownDate !== "string" || !datePattern.test(shownDate))
    return { cards: [], others: 0 };
  const [year, month, day] = shownDate.split("-").map(Number);
  const oldest = civil(
    Date.UTC(year, month - 1, day) -
      (tonightDebriefWindowNights - 1) * 86400000,
  );
  const shownKey = nightPlaceKey(shownPlace);
  const nights = new Map();
  for (const plan of Array.isArray(plans) ? plans : []) {
    if (!plan?.id || !waiting.has(String(plan.id))) continue;
    if (typeof plan.date !== "string" || !datePattern.test(plan.date)) continue;
    if (plan.date < oldest) continue;
    const placeKey = nightPlaceKey(plan.location);
    if (
      plan.date === shownDate &&
      (shownKey === null || placeKey === null || shownKey === placeKey)
    )
      continue;
    const key = `${plan.date}|${placeKey ?? ""}`;
    if (!nights.has(key))
      nights.set(key, {
        date: plan.date,
        placeKey,
        placeName: plan.location?.name || plan.location?.locality || null,
        plans: [],
      });
    nights.get(key).plans.push({ id: String(plan.id), name: plan.name ?? "" });
  }
  const ordered = [...nights.entries()]
    .sort(
      ([a, left], [b, right]) =>
        right.date.localeCompare(left.date) || a.localeCompare(b),
    )
    .map(([, night]) => night);
  return {
    cards: ordered.slice(0, tonightDebriefMaxCards),
    others: Math.max(0, ordered.length - tonightDebriefMaxCards),
  };
}

/** "2 autres nuits à débriefer": the count in the language's plural (the
 * keys' suffixes are the Journal's: `One`, `Few`, else the bare key). */
function othersText(locale, count) {
  const category = new Intl.PluralRules(locale).select(count);
  const suffix = { one: "One", few: "Few" }[category];
  return fill(message(locale, `tonightDebriefOthers${suffix ?? ""}`), {
    count: new Intl.NumberFormat(locale).format(count),
  });
}

/** "21 oct.": the night's date, short (UTC, a calendar date). */
function shortDate(date, locale) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, day, 12));
}

/**
 * The words of the zone: `due` is [tonightDebriefDue]'s answer, `sessions` the
 * `Map<plannerPlanId, entry>` of `loadPlanSessions` (the page of the debriefing
 * of each plan).
 */
export function tonightDebriefWords({ due, sessions, locale }) {
  return {
    title: message(locale, "tonightDebriefTitle"),
    status: message(locale, "plannerPlanStatusToDebrief"),
    button: message(locale, "journalDebriefSession"),
    cards: due.cards.map((night) => ({
      key: `${night.date}|${night.placeKey ?? ""}`,
      label: night.placeName
        ? fill(message(locale, "tonightDebriefNightAt"), {
            date: shortDate(night.date, locale),
            place: night.placeName,
          })
        : fill(message(locale, "nightSummaryNightOf"), {
            date: shortDate(night.date, locale),
          }),
      plans: night.plans.map((plan) => ({
        id: plan.id,
        name: plan.name ? localizedPlanName(locale, plan.name, night.date) : "",
        href: planSessionHref(locale, sessions?.get?.(plan.id)),
      })),
    })),
    others:
      due.others > 0
        ? {
            label: othersText(locale, due.others),
            href: `/${locale}/sessions?outcome=to_debrief`,
          }
        : null,
  };
}
