// The Solar System's eleven bodies have no J2000 coordinate in the
// catalogue; their place of the day is the ephemeris's. This is the one place
// the web reads it for a search row (the framing editor centres the map on
// it).

import { Body, EquatorFromVector, GeoVector } from "astronomy-engine";

const bodies = {
  "solar-system-sun": Body.Sun,
  "solar-system-moon": Body.Moon,
  "solar-system-mercury": Body.Mercury,
  "solar-system-venus": Body.Venus,
  "solar-system-mars": Body.Mars,
  "solar-system-jupiter": Body.Jupiter,
  "solar-system-saturn": Body.Saturn,
  "solar-system-uranus": Body.Uranus,
  "solar-system-neptune": Body.Neptune,
  "solar-system-pluto": Body.Pluto,
};

/** Whether [id] is one of the eleven bodies (the Earth included). */
export function isSolarSystemBodyId(id) {
  return (
    typeof id === "string" && (id in bodies || id === "solar-system-earth")
  );
}

/**
 * The geocentric J2000 position of the body [id] at [date], in degrees
 * (`{ ra, dec }`), or `null` for the Earth, which has no place in its own sky,
 * and for an id that is not a body.
 */
export function solarSystemEquatorJ2000(id, date = new Date()) {
  const body = bodies[id];
  if (!body) return null;
  const equator = EquatorFromVector(GeoVector(body, date, false));
  return { ra: equator.ra * 15, dec: equator.dec };
}

// The seven bodies that have a season card: the planets, Pluto included. The
// Sun and the Moon do not (they cross the whole sky in a day or a month),
// the Earth has no place in its own sky.
const planets = {
  "solar-system-mercury": Body.Mercury,
  "solar-system-venus": Body.Venus,
  "solar-system-mars": Body.Mars,
  "solar-system-jupiter": Body.Jupiter,
  "solar-system-saturn": Body.Saturn,
  "solar-system-uranus": Body.Uranus,
  "solar-system-neptune": Body.Neptune,
  "solar-system-pluto": Body.Pluto,
};

// The planner names its planets in French (`plannerPlanetDefinitions`).
const plannerPlanetNames = {
  mercure: "mercury",
  vénus: "venus",
  saturne: "saturn",
};

/** The Solar System ids of the planets that stay near the Sun. */
export const innerPlanetIds = ["solar-system-mercury", "solar-system-venus"];

/**
 * The `solar-system-…` id of the planet a target stands for, or `null` for a
 * fixed target and for the Sun, the Moon and the Earth: the id itself, or
 * the astronomy-engine `body` ("Jupiter") a planner card carries.
 */
export function planetIdOf(target) {
  if (typeof target?.id === "string" && target.id in planets) return target.id;
  // The planner's own planet cards: `planner-planet-vénus`, `-saturne`…
  if (
    typeof target?.id === "string" &&
    target.id.startsWith("planner-planet-")
  ) {
    const french = target.id.slice("planner-planet-".length);
    const id = `solar-system-${plannerPlanetNames[french] ?? french}`;
    if (id in planets) return id;
  }
  if (typeof target?.body === "string") {
    const id = `solar-system-${target.body.toLowerCase()}`;
    if (id in planets) return id;
  }
  return null;
}

/** The astronomy-engine body of a planet id (`planetIdOf`), or `null`. */
export function planetBody(id) {
  return planets[id] ?? null;
}
