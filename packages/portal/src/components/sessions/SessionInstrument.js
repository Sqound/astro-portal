// SMART-SCOPE-INSTRUMENT-PANEL-01 — « Instrument »: what a smart telescope said
// of itself during the night, on the page of a session (the cards and the curve
// of the night) and in the debriefing (the cards alone). The facts are
// `session-instrument-lines.js`'s (the phone reads the same events the same
// way); the sentences are written here, in the
// person's language, one card per fact the telescope gave and never a card
// without a fact. The hours are the place's when its zone is known, else UTC,
// like every other hour of the page (`SessionDevices.js`).

import { lowersMidSentence, message } from "../../i18n.js";
import { durationText } from "../../written-forms.js";
import { say } from "./night-detail-view.js";
import { reportClock } from "./session-page-view.js";
import {
  sessionInstrumentChart,
  sessionInstrumentSummary,
} from "./session-instrument-lines.js";

const FAMILY_NAMES = { vespera: "Vespera", seestar: "Seestar", dwarf: "DWARF" };

const FILTER_KEYS = {
  none: "sessionInstrumentFilterNone",
  dual_band: "sessionInstrumentFilterDualBand",
  cls: "sessionInstrumentFilterCls",
  light_pollution: "sessionInstrumentFilterLightPollution",
  other: "sessionInstrumentFilterOther",
};

const CAUSE_KEYS = {
  StackingRoundnessError: "sessionInstrumentCauseRoundness",
  StackingStarsError: "sessionInstrumentCauseStars",
  star_trails: "sessionInstrumentCauseTrails",
};

const instantOf = (iso) => Date.parse(iso);

/** A number in the reader's language, rounded to `digits` decimals at most. */
const figure = (value, locale, digits = 0) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
    .format(digits === 0 ? Math.round(value) : value)
    .replace("-", "−");

/** « 74 à 83 », or the one value when the two read the same. */
function rangeText(min, max, locale, digits = 0) {
  const from = figure(min, locale, digits);
  const to = figure(max, locale, digits);
  return from === to
    ? from
    : say(locale, "sessionInstrumentRange", { from, to });
}

const percent = (value, locale) =>
  say(locale, "sessionInstrumentPercent", { value });
const celsius = (value, locale) =>
  say(locale, "sessionInstrumentCelsius", { value });

