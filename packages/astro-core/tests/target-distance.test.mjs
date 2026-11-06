import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { catalogueDesignation } from "../dist/catalogue-designation.js";
import { distanceSourceCredits } from "../dist/catalogue-sources.js";
import {
  curatedDistanceMap,
  curatedLightYears,
  distanceIsEstimate,
  distanceUnits,
  targetDistance,
} from "../dist/target-distance.js";

// Synthetic records throughout: the rule is tested on invented numbers,
// never on the catalogue's.
const curated = curatedDistanceMap([
  {
    id: "M1000",
    value: 2.54,
    unit: "Mly",
    reference: "Synthetic et al. 2000",
    url: "https://example.invalid/a",
    retrievedAt: "2026-10-14",
  },
  {
    id: "NGC 1000",
    value: 7.42,
    unit: "kpc",
    reference: "Synthetic 2001",
    url: "https://example.invalid/b",
    retrievedAt: "2026-10-14",
  },
]);

test("the distance rule: published beats parallax beats redshift, each threshold on both sides, else absent", () => {
  const rule = (record) => targetDistance(record, curated);
  // Layer 1: the curated value wins — even over a parallax and a velocity the
  // record also carries — in the digits it is published with.
  assert.deepEqual(
    rule({
      designation: "M1000",
      typeKey: "Galaxie",
      parallaxMas: 6,
      radialVelocityKmS: 5000,
    }),
    {
      lightYears: 2540000,
      source: "published",
      reference: "Synthetic et al. 2000",
    },
  );
  // A far globular cluster goes through the table too (0.13 mas: too far for
  // a parallax), converted from kpc: 7.42 kpc = 24 200 ly (3 digits).
  assert.equal(
    rule({
      designation: "NGC 1000",
      typeKey: "Amas globulaire",
      parallaxMas: 0.13,
    }).lightYears,
    24200,
  );
  // Layer 2: 1 / Pax, three significant digits, from 0.5 mas.
  const cluster = { typeKey: "Amas ouvert" };
  assert.deepEqual(rule({ ...cluster, parallaxMas: 1 }), {
    lightYears: 3260,
    source: "parallax",
    reference: "OpenNGC Pax (Gaia), 1/Pax",
  });
  assert.equal(rule({ ...cluster, parallaxMas: 0.5 }).lightYears, 6520);
  assert.equal(rule({ ...cluster, parallaxMas: 0.4999 }), null);
  for (const typeKey of [
    "Amas globulaire",
    "Nébuleuse planétaire",
    "Nébuleuse en émission",
  ])
    assert.equal(rule({ typeKey, parallaxMas: 2 }).source, "parallax");
  // Never for a galaxy: its Pax is noise. And a star is not a target here.
  assert.equal(rule({ typeKey: "Galaxie", parallaxMas: 6 }), null);
  assert.equal(rule({ typeKey: "Étoile", parallaxMas: 6 }), null);
  // Layer 3: v / 70 km/s/Mpc, two significant digits, from 1 000 km/s.
  assert.deepEqual(rule({ typeKey: "Galaxie", radialVelocityKmS: 7000 }), {
    lightYears: 330000000,
    source: "redshift",
    reference: "OpenNGC RadVel, Hubble's law at 70 km/s/Mpc",
  });
  assert.equal(
    rule({ typeKey: "Galaxie", radialVelocityKmS: 1000 }).lightYears,
    47000000,
  );
  assert.equal(rule({ typeKey: "Galaxie", radialVelocityKmS: 999 }), null);
  assert.equal(rule({ typeKey: "Galaxie", radialVelocityKmS: -300 }), null);
  // A velocity is a galaxy's: a nebula with one gets no redshift distance.
  assert.equal(
    rule({ typeKey: "Nébuleuse en émission", radialVelocityKmS: 5000 }),
    null,
  );
  // Absent: nothing is invented, null and missing values included.
  assert.equal(rule({ typeKey: "Galaxie" }), null);
  assert.equal(rule({ typeKey: "Galaxie", radialVelocityKmS: null }), null);
  // Without a table the rule still works (the service passes none for a record).
  assert.equal(
    targetDistance({ typeKey: "Amas ouvert", parallaxMas: 1 }).source,
    "parallax",
  );
  // The redshift layer is a model: « estimation ».
  assert.equal(distanceIsEstimate("redshift"), true);
  assert.equal(distanceIsEstimate("published"), false);
  assert.equal(distanceIsEstimate("parallax"), false);
  assert.equal(distanceIsEstimate(null), false);
});

