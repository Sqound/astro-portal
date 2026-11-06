import { createHash } from "node:crypto";
import { isMosaicFramingPayload } from "../api/framing-resources.js";
import {
  pendingPlanPermission,
  planStatusCountsTowardNight,
} from "../capabilities/provider.js";
import { DATA_EXPORT_PARTS } from "../data-export/rules.js";
import {
  dehydratePlanItems,
  referencedFramingIds,
} from "../persistence/plan-framing-hydration.js";
import {
  normalizePlanResourcePayload,
  plannerPlanStatus,
} from "../persistence/planner-state-repository.js";

/**
 * « Importer mes données »: the plan of an import, pure. For each box, the
 * records the file holds, split into « to import » and « already there » —
 * a record is already there when its identifier exists in the space (a
 * place: its identifier in the planner document) — and the points to note:
 * a record that names a plan or a framing neither the file nor the space
 * has, a record this portal cannot store. The dry run and the import run
 * this same plan; the import writes only `writes`, which never holds a
 * record already there: nothing is overwritten nor merged. References
 * between records are kept as the file writes them.
 *
 * A record whose identifier ANOTHER space of this portal holds (an export
 * of one space imported into another of the same portal) is not dropped: it
 * enters with a NEW identifier, derived from the importing space and the
 * old identifier (`reidentifiedId`), so that a second import of the same
 * file finds it again and says « already there ». Every reference to an old
 * identifier in the other records of the file (a plan item's framing and
 * multi-night plan, a night's plan, a debriefing's plan, a measure's night)
 * is rewritten to the new one: the links are kept. Identifiers that collide
 * nowhere (a private portal, one space) are never touched. `tenantId` is
 * the importing space (the derivation's salt).
 *
 * `existing` is what the space (and the rest of the portal) holds of the
 * file's identifiers, gathered by `./store.js`:
 * `{ plans: { space, other, clientIds, withSession }, nights, projects:
 * { space, other }, places, horizonProfiles, unassignedHorizonContext,
 * nightsContext, equipment: { space, other }, framings: { space, other,
 * live }, sessions: { space, other, clientSessionIds }, skyMeasures }` —
 * every member a `Set`, except `unassignedHorizonContext` (whether the
 * space's planner document can hold a horizon without a place) and
 * `nightsContext` (whether it can hold the planner's nights: a planner
 * document of version 2, or none yet).
 *
 * The planner's nights (`plans.json`'s `nights`) are counted in « Plans »:
 * a night is already there when the space's planner document holds its
 * identifier, and is never replaced.
 *
 * The offer of the space (`offer: { capabilities }`) limits what enters as
 * live content, never what enters: a pending plan that the offer would not
 * let the space create (« one plan per night » without `planner.multiple`;
 * the numeric guard `sync.plan_limit`) is imported ARCHIVED, and so are the
 * multi-night plans and the mosaic framings a space without `planner.mosaic`
 * cannot hold live. Nothing is dropped. The report says how many
 * (`notes.archivedForNight`, `notes.archivedForPlanLimit`,
 * `notes.archivedForCapability`). A private server's profile carries no such
 * limit; without an `offer`, none is applied.
 */

const SESSION_STATUSES = new Set(["open", "paused", "finished"]);
const EQUIPMENT_TYPES = new Set([
  "telescope",
  "guide-scope",
  "camera",
  "eyepiece",
  "lens",
  "filter",
  "mount",
  "controller",
]);

