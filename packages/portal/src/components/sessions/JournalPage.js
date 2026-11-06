import { message } from "portal/i18n.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { EmptyState } from "../empty/EmptyState.js";
import { JournalCalendar } from "./JournalCalendar.js";
import { JournalControls } from "./JournalControls.js";
import { JournalDeleted, JournalNotice } from "./JournalDeleted.js";
import { JournalGroupCard, JournalGroupPointer } from "./JournalGroupCard.js";
import { JournalSessionCard } from "./JournalSessionCard.js";
import { JournalStatistics } from "./JournalStatistics.js";
import { SessionsAutoRefresh } from "./SessionsAutoRefresh.js";
import {
  JOURNAL_STATES,
  counted,
  journalHref,
  journalMonths,
  journalRows,
  monthHeading,
} from "./journal-list-view.js";

const StarGlyph = () => (
  <svg
    className="journal-empty-glyph"
    viewBox="0 0 24 24"
    width="44"
    height="44"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6L3.3 9.8l6.1-.7z" />
  </svg>
);

/** Nothing yet: one sentence, how a session arrives on the web — a plan debriefed after its night, or one sent by the phone. */
function Empty({ locale }) {
  return (
    <section className="journal-empty" data-testid="journal-empty">
      <StarGlyph />
      <h2>{message(locale, "journalEmptyTitle")}</h2>
      <p>{message(locale, "journalEmptyBody")}</p>
      <div className="btn-row journal-empty-action">
        <a className="btn-secondary" href={`/${locale}/planner`}>
          {message(locale, "journalPlanANight")}
        </a>
      </div>
    </section>
  );
}

/**
 * The Journal page (`/<locale>/sessions`): **one list of sessions** in the form
 * of the old journal — the big title, the line that says what a session is with
 * its ⓘ, « Sessions / Calendrier », the four lists and the box of the
 * multi-night plans, the figures of the selection, then a card per session,
 * month by month, a finished multi-night plan standing in the place of its most
 * recent session. The three zones of the page of before — the nights to debrief,
 * the finished nights, the nights rebuilt from the captures — are this one list:
 * a night to debrief is a card of its own (« À débriefer »), a night without a
 * plan a session « Sans plan », an imported night of a private server a
 * read-only session « importée ».
 *
 * One « Filtres » button and its badges
 * replace the four lists; every card has its ⋯ menu; the sessions deleted in the
 * last 30 days stand in « Sessions supprimées » at the bottom (`deleted`, the
 * answer of `GET /v1/journal/deleted`, read where the page is made); the
 * outcome is a tag of the shared palette.
 *
 * `status`: `ready` (the `journal`, merged pages of `GET /v1/journal`, and the
 * `curves` of the measured nights by session, and the `promise`: for a night
 * to debrief, the hours of its plan's targets by plan and plan item), `visitor` (no space: nothing
 * to read: the web's empty state, whose primary leads to the sign-in at
 * `signInHref`), `failed` (the storage could not be read: « Réessayer »).
 */
