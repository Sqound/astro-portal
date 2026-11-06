import { clientInstanceHeaders } from "portal/planner/change-subscription.js";
import { autoFillFreeSlots } from "./auto-fill.js";
import { durationText } from "portal/written-forms.js";
import { placeFingerprint } from "portal/planner/state.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { equipmentProfilesFromInventory } from "./planner.js";
import { QuickPlanAction } from "./quick-plan.js";
import { quickPlanEquipment } from "./quick-plan-equipment.js";
import { planStartEquipment } from "portal/planner/default-configuration.js";
import { localizedPlanName, quickPlanMessage } from "./quick-plan-messages.js";
import { uniquePlanNameOnNight } from "./night-plan-names.js";
import { readSpaceReplica, writeSpaceReplica } from "./browser-plans.js";

export function quickPlanOffersHref({ locale, signedIn }) {
  return getPlannerExtensions("planner.offers")[0]?.href({ locale, signedIn });
}

/**
 * Writes the planner's document `state` where the page read it: the
 * browser's for a visitor; for a signed-in person the space's copy in this
 * browser (marked dirty), then the space (`PUT /api/plans`, replace). Without
 * a network the dirty copy waits for the planner's sync; a refusal puts the
 * `previous` document back and throws. Shared by the quick plan and by the
 * darkness threshold of "Cette nuit".
 */
export async function writePlannerDocument({
  state,
  previous,
  signedIn = false,
  email = "",
  storage = globalThis.localStorage,
  fetcher = globalThis.fetch,
  csrf = csrfCookieValue,
}) {
  if (!signedIn) {
    storage.setItem("astro-portal:planner:v1", JSON.stringify(state));
    return;
  }
  const replica = readSpaceReplica(storage);
  writeSpaceReplica(storage, {
    ...replica,
    email,
    document: state,
    dirty: true,
  });
  let response;
  try {
    response = await fetcher("/api/plans", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-astro-csrf": csrf(),
        ...clientInstanceHeaders(),
      },
      body: JSON.stringify({ mode: "replace", state }),
    });
  } catch {
    return;
  }
  const result = await response.json();
  if (!response.ok) {
    writeSpaceReplica(storage, {
      ...replica,
      email,
      document: previous,
      dirty: replica?.dirty || false,
    });
    throw new Error(result.error || "planOperationFailed");
  }
  writeSpaceReplica(storage, {
    ...replica,
    email,
    document: state,
    dirty: false,
  });
}

// Document persistence shares the planner's CSRF, browser store and dirty
// space replica. A tombstone reaches the service on its existing replace path.
export function createWebQuickPlanAction({
  document,
  date,
  location,
  locale = "en",
  signedIn = false,
  email = "",
  capabilities,
  inventory = [],
  // "Ma configuration par défaut" of the signed-in space, null when none
  // is set (or for a visitor): the plan then starts from it.
  defaultConfiguration = null,
  inputsFor,
  // The placement a suggestion dialog showed ("Idéal" otherwise).
  placement = "ideal",
  // The part of the night to place the targets in (from now on a night that
  // is running), `null` for the whole night.
  span = null,
  // the « Confort » the dialog showed its slots with.
  comfort = null,
  // The equipment the plan is made with when the caller names one (« À voir
  // ce soir » in the other mode than the rule of before gives): it replaces
  // the default configuration's or the quick plan's.
  equipment = null,
  storage = globalThis.localStorage,
  fetcher = globalThis.fetch,
  id,
  csrf = csrfCookieValue,
}) {
  const deleted = new Set(document.deletedPlanIds || []);
  let current = document;
  const persist = async (next) => {
    const state = { ...next, deletedPlanIds: [...deleted] };
    await writePlannerDocument({
      state,
      previous: current,
      signedIn,
      email,
      storage,
      fetcher,
      csrf,
    });
    current = state;
  };
  const monthDay = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return new QuickPlanAction({
    document,
    date,
    location,
    // A second plan of the night is not named like the first.
    name: uniquePlanNameOnNight(
      quickPlanMessage(locale, "quickNightName", { date: monthDay }),
      document.plans
        .filter((plan) => plan.date === date)
        .map((plan) => localizedPlanName(locale, plan.name, plan.date)),
    ),
    newSettings: {
      equipment: equipment
        ? { ...equipment }
        : planStartEquipment(
            quickPlanEquipment({
              paired: signedIn,
              profiles: equipmentProfilesFromInventory(inventory),
            }),
            signedIn ? defaultConfiguration : null,
          ),
      minAltitude: 30,
      catalogueSelection: "best",
      moonSeparationMinimum: 25,
      moonSeparationMinimumByFilter: {},
      mountSafety: { enabled: false },
    },
    capabilities,
    signedIn,
    inputsFor,
    placement,
    span,
    comfort,
    persist,
    id,
    remove: async (planId) => {
      deleted.add(planId);
      try {
        await persist({
          ...current,
          plans: current.plans.filter((p) => p.id !== planId),
        });
      } catch (error) {
        deleted.delete(planId);
        throw error;
      }
    },
  });
}

