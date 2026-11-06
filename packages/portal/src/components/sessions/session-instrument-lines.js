// SMART-SCOPE-INSTRUMENT-PANEL-01 — what a smart telescope said of itself
// during the night, as the facts of the section « Instrument » of the session
// page and of the debriefing (« Filtre double bande monté de 19:46 à 21:09 »,
// « 190 rejetées (21 %) : étoiles non rondes », « Batterie : 92 % à 17:58,
// 61 % à 21:12 »).
//
// Read from the `device_instrument` samples the phone writes every 5 minutes
// and at each change (packages/astro-contracts/schemas/session-events.md,
// « The instrument kind »). Pure: no string, no React — the page composes the
// sentence in the person's language from the facts here. The phone reads a
// journal the same way; the shared fixture
// `session-instrument-summary.json` pins it.
//
// One fact per line, never a line a sample did not give:
//
// - the filter's stretches (consecutive samples with the same filter merge;
//   one that runs into a hole is `open`);
// - the humidity's range, the air's, and the smallest dew-point depression
//   with its instant;
// - the heater's stretches (on from the first sample that says it, to the
//   first that says off, or to the last sample before a hole: `open`);
// - the frames: per capture (`captureId`, else the target) the largest count,
//   summed; the causes the same way;
// - the targets given up, with their failed attempts and when the next frames
//   came;
// - the battery from the first sample to the last;
// - a Seestar's board, a DWARF's sensor temperatures;
// - the holes: two live samples more than 12 minutes apart (the application
//   was closed or in the background). `collectedUntil` / `reopenedAt` name the
//   last hole; `rebuiltAt` is when the phone read back what the device kept.

/** Two live samples further apart than this are a hole in the collection. */
export const INSTRUMENT_GAP_MS = 12 * 60 * 1000;

const FILTERS = new Set([
  "none",
  "dual_band",
  "cls",
  "light_pollution",
  "other",
]);

const textOf = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const instantOf = (value) => {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? at : null;
};

const numberOf = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const inRange = (value, min, max) => {
  const number = numberOf(value);
  return number !== null && number >= min && number <= max ? number : null;
};

const countOf = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

const round1 = (value) => Math.round(value * 10) / 10;

const iso = (ms) => new Date(ms).toISOString();

const filterOf = (payload) => {
  const filter = textOf(payload.filter);
  if (filter === null || !FILTERS.has(filter)) return null;
  return {
    filter,
    label: filter === "other" ? textOf(payload.filterLabel) : null,
  };
};

const sameFilter = (a, b) => a.filter === b.filter && a.label === b.label;

/** The samples of `events`, in time order: `{ at, live, payload }`. */
function samplesOf(events) {
  return events
    .filter(
      (event) =>
        event?.type === "device_instrument" &&
        instantOf(event.recordedAt) !== null &&
        event.payload &&
        typeof event.payload === "object",
    )
    .map((event) => ({
      at: instantOf(event.recordedAt),
      live: event.payload.origin !== "rebuilt",
      payload: event.payload,
    }))
    .sort((a, b) => a.at - b.at);
}

/** The holes between live samples: `[{ from, to }]` in milliseconds. */
function holesOf(live) {
  const holes = [];
  for (let i = 1; i < live.length; i += 1) {
    if (live[i].at - live[i - 1].at > INSTRUMENT_GAP_MS) {
      holes.push({ from: live[i - 1].at, to: live[i].at });
    }
  }
  return holes;
}

/** The frames of `samples`, per capture the largest, summed. */
function framesOf(samples) {
  const captures = new Map();
  for (const { payload } of samples) {
    const stacked = countOf(payload.framesStacked);
    const rejected = countOf(payload.framesRejected);
    const taken = countOf(payload.framesTaken);
    const rejections = Array.isArray(payload.rejections)
      ? payload.rejections
      : [];
    if (
      stacked === null &&
      rejected === null &&
      taken === null &&
      rejections.length === 0
    ) {
      continue;
    }
    const key =
      textOf(payload.captureId) ??
      textOf(payload.targetLabel) ??
      textOf(payload.targetId) ??
      "";
    const capture = captures.get(key) ?? {
      stacked: null,
      rejected: null,
      taken: null,
      causes: new Map(),
    };
    const larger = (a, b) => (b === null ? a : a === null ? b : Math.max(a, b));
    capture.stacked = larger(capture.stacked, stacked);
    capture.rejected = larger(capture.rejected, rejected);
    capture.taken = larger(capture.taken, taken);
    for (const item of rejections) {
      const cause = textOf(item?.cause);
      const count = countOf(item?.count);
      if (cause === null || count === null) continue;
      capture.causes.set(
        cause,
        Math.max(capture.causes.get(cause) ?? 0, count),
      );
    }
    captures.set(key, capture);
  }
  if (captures.size === 0) return null;
  let stacked = null;
  let rejected = null;
  let taken = null;
  const causes = new Map();
  const add = (sum, value) => (value === null ? sum : (sum ?? 0) + value);
  for (const capture of captures.values()) {
    stacked = add(stacked, capture.stacked);
    rejected = add(rejected, capture.rejected);
    taken = add(taken, capture.taken);
    for (const [cause, count] of capture.causes) {
      causes.set(cause, (causes.get(cause) ?? 0) + count);
    }
  }
  return {
    stacked,
    rejected,
    taken,
    causes: [...causes.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([cause, count]) => ({ cause, count })),
  };
}

