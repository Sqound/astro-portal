import assert from "node:assert/strict";
import test from "node:test";
import {
  SUGGEST_TIME_GAP,
  suggestVisibleTicks,
} from "../src/suggest-dialog-model.js";

// The mini-frise of « Suggérer les meilleures cibles » writes the times under
// the night; when a single target fits, its end and the end of the window are
// a few minutes apart and their two labels used to print on top of each other
// ("04:0004:14").
const frame = (startMinute, endMinute) => {
  const scale = 312 / (endMinute - startMinute);
  return (tick) =>
    Math.max(22, Math.min(302, 6 + (tick.minute - startMinute) * scale));
};
const tick = (minute, label) => ({ minute, label });

test("two ends a few minutes apart: the last of the night is written, the one before it gives way", () => {
  const night = [
    tick(0, "20:26"),
    tick(120, "22:26"),
    tick(213, "04:00"),
    tick(227, "04:14"),
  ];
  const kept = suggestVisibleTicks(night, frame(0, 227));
  assert.deepEqual(
    kept.map((entry) => entry.label),
    ["20:26", "22:26", "04:14"],
  );
});

test("no two written times are closer than the gap, whatever the ticks", () => {
  const at = frame(0, 480);
  for (const spacing of [3, 7, 14, 30, 45, 90]) {
    const ticks = [tick(0, "a")];
    for (let minute = spacing; minute < 480; minute += spacing)
      ticks.push(tick(minute, String(minute)));
    ticks.push(tick(480, "z"));
    const kept = suggestVisibleTicks(ticks, at);
    assert.equal(kept[0].label, "a", `${spacing}: the start stays`);
    assert.equal(kept.at(-1).label, "z", `${spacing}: the end stays`);
    for (let index = 1; index < kept.length; index += 1)
      assert.ok(
        at(kept[index]) - at(kept[index - 1]) >= SUGGEST_TIME_GAP - 1e-9,
        `${spacing}: ${kept[index - 1].label} / ${kept[index].label}`,
      );
  }
});

test("a night with two ticks keeps both, and one with none keeps none", () => {
  const at = frame(0, 100);
  assert.equal(
    suggestVisibleTicks([tick(0, "a"), tick(100, "b")], at).length,
    2,
  );
  assert.deepEqual(suggestVisibleTicks([], at), []);
});
