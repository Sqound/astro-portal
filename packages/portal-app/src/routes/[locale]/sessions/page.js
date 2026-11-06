import { redirect } from "next/navigation";
import { signInHrefFor } from "portal/sign-in-href.js";
import { JournalPage } from "portal/components/sessions/JournalPage.js";
import {
  journalFilters,
  journalHref,
} from "portal/components/sessions/journal-list-view.js";
import { NoSignInPage } from "portal/components/no-sign-in/NoSignInPage.js";
import { authEnabled, signInPath } from "../../../lib/auth.server.js";
import {
  abandonedHiddenCount,
  journalForCurrentUser,
  journalStatisticsForCurrentUser,
} from "../../../lib/journal.server.js";
import { pageMetadata } from "../../../lib/page-title.server.js";

// The browser title of the page (the locale layout carries the gallery's).
export const generateMetadata = pageMetadata("pageTitleJournal");

/**
 * The Journal: one list of the sessions of the space, read
 * from the same service as `GET /v1/journal` (`lib/journal.server.js`), its
 * filters in the address
 * (`?year=2026&season= autumn&outcome=to_debrief&multiNightOnly=true&view=calendar`).
 * The calendar is the calendar of one year: asked without one, it opens the
 * most recent year the space has a session in.
 */
export default async function Sessions({ params, searchParams }) {
  const { locale } = await params;
  // Without a sign-in there is no space to read.
  if (!authEnabled()) return <NoSignInPage locale={locale} page="journal" />;
  const query = await searchParams;
  const filters = journalFilters(query);
  const result = await journalForCurrentUser(filters, locale);
  if (
    result.status === "ready" &&
    filters.view === "calendar" &&
    !filters.year &&
    result.journal.years.length
  )
    redirect(
      journalHref(locale, { ...filters, year: result.journal.years[0] }),
    );
  // The default outcomes leave « Abandonnée » out: a list empty for that reason
  // says so instead of « Aucune session pour l'instant ».
  const hiddenCount =
    result.status === "ready" && !result.journal.sessions.length
      ? await abandonedHiddenCount(filters)
      : 0;
  // The statistics of the gallery, read only for their own view.
  const statistics =
    result.status === "ready" && filters.view === "statistics"
      ? await journalStatisticsForCurrentUser(filters)
      : null;
  return (
    <JournalPage
      locale={locale}
      statistics={statistics}
      hiddenCount={hiddenCount}
      status={result.status}
      signInHref={
        result.status === "visitor"
          ? signInHrefFor({ signInPath: signInPath() }, `/${locale}/sessions`)
          : null
      }
      journal={result.journal ?? null}
      curves={result.curves ?? {}}
      promise={result.promise ?? {}}
      pictures={result.pictures ?? {}}
      deleted={result.deleted ?? null}
      justDeleted={query?.deleted === "1"}
      filters={filters}
    />
  );
}
