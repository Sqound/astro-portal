// The Moon and the planets in « Prévisualiser » (`components/TargetPreviewBlock.js`):
// the body at its true size of the day in the field, on the survey around
// its place of the day. Pure: the place, the distance, the phase, Saturn's
// rings and Jupiter's four moons at one instant (`astronomy-engine`), and the
// painter that draws the body on a 2D context at a given scale. Never the
// Sun (no preview of the Sun in an instrument), never the Earth.
//
// The picture is the survey's: north up, east left. An angle of position is
// measured from north towards east, so on the picture a direction at angle
// `p` points to (-sin p, -cos p) (x to the right, y down).

import {
  AstroTime,
  Body,
  EquatorFromVector,
  GeoVector,
  Illumination,
  JupiterMoons,
} from "astronomy-engine";
import { zoneOffsetMinutes } from "./horizon-path-mode.js";
import { planetIdOf } from "./solar-system-position.js";

const kilometresPerAu = 149597870.7;
const lightSecondsPerAu = 499.004784;
const degrees = Math.PI / 180;
const arcsecondsPerRadian = 206264.80624709636;

/**
 * The bodies a preview is drawn for: the astronomy-engine body, the
 * equatorial radius (km), whether the phase is drawn, the IAU north pole
 * (J2000, degrees) of a body whose disc is turned by it.
 */
export const targetPreviewPlanets = Object.freeze({
  moon: { body: Body.Moon, radiusKm: 1737.4, phase: true },
  mercury: { body: Body.Mercury, radiusKm: 2439.7, phase: true },
  venus: { body: Body.Venus, radiusKm: 6051.8, phase: true },
  mars: { body: Body.Mars, radiusKm: 3396.2, phase: true },
  jupiter: {
    body: Body.Jupiter,
    radiusKm: 71492,
    pole: { ra: 268.057, dec: 64.495 },
    moons: true,
  },
  saturn: {
    body: Body.Saturn,
    radiusKm: 60268,
    pole: { ra: 40.589, dec: 83.537 },
    rings: true,
  },
  uranus: { body: Body.Uranus, radiusKm: 25559 },
  neptune: { body: Body.Neptune, radiusKm: 24764 },
  pluto: { body: Body.Pluto, radiusKm: 1188.3 },
});

/**
 * Where the disc is in the bundled illustrations of the planets (NASA,
 * `plannerPlanetDefinitions`), keyed by their PIA number: its centre (`x`,
 * `y`, shares of the width and the height) and its diameter (`side`, a
 * share of the width), measured on the thumbnails on 2026-10-29 (pixels
 * above 40 of 255). Mercury's is a mosaic of its surface, not a disc: its
 * mean colour (`fill`) stands in. The browser cannot read these pictures
 * (another origin, no CORS), so their disc is not found at run time.
 */
export const targetPreviewIllustrationCrops = Object.freeze({
  PIA13823: { fill: "#9d958a" },
  PIA23791: { x: 0.285, y: 0.5, side: 0.486 },
  PIA00407: { x: 0.5, y: 0.5, side: 1 },
  PIA01509: { x: 0.536, y: 0.495, side: 0.765 },
  PIA18182: { x: 0.495, y: 0.495, side: 0.81 },
  PIA01492: { x: 0.44, y: 0.485, side: 0.79 },
});

/** The crop of a bundled illustration by its address, or `null`. */
export function targetPreviewIllustrationCrop(url) {
  const id = /PIA\d+/.exec(String(url ?? ""))?.[0];
  return (id && targetPreviewIllustrationCrops[id]) || null;
}

/**
 * The disc of a picture the page may read, from its pixels (`rgba`, drawn
 * at `width` × `height`) and its own size (`naturalWidth` ×
 * `naturalHeight`): the box of the pixels brighter than `threshold`, as a
 * square crop (`x`, `y`, `side`, as `targetPreviewIllustrationCrops`), or
 * `null` when nothing is bright.
 */
export function targetPreviewDiscCrop(
  rgba,
  width,
  height,
  { naturalWidth = width, naturalHeight = height, threshold = 40 } = {},
) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let row = 0; row < height; row += 1)
    for (let column = 0; column < width; column += 1) {
      const index = (row * width + column) * 4;
      const grey =
        (299 * rgba[index] + 587 * rgba[index + 1] + 114 * rgba[index + 2]) /
        1000;
      if (grey <= threshold) continue;
      left = Math.min(left, column);
      right = Math.max(right, column);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
  if (right < 0) return null;
  const across = ((right - left + 1) / width) * naturalWidth;
  const down = ((bottom - top + 1) / height) * naturalHeight;
  return {
    x: (left + right + 1) / 2 / width,
    y: (top + bottom + 1) / 2 / height,
    side: Math.max(across, down) / naturalWidth,
  };
}

