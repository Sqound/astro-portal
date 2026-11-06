import { createHash } from "node:crypto";

/**
 * The offline pack's optional « Lecture à voix haute » component
 * (`read-aloud`, kind `audio-units`; study READ-ALOUD-CLOUD-01 § 3.3 and 3.5):
 * the paragraphs of the target pages, the introductions and the guided evening,
 * spoken once by a neural voice at generation time and served as static
 * files, one `.m4a` per paragraph (a « unit »), addressed by a content hash.
 *
 * Where the files live (the static-data share, `docs/STATIC_DATA.md`):
 *
 *   read-aloud/<voiceVersion>/<locale>/manifest.json   (the contract below)
 *   read-aloud/<voiceVersion>/<locale>/u/<id>.m4a      (id: 32 hex digits)
 *
 * `manifest.json` is written by the generator and
 * follows `packages/astro-contracts/schemas/api/read-aloud-manifest.schema.json`
 * (fixture: `fixtures/read-aloud/azure-hd-test/fr/`). A language's
 * manifest lists every fiche once, with the smallest level it belongs to
 * (`essential`, `extended`, `complete`) — so the three levels nest by
 * construction: Essentiel ⊂ Étendu ⊂ Complet — and, for each fiche, its
 * units in reading order: `{ id, bytes, sha256, cues }` (`cues`: the start
 * of each sentence in the unit, in milliseconds).
 *
 * `GET /v1/offline-pack` only carries a summary per language (voice, source,
 * licence, the totals of each level, the address and digest of the language
 * manifest): the lists themselves run to hundreds of kilobytes a language and
 * are fetched, when the person asks for a level, from the language manifest's
 * own route. Like every optional component, a portal with nothing deposited
 * lists none: `null`, never a component with nothing in it.
 *
 * This module is the one place the shapes live; it never touches the
 * filesystem.
 */

export const readAloudComponentId = "read-aloud";
export const readAloudComponentKind = "audio-units";
export const readAloudManifestFileName = "manifest.json";
export const readAloudManifestUrlTemplate =
  "/v1/offline-pack/read-aloud/{locale}/{voice}/manifest.json";
/** `{unit}` is the unit's id; `{voice}` is the `voiceVersion`. */
export const readAloudUnitUrlTemplate =
  "/v1/offline-pack/read-aloud/{locale}/{voice}/u/{unit}.m4a";
export const readAloudLevelNames = ["essential", "extended", "complete"];

/** A unit's id: 16 bytes of a SHA-256, in hexadecimal. */
export const readAloudUnitIdPattern = /^[0-9a-f]{32}$/u;
/** A voice version (`azure-hd-2026-11`): a folder name, never a path. */
export const readAloudVoiceVersionPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
/** A language key of the registry (`fr`, `pt-BR`, `zh-Hans`). */
export const readAloudLocalePattern =
  /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/u;

const sha256Pattern = /^[0-9a-f]{64}$/u;

const text = (value) => typeof value === "string" && value.trim().length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * The id of a unit: the first 16 bytes of
 * `sha256(normalisedText + "\n" + locale + "\n" + voice + "\n" + voiceVersion)`
 * in hexadecimal. The app computes the same id from the text it would
 * read, so a key is found without a table.
 */
export function readAloudUnitId({ text: spoken, locale, voice, voiceVersion }) {
  return createHash("sha256")
    .update(`${spoken}\n${locale}\n${voice}\n${voiceVersion}`)
    .digest("hex")
    .slice(0, 32);
}

function validUnit(unit) {
  if (!unit || typeof unit !== "object") return null;
  const { id, bytes, sha256, cues } = unit;
  if (!readAloudUnitIdPattern.test(String(id))) return null;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (!sha256Pattern.test(String(sha256))) return null;
  if (!Array.isArray(cues) || cues.length === 0 || cues[0] !== 0) return null;
  for (let at = 0; at < cues.length; at += 1)
    if (!count(cues[at]) || (at > 0 && cues[at] < cues[at - 1])) return null;
  return { id, bytes, sha256, cues };
}

/**
 * A language manifest (`manifest.json`) checked and normalised, or `null`
 * when it is not one: wrong version, missing provenance, a unit that is not a
 * unit, a fiche in no level, or one unit id that names two different files.
 *
 * @param {unknown} value
 */
