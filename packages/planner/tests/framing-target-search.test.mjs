import assert from "node:assert/strict";
import test from "node:test";
import { minimumMapFovDegrees } from "../src/sky-projection.js";
import {
  decodeTargetIndex,
  formatFramingSearchMagnitude,
  formatFramingSearchSize,
  framingSearchFieldDegrees,
  framingSearchHighlight,
  framingSearchLabel,
  framingSearchPath,
  framingSearchQueryReady,
  framingSearchQueryText,
  framingSearchTarget,
  rankFramingSearchResults,
} from "../src/framing-target-search.js";

// A magnifier in the framing editor's map
// controls opens a search over the target catalogue; choosing a result centres
// the map on it and draws it under its own name. The search itself is the
// catalogue's (`GET /v1/target-index`, the compact form of the search the
// target library already runs, case- and accent-insensitive on the server);
// this module is the part around it that a browser needs: the request, the
// reading of the compact rows, the order in which they are listed, the
// highlighted match, the two figures a row prints, and the field a chosen
// target is shown in.

// The shape the target index search answers with, at a few rows' length.
const indexDocument = {
  v: 1,
  revision: "abc",
  total: 42,
  offset: 0,
  limit: 24,
  sort: "planner",
  types: [
    ["Galaxie", "Galaxie"],
    ["Amas ouvert", "Amas ouvert"],
  ],
  constellations: [["Andromède", "Andromède"]],
  fields: [
    "id",
    "designation",
    "name",
    "title",
    "aliases",
    "catalogue",
    "catalogues",
    "ra",
    "dec",
    "sizeArcmin",
    "magnitude",
    "type",
    "constellation",
    "best",
    "extended",
    "premium",
    "sizeLabel",
    "aColumnAFutureVersionAdds",
  ],
  rows: [
    [
      "m31",
      "M31",
      "Galaxie d’Andromède",
      "M31 — Galaxie d’Andromède",
      ["NGC224"],
      "Messier",
      ["Messier", "NGC"],
      0.7123,
      41.2687,
      [190, 60],
      3.4,
      0,
      0,
      1,
      1,
      1,
      "190 × 60′",
      "ignored",
    ],
    [
      "ngc752",
      "NGC752",
      null,
      "NGC752",
      [],
      "NGC",
      ["NGC"],
      1.9,
      37.8,
      [75],
      5.7,
      1,
      0,
      0,
      1,
      0,
      "75′",
      "ignored",
    ],
  ],
};

test("the compact rows are read by column name, and an unknown column is ignored", () => {
  const { total, targets } = decodeTargetIndex(indexDocument);
  assert.equal(total, 42);
  assert.equal(targets.length, 2);
  assert.deepEqual(
    {
      id: targets[0].id,
      designation: targets[0].designation,
      name: targets[0].name,
      aliases: targets[0].aliases,
      ra: targets[0].ra,
      dec: targets[0].dec,
      sizeArcmin: targets[0].sizeArcmin,
      magnitude: targets[0].magnitude,
      typeKey: targets[0].typeKey,
      typeLabel: targets[0].typeLabel,
      constellationKey: targets[0].constellationKey,
      constellationLabel: targets[0].constellationLabel,
    },
    {
      id: "m31",
      designation: "M31",
      name: "Galaxie d’Andromède",
      aliases: ["NGC224"],
      ra: 0.7123,
      dec: 41.2687,
      sizeArcmin: [190, 60],
      magnitude: 3.4,
      typeKey: "Galaxie",
      typeLabel: "Galaxie",
      constellationKey: "Andromède",
      constellationLabel: "Andromède",
    },
  );
  // A target with no known constellation and no common name stays readable.
  assert.equal(targets[1].name, null);
  assert.equal(targets[1].typeLabel, "Amas ouvert");
});

test("a column the answer does not carry is tolerated, a missing answer is empty", () => {
  const partial = decodeTargetIndex({
    fields: ["id", "designation", "ra", "dec"],
    rows: [["x", "X1", 1, 2]],
  });
  assert.equal(partial.targets[0].designation, "X1");
  assert.equal(partial.targets[0].name, null);
  assert.equal(partial.targets[0].typeLabel, null);
  assert.deepEqual(partial.targets[0].aliases, []);
  assert.deepEqual(decodeTargetIndex(null), { total: 0, targets: [] });
  assert.deepEqual(decodeTargetIndex({ rows: "nope" }), {
    total: 0,
    targets: [],
  });
});

