// What the page of a session writes (`DebriefSessionWeb`), worked out from the
// model without React: the head's words, the lines of a target's card, the
// sentence of a report. The hours are the place's when its zone is given,
// UTC otherwise.

import { message } from "../../i18n.js";
import { clockText, durationText } from "../../written-forms.js";
import { sessionSpanMinutes } from "../../session-figures.js";
import { causeLabel } from "./night-summary-view.js";
import { integrationText, say, utcClock } from "./night-detail-view.js";
import {
  measuredShootingText,
  plannedShootingText,
} from "./acquisition-figures.js";
import { DETECTED_REPORT_KINDS } from "./session-page-model.js";
import {
  resolvePlaceTimeZone,
  sessionPlaceWithZone,
} from "../../planner/place-time-zone.js";

const NBSP = " ";
const UNIT_SPACE = "\u00a0";
const iso = (at) => new Date(at).toISOString();
const clock = (at) => utcClock(iso(at));

/** « Session du plan « … » », « Session du plan multi-nuits « … » », « Session sans plan ». */
export function fromLine(kind, planName, locale) {
  if (kind === "noPlan") return message(locale, "sessionPageNoPlan");
  const name = planName || message(locale, "debriefPlanUntitled");
  return say(
    locale,
    kind === "multiNight"
      ? "sessionPageFromMultiNightPlan"
      : "sessionPageFromPlan",
    { plan: name },
  );
}

/**
 * The tone of a session's outcome in the shared palette of states: « À débriefer » blue, the outcomes of a night past grey,
 * « Sans plan » none.
 */
export const outcomeTone = (kind) =>
  ({
    toDebrief: "toDebrief",
    executed: "executed",
    partial: "partial",
    notExecuted: "abandoned",
  })[kind] ?? null;

/**
 * « Session · Nuit du 7 au 8 oct. »:
 * the title of the page of a session, with the night in it.
 */
export function sessionTitle(eveningDate, locale) {
  const night = nightTitle(eveningDate, locale);
  return night ? say(locale, "sessionPageTitle", { night }) : null;
}

/**
 * The name the person gave to the session itself: the night's `title` when
 * the night holds it (`source: "night"`), never the plan's name the title is
 * read through while it is unset. `null` when none was given.
 */
export function givenSessionName(night) {
  const title = night?.title;
  if (title?.source !== "night" || typeof title.value !== "string") return null;
  return title.value.trim() || null;
}

/**
 * What the head of a session says: its name when one was given, with the night
 * under it (`nightLine`); else « Session · Nuit du … » and no night line.
 * `title` is `null` for a session with neither a name nor a date -- the page
 * then says « Session sans plan ».
 */
export function sessionHeading({ night = null, eveningDate, locale }) {
  const name = givenSessionName(night);
  if (name) return { title: name, nightLine: nightTitle(eveningDate, locale) };
  return { title: sessionTitle(eveningDate, locale), nightLine: null };
}

/**
 * « Plan d'origine · « … » »: the link under the title that replaces
 * the overline « Session du plan « … » » and the link at the foot of the page.
 */
export const originLine = (planName, locale) =>
  say(locale, "sessionOriginPlan", {
    plan: planName || message(locale, "debriefPlanUntitled"),
  });

/**
 * The hours of the night on the line of the place: in the hours of the
 * place when it has a time zone, else in UTC — and « UTC » is then written,
 * once. Never the hours of the person's own clock.
 */
export function sessionHours(startedAt, finishedAt, timeZone) {
  if (!startedAt) return null;
  if (finishedAt && Date.parse(finishedAt) <= Date.parse(startedAt))
    return null;
  // `Etc/UTC` is UTC.
  const zone =
    timeZone && timeZone !== "UTC" && timeZone !== "Etc/UTC" ? timeZone : null;
  const from = clockText(startedAt, zone ?? "UTC");
  const to = clockText(finishedAt ?? startedAt, zone ?? "UTC");
  // A window that is empty to the minute is no window: no hours are said.
  if (finishedAt && from === to) return null;
  const range = `${from} → ${to}`;
  return zone ? range : `${range} UTC`;
}

/**
 * The hours of a session from its places: the zone is found by the one rule of
 * the place -- the night's own place, the plan's copy of it, the places the
 * person keeps (`sessionPlaceWithZone`), then the table by the position
 * (`resolvePlaceTimeZone`) -- and the hours are written in it; « UTC » only
 * when no zone can be read (replayed through the `session-hours` fixture).
 */
