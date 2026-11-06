import assert from "node:assert/strict";
import test from "node:test";
import { objectTypeAliases, objectTypes } from "../dist/catalog-taxonomy.js";
import {
  objectPictogramKey,
  objectPictogramKeys,
  objectTypeOf,
} from "../dist/object-pictograms.js";

test("every taxonomy type maps to a figure by kind", () => {
  const expected = {
    Galaxie: "galaxy",
    "Amas ouvert": "open-cluster",
    "Amas globulaire": "globular-cluster",
    "Nébuleuse en émission": "emission-nebula",
    "Nébuleuse en réflexion": "emission-nebula",
    "Rémanent de supernova": "emission-nebula",
    "Nébuleuse planétaire": "planetary-nebula",
    "Nébuleuse sombre": "dark-nebula",
    Planète: "planet",
    "Planète naine": "planet",
    "Système solaire": "planet",
    Lune: "moon",
    Étoile: "star",
    "Étoile brillante": "star",
    Constellation: "star",
    Soleil: "star",
  };
  assert.deepEqual([...objectTypes].sort(), Object.keys(expected).sort());
  for (const [type, key] of Object.entries(expected))
    assert.equal(objectPictogramKey(type), key, type);
});

test("the three aliases read as the emission nebula, the comet is held", () => {
  for (const alias of Object.keys(objectTypeAliases))
    assert.equal(objectPictogramKey(alias), "emission-nebula", alias);
  assert.equal(objectPictogramKey("Comète"), "comet");
});

test("an unknown type and no type give the star, never nothing (MD 2.18)", () => {
  for (const value of [
    "Quasar",
    "",
    "   ",
    null,
    undefined,
    {},
    { typeKey: 3 },
  ])
    assert.equal(objectPictogramKey(value), "star");
  assert.ok(objectPictogramKeys.includes("star"));
});

test("the type of a target is read as the filter families read it", () => {
  assert.equal(
    objectTypeOf({
      typeKey: "Lune",
      skyTarget: { typeKey: "Galaxie", type: "Planète" },
    }),
    "Galaxie",
  );
  assert.equal(
    objectTypeOf({ typeKey: "Lune", skyTarget: { type: "Planète" } }),
    "Lune",
  );
  assert.equal(objectTypeOf({ skyTarget: { type: "Planète" } }), "Planète");
  assert.equal(
    objectPictogramKey({ skyTarget: { typeKey: "Planète", type: "Planet" } }),
    "planet",
  );
});

test("there are ten figures, each used by the mapping", () => {
  assert.equal(objectPictogramKeys.length, 10);
  assert.equal(new Set(objectPictogramKeys).size, 10);
});