test("a decoded row becomes a map target in degrees, with its own name", () => {
  const [m31] = decodeTargetIndex(indexDocument).targets;
  const target = framingSearchTarget(m31);
  assert.equal(target.id, "m31");
  assert.equal(target.designation, "M31");
  assert.equal(target.name, "Galaxie d’Andromède");
  // The catalogue stores hours; the map and every framing use J2000 degrees.
  assert.ok(Math.abs(target.coordinate.ra - 0.7123 * 15) < 1e-9);
  assert.equal(target.coordinate.dec, 41.2687);
  assert.deepEqual(target.apparentSizeArcmin, [190, 60]);
  assert.equal(target.integratedMagnitude, 3.4);
  assert.equal(target.skyTarget.typeKey, "Galaxie");
  assert.equal(target.skyTarget.constellation, "Andromède");
  assert.deepEqual(target.objects, ["M31", "NGC224"]);
  assert.ok(target.tags.includes("messier"));
});

test("a row with no position cannot be centred and is left out", () => {
  const rows = decodeTargetIndex({
    fields: ["id", "designation", "ra", "dec"],
    rows: [
      ["a", "A", null, 10],
      ["b", "B", 1, 2],
    ],
  }).targets;
  assert.equal(framingSearchTarget(rows[0]), null);
  assert.equal(framingSearchTarget(rows[1]).id, "b");
});

test("the label is the designation, then the name when there is one", () => {
  const [m31, ngc752] = decodeTargetIndex(indexDocument).targets;
  assert.equal(
    framingSearchLabel(framingSearchTarget(m31)),
    "M31 · Galaxie d’Andromède",
  );
  assert.equal(framingSearchLabel(framingSearchTarget(ngc752)), "NGC752");
  assert.equal(framingSearchLabel({ designation: "M1", name: "M1" }), "M1");
  assert.equal(framingSearchLabel(null), "");
});

test("the search reuses the catalogue's own route, ranked, with no observer", () => {
  const path = framingSearchPath({
    locale: "fr",
    query: "  Androm ède ",
    limit: 12,
  });
  const url = new URL(path, "https://portal.invalid");
  assert.equal(url.pathname, "/api/v1/target-index");
  assert.equal(url.searchParams.get("q"), "Androm ède");
  assert.equal(url.searchParams.get("locale"), "fr");
  assert.equal(url.searchParams.get("limit"), "12");
  assert.equal(url.searchParams.get("sort"), "planner");
  // A framing is J2000-absolute: no target is left out for being low tonight.
  assert.equal(url.searchParams.has("latitude"), false);
  assert.equal(url.searchParams.has("minimumAltitude"), false);
});

test("a designation is sent in the catalogue's own spelling", () => {
  // The catalogue writes "NGC 7000" and "M31"; the match is on the text as
  // written, so how a visitor types them is put in that spelling first.
  for (const typed of [
    "ngc7000",
    "NGC 7000",
    "Ngc-7000",
    "ngc  07000",
    " NGC.7000 ",
  ])
    assert.equal(framingSearchQueryText(typed), "NGC 7000", typed);
  assert.equal(framingSearchQueryText("ic434"), "IC 434");
  for (const typed of ["m31", "M 31", "m-031", "M31"])
    assert.equal(framingSearchQueryText(typed), "M31", typed);
  // The nebula catalogues' writings too.
  for (const typed of ["sh2-155", "Sh 2-155", "SH2-0155"])
    assert.equal(framingSearchQueryText(typed), "Sh2-155", typed);
  assert.equal(framingSearchQueryText("ldn1622"), "LDN 1622");
  // Anything that is not a whole designation of those families goes as
  // typed, accents and case included: the server ignores both.
  for (const typed of ["andro", "Nébuleuse", "m", "ngc", "sh2", "m31 andro"])
    assert.equal(framingSearchQueryText(typed), typed, typed);
  assert.equal(framingSearchQueryText(null), "");
  assert.equal(
    new URL(
      framingSearchPath({ locale: "en", query: "ngc7000" }),
      "https://portal.invalid",
    ).searchParams.get("q"),
    "NGC 7000",
  );
});