/** Saturn's figure: its flattening and its rings, in equatorial radii. */
export const saturnFigure = Object.freeze({
  flattening: 0.098,
  outerRing: 2.27,
  innerRingShare: 0.66,
  cassiniShare: 0.89,
});

/** The four Galilean moons, in the order `JupiterMoons` answers them. */
export const galileanMoons = Object.freeze([
  "io",
  "europa",
  "ganymede",
  "callisto",
]);

const keyOfBodyName = (name) => {
  const key = String(name || "").toLowerCase();
  return key === "sun" || key === "earth" || key in targetPreviewPlanets
    ? key
    : null;
};

/**
 * The body a target of the solar system stands for: `"moon"`, `"jupiter"`…,
 * `"sun"` and `"earth"` too (which have no preview), `null` for anything
 * else. Reads the catalogue's `solar-system-…` id, the planner's own planet
 * cards and their astronomy-engine `body`.
 */
export function targetPreviewBodyKey(target) {
  const id = typeof target?.id === "string" ? target.id : "";
  if (id.startsWith("solar-system-"))
    return keyOfBodyName(id.slice("solar-system-".length));
  const planet = planetIdOf(target);
  if (planet) return keyOfBodyName(planet.slice("solar-system-".length));
  return keyOfBodyName(target?.body);
}

/** Whether a body key gets a preview: every one but the Sun and the Earth. */
export function targetPreviewBodyShown(key) {
  return typeof key === "string" && key in targetPreviewPlanets;
}

const finiteDate = (value) => {
  const time =
    value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? new Date(time) : null;
};

/**
 * The one instant the drawing is made for: the card's best time of the
 * night (the target at its highest), else 22:00 local time on the night's
 * date (`YYYY-MM-DD`) in `timeZone`, else `now`.
 */
export function targetPreviewInstant({
  card = null,
  date = null,
  timeZone = null,
  now = new Date(),
} = {}) {
  const best = finiteDate(card?.best?.time);
  if (best) return best;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (match) {
    const wall = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      22,
    );
    let instant = wall - zoneOffsetMinutes(wall, timeZone) * 60000;
    instant = wall - zoneOffsetMinutes(instant, timeZone) * 60000;
    return new Date(instant);
  }
  return finiteDate(now) ?? new Date();
}

/**
 * The share of the Moon's disc lit at `instant`, in percent (0-100, rounded
 * as the night's `moonIllumination` is): what the photo tab's filter advice
 * weighs against the threshold of the filter advice.
 */
export function targetPreviewMoonPercent(instant) {
  const moon = targetPreviewPlanet("moon", instant);
  return moon?.phase ? Math.round(moon.phase.fraction * 100) : null;
}

/** The angle of position (degrees, 0-360, north towards east) of
 * (`ra`, `dec`) seen from (`ra0`, `dec0`), all in degrees. */
export function positionAngle(ra0, dec0, ra, dec) {
  const deltaRa = (ra - ra0) * degrees;
  const angle = Math.atan2(
    Math.cos(dec * degrees) * Math.sin(deltaRa),
    Math.sin(dec * degrees) * Math.cos(dec0 * degrees) -
      Math.cos(dec * degrees) * Math.sin(dec0 * degrees) * Math.cos(deltaRa),
  );
  return (((angle / degrees) % 360) + 360) % 360;
}

const equatorOf = (body, time) => {
  const vector = GeoVector(body, time, true);
  const equator = EquatorFromVector(vector);
  return { ra: equator.ra * 15, dec: equator.dec, au: equator.dist, vector };
};

/**
 * The body `key` at `instant`: its geocentric J2000 place (`ra`, `dec`,
 * degrees), its distance (km), its apparent diameter (arcseconds,
 * 2·atan(radius / distance)), and as the body has them its phase (`phase`:
 * the phase angle, the illuminated fraction, the angle of position of the
 * bright limb), its pole's angle of position (`poleAngle`), Saturn's rings
 * (`rings`: the tilt B, signed) and Jupiter's moons (`moons`: east and
 * north offsets in arcseconds, `behind` when hidden by the disc). `null`
 * for a key without a preview.
 */
