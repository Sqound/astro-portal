import assert from "node:assert/strict";
import test from "node:test";

import {
  clockText,
  counterText,
  durationText,
  labelValue,
  labelValueSeparator,
  scoreOn100,
} from "../dist/written-forms.js";
import * as format from "../dist/format.js";

const nbsp = "\u00a0";

test("a duration is written « 2 h 30 », « 2 h 05 », « 2 h », « 38 min » in French, with no-break spaces", () => {
  assert.equal(durationText(150, "fr"), `2${nbsp}h${nbsp}30`);
  assert.equal(durationText(125, "fr"), `2${nbsp}h${nbsp}05`);
  assert.equal(durationText(120, "fr"), `2${nbsp}h`);
  assert.equal(durationText(38, "fr"), `38${nbsp}min`);
  assert.equal(durationText(0, "fr"), `0${nbsp}min`);
  // Whole minutes, the seconds rounded half up.
  assert.equal(durationText(89 / 60, "fr"), `1${nbsp}min`);
  assert.equal(durationText(90 / 60, "fr"), `2${nbsp}min`);
});

test("each language writes its own units, Japanese without « 0時間 » nor « 0分 »", () => {
  assert.equal(durationText(150, "en"), `2${nbsp}h${nbsp}30${nbsp}min`);
  assert.equal(durationText(40, "ja"), "40分");
  assert.equal(durationText(180, "ja"), "3時間");
  assert.equal(durationText(160, "ja"), "2時間40分");
  assert.equal(durationText(150, "de"), `2${nbsp}h${nbsp}30${nbsp}min`);
  assert.equal(durationText(150, "pt-BR"), `2${nbsp}h${nbsp}30${nbsp}min`);
  assert.equal(durationText(150, "ru"), `2${nbsp}ч${nbsp}30${nbsp}мин`);
  assert.equal(durationText(150, "zh-Hans"), "2小时30分钟");
  assert.equal(durationText(150, "zh-Hant"), "2小時30分鐘");
});

test("a clock time is « HH:mm » on 24 hours in the place's zone", () => {
  const evening = Date.parse("2026-10-06T21:13:00Z");
  const night = Date.parse("2026-10-07T01:10:00Z");
  assert.equal(clockText(evening, 0), "21:13");
  assert.equal(clockText(night, null), "01:10");
  assert.equal(clockText(night, -300), "20:10");
  assert.equal(clockText(new Date(night), "Asia/Tokyo"), "10:10");
  assert.equal(clockText("2026-10-07T01:10:00Z", "UTC"), "01:10");
  assert.equal(clockText(null, 0), "—");
});

test("the running counter is « H:MM:SS » with unpadded hours", () => {
  assert.equal(counterText(3 * 3600 + 57 * 60), "3:57:00");
  assert.equal(counterText(12 * 60 + 30), "0:12:30");
  assert.equal(counterText(-3), "0:00:00");
});

test("the score is on 100, rounded half up, null without a rated criterion", () => {
  assert.equal(scoreOn100({ total: 74, max: 90 }), 82);
  assert.equal(scoreOn100({ total: 81, max: 100 }), 81);
  assert.equal(scoreOn100({ total: 1, max: 8 }), 13);
  assert.equal(scoreOn100({ total: 3, max: 8 }), 38);
  assert.equal(scoreOn100({ total: 0, max: 0 }), null);
  assert.equal(scoreOn100(null), null);
});

test("the web's old compact « 1h30min » and its unitGap are gone", () => {
  assert.equal(format.unitGap, undefined);
  assert.equal(format.formatDuration(5400, "fr"), `1${nbsp}h${nbsp}30`);
  assert.equal(
    format.formatDuration(5400, "en"),
    `1${nbsp}h${nbsp}30${nbsp}min`,
  );
  assert.equal(
    format.formatDuration(5400, "de"),
    `1${nbsp}h${nbsp}30${nbsp}min`,
  );
  assert.equal(format.formatDuration(0, "fr"), "");
});

test("the integration label keeps the exposure length and writes the total as a duration", () => {
  assert.equal(
    format.integrationLabel(
      { integration: "20 × 120 s", totalSeconds: 2400 },
      "fr",
    ),
    `20 × 120 s (40${nbsp}min)`,
  );
  assert.equal(
    format.integrationLabel({ integration: "20 × 120 s" }, "fr"),
    "20 × 120 s",
  );
});

test("« label : value » takes the separator of the language: French a no-break space before the colon, Japanese and Chinese the full-width colon, the others a colon and a space", () => {
  assert.equal(labelValue("Date", "lundi", "fr"), `Date${nbsp}: lundi`);
  assert.equal(labelValue("Date", "Monday", "en"), "Date: Monday");
  assert.equal(labelValue("日付", "月曜日", "ja"), "日付：月曜日");
  assert.equal(labelValueSeparator("fr-FR"), `${nbsp}: `);
  for (const locale of ["de", "es", "it", "pt-BR", "ru"])
    assert.equal(labelValueSeparator(locale), ": ", locale);
  for (const locale of ["zh-Hans", "zh-Hant", "zh"])
    assert.equal(labelValueSeparator(locale), "：", locale);
});