test("a designation typed the short way is highlighted in the catalogue's spelling", () => {
  assert.deepEqual(
    framingSearchHighlight("NGC 7000", framingSearchQueryText("ngc7000")),
    [{ text: "NGC 7000", match: true }],
  );
});

test("a search starts as soon as there is something to search for", () => {
  assert.equal(framingSearchQueryReady(""), false);
  assert.equal(framingSearchQueryReady("   "), false);
  assert.equal(framingSearchQueryReady("m"), true);
  assert.equal(framingSearchQueryReady(" M31 "), true);
  assert.equal(framingSearchQueryReady(undefined), false);
});

function result(designation, { name = null, aliases = [] } = {}) {
  return { id: designation, designation, name, aliases };
}

test("the exact designation comes first, then an alias, then a prefix", () => {
  // The server's own order is by relevance to a planner (brightness, editorial
  // tier); the list puts what the visitor typed ahead of it.
  const results = [
    result("NGC891", { name: "Galaxie de la Cheminée" }),
    result("M310"),
    result("NGC224", { aliases: ["M31"] }),
    result("M31"),
    result("IC1805", { name: "Nébuleuse du Cœur" }),
  ];
  assert.deepEqual(
    rankFramingSearchResults(results, "m31", "fr").map((r) => r.designation),
    ["M31", "NGC224", "M310", "NGC891", "IC1805"],
  );
});

test("the ranking ignores case, accents and the spacing of a designation", () => {
  const results = [result("IC1805"), result("NGC7000"), result("NGC7006")];
  assert.equal(
    rankFramingSearchResults(results, "ngc 7000", "en")[0].designation,
    "NGC7000",
  );
  assert.equal(
    rankFramingSearchResults(results, "NGC-7000", "en")[0].designation,
    "NGC7000",
  );
  const named = [
    result("X1", { name: "Nébuleuse de la Rosette" }),
    result("X2", { name: "Rosette" }),
  ];
  // Both names start with what was typed once accents and case are set aside.
  assert.deepEqual(
    rankFramingSearchResults(named, "NEBULEUSE", "fr").map(
      (r) => r.designation,
    ),
    ["X1", "X2"],
  );
});

test("targets of the same rank keep the server's order", () => {
  const results = [result("B7"), result("B3"), result("B5")];
  assert.deepEqual(
    rankFramingSearchResults(results, "zzz", "en").map((r) => r.designation),
    ["B7", "B3", "B5"],
  );
  assert.deepEqual(rankFramingSearchResults([], "m31", "en"), []);
});

test("the ranking does not modify the list it is given", () => {
  const results = [result("NGC891"), result("M31")];
  const snapshot = results.map((r) => r.designation);
  rankFramingSearchResults(results, "m31", "en");
  assert.deepEqual(
    results.map((r) => r.designation),
    snapshot,
  );
});

test("the match is highlighted whatever the case and the accents", () => {
  assert.deepEqual(framingSearchHighlight("Galaxie d’Andromède", "andro"), [
    { text: "Galaxie d’", match: false },
    { text: "Andro", match: true },
    { text: "mède", match: false },
  ]);
  // The visitor typed no accent and a capital; the text has an accent.
  assert.deepEqual(framingSearchHighlight("Galaxie d’Andromède", "ANDROMEDE"), [
    { text: "Galaxie d’", match: false },
    { text: "Andromède", match: true },
  ]);
  // …and the other way round.
  assert.deepEqual(framingSearchHighlight("Andromede", "andromède"), [
    { text: "Andromede", match: true },
  ]);
});

test("a ligature is matched by its two letters and highlighted whole", () => {
  assert.deepEqual(framingSearchHighlight("Nébuleuse du Cœur", "coeur"), [
    { text: "Nébuleuse du ", match: false },
    { text: "Cœur", match: true },
  ]);
});

test("a decomposed accent stays inside the highlighted text", () => {
  const decomposed = "Andromède";
  assert.deepEqual(framingSearchHighlight(decomposed, "andromede"), [
    { text: decomposed, match: true },
  ]);
});

test("nothing to highlight leaves the text whole", () => {
  assert.deepEqual(framingSearchHighlight("M31", ""), [
    { text: "M31", match: false },
  ]);
  assert.deepEqual(framingSearchHighlight("M31", "   "), [
    { text: "M31", match: false },
  ]);
  assert.deepEqual(framingSearchHighlight("M31", "orion"), [
    { text: "M31", match: false },
  ]);
  assert.deepEqual(framingSearchHighlight("", "m"), []);
  assert.deepEqual(framingSearchHighlight(null, "m"), []);
});

