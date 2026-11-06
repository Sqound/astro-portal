import { headers } from "next/headers";
import { createDebriefService } from "portal/api/debrief.js";
import { createObservationSessionService } from "portal/api/observation-sessions.js";
import { retryOnSqliteNestedTransaction } from "portal/persistence/db-transaction-retry.js";
import { createPlanResourceService } from "portal/api/plan-resources.js";
import { createSessionAnalysisService } from "portal/api/session-analysis-resources.js";
import { createUploadResourceService } from "portal/api/upload-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import {
  cameraProfiles,
  eyepieceProfiles,
  opticalModifiers,
  telescopeProfiles,
} from "planner/planner.js";
import { authEnabled, authService } from "./auth.server.js";
import { equipmentReader } from "./equipment-reader.server.js";
import {
  catalogueNightsOfPrivateServer,
  requireJournalService,
} from "./v1/journal-service.js";
import { placeResourceService } from "./v1/place-resource-service.js";
import { targetKnowledgeFor } from "./target-library.server.js";
import { nightFields, nightService } from "./v1/night-service.js";
import { requireOwnerCaptureService } from "./v1/owner-capture-service.js";
import {
  sessionDebriefFields,
  sessionSummaryInput,
} from "./v1/session-debrief-service.js";

// Server-side reads for the portal debriefing UI, on the exact pattern of
// sessions.server.js and planner-state-repository.server.js: a page's
// server component reads directly through a repository/service singleton
// rather than issuing an HTTP request to this same process's own API
// routes. Writes go the other way — a client component posts to
// /api/v1/... with the browser's own CSRF token, exactly like
// AccountPage.js already does for device pairing.
//
// Each singleton below follows portal-app/lib/v1/{debrief,observation-session,
// plan-resource,upload-resource}-service.js's own wiring rather than
// importing those route-adjacent modules, as planner-state-repository.server.js
// does (a second thin wrapper around the same process-owned
// packages/portal/persistence/database.js driver singleton, not a second
// database connection).

function databaseConfigurationFromEnv() {
  return {
    databasePath: process.env.ASTRO_PORTAL_DATABASE_PATH || null,
    databaseUrl: process.env.ASTRO_PORTAL_DATABASE_URL || null,
  };
}

// The services below run their migrations when they are first made, in a
// transaction of the one SQLite driver of the process, which refuses a second
// transaction begun before the first ends: a request that makes a service
// while another request holds the driver (the Journal's read of a plan, the
// debriefing's read of the queue) would meet it. The services are made one
// after the other, a service asked for while it is being made waits for it,
// and a making that met the driver busy is tried again (the retry the
// other services of the process use).
let creating = Promise.resolve();

