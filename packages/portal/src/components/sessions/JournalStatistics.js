import { getAccountExtensions } from "portal/account/extensions.js";
import { message } from "portal/i18n.js";
import { JournalStatisticsDialog } from "./JournalStatisticsDialog.js";
import {
  counted,
  durationOf,
  eveningText,
  fill,
  journalHref,
  journalLineHref,
  journalStatisticsHref,
  reasonText,
} from "./journal-list-view.js";

// The Journal's « Statistiques »: the months of the year, the nights by outcome
// and — where the capability is granted — the targets and the instruments, each
// a link to its own dialog whose address is the page's (`?statsTarget=`,
// `?statsInstrument=`); the service reads the figures from
// `journal-statistics.js`. Server-rendered: no figure is worked out here, only
// written. A free profile (`held`) keeps the months and the nights; the card of
// the lock stands where the targets and the instruments would.

const pct = (value, total) =>
  total > 0
    ? `${Math.max(0, Math.min(100, (value / total) * 100)).toFixed(2)}%`
    : "0%";

const monthNarrow = (month, locale) =>
  new Intl.DateTimeFormat(locale, { month: "narrow", timeZone: "UTC" }).format(
    Date.UTC(2001, month, 1, 12),
  );
const monthLong = (month, locale) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    Date.UTC(2001, month, 1, 12),
  );

/** « 14 », « 4,5 »: hours, short, over a bar. */
const barHours = (seconds, locale) => {
  const hours = seconds / 3600;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: hours >= 10 || Number.isInteger(hours) ? 0 : 1,
  }).format(hours);
};

const framesOf = (count, locale) =>
  count > 0 ? counted(locale, "journalFramesCount", count) : null;

/** « du 12 août 2026 au 7 oct. 2026 », or the date alone for one night. */
export function rangeText(first, last, locale) {
  if (!first || !last) return "";
  const day = (date) => {
    const [year, month, number] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(Date.UTC(year, month - 1, number, 12));
  };
  if (first === last) return day(first);
  return fill(message(locale, "journalStatisticsRange"), {
    first: day(first),
    last: day(last),
  });
}

function Tile({ label, value, detail = null }) {
  return (
    <div className="journal-stat-tile">
      <span className="journal-stat-tile-label">{label}</span>
      <b className="journal-stat-tile-value">{value}</b>
      {detail ? (
        <span className="journal-stat-tile-detail">{detail}</span>
      ) : null}
    </div>
  );
}

function Row({ label, value, share, detail = null, href = null, testId }) {
  const body = (
    <>
      <span className="journal-stat-row-line">
        <span className="journal-stat-row-label">{label}</span>
        <span className="journal-stat-row-value">{value}</span>
      </span>
      <span className="journal-stat-bar" aria-hidden="true">
        <span style={{ width: pct(share, 1) }} />
      </span>
      {detail ? (
        <span className="journal-stat-row-detail">{detail}</span>
      ) : null}
    </>
  );
  return href ? (
    <a className="journal-stat-row is-link" href={href} data-testid={testId}>
      {body}
      <svg
        className="journal-stat-chevron"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </a>
  ) : (
    <div className="journal-stat-row" data-testid={testId}>
      {body}
    </div>
  );
}

function Section({ title, children, panel = true }) {
  return (
    <section className="journal-stat-section">
      <h3 className="journal-stat-group-label">{title}</h3>
      {panel ? <div className="journal-stat-panel">{children}</div> : children}
    </section>
  );
}

function MonthBars({ months, locale, label }) {
  const most = Math.max(0, ...months);
  return (
    <div className="journal-stat-months" role="img" aria-label={label}>
      {months.map((seconds, index) => (
        <div
          className="journal-stat-month"
          key={index}
          data-month={index + 1}
          title={`${monthLong(index, locale)}: ${durationOf(seconds, locale)}`}
        >
          <span className="journal-stat-month-value">
            {seconds > 0 ? barHours(seconds, locale) : ""}
          </span>
          <span className="journal-stat-month-track">
            <span
              className={`journal-stat-month-bar${seconds > 0 && seconds === most ? " is-best" : ""}${seconds === 0 ? " is-empty" : ""}`}
              style={{ height: seconds > 0 ? pct(seconds, most) : "2px" }}
            />
          </span>
          <span className="journal-stat-month-name">
            {monthNarrow(index, locale)}
          </span>
        </div>
      ))}
    </div>
  );
}

