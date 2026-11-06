const distanceSources = ["published", "parallax", "redshift"];

/**
 * The distance of [target], « when known, otherwise absent »:
 * `{ lightYears, source, reference }` or `null`. Written at import time by
 * `astro-core/target-distance.js` on the imported record, so it sits on the
 * target itself (a library file, or an exported seed entry) or inside
 * `source` (the persisted entry, which keeps the imported record whole). A
 * re-import is what gives a target its distance; nothing is computed here.
 */
export function targetDistanceOf(target) {
  const record = target?.distance ?? target?.source?.distance;
  const lightYears =
    record?.lightYears === null ||
    record?.lightYears === undefined ||
    String(record.lightYears).trim() === ""
      ? null
      : Number(record.lightYears);
  if (lightYears === null || !Number.isFinite(lightYears) || lightYears <= 0)
    return null;
  if (!distanceSources.includes(record.source)) return null;
  return {
    lightYears,
    source: record.source,
    reference: typeof record.reference === "string" ? record.reference : "",
  };
}
