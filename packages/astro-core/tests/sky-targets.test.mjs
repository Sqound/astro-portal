import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import {
  objectTypes,
  queriedObjectType,
  taxonomyLabel,
} from "../dist/catalog-taxonomy.js";
import { constellationAt } from "../dist/constellation-at.js";
import { constellationTable } from "../dist/constellations.js";
import {
  brightStarCatalogueTargets,
  brightStarSources,
  brightStarType,
  constellationCatalogueTargets,
  constellationType,
  estimatedDistanceParsecs,
  planUseOfType,
  skyTargetsRevision,
} from "../dist/sky-targets.js";
import {
  targetCatalogueDescription,
  targetCatalogueLabel,
  targetCatalogueNotorietyOrder,
} from "../dist/target-catalogues.js";
import { distanceIsEstimate } from "../dist/target-distance.js";

// The two kinds of catalogue entry the application writes itself.

test("92 bright stars, brightest first, none fainter than magnitude 2.5", () => {
  assert.equal(brightStarCatalogueTargets.length, 92);
  const magnitudes = brightStarCatalogueTargets.map((star) => star.magnitude);
  assert.deepEqual(
    magnitudes,
    magnitudes.toSorted((a, b) => a - b),
  );
  assert.equal(Math.min(...magnitudes), -1.44); // Sirius
  assert.ok(Math.max(...magnitudes) <= 2.5);
  assert.equal(new Set(brightStarCatalogueTargets.map((s) => s.id)).size, 92);
  assert.equal(brightStarCatalogueTargets[0].designation, "Sirius");
  // 85 names of the IAU Catalog of Star Names, 6 in common use, 1 star
  // that has no proper name (η Centauri).
  const kinds = Object.groupBy(
    brightStarCatalogueTargets,
    (star) => star.stellar.nameKind,
  );
  assert.equal(kinds.iau.length, 85);
  assert.equal(kinds.traditional.length, 6);
  assert.equal(kinds.null.length, 1);
  assert.deepEqual(
    kinds.traditional.map((star) => star.designation).toSorted(),
    ["Birdun", "Cih", "Girtab", "Men", "Muhlifain", "Regor"],
  );
  assert.equal(kinds.null[0].designation, "η Cen");
  assert.ok(brightStarSources.length >= 3);
});

test("a bright star carries its identity, its place, its colour and its distance", () => {
  const vega = brightStarCatalogueTargets.find((s) => s.stellar.hip === 91262);
  assert.equal(vega.id, "star-hip-91262");
  assert.equal(vega.designation, "Vega");
  assert.equal(vega.typeKey, brightStarType);
  assert.equal(vega.constellationKey, "Lyr");
  assert.equal(vega.catalogue, "BrightStars");
  assert.deepEqual(vega.catalogues, ["BrightStars"]);
  assert.equal(vega.stellar.bayer, "α Lyr");
  assert.equal(vega.stellar.bayerGenitive, "α Lyrae");
  assert.equal(vega.stellar.hr, 7001);
  assert.equal(vega.stellar.hd, 172167);
  assert.equal(vega.stellar.spectralType, "A0 V");
  assert.equal(vega.stellar.epoch, "J2000.0");
  assert.ok(Math.abs(vega.stellar.colorIndexBV) < 0.05);
  assert.ok(Math.abs(vega.coordinate.ra - 18.6155) < 0.001);
  assert.ok(Math.abs(vega.coordinate.dec - 38.782) < 0.001);
  for (const alias of [
    "α Lyr",
    "α Lyrae",
    "Alpha Lyrae",
    "HR 7001",
    "HD 172167",
    "HIP 91262",
  ])
    assert.ok(vega.aliases.includes(alias), alias);
  // The distance is a parallax, as the other layers write it; a star
  // beyond 150 parsecs says « Estimation ».
  assert.equal(vega.distance.source, "parallax");
  assert.equal(vega.distance.lightYears, 25);
  assert.equal(vega.stellar.distanceIsEstimate, false);
  assert.ok(!vega.distance.reference.startsWith("Estimation"));
  const deneb = brightStarCatalogueTargets.find(
    (s) => s.stellar.hip === 102098,
  );
  assert.equal(deneb.stellar.distanceIsEstimate, true);
  assert.match(deneb.distance.reference, /^Estimation\b/);
  assert.equal(estimatedDistanceParsecs, 150);
  // Not an « estimation » for the reading of a distance's source: the
  // wording belongs to the star's own flag.
  assert.equal(distanceIsEstimate(vega.distance.source), false);
  // Sirius' distance keeps its decimals (8.6 light-years).
  const sirius = brightStarCatalogueTargets[0];
  assert.equal(sirius.distance.lightYears, 8.6);
  // Never an editorial selection, never a photographic target.
  for (const star of brightStarCatalogueTargets) {
    assert.equal(star.isBest, false);
    assert.equal(star.isExtended, false);
    assert.equal(star.apparentSizeArcmin, null);
  }
});