test("the curated table: six fields, a known unit, a canonical designation, no duplicate, a reference that names its bibliographic identifier", () => {
  const { distances } = JSON.parse(
    readFileSync(
      new URL("../src/target-distances.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(distances.length >= 100, `${distances.length} entries`);
  const seen = new Set();
  for (const entry of distances) {
    assert.deepEqual(
      Object.keys(entry).toSorted(),
      ["id", "reference", "retrievedAt", "unit", "url", "value"],
      entry.id,
    );
    assert.ok(distanceUnits.includes(entry.unit), `${entry.id}: ${entry.unit}`);
    assert.ok(entry.value > 0, entry.id);
    assert.ok(curatedLightYears(entry) > 0, entry.id);
    // The designation as the library writes it (U4): writing it again is a no-op.
    assert.equal(catalogueDesignation(entry.id), entry.id);
    assert.ok(!seen.has(entry.id), `duplicate ${entry.id}`);
    seen.add(entry.id);
    // « Author year, journal volume, page · bibcode · method · via source ».
    assert.match(entry.reference, /\b(19|20)\d\d\b/, entry.id);
    assert.match(entry.reference, / · (19|20)\d\d[\w&.]{15} · /, entry.id);
    assert.match(
      entry.url,
      /^https:\/\/ui\.adsabs\.harvard\.edu\/abs\//,
      entry.id,
    );
    assert.match(entry.retrievedAt, /^\d{4}-\d{2}-\d{2}$/, entry.id);
  }
  // The references are reachable: docs/STATIC_DATA.md lists every entry.
  const documentation = readFileSync(
    new URL("../../../docs/STATIC_DATA.md", import.meta.url),
    "utf8",
  );
  for (const entry of distances)
    assert.ok(
      new RegExp(`\\|\\s*${entry.id}\\s*\\|`).test(documentation) &&
        documentation.includes(entry.reference),
      `${entry.id} is not listed in docs/STATIC_DATA.md`,
    );
  // The conversion keeps the published digits: 0.78 Mpc is two digits.
  assert.equal(curatedLightYears({ value: 0.78, unit: "Mpc" }), 2500000);
  assert.equal(curatedLightYears({ value: 4.52, unit: "kpc" }), 14700);
  assert.equal(curatedLightYears({ value: 2500, unit: "ly" }), 2500);
});

test("the Virgo-area galaxies M99, M61 and M109 take a published, redshift-independent distance, not Hubble's law", () => {
  const { distances } = JSON.parse(
    readFileSync(
      new URL("../src/target-distances.json", import.meta.url),
      "utf8",
    ),
  );
  const table = curatedDistanceMap(distances);
  // OpenNGC radial velocities (km/s) of the three galaxies: Hubble's law at
  // 70 km/s/Mpc puts them at 110, 73 and 49 million light-years, M99 and M61
  // about twice too far because the Virgo peculiar velocity is no distance.
  const galaxies = [
    { designation: "M99", radialVelocityKmS: 2399 },
    { designation: "M61", radialVelocityKmS: 1564 },
    { designation: "M109", radialVelocityKmS: 1046 },
  ];
  for (const galaxy of galaxies) {
    const distance = targetDistance({ ...galaxy, typeKey: "Galaxie" }, table);
    assert.equal(distance.source, "published", galaxy.designation);
    assert.ok(
      distance.lightYears < 70_000_000,
      `${galaxy.designation}: ${distance.lightYears} ly`,
    );
    // Not an absurdly near value either: these are 10 to 25 Mpc galaxies.
    assert.ok(distance.lightYears > 30_000_000, galaxy.designation);
    assert.match(distance.reference, /\b20\d\d\b/, galaxy.designation);
  }
  // Without the table the same records fall back to the redshift estimate.
  assert.equal(
    targetDistance({ ...galaxies[0], typeKey: "Galaxie" }).source,
    "redshift",
  );
  // Two references that NED-D attached to the wrong paper stay corrected: the
  // distances of M51 and M104 come from McQuinn et al. 2016, not from the 2017
  // paper on M63, M74 and four other galaxies.
  for (const id of ["M51", "M104"])
    assert.doesNotMatch(table.get(id).reference, /2017AJ\.\.\.\.154\.\.\.51M/);
});

test("the distance credit is written in the ten languages: OpenNGC's share-alike line, then the published values with NED's acknowledgement", () => {
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const [openNgc, published] = distanceSourceCredits(locale);
    assert.match(openNgc, /OpenNGC.*CC BY-SA 4\.0/, locale);
    assert.match(published, /NED-D/, locale);
    assert.match(published, /NASA\/IPAC Extragalactic Database/, locale);
    assert.match(published, /SIMBAD/, locale);
    // A credit only: nothing in it names an offer.
    assert.doesNotMatch(
      `${openNgc} ${published}`,
      /avancé|payant|achat|premium|paid/i,
      locale,
    );
  }
  // A language the app does not ship reads the English; Portuguese reads pt-BR.
  assert.deepEqual(distanceSourceCredits("sv"), distanceSourceCredits("en"));
  assert.deepEqual(distanceSourceCredits("pt"), distanceSourceCredits("pt-BR"));
});
