import { catalogueDesignation } from "astro-core/catalogue-designation.js";
import {
  localizedPlannerName,
  plannerCatalogue,
} from "astro-core/planner-targets.js";
import { localizedTargetCommonName } from "astro-core/target-common-names.js";
import { shownPlaceName } from "../places/shown-place-name.js";

/**
 * What a capture says about itself beside its image (boards
 * `GestionCaptures` « une capture ouverte », `PrivatePortalCapture`,
 * `PublicCapture`): its targets, the night it belongs to, the equipment of
 * that night, the sky quality and, for its owner alone, the place. One
 * builder for every audience, so that the private gallery and the public
 * gallery never say more than this:
 *
 * - `audience: "owner"` — everything, the place included (« Lieu … (jamais
 *   publié) »);
 * - `audience: "visitor"` — never the place, its name nor its coordinates
 *   (decision Q3: nothing about the place is published).
 *
 * Pure: the caller reads the rows (`capture`, its `plan` and `session` when
 * it has them, its `targets` from the catalogue and the names of the night's
 * `equipment`); a value the data lacks is `null`, and a screen shows a line
 * only where its value exists. A capture carries no total exposure (the
 * dead `exposureSeconds` was removed; the integration time is the
 * debriefing's, read per target).
 */
export const CAPTURE_DETAIL_AUDIENCES = Object.freeze(["owner", "visitor"]);

const parse = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isoDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

const arrayOf = (value) => {
  const parsed = parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
};

// The curated names of the planner, by designation (« Galaxie
// d’Andromède »), read in the page's language before the catalogue's.
let plannerNames = null;
const plannerName = (designation, locale) => {
  plannerNames ??= new Map(
    plannerCatalogue.map((target) => [
      catalogueDesignation(target.designation),
      target.name,
    ]),
  );
  const name = plannerNames.get(designation);
  return name ? localizedPlannerName(name, locale) : null;
};

/** A target of the catalogue as a screen writes it: designation and name. */
export function targetLabel(entry, locale = "en") {
  const designation = catalogueDesignation(entry.designation ?? entry.id);
  const name =
    plannerName(designation, locale) ||
    localizedTargetCommonName(
      {
        designation: entry.designation ?? entry.id,
        aliases: arrayOf(entry.aliases_json ?? entry.aliases),
        commonNames: arrayOf(entry.common_names_json ?? entry.commonNames),
      },
      locale,
    );
  return {
    id: entry.id,
    designation,
    name: name && name !== designation ? name : null,
  };
}

export function captureDetail(
  {
    capture,
    plan = null,
    session = null,
    targets = [],
    equipment = [],
    locale = "en",
    knownPlaces = [],
  },
  { audience = "visitor" } = {},
) {
  if (!CAPTURE_DETAIL_AUDIENCES.includes(audience))
    throw new Error(`Unknown audience: ${String(audience)}.`);
  const location = parse(plan?.location_json ?? plan?.location);
  const night =
    isoDate(plan?.plan_date ?? plan?.date) ?? isoDate(session?.started_at);
  const bortle = Number(location?.bortle);
  // The name of the place the session stands for now (the live place of the
  // plan's copy, else the session's own), never a position.
  const placeName = shownPlaceName(
    [parse(session?.place_json), location],
    knownPlaces,
  );
  return {
    targets: targets.map((entry) => targetLabel(entry, locale)),
    night,
    addedAt: capture.created_at ?? capture.createdAt ?? null,
    fileName: capture.original_name ?? capture.originalName ?? null,
    byteSize: Number(capture.byte_size ?? capture.byteSize) || 0,
    equipment: equipment.filter(
      (name) => typeof name === "string" && name.trim(),
    ),
    skyQuality:
      Number.isInteger(bortle) && bortle >= 1 && bortle <= 9
        ? { bortle }
        : null,
    ...(audience === "owner"
      ? { place: placeName ? { name: placeName } : null }
      : {}),
  };
}