/**
 * The facts of the instrument in `events` (`{ type, recordedAt, payload }`,
 * any order), or `null` when the journal holds no `device_instrument`. Every
 * instant is ISO 8601 (UTC); every part is `null` when no sample said it.
 */
export function sessionInstrumentSummary(events = []) {
  const all = samplesOf(Array.isArray(events) ? events : []);
  if (all.length === 0) return null;
  const live = all.filter((sample) => sample.live);
  const rebuilt = all.filter((sample) => !sample.live);
  const holes = holesOf(live);
  const lastHole = holes.length === 0 ? null : holes[holes.length - 1];

  let family = null;
  for (const { payload } of all) family = textOf(payload.family) ?? family;
  let model = null;
  for (const event of events) {
    if (event?.type === "device_connected") {
      model = textOf(event.payload?.model) ?? model;
    }
  }

  // The filter's stretches, live samples only (a rebuilt sample is dated
  // when it was read back, not when the filter was on): a stretch ends where
  // the next filter is first seen, or at the last sample before a hole
  // (`open`: it went on beyond, unseen).
  const segments = [];
  for (let i = 0; i < live.length; i += 1) {
    const { at, payload } = live[i];
    const filter = filterOf(payload);
    if (filter === null) continue;
    const last = segments[segments.length - 1];
    if (last && !last.open && sameFilter(last, filter)) {
      last.to = at;
    } else {
      if (last && !last.open) last.to = Math.max(last.to, at);
      segments.push({ ...filter, from: at, to: at, open: false });
    }
    const next = live[i + 1];
    if (next && next.at - at > INSTRUMENT_GAP_MS) {
      segments[segments.length - 1].open = true;
    }
  }

  // The hygrometer, live samples only.
  let hygrometry = null;
  for (const { at, payload } of live) {
    const humidity = inRange(payload.humidity, 0, 100);
    const temperature = inRange(payload.temperature, -80, 100);
    const depression = inRange(payload.dewPointDepression, -50, 100);
    if (humidity === null && temperature === null && depression === null) {
      continue;
    }
    hygrometry ??= {
      humidityMin: null,
      humidityMax: null,
      temperatureMin: null,
      temperatureMax: null,
      dewPointDepressionMin: null,
      dewPointDepressionAt: null,
      lastAt: null,
    };
    const low = (a, b) => (b === null ? a : a === null ? b : Math.min(a, b));
    const high = (a, b) => (b === null ? a : a === null ? b : Math.max(a, b));
    hygrometry.humidityMin = low(hygrometry.humidityMin, humidity);
    hygrometry.humidityMax = high(hygrometry.humidityMax, humidity);
    hygrometry.temperatureMin = low(hygrometry.temperatureMin, temperature);
    hygrometry.temperatureMax = high(hygrometry.temperatureMax, temperature);
    if (
      depression !== null &&
      (hygrometry.dewPointDepressionMin === null ||
        depression < hygrometry.dewPointDepressionMin)
    ) {
      hygrometry.dewPointDepressionMin = depression;
      hygrometry.dewPointDepressionAt = at;
    }
    hygrometry.lastAt = at;
  }

  // The heater's stretches, live samples only.
  const ranges = [];
  let heaterSaid = false;
  let open = null;
  for (let i = 0; i < live.length; i += 1) {
    const { at, payload } = live[i];
    const heater = payload.heater;
    if (heater !== "on" && heater !== "off") continue;
    heaterSaid = true;
    if (heater === "on" && open === null) open = { from: at, to: at };
    else if (heater === "on") open.to = at;
    else if (open !== null) {
      ranges.push({ from: open.from, to: at, open: false });
      open = null;
    }
    const next = live[i + 1];
    if (open !== null && next && next.at - at > INSTRUMENT_GAP_MS) {
      ranges.push({ from: open.from, to: at, open: true });
      open = null;
    }
  }
  if (open !== null) ranges.push({ from: open.from, to: open.to, open: false });

  // The targets given up.
  const abandons = new Map();
  const abandonedNow = new Set();
  for (const { at, payload } of all) {
    const target = textOf(payload.targetLabel) ?? textOf(payload.targetId);
    if (target === null) continue;
    const failures = countOf(payload.pointingFailures);
    if (payload.pointingAbandoned === true) {
      const entry = abandons.get(target) ?? {
        target,
        times: 0,
        attempts: null,
        at,
        succeededAt: null,
      };
      if (!abandonedNow.has(target)) {
        entry.times += 1;
        abandonedNow.add(target);
      }
      if (failures !== null) {
        entry.attempts = Math.max(entry.attempts ?? 0, failures);
      }
      abandons.set(target, entry);
    } else if ((countOf(payload.framesStacked) ?? 0) > 0) {
      abandonedNow.delete(target);
      const entry = abandons.get(target);
      if (entry && entry.succeededAt === null) entry.succeededAt = at;
    }
  }

  // The battery, a Seestar's board and a DWARF's sensor, live samples.
  let battery = null;
  let board = null;
  let sensor = null;
  for (const { at, payload } of live) {
    const level = countOf(payload.battery);
    if (level !== null && level <= 100) {
      battery ??= { first: level, firstAt: at, last: level, lastAt: at };
      battery.last = level;
      battery.lastAt = at;
    }
    const boardTemperature = inRange(payload.boardTemperature, -80, 150);
    if (boardTemperature !== null || payload.overheated === true) {
      board ??= { min: null, max: null, overheatedAt: null };
      if (boardTemperature !== null) {
        board.min =
          board.min === null
            ? boardTemperature
            : Math.min(board.min, boardTemperature);
        board.max =
          board.max === null
            ? boardTemperature
            : Math.max(board.max, boardTemperature);
      }
      if (payload.overheated === true && board.overheatedAt === null) {
        board.overheatedAt = at;
      }
    }
  }
  for (const { payload } of all) {
    const low = inRange(payload.temperatureMin, -80, 150);
    const high = inRange(payload.temperatureMax, -80, 150);
    if (low === null && high === null) continue;
    sensor ??= { min: null, max: null };
    if (low !== null)
      sensor.min = sensor.min === null ? low : Math.min(sensor.min, low);
    if (high !== null)
      sensor.max = sensor.max === null ? high : Math.max(sensor.max, high);
  }

  // Per target: the filter last seen and its frames.
  const targetOrder = [];
  const perTarget = new Map();
  for (const sample of all) {
    // By the device's name first: a sample read back names its target only.
    const key =
      textOf(sample.payload.targetLabel) ?? textOf(sample.payload.targetId);
    if (key === null) continue;
    if (!perTarget.has(key)) {
      targetOrder.push(key);
      perTarget.set(key, []);
    }
    perTarget.get(key).push(sample);
  }
  const targets = targetOrder.map((key) => {
    const samples = perTarget.get(key);
    let filter = null;
    let targetId = null;
    let targetLabel = null;
    for (const { payload } of samples) {
      filter = filterOf(payload) ?? filter;
      targetId = textOf(payload.targetId) ?? targetId;
      targetLabel = textOf(payload.targetLabel) ?? targetLabel;
    }
    const frames = framesOf(samples);
    return {
      targetId,
      targetLabel,
      filter: filter?.filter ?? null,
      filterLabel: filter?.label ?? null,
      stacked: frames?.stacked ?? null,
      rejected: frames?.rejected ?? null,
    };
  });

  const frames = framesOf(all);
  const firstRebuilt = rebuilt.length === 0 ? null : rebuilt[0].at;

  return {
    family,
    model,
    from: live.length === 0 ? null : iso(live[0].at),
    to: live.length === 0 ? null : iso(live[live.length - 1].at),
    holes: holes.map((hole) => ({ from: iso(hole.from), to: iso(hole.to) })),
    collectedUntil: lastHole === null ? null : iso(lastHole.from),
    reopenedAt: lastHole === null ? null : iso(lastHole.to),
    rebuiltAt: firstRebuilt === null ? null : iso(firstRebuilt),
    filter:
      segments.length === 0
        ? null
        : segments.map((segment) => ({
            filter: segment.filter,
            label: segment.label,
            from: iso(segment.from),
            to: iso(segment.to),
            open: segment.open,
          })),
    hygrometry:
      hygrometry === null
        ? null
        : {
            humidityMin:
              hygrometry.humidityMin === null
                ? null
                : round1(hygrometry.humidityMin),
            humidityMax:
              hygrometry.humidityMax === null
                ? null
                : round1(hygrometry.humidityMax),
            temperatureMin:
              hygrometry.temperatureMin === null
                ? null
                : round1(hygrometry.temperatureMin),
            temperatureMax:
              hygrometry.temperatureMax === null
                ? null
                : round1(hygrometry.temperatureMax),
            dewPointDepressionMin:
              hygrometry.dewPointDepressionMin === null
                ? null
                : round1(hygrometry.dewPointDepressionMin),
            dewPointDepressionAt:
              hygrometry.dewPointDepressionAt === null
                ? null
                : iso(hygrometry.dewPointDepressionAt),
            // Said « jusqu’à » when a hole came after the last reading.
            until:
              lastHole !== null && hygrometry.lastAt <= lastHole.from
                ? iso(hygrometry.lastAt)
                : null,
          },
    heater: !heaterSaid
      ? null
      : {
          ranges: ranges.map((range) => ({
            from: iso(range.from),
            to: iso(range.to),
            open: range.open,
          })),
          minutes: Math.round(
            ranges.reduce((sum, range) => sum + (range.to - range.from), 0) /
              60000,
          ),
        },
    frames:
      frames === null
        ? null
        : {
            ...frames,
            rebuiltAt: rebuilt.some(
              ({ payload }) =>
                countOf(payload.framesStacked) !== null ||
                countOf(payload.framesRejected) !== null,
            )
              ? iso(firstRebuilt)
              : null,
          },
    pointing:
      abandons.size === 0
        ? null
        : [...abandons.values()].map((entry) => ({
            target: entry.target,
            times: entry.times,
            attempts: entry.attempts,
            at: iso(entry.at),
            succeededAt:
              entry.succeededAt === null ? null : iso(entry.succeededAt),
          })),
    battery:
      battery === null
        ? null
        : {
            first: battery.first,
            firstAt: iso(battery.firstAt),
            last: battery.last,
            lastAt: iso(battery.lastAt),
          },
    board:
      board === null
        ? null
        : {
            min: board.min === null ? null : round1(board.min),
            max: board.max === null ? null : round1(board.max),
            overheatedAt:
              board.overheatedAt === null ? null : iso(board.overheatedAt),
          },
    sensor:
      sensor === null
        ? null
        : {
            min: sensor.min === null ? null : round1(sensor.min),
            max: sensor.max === null ? null : round1(sensor.max),
          },
    targets,
  };
}

