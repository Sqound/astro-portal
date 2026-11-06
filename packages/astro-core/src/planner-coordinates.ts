// The catalogue stores right ascension in hours. Planner/map coordinates,
// including all user-defined framing centres, are J2000 degrees.
type Coordinate = { ra: number; dec: number };

type PlannerTarget = {
  id?: string;
  coordinate?: Coordinate;
  coordinateUnit?: string;
  framing?: unknown;
  plannerSource?: string;
  coordinateOrigin?: string;
  coordinateCorrection?: {
    previous: Coordinate;
    reason: string;
  };
  [key: string]: unknown;
};

export function cataloguePlannerCoordinate(
  coordinate: Coordinate | null | undefined,
): Coordinate | null {
  if (
    !coordinate ||
    !Number.isFinite(coordinate.ra) ||
    !Number.isFinite(coordinate.dec)
  )
    return null;
  return { ra: coordinate.ra * 15, dec: coordinate.dec };
}

export function reconcileCatalogueSnapshot(
  saved: PlannerTarget | null | undefined,
  current: PlannerTarget | null | undefined,
): PlannerTarget | null | undefined {
  if (
    !saved?.coordinate ||
    saved.coordinateUnit ||
    saved.framing ||
    saved.plannerSource === "framing" ||
    current?.coordinateOrigin !== "catalogue-hours" ||
    saved.id !== current.id
  )
    return saved;
  const before = saved.coordinate,
    after = current.coordinate;
  // Do not guess from an RA below 24: compare both axes to the same catalogue
  // object, retaining the original value as a reversible migration record.
  if (
    !after ||
    Math.abs(before.ra - after.ra / 15) > 1e-7 ||
    Math.abs(before.dec - after.dec) > 1e-7 ||
    Math.abs(before.ra - after.ra) < 1e-7
  )
    return saved;
  return {
    ...saved,
    coordinate: { ...after },
    coordinateUnit: "degrees",
    coordinateCorrection: {
      previous: { ...before },
      reason: "catalogue-hours-to-degrees",
    },
  };
}
