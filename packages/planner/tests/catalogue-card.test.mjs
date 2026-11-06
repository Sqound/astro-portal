import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "portal/locales.js";
import {
  catalogueCoordinateLine,
  catalogueCountLine,
} from "../src/target-facts-model.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { knowledgeRouteIdOf, knowledgeRouteUrl } =
  await import("planner/components/TargetKnowledgeDetails.js");

// The catalogue of the web planner: the position of a card, the count of its
// list and the page its "i" reads.

const plain = (text) => text.replace(/ | /g, " ");

test("a card's right ascension is read in hours: M31 at 0h 42m, never 0h 02m", () => {
  // The library's full view gives hours (`GET /api/target-library`); the card
  // used to give them to a formatter of degrees, and divided them by 15.
  assert.equal(
    catalogueCoordinateLine({ coordinate: { ra: 0.7123, dec: 41.2691 } }),
    "0h 42m 44s · +41° 16′ 09″",
  );
  assert.equal(
    catalogueCoordinateLine({ coordinate: { ra: 5.5755, dec: 22.0145 } }),
    "5h 34m 32s · +22° 00′ 52″",
  );
  assert.equal(
    catalogueCoordinateLine({ coordinate: { ra: 21.0756, dec: 50.4 } }),
    "21h 04m 32s · +50° 24′ 00″",
  );
  assert.equal(
    catalogueCoordinateLine({ coordinate: { ra: 0.7123, dec: -4.5 } }),
    "0h 42m 44s · −4° 30′ 00″",
  );
  assert.equal(catalogueCoordinateLine({ coordinate: { ra: 1 } }), null);
  assert.equal(catalogueCoordinateLine({}), null);
});

test("the count agrees with its noun: « 1 objet », « 2 objets », in every language", () => {
  const lines = {};
  for (const locale of shippedLocales())
    lines[locale] = [0, 1, 2, 5, 21, 22].map((count) =>
      plain(catalogueCountLine(locale, count)),
    );
  assert.deepEqual(lines.fr, [
    "0 objet dans le catalogue local",
    "1 objet dans le catalogue local",
    "2 objets dans le catalogue local",
    "5 objets dans le catalogue local",
    "21 objets dans le catalogue local",
    "22 objets dans le catalogue local",
  ]);
  assert.equal(lines.en[1], "1 object in the local catalogue");
  assert.equal(lines.en[2], "2 objects in the local catalogue");
  assert.equal(lines.de[1], "1 Objekt im lokalen Katalog");
  assert.equal(lines.es[1], "1 objeto en el catálogo local");
  assert.equal(lines.it[1], "1 oggetto nel catalogo locale");
  assert.equal(lines["pt-BR"][1], "1 objeto no catálogo local");
  // Russian: one, few, many.
  assert.deepEqual(lines.ru.slice(1), [
    "1 объект в локальном каталоге",
    "2 объекта в локальном каталоге",
    "5 объектов в локальном каталоге",
    "21 объект в локальном каталоге",
    "22 объекта в локальном каталоге",
  ]);
  // Japanese and Chinese do not agree; every language answers for 0, 1 and 2.
  for (const locale of shippedLocales())
    for (const line of lines[locale]) assert.ok(line.trim().length > 3, locale);
  assert.equal(lines.ja[1], lines.ja[2].replace("2", "1"));
});

test("a card that carries no text reads its page from the planner's route, once opened", () => {
  // A listing row of a tier C target: no story, no sections.
  const tierC = { id: "ldn-1018", designation: "LDN 1018", story: "" };
  assert.equal(knowledgeRouteIdOf(tierC), "ldn-1018");
  assert.equal(
    knowledgeRouteUrl("ldn-1018", "fr"),
    "/api/v1/targets/ldn-1018?locale=fr",
  );
  // A page in hand is shown as it is.
  assert.equal(
    knowledgeRouteIdOf({ id: "openngc-ngc0224", story: "Une galaxie." }),
    null,
  );
  assert.equal(
    knowledgeRouteIdOf({
      id: "x",
      storySections: [{ heading: "Titre", paragraphs: ["Un texte."] }],
    }),
    null,
  );
  // A target that names its knowledge reads that one.
  assert.equal(
    knowledgeRouteIdOf({ id: "plan-item", knowledge: { id: "messier-m42" } }),
    "messier-m42",
  );
  // A framing or a personal point is no entry of the library.
  assert.equal(
    knowledgeRouteIdOf({ id: "f1", plannerSource: "framing" }),
    null,
  );
  assert.equal(knowledgeRouteIdOf(null), null);
});