export function parseReadAloudManifest(value) {
  if (!value || typeof value !== "object") return null;
  if (value.v !== 1 || value.kind !== "read-aloud-manifest") return null;
  if (!readAloudLocalePattern.test(String(value.locale))) return null;
  if (!readAloudVoiceVersionPattern.test(String(value.voiceVersion)))
    return null;
  for (const key of ["voice", "source", "attribution", "license"])
    if (!text(value[key])) return null;
  if (!Array.isArray(value.fiches) || value.fiches.length === 0) return null;
  const known = new Map();
  const seen = new Set();
  const fiches = [];
  for (const fiche of value.fiches) {
    if (!fiche || typeof fiche !== "object") return null;
    if (!text(fiche.id) || fiche.id.length > 128 || seen.has(fiche.id))
      return null;
    seen.add(fiche.id);
    if (!readAloudLevelNames.includes(fiche.level)) return null;
    if (!Array.isArray(fiche.units) || fiche.units.length === 0) return null;
    const units = [];
    for (const raw of fiche.units) {
      const unit = validUnit(raw);
      if (!unit) return null;
      const earlier = known.get(unit.id);
      if (
        earlier &&
        (earlier.bytes !== unit.bytes || earlier.sha256 !== unit.sha256)
      )
        return null;
      known.set(unit.id, unit);
      units.push(unit);
    }
    fiches.push({ id: fiche.id, level: fiche.level, units });
  }
  return { ...value, fiches, units: known };
}

/**
 * The three levels of a parsed manifest, cumulative and in reading order:
 * `{ essential, extended, complete }`, each a list of fiches.
 */
export function readAloudLevels(manifest) {
  const rank = (level) => readAloudLevelNames.indexOf(level);
  return Object.fromEntries(
    readAloudLevelNames.map((name, at) => [
      name,
      manifest.fiches.filter((fiche) => rank(fiche.level) <= at),
    ]),
  );
}

/** `{ fiches, units, bytes }` of a list of fiches; a shared unit counts once. */
export function readAloudTotals(fiches) {
  const units = new Map();
  for (const fiche of fiches)
    for (const unit of fiche.units) units.set(unit.id, unit.bytes);
  let bytes = 0;
  for (const size of units.values()) bytes += size;
  return { fiches: fiches.length, units: units.size, bytes };
}

/**
 * The component's `revision`: a digest of every language's version and
 * manifest digest (16 hexadecimal digits, like the texts').
 */
export function readAloudRevision(languages) {
  const hash = createHash("sha256");
  for (const { locale, voiceVersion, manifestChecksum } of languages)
    hash.update(`${locale}/${voiceVersion}:${manifestChecksum}\n`);
  return hash.digest("hex").slice(0, 16);
}

/**
 * The component, from the languages installed: each
 * `{ manifest (parsed), manifestBytes (the file's bytes) }`, in the order the
 * caller wants them listed. `null` without a language.
 *
 * @param {{ languages: { manifest: object, manifestBytes: Buffer }[] }} input
 */
export function readAloudPackComponent({ languages }) {
  const locales = {};
  const digests = [];
  let estimatedBytes = 0;
  for (const { manifest, manifestBytes } of languages ?? []) {
    if (!manifest || !manifestBytes || locales[manifest.locale]) continue;
    const checksum = createHash("sha256").update(manifestBytes).digest("hex");
    const levels = Object.fromEntries(
      Object.entries(readAloudLevels(manifest)).map(([name, fiches]) => [
        name,
        readAloudTotals(fiches),
      ]),
    );
    estimatedBytes += levels.complete.bytes;
    digests.push({
      locale: manifest.locale,
      voiceVersion: manifest.voiceVersion,
      manifestChecksum: checksum,
    });
    locales[manifest.locale] = {
      voiceVersion: manifest.voiceVersion,
      voice: manifest.voice,
      source: manifest.source,
      attribution: manifest.attribution,
      license: manifest.license,
      ...(manifest.format ? { format: manifest.format } : {}),
      ...(manifest.generatedAt ? { generatedAt: manifest.generatedAt } : {}),
      manifest: {
        url: readAloudManifestUrlTemplate
          .replace("{locale}", manifest.locale)
          .replace("{voice}", manifest.voiceVersion),
        bytes: manifestBytes.length,
        checksum: `sha256:${checksum}`,
      },
      levels,
    };
  }
  if (!digests.length) return null;
  return {
    id: readAloudComponentId,
    kind: readAloudComponentKind,
    required: false,
    revision: readAloudRevision(digests),
    estimatedBytes,
    urlTemplate: readAloudUnitUrlTemplate,
    locales,
  };
}