export function sessionHoursOfPlaces(
  startedAt,
  finishedAt,
  nightPlace,
  planPlace,
  knownPlaces = [],
) {
  const place = sessionPlaceWithZone(nightPlace, planPlace, knownPlaces);
  const zone = place ? resolvePlaceTimeZone(place).timeZone : null;
  return sessionHours(startedAt, finishedAt, zone);
}

/**
 * The state of the sending of a session, under its head: what it still waits for from
 * Astro Sync — its captures, its logs — or that it is complete, that a visual
 * session waits for nothing, or that it waits for its debriefing. `waits` is
 * true while something is waited for.
 */
export function sessionSendingState({
  outcomeKind,
  visual = false,
  hasCaptures = false,
  hasLogs = false,
  fromAstroSync = false,
}) {
  if (outcomeKind === "toDebrief")
    return { key: "sessionStateToDebrief", waits: true };
  if (visual) return { key: "sessionStateVisual", waits: false };
  // A night that had no plan was never debriefed: its sentences do not say it
  // was.
  const stateKey = (name) =>
    `sessionState${outcomeKind === "noPlan" ? "NoPlan" : ""}${name}`;
  if (hasCaptures && hasLogs)
    return { key: stateKey("Complete"), waits: false };
  // A night Astro Sync created and sent says where its captures came from;
  // it does not wait for logs a device may never write (a smart telescope
  // writes none), and the person adds them if they have some.
  if (hasCaptures && fromAstroSync)
    return {
      key: stateKey(
        outcomeKind === "noPlan" ? "FromAstroSync" : "CapturesFromAstroSync",
      ),
      waits: false,
    };
  if (hasCaptures) return { key: stateKey("AwaitingLogs"), waits: true };
  if (hasLogs) return { key: stateKey("AwaitingCaptures"), waits: true };
  return { key: stateKey("AwaitingBoth"), waits: true };
}

const OUTCOME_KEY = {
  toDebrief: "sessionOutcomeToDebrief",
  executed: "sessionOutcomeExecuted",
  partial: "sessionOutcomePartial",
  notExecuted: "sessionOutcomeNotExecuted",
  noPlan: "sessionOutcomeNoPlan",
};

export const outcomeLabel = (kind, locale) =>
  message(locale, OUTCOME_KEY[kind] ?? OUTCOME_KEY.noPlan);

/**
 * « Nuit du 7 au 8 oct. », « Night of Oct 7 to 8 »: the evening and the
 * morning after, the month said once when it is the same.
 */
export function nightTitle(eveningDate, locale) {
  const match = String(eveningDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const evening = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  const morning = new Date(evening.getTime() + 86_400_000);
  const part = (date, options) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
      date,
    );
  const full = { day: "numeric", month: "short" };
  const parts = (date) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...full }).formatToParts(
      date,
    );
  // The day alone, as the language writes a day before its month (« 27. » in
  // German, « 27日 » in Japanese).
  const dayOnly = (date) => {
    const written = parts(date);
    const at = written.findIndex((entry) => entry.type === "day");
    const dot = String(written[at + 1]?.value ?? "").startsWith(".");
    return `${part(date, { day: "numeric" })}${dot ? "." : ""}`;
  };
  // When both dates are in the same month it is said once, where the language
  // writes it: with the first date in the languages that put the month before
  // the day ("Oct 27 to 28", 10月27日から28日), with the second in the others
  // ("27 au 28 oct.").
  const sameMonth = evening.getUTCMonth() === morning.getUTCMonth();
  const monthFirst =
    parts(evening)
      .map((entry) => entry.type)
      .filter((type) => type === "month" || type === "day")
      .indexOf("month") === 0;
  const start =
    sameMonth && !monthFirst ? dayOnly(evening) : part(evening, full);
  const end = sameMonth && monthFirst ? dayOnly(morning) : part(morning, full);
  return say(locale, "sessionPageNightTitle", { start, end });
}

/** « 40 × 180 s » when the steps of the night give one exposure, else « 40 poses ». */
export function framesLine(card, locale) {
  const frames = card.frameCount;
  if (frames === null || frames === undefined) return null;
  if (card.exposureSeconds)
    return say(locale, "sessionPageFramesTimes", {
      count: frames,
      seconds: card.exposureSeconds,
    });
  return say(
    locale,
    frames === 1 ? "sessionPageFramesOne" : "sessionPageFramesOther",
    { count: frames },
  );
}

