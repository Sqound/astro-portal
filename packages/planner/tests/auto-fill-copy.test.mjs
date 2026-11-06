import assert from "node:assert/strict";
import test from "node:test";
import {
  autoFillAppliedNotice,
  autoFillFreeLine,
  autoFillItemReason,
  autoFillTargetName,
} from "../src/auto-fill-copy.js";
const iso = (ms) => new Date(ms).toISOString();
const at = (hours, minutes) =>
  Date.UTC(2026, 9, hours < 19 ? 15 : 14, hours, minutes);
const proposal = { free: [{ start: iso(at(2, 50)), end: iso(at(4, 31)) }] };
test("each reason of a free slot has its sentence, in every language", () => {
  const kinds = {
    dew: [
      "rien de satisfaisant, rosée probable",
      "nothing satisfactory, dew likely",
    ],
    clouds: ["nuages", "clouds"],
    moon: ["Lune levée", "Moon up"],
    "no-target": [
      "aucune cible au-dessus de la hauteur minimale",
      "no target above the minimum altitude",
    ],
    nothing: ["rien de satisfaisant", "nothing satisfactory"],
    limit: ["6 cibles au maximum", "6 targets at most"],
    short: ["créneau trop court pour une cible", "slot too short for a target"],
  };
  for (const [kind, [fr, en]] of Object.entries(kinds)) {
    const slot = { ...proposal.free[0], reason: { kind } };
    assert.ok(
      autoFillFreeLine(slot, { locale: "fr", timeZone: "UTC" }).endsWith(fr),
    );
    assert.ok(
      autoFillFreeLine(slot, { locale: "en", timeZone: "UTC" }).endsWith(en),
    );
    assert.ok(
      autoFillFreeLine(slot, { locale: "ja", timeZone: "UTC" }).length > 12,
    );
  }
});

test("the reasons of a target in English and Japanese say the same thing", () => {
  const meridian = { kind: "meridian", time: iso(at(22, 40)) };
  assert.equal(
    autoFillItemReason(meridian, { locale: "en", timeZone: "UTC" }),
    "Crosses the meridian at 22:40",
  );
  assert.match(
    autoFillItemReason(meridian, { locale: "ja", timeZone: "UTC" }),
    /22:40/,
  );
  const dew = { kind: "culmination-before-dew", time: iso(at(1, 44)) };
  assert.equal(
    autoFillItemReason(dew, { locale: "en", timeZone: "UTC" }),
    "Highest at 01:44, before the dew",
  );
  assert.equal(
    autoFillItemReason(
      { kind: "best-window", altitude: 52 },
      { locale: "fr", timeZone: "UTC" },
    ),
    "Meilleur créneau libre, jusqu’à 52°",
  );
});

test("the name of a target is its designation, then its common name once", () => {
  assert.deepEqual(
    autoFillTargetName({
      designation: "IC 1396",
      title: "IC 1396 — Trompe d’éléphant",
    }),
    { designation: "IC 1396", common: "Trompe d’éléphant" },
  );
  assert.deepEqual(autoFillTargetName({ id: "x1", title: "" }), {
    designation: "x1",
    common: "",
  });
});

test("the applied notice takes the singular", () => {
  assert.equal(autoFillAppliedNotice(1, "fr"), "1 cible ajoutée au plan.");
  assert.equal(autoFillAppliedNotice(3, "fr"), "3 cibles ajoutées au plan.");
});