/**
 * The web's curve of the night (the phone has none): 10-minute bins from the
 * first live sample to the last, each with the mean humidity, whether the
 * heater was on, the filter said and the frames rejected in the bin (the
 * growth of each capture's count). A bin inside a hole is `{ hole: true }`.
 */
export function sessionInstrumentChart(events = [], binMinutes = 10) {
  const all = samplesOf(Array.isArray(events) ? events : []);
  const live = all.filter((sample) => sample.live);
  if (live.length === 0) return null;
  const binMs = binMinutes * 60 * 1000;
  const start = live[0].at;
  const end = live[live.length - 1].at;
  const count = Math.max(1, Math.ceil((end - start + 1) / binMs));
  const holes = holesOf(live);
  const bins = Array.from({ length: count }, (_, i) => ({
    from: iso(start + i * binMs),
    humidity: null,
    heater: false,
    filter: null,
    rejected: 0,
    hole: holes.some(
      (hole) =>
        start + i * binMs >= hole.from && start + (i + 1) * binMs <= hole.to,
    ),
    sum: 0,
    n: 0,
  }));
  const lastCount = new Map();
  for (const { at, payload } of live) {
    const bin = bins[Math.min(count - 1, Math.floor((at - start) / binMs))];
    const humidity = inRange(payload.humidity, 0, 100);
    if (humidity !== null) {
      bin.sum += humidity;
      bin.n += 1;
    }
    if (payload.heater === "on") bin.heater = true;
    const filter = filterOf(payload);
    if (filter !== null) bin.filter = filter.filter;
    const rejected = countOf(payload.framesRejected);
    if (rejected !== null) {
      const key =
        textOf(payload.captureId) ??
        textOf(payload.targetLabel) ??
        textOf(payload.targetId) ??
        "";
      const before = lastCount.get(key) ?? 0;
      if (rejected > before) bin.rejected += rejected - before;
      lastCount.set(key, Math.max(before, rejected));
    }
  }
  return bins.map(({ sum, n, ...bin }) => ({
    ...bin,
    humidity: n === 0 ? null : round1(sum / n),
  }));
}