/** « 700 gardées », « 1 gardée »: `base` + One / Other by the language's plural rule. */
function counted(locale, base, count) {
  const one = new Intl.PluralRules(locale).select(count) === "one";
  return say(locale, `${base}${one ? "One" : "Other"}`, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}

/**
 * The word of a filter: « Double bande », « CLS », « Anti-pollution », the
 * device's own word for `other`, « Aucun ». `lower`: inside a sentence, in the
 * languages that write a common noun there without its capital (a name such as
 * « CLS » and the device's word are kept as they are).
 */
export function instrumentFilterWord(
  filter,
  label,
  locale,
  { lower = false } = {},
) {
  if (filter === "other" && label) return label;
  const word = message(locale, FILTER_KEYS[filter] ?? FILTER_KEYS.other);
  return lower && filter !== "cls" && lowersMidSentence(locale)
    ? word.toLocaleLowerCase(locale)
    : word;
}

function deviceNames(summary, locale) {
  const family = FAMILY_NAMES[summary.family] ?? null;
  const fallback = message(locale, "sessionInstrumentDeviceFallback");
  return {
    device: summary.model ?? family ?? fallback,
    family: family ?? fallback,
  };
}

/**
 * What the page writes of the instrument in `events` (the session's journal):
 * `{ title, device, subtitle, cards, summary }`, or `null` when the night kept
 * no sample. A card is `{ id, label, value, detail, warn }`; `detail` is `null`
 * when the fact has nothing more to say.
 */
export function instrumentView(events, locale = "en", zone = null) {
  const summary = sessionInstrumentSummary(events ?? []);
  if (summary === null) return null;
  const at = (iso) => reportClock({ at: instantOf(iso) }, zone);
  const names = deviceNames(summary, locale);
  const separator = message(locale, "sessionInstrumentListSeparator");
  const spanText = ({ from, to, open }) =>
    from === to
      ? say(locale, "sessionInstrumentSpanAt", { from: at(from) })
      : say(
          locale,
          open ? "sessionInstrumentSpanOpen" : "sessionInstrumentSpan",
          { from: at(from), to: at(to) },
        );
  const seestar = summary.family === "seestar";

  const cards = [];
  const card = (id, label, value, detail = null, warn = false) =>
    cards.push({ id, label, value, detail, warn });

  // Filter: the last stretch that was not « none », and where it was mounted.
  if (summary.filter !== null) {
    const mounted = summary.filter.filter((entry) => entry.filter !== "none");
    if (mounted.length === 0) {
      card(
        "filter",
        message(
          locale,
          seestar
            ? "sessionInstrumentFilterSeestar"
            : "sessionInstrumentFilter",
        ),
        message(
          locale,
          seestar ? "sessionInstrumentInactive" : "sessionInstrumentFilterNone",
        ),
      );
    } else {
      const last = mounted[mounted.length - 1];
      const several = mounted.some((entry) => entry.filter !== last.filter);
      const parts = mounted.map((entry) => {
        const span = spanText(entry);
        return several
          ? `${instrumentFilterWord(entry.filter, entry.label, locale, { lower: true })} ${span}`
          : span;
      });
      if (summary.filter[0].filter === "none")
        parts.push(message(locale, "sessionInstrumentNoneBefore"));
      card(
        "filter",
        message(
          locale,
          seestar
            ? "sessionInstrumentFilterSeestar"
            : "sessionInstrumentFilter",
        ),
        seestar
          ? message(locale, "sessionInstrumentActive")
          : instrumentFilterWord(last.filter, last.label, locale),
        parts.join(" · "),
      );
    }
  }

  // Hygrometry: the humidity's range, the air's, the smallest margin to the dew point.
  const air = summary.hygrometry;
  if (air !== null) {
    const humidity =
      air.humidityMin === null
        ? null
        : percent(rangeText(air.humidityMin, air.humidityMax, locale), locale);
    const temperature =
      air.temperatureMin === null
        ? null
        : celsius(
            rangeText(air.temperatureMin, air.temperatureMax, locale),
            locale,
          );
    const parts = [
      air.until === null
        ? null
        : say(locale, "sessionInstrumentUntil", { time: at(air.until) }),
      humidity === null ? null : temperature,
      air.dewPointDepressionMin === null
        ? null
        : say(locale, "sessionInstrumentDewDepression", {
            value: celsius(
              figure(air.dewPointDepressionMin, locale, 1),
              locale,
            ),
            time: at(air.dewPointDepressionAt),
          }),
    ].filter(Boolean);
    card(
      "hygrometry",
      message(locale, "sessionInstrumentHumidity"),
      humidity ?? temperature ?? "—",
      parts.length ? parts.join(" · ") : null,
    );
  }

  // Heater: how long, and when.
  if (summary.heater !== null) {
    const { ranges, minutes } = summary.heater;
    if (ranges.length === 0) {
      card(
        "heater",
        message(locale, "sessionInstrumentHeater"),
        message(locale, "sessionInstrumentHeaterNever"),
        message(locale, "sessionInstrumentHeaterNeverDetail"),
      );
    } else {
      const duration = durationText(minutes, locale);
      card(
        "heater",
        message(locale, "sessionInstrumentHeater"),
        ranges.some((range) => range.open)
          ? say(locale, "sessionInstrumentAtLeast", { duration })
          : duration,
        say(locale, "sessionInstrumentHeaterActive", {
          spans: ranges.map(spanText).join(separator),
        }),
      );
    }
  }

  // Frames: the kept ones, the rejected ones and the main causes.
  const frames = summary.frames;
  if (
    frames !== null &&
    (frames.stacked !== null ||
      frames.rejected !== null ||
      frames.taken !== null)
  ) {
    const rejected =
      frames.rejected === null
        ? null
        : counted(locale, "sessionInstrumentRejected", frames.rejected);
    const takenText =
      frames.taken === null
        ? null
        : counted(locale, "sessionInstrumentTaken", frames.taken);
    const share =
      frames.rejected !== null &&
      frames.rejected > 0 &&
      frames.stacked !== null &&
      frames.stacked + frames.rejected > 0
        ? percent(
            figure(
              (100 * frames.rejected) / (frames.stacked + frames.rejected),
              locale,
            ),
            locale,
          )
        : null;
    const kept =
      frames.stacked === null
        ? null
        : counted(locale, "sessionInstrumentKept", frames.stacked);
    const parts = [];
    if (kept !== null && rejected !== null) {
      parts.push(
        frames.rejected === 0
          ? message(locale, "sessionInstrumentNoneRejected")
          : share === null
            ? rejected
            : say(locale, "sessionInstrumentRejectedShare", {
                rejected,
                percent: share,
              }),
      );
    } else if (kept !== null && takenText !== null) {
      parts.push(takenText);
    }
    // The main cause, and the second one when it counts for at least a
    // quarter of the rejections (3 of 190 is not worth a word).
    const causes = frames.causes
      .filter(
        (entry, index) =>
          index === 0 ||
          (index === 1 && entry.count * 4 >= (frames.rejected ?? 0)),
      )
      .slice(0, 2)
      .map((entry) =>
        CAUSE_KEYS[entry.cause]
          ? message(locale, CAUSE_KEYS[entry.cause])
          : entry.cause,
      );
    if (causes.length) parts.push(causes.join(separator));
    if (frames.rebuiltAt !== null)
      parts.push(
        say(locale, "sessionInstrumentRebuiltAt", {
          time: at(frames.rebuiltAt),
        }),
      );
    card(
      "frames",
      message(locale, "sessionInstrumentFrames"),
      kept ?? rejected ?? takenText,
      parts.length ? parts.join(" · ") : null,
    );
  }

  // Pointing given up.
  if (summary.pointing !== null) {
    const total = summary.pointing.reduce((sum, entry) => sum + entry.times, 0);
    const entries = summary.pointing.map((entry) => {
      const rest = [
        entry.attempts === null
          ? null
          : counted(locale, "sessionInstrumentTry", entry.attempts),
        entry.succeededAt === null
          ? null
          : say(locale, "sessionInstrumentSucceeded", {
              time: at(entry.succeededAt),
            }),
      ].filter(Boolean);
      return rest.length
        ? `${entry.target} · ${rest.join(separator)}`
        : entry.target;
    });
    card(
      "pointing",
      message(locale, "sessionInstrumentPointing"),
      counted(locale, "sessionInstrumentGiveUp", total),
      entries.join(message(locale, "sessionInstrumentEntrySeparator")),
    );
  }

  // Battery, from the first sample to the last.
  if (summary.battery !== null) {
    const { first, firstAt, last, lastAt } = summary.battery;
    card(
      "battery",
      message(locale, "sessionInstrumentBattery"),
      percent(figure(last, locale), locale),
      firstAt === lastAt
        ? say(locale, "sessionInstrumentBatteryAt", {
            value: percent(figure(last, locale), locale),
            time: at(lastAt),
          })
        : say(locale, "sessionInstrumentBatteryFlow", {
            first: percent(figure(first, locale), locale),
            firstAt: at(firstAt),
            last: percent(figure(last, locale), locale),
            lastAt: at(lastAt),
          }),
    );
  }

  // A Seestar's board, a DWARF's sensor.
  if (summary.board !== null) {
    const board = summary.board;
    card(
      "board",
      message(locale, "sessionInstrumentBoard"),
      board.min === null
        ? message(locale, "sessionInstrumentOverheatWord")
        : celsius(rangeText(board.min, board.max, locale), locale),
      board.overheatedAt === null
        ? null
        : board.min === null
          ? say(locale, "sessionInstrumentSpanAt", {
              from: at(board.overheatedAt),
            })
          : say(locale, "sessionInstrumentOverheat", {
              time: at(board.overheatedAt),
            }),
      board.overheatedAt !== null,
    );
  }
  const sensor = summary.sensor;
  if (sensor !== null && (sensor.min !== null || sensor.max !== null)) {
    card(
      "sensor",
      message(locale, "sessionInstrumentSensor"),
      celsius(
        rangeText(sensor.min ?? sensor.max, sensor.max ?? sensor.min, locale),
        locale,
      ),
    );
  }

  // The line under the title: the night's span, or where the collection stopped.
  const rebuilt =
    summary.rebuiltAt === null
      ? null
      : say(locale, "sessionInstrumentRebuiltOn", { device: names.family });
  let subtitle;
  if (summary.from === null) {
    subtitle = say(locale, "sessionInstrumentRebuiltOnly", {
      device: names.family,
    });
  } else {
    subtitle =
      summary.collectedUntil !== null
        ? say(locale, "sessionInstrumentGap", {
            until: at(summary.collectedUntil),
            back: at(summary.reopenedAt),
          })
        : summary.from === summary.to
          ? say(locale, "sessionInstrumentNightAt", { from: at(summary.from) })
          : say(locale, "sessionInstrumentNight", {
              from: at(summary.from),
              to: at(summary.to),
            });
    if (rebuilt !== null) subtitle = `${subtitle} · ${rebuilt}`;
  }

  return {
    title: message(locale, "sessionInstrumentTitle"),
    device: say(locale, "sessionInstrumentBy", { device: names.device }),
    subtitle,
    cards,
    summary,
  };
}

/**
 * What the instrument said of one target of the page, to add to its line
 * (« Déclaré 40 poses · L · double bande · 128 rejetées »): the filter the
 * device carried for it (nothing when it carried none) and the frames it
 * rejected. The target is read by its key, then by its name. `null` when the
 * instrument gave nothing on it.
 */
export function instrumentTargetLine(summary, card, locale = "en") {
  if (!summary?.targets?.length || !card) return null;
  const name = (value) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase("en") : null;
  const target =
    summary.targets.find(
      (entry) => entry.targetId !== null && entry.targetId === card.key,
    ) ??
    summary.targets.find(
      (entry) =>
        entry.targetLabel !== null &&
        name(entry.targetLabel) === name(card.label),
    );
  if (!target) return null;
  const filter =
    target.filter === null || target.filter === "none"
      ? null
      : instrumentFilterWord(target.filter, target.filterLabel, locale, {
          lower: true,
        });
  const rejected =
    target.rejected > 0
      ? counted(locale, "sessionInstrumentRejected", target.rejected)
      : null;
  return filter === null && rejected === null ? null : { filter, rejected };
}

/**
 * The entries of a journal list without the samples of the instrument: one
 * about every 5 minutes is no entry of the journal, its facts are the card
 * « Instrument ».
 */
export const withoutInstrumentSamples = (entries) =>
  (entries ?? []).filter((event) => event?.type !== "device_instrument");

const CHART = { width: 1000, height: 212, left: 46, right: 12 };

/** The curve of the night: humidity, heater, filter, rejected frames, holes. */
function InstrumentChart({ locale, events, summary, timeZone }) {
  const bins = sessionInstrumentChart(events, 10);
  if (!bins || bins.length < 2) return null;
  const humid = bins.filter((bin) => bin.humidity !== null);
  const filtered = bins.some(
    (bin) => bin.filter !== null && bin.filter !== "none",
  );
  const heated = bins.some((bin) => bin.heater);
  const rejected = bins.some((bin) => bin.rejected > 0);
  if (!humid.length && !filtered && !heated && !rejected) return null;

  const { width, height, left, right } = CHART;
  const plotWidth = width - left - right;
  const slot = plotWidth / bins.length;
  const x = (index) => left + index * slot;
  const top = 14;
  const base = 128;
  const barBase = height - 40;
  const barMax = 62;
  const low = humid.length
    ? Math.max(
        0,
        Math.floor((Math.min(...humid.map((b) => b.humidity)) - 2) / 10) * 10,
      )
    : 0;
  const high = humid.length
    ? Math.min(
        100,
        Math.ceil((Math.max(...humid.map((b) => b.humidity)) + 2) / 10) * 10,
      )
    : 100;
  const span = Math.max(20, high - low);
  const y = (value) => top + ((low + span - value) / span) * (base - top);
  const ticks = [];
  for (let value = low; value <= low + span; value += span > 30 ? 20 : 10)
    ticks.push(value);

  // The line breaks at a hole.
  const lines = [];
  let run = [];
  bins.forEach((bin, index) => {
    if (bin.humidity === null) {
      // Only a hole breaks the line; a slice with no sample is crossed.
      if (bin.hole) {
        if (run.length) lines.push(run);
        run = [];
      }
    } else run.push([x(index) + slot / 2, y(bin.humidity)]);
  });
  if (run.length) lines.push(run);

  const runsOf = (test) => {
    const runs = [];
    let start = null;
    bins.forEach((bin, index) => {
      if (test(bin)) start ??= index;
      else if (start !== null) {
        runs.push([start, index]);
        start = null;
      }
    });
    if (start !== null) runs.push([start, bins.length]);
    return runs;
  };
  const heaterRuns = runsOf((bin) => bin.heater);
  const filterRuns = runsOf(
    (bin) => bin.filter !== null && bin.filter !== "none",
  );
  const holeRuns = runsOf((bin) => bin.hole);
  const biggest = Math.max(1, ...bins.map((bin) => bin.rejected));
  const lastFilter = filterRuns.length
    ? bins[filterRuns[filterRuns.length - 1][1] - 1].filter
    : null;
  const filterLabel = lastFilter
    ? (summary?.filter?.find((entry) => entry.filter === lastFilter)?.label ??
      null)
    : null;
  const legend = message(locale, "sessionInstrumentChartLegend");
  const clockOf = (iso) => reportClock({ at: Date.parse(iso) }, timeZone);
  const hourly = bins
    .map((bin, index) => ({ bin, index }))
    .filter(({ index }) => index % 6 === 0);
  const longestHole = holeRuns.reduce(
    (best, entry) =>
      !best || entry[1] - entry[0] > best[1] - best[0] ? entry : best,
    null,
  );

  return (
    <figure
      className="night-instrument-chart"
      data-testid="session-instrument-chart"
    >
      <figcaption className="night-instrument-legend">{legend}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={legend}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern
            id="session-instrument-hatch"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="4" height="9" className="night-instrument-hatch" />
          </pattern>
        </defs>
        {heaterRuns.map(([from, to]) => (
          <rect
            key={`heater-${from}`}
            className="night-instrument-heater"
            x={x(from)}
            y={6}
            width={(to - from) * slot}
            height={barBase + 2 - 6}
          />
        ))}
        {holeRuns.map(([from, to]) => (
          <rect
            key={`hole-${from}`}
            className="night-instrument-hole"
            x={x(from)}
            y={6}
            width={(to - from) * slot}
            height={barBase + 2 - 6}
            fill="url(#session-instrument-hatch)"
          />
        ))}
        {humid.length
          ? ticks.map((value) => (
              <g key={`tick-${value}`}>
                <line
                  className="night-instrument-grid-line"
                  x1={left}
                  x2={width - right}
                  y1={y(value)}
                  y2={y(value)}
                />
                <text
                  className="night-instrument-axis"
                  x={left - 6}
                  y={y(value) + 4}
                  textAnchor="end"
                >
                  {percent(value, locale)}
                </text>
              </g>
            ))
          : null}
        {bins.map((bin, index) =>
          bin.rejected > 0 ? (
            <rect
              key={`bar-${index}`}
              className="night-instrument-bar"
              x={x(index) + slot * 0.1}
              y={barBase - Math.max(2, (bin.rejected / biggest) * barMax)}
              width={slot * 0.8}
              height={Math.max(2, (bin.rejected / biggest) * barMax)}
            />
          ) : null,
        )}
        {filterRuns.map(([from, to]) => (
          <rect
            key={`filter-${from}`}
            className="night-instrument-filter"
            x={x(from)}
            y={barBase + 3}
            width={(to - from) * slot}
            height={6}
          />
        ))}
        {lines.map((points, index) => (
          <polyline
            key={`line-${index}`}
            className="night-instrument-line"
            points={points
              .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
              .join(" ")}
          />
        ))}
        {heaterRuns.length ? (
          <text
            className="night-instrument-note is-heater"
            x={x(heaterRuns[0][0]) + 6}
            y={20}
          >
            {message(locale, "sessionInstrumentChartHeater")}
          </text>
        ) : null}
        {lastFilter ? (
          <text
            className="night-instrument-note is-filter"
            x={
              x(filterRuns[filterRuns.length - 1][0]) > width * 0.7
                ? x(filterRuns[filterRuns.length - 1][1])
                : x(filterRuns[filterRuns.length - 1][0])
            }
            y={barBase + 21}
            textAnchor={
              x(filterRuns[filterRuns.length - 1][0]) > width * 0.7
                ? "end"
                : "start"
            }
          >
            {say(locale, "sessionInstrumentChartFilter", {
              filter: instrumentFilterWord(lastFilter, filterLabel, locale, {
                lower: true,
              }),
            })}
          </text>
        ) : null}
        {longestHole ? (
          <text
            className="night-instrument-note"
            x={
              x(longestHole[0]) + ((longestHole[1] - longestHole[0]) * slot) / 2
            }
            y={42}
            textAnchor="middle"
          >
            {message(locale, "sessionInstrumentChartHole")}
          </text>
        ) : null}
        {hourly.map(({ bin, index }) => (
          <text
            key={`hour-${index}`}
            className="night-instrument-axis"
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : "middle"}
          >
            {clockOf(bin.from)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/**
 * The card « Instrument » of the page of a session and of the debriefing:
 * one small card per fact the telescope gave and, on the page, the curve of the
 * night (`chart`; the debriefing shows the cards alone). Nothing is drawn for a
 * night that kept no sample.
 */
export function SessionInstrument({
  locale = "en",
  events = [],
  timeZone = null,
  chart = true,
}) {
  const view = instrumentView(events, locale, timeZone);
  if (view === null || view.cards.length === 0) return null;
  return (
    <section
      className="night-card night-instrument"
      aria-labelledby="session-instrument-title"
      data-testid="session-instrument"
    >
      <div className="night-instrument-head">
        <h2 id="session-instrument-title">{view.title}</h2>
        <span className="night-instrument-device">{view.device}</span>
      </div>
      <p className="night-card-line night-instrument-subtitle">
        {view.subtitle}
      </p>
      {view.cards.length ? (
        <ul className="night-instrument-grid">
          {view.cards.map((entry) => (
            <li
              key={entry.id}
              className={`night-instrument-card${entry.warn ? " is-warn" : ""}`}
              data-fact={entry.id}
            >
              <span className="night-instrument-label">{entry.label}</span>
              <strong className="night-instrument-value">{entry.value}</strong>
              {entry.detail ? (
                <span className="night-instrument-detail">{entry.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {chart ? (
        <InstrumentChart
          locale={locale}
          events={events}
          summary={view.summary}
          timeZone={timeZone}
        />
      ) : null}
    </section>
  );
}