export function JournalPage({
  locale = "en",
  status = "ready",
  journal = null,
  curves = {},
  promise = {},
  // The catalogue's picture and type of each target by id (`pictures` of the
  // service's page): what a card draws for a target it holds no capture of.
  pictures = {},
  deleted = null,
  // The session page deleted its session and came here (`?deleted=1`).
  justDeleted = false,
  // The statistics of the gallery (`journalStatisticsForCurrentUser`), read for
  // the view « Statistiques » only.
  statistics = null,
  // How many sessions the default outcomes leave out of an empty list (the
  // abandoned ones, until « Abandonnée » is ticked).
  hiddenCount = 0,
  // Where « Se connecter » leads, and back here (the sign-in page of the
  // service, `portal/sign-in-href.js`); the visitor's one button.
  signInHref = null,
  filters = {
    year: null,
    instrument: null,
    season: null,
    outcomes: null,
    multiNightOnly: false,
    view: "list",
    statsTarget: null,
    statsInstrument: null,
  },
}) {
  const here = journalHref(locale, filters);
  const ready = status === "ready" && journal;
  const filtered = Boolean(
    filters.year ||
    filters.instrument ||
    filters.season ||
    filters.outcomes ||
    filters.multiNightOnly,
  );
  const empty = ready && !journal.sessions.length;
  const hiddenOnly = empty && !filtered && hiddenCount > 0;
  const calendarYear = filters.year ?? journal?.years?.[0] ?? null;
  return (
    <div className="journal-page" data-status={status}>
      <SessionsAutoRefresh signedIn={status !== "visitor"} />
      <h1 className="journal-title">{message(locale, "galleryJournal")}</h1>
      {/* An empty Journal says one sentence — how a session arrives; the
          line that says what a session is waits for the first. */}
      {empty && !filtered && !hiddenOnly ? null : (
        <div className="journal-lead-row">
          <p className="journal-lead">
            {message(locale, "journalSessionsIntro")}
          </p>
          <InfoButton
            locale={locale}
            label={message(locale, "journalNightsInfoLabel")}
            title={message(locale, "galleryJournal")}
            body={message(locale, "journalSessionsInfo")}
            testId="journal-info"
          />
        </div>
      )}
      {status === "visitor" ? (
        <div className="journal-visitor" data-testid="journal-visitor">
          <EmptyState
            sentence={message(locale, "journalGuestSessions")}
            actionLabel={signInHref ? message(locale, "journalSignIn") : null}
            actionHref={signInHref}
            actionTestId="journal-visitor-sign-in"
          />
        </div>
      ) : null}
      {status === "failed" ? (
        <section
          className="journal-empty is-failed"
          role="alert"
          data-testid="journal-failed"
        >
          <p>{message(locale, "journalUnreadable")}</p>
          <div className="btn-row journal-empty-action">
            <a className="btn-link" href={here}>
              {message(locale, "journalRetry")}
            </a>
          </div>
        </section>
      ) : null}
      {ready ? (
        <>
          <JournalControls
            locale={locale}
            filters={filters}
            years={journal.years}
            instruments={journal.instruments}
            stats={journal.stats}
            total={journal.sessions.length}
          />
          <JournalNotice
            initial={
              justDeleted
                ? {
                    text: message(
                      locale,
                      "journalSessionDeletedNotice",
                    ).replaceAll("{days}", String(deleted?.graceDays ?? 30)),
                    kind: "status",
                  }
                : null
            }
          />
          {hiddenOnly ? (
            <p
              className="sessions-empty journal-no-match"
              data-testid="journal-hidden-by-filter"
              aria-live="polite"
            >
              {counted(locale, "journalHiddenByFilter", hiddenCount)}
              {" · "}
              <a
                className="btn-link"
                href={journalHref(locale, {
                  ...filters,
                  outcomes: JOURNAL_STATES,
                })}
              >
                {message(locale, "journalHiddenShow")}
              </a>
            </p>
          ) : empty && !filtered ? (
            <Empty locale={locale} />
          ) : empty ? (
            <p className="sessions-empty journal-no-match" aria-live="polite">
              {message(locale, "journalNoMatch")}
            </p>
          ) : filters.view === "statistics" ? (
            <JournalStatistics
              locale={locale}
              statistics={statistics}
              filters={filters}
            />
          ) : filters.view === "calendar" && calendarYear ? (
            <JournalCalendar
              locale={locale}
              sessions={journal.sessions}
              groups={journal.groups}
              pictures={pictures}
              year={calendarYear}
            />
          ) : (
            <section className="session-list journal-list" aria-live="polite">
              {journalMonths(journalRows(journal)).map(({ month, rows }) => (
                <div className="journal-month" key={month} data-month={month}>
                  <h2 className="journal-month-heading">
                    {monthHeading(month, locale)}
                  </h2>
                  {rows.map((row) =>
                    row.kind === "group" ? (
                      <JournalGroupCard
                        key={`group-${row.group.projectId}`}
                        group={row.group}
                        items={row.items}
                        pictures={pictures}
                        locale={locale}
                      />
                    ) : row.kind === "pointer" ? (
                      <JournalGroupPointer
                        key={`pointer-${row.group.projectId}-${row.item.sessionId ?? row.item.planId}`}
                        group={row.group}
                        item={row.item}
                        month={row.groupMonth}
                        locale={locale}
                      />
                    ) : (
                      <JournalSessionCard
                        key={row.item.sessionId ?? row.item.planId}
                        item={row.item}
                        curves={curves[row.item.sessionId] ?? null}
                        slots={promise[row.item.planId] ?? null}
                        pictures={pictures}
                        locale={locale}
                      />
                    ),
                  )}
                </div>
              ))}
            </section>
          )}
          {deleted?.entries?.length ? (
            <JournalDeleted
              locale={locale}
              entries={deleted.entries}
              graceDays={deleted.graceDays}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