const monthsTitle = (year, locale) =>
  year
    ? fill(message(locale, "journalStatisticsMonthsTitleYear"), { year })
    : message(locale, "journalStatisticsMonthsTitle");

function BestCaptures({ captures, locale }) {
  if (!captures.length) return null;
  return (
    <Section
      title={message(locale, "journalStatisticsBestCaptures")}
      panel={false}
    >
      <ul className="journal-stat-captures">
        {captures.map((capture) => (
          <li key={capture.captureId}>
            <a
              href={`/${locale}/manage/captures/${encodeURIComponent(capture.captureId)}`}
              data-testid={`journal-statistics-capture-${capture.captureId}`}
            >
              <img
                src={`/api/v1/manage/captures/${encodeURIComponent(capture.captureId)}/media?variant=thumbnail`}
                alt=""
                loading="lazy"
                width="120"
                height="120"
              />
              <span>{eveningText(capture.eveningDate, locale)}</span>
              <span>{durationOf(capture.acquiredSeconds, locale)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * The lock card of the statistics that need the capability: the hosted
 * service's, registered at `journal.statisticsLock` (`portal/account/
 * extensions.js`) and given `{ locale }`. Without it nothing is drawn: a
 * server that sells nothing has no lock and no link to offers.
 */
function StatisticsLock({ locale }) {
  const [Lock] = getAccountExtensions("journal.statisticsLock");
  return Lock ? <Lock locale={locale} /> : null;
}

/** The body of the dialog of one target. */
export function TargetStatisticsBody({ stats, locale }) {
  const total = stats.acquiredSeconds;
  const bestSeconds = stats.bestNight.acquiredSeconds;
  return (
    <>
      <div className="journal-stat-tiles">
        <Tile
          label={message(locale, "journalStatisticsTotal")}
          value={durationOf(total, locale)}
          detail={
            framesOf(stats.frameCount, locale) ??
            message(locale, "sessionPageFramesUnknown")
          }
        />
        <Tile
          label={message(locale, "journalStatisticsNights")}
          value={String(stats.nights)}
          detail={rangeText(stats.firstNight, stats.lastNight, locale)}
        />
        <Tile
          label={message(locale, "journalStatisticsBestNightTile")}
          value={durationOf(bestSeconds, locale)}
          detail={eveningText(stats.bestNight.eveningDate, locale)}
        />
        <Tile
          label={message(locale, "journalStatisticsInstrumentsTitle")}
          value={String(stats.instruments.length)}
          detail={message(locale, "journalStatisticsInstrumentsTileDetail")}
        />
      </div>
      <Section title={message(locale, "journalStatisticsByFilter")}>
        {stats.filters.map((row) => (
          <Row
            key={row.filter ?? "none"}
            label={
              row.filter ?? message(locale, "journalStatisticsFilterUnknown")
            }
            value={durationOf(row.acquiredSeconds, locale)}
            share={total > 0 ? row.acquiredSeconds / total : 0}
          />
        ))}
      </Section>
      <Section title={message(locale, "journalStatisticsByNight")}>
        {stats.byNight.map((night) => (
          <Row
            key={night.sessionId ?? night.planId}
            testId={`journal-statistics-night-${night.sessionId ?? night.planId}`}
            label={eveningText(night.eveningDate, locale)}
            value={durationOf(night.acquiredSeconds, locale)}
            share={bestSeconds > 0 ? night.acquiredSeconds / bestSeconds : 0}
            detail={[
              framesOf(night.frameCount, locale),
              night.instrumentLabel,
              night.best
                ? message(locale, "journalStatisticsBestNightMark")
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            href={journalLineHref(locale, night)}
          />
        ))}
      </Section>
      {stats.instruments.length ? (
        <Section title={message(locale, "journalStatisticsInstrumentsUsed")}>
          {stats.instruments.map((row) => (
            <Row
              key={row.label}
              label={row.label}
              value={durationOf(row.acquiredSeconds, locale)}
              share={total > 0 ? row.acquiredSeconds / total : 0}
              detail={counted(
                locale,
                "journalStatisticsNightsCount",
                row.nights,
              )}
              href={journalStatisticsHref(locale, { instrument: row.label })}
            />
          ))}
        </Section>
      ) : null}
      <BestCaptures captures={stats.bestCaptures} locale={locale} />
      <p className="journal-statistics-note">
        {message(locale, "journalStatisticsConfirmedNote")}
      </p>
    </>
  );
}

/** The body of the dialog of one instrument. */
export function InstrumentStatisticsBody({ stats, locale, nightsHref }) {
  const most = stats.targets[0]?.acquiredSeconds ?? 0;
  return (
    <>
      <div className="journal-stat-tiles">
        <Tile
          label={message(locale, "journalStatisticsTotal")}
          value={durationOf(stats.acquiredSeconds, locale)}
          detail={
            framesOf(stats.frameCount, locale) ??
            message(locale, "sessionPageFramesUnknown")
          }
        />
        <Tile
          label={message(locale, "journalStatisticsNights")}
          value={String(stats.nights)}
          detail={rangeText(stats.firstNight, stats.lastNight, locale)}
        />
        <Tile
          label={message(locale, "journalStatisticsTargetsTitle")}
          value={String(stats.targetCount)}
          detail={
            stats.targets[0]
              ? fill(message(locale, "journalStatisticsTopTarget"), {
                  target: stats.targets[0].label,
                })
              : null
          }
        />
        <Tile
          label={message(locale, "journalStatisticsBestNightTile")}
          value={
            stats.bestNight
              ? durationOf(stats.bestNight.acquiredSeconds, locale)
              : "—"
          }
          detail={
            stats.bestNight
              ? [
                  eveningText(stats.bestNight.eveningDate, locale),
                  stats.bestNight.targetLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null
          }
        />
      </div>
      <Section title={message(locale, "journalStatisticsPhotographed")}>
        {stats.targets.map((row) => (
          <Row
            key={row.targetId}
            testId={`journal-statistics-target-row-${row.targetId}`}
            label={row.label}
            value={durationOf(row.acquiredSeconds, locale)}
            share={most > 0 ? row.acquiredSeconds / most : 0}
            detail={counted(locale, "journalStatisticsNightsCount", row.nights)}
            href={journalStatisticsHref(locale, { target: row.targetId })}
          />
        ))}
      </Section>
      <Section title={monthsTitle(stats.year, locale)}>
        <MonthBars
          months={stats.months}
          locale={locale}
          label={monthsTitle(stats.year, locale)}
        />
      </Section>
      <BestCaptures captures={stats.bestCaptures} locale={locale} />
      <p className="journal-statistics-more">
        <span>{message(locale, "journalStatisticsSeeNightsHint")}</span>{" "}
        <a
          className="btn-link"
          href={nightsHref}
          data-testid="journal-statistics-see-nights"
        >
          {counted(locale, "journalStatisticsSeeNights", stats.nights)}
        </a>
      </p>
    </>
  );
}

function NightsBlock({ nights, best, locale }) {
  const total =
    nights.executed + nights.partial + nights.noPlan + nights.abandoned;
  const causes = nights.lost
    .map(
      (entry) =>
        `${reasonText(entry.cause, locale) ?? entry.cause} ${entry.count}`,
    )
    .join(", ");
  return (
    <div className="journal-stat-panel" data-testid="journal-statistics-nights">
      <h3 className="journal-stat-panel-title">
        {message(locale, "journalStatisticsNights")}
      </h3>
      {nights.executed > 0 ? (
        <Row
          label={message(locale, "sessionOutcomeExecuted")}
          value={String(nights.executed)}
          share={nights.executed / total}
        />
      ) : null}
      {nights.partial > 0 ? (
        <Row
          label={message(locale, "sessionOutcomePartial")}
          value={String(nights.partial)}
          share={nights.partial / total}
        />
      ) : null}
      {nights.noPlan > 0 ? (
        <Row
          label={message(locale, "sessionOutcomeNoPlan")}
          value={String(nights.noPlan)}
          share={nights.noPlan / total}
        />
      ) : null}
      {nights.abandoned > 0 ? (
        <Row
          label={
            causes
              ? fill(
                  message(locale, "journalStatisticsNightsAbandonedCauses"),
                  { causes },
                )
              : message(locale, "journalStatisticsNightsAbandoned")
          }
          value={String(nights.abandoned)}
          share={nights.abandoned / total}
        />
      ) : null}
      {best ? (
        <p className="journal-stat-note">
          {best.targetLabel
            ? fill(message(locale, "journalStatisticsBestNight"), {
                date: eveningText(best.eveningDate, locale),
                duration: durationOf(best.acquiredSeconds, locale),
                target: best.targetLabel,
              })
            : fill(message(locale, "journalStatisticsBestNightNoTarget"), {
                date: eveningText(best.eveningDate, locale),
                duration: durationOf(best.acquiredSeconds, locale),
              })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The page of « Statistiques » and, when the address names one, the dialog of
 * a target or of an instrument. `statistics` is the service's answer
 * (`{ held, overview, targets, instruments }`), `null` when it could not be
 * read.
 */
export function JournalStatistics({ locale, statistics, filters }) {
  if (!statistics)
    return (
      <p className="sessions-empty journal-no-match" role="alert">
        {message(locale, "journalUnreadable")}
      </p>
    );
  const { overview, held } = statistics;
  const nothing =
    overview.months.every((seconds) => seconds === 0) &&
    overview.targets.length === 0 &&
    overview.nights.executed +
      overview.nights.partial +
      overview.nights.noPlan +
      overview.nights.abandoned ===
      0 &&
    !held;
  if (nothing)
    return (
      <p
        className="sessions-empty journal-no-match"
        data-testid="journal-statistics-nothing"
      >
        {message(locale, "journalStatisticsNothing")}
      </p>
    );
  const most = Math.max(0, ...overview.months);
  const best = most > 0 ? overview.months.indexOf(most) : -1;
  const targetsMost = overview.targets[0]?.acquiredSeconds ?? 0;
  const instrumentsMost = overview.instruments[0]?.acquiredSeconds ?? 0;
  const back = journalHref(locale, {
    ...filters,
    statsTarget: null,
    statsInstrument: null,
  });
  const targetStats = filters.statsTarget
    ? statistics.targets[filters.statsTarget]
    : null;
  const instrumentStats = filters.statsInstrument
    ? statistics.instruments[filters.statsInstrument]
    : null;
  const foldedTargets = overview.targets.slice(0, 5);
  return (
    <div
      className="journal-statistics"
      data-testid="journal-statistics"
      data-held={held ? "true" : "false"}
    >
      <div className="journal-stat-two">
        <section className="journal-stat-panel">
          <h3 className="journal-stat-panel-title">
            {monthsTitle(overview.year, locale)}
          </h3>
          <MonthBars
            months={overview.months}
            locale={locale}
            label={monthsTitle(overview.year, locale)}
          />
          {best >= 0 ? (
            <p className="journal-stat-note">
              {fill(message(locale, "journalStatisticsBestMonth"), {
                month: monthLong(best, locale),
                duration: durationOf(most, locale),
              })}
            </p>
          ) : null}
        </section>
        <NightsBlock
          nights={overview.nights}
          best={overview.bestNight}
          locale={locale}
        />
      </div>
      {held ? (
        getAccountExtensions("journal.statisticsLock").length ? (
          <Section
            title={message(locale, "journalStatisticsLockedSection")}
            panel={false}
          >
            <StatisticsLock locale={locale} />
          </Section>
        ) : null
      ) : (
        <div className="journal-stat-two">
          {overview.targets.length ? (
            <Section title={message(locale, "journalStatisticsTargetsTitle")}>
              {foldedTargets.map((row) => (
                <Row
                  key={row.targetId}
                  testId={`journal-statistics-target-row-${row.targetId}`}
                  label={row.label}
                  value={durationOf(row.acquiredSeconds, locale)}
                  share={
                    targetsMost > 0 ? row.acquiredSeconds / targetsMost : 0
                  }
                  detail={[
                    counted(locale, "journalStatisticsNightsCount", row.nights),
                    framesOf(row.frameCount, locale),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  href={journalHref(locale, {
                    ...filters,
                    statsTarget: row.targetId,
                    statsInstrument: null,
                  })}
                />
              ))}
              {overview.targets.length > foldedTargets.length ? (
                <details className="journal-stat-more">
                  <summary className="btn-link">
                    {counted(
                      locale,
                      "journalStatisticsSeeTargets",
                      overview.targets.length,
                    )}
                  </summary>
                  {overview.targets.slice(foldedTargets.length).map((row) => (
                    <Row
                      key={row.targetId}
                      testId={`journal-statistics-target-row-${row.targetId}`}
                      label={row.label}
                      value={durationOf(row.acquiredSeconds, locale)}
                      share={
                        targetsMost > 0 ? row.acquiredSeconds / targetsMost : 0
                      }
                      detail={[
                        counted(
                          locale,
                          "journalStatisticsNightsCount",
                          row.nights,
                        ),
                        framesOf(row.frameCount, locale),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      href={journalHref(locale, {
                        ...filters,
                        statsTarget: row.targetId,
                        statsInstrument: null,
                      })}
                    />
                  ))}
                </details>
              ) : null}
            </Section>
          ) : null}
          {overview.instruments.length ? (
            <Section
              title={message(locale, "journalStatisticsInstrumentsTitle")}
            >
              {overview.instruments.map((row) => (
                <Row
                  key={row.label}
                  testId={`journal-statistics-instrument-row-${row.label}`}
                  label={row.label}
                  value={durationOf(row.acquiredSeconds, locale)}
                  share={
                    instrumentsMost > 0
                      ? row.acquiredSeconds / instrumentsMost
                      : 0
                  }
                  detail={[
                    counted(locale, "journalStatisticsNightsCount", row.nights),
                    counted(
                      locale,
                      "journalStatisticsTargetsCount",
                      row.targetCount,
                    ),
                  ].join(" · ")}
                  href={journalHref(locale, {
                    ...filters,
                    statsInstrument: row.label,
                    statsTarget: null,
                  })}
                />
              ))}
            </Section>
          ) : null}
        </div>
      )}
      {filters.statsTarget ? (
        <JournalStatisticsDialog
          locale={locale}
          title={targetStats?.label ?? filters.statsTarget}
          subtitle={message(locale, "journalStatisticsTargetSubtitle")}
          closeHref={back}
          testId="journal-statistics-target-dialog"
        >
          {held ? (
            <StatisticsLock locale={locale} />
          ) : targetStats ? (
            <TargetStatisticsBody stats={targetStats} locale={locale} />
          ) : (
            <p>{message(locale, "journalStatisticsTargetEmpty")}</p>
          )}
        </JournalStatisticsDialog>
      ) : null}
      {filters.statsInstrument ? (
        <JournalStatisticsDialog
          locale={locale}
          title={filters.statsInstrument}
          subtitle={message(locale, "journalStatisticsInstrumentSubtitle")}
          closeHref={back}
          testId="journal-statistics-instrument-dialog"
        >
          {held ? (
            <StatisticsLock locale={locale} />
          ) : instrumentStats ? (
            <InstrumentStatisticsBody
              stats={instrumentStats}
              locale={locale}
              nightsHref={journalHref(locale, {
                year: null,
                instrument: filters.statsInstrument,
                season: null,
                outcomes: null,
                multiNightOnly: false,
                view: "list",
                statsTarget: null,
                statsInstrument: null,
              })}
            />
          ) : (
            <p>{message(locale, "journalStatisticsInstrumentEmpty")}</p>
          )}
        </JournalStatisticsDialog>
      ) : null}
    </div>
  );
}
