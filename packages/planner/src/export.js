import { exportWords } from "portal/planner/export.js";

function icalEscape(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function icalDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
}

// `acquisitionText` is `{ [itemId]: "120 s · gain 100 · UV/IR-cut · …" }`
// (`acquisitionTextByItem`, "Prise de vue par cible"): the effective
// shooting line of a target in photo mode. A target that has one is
// written with it (its filter is part of it); the others are as they were.
export function planTargetSummary(plan, cards = [], acquisitionText = {}) {
  const byId = new Map(cards.map((card) => [card.target.id, card]));
  return (plan?.items || []).map((item) => {
    const card = byId.get(item.id);
    return {
      id: item.id,
      title:
        card?.target.title ||
        card?.target.designation ||
        card?.target.objects?.[0] ||
        item.id,
      filter: item.filter || card?.filter || "",
      ...(acquisitionText?.[item.id]
        ? { acquisition: acquisitionText[item.id] }
        : {}),
    };
  });
}

export function planCalendarIcs({
  plan,
  night,
  targets,
  reminderMinutes = 15,
  locale = "en",
  acquisitionText = {},
}) {
  const start = icalDate(night?.start);
  const end = icalDate(night?.end);
  if (!start || !end || !plan?.id) return null;
  const targetLines = planTargetSummary(plan, targets, acquisitionText)
    .map((target) =>
      [target.title, target.acquisition || target.filter]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
  const stamp = icalDate(new Date()) || start;
  const title = plan.name || exportWords(locale).observationPlan;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sqound//PlanAstro Observation planner//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icalEscape(`astro-portal-${plan.id}`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icalEscape(title)}`,
    `DESCRIPTION:${icalEscape(targetLines || exportWords(locale).observationPlan)}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${Math.max(0, Math.round(reminderMinutes))}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${icalEscape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function weatherReminderIcs({ plan, night, locale = "en" }) {
  const words = exportWords(locale);
  const sessionStart = new Date(night?.start);
  if (Number.isNaN(sessionStart.getTime()) || !plan?.id) return null;
  const start = new Date(sessionStart.getTime() - 18 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const startValue = icalDate(start);
  const endValue = icalDate(end);
  const stamp = icalDate(new Date()) || startValue;
  const title = `${words.weatherCheck}${plan.name || words.observationPlan}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sqound//PlanAstro Weather reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icalEscape(`astro-portal-weather-${plan.id}`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startValue}`,
    `DTEND:${endValue}`,
    `SUMMARY:${icalEscape(title)}`,
    `DESCRIPTION:${icalEscape(words.weatherDescription)}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icalEscape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function csvField(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sexagesimalParts(value, maximum) {
  let wholeSeconds = Math.round(Math.abs(Number(value) || 0) * 3600);
  if (maximum) wholeSeconds %= maximum * 3600;
  const first = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return [first, minutes, seconds];
}

export function asiairRightAscension(raDegrees) {
  const [hours, minutes, seconds] = sexagesimalParts(
    Number(raDegrees) / 15,
    24,
  );
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function asiairDeclination(decDegrees) {
  const numeric = Number(decDegrees);
  const [degrees, minutes, seconds] = sexagesimalParts(numeric);
  const sign = numeric < 0 ? "-" : "+";
  return `${sign}${degrees}° ${minutes}' ${seconds}\"`;
}

// The fixed targets of a plan in the order of the night (start minute, then
// id), each with the lines it is written as: its centre, or the lines
// `expandTarget(target, item)` gives for it (`[{ name, coordinate, index }]`):
// what a shell registered at the `planner.export.asiair` point
// (`portal/planner/extensions.js`) -- a shell that sells mosaics writes each pane of a
// mosaic. A target without a finite J2000 centre is skipped and named in
// `skippedTargets`. Shared by the ASIAIR and the N.I.N.A. writers, so both
// files list the same targets in the same order.
function exportedTargetLines({ plan, targets = [], expandTarget = null }) {
  const cardsById = new Map(
    targets
      .map((card) => [card?.target?.id, card?.target])
      .filter(([id]) => id),
  );
  const entries = [];
  const skippedTargets = [];
  const items = [...(plan?.items || [])].sort(
    (left, right) =>
      Number(left.startMinute ?? Number.MAX_SAFE_INTEGER) -
        Number(right.startMinute ?? Number.MAX_SAFE_INTEGER) ||
      String(left.id).localeCompare(String(right.id)),
  );
  // A target scheduled in two slots is one target of the file, written once
  // at the first of its slots: ASIAIR and N.I.N.A. read a list of
  // targets, not of slots.
  const seenItemIds = new Set();
  for (const item of items) {
    const itemId =
      item.id === undefined || item.id === null ? "" : `${item.id}`;
    if (itemId && seenItemIds.has(itemId)) continue;
    if (itemId) seenItemIds.add(itemId);
    // A saved framing or suggested target carries its J2000 centre on the
    // plan item. Prefer it even if a later catalogue calculation can build a
    // card: the file must carry the exact coordinate saved with the plan.
    const target = item.target?.coordinate
      ? item.target
      : cardsById.get(item.id) || item.target;
    const expanded = target && expandTarget ? expandTarget(target, item) : null;
    const name =
      target?.designation || target?.source || target?.title || item.id;
    const coordinate = target?.coordinate;
    if (
      !target ||
      !Number.isFinite(Number(coordinate?.ra)) ||
      !Number.isFinite(Number(coordinate?.dec))
    ) {
      skippedTargets.push(
        target?.designation || target?.title || item.id || "Unknown target",
      );
      continue;
    }
    const lines = (expanded?.length ? expanded : [{ name, coordinate }]).filter(
      (pane) =>
        Number.isFinite(Number(pane.coordinate?.ra)) &&
        Number.isFinite(Number(pane.coordinate?.dec)),
    );
    entries.push({ item, target, name, lines, mosaic: !!expanded?.length });
  }
  return { entries, skippedTargets };
}

// ASIAIR's Plan importer accepts a clipboard-pasted CSV target list. It does
// not import a full sequence (timings, filters, exposures, etc.), so this
// intentionally exports only fixed J2000 target coordinates.
export function planAsiairCsv({ plan, targets = [], expandTarget = null }) {
  const { entries, skippedTargets } = exportedTargetLines({
    plan,
    targets,
    expandTarget,
  });
  const rows = entries.flatMap(({ lines }) =>
    lines.map((pane) =>
      [
        csvField(pane.name),
        csvField(asiairRightAscension(pane.coordinate.ra)),
        csvField(asiairDeclination(pane.coordinate.dec)),
      ].join(","),
    ),
  );
  return {
    content: ["Plan,RA,DEC", ...rows, ""].join("\r\n"),
    exportedCount: rows.length,
    skippedTargets,
  };
}

export function framingAsiairCsv(target, { expandTarget = null } = {}) {
  return planAsiairCsv({
    plan: { items: [{ id: target?.id || "framing", target }] },
    expandTarget,
  });
}

const pad2 = (value) => String(value).padStart(2, "0");

// `count` tenths of a sexagesimal unit (an hour, a degree) as
// `HH:MM:SS.s`: each field two digits, the rounding to the tenth already
// carried into the minute and the hour by counting whole tenths.
function sexagesimalTenths(count) {
  const tenths = count % 10;
  const seconds = Math.floor(count / 10) % 60;
  const minutes = Math.floor(count / 600) % 60;
  const first = Math.floor(count / 36000);
  return `${pad2(first)}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`;
}

// N.I.N.A.'s right ascension, `HH:MM:SS.s`: the hour brought into [0, 24)
// after rounding, so 23:59:59.96 is written 00:00:00.0.
export function ninaRightAscension(raDegrees) {
  const day = 24 * 36000;
  const count = Math.round(((Number(raDegrees) || 0) / 15) * 36000);
  return sexagesimalTenths(((count % day) + day) % day);
}

// N.I.N.A.'s declination, `+DD:MM:SS.s` / `-DD:MM:SS.s`, with the ASCII
// minus: a negative declination under one degree keeps its sign
// (`-00:30:00.0`), which N.I.N.A. reads from the presence of `-`; one that
// rounds to zero is written `+00:00:00.0`.
export function ninaDeclination(decDegrees) {
  const numeric = Number(decDegrees) || 0;
  const count = Math.round(Math.abs(numeric) * 36000);
  const sign = numeric < 0 && count > 0 ? "-" : "+";
  return `${sign}${sexagesimalTenths(count)}`;
}

// The framing's angle, as N.I.N.A.'s `Position Angle (East)`: brought into
// [0, 360) after rounding to the hundredth, two decimals, a decimal point
// whatever the language; `0.00` without an angle. The framing's angle is
// already that position angle, north towards east, so it is written as it is:
// a frame whose top points east is "90.00".
export function ninaPositionAngle(angleDegrees) {
  const turn = 36000;
  const numeric = Number(angleDegrees);
  const count = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  const hundredths = ((count % turn) + turn) % turn;
  return `${Math.floor(hundredths / 100)}.${pad2(hundredths % 100)}`;
}

function framingAngle(item, target) {
  for (const value of [item?.angleDegrees, target?.framing?.angleDegrees])
    if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

// N.I.N.A.'s target import (the "Import Target" of its sequencer) reads the
// mosaic CSV of Telescopius: `Pane,RA,DEC,Position Angle (East)`, J2000, one
// line per target or per pane. No
// other column (never one named `Right Ascension`), no time, no filter: the
// targets come in the order of the night and N.I.N.A. runs them in turn. A
// mosaic writes "<designation> Panel <n>" per saved pane, never a "Center"
// line, which N.I.N.A. would import as one more target.
export function planNinaCsv({ plan, targets = [], expandTarget = null }) {
  const { entries, skippedTargets } = exportedTargetLines({
    plan,
    targets,
    expandTarget,
  });
  const rows = entries.flatMap(({ item, target, name, lines, mosaic }) => {
    const angle = ninaPositionAngle(framingAngle(item, target));
    return lines.map((pane) =>
      [
        csvField(
          mosaic && pane.index != null
            ? `${name} Panel ${pane.index}`
            : pane.name,
        ),
        csvField(ninaRightAscension(pane.coordinate.ra)),
        csvField(ninaDeclination(pane.coordinate.dec)),
        csvField(angle),
      ].join(","),
    );
  });
  return {
    content: ["Pane,RA,DEC,Position Angle (East)", ...rows, ""].join("\r\n"),
    exportedCount: rows.length,
    skippedTargets,
  };
}

// The line to copy into ASIAIR's Plan for each exported target (the CSV
// carries coordinates only, `planAsiairCsv`): `[{ name, line }]`, one per line
// of the CSV and in its order, from the text of `acquisitionTextByItem`. A
// target with no shooting line is left out; the CSV itself is not changed.
export function asiairCopyLines({
  plan,
  targets = [],
  expandTarget = null,
  acquisitionText = {},
}) {
  const { entries } = exportedTargetLines({ plan, targets, expandTarget });
  return entries.flatMap(({ item, lines }) => {
    const line = acquisitionText?.[item.id];
    return line ? lines.map((pane) => ({ name: pane.name, line })) : [];
  });
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// A number as the file writes it: `120`, `0.01`, never `120.0`.
const plainNumber = (value) => String(Number(value));

// The right ascension in hundredths of a second of time, brought into
// [0, 24 h) after rounding: `RAHours`, `RAMinutes`, `RASeconds` and the
// decimal hours of `Coordinates` all come from this one integer.
function ninaSetRightAscension(raDegrees) {
  const day = 24 * 360000;
  const count = Math.round(((Number(raDegrees) || 0) / 15) * 360000);
  const wrapped = ((count % day) + day) % day;
  return {
    hours: Math.floor(wrapped / 360000),
    minutes: Math.floor((wrapped % 360000) / 6000),
    seconds: ((wrapped % 6000) / 100).toFixed(2),
    decimal: (wrapped / 360000).toFixed(7),
  };
}

// The declination in tenths of an arcsecond: `DecDegrees` (absolute value),
// `DecMinutes`, `DecSeconds`, `NegativeDec` and the signed decimal degrees of
// `Coordinates`.
function ninaSetDeclination(decDegrees) {
  const numeric = Number(decDegrees) || 0;
  const count = Math.round(Math.abs(numeric) * 36000);
  const negative = numeric < 0 && count > 0;
  return {
    degrees: Math.floor(count / 36000),
    minutes: Math.floor((count % 36000) / 600),
    seconds: ((count % 600) / 10).toFixed(1),
    negative,
    decimal: `${negative ? "-" : ""}${(count / 36000).toFixed(5)}`,
  };
}

function ninaCaptureSequence(line) {
  const exposure = Number(line.exposureSeconds);
  const frames = Math.round(Number(line.frameCount));
  const lines = [
    "    <CaptureSequence>",
    "      <Enabled>true</Enabled>",
    `      <ExposureTime>${plainNumber(exposure)}</ExposureTime>`,
    "      <ImageType>LIGHT</ImageType>",
  ];
  if (line.filter)
    lines.push(
      "      <FilterType>",
      `        <Name>${xmlEscape(line.filter)}</Name>`,
      "      </FilterType>",
    );
  const binning = Math.max(1, Math.round(Number(line.binning) || 1));
  lines.push(
    "      <Binning>",
    `        <X>${binning}</X>`,
    `        <Y>${binning}</Y>`,
    "      </Binning>",
    // -1 is N.I.N.A.'s "the camera's own setting" (gain and offset).
    `      <Gain>${Number.isFinite(line.gain) ? Math.round(line.gain) : -1}</Gain>`,
    "      <Offset>-1</Offset>",
    `      <TotalExposureCount>${frames}</TotalExposureCount>`,
    "      <ProgressExposureCount>0</ProgressExposureCount>",
    "      <Dither>false</Dither>",
    "      <DitherAmount>1</DitherAmount>",
    "    </CaptureSequence>",
  );
  return lines;
}

// N.I.N.A.'s target set (`.ninaTargetSet`, XML), "Open Target Set" of its
// sequencer: `ArrayOfCaptureSequenceList`, one `CaptureSequenceList` per
// fixed target (or per saved pane of a mosaic) in the order of the night,
// with, for each, the capture lines of its effective acquisition (`acquisition`
// is `exportAcquisitionByItem`'s answer): filter, exposure, gain, binning and
// number of frames. A line with no exposure or no frame count is not written
// (nothing is made up); the format is the one N.I.N.A. 3.x reads
// (its attributes and members are those of `CaptureSequenceList.cs` and
// `CaptureSequence.cs` in the N.I.N.A. sources). No time of day:
// the format has none. UTF-8, `\n` line ends, no byte-order mark.
export function planNinaTargetSet({
  plan,
  targets = [],
  expandTarget = null,
  acquisition = {},
}) {
  const { entries, skippedTargets } = exportedTargetLines({
    plan,
    targets,
    expandTarget,
  });
  const out = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ArrayOfCaptureSequenceList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
  ];
  let exportedCount = 0;
  let captureLineCount = 0;
  for (const { item, target, name, lines, mosaic } of entries) {
    const angle = ninaPositionAngle(framingAngle(item, target));
    const captures = (acquisition?.[item.id]?.lines || []).filter(
      (line) =>
        Number.isFinite(line.exposureSeconds) &&
        Number.isFinite(line.frameCount) &&
        line.frameCount >= 1,
    );
    for (const pane of lines) {
      const ra = ninaSetRightAscension(pane.coordinate.ra);
      const dec = ninaSetDeclination(pane.coordinate.dec);
      const targetName =
        mosaic && pane.index != null
          ? `${name} Panel ${pane.index}`
          : pane.name;
      out.push(
        `  <CaptureSequenceList TargetName="${xmlEscape(targetName)}" Mode="STANDARD" RAHours="${ra.hours}" RAMinutes="${ra.minutes}" RASeconds="${ra.seconds}" DecDegrees="${dec.degrees}" DecMinutes="${dec.minutes}" DecSeconds="${dec.seconds}" PositionAngle="${angle}" Delay="0" SlewToTarget="false" AutoFocusOnStart="false" CenterTarget="false" RotateTarget="false" StartGuiding="false" AutoFocusOnFilterChange="false" AutoFocusAfterSetTime="false" AutoFocusSetTime="30" AutoFocusAfterSetExposures="false" AutoFocusSetExposures="10" AutoFocusAfterTemperatureChange="false" AutoFocusAfterTemperatureChangeAmount="5" AutoFocusAfterHFRChange="false" AutoFocusAfterHFRChangeAmount="10">`,
      );
      for (const line of captures) {
        out.push(...ninaCaptureSequence(line));
        captureLineCount += 1;
      }
      out.push(
        "    <Coordinates>",
        `      <RA>${ra.decimal}</RA>`,
        `      <Dec>${dec.decimal}</Dec>`,
        "      <Epoch>J2000</Epoch>",
        "    </Coordinates>",
        `    <NegativeDec>${dec.negative}</NegativeDec>`,
        "  </CaptureSequenceList>",
      );
      exportedCount += 1;
    }
  }
  out.push("</ArrayOfCaptureSequenceList>", "");
  return {
    content: out.join("\n"),
    exportedCount,
    captureLineCount,
    skippedTargets,
  };
}

export function framingNinaCsv(target, { expandTarget = null } = {}) {
  return planNinaCsv({
    plan: { items: [{ id: target?.id || "framing", target }] },
    expandTarget,
  });
}

export function planShareText({ plan, night, targets, locale = "en" }) {
  const words = exportWords(locale);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${plan.date}T12:00:00Z`));
  const names = planTargetSummary(plan, targets)
    .map((target) => target.title)
    .join(", ");
  return [
    plan.name || words.observationPlan,
    date,
    names || words.noTargetSelected,
  ].join("\n");
}

// Extracted from `components/PlannerPage.js` so every export surface derives
// the same download name. Non-alphanumeric runs collapse to one hyphen and an
// empty result falls back to "plan".
export function safeFilename(value) {
  return (
    String(value || "plan")
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gi, "-")
      .replaceAll(/^-+|-+$/g, "") || "plan"
  );
}

const exportFileKinds = {
  archive: { suffix: "", extension: "json" },
  asiair: { suffix: "-asiair", extension: "csv" },
  nina: { suffix: "-nina", extension: "csv" },
  ninaTargetSet: { suffix: "-nina", extension: "ninaTargetSet" },
  calendar: { suffix: "", extension: "ics" },
  weather: { suffix: "-weather", extension: "ics" },
  map: { suffix: "-sky-map", extension: "png" },
  sheet: { suffix: "-plan", extension: "png" },
};

// `<safe plan name>-<plan date><kind suffix>.<extension>`, the composition
// every download in the planner already used inline.
export function planExportFilename(plan, kind) {
  const file = exportFileKinds[kind];
  if (!file) return null;
  return `${safeFilename(plan?.name)}-${plan?.date}${file.suffix}.${file.extension}`;
}