function sharedServiceFactory(create) {
  let service = null;
  let pending = null;
  let configurationKey = null;
  return async function shared() {
    const { databasePath, databaseUrl } = databaseConfigurationFromEnv();
    if (!databasePath && !databaseUrl) return null;
    const nextKey = databaseUrl
      ? `postgres:${databaseUrl}`
      : `sqlite:${databasePath}`;
    if (service && configurationKey !== nextKey)
      throw new Error("Database configuration cannot change during a process.");
    if (service) return service;
    if (!pending) {
      const made = creating
        .catch(() => {})
        .then(() =>
          retryOnSqliteNestedTransaction(() =>
            create({
              driver: databaseDriver({
                ASTRO_PORTAL_DATABASE_PATH: databasePath,
                ASTRO_PORTAL_DATABASE_URL: databaseUrl,
              }),
              dialect: databaseUrl ? "postgres" : "sqlite",
            }),
          ),
        );
      creating = made;
      pending = made
        .then((created) => {
          service = created;
          configurationKey = nextKey;
          return created;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}

const debriefServiceForRead = sharedServiceFactory(createDebriefService);
const observationSessionServiceForRead = sharedServiceFactory(
  createObservationSessionService,
);
const planResourceServiceForRead = sharedServiceFactory(
  createPlanResourceService,
);
const uploadResourceServiceForRead = sharedServiceFactory(
  createUploadResourceService,
);
const sessionAnalysisServiceForRead = sharedServiceFactory(
  createSessionAnalysisService,
);

/**
 * The authenticated cookie (browser) session for the current request, or
 * null when private authentication is disabled or nobody is signed in. This
 * is a read-only lookup — it never creates or refreshes anything beyond the
 * ordinary `last_seen_at` touch `authService().session()` already performs.
 */
export async function currentPortalSession() {
  if (!authEnabled()) return null;
  try {
    return (await authService().session(await headers())) || null;
  } catch {
    return null;
  }
}

/**
 * The hours of the targets of some plans, for the promise of a night to
 * debrief in the Journal (« NGC 7000 20:40 → 23:10 »): `{ [planId]: {
 * [planItemId]: { start, end } } }`, epoch milliseconds, read from each plan's
 * items on its night. A plan that cannot be read, or whose night is not known,
 * is simply absent (the card then tells the durations).
 */
export async function planItemSlotsOf(tenantId, planIds) {
  const service = await planResourceServiceForRead();
  const slots = {};
  if (!service) return slots;
  for (const planId of planIds) {
    try {
      const plan = await service.get({ tenantId, planId });
      const night = Date.parse(plan?.nightStartAt);
      if (!Number.isFinite(night)) continue;
      const own = {};
      for (const item of plan.payload?.items ?? []) {
        if (
          !item?.id ||
          !Number.isFinite(item.startMinute) ||
          !Number.isFinite(item.endMinute)
        )
          continue;
        own[item.id] = {
          start: night + item.startMinute * 60_000,
          end: night + item.endMinute * 60_000,
        };
      }
      if (Object.keys(own).length) slots[planId] = own;
    } catch {
      // A plan gone between two reads tells its durations.
    }
  }
  return slots;
}

/**
 * GET /v1/plans/debrief-queue's own result, read directly for the signed-in
 * tenant. Null when nobody is signed in or storage is unavailable — a page
 * reading this treats null exactly like an empty queue (no section, no
 * badge), never as an error to surface.
 */
export async function debriefQueueForSession(session) {
  if (!session) return null;
  const service = await debriefServiceForRead();
  if (!service) return null;
  try {
    return await service.queue({ tenantId: session.tenant_id });
  } catch {
    return null;
  }
}

export async function debriefQueueForCurrentUser() {
  return debriefQueueForSession(await currentPortalSession());
}

/**
 * Everything the debrief screen for one plan needs: the plan resource
 * itself (read directly, so the screen still works for a plan that has
 * already left the queue — already debriefed, or not queued yet because its
 * night boundaries are unknown) plus, when the plan is currently queued, its
 * queue entry (nightStartAt/nightEndAt, staleDevices, versions), and the
 * debriefing already stored for it (`debrief`, null before one). Null when
 * nobody is signed in or the plan does not belong to this tenant.
 */
/**
 * The space's places, with the zone each one keeps: the page
 * of a session or a debriefing reads its hours in the zone of its place, and
 * the plan of a night that was executed is frozen — the place of the space is
 * where a zone found or chosen later lives.
 */
export async function spacePlaceZones(tenantId) {
  try {
    const service = await placeResourceService();
    const list = service ? await service.list({ tenantId }) : null;
    return (list?.places ?? []).slice(0, 200).map((place) => ({
      id: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      ...(place.timeZone ? { timeZone: place.timeZone } : {}),
      ...(place.timeZoneSource ? { timeZoneSource: place.timeZoneSource } : {}),
    }));
  } catch {
    return [];
  }
}

export async function debriefContextForCurrentUser(planId) {
  const session = await currentPortalSession();
  if (!session) return null;
  const planService = await planResourceServiceForRead();
  if (!planService) return null;
  let plan = null;
  try {
    plan = await planService.get({ tenantId: session.tenant_id, planId });
  } catch {
    return null;
  }
  const queue = await debriefQueueForSession(session);
  const queueEntry =
    queue?.entries.find((entry) => entry.planId === planId) || null;
  // The debriefing already stored for this plan (debrief.schema.json's
  // `record`), best-effort like the queue entry.
  let debrief = null;
  try {
    const debriefService = await debriefServiceForRead();
    debrief = debriefService
      ? await debriefService.record({ tenantId: session.tenant_id, planId })
      : null;
  } catch {
    debrief = null;
  }
  // The night's journal, when this plan has a session — what « Bilan de la
  // nuit » is computed from, again each time a target is corrected. Null
  // for a plan nobody ran: the three-answer question stays.
  const summaryInput = queueEntry?.sessionId
    ? await sessionSummaryInput({
        tenantId: session.tenant_id,
        userId: session.user_id,
        sessionId: queueEntry.sessionId,
      })
    : null;
  return {
    plan,
    queueEntry,
    debrief,
    summaryInput,
    spacePlaces: await spacePlaceZones(session.tenant_id),
  };
}

/**
 * One observation session's detail, composed exactly like
 * GET /v1/sessions/{id} (the session, its supplements, its first page of
 * events, and the read-through plan projection for equipment/night
 * boundaries), plus a best-effort list of the tenant's captures already linked
 * to it. `GET /v1/captures` has neither a `sessionId` filter nor a newest-first
 * order of its own (api/v1.md's "Additive routes awaiting approval" names only
 * `targetId`; the repository orders by `created_at ASC`), so this reads the
 * tenant's oldest page of captures and keeps the ones that already name this
 * session — correct for a tenant that has not yet accumulated more than one
 * page, and a known gap otherwise (a proper session-scoped capture listing
 * would replace it). Captures are optional here ("if the API gives them").
 *
 * `locale` drives the best-effort catalogue-id -> display-name resolution below
 * (a target shown by its bare id, openngc-ngc7331, in the journal and in notes
 * would be unreadable) — the same title a catalogue id resolves to everywhere
 * else in this portal (GalleryPage.js, /api/v1/targets/{targetId}), never the
 * raw id a session event stores.
 */
export async function sessionDetailForCurrentUser(sessionId, locale = "en") {
  const session = await currentPortalSession();
  if (!session) return null;
  const sessionService = await observationSessionServiceForRead();
  if (!sessionService) return null;
  let detail;
  try {
    detail = await sessionService.get({
      tenantId: session.tenant_id,
      sessionId,
    });
  } catch (error) {
    // A session that is not there is « not found »; storage that did not
    // answer is a read failure the page says.
    return error?.code === "session_not_found" || error?.status === 404
      ? null
      : { readFailed: true };
  }
  let plan = null;
  if (detail.session.planId) {
    try {
      const planService = await planResourceServiceForRead();
      const planResource = planService
        ? await planService.get({
            tenantId: session.tenant_id,
            planId: detail.session.planId,
          })
        : null;
      plan = planResource
        ? {
            planId: planResource.id,
            name: planResource.payload?.name ?? null,
            // The night's calendar date (« Nuit du mer. 7 oct. »).
            date: planResource.payload?.date ?? null,
            status: planResource.status,
            // The plan a free execution became promised nothing.
            blankExecution: planResource.payload?.blankExecution === true,
            revision: planResource.revision,
            frozenAt: planResource.frozenAt,
            nightStartAt: planResource.nightStartAt,
            nightEndAt: planResource.nightEndAt,
            equipment: planResource.payload?.equipment ?? null,
            equipmentNames: await resolvedEquipmentNames(
              planResource.payload?.equipment,
              session.tenant_id,
            ),
            timeZone: planResource.payload?.location?.timeZone ?? null,
            // The place with its horizon mask, and the darkness setting: « Visibles
            // cette nuit-là » judges the targets against them.
            location: planResource.payload?.location ?? null,
            darkness: planResource.payload?.darkness,
            // The titles of the targets, by the `targetId` the summary of
            // the night carries (a catalogue id, else the item's own id).
            targetTitles: Object.fromEntries(
              (planResource.payload?.items ?? [])
                .filter((item) => item.target?.title)
                .map((item) => [item.targetId || item.id, item.target.title]),
            ),
          }
        : null;
    } catch {
      plan = null;
    }
  }
  let captures = [];
  try {
    const uploadService = await uploadResourceServiceForRead();
    if (uploadService) {
      const page = await uploadService.listCaptures({
        tenantId: session.tenant_id,
        userId: session.user_id,
        limit: 100,
      });
      captures = (page?.captures || []).filter(
        (capture) => capture.sessionId === sessionId,
      );
    }
  } catch {
    captures = [];
  }
  const events = await eventsWithResolvedTargetLabels(detail.events, locale);
  // The same summary fields GET /v1/sessions/{id} adds.
  const summaryFields = await sessionDebriefFields({
    tenantId: session.tenant_id,
    userId: session.user_id,
    sessionId,
  });
  // The night's analysis (one per night), for the page of the night — read
  // regardless of the account's `analysis.logs` capability (reading is never gated, api/v1.md "Session
  // analyses"), and best-effort like `captures` above: a reader with nothing to
  // show here is never itself an error.
  let analysis = null;
  try {
    const analysisService = await sessionAnalysisServiceForRead();
    if (analysisService)
      analysis = await analysisService.get({
        tenantId: session.tenant_id,
        sessionId,
      });
  } catch {
    analysis = null;
  }
  const page = await nightPageFields({
    tenantId: session.tenant_id,
    userId: session.user_id,
    sessionId,
    locale,
    plan,
  });
  // The session's targets — the order of the night, the
  // figures, the final photo of each — as `GET /v1/sessions/{id}` gives them;
  // a page never fails over them.
  let targets = [];
  try {
    targets =
      (await (
        await requireJournalService()
      ).targets({ tenantId: session.tenant_id, sessionId })) ?? [];
  } catch {
    targets = [];
  }
  return {
    ...detail,
    events,
    plan,
    captures,
    analysis,
    targets,
    ...summaryFields,
    ...page,
  };
}

/**
 * The page of a night read from the operator's catalogue on a **private
 * server** (state « importée »): such a night has
 * no session, so the Journal lists it under a synthetic identifier
 * (`catalogue:<date>:<target>`, `readOnly`); every other route answers 404 on
 * it. The page reads the line the Journal gives and draws it read-only. Null
 * when the identifier is not one, or the night is not (any more) there.
 */
export async function catalogueSessionForCurrentUser(sessionId) {
  const match = /^catalogue:(\d{4})-\d{2}-\d{2}:.+$/.exec(String(sessionId));
  if (!match) return null;
  const session = await currentPortalSession();
  if (!session) return null;
  try {
    const journal = await requireJournalService();
    const nights = await catalogueNightsOfPrivateServer();
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const list = await journal.read({
        tenantId: session.tenant_id,
        query: { year: match[1], limit: 100, ...(cursor ? { cursor } : {}) },
        catalogueNights: nights,
      });
      const line = list.sessions.find((entry) => entry.sessionId === sessionId);
      if (line) return line;
      if (!list.nextCursor) return null;
      cursor = list.nextCursor;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * What the page of a night adds, each part best-effort like the reads above — a part
 * that cannot be read is simply absent, never an error of the page:
 *
 * - `nightData`: the night's own fields, its steps and the summaries of its
 *   analysis (`GET /v1/sessions/{id}`'s `night`, `steps`, `qualitySummary`,
 *  `guidingSummary`, `guidingSeries`);
 * - `online`: « what is online for the night » (`…/online`), whose targets
 *   and captures make the tiles, and whose `analysis` names the device and
 *   the day the measures were sent;
 * - `captureCards`: for each capture of the night, what a tile draws (the
 *   thumbnail, the stage, the visibility and the team's line), read through
 *   « Mon espace › Captures »;
 * - `targetNames`: the designation of every target the page names;
 * - `equipmentNames`, `equipmentOptions`: the names of the night's and the
 *   plan's equipment, and the space's equipment (with the default rows) the
 *   field « Matériel » offers;
 * - `places`: the space's saved places (the planner's), offered by the
 *   field « Lieu » (no geocoding).
 */
async function nightPageFields({ tenantId, userId, sessionId, locale, plan }) {
  const nightData = await nightFields({ tenantId, sessionId });
  let online = null;
  try {
    const service = await nightService();
    online = service ? await service.online({ tenantId, sessionId }) : null;
  } catch {
    online = null;
  }

  const captureCards = {};
  const captureIds = [
    ...new Set(
      (online?.targets ?? []).flatMap((target) =>
        target.captures.map((capture) => capture.id),
      ),
    ),
  ];
  if (captureIds.length)
    try {
      const owner = await requireOwnerCaptureService();
      for (const captureId of captureIds) {
        try {
          const capture = await owner.get({
            tenantId,
            userId,
            captureId,
            locale,
          });
          captureCards[captureId] = {
            id: capture.id,
            stage: capture.stage,
            visibility: capture.visibility,
            thumbnail: Boolean(capture.thumbnail),
            preview: Boolean(capture.preview),
            state: capture.state?.teamLine
              ? { teamLine: capture.state.teamLine }
              : null,
          };
        } catch {
          // A capture gone between the two reads draws no card.
        }
      }
    } catch {
      // The capture storage is unavailable: the tiles draw no image.
    }

  const targetNames = {};
  for (const target of online?.targets ?? [])
    if (target.targetId && target.name)
      targetNames[target.targetId] = target.name;
  const wanted = [
    ...(nightData?.night?.targetIds?.value ?? []),
    ...(nightData?.steps ?? []).map((step) => step.targetId),
  ].filter((id) => id && !targetNames[id]);
  await Promise.all(
    [...new Set(wanted)].map(async (id) => {
      try {
        const knowledge = await targetKnowledgeFor({ id }, locale);
        if (knowledge?.title) targetNames[id] = knowledge.title;
      } catch {
        // No name: the page writes the identifier's designation it has.
      }
    }),
  );

  let equipmentOptions = [];
  const defaultNames = {};
  try {
    const reader = await equipmentReader();
    if (reader) {
      const own = await reader.listEquipment(tenantId);
      const defaults = await reader.defaultEquipmentForSpaces();
      equipmentOptions = [...own, ...defaults]
        .filter((item) => item?.id && item.name && !item.archivedAt)
        .map((item) => ({ id: item.id, type: item.type, name: item.name }));
      for (const item of defaults)
        if (item?.id && item.name) defaultNames[item.id] = item.name;
    }
  } catch {
    equipmentOptions = [];
  }
  const nightEquipment = nightData?.night?.equipment?.value ?? null;
  const equipmentNames = {
    ...defaultNames,
    ...(plan?.equipmentNames ?? {}),
    ...(nightEquipment
      ? await resolvedEquipmentNames(nightEquipment, tenantId)
      : {}),
  };

  let places = [];
  try {
    // The space's places (`/v1/places`, no longer the planner's document).
    const service = await placeResourceService();
    const list = service ? await service.list({ tenantId }) : null;
    places = (list?.places ?? [])
      .map((place) => ({
        name: String(place?.name || place?.locality || "").trim(),
        latitude: Number(place?.latitude),
        longitude: Number(place?.longitude),
      }))
      .filter(
        (place, index, all) =>
          place.name &&
          Number.isFinite(place.latitude) &&
          Number.isFinite(place.longitude) &&
          // Once each by name: the field lists names.
          all.findIndex((other) => other.name === place.name) === index,
      )
      .slice(0, 100);
  } catch {
    places = [];
  }

  return {
    nightData: nightData && nightData.night ? nightData : null,
    online,
    captureCards,
    targetNames,
    equipmentNames,
    equipmentOptions,
    places,
    spacePlaces: await spacePlaceZones(tenantId),
  };
}

// The small bundled stock catalogue guest planning falls back to
// (planner/planner.js — telescope/camera/eyepiece/modifier
// presets only: it has no mount or filter entries at all, see that
// module's own equipmentProfilesFromInventory). It is the same source as
// portal-app/lib/static-data-defaults.js's own "planner-equipment-presets"
// document, so the equipment page's own preset labels and this session
// page's own equipment names agree.
const stockEquipmentNames = new Map(
  [
    ...telescopeProfiles,
    ...cameraProfiles,
    ...eyepieceProfiles,
    ...opticalModifiers,
  ].map((profile) => [profile.id, profile.name]),
);

function equipmentIdsToResolve(equipment) {
  if (!equipment || typeof equipment !== "object") return [];
  const ids = [
    equipment.telescopeId,
    equipment.cameraId,
    equipment.eyepieceId,
    equipment.modifierId,
    equipment.mountId,
    ...(Array.isArray(equipment.filterIds) ? equipment.filterIds : []),
  ].filter((id) => id && id !== "none");
  return [...new Set(ids)];
}

/**
 * Every id a plan's own `payload.equipment` can carry (`telescopeId`,
 * `cameraId`, `eyepieceId`, `modifierId`, `mountId`, each `filterIds`
 * entry) resolved to a display name for the session page's equipment
 * block: an equipment catalogue id
 * shown as-is is exactly as much a "clé technique" as a bare target id
 * was. Two sources, best-effort: the bundled stock catalogue above, and
 * the tenant's own private equipment inventory
 * (packages/portal/persistence/equipment-reader.js) — the ONLY source for
 * `mountId` and `filterIds`, which the stock catalogue never covers. A
 * miss on both is not written here at all; SessionDetailPage.js falls
 * back to the raw id itself, exactly like target resolution's own
 * fallback.
 */
async function resolvedEquipmentNames(equipment, tenantId) {
  const ids = equipmentIdsToResolve(equipment);
  if (!ids.length) return {};
  const names = {};
  for (const id of ids) {
    const stockName = stockEquipmentNames.get(id);
    if (stockName) names[id] = stockName;
  }
  const unresolved = ids.filter((id) => !names[id]);
  if (unresolved.length) {
    try {
      const reader = await equipmentReader();
      if (reader) {
        const inventory = await reader.listEquipment(tenantId);
        const nameById = new Map(
          inventory
            .filter((item) => item.id && item.name)
            .map((item) => [item.id, item.name]),
        );
        for (const id of unresolved) {
          const name = nameById.get(id);
          if (name) names[id] = name;
        }
      }
    } catch {
      // The private inventory is unavailable: unresolved ids fall back
      // to the raw id, same as a stock-catalogue miss.
    }
  }
  return names;
}

/**
 * Every event's own `payload.targetId` (session-events/*.schema.json: a
 * catalogue id such as "openngc-ngc7331", or already a free label when the
 * target had none — note.schema.json's own words, "catalogue id, or the
 * same free label used there") resolved to a display title through the
 * same target library GalleryPage.js and /api/v1/targets/{targetId} read
 * from, and written back as `payload.targetLabel` so SessionDetailPage.js's
 * existing `payload.targetLabel || payload.targetId` reads a name instead
 * of the bare id — in its journal entries and in the notes attached to a
 * target. A miss (no catalogue match)
 * keeps the original value, which was already a free label rather than a
 * catalogue id.
 */
async function eventsWithResolvedTargetLabels(events, locale) {
  const list = events?.events || [];
  if (!list.length) return events;
  const targetIds = [
    ...new Set(list.map((event) => event.payload?.targetId).filter(Boolean)),
  ];
  if (!targetIds.length) return events;
  const titles = new Map();
  await Promise.all(
    targetIds.map(async (targetId) => {
      try {
        const knowledge = await targetKnowledgeFor({ id: targetId }, locale);
        if (knowledge?.title) titles.set(targetId, knowledge.title);
      } catch {
        // The target library is unavailable, or this id has no match:
        // the event keeps its raw targetId/targetLabel below, exactly
        // like before this resolution existed.
      }
    }),
  );
  if (!titles.size) return events;
  return {
    ...events,
    events: list.map((event) => {
      const resolved = event.payload?.targetId
        ? titles.get(event.payload.targetId)
        : null;
      if (!resolved || event.payload?.targetLabel) return event;
      return {
        ...event,
        payload: { ...event.payload, targetLabel: resolved },
      };
    }),
  };
}