export function targetPreviewPlanet(key, instant) {
  const planet = targetPreviewPlanets[key];
  const date = finiteDate(instant);
  if (!planet || !date) return null;
  const time = new AstroTime(date);
  const place = equatorOf(planet.body, time);
  const distanceKm = place.au * kilometresPerAu;
  const radiusArcsec =
    Math.atan(planet.radiusKm / distanceKm) * arcsecondsPerRadian;
  const result = {
    key,
    instant: date.toISOString(),
    ra: place.ra,
    dec: place.dec,
    distanceKm,
    diameterArcsec: 2 * radiusArcsec,
    phase: null,
    poleAngle: null,
    rings: null,
    moons: null,
  };
  if (planet.phase) {
    const illumination = Illumination(planet.body, time);
    const sun = equatorOf(Body.Sun, time);
    result.phase = {
      angle: illumination.phase_angle,
      fraction: illumination.phase_fraction,
      brightLimbAngle: positionAngle(place.ra, place.dec, sun.ra, sun.dec),
    };
  }
  if (planet.pole)
    result.poleAngle = positionAngle(
      place.ra,
      place.dec,
      planet.pole.ra,
      planet.pole.dec,
    );
  if (planet.rings)
    result.rings = { tilt: Illumination(planet.body, time).ring_tilt };
  if (planet.moons) {
    // The moons as seen now: where they were when their light left.
    const seen = time.AddDays(-(place.au * lightSecondsPerAu) / 86400);
    const moons = JupiterMoons(seen);
    const ra = place.ra * degrees;
    const dec = place.dec * degrees;
    const east = [-Math.sin(ra), Math.cos(ra), 0];
    const north = [
      -Math.sin(dec) * Math.cos(ra),
      -Math.sin(dec) * Math.sin(ra),
      Math.cos(dec),
    ];
    const away = [
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec),
    ];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    result.moons = galileanMoons.map((name) => {
      const state = moons[name];
      const offset = [state.x, state.y, state.z];
      const eastArcsec = (dot(offset, east) / place.au) * arcsecondsPerRadian;
      const northArcsec = (dot(offset, north) / place.au) * arcsecondsPerRadian;
      return {
        name,
        eastArcsec,
        northArcsec,
        behind:
          dot(offset, away) > 0 &&
          Math.hypot(eastArcsec, northArcsec) < radiusArcsec,
      };
    });
  }
  return result;
}

/** The size as the line writes it: arcseconds under a minute, else
 * arcminutes, one decimal at most, the language's separator. */
export function targetPreviewPlanetSizeText(diameterArcsec, locale) {
  const minutes = diameterArcsec >= 60;
  const value = minutes ? diameterArcsec / 60 : diameterArcsec;
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(Math.round(value * 10) / 10);
  return `${text}${minutes ? "′" : "″"}`;
}

/**
 * Draws the body on `context` centred on (`x`, `y`), `pixelsPerArcsec` to
 * the scale, with `image` (the body's illustration, or `null`) laid in its
 * disc: never smaller than one physical pixel, never enlarged. The dark side
 * of a body with a phase is not drawn; Saturn is its globe and its rings,
 * the half of the rings nearer the Earth in front; Jupiter's moons are
 * points, those behind the disc left out.
 */