test("every star is named in the ten languages, without a gap", () => {
  for (const star of brightStarCatalogueTargets)
    for (const locale of shippedLocales())
      assert.ok(star.stellar.names[locale]?.trim(), `${star.id} ${locale}`);
  const byHip = (hip) =>
    brightStarCatalogueTargets.find((s) => s.stellar.hip === hip).stellar.names;
  // The names the phone's first table carried (English, French, Japanese).
  assert.equal(byHip(91262).fr, "Véga");
  assert.equal(byHip(91262).ja, "ベガ");
  assert.equal(byHip(27989).fr, "Bételgeuse");
  assert.equal(byHip(69673).ja, "アークトゥルス");
  // The usual names of the other languages.
  assert.equal(byHip(32349).es, "Sirio");
  assert.equal(byHip(69673).de, "Arktur");
  assert.equal(byHip(37279).it, "Procione");
  assert.equal(byHip(91262).ru, "Вега");
  assert.equal(byHip(21421)["zh-Hans"], "毕宿五");
  assert.equal(byHip(21421)["zh-Hant"], "畢宿五");
});

test("a star is in the constellation the IAU boundaries say, and the counts add up", () => {
  const counts = new Map();
  for (const star of brightStarCatalogueTargets) {
    assert.equal(
      constellationAt(star.coordinate.ra * 15, star.coordinate.dec),
      star.constellationKey,
      star.id,
    );
    counts.set(
      star.constellationKey,
      (counts.get(star.constellationKey) ?? 0) + 1,
    );
  }
  let withStars = 0;
  for (const constellation of constellationCatalogueTargets) {
    const count = counts.get(constellation.constellationKey) ?? 0;
    assert.equal(constellation.constellationInfo.brightStarCount, count);
    if (count) withStars += 1;
  }
  assert.equal(
    [...counts.values()].reduce((a, b) => a + b, 0),
    92,
  );
  // 39 of the 88 hold at least one star of magnitude 2.5 or brighter.
  assert.equal(withStars, 39);
  assert.equal(counts.get("Ori"), 7);
  assert.equal(counts.get("UMa"), 6);
});

test("88 constellations as catalogue entries, each at the centre of its lines", () => {
  assert.equal(constellationCatalogueTargets.length, 88);
  for (const [index, entry] of constellationCatalogueTargets.entries()) {
    const row = constellationTable[index];
    assert.equal(entry.id, `constellation-${row.key.toLowerCase()}`);
    assert.equal(entry.constellationKey, row.key);
    assert.equal(entry.designation, row.latinName);
    assert.equal(entry.typeKey, constellationType);
    assert.deepEqual(entry.catalogues, ["Constellations"]);
    assert.equal(entry.magnitude, null);
    assert.equal(entry.isBest, false);
    assert.equal(entry.constellationInfo.abbreviation, row.key);
    assert.equal(entry.constellationInfo.genitive, row.genitive);
    assert.equal(entry.constellationInfo.hasDrawing, row.hasDrawing);
    assert.equal(
      entry.constellationInfo.linesRadiusDegrees,
      row.linesRadiusDegrees,
    );
    for (const locale of shippedLocales())
      assert.equal(entry.constellationInfo.names[locale], row.names[locale]);
  }
  const lyra = constellationCatalogueTargets.find(
    (e) => e.constellationKey === "Lyr",
  );
  assert.deepEqual(lyra.aliases, ["Lyra", "Lyr", "Lyre"]);
  assert.equal(lyra.constellationInfo.brightStarCount, 1);
});

test("a bright star enters a plan by hand, in visual mode; a constellation never", () => {
  assert.deepEqual(planUseOfType(brightStarType), {
    planVisualOnly: true,
    planExcluded: false,
  });
  assert.deepEqual(planUseOfType(constellationType), {
    planVisualOnly: false,
    planExcluded: true,
  });
  assert.deepEqual(planUseOfType("Galaxie"), {
    planVisualOnly: false,
    planExcluded: false,
  });
  assert.deepEqual(planUseOfType(null), {
    planVisualOnly: false,
    planExcluded: false,
  });
});

test("the two types and the two catalogues are written in the ten languages", () => {
  assert.ok(objectTypes.includes(brightStarType));
  assert.ok(objectTypes.includes(constellationType));
  for (const locale of shippedLocales()) {
    for (const type of [brightStarType, constellationType]) {
      const label = taxonomyLabel(type, locale);
      assert.ok(label.length > 1, `${type} ${locale}`);
      if (!["fr", "en"].includes(locale))
        assert.notEqual(label, type, `${type} ${locale}`);
    }
    for (const catalogue of ["BrightStars", "Constellations"]) {
      assert.ok(targetCatalogueLabel(catalogue, locale).length > 1);
      assert.ok(
        targetCatalogueDescription(catalogue, locale).length > 10,
        `${catalogue} ${locale}`,
      );
    }
  }
  assert.equal(taxonomyLabel(brightStarType, "en"), "Bright star");
  assert.equal(taxonomyLabel(constellationType, "ja"), "星座");
  assert.equal(targetCatalogueLabel("BrightStars", "fr"), "Étoiles brillantes");
  assert.equal(targetCatalogueLabel("Constellations", "de"), "Sternbilder");
  // The query string names the two types in English.
  assert.equal(queriedObjectType("stellar"), brightStarType);
  assert.equal(queriedObjectType(" Constellation "), constellationType);
  assert.equal(queriedObjectType("Galaxie"), "Galaxie");
  assert.equal(
    queriedObjectType("Région HII / nébuleuse en émission"),
    "Nébuleuse en émission",
  );
  // They close the notoriety order, before a catalogue it does not know.
  assert.deepEqual(targetCatalogueNotorietyOrder.slice(-2), [
    "BrightStars",
    "Constellations",
  ]);
});

test("the revision of the tables is a short fingerprint", () => {
  assert.match(skyTargetsRevision, /^[0-9a-z]{3,8}$/);
});
