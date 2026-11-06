// This is a practical catalogue classification, not a site-specific planning
// constraint. It uses the planner's default minimum altitude at representative
// mid-latitudes: 30° high from ±30° latitude. At culmination that means a
// northern observer can use declinations down to −30°, while a southern
// observer can use declinations up to +30°.
export const hemisphereReferenceLatitude = 30;
export const hemisphereMinimumCulmination = 30;

type HemisphereVisibility = {
  visibleFromNorthernHemisphere: boolean;
  visibleFromSouthernHemisphere: boolean;
};

export function hemisphereVisibility(
  declination: unknown,
): HemisphereVisibility {
  if (
    declination === null ||
    declination === undefined ||
    String(declination).trim() === ""
  )
    return {
      visibleFromNorthernHemisphere: false,
      visibleFromSouthernHemisphere: false,
    };
  const dec = Number(declination);
  if (!Number.isFinite(dec) || dec < -90 || dec > 90)
    return {
      visibleFromNorthernHemisphere: false,
      visibleFromSouthernHemisphere: false,
    };
  const northernDeclinationLimit =
    hemisphereReferenceLatitude - (90 - hemisphereMinimumCulmination);
  const southernDeclinationLimit =
    -hemisphereReferenceLatitude + (90 - hemisphereMinimumCulmination);
  return {
    visibleFromNorthernHemisphere: dec >= northernDeclinationLimit,
    visibleFromSouthernHemisphere: dec <= southernDeclinationLimit,
  };
}
