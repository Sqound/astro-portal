import {
  horizonAltitude,
  horizonMaskPointCount,
  horizonMaskStep,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import { zenithLimitAltitude } from "./constraints.js";

// Portable form of the horizon projection drawn by `HorizonProjectionCanvas`
// (`components/PlannerPage.js`). The SVG user space is kept unchanged so the
// numbers below are the ones the browser already renders: 200 × 200 centred
// on (100, 100) for the circular sky dome, 360 × 90 for the linear plot.

const degree = Math.PI / 180;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export const horizonCircularCentre = 100;
export const horizonCircularRadius = 86;
export const horizonCircularCardinalRadius = 95;
export const horizonGridAltitudes = [0, 15, 30, 45, 60, 75, 90];
export const horizonCardinals = [
  { azimuth: 0, label: "N" },
  { azimuth: 90, label: "E" },
  { azimuth: 180, label: "S" },
  { azimuth: 270, label: "O" },
];

// The letter of a compass point of `horizonCardinals` (French letters: N, E,
// S, O) in the reader's language (one rule per language): German writes O
// for Osten and W for Westen ("O" would otherwise read as West), Brazilian
// Portuguese L for Leste and O for Oeste, Spanish and Italian keep N E S O
// (Este/Est, Oeste/Ovest); English and Japanese write W for West.
export function horizonCardinalLabel(label, locale) {
  switch (locale) {
    case "fr":
    case "es":
    case "it":
      return label;
    case "de":
      return label === "E" ? "O" : label === "O" ? "W" : label;
    case "pt-BR":
      return label === "E" ? "L" : label;
    default:
      return label === "O" ? "W" : label;
  }
}

export function horizonCircularPoint(azimuth, altitude, rotation = 0) {
  const angle = (number(azimuth) + number(rotation) - 90) * degree;
  const radius =
    ((90 - clamp(number(altitude), 0, 90)) / 90) * horizonCircularRadius;
  return {
    x: horizonCircularCentre + Math.cos(angle) * radius,
    y: horizonCircularCentre + Math.sin(angle) * radius,
  };
}

export function horizonCircularCardinalPoint(azimuth, rotation = 0) {
  const angle = (number(azimuth) + number(rotation) - 90) * degree;
  return {
    x: horizonCircularCentre + Math.cos(angle) * horizonCircularCardinalRadius,
    y: horizonCircularCentre + Math.sin(angle) * horizonCircularCardinalRadius,
  };
}

export function horizonLinearPoint(azimuth, altitude) {
  return {
    x: number(azimuth),
    y: 90 - clamp(number(altitude), 0, 90),
  };
}

export function horizonPoint(projection, azimuth, altitude, rotation = 0) {
  return projection === "circular"
    ? horizonCircularPoint(azimuth, altitude, rotation)
    : horizonLinearPoint(azimuth, altitude);
}

export function horizonCircularRadiusFor(altitude) {
  return ((90 - clamp(number(altitude), 0, 90)) / 90) * horizonCircularRadius;
}

function round(value) {
  return Number(value.toFixed(2));
}

// Every static element of one rendered frame, in draw order, so the native
// painter and the SVG agree on geometry without duplicating the formulas.
export function horizonProjectionGeometry({
  projection = "circular",
  rotation = 0,
  minAltitude = 0,
  mountSafety = null,
  latitude = null,
  mask = null,
} = {}) {
  const circular = projection === "circular";
  const draft = normaliseHorizonMask(mask);
  const hasMask = Boolean(mask?.enabled);
  const zenithAltitude = zenithLimitAltitude(mountSafety);
  const polarisAltitude = number(latitude);
  const hasPolaris =
    String(latitude ?? "").trim() !== "" &&
    Number.isFinite(polarisAltitude) &&
    polarisAltitude >= 0;
  const profilePoints = [...draft.points, { ...draft.points[0], azimuth: 360 }];
  // The altitude-0 ring, one corner per mask direction and back to north.
  const outerPoints = Array.from(
    { length: horizonMaskPointCount + 1 },
    (_, index) => horizonCircularPoint(index * horizonMaskStep, 0, rotation),
  );
  return {
    viewBox: circular ? "0 0 200 200" : "0 0 360 90",
    projection: circular ? "circular" : "linear",
    rotation: number(rotation),
    gridAltitudes: horizonGridAltitudes.map((altitude) =>
      circular
        ? { altitude, radius: round(horizonCircularRadiusFor(altitude)) }
        : { altitude, y: 90 - altitude },
    ),
    gridAzimuths: circular
      ? horizonCardinals.map(({ azimuth }) => {
          const outer = horizonCircularPoint(azimuth, 0, rotation);
          return { azimuth, x: round(outer.x), y: round(outer.y) };
        })
      : [0, 90, 180, 270, 360].map((azimuth) => ({ azimuth, x: azimuth })),
    minimumAltitude: circular
      ? {
          radius: round(
            horizonCircularRadiusFor(clamp(number(minAltitude), 0, 90)),
          ),
        }
      : { y: 90 - clamp(number(minAltitude), 0, 90) },
    zenithLimit:
      zenithAltitude === null
        ? null
        : circular
          ? {
              altitude: zenithAltitude,
              radius: round(horizonCircularRadiusFor(zenithAltitude)),
            }
          : { altitude: zenithAltitude, y: 90 - zenithAltitude },
    meridian: circular
      ? {
          outer: pointObject(horizonCircularPoint(180, 0, rotation)),
          label: pointObject(horizonCircularPoint(180, 12, rotation)),
        }
      : { x: 180, label: { x: 180, y: 5 } },
    cardinals: circular
      ? horizonCardinals.map(({ azimuth, label }) => ({
          label,
          ...pointObject(horizonCircularCardinalPoint(azimuth, rotation)),
        }))
      : horizonCardinals.map(({ azimuth, label }) => ({
          label,
          x: azimuth,
          y: 90,
        })),
    polaris: hasPolaris
      ? circular
        ? pointObject(horizonCircularPoint(0, polarisAltitude, rotation))
        : { x: 0, y: 90 - clamp(polarisAltitude, 0, 90) }
      : null,
    mask: hasMask
      ? {
          profile: profilePoints.map((point) =>
            circular
              ? pointObject(
                  horizonCircularPoint(point.azimuth, point.altitude, rotation),
                )
              : { x: number(point.azimuth), y: round(90 - point.altitude) },
          ),
          closure: circular
            ? [
                pointObject(outerPoints.at(-1)),
                ...outerPoints.slice(0, -1).reverse().map(pointObject),
              ]
            : [
                { x: 360, y: 90 },
                { x: 0, y: 90 },
              ],
        }
      : null,
  };
}

function pointObject(point) {
  return { x: round(point.x), y: round(point.y) };
}

// The per-target styling decision of one plotted sample: usable, blocked by
// the recorded horizon profile, or inside the mount's zenith exclusion.
export function horizonTargetState({
  point,
  mask = null,
  minAltitude = 0,
  mountSafety = null,
} = {}) {
  const altitude = number(point?.altitude);
  if (!Number.isFinite(altitude) || altitude < 0) return null;
  const hasMask = Boolean(mask?.enabled);
  const profileAltitude = horizonAltitude(mask, point?.azimuth);
  const hasConstraintMetadata =
    Boolean(point) && Object.hasOwn(point, "constraint");
  const normallyUsable = hasConstraintMetadata
    ? point.constraint === null
    : altitude >= number(minAltitude) && number(point?.moonSeparation) >= 25;
  const blocked = hasConstraintMetadata
    ? point.constraint === "horizon"
    : hasMask && normallyUsable && altitude < profileAltitude;
  const zenithAltitude = zenithLimitAltitude(mountSafety);
  const zenithBlocked =
    point?.mountReason === "zenith" ||
    (zenithAltitude !== null && altitude >= zenithAltitude);
  return { usable: normallyUsable, blocked, zenithBlocked };
}

// Tap-to-select on the plot picks the nearest plotted target in SVG user
// space, then toggles it — the pointer never has to land on the marker.
export function nearestHorizonTarget({
  cards = [],
  sampleIndex = 0,
  point,
  projection = "circular",
  rotation = 0,
} = {}) {
  let nearest = null;
  for (const card of cards) {
    const sample = card?.series?.[sampleIndex];
    if (!sample || number(sample.altitude) < 0) continue;
    const position = horizonPoint(
      projection,
      sample.azimuth,
      sample.altitude,
      rotation,
    );
    const distance =
      (position.x - number(point?.x)) ** 2 +
      (position.y - number(point?.y)) ** 2;
    if (!nearest || distance < nearest.distance)
      nearest = { id: card?.target?.id ?? null, distance };
  }
  return nearest?.id ?? null;
}
