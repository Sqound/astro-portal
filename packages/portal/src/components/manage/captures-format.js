/**
 * The dates and sizes of the tab « Captures », in the page's language: « 3
 * oct. 2026 » (a night, a day a capture was added), « 1er oct. 2026 » in
 * French, « 5 novembre » (the end of a block, the day a protection is
 * lifted; with its year when it is not this year's), « Octobre 2026 » /
 * « septembre 2026 » (the month of a night), « 48,2 Mo ».
 */

const valid = (date) => !Number.isNaN(date.getTime());

/** A night (`YYYY-MM-DD`) is a calendar day: read and written in UTC. */
const nightDate = (night) => new Date(`${night}T12:00:00.000Z`);

/** The French first of the month: « 1er ». */
function frenchFirst(text, date, locale, timeZone) {
  if (locale !== "fr") return text;
  const day = Number(
    new Intl.DateTimeFormat("en", { day: "numeric", timeZone }).format(date),
  );
  return day === 1 ? text.replace(/^1(?=\s)/, "1er") : text;
}

/** « 3 oct. 2026 »: a short day with its year. */
export function shortDay(value, locale, { timeZone } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (!valid(date)) return "";
  const text = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
  return frenchFirst(text, date, locale, timeZone);
}

/** « Nuit du 3 oct. 2026 »'s date, from the night of the plan. */
export const nightDay = (night, locale) =>
  shortDay(nightDate(night), locale, { timeZone: "UTC" });

/** « 5 novembre » (with the year when it is not `now`'s). */
export function longDay(value, locale, { timeZone, now = new Date() } = {}) {
  const date = new Date(value);
  if (!valid(date)) return "";
  const options = { day: "numeric", month: "long", timeZone };
  const year = (candidate) =>
    new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(
      candidate,
    );
  if (year(date) !== year(now)) options.year = "numeric";
  return frenchFirst(
    new Intl.DateTimeFormat(locale, options).format(date),
    date,
    locale,
    timeZone,
  );
}

/** « septembre 2026 », the month of a night; `capital` for « Octobre 2026 ». */
export function nightMonth(night, locale, { capital = false } = {}) {
  const date = nightDate(night);
  if (!valid(date)) return "";
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return capital
    ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
    : text;
}

const MEBI = 1024 * 1024;
const GIBI = 1024 * MEBI;

// « 6 248 »: a group written with an ordinary space where the language's
// format puts a narrow one (« 6 248 × 4 176 px »).
const grouped = (text) => text.replace(/[\u202f]/g, " ");

/**
 * « 42 Mo », « 1,2 Go »: a size in base 1 024 under the names « Mo » and
 * « Go », so that « 50 Go » is
 * exactly 50 × 1 024 Mo; in Mo one decimal under 10 (« 0,3 Mo ») and none above
 * (« 412 Mo »), in Go one decimal (« 48,2 Go »), a whole number without it
 * (« 50 Go »). A file of a few kilobytes is never « 0 Mo »: it reads « < 0,1 Mo ».
 */
export function fileSize(bytes, locale) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  const giga = value >= GIBI;
  const amount = value / (giga ? GIBI : MEBI);
  const write = (number) =>
    grouped(
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: giga ? "gigabyte" : "megabyte",
        unitDisplay: "short",
        maximumFractionDigits: giga || number < 10 ? 1 : 0,
      }).format(number),
    );
  return !giga && amount < 0.05 ? `<\u00a0${write(0.1)}` : write(amount);
}

/** « 5 oct. »: a night or a day without its year (a card of the list). */
export function dayMonth(value, locale, { timeZone = "UTC" } = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? nightDate(value)
    : new Date(value);
  if (!valid(date)) return "";
  const text = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
  return frenchFirst(text, date, locale, timeZone);
}

/** « 6 oct. 2026 · 23:02 »: when an image arrived. */
export function dayAndTime(value, locale, { timeZone } = {}) {
  const date = new Date(value);
  if (!valid(date)) return "";
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return `${shortDay(date, locale, { timeZone })} · ${time}`;
}

/** « 6 248 × 4 176 px », or `""` without the dimensions. */
export function dimensions(width, height, locale) {
  if (!(Number(width) > 0 && Number(height) > 0)) return "";
  const number = (value) =>
    grouped(
      new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
        .format(value)
        .replace(/\u00a0/g, " "),
    );
  return `${number(width)} × ${number(height)} px`;
}

const KINDS = {
  tif: "TIFF",
  tiff: "TIFF",
  jpg: "JPEG",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  fits: "FITS",
  fit: "FITS",
  fts: "FITS",
  xisf: "XISF",
};

/** « TIFF », « JPEG »: the kind of a file, from its name. */
export function fileKind(name) {
  const extension = /\.([a-z0-9]+)$/i.exec(String(name || ""))?.[1];
  if (!extension) return "";
  return KINDS[extension.toLowerCase()] ?? extension.toUpperCase();
}

/** « 3f9a1c07…c21e »: a SHA-256 shortened to its ends. */
export const shortDigest = (sha256) =>
  typeof sha256 === "string" && sha256.length > 12
    ? `${sha256.slice(0, 8)}…${sha256.slice(-4)}`
    : String(sha256 || "");
