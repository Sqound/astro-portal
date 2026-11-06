// Dew risk for one night: an ESTIMATE, always, built
// from the forecast's temperature, dew point and wind. Pure, no clock, no
// network. The public fixtures `dew-risk.json` and `dew-risk-level.json`
// pin its results.
//
// The initial rule:
//
// - the spread is `temperature − dewPoint`, in °C, rounded to 0.1 °C (so
//   that 12.3 − 11.3 reads 1.0 and not 1.0000000000000018);
// - `high` when the spread is ≤ 1 °C, `moderate` when it is ≤ 3 °C, `low`
//   otherwise;
// - one level lower when the wind is ≥ 15 km/h (a steady breeze keeps the
//   optics above the air temperature): `high` → `moderate`, `moderate` →
//   `low`; `low` stays `low`.
//
// Refinement: when the forecast has a temperature
// and a relative humidity but no dew point for an hour, the dew point is
// derived from the humidity with the Magnus formula (Sonntag 1990
// coefficients, a = 17.62, b = 243.12 °C), so an hour is not left without an
// estimate when the provider only sent humidity. With neither a dew point nor
// a humidity, or without a temperature, the hour has no level (`null`).
//
// For the night: the highest level any hour reaches, and the first hour it
// is reached (« Rosée · Risque modéré · À partir de 01:00 »).

export const dewRiskRule = Object.freeze({
  highSpreadCelsius: 1,
  moderateSpreadCelsius: 3,
  calmingWindKmh: 15,
});

export const dewRiskLevels = Object.freeze(["low", "moderate", "high"]);

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * The dew point, in °C, of air at `temperature` °C and `humidity` % relative
 * humidity (Magnus formula), rounded to 0.1 °C; `null` when either is
 * missing or the humidity is outside (0, 100].
 */
export function dewPointFromHumidity(temperature, humidity) {
  const t = finite(temperature);
  const rh = finite(humidity);
  if (t === null || rh === null || rh <= 0 || rh > 100) return null;
  const a = 17.62;
  const b = 243.12;
  const gamma = Math.log(rh / 100) + (a * t) / (b + t);
  const dewPoint = (b * gamma) / (a - gamma);
  return Number.isFinite(dewPoint) ? Math.round(dewPoint * 10) / 10 : null;
}

/**
 * The dew-risk level of one hour — `"low"`, `"moderate"` or `"high"` — from
 * `{ temperature, dewPoint, wind, humidity }` (°C, °C, km/h, %), or `null`
 * when the hour does not say enough.
 */
export function dewRiskLevel(hour) {
  const temperature = finite(hour?.temperature);
  if (temperature === null) return null;
  const dewPoint =
    finite(hour?.dewPoint) ?? dewPointFromHumidity(temperature, hour?.humidity);
  if (dewPoint === null) return null;
  const spread = Math.round((temperature - dewPoint) * 10) / 10;
  let index =
    spread <= dewRiskRule.highSpreadCelsius
      ? 2
      : spread <= dewRiskRule.moderateSpreadCelsius
        ? 1
        : 0;
  const wind = finite(hour?.wind);
  if (index > 0 && wind !== null && wind >= dewRiskRule.calmingWindKmh)
    index -= 1;
  return dewRiskLevels[index];
}

/**
 * The night's dew risk from its hourly rows (each `{ time, temperature,
 * dewPoint, wind, humidity }`, the shape `hourlyAstronomyForecast` returns):
 * `{ level, from, estimate: true }`, where `level` is the highest level an
 * hour reaches and `from` the `time` of the first hour that reaches it, as
 * the row gives it; `null` when no hour has a level.
 */
export function nightDewRisk(rows) {
  let level = -1;
  let from = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    const index = dewRiskLevels.indexOf(dewRiskLevel(row));
    if (index > level) {
      level = index;
      from = row?.time ?? null;
    }
  }
  if (level < 0) return null;
  return { level: dewRiskLevels[level], from, estimate: true };
}