const list = (value) =>
  Array.isArray(value)
    ? value.filter(
        (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const none = () => ({ space: new Set(), other: new Set() });

/**
 * The identifier a record of another space takes in `tenantId`'s space: a
 * version-5-shaped UUID of a hash of the space, the kind and the old
 * identifier -- the same file always gives the same identifier in the same
 * space (so a second import is « already there »), never the same in two
 * spaces.
 */
export function reidentifiedId(tenantId, kind, id) {
  const bytes = createHash("sha256")
    .update(`planastro-import\u0000${tenantId}\u0000${kind}\u0000${id}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `value` with every string equal to a key of `remap` replaced (keys of
 * objects are never touched): the links of a re-identified record. */
function substitute(value, remap) {
  if (typeof value === "string") return remap.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((entry) => substitute(entry, remap));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        substitute(entry, remap),
      ]),
    );
  return value;
}

/** An `existing` with nothing in it: a portal that holds none of the ids. */
export function emptyExisting() {
  return {
    plans: { ...none(), clientIds: new Set(), withSession: new Set() },
    // The space's own live plans that fill a night or a slot of the offer:
    // `{ id, date, status }` (pending, executed, partial).
    nightPlans: [],
    nights: new Set(),
    nightsContext: true,
    projects: none(),
    places: new Set(),
    horizonProfiles: new Set(),
    unassignedHorizonContext: false,
    equipment: none(),
    framings: { ...none(), live: new Set() },
    sessions: { ...none(), clientSessionIds: new Set() },
    skyMeasures: new Set(),
  };
}

// ——— Identifiers, as the repositories key their rows ———

/** The planner's id of a place (`known_locations.client_id`), with the
 * fallback `savePlannerState` gives a place without one. */
export function placeIdentifier(place) {
  const id = String(place?.id || "").trim();
  if (id && id.length <= 200) return id;
  return `${place?.name || "location"}:${place?.latitude || ""}:${place?.longitude || ""}`;
}

/** A night's id: the service's own (`serverId`, written by the phone) when
 * there is one, else the id the file gives it. */
export function sessionIdentifier(session) {
  return text(session?.serverId) || String(session?.id || "");
}

export const skyMeasureKey = (placeId, night) => `${placeId}\u0000${night}`;

/** Every identifier of the file, by kind: what `./store.js` looks up. For
 * the portal-wide kinds the identifier the record would take in the space
 * if another space held its own (`reidentifiedId`) is looked up too: it is
 * how a second import finds what the first one wrote. */
export function dataImportIdentifiers(documents = {}, tenantId = "") {
  const plans = list(documents.plans?.plans);
  const sessions = list(documents.journal?.sessions);
  const ids = (values) => [...new Set(values.filter(Boolean))];
  const withDerived = (kind, values) =>
    ids(values).flatMap((id) => [id, reidentifiedId(tenantId, kind, id)]);
  return {
    planResourceIds: withDerived(
      "plans",
      plans.map((plan) => text(plan.resourceId)),
    ),
    planClientIds: ids(plans.map((plan) => text(plan.id))),
    projectIds: withDerived(
      "projects",
      list(documents.plans?.projects).map((p) => text(p.id)),
    ),
    placeIds: ids(list(documents.places?.places).map(placeIdentifier)),
    horizonProfileIds: ids(
      list(documents.places?.horizonProfiles).map((p) => text(p.id)),
    ),
    equipmentIds: withDerived(
      "equipment",
      list(documents.equipment?.equipment).map((e) => text(e.id)),
    ),
    framingIds: withDerived("framings", [
      ...list(documents.framings?.framings).map((f) => text(f.id)),
      ...plans.flatMap((plan) =>
        referencedFramingIds(Array.isArray(plan.items) ? plan.items : []),
      ),
    ]),
    sessionIds: withDerived("sessions", sessions.map(sessionIdentifier)),
    sessionPlanIds: withDerived("plans", [
      ...sessions.map((session) => text(session.planId)),
      ...list(documents.journal?.debriefs).map((d) => text(d.planId)),
    ]),
    clientSessionIds: ids(sessions.map((s) => text(s.clientSessionId))),
    skyMeasurePlaceIds: ids(
      list(documents["sky-measurements"]?.places).map((p) => text(p.placeId)),
    ),
  };
}

// ——— What this portal can store ———

function coordinate(value, minimum, maximum) {
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

/** The planner's own test of a place it keeps (`knownPlannerLocation`):
 * two coordinates in range, never the legacy 0, 0. */
function storablePlace(place) {
  const latitude = coordinate(place?.latitude, -90, 90);
  const longitude = coordinate(place?.longitude, -180, 180);
  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

/** The plan as the v1 resource stores it, or `null` when it cannot be one. */
function storablePlan(plan) {
  const { resourceId: _resourceId, status: _status, ...payload } = plan;
  try {
    const normalized = normalizePlanResourcePayload(payload);
    return { ...normalized, items: dehydratePlanItems(normalized.items) };
  } catch {
    return null;
  }
}

/** The framing's J2000 centre and name, as the framing store requires. */
function storableFraming(framing) {
  const target = framing?.payload?.target;
  const ra = Number(target?.center?.ra ?? target?.coordinate?.ra);
  const dec = Number(target?.center?.dec ?? target?.coordinate?.dec);
  const name = String(framing?.name || "").trim();
  return target &&
    typeof target === "object" &&
    Number.isFinite(ra) &&
    Number.isFinite(dec) &&
    name &&
    name.length <= 300
    ? { ra, dec, name }
    : null;
}

function storableEquipment(item) {
  const type = String(item?.type || "")
    .trim()
    .toLowerCase();
  const name = String(item?.name || "").trim();
  return EQUIPMENT_TYPES.has(type) && name && name.length <= 200
    ? { type, name }
    : null;
}

function storableSession(session) {
  return (
    SESSION_STATUSES.has(session.status) &&
    typeof session.startedAt === "string" &&
    session.startedAt &&
    list(session.events).every(
      (event) =>
        typeof event.recordedAt === "string" &&
        event.recordedAt &&
        typeof event.type === "string",
    )
  );
}

function storableMeasure(measure) {
  return (
    typeof measure.night === "string" &&
    measure.night &&
    Number.isFinite(Number(measure.sqm)) &&
    Number.isInteger(measure.poseCount) &&
    measure.poseCount >= 1 &&
    typeof measure.methodVersion === "string" &&
    measure.methodVersion &&
    typeof measure.observedAt === "string" &&
    measure.observedAt
  );
}

/** A night the planner document can hold: an identifier and a calendar
 * date, as `validatePlannerDocument` asks of it. */
function storableNight(night) {
  return (
    typeof night.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(night.date) &&
    !Number.isNaN(Date.parse(`${night.date}T00:00:00Z`))
  );
}

const hasHorizonPlace = (profile) =>
  Boolean(text(profile.name)) && storablePlace(profile.location);

/** The v1 status of the file's plan as the plans table keeps it. */
export function storedPlanStatus(status) {
  return status === "active" ? "pending" : plannerPlanStatus(status);
}

// ——— The plan ———

/**
 * The plan of the import of `file` (`readDataExport`'s result) into a space
 * that holds `existing`: `{ formatVersion, exportedAt, parts, notes, totals,
 * writes }`. `parts[part]` is `{ present, toImport, alreadyThere }`;
 * `notes` is `{ reidentified, reidentifiedKinds, missingReference,
 * unreadable, unknownFiles, archivedFor… }`; `kinds` splits the plans' box
 * into its plans, planner nights and multi-night plans.
 */
export function dataImportPlan({
  file,
  existing = emptyExisting(),
  offer = null,
  tenantId = "",
}) {
  const capabilities = offer?.capabilities || null;
  const mosaicsOpen = !capabilities || capabilities["planner.mosaic"] === true;
  const documents = file?.documents || {};
  const tally = Object.fromEntries(
    DATA_EXPORT_PARTS.map((part) => [
      part,
      { present: Boolean(documents[part]), toImport: 0, alreadyThere: 0 },
    ]),
  );
  // The three kinds the plans' box holds, each with its own words.
  const kinds = {
    plans: { toImport: 0, alreadyThere: 0 },
    nights: { toImport: 0, alreadyThere: 0 },
    projects: { toImport: 0, alreadyThere: 0 },
  };
  const notes = {
    reidentified: 0,
    // The kinds of record that carry a portal-wide identifier.
    reidentifiedKinds: {
      plans: 0,
      projects: 0,
      framings: 0,
      equipment: 0,
      sessions: 0,
    },
    missingReference: 0,
    unreadable: 0,
    unknownFiles: [...(file?.unknownFiles || [])],
    archivedForNight: 0,
    archivedForPlanLimit: 0,
    archivedForCapability: 0,
  };
  const writes = {
    framings: [],
    plans: [],
    nights: [],
    projects: [],
    places: [],
    horizonProfiles: [],
    unassignedHorizonProfiles: [],
    equipment: [],
    sessions: [],
    skyMeasures: [],
  };
  const add = (part, write, record, kind = null) => {
    tally[part].toImport += 1;
    if (kind && kinds[kind]) kinds[kind].toImport += 1;
    writes[write].push(record);
  };
  const already = (part, kind = null) => {
    tally[part].alreadyThere += 1;
    if (kind && kinds[kind]) kinds[kind].alreadyThere += 1;
  };

  // The records another space of this portal holds the identifier of enter
  // with a new one (`reidentifiedId`); every mention of an old identifier in
  // the file is rewritten to it, so the links survive.
  const remap = new Map();
  const renamed = new Set();
  const claim = (kind, held, id) => {
    if (!id || !held.has(id) || remap.has(id)) return;
    const next = reidentifiedId(tenantId, kind, id);
    remap.set(id, next);
    renamed.add(next);
  };
  for (const framing of list(documents.framings?.framings))
    claim("framings", existing.framings.other, text(framing.id));
  for (const plan of list(documents.plans?.plans))
    claim("plans", existing.plans.other, text(plan.resourceId));
  for (const project of list(documents.plans?.projects))
    claim("projects", existing.projects.other, text(project.id));
  for (const item of list(documents.equipment?.equipment))
    claim("equipment", existing.equipment.other, text(item.id));
  for (const session of list(documents.journal?.sessions))
    claim("sessions", existing.sessions.other, sessionIdentifier(session));
  const carry = (record) => (remap.size ? substitute(record, remap) : record);
  const counted = (kind, id) => {
    if (!renamed.has(id)) return;
    notes.reidentified += 1;
    notes.reidentifiedKinds[kind] += 1;
  };

  // Framings first: a plan may name one the same file brings.
  const framingIds = new Set();
  for (const given of list(documents.framings?.framings)) {
    const framing = carry(given);
    const id = text(framing.id);
    if (existing.framings.space.has(id) || framingIds.has(id))
      already("framings");
    else {
      const stored = storableFraming(framing);
      if (!stored) notes.unreadable += 1;
      else {
        framingIds.add(id);
        // A mosaic needs `planner.mosaic`: without it the framing is kept,
        // archived, like a framing put away.
        const archive =
          !mosaicsOpen &&
          !framing.archivedAt &&
          isMosaicFramingPayload(framing.payload);
        if (archive) notes.archivedForCapability += 1;
        counted("framings", id);
        add("framings", "framings", { id, framing, archive, ...stored });
      }
    }
  }

  // Plans, by their v1 resource id (global) and their planner id (the space's).
  const planIds = new Set();
  const clientIds = new Set();
  const plansByResourceId = new Map();
  for (const given of list(documents.plans?.plans)) {
    const plan = carry(given);
    const resourceId = text(plan.resourceId);
    const clientId = text(plan.id);
    if (
      (resourceId &&
        (existing.plans.space.has(resourceId) || planIds.has(resourceId))) ||
      existing.plans.clientIds.has(clientId) ||
      clientIds.has(clientId)
    ) {
      already("plans", "plans");
      continue;
    }
    const payload = storablePlan(plan);
    if (!payload) {
      notes.unreadable += 1;
      continue;
    }
    if (
      referencedFramingIds(payload.items).some(
        (id) => !existing.framings.live.has(id) && !framingIds.has(id),
      )
    ) {
      notes.missingReference += 1;
      continue;
    }
    if (resourceId) planIds.add(resourceId);
    clientIds.add(clientId);
    const record = {
      resourceId,
      payload,
      status: storedPlanStatus(plan.status),
      debrief: null,
    };
    if (resourceId) plansByResourceId.set(resourceId, record);
    counted("plans", resourceId);
    add("plans", "plans", record, "plans");
  }

  // The planner's nights: the night each plan names by its `nightId`, kept
  // in the planner document of the space.
  const nightIds = new Set();
  for (const night of list(documents.plans?.nights)) {
    const id = text(night.id);
    if (id && (existing.nights.has(id) || nightIds.has(id)))
      already("plans", "nights");
    else if (!id || !storableNight(night) || !existing.nightsContext)
      notes.unreadable += 1;
    else {
      nightIds.add(id);
      add("plans", "nights", { id, night }, "nights");
    }
  }

  const projectIds = new Set();
  for (const given of list(documents.plans?.projects)) {
    const project = carry(given);
    const id = text(project.id);
    if (existing.projects.space.has(id) || projectIds.has(id))
      already("plans", "projects");
    else if (!text(project.status)) notes.unreadable += 1;
    else {
      projectIds.add(id);
      // The multi-night plans need `planner.mosaic` too.
      const archive = !mosaicsOpen && text(project.status) !== "archived";
      if (archive) notes.archivedForCapability += 1;
      counted("projects", id);
      add("plans", "projects", { id, project, archive }, "projects");
    }
  }

  const placeIds = new Set();
  for (const place of list(documents.places?.places)) {
    const id = placeIdentifier(place);
    if (existing.places.has(id) || placeIds.has(id)) already("places");
    else if (!storablePlace(place)) notes.unreadable += 1;
    else {
      placeIds.add(id);
      add("places", "places", { id, place });
    }
  }

  const profileIds = new Set();
  for (const profile of list(documents.places?.horizonProfiles)) {
    const id = text(profile.id);
    if (existing.horizonProfiles.has(id) || profileIds.has(id))
      already("places");
    else if (hasHorizonPlace(profile)) {
      profileIds.add(id);
      add("places", "horizonProfiles", { id, profile });
    } else if (existing.unassignedHorizonContext) {
      // A horizon recorded apart from a place (the phone's): the planner
      // document keeps it in its list of horizons without a place.
      profileIds.add(id);
      add("places", "unassignedHorizonProfiles", { id, profile });
    } else notes.unreadable += 1;
  }

  const equipmentIds = new Set();
  for (const given of list(documents.equipment?.equipment)) {
    const item = carry(given);
    const id = text(item.id);
    if (existing.equipment.space.has(id) || equipmentIds.has(id))
      already("equipment");
    else {
      const stored = storableEquipment(item);
      if (!stored) notes.unreadable += 1;
      else {
        equipmentIds.add(id);
        counted("equipment", id);
        add("equipment", "equipment", { id, item, ...stored });
      }
    }
  }

  // The nights executed: one per plan, by id and by the device's own key.
  const sessionIds = new Set();
  const sessionPlans = new Set();
  const clientSessionIds = new Set();
  const planKnown = (planId) =>
    plansByResourceId.has(planId) || existing.plans.space.has(planId);
  for (const given of list(documents.journal?.sessions)) {
    const session = carry(given);
    const id = sessionIdentifier(session);
    const planId = text(session.planId);
    const clientSessionId = text(session.clientSessionId);
    if (
      existing.sessions.space.has(id) ||
      sessionIds.has(id) ||
      (planId &&
        (existing.plans.withSession.has(planId) || sessionPlans.has(planId))) ||
      (clientSessionId &&
        (existing.sessions.clientSessionIds.has(clientSessionId) ||
          clientSessionIds.has(clientSessionId)))
    ) {
      already("journal");
      continue;
    }
    if (planId && !planKnown(planId)) {
      // Its plan is neither in the file nor in the space (another space
      // holds it): there is nothing to link the night to.
      notes.missingReference += 1;
      continue;
    }
    if (!storableSession(session)) {
      notes.unreadable += 1;
      continue;
    }
    sessionIds.add(id);
    if (planId) sessionPlans.add(planId);
    if (clientSessionId) clientSessionIds.add(clientSessionId);
    counted("sessions", id);
    add("journal", "sessions", { id, planId, clientSessionId, session });
  }

  // A debriefing lives on its plan: it enters with a plan the file brings,
  // and is already there when its plan is. Its instant may be unknown (the
  // phone's, `decidedAt: null`): it stays unknown.
  const debriefed = new Set();
  for (const given of list(documents.journal?.debriefs)) {
    const debrief = carry(given);
    const planId = text(debrief.planId);
    const record = plansByResourceId.get(planId);
    if (record && !debriefed.has(planId)) {
      debriefed.add(planId);
      record.debrief = {
        outcome: debrief.outcome,
        decidedAt: text(debrief.decidedAt),
        targets: Array.isArray(debrief.targets) ? debrief.targets : [],
      };
      tally.journal.toImport += 1;
    } else if (record || existing.plans.space.has(planId)) already("journal");
    else notes.missingReference += 1;
  }

  if (capabilities)
    archiveBeyondOffer(writes.plans, existing, capabilities, notes);

  const measureKeys = new Set();
  for (const entry of list(documents["sky-measurements"]?.places)) {
    const placeId = text(entry.placeId);
    for (const given of list(entry.measures)) {
      const measure = carry(given);
      const key = skyMeasureKey(placeId, measure.night);
      if (existing.skyMeasures.has(key) || measureKeys.has(key))
        already("sky-measurements");
      else if (!storableMeasure(measure)) notes.unreadable += 1;
      else {
        measureKeys.add(key);
        add("sky-measurements", "skyMeasures", { placeId, measure });
      }
    }
  }

  const totals = Object.values(tally).reduce(
    (sum, part) => ({
      toImport: sum.toImport + part.toImport,
      alreadyThere: sum.alreadyThere + part.alreadyThere,
    }),
    { toImport: 0, alreadyThere: 0 },
  );
  return {
    formatVersion: file?.formatVersion ?? null,
    exportedAt: file?.exportedAt ?? null,
    parts: tally,
    kinds,
    notes,
    totals,
    writes,
  };
}

/**
 * The plans of the file that the offer would not let the space create as
 * pending are marked `archive`: the same two rules the plan service
 * enforces on a write -- one plan per night (a plan that was run still
 * fills its night) and the numeric guard on pending plans -- applied with
 * `pendingPlanPermission`, the function the service itself calls. The plans
 * that were run (a debriefing says executed or partial) enter as they are,
 * history; they take their night first. The pending ones follow in the
 * file's order, each counted once it is accepted. The internal plan of a
 * guided evening (`payload.guidedEvening`) is outside both rules: it neither
 * takes a night nor is archived for one.
 */
function archiveBeyondOffer(plans, existing, capabilities, notes) {
  const effective = (record) => record.debrief?.outcome || record.status;
  const held = existing.nightPlans.map((plan) => ({ ...plan }));
  const dateOf = (record) => String(record.payload?.date ?? "").slice(0, 10);
  const key = (record) => record.resourceId || record.payload?.id;
  // The internal plan of a guided evening is outside both rules.
  const guided = (record) => record.payload?.guidedEvening === true;
  for (const record of plans) {
    const status = effective(record);
    if (guided(record)) continue;
    if (status !== "pending" && planStatusCountsTowardNight(status))
      held.push({ id: key(record), date: dateOf(record), status });
  }
  for (const record of plans) {
    if (effective(record) !== "pending" || guided(record)) continue;
    const verdict = pendingPlanPermission({
      capabilities,
      plans: held,
      date: dateOf(record),
    });
    if (verdict === "allowed")
      held.push({ id: key(record), date: dateOf(record), status: "pending" });
    else {
      record.archive = true;
      if (verdict === "night") notes.archivedForNight += 1;
      else notes.archivedForPlanLimit += 1;
    }
  }
}

/** What the routes answer of a plan: everything but `writes`. */
export function dataImportReport(plan) {
  const { writes: _writes, ...report } = plan;
  return report;
}
