import {
  horizonAltitude,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import {
  accumulatedReviewReasons,
  normaliseMountSafety,
  plannerPointConstraint,
  visibilityWindows,
} from "./constraints.js";
import { targetFilterCompatibility } from "./filters.js";
import { frozenPlanTarget } from "./framings.js";
import { sortSuggestedCards, targetMatchesEquipmentGuide } from "./planner.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// Re-evaluates a planned night against the observing place's horizon profile
// and the mount's safety sectors. A target already committed to a plan is
// retained with accumulated review reasons instead of disappearing.
export function withHorizonMask(
  cards,
  mask,
  minAltitude,
  moonSeparationMinimum = 25,
  mountSafety = normaliseMountSafety(),
) {
  const normalizedMask = normaliseHorizonMask(mask);
  return cards
    .map((card) => {
      const cardMoonSeparationMinimum = Number.isFinite(
        Number(card.moonSeparationMinimum),
      )
        ? Number(card.moonSeparationMinimum)
        : moonSeparationMinimum;
      const series = card.series.map((point) => {
        const profileAltitude = normalizedMask.enabled
          ? horizonAltitude(normalizedMask, point.azimuth)
          : 0;
        const constraintState = plannerPointConstraint({
          point,
          profileAltitude,
          horizonEnabled: normalizedMask.enabled,
          minAltitude,
          moonSeparationMinimum: cardMoonSeparationMinimum,
          mountSafety,
        });
        return {
          ...point,
          ...constraintState,
        };
      });
      const context = {
        minAltitude,
        moonSeparationMinimum: cardMoonSeparationMinimum,
        mountSafety,
      };
      const windows = visibilityWindows(series, context);
      const usable = series.filter((point) => point.constraint === null);
      if (!usable.length)
        return card.retained
          ? {
              ...card,
              series,
              minAltitude,
              reviewReasons: accumulatedReviewReasons(
                card.reviewReasons,
                series.map((point) => point.constraint),
              ),
              visibilityWindows: [],
              usableMinutes: 0,
              constraints: { moonSeparationMinimum: cardMoonSeparationMinimum },
              horizon: {
                blockedCount: series.filter((point) => point.horizonBlocked)
                  .length,
              },
            }
          : null;
      const blocked = series.filter((point) => point.horizonBlocked);
      const best = usable.reduce((current, point) =>
        point.altitude > current.altitude ? point : current,
      );
      const primaryWindow = windows.reduce(
        (longest, candidate) =>
          new Date(candidate.end).getTime() -
            new Date(candidate.start).getTime() >
          new Date(longest.end).getTime() - new Date(longest.start).getTime()
            ? candidate
            : longest,
        windows[0],
      );
      const firstVisibleIndex = series.findIndex(
        (point) => point.constraint === null,
      );
      const firstBlockedIndex = series.findIndex(
        (point) => point.horizonBlocked,
      );
      return {
        ...card,
        series,
        minAltitude,
        best,
        maxAltitude: best.altitude,
        altitudeMargin: best.altitude - minAltitude,
        usableStart: primaryWindow.start,
        usableEnd: primaryWindow.end,
        visibilityWindows: windows,
        constraints: {
          moonBlockedCount: series.filter((point) => point.moonBlocked).length,
          mountBlockedCount: series.filter((point) => point.mountReason).length,
          moonSeparationMinimum: cardMoonSeparationMinimum,
        },
        horizon: {
          blockedCount: blocked.length,
          initiallyBlocked:
            firstBlockedIndex >= 0 &&
            firstVisibleIndex >= 0 &&
            firstBlockedIndex < firstVisibleIndex,
          clearTime: primaryWindow.start,
        },
      };
    })
    .filter(Boolean);
}

export function nightMinutes(night) {
  return Math.max(
    1,
    Math.round(
      (new Date(night.end).getTime() - new Date(night.start).getTime()) / 60000,
    ),
  );
}

export function availabilityWindow(card, night) {
  const total = nightMinutes(night);
  const start = clamp(
    Math.round(
      (new Date(card.usableStart).getTime() - new Date(night.start).getTime()) /
        60000,
    ),
    0,
    total,
  );
  const end = clamp(
    Math.round(
      (new Date(card.usableEnd).getTime() - new Date(night.start).getTime()) /
        60000,
    ),
    start,
    total,
  );
  return { start, end, total };
}

// A planet has its own artwork; everything else gets a survey cutout scaled
// to the object's own apparent size.
export function hipsPreviewUrl(card) {
  if (card.target.tags?.includes("planet")) return null;
  const coordinate =
    card.target.coordinate ||
    (card.best?.equatorial
      ? { ra: card.best.equatorial.ra * 15, dec: card.best.equatorial.dec }
      : null);
  if (
    !coordinate ||
    !Number.isFinite(coordinate.ra) ||
    !Number.isFinite(coordinate.dec)
  )
    return null;
  const size = Math.max(...(card.target.apparentSizeArcmin || [18, 18]));
  const fov = Math.min(2.5, Math.max(0.16, (size / 60) * 1.35));
  const parameters = new URLSearchParams({
    hips: "CDS/P/DSS2/color",
    ra: coordinate.ra.toFixed(6),
    dec: coordinate.dec.toFixed(6),
    fov: fov.toFixed(3),
    width: "320",
    height: "320",
    projection: "TAN",
    format: "jpg",
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${parameters}`;
}

export function recommendationTypeFor(target) {
  const type = target?.skyTarget?.typeKey || target?.skyTarget?.type || "";
  return type === "Complexe de nébuleuses en émission"
    ? "Nébuleuse en émission"
    : type;
}

export function recommendationCataloguesFor(target) {
  return [
    ...new Set(
      [
        target?.catalogue,
        ...(target?.catalogues || []),
        ...(target?.knowledge?.catalogues || []),
      ].filter((value) => typeof value === "string" && value),
    ),
  ];
}

// The source tabs describe distinct target libraries; a card already carrying
// review reasons is never re-offered as a fresh suggestion, and a restricted
// selection keeps only catalogue targets the equipment can actually serve.
export function recommendationSourceCards({
  cards = [],
  source = "catalogue",
  plannedTargetIds = [],
  favoriteTargetIds = [],
  restrictToEquipment = false,
  equipment = null,
} = {}) {
  const planned = new Set(plannedTargetIds);
  const favorites = new Set(favoriteTargetIds);
  const candidates =
    source === "plans"
      ? cards.filter((card) => planned.has(card.target.id))
      : source === "favorites"
        ? cards.filter(
            (card) =>
              card.target.plannerSource === "catalogue" &&
              favorites.has(card.target.id),
          )
        : cards.filter((card) => card.target.plannerSource === source);
  return candidates.filter(
    (card) =>
      !card.reviewReasons?.length &&
      (!restrictToEquipment ||
        card.target.plannerSource !== "catalogue" ||
        (targetMatchesEquipmentGuide(card.target, equipment) &&
          targetFilterCompatibility(card.target, equipment) !== false)),
  );
}

function countedOptions(cards, key, valuesFor) {
  const counts = new Map();
  for (const card of cards) {
    for (const value of valuesFor(card.target)) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.keys()]
    .sort()
    .map((value) => ({ [key]: value, count: counts.get(value) }));
}

export function recommendationTypeOptions(cards = []) {
  return countedOptions(cards, "type", (target) => [
    recommendationTypeFor(target),
  ]);
}

export function recommendationCatalogueOptions(cards = []) {
  return countedOptions(cards, "catalogue", recommendationCataloguesFor);
}

function searchKey(value, locale) {
  return String(value)
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(locale);
}

export function recommendationFilteredCards({
  cards = [],
  type = "",
  catalogue = "",
  query = "",
  locale = "fr",
} = {}) {
  const needle = query.trim();
  return cards.filter(
    (card) =>
      (!type || recommendationTypeFor(card.target) === type) &&
      (!catalogue ||
        recommendationCataloguesFor(card.target).includes(catalogue)) &&
      (!needle ||
        [
          card.target.title,
          card.target.designation,
          card.target.catalogue,
          ...(card.target.objects || []),
        ]
          .filter(Boolean)
          .some((value) =>
            searchKey(value, locale).includes(searchKey(needle, locale)),
          )),
  );
}

export function recommendationPlanFilterCounts({
  plans = [],
  sourceCards = [],
  filteredCards = [],
} = {}) {
  const sourceIds = new Set(sourceCards.map((card) => card.target.id));
  const filteredIds = new Set(filteredCards.map((card) => card.target.id));
  return plans.map((plan) => {
    const targetIds = new Set((plan.items || []).map((item) => item.id));
    return {
      id: plan.id,
      total: [...targetIds].filter((id) => sourceIds.has(id)).length,
      visible: [...targetIds].filter((id) => filteredIds.has(id)).length,
    };
  });
}

export function recommendationVisibleCards({
  cards = [],
  plans = [],
  planFilter = "",
  sort = "altitude",
} = {}) {
  const activePlanFilter = plans.some((plan) => plan.id === planFilter)
    ? planFilter
    : "";
  return sortSuggestedCards(
    cards.filter(
      (card) =>
        !activePlanFilter ||
        plans
          .find((plan) => plan.id === activePlanFilter)
          ?.items?.some((item) => item.id === card.target.id),
    ),
    sort,
  );
}

// A private relation that has not loaded yet would silently empty the tab, and
// the editorial "favorites" tier already restricts the same pool.
export function canUseFavoriteRecommendationSource({
  authenticated = false,
  favoritesStatus = "idle",
  catalogueSelection = "best",
} = {}) {
  return Boolean(
    authenticated &&
    favoritesStatus === "ready" &&
    catalogueSelection !== "favorites",
  );
}

export function targetAddDisabledReason({
  hasActivePlan = false,
  planCount = 0,
} = {}) {
  if (hasActivePlan) return null;
  return planCount
    ? "plannerAddPlanSelectionRequired"
    : "plannerAddPlanCreationRequired";
}

export function targetPlanActionState({
  selected = false,
  canAdd = false,
  editable = true,
  addDisabledReason = null,
} = {}) {
  const explanation = !selected && addDisabledReason ? addDisabledReason : null;
  const explained = Boolean(explanation);
  return {
    action: selected ? "remove" : "add",
    explanation,
    disabled: !selected && (!canAdd || explained),
    hardDisabled: !editable && !explained,
  };
}

export function primaryVisibilityWindow(card) {
  const windows = card?.visibilityWindows;
  const primary =
    windows?.find(
      (window) =>
        window.start === card.usableStart && window.end === card.usableEnd,
    ) || windows?.[0];
  if (!primary) return null;
  return {
    start: primary.start,
    end: primary.end,
    entryReason: primary.entryReason || null,
    exitReason: primary.exitReason || null,
  };
}

export function framingFitKey(card) {
  if (card?.target?.plannerSource === "framing") return "plannerFramingSaved";
  // `framing(target, field)` (`planner.js`) reports `fit: "unknown"` both
  // when the target's own size is unknown and when it is known but there is
  // no equipment field to measure it against (`occupancy` stays null
  // either way). Only "mosaic" -- the fit computed once both are known --
  // is a mosaic; every other fit, "unknown" included, reads as unknown
  // rather than silently falling into the mosaic label.
  if (card?.framing?.fit === "comfortable") return "plannerFramingComfortable";
  if (card?.framing?.fit === "tight") return "plannerFramingTight";
  if (card?.framing?.fit === "mosaic") return "plannerFramingMosaic";
  return "plannerFramingUnknown";
}

// Every conditional fact a target card renders, resolved once so the card
// itself only formats values. Horizon and Moon notes stay silent when the
// availability window already explains the same constraint.
export function targetCardSummary(card) {
  const target = card?.target || {};
  const availability = primaryVisibilityWindow(card);
  const visualStatus = card?.visual?.status || null;
  const coordinate = target.coordinate;
  const horizonExplained = Boolean(
    availability?.entryReason || availability?.exitReason,
  );
  const initiallyBlocked = Boolean(card?.horizon?.initiallyBlocked);
  return {
    availability,
    savedFramingCoordinate:
      target.plannerSource === "framing" &&
      Number.isFinite(Number(coordinate?.ra)) &&
      Number.isFinite(Number(coordinate?.dec))
        ? { ra: Number(coordinate.ra), dec: Number(coordinate.dec) }
        : null,
    capturedMarker: Boolean(
      target.plannerSource === "catalogue" && target.hasCapture,
    ),
    ownCapture: target.plannerSource === "capture",
    visualStatus,
    magnification: Number.isFinite(card?.visual?.magnification)
      ? card.visual.magnification
      : null,
    exitPupilMm: Number.isFinite(card?.visual?.exitPupilMm)
      ? card.visual.exitPupilMm
      : null,
    integrationAvailable: Boolean(
      card?.integration?.available !== false &&
      Number.isFinite(Number(card?.integration?.recommendedMinutes)),
    ),
    horizonNote:
      (card?.horizon?.blockedCount || 0) > 0 && !horizonExplained
        ? {
            initiallyBlocked,
            clearTime: initiallyBlocked ? card.horizon.clearTime : null,
          }
        : null,
    moonNote:
      (card?.constraints?.moonBlockedCount || 0) > 0
        ? { moonSeparationMinimum: card.constraints.moonSeparationMinimum }
        : null,
    showSuggestedFilter: Boolean(
      card?.filter && visualStatus === "not-applicable",
    ),
    framingKey: framingFitKey(card),
  };
}

// The order every target card's facts render in: the shared science facts first
// (window, framing centre, culmination, visual estimate), then logistics
// (direction, horizon/Moon notes, filter, framing), and the
// suggested-integration duration last -- the fact most likely to wrap to a
// second line at a narrow width, so nothing below it has to move when it does.
// `culmination` used to trail with "above minimum" (`plannerAboveMinimum`); that
// wording was dropped as redundant with the already-explicit "+X°".
export const targetCardFactOrder = [
  "window",
  "framingCenter",
  "culmination",
  "visual",
  "magnification",
  "exitPupil",
  "direction",
  "horizonNote",
  "moonNote",
  "suggestedFilter",
  "framing",
  "suggestedIntegration",
];

// Which of `targetCardFactOrder`'s facts a card actually shows, already in
// that order. Kept apart from formatting (and from any JSX) so the
// selection and ordering stay testable without rendering anything; `summary`
// is `targetCardSummary`'s own return value and the two always travel
// together. `suggestedIntegration` occupies the same logical slot `visual`/
// `magnification`/`exitPupil` do on a visual card -- an imaging card shows
// one group or the other, never both -- but unlike them it renders at the
// very end rather than right after `culmination`.
export function targetCardVisibleFacts(summary) {
  const showVisual = summary.visualStatus !== "not-applicable";
  const visible = {
    window: true,
    framingCenter: Boolean(summary.savedFramingCoordinate),
    culmination: true,
    visual: showVisual,
    magnification: showVisual && summary.magnification !== null,
    exitPupil: showVisual && summary.exitPupilMm !== null,
    direction: true,
    horizonNote: Boolean(summary.horizonNote),
    moonNote: Boolean(summary.moonNote),
    suggestedFilter: Boolean(summary.showSuggestedFilter),
    framing: true,
    suggestedIntegration: !showVisual,
  };
  return targetCardFactOrder.filter((key) => visible[key]);
}

// A fresh add lands on the card's own availability start, capped at one hour,
// and freezes the target so a later catalogue refresh cannot rewrite the plan.
export function plannedPlanItem({ card, night } = {}) {
  const availability = availabilityWindow(card, night);
  const startMinute = availability.start;
  const endMinute = Math.min(availability.end, startMinute + 60);
  const target = frozenPlanTarget(card.target);
  return {
    id: card.target.id,
    durationMinutes: Math.max(0, endMinute - startMinute),
    startMinute,
    endMinute,
    filter: card.filter || "",
    ...(target ? { target } : {}),
    // This generic "Add to plan" path is also how an *existing* framing reaches
    // a second plan (the "add an existing framing" action -- `card.target`
    // comes from `libraryFramingTargets`/`savedFramingTargets` in that case,
    // both carrying `framingId`). Without the item's own top-level `framingId`,
    // the server's `dehydratePlanItems`
    // (`packages/portal/src/persistence/plan-framing-hydration.js`) would never
    // recognise this item as a framing reference on the next save -- it reads
    // `item.framingId`, not `item.target.framingId` -- silently downgrading it
    // to an unhydrated legacy item the moment the plan reloads.
    ...(card.target.framingId ? { framingId: card.target.framingId } : {}),
  };
}

// The review reason the night's wind gives a scheduled interval: `assessment`
// is `windAssessment` against the plan's mount, and the interval runs from
// `startMinute` to `endMinute` after `nightStart` (ISO-8601 or epoch
// milliseconds). `wind-over-tolerance` when it overlaps an hour beyond a
// limit, `wind-near-tolerance` when it overlaps one at 90 % of a limit or
// more, else `null` (no forecast, no interval, a calm night).
export function scheduleItemWindReason({ item, nightStart, assessment } = {}) {
  const hours = Array.isArray(assessment?.hours) ? assessment.hours : [];
  const origin =
    typeof nightStart === "number" ? nightStart : Date.parse(nightStart ?? "");
  const startMinute = item?.startMinute;
  const endMinute = item?.endMinute;
  if (
    !hours.length ||
    !Number.isFinite(origin) ||
    typeof startMinute !== "number" ||
    typeof endMinute !== "number" ||
    !(endMinute > startMinute)
  )
    return null;
  const from = origin + startMinute * 60000;
  const to = origin + endMinute * 60000;
  let reason = null;
  for (const hour of hours) {
    if (!(hour?.time < to && hour.time + 3600000 > from)) continue;
    if (hour.level === "over") return "wind-over-tolerance";
    if (hour.level === "near") reason = "wind-near-tolerance";
  }
  return reason;
}

// How many minutes of an interval may fall outside its target's usable windows
// before it is flagged: the planner samples a target's height every ten
// minutes, so less than that is the sampling, not a choice.
export const usableWindowToleranceMinutes = 10;

// The review reason the target's own usable windows give a scheduled interval:
// the interval runs from `startMinute` to `endMinute` after `nightStart`
// (ISO-8601 or epoch milliseconds) and `windows` are the card's
// `visibilityWindows` (`{ start, end }` instants where the target satisfies the
// plan's altitude, horizon, mount and Moon constraints).
// `outside-usable-window` ("Hors du créneau utile") when ten minutes or more of
// the interval fall outside every window, else `null` — also `null` when the
// card has no windows to compare with (its own reasons already say the target
// is never usable) or the interval is not a real one. The editor still lets the
// interval cover the night: it is flagged, never refused.
export function scheduleItemUsableWindowReason({
  item,
  nightStart,
  windows,
} = {}) {
  const origin =
    typeof nightStart === "number" ? nightStart : Date.parse(nightStart ?? "");
  const startMinute = item?.startMinute;
  const endMinute = item?.endMinute;
  if (
    !Number.isFinite(origin) ||
    typeof startMinute !== "number" ||
    typeof endMinute !== "number" ||
    !(endMinute > startMinute) ||
    !Array.isArray(windows) ||
    windows.length === 0
  )
    return null;
  const from = origin + startMinute * 60000;
  const to = origin + endMinute * 60000;
  let covered = 0;
  for (const window of windows) {
    const start =
      typeof window?.start === "string" ? Date.parse(window.start) : Number.NaN;
    const end =
      typeof window?.end === "string" ? Date.parse(window.end) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start))
      continue;
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap > 0) covered += overlap;
  }
  return to - from - covered >= usableWindowToleranceMinutes * 60000
    ? "outside-usable-window"
    : null;
}

// The review reason the span of the night gives a scheduled interval: the
// interval runs from `startMinute` to `endMinute` after `nightStart`
// (ISO-8601 or epoch milliseconds, the start of the dark night the plan's
// minutes count from) and `span` is the plan's custom span `{ start, end }`
// (`customSpanOfWindow`). `outside-night-span` ("Hors de la durée choisie")
// when the interval reaches a minute or more before the span's start or
// after its end, else `null` (the whole night, no interval). Shortening the
// night never removes an interval: it is flagged instead.
export function scheduleItemNightSpanReason({ item, nightStart, span } = {}) {
  const origin =
    typeof nightStart === "number" ? nightStart : Date.parse(nightStart ?? "");
  const start =
    typeof span?.start === "string" ? Date.parse(span.start) : Number.NaN;
  const end = typeof span?.end === "string" ? Date.parse(span.end) : Number.NaN;
  const startMinute = item?.startMinute;
  const endMinute = item?.endMinute;
  if (
    !Number.isFinite(origin) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !(end > start) ||
    typeof startMinute !== "number" ||
    typeof endMinute !== "number" ||
    !(endMinute > startMinute)
  )
    return null;
  const from = origin + startMinute * 60000;
  const to = origin + endMinute * 60000;
  return start - from >= 60000 || to - end >= 60000
    ? "outside-night-span"
    : null;
}
