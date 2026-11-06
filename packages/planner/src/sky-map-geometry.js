// Where a point of the sky lands on the map (`PlannerNightSkyMap.js`), from
// the Stellarium engine the map drives: the centre of the view as a J2000
// coordinate, the projection of a coordinate, of the equipment's field, and
// the caption of a field. Exported for what a shell draws over the map at the
// `planner.map.overlay` point (`portal/planner/extensions.js`), which is told
// of every projected frame and places its own elements with the same rules.
import { stellariumViewCentreVector } from "./stellarium-view.js";

export function projectPoint(stel, coordinate, width, height) {
  if (!width || !height || !coordinate) return null;
  const view = stel.convertFrame(
    stel.core.observer,
    "ICRF",
    "VIEW",
    stel.s2c(coordinate.ra * stel.D2R, coordinate.dec * stel.D2R),
  );
  const aspect = width / height;
  const fovy =
    aspect < 1
      ? 4 * Math.atan(Math.tan(stel.core.fov / 4) / aspect)
      : stel.core.fov;
  const fovx =
    aspect < 1
      ? stel.core.fov
      : 4 * Math.atan(Math.tan(stel.core.fov / 4) * aspect);
  const x = view[0] / (1 - view[2]) / Math.tan(fovx / 4);
  const y = view[1] / (1 - view[2]) / Math.tan(fovy / 4);
  if (!Number.isFinite(x) || !Number.isFinite(y) || view[2] >= 0) return null;
  if (Math.abs(x) > 1.13 || Math.abs(y) > 1.13) return null;
  return { x, y };
}

export function framingCentre(stel) {
  try {
    // Stellarium renders the VIEW frame down its negative Z axis.  `s2c(0, 0)`
    // is positive X, roughly 90° away from what the photographer sees at the
    // centre of the map. Convert the actual view-centre vector back to ICRF so
    // the saved J2000 coordinate remains independent of horizon orientation.
    const icrf = stel.convertFrame(
      stel.core.observer,
      "VIEW",
      "ICRF",
      stellariumViewCentreVector(),
    );
    const [ra, dec] = stel.c2s(icrf);
    const coordinate = {
      ra: (((ra * stel.R2D) % 360) + 360) % 360,
      dec: dec * stel.R2D,
    };
    return Number.isFinite(coordinate.ra) && Number.isFinite(coordinate.dec)
      ? coordinate
      : null;
  } catch {
    return null;
  }
}

export function offsetCoordinate(coordinate, eastArcmin = 0, northArcmin = 0) {
  const cosine = Math.max(0.05, Math.cos(coordinate.dec * (Math.PI / 180)));
  return {
    ra: coordinate.ra + eastArcmin / (60 * cosine),
    dec: coordinate.dec + northArcmin / 60,
  };
}

export function equipmentFieldProjection(stel, field, width, height) {
  const fieldWidth = Number(field?.width);
  const fieldHeight = Number(field?.height);
  if (!(fieldWidth > 0 && fieldHeight > 0 && width && height)) return null;

  // This is the same tangent projection as `projectPoint`, centred on the
  // current view.  Unlike offsets in RA/Dec, it stays a true camera rectangle
  // while the user rotates the sky and cannot lag behind a drag.
  const aspect = width / height;
  const fovy =
    aspect < 1
      ? 4 * Math.atan(Math.tan(stel.core.fov / 4) / aspect)
      : stel.core.fov;
  const fovx =
    aspect < 1
      ? stel.core.fov
      : 4 * Math.atan(Math.tan(stel.core.fov / 4) * aspect);
  const fieldWidthRatio =
    Math.tan((fieldWidth * stel.D2R) / 4) / Math.tan(fovx / 4);
  const fieldHeightRatio =
    Math.tan((fieldHeight * stel.D2R) / 4) / Math.tan(fovy / 4);
  if (
    !Number.isFinite(fieldWidthRatio) ||
    !Number.isFinite(fieldHeightRatio) ||
    fieldWidthRatio <= 0 ||
    fieldHeightRatio <= 0
  )
    return null;
  return {
    left: "50%",
    top: "50%",
    width: `${fieldWidthRatio * 100}%`,
    height: `${fieldHeightRatio * 100}%`,
    pixelWidth: fieldWidthRatio * width,
    pixelHeight: fieldHeightRatio * height,
    shape: field?.shape === "circle" ? "circle" : "rectangle",
  };
}

export function formatEquipmentField(field, locale) {
  const width = Number(field?.width);
  const height = Number(field?.height);
  if (!(width > 0 && height > 0)) return "";
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });
  return `${number.format(width)}° × ${number.format(height)}°`;
}
