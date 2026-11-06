import { notFound, redirect } from "next/navigation";
import { NightSessionSurface } from "planner/components/NightSessionSurface.js";
import { SessionReadFailed } from "portal/components/sessions/SessionReadFailed.js";
import {
  catalogueSessionForCurrentUser,
  currentPortalSession,
  sessionDetailForCurrentUser,
} from "../../../../lib/debrief.server.js";
import { plannerCapabilitiesForSession } from "../../../../lib/planner-capabilities.server.js";
import { pageMetadata } from "../../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("debriefSessionDetailTitle");

/**
 * One session's own page: the head, the frise of the
 * night with its reports, a card per target, the quality, the message of Astro
 * Sync, and under « Détails de la nuit » what the page of a night held (the
 * fields, the steps, the notes, the journal). Sits under sessions/{sessionId} —
 * a static "debrief" segment is a sibling directory, so it is matched first and
 * never swallowed by this dynamic one.
 *
 * A composition may draw it through its own surface (`Surface`), the way it
 * does its debrief screen.
 */
export function createSessionPage({ Surface = NightSessionSurface } = {}) {
  return async function SessionPage({ params }) {
    const { locale, sessionId: raw } = await params;
    // The identifier of a night of the catalogue holds colons (`catalogue:
    // 2026-01-15:m42`), which an address writes as `%3A`: Next hands the
    // segment over as written.
    let sessionId = raw;
    try {
      sessionId = decodeURIComponent(raw);
    } catch {
      sessionId = raw;
    }
    // A night of the operator's catalogue (a private server): read-only, drawn
    // from the line the Journal gives it.
    const catalogueLine = await catalogueSessionForCurrentUser(sessionId);
    if (catalogueLine)
      return (
        <Surface
          locale={locale}
          sessionId={sessionId}
          readOnly
          session={{
            id: sessionId,
            planId: null,
            status: "finished",
            origin: "import",
            outcome: null,
            projectId: null,
            startedAt: catalogueLine.startedAt,
            finishedAt: catalogueLine.finishedAt,
            eveningDate: catalogueLine.eveningDate,
            reworkRevision: 0,
          }}
          events={{ events: [] }}
          targets={catalogueLine.targets}
          plan={null}
        />
      );
    const detail = await sessionDetailForCurrentUser(sessionId, locale);
    if (!detail) notFound();
    if (detail.readFailed) return <SessionReadFailed locale={locale} />;
    // A night of a plan not yet debriefed is the debriefing: the first moment
    // of the session.
    if (
      detail.session.status === "finished" &&
      detail.session.planId &&
      !detail.session.outcome &&
      detail.plan?.status === "active"
    )
      redirect(
        `/${locale}/sessions/debrief/${encodeURIComponent(detail.session.planId)}`,
      );
    // The person's capabilities, for the gestures that need « Synchronisation
    // avancée+ » (the row « Plan multi-nuits » of the night).
    const capabilities = await plannerCapabilitiesForSession(
      await currentPortalSession(),
    );
    return (
      <Surface
        locale={locale}
        sessionId={sessionId}
        session={detail.session}
        supplements={detail.supplements}
        events={detail.events}
        targets={detail.targets ?? []}
        plan={detail.plan}
        debriefSummary={detail.debriefSummary ?? null}
        analysis={detail.analysis}
        nightData={detail.nightData ?? null}
        online={detail.online ?? null}
        captureCards={detail.captureCards ?? {}}
        targetNames={detail.targetNames ?? {}}
        equipmentNames={detail.equipmentNames ?? {}}
        equipmentOptions={detail.equipmentOptions ?? []}
        places={detail.places ?? []}
        spacePlaces={detail.spacePlaces ?? []}
        capabilities={capabilities}
      />
    );
  };
}

export default createSessionPage();
