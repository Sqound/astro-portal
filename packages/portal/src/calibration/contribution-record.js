import {
  encodeSkyQualityRadiance,
  nearestSkyQualityRadiance,
  skyQualityCalibrationAt,
  skyQualityCalibrationRegions,
} from "../sky-quality.js";

/**
 * One contribution to the project's own sky-brightness calibration set
 * (docs/CONTRIBUTION_RULES.md): the whole of what is kept of a value an
 * observer let the project keep, and nothing else.
 *
 * - `kind`: `measured` (the night's value Astro Sync measured on the
 *   observer's own poses) or `entered` (the value typed in a place's form);
 * - `sqm`: the value, mag/arcsec², to the hundredth;
 * - `band`: `camera` for a measured value, `sqm` for an entered one (a
 *   sky-meter reading): the two bands differ by a systematic offset, which is
 *   why the band is kept;
 * - `radianceLevel`: the sky-quality raster's own 256-level log encoding at
 *   the place (the byte of the cell the place falls in, 0–255), never the
 *   raw radiance, never a coordinate;
 * - `region`: the calibration region of the place (`skyQualityCalibrationAt`),
 *   `global` outside every region;
 * - `year`: the year of the night (measured) or of the entry (entered);
 * - `methodVersion`: the measuring method (measured only; `null` otherwise).
 *
 * The record is built on the service from the stored value and the place,
 * then the place is forgotten: the builder returns a fresh object holding
 * only these seven fields.
 */
export const CONTRIBUTION_RECORD_FIELDS = Object.freeze([
  "kind",
  "sqm",
  "band",
  "radianceLevel",
  "region",
  "year",
  "methodVersion",
]);

export const CONTRIBUTION_KINDS = Object.freeze(["measured", "entered"]);
export const CONTRIBUTION_BANDS = Object.freeze(["camera", "sqm"]);
const BAND_OF_KIND = Object.freeze({ measured: "camera", entered: "sqm" });

/**
 * What a contribution never carries, by name — a key matching one of these
 * (case and separators ignored) anywhere in a record or an exported file is
 * refused. The rule is first a closed list of fields (above); this list is
 * the second lock, shared with the export of the set and its own check of its
 * output, and extended — never
 * rewritten — by the community dataset's own contributions.
 */
export const FORBIDDEN_CONTRIBUTION_FIELDS = Object.freeze([
  // Where.
  "latitude",
  "longitude",
  "lat",
  "lon",
  "lng",
  "position",
  "coordinates",
  "site",
  "place",
  "placeId",
  "location",
  "address",
  "elevation",
  "timeZone",
  // Who, and with what.
  "name",
  "email",
  "space",
  "spaceId",
  "tenant",
  "tenantId",
  "account",
  "accountId",
  "user",
  "userId",
  "person",
  "personId",
  "device",
  "deviceId",
  "installation",
  "installationId",
  "session",
  "sessionId",
  "serial",
  "serialNumber",
  "exif",
  // Files.
  "path",
  "file",
  "fileName",
  "directory",
  // When, finer than the year.
  "night",
  "date",
  "month",
  "day",
  "observedAt",
  "enteredAt",
  "createdAt",
  "updatedAt",
  // The service's own link (kept in the ledger, never in a record).
  "rowKey",
]);

const comparable = (key) =>
  String(key)
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const FORBIDDEN = new Set(FORBIDDEN_CONTRIBUTION_FIELDS.map(comparable));

/** Whether a key names something a contribution never carries. */
export function isForbiddenContributionField(key) {
  return FORBIDDEN.has(comparable(key));
}

/**
 * Every forbidden key in `value`, at any depth (objects and arrays), as
 * `path` strings (`records[3].latitude`).
 */
export function forbiddenContributionFields(value, path = "") {
  const found = [];
  if (Array.isArray(value))
    value.forEach((item, index) =>
      found.push(...forbiddenContributionFields(item, `${path}[${index}]`)),
    );
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key;
      if (isForbiddenContributionField(key)) found.push(here);
      found.push(...forbiddenContributionFields(item, here));
    }
  return found;
}

