import { distanceIsEstimate } from "astro-core/target-distance.js";

/**
 * The distance of a catalogue target as the planner reads it:
 * `{ lightYears, source, isEstimate }`, or `null` when the target has none —
 * "quand connue, sinon absente", and a missing distance means no tile.
 *
 * It reads the three shapes a web target comes in: a target's full view
 * (`distance: { lightYears, source, reference }`, `GET /api/target-library`),
 * a planner candidate or its `knowledge` (`distanceLy` and `distanceSource`),
 * and a compact index row already resolved into the same two fields. The
 * screens that show it (the "Distance" tile of the target dialog) belong to
 * their own lots; `isEstimate` is the redshift layer, whose tile writes the
 * word "estimation".
 */
export function targetDistanceOf(target) {
  const full = target?.distance;
  const lightYears =
    full && typeof full === "object" ? full.lightYears : target?.distanceLy;
  const source =
    full && typeof full === "object" ? full.source : target?.distanceSource;
  if (typeof lightYears !== "number" || !(lightYears > 0)) return null;
  if (!["published", "parallax", "redshift"].includes(source)) return null;
  return {
    lightYears: Math.round(lightYears),
    source,
    isEstimate: distanceIsEstimate(source),
  };
}