const REASON_KEY = {
  weather: "debriefReasonWeather",
  equipment: "debriefReasonEquipment",
  time: "debriefReasonTime",
  visibility: "debriefReasonVisibility",
  other: "debriefReasonOther",
};

export const reasonLabel = (reason, locale) =>
  REASON_KEY[reason] ? message(locale, REASON_KEY[reason]) : null;

/** « Raison : météo »: why a night was not carried out (every target took it out), or null. */
export function notExecutedLine(cards, locale) {
  const reason = cards.map((card) => card.reason).find(Boolean);
  const label = reason ? reasonLabel(reason, locale) : null;
  return label
    ? say(locale, "sessionPageNotExecutedReason", { reason: label })
    : null;
}

/**
 * The lines of a card: what the plan promised (« Prévu 21:06 → 23:36 · 2 h
 * 30 », « Pas dans le plan »), what the night gave (« Fait 21:08 → 23:28 ·
 * 2 h 00 », « Non faite · météo »), the frames (« 40 × 180 s ·
 * Dual-band »).
 */
export function cardLines(card, locale, zone = null, { visual = false } = {}) {
  // The hours of the place when its zone is known, UTC otherwise.
  const clock = (at) => (zone ? clockText(at, zone) : utcClock(iso(at)));
  const lines = {
    planned: null,
    done: null,
    frames: null,
    // « Prévu 28 × 120 s · gain 100 · L » against « Mesuré (Astro Sync)
    // … » or « Déclaré … », one string each (the lines of a camera with
    // several filters are joined by « + »).
    plannedShooting: null,
    measuredShooting: null,
  };
  if (card.state === "added")
    lines.planned = message(locale, "sessionPageNotInPlan");
  else if (card.plannedSlot ?? card.slot) {
    // The promise as the plan made it (not cut to the window), its hours
    // cut to their minute and its length the minutes between them.
    const promised = card.plannedSlot ?? card.slot;
    lines.planned = say(locale, "sessionPagePlannedSpan", {
      start: clock(promised.start),
      end: clock(promised.end),
      duration: durationText(
        sessionSpanMinutes(promised.start, promised.end) ?? 0,
        locale,
      ),
    });
  } else if (card.plannedSeconds)
    lines.planned = say(locale, "sessionPagePlannedOnly", {
      duration: durationText(Math.round(card.plannedSeconds / 60), locale),
    });
  if (!visual) {
    lines.plannedShooting = plannedShootingText(card.plannedShooting, locale);
    lines.measuredShooting = measuredShootingText(
      card.measuredShooting,
      locale,
    );
  }
  const closed = (card.passages ?? []).filter(
    (passage) => passage.end !== null && passage.end > passage.start,
  );
  if (card.noTimeTonight) {
    // The night left it without time.
    lines.done = message(locale, "sessionPageNoTimeTonight");
  } else if (card.state === "removed" || card.outcome === "skipped") {
    lines.done = [
      message(locale, "sessionPageNotDone"),
      reasonLabel(card.reason, locale),
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (
    card.acquiredSeconds !== null &&
    card.acquiredSeconds !== undefined
  ) {
    const acquired = integrationText(card.acquiredSeconds, locale);
    // A target observed in several passages lists them,
    // then their time together, the pauses inside them deducted.
    const paused = closed.reduce(
      (sum, passage) =>
        sum +
        (card.reports ?? [])
          .filter(
            (report) =>
              report.kind === "pause" &&
              report.until !== null &&
              report.until !== undefined,
          )
          .reduce(
            (inside, report) =>
              inside +
              Math.max(
                0,
                Math.min(passage.end, report.until) -
                  Math.max(passage.start, report.at),
              ),
            0,
          ),
      0,
    );
    if (closed.length > 1 && !card.hoursSet) {
      lines.done = {
        span: say(locale, "sessionPagePassages", {
          list: closed
            .map((passage) => `${clock(passage.start)} → ${clock(passage.end)}`)
            .join(" · "),
        }),
        cumulated: say(locale, "sessionPageCumulated", {
          duration: acquired,
        }),
        deducted:
          paused >= 60_000
            ? say(locale, "sessionPagePauseDeducted", {
                duration: durationText(Math.round(paused / 60_000), locale),
              })
            : null,
        acquired: null,
      };
      const frames = card.state === "removed" ? null : framesLine(card, locale);
      lines.frames = frames ?? message(locale, "sessionPageFramesUnknown");
      if (card.filter) lines.frames = `${lines.frames} · ${card.filter}`;
      // A night at the eyepiece takes no frames; the measured line says them
      // already.
      if (visual || lines.measuredShooting) lines.frames = null;
      return lines;
    }
    lines.done = {
      span:
        card.realStart !== null && card.realEnd !== null
          ? say(locale, "sessionPageDoneSpan", {
              start: clock(card.realStart),
              end: clock(card.realEnd),
            })
          : message(locale, "sessionPageDone"),
      acquired,
    };
  } else if (card.outcome === "done") {
    lines.done = {
      span: message(locale, "sessionPageDoneAsPlanned"),
      acquired: null,
    };
  }
  const frames = card.state === "removed" ? null : framesLine(card, locale);
  const filter = card.state === "removed" ? null : card.filter;
  const parts = [
    frames ??
      (card.state !== "removed" && card.outcome !== "skipped" && lines.done
        ? message(locale, "sessionPageFramesUnknown")
        : null),
    filter ??
      (frames && card.measured ? message(locale, "sessionPageNoFilter") : null),
  ].filter(Boolean);
  lines.frames =
    parts.length && !visual && !lines.measuredShooting
      ? parts.join(" · ")
      : null;
  return lines;
}

const SKY_KEY = {
  clear: "sessionPageSkyClear",
  mostly_clear: "sessionPageSkyMostlyClear",
  partly_cloudy: "sessionPageSkyPartlyCloudy",
  mostly_cloudy: "sessionPageSkyMostlyCloudy",
  overcast: "sessionPageSkyOvercast",
  fog: "sessionPageSkyFog",
  hazy: "sessionPageSkyHazy",
  cloudy: "sessionPageSkyCloudy",
};

/** « Pause · Retournement au méridien · 10 min », « Ciel voilé », a note's own text… */
export function reportText(report, locale, zone = null) {
  if (report.kind === "pause") {
    const minutes =
      report.until !== null && report.until !== undefined
        ? Math.max(0, Math.round((report.until - report.at) / 60_000))
        : null;
    const label = report.cause
      ? causeLabel(locale, report.cause)
      : (report.text ?? null);
    const what = label
      ? say(locale, "sessionPagePauseCause", { cause: label })
      : message(locale, "sessionPagePause");
    return [
      report.cause && report.text ? `${what} — ${report.text}` : what,
      minutes === null ? null : durationText(minutes, locale),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (report.kind === "sky")
    return [
      SKY_KEY[report.sky] ? message(locale, SKY_KEY[report.sky]) : null,
      report.text,
    ]
      .filter(Boolean)
      .join(" — ");
  if (isDetectedKind(report.kind))
    return detectedSentence(report, locale, zone) ?? report.text ?? "";
  // The fall-back of a kind this version does not know: « Signalement · … »,
  // the sentence the service gave when it gave one.
  if (report.kind === "signal")
    return [message(locale, "sessionPageLegendSignal"), report.text]
      .filter(Boolean)
      .join(" · ")
      .replace(/^./u, (letter) => letter.toLocaleUpperCase(locale));
  return report.text || "";
}

/** A number in the reader's language, up to `digits` decimals, at least `least`. */
const figure = (value, locale, { least = 0, digits = 3 } = {}) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: least,
    maximumFractionDigits: digits,
  }).format(value);
const finiteOf = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
/** The clock of an instant in the place's zone (`zone`), UTC without one. */
const zonedClock = (at, zone) =>
  zone && zone !== "UTC" ? clockText(at, zone) : clock(at);
const instantClock = (value, zone = null) => {
  const at = Date.parse(value);
  return Number.isFinite(at) ? zonedClock(at, zone) : null;
};

/** « −10 °C »: the minus is the true one (U+2212) and the unit follows a no-break space. */
const celsius = (value, locale) =>
  `${figure(value, locale, { digits: 1 }).replace("-", "\u2212")}${UNIT_SPACE}°C`;

/**
 * The sentence of a report Astro Sync detected, composed
 * here from the structured fields of the payload, in the reader's language:
 * « Attentes de guidage dépassées : 11 fois de 23:44 à 05:44 », its hours
 * the place's (`zone`, the zone of the line that shows it; UTC without
 * one). `null` when the payload does not say enough (a report of a kind
 * that is not detected, or a payload of another shape): the reader then
 * shows the kind alone.
 */
export function detectedSentence(report, locale, zone = null) {
  const payload = report.payload ?? {};
  if (report.kind === "exposure") {
    const from = finiteOf(payload.fromSeconds);
    const to = finiteOf(payload.toSeconds);
    return from === null || to === null
      ? null
      : say(locale, "sessionReportExposure", {
          from: `${figure(from, locale)}${UNIT_SPACE}s`,
          to: `${figure(to, locale)}${UNIT_SPACE}s`,
        });
  }
  if (report.kind === "temperature") {
    const from = finiteOf(payload.fromCelsius);
    const to = finiteOf(payload.toCelsius);
    return from === null || to === null
      ? null
      : say(locale, "sessionReportTemperature", {
          from: celsius(from, locale),
          to: celsius(to, locale),
        });
  }
  if (report.kind !== "guidingTimeout" && report.kind !== "guidingSpikes")
    return null;
  const count = finiteOf(payload.count);
  const first =
    instantClock(payload.firstAt, zone) ?? zonedClock(report.at, zone);
  const last = instantClock(payload.lastAt, zone) ?? first;
  if (count === null || count < 1) return null;
  const spikes = report.kind === "guidingSpikes";
  const arc = finiteOf(payload.maxArcSeconds);
  if (spikes && arc === null) return null;
  const stem = spikes ? "sessionReportSpikes" : "sessionReportTimeouts";
  const values = {
    count: figure(count, locale, { digits: 0 }),
    at: first,
    from: first,
    to: last,
    ...(spikes
      ? { max: `${figure(arc, locale, { least: 1, digits: 1 })}″` }
      : {}),
  };
  if (count === 1) return say(locale, `${stem}One`, values);
  return say(locale, first === last ? `${stem}Same` : `${stem}Other`, values);
}

/** The kinds of a report that Astro Sync detects (they have a sentence of their own). */
export const isDetectedKind = (kind) => DETECTED_KINDS.has(kind);
const DETECTED_KINDS = new Set(DETECTED_REPORT_KINDS);

/** « Signalement », « Durée de pose », … : the name of a report's kind, for a title. */
export const reportKindName = (kind, locale) =>
  message(locale, REPORT_KIND_KEY[kind] ?? "sessionPageLegendNote");

export const REPORT_KIND_KEY = {
  sky: "sessionPageLegendSky",
  note: "sessionPageLegendNote",
  incident: "sessionPageLegendIncident",
  pause: "sessionPageLegendPause",
  exposure: "sessionPageLegendExposure",
  guidingTimeout: "sessionPageLegendGuidingTimeout",
  temperature: "sessionPageLegendTemperature",
  guidingSpikes: "sessionPageLegendGuidingSpikes",
  signal: "sessionPageLegendSignal",
};

/**
 * The sentence of one line of the pointing devices (`sessionDeviceLines`):
 * « M110 pointée par GoTo à 21:57 », « Monture arrêtée à 23:40 », « Liaison
 * perdue 2 min (dès 23:10) ». The hours are the place's when its zone is
 * known, else UTC, like every other hour of the page.
 */
export function deviceLineText(line, locale, zone = null) {
  const time = reportClock({ at: line.at }, zone);
  const target = line.target ?? message(locale, "sessionDeviceTargetFallback");
  const who = line.source === "telescope" ? "Telescope" : "Mount";
  const say2 = (key, values = {}) => say(locale, key, { time, ...values });
  switch (line.kind) {
    case "connected":
      return say2(`sessionDeviceConnected${who}`);
    case "gotoSent":
      return say2("sessionDeviceGotoSent", { target });
    case "gotoArrived":
      return line.gapDegrees === null
        ? say2("sessionDeviceGotoArrived", { target })
        : say2("sessionDeviceGotoArrivedGap", {
            target,
            gap: figure(line.gapDegrees, locale, { least: 1, digits: 1 }),
          });
    case "gotoRefused":
      return say2("sessionDeviceGotoRefused", { target });
    case "stopped":
      return say2(
        line.nightEnd
          ? `sessionDeviceStoppedNightEnd${who}`
          : `sessionDeviceStopped${who}`,
      );
    case "linkLost":
      return line.lostForMs === null
        ? say2("sessionDeviceLinkLost")
        : say2("sessionDeviceLinkLostFor", {
            duration: durationText(
              Math.max(1, Math.ceil(line.lostForMs / 60000)),
              locale,
            ),
          });
    case "disconnected":
      return say2(`sessionDeviceDisconnected${who}`);
    case "parkRequested":
      return say2("sessionDeviceParkRequested");
    case "parked":
      return say2(`sessionDeviceParked${who}`);
    case "parkRefused":
      return say2("sessionDeviceParkRefused");
    case "aligned":
      return say2("sessionDeviceAligned", { target });
    case "alignRefused":
      return say2("sessionDeviceAlignRefused", { target });
    case "helpCentred":
      return say2(
        line.manual
          ? "sessionDeviceHelpCentredManual"
          : "sessionDeviceHelpCentred",
        { target },
      );
    case "helpFailed":
      return say2("sessionDeviceHelpFailed", { target });
    case "helpRefused":
      return say2("sessionDeviceHelpRefused", { target });
    case "helpStopped":
      return say2("sessionDeviceHelpStopped", { target });
    case "helpLost":
      return say2("sessionDeviceHelpLost", { target });
    default:
      return "";
  }
}

/** A report's hour at the place when its zone is known, else UTC. */
export const reportClock = (report, zone = null) =>
  zone ? clockText(report.at, zone) : clock(report.at);

/**
 * What the service did with an image sent for a target that already had one
 * (`POST /v1/uploads`): `replaced` (a space without the right to variants:
 * the image took the old one's place), `variant` (kept beside it), else
 * nothing to say (the target had no image yet). `source` is where the new
 * image comes from: the page's own sender is the browser (`web`), so a
 * replacement it makes is a manual one; only an image of Astro Sync
 * (`astro-sync`, `stacking`) makes the sentence that names Astro Sync.
 */
export function photoAnswerOf(outcome, { source = "web" } = {}) {
  // A replacement that turned a public capture private says so first.
  if (outcome?.replaced && outcome.capture?.replacedMadePrivate === true)
    return "madePrivate";
  if (outcome?.replaced)
    return source === "astro-sync" || source === "stacking"
      ? "replacedByAstroSync"
      : "replaced";
  return outcome?.variant ? "variant" : null;
}

/** « Photo finale » + the pills + « Voir la fiche » need the capture; this says which words. */
export function photoSentence(answer, locale) {
  if (answer === "replaced")
    return message(locale, "sessionPhotoReplacedManual");
  if (answer === "madePrivate")
    return message(locale, "captureMadePrivateNotice");
  if (answer === "replacedByAstroSync")
    return message(locale, "sessionPagePhotoReplaced");
  if (answer === "variant")
    return message(locale, "sessionPagePhotoKeptAsVariant");
  return null;
}

/** The three figures, and the fourth when the night was measured. */
export function figureRows(figures, locale, { visual = false } = {}) {
  const rows = [];
  const hours = (seconds) => integrationText(seconds, locale);
  if (figures.acquiredSeconds !== null)
    rows.push({
      key: "acquired",
      value: hours(figures.acquiredSeconds),
      label:
        figures.plannedSeconds !== null
          ? say(
              locale,
              visual
                ? "sessionPageObservedOfPlanned"
                : "sessionPageAcquiredOfPlanned",
              {
                planned: durationText(
                  Math.round(figures.plannedSeconds / 60),
                  locale,
                ),
              },
            )
          : message(
              locale,
              visual ? "sessionPageObservedOnly" : "sessionPageAcquiredOnly",
            ),
    });
  // A night at the eyepiece takes no frames: no tile of poses.
  if (figures.frameCount !== null && !visual)
    rows.push({
      key: "frames",
      value: String(figures.frameCount),
      label: message(locale, "sessionPageFramesFigure"),
    });
  rows.push({
    key: "targets",
    value: String(figures.targetsDone),
    label: [
      say(
        locale,
        figures.targetsDone === 1
          ? "sessionPageTargetsDoneOne"
          : "sessionPageTargetsDoneOther",
        {},
      ),
      figures.targetsRemoved
        ? say(
            locale,
            figures.targetsRemoved === 1
              ? "sessionPageTargetsRemovedOne"
              : "sessionPageTargetsRemovedOther",
            { count: figures.targetsRemoved },
          )
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  if (figures.fwhmPixels !== null)
    rows.push({
      key: "fwhm",
      value: `${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(figures.fwhmPixels)}${NBSP}px`,
      label: message(locale, "sessionPageFwhmFigure"),
    });
  return rows;
}

export { clock };
