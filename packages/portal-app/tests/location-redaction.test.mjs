import assert from "node:assert/strict";
import test from "node:test";
import { redactPrivateLocationFields } from "../dist/lib/location-redaction.js";

// ASTRO_PORTAL_REDACT_LOCATIONS: nothing about the place is published, its
// sky quality may be.

test("the redaction keeps the sky quality and still removes lieu, location and GPS, at every depth", () => {
  const skyQuality = {
    bortleClass: 4,
    sqm: 20.72,
    source: "lightpollutionmap",
    method: "viirs-modeled-zenith-sky-brightness",
    estimated: true,
    calculatedAt: "2026-01-01T00:00:00.000Z",
  };
  const group = {
    title: "M31",
    lieu: "Col des Mélèzes",
    location: { latitude: 45, longitude: -30 },
    GPS: "45.0 N, 30.0 W",
    "coordonnées GPS": "45, -30",
    skyQuality,
    assets: [
      {
        baseName: "M31_LRGB_final",
        location: "Camping du Lac Noir",
        "capture gps": [45, -30],
        skyQuality,
        metadata: { Lieu: "Col des Mélèzes", exposure: 3600 },
      },
    ],
  };
  const redacted = redactPrivateLocationFields(group);
  assert.deepEqual(redacted, {
    title: "M31",
    skyQuality,
    assets: [
      {
        baseName: "M31_LRGB_final",
        skyQuality,
        metadata: { exposure: 3600 },
      },
    ],
  });
  const text = JSON.stringify(redacted);
  for (const leak of ["Mélèzes", "Lac Noir", "45", "-30"])
    assert.equal(text.includes(leak), false, leak);
  // The source is not modified.
  assert.equal(group.lieu, "Col des Mélèzes");
});