export async function readQuickPlanEraseState({
  plan,
  signedIn,
  email = "",
  storage = globalThis.localStorage,
  fetcher = globalThis.fetch,
}) {
  if (!signedIn) return { running: false, debrief: false, synchronized: false };
  const key = "astro-portal:quick-plan:erase-state:v1";
  async function json(url) {
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) throw new Error("planOperationFailed");
    return response.json();
  }
  try {
    const [resources, queue] = await Promise.all([
      json("/api/v1/plans"),
      json("/api/v1/plans/debrief-queue"),
    ]);
    const resource = resources.plans.find(
      (p) => p.payload?.id === plan.id || p.id === plan.id,
    );
    const planId = resource?.id;
    let running = false,
      since = null;
    do {
      const page = await json(
        `/api/v1/sessions?limit=500${since ? `&since=${encodeURIComponent(since)}` : ""}`,
      );
      running ||= page.sessions.some(
        (s) =>
          s.planId === planId && (s.status === "open" || s.status === "paused"),
      );
      if (running || !page.hasMore) break;
      if (page.nextSince === since) throw new Error("planOperationFailed");
      since = page.nextSince;
    } while (since);
    const result = {
      running,
      debrief: queue.entries.some((e) => e.planId === planId),
      synchronized: Boolean(resource),
    };
    const previous = JSON.parse(storage.getItem(key) || "null");
    storage.setItem(
      key,
      JSON.stringify({
        email,
        plans: {
          ...(previous?.email === email ? previous.plans : {}),
          [plan.id]: result,
        },
      }),
    );
    return result;
  } catch (error) {
    const cached = JSON.parse(storage.getItem(key) || "null");
    if (cached?.email === email && cached.plans?.[plan.id])
      return cached.plans[plan.id];
    throw error;
  }
}

/**
 * The date, as "Thu 15 Oct", of the night a plan was made or filled for
 * when that is not the night "Cette nuit" shows (the next night, from
 * "Suggest for the night of …") -- the page then says where the plan is.
 * `null` for a plan of the night on screen, or a result that made no plan.
 */
export function planMadeElsewhere(result, shownDate, locale = "en") {
  if (result?.kind !== "created" && result?.kind !== "merged") return null;
  const date = result.plan?.date;
  if (!date || date === shownDate) return null;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export async function quickPlanDialogData({
  action,
  ids,
  locale = "en",
  eraseState,
  // The date of the night "Cette nuit" shows; a plan of another night is
  // named by its date in the dialog. Without it, the plan is tonight's.
  tonightDate,
}) {
  const plan = action.existing;
  // No pending plan to merge into or erase -- the night is taken by a plan
  // that was run; the dialog only says so and offers Advanced Planning.
  if (!plan)
    return {
      taken: true,
      name: "",
      date: new Date(`${action.date}T12:00:00Z`).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      tonight: tonightDate === undefined || action.date === tonightDate,
      count: 0,
      free: "",
      freeMinutes: 0,
      visual: false,
      minimum: "",
      otherPlace: null,
      running: false,
      debrief: false,
      synchronized: false,
    };
  const inputs = await action.inputsFor(plan);
  const freeMinutes = autoFillFreeSlots({
    ...inputs,
    items: plan.items || [],
    minimumMinutes: 0,
  }).reduce((sum, slot) => sum + slot.minutes, 0);
  const duration = (n) => durationText(n, locale).replaceAll("\u00a0", " ");
  const state = await eraseState();
  return {
    name: plan.name,
    date: new Date(`${plan.date}T12:00:00Z`).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    tonight: tonightDate === undefined || plan.date === tonightDate,
    count: plan.items?.length || 0,
    free: duration(freeMinutes),
    freeMinutes,
    visual: inputs.mode === "visual",
    minimum: duration(inputs.mode === "visual" ? 20 : 45),
    otherPlace:
      placeFingerprint(plan.location) === placeFingerprint(action.location) &&
      plan.location?.name === action.location?.name
        ? null
        : plan.location?.name,
    ...state,
  };
}