export function paintTargetPreviewPlanet(
  context,
  {
    x,
    y,
    pixelsPerArcsec,
    planet,
    image = null,
    crop = null,
    minimumPixels = 1,
  },
) {
  if (!planet || !(pixelsPerArcsec > 0)) return;
  const radius = Math.max(
    minimumPixels / 2,
    (planet.diameterArcsec / 2) * pixelsPerArcsec,
  );
  // A direction at angle of position `p` on the picture.
  const screenAngle = (p) =>
    Math.atan2(-Math.cos(p * degrees), -Math.sin(p * degrees));
  // The illustration's disc in the square at (`left`, `top`), `size` wide.
  const disc = (left, top, size, fill = "#d9d2c3") => {
    if (image && !crop?.fill) {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      context.imageSmoothingQuality = "high";
      if (crop && width && height) {
        const side = crop.side * width;
        context.drawImage(
          image,
          crop.x * width - side / 2,
          crop.y * height - side / 2,
          side,
          side,
          left,
          top,
          size,
          size,
        );
      } else context.drawImage(image, left, top, size, size);
    } else {
      context.fillStyle = crop?.fill || fill;
      context.fillRect(left, top, size, size);
    }
  };
  // Jupiter's moons, a pixel at least, those behind the disc left out.
  const moons = () => {
    if (!planet.moons) return;
    const moonRadius = 0.75 * pixelsPerArcsec;
    for (const moon of planet.moons) {
      if (moon.behind) continue;
      context.fillStyle = "#f4efe4";
      const moonX = x - moon.eastArcsec * pixelsPerArcsec;
      const moonY = y - moon.northArcsec * pixelsPerArcsec;
      if (moonRadius < 0.75) {
        // On the pixel grid: a point, fainter than the planet.
        context.fillStyle = "#9a958c";
        context.fillRect(
          Math.round(moonX - 0.5),
          Math.round(moonY - 0.5),
          1,
          1,
        );
        continue;
      }
      context.beginPath();
      context.arc(moonX, moonY, moonRadius, 0, 2 * Math.PI);
      context.fill();
    }
  };
  // Under three pixels the body is a point on the pixel grid, its picture
  // laid twice in light (a planet is the brightest point of its field): a
  // circle that small would only be a grey smear.
  const span = 2 * radius * (planet.rings ? saturnFigure.outerRing : 1);
  if (span < 3) {
    const size = Math.max(1, Math.round(2 * radius));
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size / 2);
    const fill = planet.rings ? "#d8c08a" : undefined;
    context.save();
    disc(left, top, size, fill);
    context.globalCompositeOperation = "lighter";
    disc(left, top, size, fill);
    context.globalCompositeOperation = "source-over";
    moons();
    context.restore();
    return;
  }
  context.save();
  context.translate(x, y);

  if (planet.rings) {
    const { flattening, outerRing, innerRingShare, cassiniShare } =
      saturnFigure;
    const tilt = planet.rings.tilt;
    const squash = Math.abs(Math.sin(tilt * degrees));
    const outer = radius * outerRing;
    // The pole up: the rings' long axis across.
    context.rotate(-(planet.poleAngle ?? 0) * degrees);
    // The half nearer the Earth is on the side away from the visible pole.
    const near = tilt >= 0 ? [0, Math.PI] : [Math.PI, 2 * Math.PI];
    const far = tilt >= 0 ? [Math.PI, 2 * Math.PI] : [0, Math.PI];
    const band = ([start, end], from, to, colour) => {
      context.beginPath();
      context.ellipse(
        0,
        0,
        outer * to,
        outer * to * squash,
        0,
        start,
        end,
        false,
      );
      context.ellipse(
        0,
        0,
        outer * from,
        outer * from * squash,
        0,
        end,
        start,
        true,
      );
      context.closePath();
      context.fillStyle = colour;
      context.fill();
    };
    const rings = (half) => {
      if (squash * outer < 0.05) return;
      band(
        half,
        innerRingShare,
        cassiniShare - 0.02,
        "rgba(226, 211, 170, 0.95)",
      );
      band(half, cassiniShare + 0.01, 1, "rgba(196, 182, 146, 0.9)");
    };
    rings(far);
    context.beginPath();
    context.ellipse(0, 0, radius, radius * (1 - flattening), 0, 0, 2 * Math.PI);
    context.fillStyle = "#d8c08a";
    context.fill();
    rings(near);
    context.restore();
    return;
  }

  context.beginPath();
  if (planet.phase && radius >= 1) {
    // The lit part: the half disc towards the Sun and the terminator.
    context.save();
    context.rotate(screenAngle(planet.phase.brightLimbAngle));
    const cosine = Math.cos(planet.phase.angle * degrees);
    context.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    context.ellipse(
      0,
      0,
      Math.max(1e-6, radius * Math.abs(cosine)),
      radius,
      0,
      Math.PI / 2,
      cosine >= 0 ? (3 * Math.PI) / 2 : -Math.PI / 2,
      cosine < 0,
    );
    context.closePath();
    context.restore();
  } else context.arc(0, 0, radius, 0, 2 * Math.PI);
  context.save();
  context.clip();
  if (planet.poleAngle !== null) context.rotate(-planet.poleAngle * degrees);
  disc(-radius, -radius, 2 * radius);
  context.restore();
  context.restore();
  moons();
}
