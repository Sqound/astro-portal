import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { planNightWindow } from "planner/planner.js";
import {
  planTimeLeft,
  planTimeLeftHeadline,
  planTimeLeftText,
} from "planner/plan-time-left.js";
import { clock } from "planner/wind-section.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// On the web, the time left before a plan's night, the rows of "détails" on
// the cards of the library, and the library's three-icon control in place of the
// two-state icon. The switch's tag is in projects-extension-point.

await registerJsx();
const { PlanDetailsRows, planDetailsWords } =
  await import("planner/components/PlanDetailsRows.js");

const place = {
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "Atlantic/Azores",
};
const afternoon = Date.parse("2026-10-14T17:00:00Z");
const plain = (value) => String(value).replace(/[\u00a0\u202f]/g, " ");

test("the time left — on the day to the start of the astronomical night, then in days from the night the place is in, nothing once begun or over", () => {
  const start = Date.parse(
    planNightWindow({ date: "2026-10-14" }, place).darkStart,
  );
  const today = planTimeLeft({
    date: "2026-10-14",
    location: place,
    now: afternoon,
  });
  assert.deepEqual(today, {
    kind: "startsIn",
    minutes: Math.floor((start - afternoon) / 60000),
  });
  assert.match(
    plain(planTimeLeftText("fr", today)),
    /^commence dans \d+ h \d+$/,
  );
  assert.equal(
    plain(planTimeLeftText("fr", { kind: "startsIn", minutes: 99 })),
    "commence dans 1 h 39",
  );
  assert.deepEqual(
    planTimeLeft({ date: "2026-10-14", location: place, now: start + 60000 }),
    { kind: "started" },
  );
  assert.equal(planTimeLeftHeadline("fr", { kind: "started" }), "Ce soir");
  const on = (date, now = afternoon) =>
    planTimeLeft({ date, location: place, now });
  assert.deepEqual(on("2026-10-17"), { kind: "inDays", days: 3 });
  assert.deepEqual(on("2026-11-10"), { kind: "inDays", days: 27 });
  // 01:00 at the place on the 15th: still the night of the 14th.
  assert.deepEqual(on("2026-10-17", Date.parse("2026-10-15T03:00:00Z")), {
    kind: "inDays",
    days: 3,
  });
  assert.equal(on("2026-10-02"), null);
  assert.equal(on("someday"), null);
  assert.equal(planTimeLeftText("fr", on("2026-10-17")), "dans 3 jours");
  assert.equal(planTimeLeftText("fr", on("2026-10-15")), "dans 1 jour");
  assert.equal(planTimeLeftHeadline("fr", on("2026-10-17")), "Dans 3 jours");
  assert.equal(
    plain(planTimeLeftHeadline("fr", { kind: "startsIn", minutes: 99 })),
    "Ce soir · commence dans 1 h 39",
  );
  assert.equal(planTimeLeftText("en", on("2026-10-17")), "in 3 days");
  assert.equal(planTimeLeftText("ja", on("2026-10-17")), "3日後");
  for (const locale of ["de", "es", "it", "pt-BR", "ru", "zh-Hans", "zh-Hant"])
    assert.ok(
      !/[{}]/.test(
        planTimeLeftText(locale, on("2026-10-17")) +
          planTimeLeftHeadline(locale, { kind: "startsIn", minutes: 99 }),
      ),
      locale,
    );
});

const target = (id, objects) => ({ id, objects, name: objects[0] });
const plan = (count) => ({
  id: "plan-lac",
  name: "Nuit d’octobre au lac",
  date: "2026-10-14",
  location: { ...place, skyEntered: { bortleClass: 3 } },
  equipment: { mode: "imaging" },
  items: Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    startMinute: 400 - index * 50,
    endMinute: 440 - index * 50,
    target: target(`t${index}`, [`M${index + 1}`]),
  })),
});

test("the words of « détails » — the place and its Bortle, the rig and the mode, the hours and the count, the targets in the order of the night, « +N » beyond six", () => {
  const words = planDetailsWords("fr", plan(7), {
    clock: (value) => clock(value, "fr", place.timeZone),
    rigName: "Lunette 72 mm · caméra couleur",
  });
  assert.equal(words.place, "Camping du Lac Noir · Bortle 3");
  assert.equal(words.rig, "Lunette 72 mm · caméra couleur · photo");
  assert.match(words.hours, /^\d\d:\d\d → \d\d:\d\d · 7 cibles planifiées$/);
  // The latest item starts first in the night.
  assert.deepEqual(
    words.items.map((item) => item.designation),
    ["M7", "M6", "M5", "M4", "M3", "M2"],
  );
  assert.equal(words.more, "+1");
  const visual = planDetailsWords("fr", {
    ...plan(1),
    equipment: { mode: "visual" },
  });
  assert.equal(visual.rig, "Matériel à choisir · visuel");
  assert.equal(visual.more, null);
  const bare = planDetailsWords("fr", {
    ...plan(0),
    location: null,
    equipment: null,
  });
  assert.equal(bare.place, null);
  assert.equal(bare.rig, null);
  assert.equal(bare.hours, "0 cibles planifiées");
});

test("the rows render with their icons and the thumbnails are named for a screen reader", () => {
  const html = renderToStaticMarkup(
    createElement(PlanDetailsRows, {
      locale: "fr",
      plan: plan(2),
      rigName: "Lunette 72 mm",
      clock: (value) => clock(value, "fr", place.timeZone),
    }),
  );
  for (const row of ["place", "rig", "hours"])
    assert.match(html, new RegExp(`data-row="${row}"`));
  assert.match(
    html,
    /<ul class="plan-details-targets" aria-label="Cibles du plan">/,
  );
  assert.match(html, /<li aria-label="M2">/);
  assert.ok(!/plan-details-more/.test(html));
  assert.ok(!/btn-(link|tertiary|secondary|primary)/.test(html));
});

test("the library carries the three-icon control named for the plans, « détails » and the time left; the two-state icon is gone", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const frise = readFileSync(
    new URL("../src/components/PlanFrise.js", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /<PlanTargetViewButtons\s+locale=\{locale\}\s+plans\s+view=\{targetView\}/,
  );
  assert.match(page, /<PlanDetailsRows/);
  assert.match(page, /planTimeLeftText\(\s*locale,\s*planTimeLeft\(/);
  assert.ok(!/PlanFriseToggle|usePlanFriseView/.test(page + frise));
});
