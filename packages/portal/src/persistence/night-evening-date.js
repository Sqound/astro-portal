/**
 * The date of a night (`YYYY-MM-DD`, its evening): its plan's date when it
 * has one; otherwise the evening of its start, local noon to local noon at
 * the longitude (12:00 UTC − longitude / 15 h, never a time zone), the UTC
 * noon when no longitude is known. The rule of the integrations
 * (`api/project-integrations.js`), kept here for the persistence layer.
 * Apart from `project-night-repository.js` so that `capture-session-link.js`,
 * which `server.mjs` loads through the capture repository, does not load the
 * plan repository and the night-window computation behind it.
 */
export function nightEveningDate({ planDate, startedAt, longitude }) {
  if (typeof planDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(planDate))
    return planDate.slice(0, 10);
  const at = Date.parse(startedAt ?? "");
  if (!Number.isFinite(at)) return null;
  const shift = Number.isFinite(longitude) ? (longitude / 15) * 3_600_000 : 0;
  return new Date(at + shift - 12 * 3_600_000).toISOString().slice(0, 10);
}
