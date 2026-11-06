/**
 * `ASTRO_PORTAL_REDACT_LOCATIONS` (docs/PRIVACY.md): removes, at every depth,
 * the fields that name or place where a capture was made — `lieu`,
 * `location`, `GPS`, `coordonnées GPS` — from what the gallery of the
 * operator serves. The sky quality (`skyQuality`: a Bortle class and an
 * SQM, an estimate with its provenance, never a coordinate — docs/
 * DATA_MODEL.md, « Precomputed sky quality ») stays: nothing about the place
 * is published, its sky quality may be.
 */
export function redactPrivateLocationFields(value) {
  if (Array.isArray(value)) return value.map(redactPrivateLocationFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/(^|\s)(lieu|location|coordonn[eé]es gps|gps)(\s|$)/i.test(key),
      )
      .map(([key, nested]) => [key, redactPrivateLocationFields(nested)]),
  );
}
