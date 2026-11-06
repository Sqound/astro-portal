import assert from "node:assert/strict";
import test from "node:test";

import {
  baseMapFromNaturalEarth,
  baseMapLanguages,
  clipLine,
  clipRing,
  encodeBaseMap,
} from "../src/offline-pack/base-map.js";
import { shippedLocales } from "astro-contracts/locales";

// The Natural Earth background of the light map
// is cut along a grid (a map draws only the pieces of its view), and its
// places keep only the names that differ from the English one.

test("a ring and a line are cut to a box; nothing outside it is kept", () => {
  const ring = [
    [-5, -5],
    [15, -5],
    [15, 15],
    [-5, 15],
  ];
  const cut = clipRing(ring, 0, 0, 10, 10);
  for (const [x, y] of cut) {
    assert.ok(x >= 0 && x <= 10 && y >= 0 && y <= 10, `${x}, ${y}`);
  }
  assert.equal(cut.length, 4, "the box itself");
  const pieces = clipLine(
    [
      [-5, 5],
      [5, 5],
      [15, 5],
      [15, 20],
      [5, 8],
    ],
    0,
    0,
    10,
    10,
  );
  assert.equal(pieces.length, 2, "it leaves the box and comes back");
  assert.deepEqual(pieces[0][0], [0, 5]);
  assert.deepEqual(pieces[0].at(-1), [10, 5]);
  assert.deepEqual(pieces[1].at(-1), [5, 8]);
});

test("the background: land cut along the grid, lakes whole, places with their names, the PNEB header", () => {
  const background = baseMapFromNaturalEarth(
    {
      land: {
        features: [
          {
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-35, 40],
                  [-15, 40],
                  [-15, 55],
                  [-35, 55],
                  [-35, 40],
                ],
              ],
            },
          },
        ],
      },
      lakes: { features: [] },
      coastline: { features: [] },
      borders: { features: [] },
      places: {
        features: [
          {
            geometry: { type: "Point", coordinates: [-30.2, 45.1] },
            properties: {
              NAME_EN: "Port Mélèze",
              NAME_FR: "Port Mélèze",
              NAME_JA: "メレーズ港",
              MIN_ZOOM: 5,
            },
          },
        ],
      },
    },
    { cellDegrees: 10 },
  );
  // 20° × 15° over a 10° grid: three columns (−40, −30, −20) by two rows.
  assert.equal(background.polygons.length, 6);
  assert.deepEqual(background.places[0].names, [
    [0, "Port Mélèze"],
    [baseMapLanguages().indexOf("ja"), "メレーズ港"],
  ]);
  const bytes = encodeBaseMap(background);
  assert.equal(bytes.toString("ascii", 0, 4), "PNEB");
  assert.equal(bytes.readUInt16LE(4), 1);
  assert.equal(bytes.readUInt16LE(6), 10);
  assert.equal(bytes.readUInt32LE(8), 6);
  assert.equal(bytes.readUInt32LE(16), 1);
  assert.equal(bytes.readUInt32LE(20), baseMapLanguages().length);
});

// The languages come from the locale registry, never from a list of the
// builder: the header carries them in that order, and the property of a
// language is derived from its registry entry.
test("the background's languages are the registry's, written in its header", () => {
  const languages = baseMapLanguages();
  assert.equal(languages[0], "en");
  assert.deepEqual([...languages].sort(), [...shippedLocales()].sort());
  const background = baseMapFromNaturalEarth(
    {
      land: { features: [] },
      lakes: { features: [] },
      coastline: { features: [] },
      borders: { features: [] },
      places: {
        features: [
          {
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: {
              NAME_EN: "Kyoto",
              NAME_ZH: "京都",
              NAME_ZHT: "京都市",
              MIN_ZOOM: 5,
            },
          },
        ],
      },
    },
    { cellDegrees: 10 },
  );
  assert.deepEqual(background.places[0].names, [
    [0, "Kyoto"],
    [languages.indexOf("zh-Hans"), "京都"],
    [languages.indexOf("zh-Hant"), "京都市"],
  ]);
  const bytes = encodeBaseMap(background);
  let offset = 24;
  const tags = [];
  for (let index = 0; index < languages.length; index += 1) {
    tags.push(bytes.toString("ascii", offset + 1, offset + 1 + bytes[offset]));
    offset += 1 + bytes[offset];
  }
  assert.deepEqual(tags, languages);
});
