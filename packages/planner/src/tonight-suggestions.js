import {
  fieldOfView,
  equipmentProfilesFromInventory,
  planNight,
  planNightSpanSky,
  planningTargets,
  resolveEquipment,
} from "./planner.js";
import { withHorizonMask } from "./recommendations.js";
import { targetTonightScore } from "./target-score.js";
import { targetNightPath } from "./target-path.js";
import { normalizeWindTolerance } from "./wind.js";
import { suggestNight } from "./suggest-night.js";
import { suggestionSeed } from "./suggestion-seed.js";
import { targetIdsTakenOnNight } from "./night-taken-targets.js";
import { maskHiddenWindows } from "./suggest-filters.js";
import { visualInventoryOf } from "./visual-pairs.js";
import {
  moonUpIntervals,
  tonightCandidateNote,
  tonightTargetNames,
} from "./tonight-overview.js";

/** The engine's ten independent placements for the displayed night. */
export function tonightSuggestions({
  candidates = [],
  plans = [],
  place,
  date,
  night,
  tier = 1,
  ...inputs
}) {
  if (!place || !night) return { items: [], candidates: [] };
  const proposal = suggestNight({
    ...inputs,
    candidates,
    date,
    night: { start: night.darkStart, end: night.darkEnd },
    moonSeries: night.moonSeries,
    // What the other plans of the night hold, of the nature of the rig the
    // list is made for (photo with photo, visual with visual).
    excluded: targetIdsTakenOnNight(plans, {
      date,
      visual: inputs.mode === "visual",
    }),
    seed: suggestionSeed({
      date,
      latitude: place.latitude,
      longitude: place.longitude,
      tier,
    }),
    tier,
    count: 10,
    layout: "list",
  });
  if (!proposal) return { items: [], candidates: [] };
  const intervals = moonUpIntervals(night.moonSeries);
  return {
    ...proposal,
    candidates: proposal.items.flatMap((item) => {
      const source = candidates.find(
        ({ card }) => card.target.id === item.target.id,
      );
      if (!source) return [];
      const target = source.card.target;
      const window = item.bestWindow;
      return [
        {
          id: item.target.id,
          ...tonightTargetNames(target),
          windowStart: window?.start ?? null,
          windowEnd: window?.end ?? null,
          maxAltitude: item.maxAltitude ?? null,
          // Its rank in the proposal (« 12ᵉ »): the list is laid out by start.
          rank: item.rank ?? null,
          note: tonightCandidateNote(
            source.card,
            window
              ? { start: Date.parse(window.start), end: Date.parse(window.end) }
              : null,
            intervals,
          ),
          card: source.card,
          // SUGGEST-FILTERS-01: over the periods ticked, the note is the
          // engine's (recomputed on them), the criteria the night's.
          score:
            proposal.spans && item.score && source.score
              ? { ...source.score, total: item.score.total }
              : source.score,
          // The mask ignored: the stretch of its window behind it.
          maskHidden: item.maskHidden ?? null,
        },
      ];
    }),
  };
}

/** In-memory only: navigation keeps the tier, a new place/date resets it. */
let position = { key: null, tier: 1, exhausted: false };
export function tonightSuggestionPosition(key, update) {
  if (position.key !== key) position = { key, tier: 1, exhausted: false };
  if (update) position = { ...position, ...update };
  return { ...position };
}

/** Re-score a destination's own night, constraints, horizon and equipment. */
export function tonightPlacementInputs({
  plan,
  targets,
  locale,
  hourly = [],
  skyQuality = null,
  // The sky the visual limit reads (`visualSuitability`): the place's
  // measured or typed value when the caller has one, else the model's.
  visualSkyQuality = skyQuality,
  skyDirection = null,
  ownedFilters = [],
  inventory = [],
  // SUGGEST-FILTERS-01: « Ignorer le masque d'horizon » — the cards are made
  // without the place's mask, each with the stretches it spends behind it.
  ignoreMask = false,
}) {
  const place = plan.location;
  const sky = planNightSpanSky(
    { date: plan.date, darkness: plan.darkness },
    place,
  );
  const owned = equipmentProfilesFromInventory(inventory);
  const profile = resolveEquipment(plan.equipment || {}, owned);
  const minAltitude = plan.minAltitude ?? 30;
  const moonSeparationMinimum = plan.moonSeparationMinimum ?? 25;
  const placeMask = place.horizonMask;
  const mask = ignoreMask ? {} : placeMask;
  const mountSafety = plan.mountSafety;
  const night = planNight({
    date: plan.date,
    location: place,
    targets: planningTargets(
      [],
      locale,
      {},
      { catalogueTargets: targets },
    ).slice(0, 48),
    profile,
    locale,
    minAltitude,
    moonSeparationMinimum,
    planetReferences: { planets: [] },
    darkness: plan.darkness,
    skyQuality: visualSkyQuality,
    visualInventory: visualInventoryOf(owned),
  });
  const cards = withHorizonMask(
    night?.cards || [],
    mask,
    minAltitude,
    moonSeparationMinimum,
    mountSafety,
  );
  if (ignoreMask)
    withMaskHidden(cards, night?.cards || [], placeMask, {
      minAltitude,
      moonSeparationMinimum,
      mountSafety,
    });
  const window = {
    start: sky.start,
    end: sky.end,
    darkStart: sky.darkStart,
    darkEnd: sky.darkEnd,
    moonIllumination: null,
  };
  const equipment = {
    field: fieldOfView(profile),
    mode: profile.mode,
    filters: profile.filters,
  };
  return {
    night: { start: sky.darkStart, end: sky.darkEnd },
    moonSeries: sky.moonSeries,
    hourly,
    ownedFilters,
    mode: profile.mode,
    equipmentName: profile.name,
    candidates: cards.map((card) => ({
      card,
      score: targetTonightScore({
        card,
        window,
        hourly,
        moonSeries: sky.moonSeries,
        skyQuality,
        skyDirection,
        maskPath: targetNightPath({
          series: card.series || [],
          mask,
          minAltitude,
          moonSeparationMinimum: card.constraints?.moonSeparationMinimum ?? 0,
          mountSafety,
        }),
        equipment,
        ownedFilters,
        windTolerance: normalizeWindTolerance(plan.equipment?.windTolerance),
        minAltitude,
      }),
    })),
  };
}

export function tonightVisibleSuggestions(proposal, hasPlan, expanded = false) {
  return proposal.candidates.slice(0, expanded ? 10 : hasPlan ? 3 : 4);
}

/**
 * SUGGEST-FILTERS-01: `cards` made without the mask get, each, the stretches
 * they spend behind `mask` (`maskHidden`), from the same night's `planned`
 * cards made with it.
 */
export function withMaskHidden(
  cards,
  planned,
  mask,
  { minAltitude, moonSeparationMinimum, mountSafety },
) {
  const behind = new Map(
    withHorizonMask(
      planned,
      mask,
      minAltitude,
      moonSeparationMinimum,
      mountSafety,
    ).map((card) => [card.target.id, card.visibilityWindows]),
  );
  for (const card of cards)
    card.maskHidden = maskHiddenWindows(
      card.visibilityWindows,
      behind.get(card.target.id) || [],
    );
  return cards;
}