test("the size is printed in arcminutes, or arcseconds below one arcminute", () => {
  assert.equal(formatFramingSearchSize([190, 60], "fr"), "190′ × 60′");
  assert.equal(formatFramingSearchSize([75], "fr"), "75′");
  assert.equal(formatFramingSearchSize([0.53, 0.47], "fr"), "32″ × 28″");
  assert.equal(formatFramingSearchSize([9.5, 6], "fr"), "9,5′ × 6′");
  assert.equal(formatFramingSearchSize([9.5, 6], "en"), "9.5′ × 6′");
  assert.equal(formatFramingSearchSize([2, 0.5], "en"), "2′ × 30″");
});

test("a round object's two equal axes are printed once", () => {
  assert.equal(formatFramingSearchSize([12, 12], "en"), "12′");
  assert.equal(formatFramingSearchSize([12, 12.02], "en"), "12′");
});

test("no size is no text", () => {
  assert.equal(formatFramingSearchSize([], "en"), "");
  assert.equal(formatFramingSearchSize(null, "en"), "");
  assert.equal(formatFramingSearchSize([0, 0], "en"), "");
  assert.equal(formatFramingSearchSize(["x"], "en"), "");
});

test("the magnitude keeps one decimal, in the reader's own format", () => {
  assert.equal(formatFramingSearchMagnitude(3.4, "en"), "3.4");
  assert.equal(formatFramingSearchMagnitude(3.4, "fr"), "3,4");
  assert.equal(formatFramingSearchMagnitude(8, "fr"), "8,0");
  assert.equal(formatFramingSearchMagnitude(null, "fr"), "");
  assert.equal(formatFramingSearchMagnitude(undefined, "en"), "");
  assert.equal(formatFramingSearchMagnitude("x", "en"), "");
});

test("a chosen target is shown in a field that fits it, inside the map's bounds", () => {
  // M31 spans 190′ (3.17°): shown at two and a half times that.
  assert.ok(
    Math.abs(
      framingSearchFieldDegrees({ apparentSizeArcmin: [190, 60] }) -
        (190 / 60) * 2.5,
    ) < 1e-9,
  );
  // A giant never asks for a field beyond the widest the map has.
  assert.equal(framingSearchFieldDegrees({ apparentSizeArcmin: [9000] }), 170);
  // A speck is not shown any closer than the narrowest field.
  assert.equal(
    framingSearchFieldDegrees({ apparentSizeArcmin: [0.2] }),
    minimumMapFovDegrees,
  );
  // With no known size the target is treated as ten arcminutes across.
  assert.ok(Math.abs(framingSearchFieldDegrees({}) - (10 / 60) * 2.5) < 1e-9);
});

test("the frame being placed is never left outside the field", () => {
  // A speck of 30″ on a 1.4° × 0.9° frame: the frame is what the visitor is
  // about to place, so the field keeps it whole with sky around it.
  const field = { width: 1.4, height: 0.9 };
  const fov = framingSearchFieldDegrees(
    { apparentSizeArcmin: [0.5, 0.5] },
    field,
  );
  assert.ok(fov >= 1.4 * 1.5 - 1e-9);
  // A target much larger than the frame still sets the field.
  assert.ok(
    Math.abs(
      framingSearchFieldDegrees({ apparentSizeArcmin: [190, 60] }, field) -
        (190 / 60) * 2.5,
    ) < 1e-9,
  );
  // An unusable frame changes nothing.
  assert.equal(
    framingSearchFieldDegrees({ apparentSizeArcmin: [190, 60] }, null),
    framingSearchFieldDegrees({ apparentSizeArcmin: [190, 60] }, {}),
  );
});

test("framing search uses catalogue suffixes and Barnard spelling", () => {
  assert.equal(framingSearchQueryText("NGC0061A"), "NGC 61A");
  assert.equal(framingSearchQueryText("IC0080 NED01"), "IC 80 NED01");
  assert.equal(framingSearchQueryText("B 033A"), "B33a");
  assert.equal(framingSearchQueryText("My M 31 framing"), "My M 31 framing");
});