const METHOD_VERSION_PATTERN = /^astro-sync-sky\/[1-9][0-9]{0,5}$/;
const REGION_IDS = new Set([
  "global",
  ...skyQualityCalibrationRegions.map((region) => region.id),
]);
export const CONTRIBUTION_SQM_MIN = 10;
export const CONTRIBUTION_SQM_MAX = 25;
const YEAR_MIN = 2000;
const YEAR_MAX = 2999;

/**
 * What is wrong with a record, as sentences (empty: it is a contribution).
 * The fields are exactly the seven, each of its own type and range.
 */
export function contributionRecordProblems(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return ["a contribution is an object"];
  const problems = [];
  const keys = Object.keys(record);
  for (const key of keys)
    if (!CONTRIBUTION_RECORD_FIELDS.includes(key))
      problems.push(`field not allowed: ${key}`);
  for (const key of CONTRIBUTION_RECORD_FIELDS)
    if (!Object.hasOwn(record, key)) problems.push(`field missing: ${key}`);
  const { kind, sqm, band, radianceLevel, region, year, methodVersion } =
    record;
  if (!CONTRIBUTION_KINDS.includes(kind)) problems.push("kind is unknown");
  if (
    typeof sqm !== "number" ||
    !Number.isFinite(sqm) ||
    sqm < CONTRIBUTION_SQM_MIN ||
    sqm > CONTRIBUTION_SQM_MAX ||
    Math.round(sqm * 100) / 100 !== sqm
  )
    problems.push("sqm is not a value to the hundredth");
  if (BAND_OF_KIND[kind] && band !== BAND_OF_KIND[kind])
    problems.push("band does not match the kind");
  if (
    !Number.isInteger(radianceLevel) ||
    radianceLevel < 0 ||
    radianceLevel > 255
  )
    problems.push("radianceLevel is not a level 0–255");
  if (typeof region !== "string" || !REGION_IDS.has(region))
    problems.push("region is not a calibration region");
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX)
    problems.push("year is not a year");
  if (
    kind === "measured"
      ? typeof methodVersion !== "string" ||
        !METHOD_VERSION_PATTERN.test(methodVersion)
      : methodVersion !== null
  )
    problems.push("methodVersion does not match the kind");
  for (const field of forbiddenContributionFields(record))
    problems.push(`forbidden field: ${field}`);
  return problems;
}

const yearOf = (text) => {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(String(text ?? ""));
  return match ? Number(match[1]) : null;
};

/**
 * The record of one stored value, or `null` when it cannot be built (no
 * raster, no usable place, a value out of range): nothing is then kept.
 *
 * `value`: `{ kind: "measured", sqm, night, methodVersion }` or
 * `{ kind: "entered", sqm, enteredAt }`; `place`: `{ latitude, longitude }`,
 * read here and dropped; `grid`: the installed sky-quality raster's grid.
 */
export function buildContributionRecord(value, place, { grid } = {}) {
  if (!value || !CONTRIBUTION_KINDS.includes(value.kind)) return null;
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const radiance = grid
    ? nearestSkyQualityRadiance(grid, latitude, longitude)
    : null;
  if (radiance === null || radiance === undefined) return null;
  const measured = value.kind === "measured";
  const record = {
    kind: value.kind,
    sqm: Math.round(Number(value.sqm) * 100) / 100,
    band: BAND_OF_KIND[value.kind],
    radianceLevel: encodeSkyQualityRadiance(radiance),
    region: skyQualityCalibrationAt(latitude, longitude).id,
    year: yearOf(measured ? value.night : value.enteredAt),
    methodVersion: measured ? String(value.methodVersion ?? "") : null,
  };
  return contributionRecordProblems(record).length ? null : record;
}

/**
 * The same record, the same text: the canonical JSON of a record (its
 * fields in their fixed order), to compare a stored row with a new one.
 */
export function contributionRecordKey(record) {
  return JSON.stringify(
    CONTRIBUTION_RECORD_FIELDS.map((field) => record?.[field] ?? null),
  );
}
