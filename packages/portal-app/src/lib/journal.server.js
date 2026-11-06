import {
  journalRequestQuery,
  journalServiceQuery,
  mergeJournalPages,
  qualityCurves,
} from "portal/components/sessions/journal-list-view.js";
import { currentPortalSession, planItemSlotsOf } from "./debrief.server.js";
import { targetPicturesOf } from "./target-pictures.server.js";
import { plannerCapabilitiesForSession } from "./planner-capabilities.server.js";
import {
  catalogueNightsOfPrivateServer,
  requireJournalService,
} from "./v1/journal-service.js";
import { requireSessionAnalysisService } from "./v1/session-analysis-resource-service.js";
import { requireSessionTrashService } from "./v1/session-trash-service.js";

// What the Journal page reads: the sessions of the
// signed-in space through `GET /v1/journal`'s own service — read directly, like
// the other pages of the portal do, never over HTTP to this process —, every
// page of the answer for the filters of the address (a hundred lines at a time,
// `PAGE_LIMIT` pages at most), and, for the sessions Astro Sync measured, the
// curves of « Qualité des captures » drawn from the night's analysis.
// Sequential reads, never `Promise.all`: they share the one SQLite driver,
// which refuses a second transaction begun before the first ends.
//
// The read is never held by a right (the contract): a visitor sees no space,
// a failure of the storage is its own state (« Réessayer »), nothing else.

const PAGE_SIZE = 100;
const PAGE_LIMIT = 10;
const CURVES_LIMIT = 40;

/**
 * `{ status: "visitor" }` for nobody signed in, `{ status: "failed" }` when the
 * storage could not be read, else `{ status: "ready", journal, curves, promise,
 * deleted }` — `journal` the pages merged (`mergeJournalPages`), `curves` by
 * session id, `deleted` the sessions in the trash.
 */
export async function journalForCurrentUser(filters, locale = "en") {
  const session = await currentPortalSession();
  if (!session) return { status: "visitor" };
  try {
    const service = await requireJournalService();
    const catalogueNights = await catalogueNightsOfPrivateServer();
    const pages = [];
    let cursor = null;
    do {
      const query = journalRequestQuery(filters);
      query.set("limit", String(PAGE_SIZE));
      if (cursor) query.set("cursor", cursor);
      const page = await service.read({
        tenantId: session.tenant_id,
        query,
        catalogueNights,
      });
      pages.push(page);
      cursor = page.nextCursor ?? null;
    } while (cursor && pages.length < PAGE_LIMIT);
    const journal = mergeJournalPages(pages);
    return {
      status: "ready",
      journal,
      curves: await curvesOf(session.tenant_id, journal.sessions),
      deleted: await deletedSessionsOf(session.tenant_id),
      // The catalogue's picture of every target a card or a group names, read
      // once here: a night keeps no picture of its own for a target it has no
      // capture of.
      pictures: await targetPicturesOf(journalTargetIds(journal), locale),
      promise: await planItemSlotsOf(
        session.tenant_id,
        journal.sessions
          .filter((item) => item.state === "to_debrief" && item.planId)
          .map((item) => item.planId),
      ),
    };
  } catch {
    return { status: "failed" };
  }
}

/** The catalogue ids of the targets the lines and the groups of a Journal name. */
export function journalTargetIds(journal) {
  const ids = new Set();
  for (const item of journal?.sessions ?? [])
    for (const target of item.targets ?? [])
      if (target?.targetId && target.state !== "removed")
        ids.add(target.targetId);
  for (const group of journal?.groups ?? [])
    if (group?.targetId) ids.add(group.targetId);
  return [...ids];
}

/**
 * The sessions deleted in the last 30 days, for « Sessions supprimées » at the
 * bottom of the Journal: the service's own list, read
 * where the page is made — never over HTTP to this process, so the restriction
 * of its routes to a web session does not touch it. A list that cannot be read
 * is no section, not a Journal that fails.
 */
async function deletedSessionsOf(tenantId) {
  try {
    const answer = await (
      await requireSessionTrashService()
    ).list({ tenantId });
    return { entries: answer.entries ?? [], graceDays: answer.graceDays ?? 30 };
  } catch {
    return { entries: [], graceDays: 30 };
  }
}

/** The curves of the measured sessions, by session id; a night with none draws none. */
async function curvesOf(tenantId, sessions) {
  const curves = {};
  let service = null;
  try {
    service = await requireSessionAnalysisService();
  } catch {
    return curves;
  }
  const wanted = sessions
    .filter((item) => item.sessionId && item.measured && item.quality)
    .slice(0, CURVES_LIMIT);
  for (const item of wanted) {
    try {
      const analysis = await service.get({
        tenantId,
        sessionId: item.sessionId,
      });
      const drawn = qualityCurves(analysis?.report);
      if (Object.values(drawn).some((curve) => curve.length > 1))
        curves[item.sessionId] = drawn;
    } catch {
      // A night whose analysis cannot be read draws its medians only.
    }
  }
  return curves;
}

/**
 * How many sessions the default outcomes leave out of a list that would
 * otherwise be empty: « Abandonnée » is unticked until the person ticks it, so
 * a Journal whose only sessions were abandoned must say so rather than
 * « Aucune session pour l'instant ». Read only when the page is empty; 0 when
 * it cannot be read.
 */
export async function abandonedHiddenCount(filters) {
  if (filters.outcomes) return 0;
  const session = await currentPortalSession();
  if (!session) return 0;
  try {
    const service = await requireJournalService();
    const catalogueNights = await catalogueNightsOfPrivateServer();
    const pages = [];
    let cursor = null;
    do {
      const query = journalServiceQuery({
        ...filters,
        outcomes: ["abandoned"],
      });
      query.set("limit", String(PAGE_SIZE));
      if (cursor) query.set("cursor", cursor);
      const page = await service.read({
        tenantId: session.tenant_id,
        query,
        catalogueNights,
      });
      pages.push(page);
      cursor = page.nextCursor ?? null;
    } while (cursor && pages.length < PAGE_LIMIT);
    return mergeJournalPages(pages).sessions.length;
  } catch {
    return 0;
  }
}

/**
 * The statistics of the gallery for the filters of the address: `null` for
 * nobody signed in or a storage that cannot be read, else the service's answer
 * (`{ held, overview, targets, instruments }`). The statistics by target and by
 * instrument need the capability: a profile without `gallery.private` gets
 * `held`, the year, the months and the nights only — withheld here, by the
 * service, never by the page alone. `focus` names the target or the instrument
 * whose dialog the address opens.
 */
export async function journalStatisticsForCurrentUser(filters) {
  const session = await currentPortalSession();
  if (!session) return null;
  try {
    const service = await requireJournalService();
    const capabilities = await plannerCapabilitiesForSession(session);
    return await service.statistics({
      tenantId: session.tenant_id,
      query: journalRequestQuery(filters),
      catalogueNights: await catalogueNightsOfPrivateServer(),
      held: capabilities?.["gallery.private"] !== true,
      focus: {
        targetId: filters.statsTarget ?? null,
        instrument: filters.statsInstrument ?? null,
      },
    });
  } catch {
    return null;
  }
}
