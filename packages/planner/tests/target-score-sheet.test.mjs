import assert from "node:assert/strict";
import test from "node:test";

import {
  targetScoreChip,
  targetScoreName,
  targetScoreNightDate,
  targetScoreSentence,
  targetScoreSheet,
  targetScoreWindAlert,
} from "planner/target-score-sheet.js";
import { targetArcminLabel } from "planner/target-facts-model.js";
import { durationText } from "portal/written-forms.js";

// The words of "Pourquoi cette cible ce soir", against the specified
// French, to the character (its `&#160;` are no-break spaces).

const n = " ";
const fr = { locale: "fr", timeZone: "UTC" };
const row = (key, facts, extra = {}) => ({
  key,
  points: 0,
  max: 10,
  available: true,
  reason: null,
  facts,
  ...extra,
});

const referenceScore = {
  total: 82,
  max: 100,
  verdict: "good",
  estimate: true,
  criteria: [
    row(
      "altitude-window",
      {
        culminationAltitude: 86,
        culminationAt: "2026-10-14T22:40:00.000Z",
        minAltitude: 30,
        usableMinutes: 450,
        fullMinutes: 240,
        mode: "photo",
        eveningBonus: null,
      },
      { points: 30, max: 30 },
    ),
    row(
      "moon",
      {
        illumination: 23,
        separation: 124,
        targetName: "M31",
        state: "sets",
        setAt: "2026-10-14T21:05:00.000Z",
        riseAt: null,
        narrowbandFilter: null,
      },
      { points: 14, max: 15 },
    ),
    row(
      "weather",
      {
        cloudMean: 12,
        humidity: "rising",
        humidityRiseAt: "2026-10-15T01:00:00.000Z",
        dewRisk: null,
        dewRiskFrom: null,
      },
      { points: 17, max: 20 },
    ),
    row("sky-quality", { bortleClass: 3, sqm: 21.4 }, { points: 9 }),
    row(
      "horizon-mask",
      {
        state: "clear",
        clearFrom: "2026-10-14T19:55:00.000Z",
        clearTo: "2026-10-15T03:10:00.000Z",
        maskedMinutes: 0,
        minAltitude: 30,
      },
      { points: 5, max: 5 },
    ),
    row(
      "field-fit",
      {
        fit: "tight",
        occupancy: 94,
        dimension: "width",
        targetName: "M31",
        sizeArcmin: [180, 60],
        fieldWidth: 3.2,
        fieldHeight: 2.1,
        fieldShape: "rectangle",
      },
      { points: 6 },
    ),
    row(
      "wind",
      {
        level: "near",
        subject: "gust",
        value: 27,
        at: "2026-10-15T00:00:00.000Z",
        limit: 30,
        preset: "standard",
      },
      { points: 3 },
    ),
  ],
};
const card = {
  target: {
    designation: "M31",
    title: "Galaxie d’Andromède",
    apparentSizeArcmin: [180, 60],
    integratedMagnitude: 3.4,
    skyTarget: { type: "Galaxie" },
  },
};

test("each sentence of the sample score, to the character", () => {
  const sentences = referenceScore.criteria.map((criterion) =>
    targetScoreSentence(criterion, fr),
  );
  assert.deepEqual(sentences, [
    `Culmine à 86° à 22:40${n}; utilisable 7${n}h${n}30 au-dessus de 30° cette nuit${n}; durée comptée pleine dès 4${n}h en photo.`,
    `Éclairée à 23${n}%, à 124° de M31${n}; couchée dès 21:05.`,
    `Nuages 12${n}% en moyenne${n}; humidité en hausse après 01:00.`,
    "Bortle 3, 21,4 mag/arcsec² (estimation).",
    "Dégagée de 19:55 à 03:10.",
    `M31 (≈${n}180 × 60′) occupe la largeur du champ de 3,2°${n}×${n}2,1°${n}: cadrage serré.`,
    `Rafales jusqu’à 27${n}km/h vers 00:00${n}; votre monture en tolère 30 (réglage Standard).`,
  ]);
});

test("the sheet of the sample score: heading, total, verdict, rows, estimates", () => {
  const sheet = targetScoreSheet({
    score: referenceScore,
    card,
    ...fr,
    placeName: "Camping du Lac Noir",
    date: "2026-10-14",
  });
  // The dialog is "Statistiques de la cible"; the note's old title is the
  // title of its section.
  assert.equal(sheet.title, "Statistiques de la cible");
  assert.equal(sheet.whyTitle, "Pourquoi cette cible ce soir");
  assert.equal(sheet.about, "À propos de la cible");
  assert.equal(sheet.close, "Fermer");
  assert.equal(sheet.name, "M31 · Galaxie d’Andromède");
  // The head's line of facts keeps the type only; the size and the magnitude
  // are tiles of "Caractéristiques".
  assert.equal(sheet.facts, "Galaxie");
  assert.equal(sheet.night, "Camping du Lac Noir · mercredi 14 octobre");
  assert.equal(sheet.total, "82");
  assert.equal(sheet.outOf, `/${n}100`);
  assert.equal(sheet.verdict, "Bonne cible pour ce soir");
  // No « Fenêtre courte » line for a long window.
  assert.equal(sheet.shortWindow, null);
  assert.equal(
    sheet.sum,
    "Somme des sept critères ci-dessous, chacun noté sur son propre barème.",
  );
  assert.equal(sheet.detail, "Détail de la note");
  assert.deepEqual(
    sheet.rows.map((entry) => [entry.label, entry.points]),
    [
      ["Hauteur et durée de fenêtre", `30${n}/${n}30`],
      ["Lune", `14${n}/${n}15`],
      ["Météo", `17${n}/${n}20`],
      ["Qualité du ciel", `9${n}/${n}10`],
      ["Masque d’horizon", `5${n}/${n}5`],
      ["Adéquation au champ de votre instrument", `6${n}/${n}10`],
      ["Vent par rapport à votre matériel", `3${n}/${n}10`],
    ],
  );
  const wind = sheet.rows.at(-1);
  assert.equal(
    wind.alert,
    `Vent${n}: rafales proches de la limite de votre monture`,
  );
  assert.equal(wind.tone, "alert");
  assert.equal(wind.windSettings, "Régler la tolérance au vent");
  assert.equal(wind.percent, 30);
  assert.equal(sheet.estimates, "Ces valeurs sont des estimations.");
});

test("without a forecast: the rows say why they are not scored and the sum says it is brought to 100", () => {
  const unavailable = (key, max) => ({
    key,
    points: 0,
    max,
    available: false,
    reason: "no-forecast",
    facts: {},
  });
  const score = {
    ...referenceScore,
    total: 62,
    max: 80,
    criteria: referenceScore.criteria.map((criterion) =>
      criterion.key === "weather" || criterion.key === "wind"
        ? unavailable(criterion.key, criterion.max)
        : criterion,
    ),
  };
  const sheet = targetScoreSheet({ score, card, ...fr });
  // Always on 100: 62 of the 80 rated points read "78 / 100".
  assert.equal(sheet.total, "78");
  assert.equal(sheet.outOf, `/${n}100`);
  assert.equal(
    sheet.sum,
    `Somme des critères notés ci-dessous, ramenée sur 100${n}; un critère sans donnée n’est pas noté.`,
  );
  const weather = sheet.rows.find((entry) => entry.key === "weather");
  assert.equal(weather.points, "non noté");
  assert.equal(
    weather.sentence,
    `Prévision indisponible pour cette nuit${n}: ce critère n’est pas noté.`,
  );
  const wind = sheet.rows.find((entry) => entry.key === "wind");
  assert.equal(wind.alert, null);
  assert.equal(wind.windSettings, null);
});

test("the other sentences: the Moon up, dew risk, the mask, the field and the sustained wind", () => {
  const say = (key, facts) => targetScoreSentence(row(key, facts), fr);
  assert.equal(
    say("moon", {
      illumination: 80,
      separation: 60,
      targetName: "NGC 7000",
      state: "up",
      narrowbandFilter: "dual",
    }),
    `Éclairée à 80${n}%, à 60° de NGC 7000${n}; levée toute la nuit${n}; votre filtre à bande étroite en divise l’effet par deux.`,
  );
  assert.equal(
    say("weather", {
      cloudMean: 40,
      dewRisk: "high",
      dewRiskFrom: "2026-10-15T02:00:00.000Z",
    }),
    `Nuages 40${n}% en moyenne${n}; risque de rosée élevé dès 02:00.`,
  );
  assert.equal(
    say("horizon-mask", {
      state: "clear",
      clearFrom: "2026-10-14T21:00:00.000Z",
      clearTo: "2026-10-15T01:00:00.000Z",
      maskedMinutes: 40,
      minAltitude: 30,
    }),
    `Dégagée de 21:00 à 01:00${n}; 40${n}min derrière le masque au-dessus de 30°.`,
  );
  assert.equal(
    say("horizon-mask", { state: "below-minimum", minAltitude: 30 }),
    "Ne dépasse pas 30° cette nuit.",
  );
  assert.equal(
    say("field-fit", {
      fit: "small",
      occupancy: 8,
      dimension: "height",
      targetName: "M57",
      sizeArcmin: [1.4, 1],
      fieldWidth: 1.2,
      fieldHeight: 1.2,
      fieldShape: "circle",
    }),
    `M57 (≈${n}1,4 × 1′) n’occupe que 8${n}% de la hauteur du champ de 1,2°${n}: petite dans le champ.`,
  );
  const sustained = row("wind", {
    level: "over",
    subject: "sustained",
    value: 24,
    at: "2026-10-14T22:00:00.000Z",
    limit: 22,
    preset: "custom",
  });
  assert.equal(
    targetScoreSentence(sustained, fr),
    `Vent soutenu jusqu’à 24${n}km/h vers 22:00${n}; votre monture en tolère 22 (réglage Personnalisé).`,
  );
  assert.equal(
    targetScoreWindAlert(sustained, "fr"),
    `Vent${n}: vent soutenu au-delà de la limite de votre monture`,
  );
});

test("the chip: always on 100, a reduced maximum scaled to it", () => {
  assert.deepEqual(
    targetScoreChip({ total: 82, max: 100, verdict: "good" }, "fr"),
    {
      text: "82",
      label: `Score de ce soir${n}: 82 sur 100`,
      verdict: "good",
    },
  );
  // 74 of the 90 points of the rated criteria: "82", never "74/90".
  assert.deepEqual(
    targetScoreChip({ total: 74, max: 90, verdict: "good" }, "fr"),
    {
      text: "82",
      label: `Score de ce soir${n}: 82 sur 100`,
      verdict: "good",
    },
  );
  assert.equal(
    targetScoreChip({ total: 62, max: 80, verdict: "good" }, "fr").text,
    "78",
  );
  assert.equal(targetScoreChip({ total: 0, max: 0 }, "fr"), null);
  assert.equal(targetScoreChip(null, "fr"), null);
});

test("the name: designation then common name, once", () => {
  assert.equal(
    targetScoreName({ designation: "M31", title: "M31 — Galaxie d’Andromède" }),
    "M31 · Galaxie d’Andromède",
  );
  assert.equal(targetScoreName({ designation: "M34", title: "M34" }), "M34");
  assert.equal(targetScoreName({ title: "Comète" }), "Comète");
});

test("durations, sizes and the night's date", () => {
  assert.equal(durationText(450, "fr"), `7${n}h${n}30`);
  assert.equal(durationText(425, "fr"), `7${n}h${n}05`);
  assert.equal(durationText(120, "fr"), `2${n}h`);
  assert.equal(durationText(45, "fr"), `45${n}min`);
  // One writing of a size, in arcminutes, in every place.
  assert.equal(targetArcminLabel([190, 60], "fr"), "190 × 60′");
  assert.equal(targetArcminLabel([20, 10], "en"), "20 × 10′");
  assert.equal(targetArcminLabel([0.4], "fr"), "0,4′");
  assert.equal(targetScoreNightDate("2026-10-14", "fr"), "mercredi 14 octobre");
});

test("English and Japanese say every sentence with their values filled", () => {
  for (const locale of ["en", "ja"]) {
    const sheet = targetScoreSheet({
      score: referenceScore,
      card,
      locale,
      timeZone: "UTC",
      placeName: "Camping du Lac Noir",
      date: "2026-10-14",
    });
    for (const text of [
      sheet.title,
      sheet.verdict,
      sheet.sum,
      sheet.estimates,
      ...sheet.rows.flatMap((entry) => [
        entry.label,
        entry.points,
        entry.sentence,
        entry.alert || "",
      ]),
    ]) {
      assert.doesNotMatch(text, /\{\w+\}/, `${locale}: ${text}`);
      assert.doesNotMatch(text, /undefined|NaN/, `${locale}: ${text}`);
    }
    assert.notEqual(sheet.rows[0].sentence, "");
  }
});

// One more sentence of facts in "Qualité du ciel" when the target's
// window crosses a bright zone.
const brightZone = {
  worstSqm: 19.2,
  share: 0.62,
  from: "2026-10-15T01:00:00.000Z",
  to: "2026-10-15T03:10:00.000Z",
  compass: "NW",
  deduction: 5,
};
const skyRow = (zone) =>
  row("sky-quality", { bortleClass: 3, sqm: 21.4, brightZone: zone });

test("a bright zone crossed adds one sentence of facts after the Bortle one, in the French of the plan", () => {
  assert.equal(
    targetScoreSentence(skyRow(brightZone), fr),
    "Bortle 3, 21,4 mag/arcsec² (estimation). Traverse une zone lumineuse au nord-ouest de 01:00 à 03:10 (jusqu’à 19,2 mag/arcsec²).",
  );
  // No zone (or the fact absent, as on a score from before the grid): the
  // specified sentence, to the character.
  for (const zone of [null, undefined])
    assert.equal(
      targetScoreSentence(skyRow(zone), fr),
      "Bortle 3, 21,4 mag/arcsec² (estimation).",
    );
  // The Bortle-only and sqm-only readings take the sentence too.
  assert.match(
    targetScoreSentence(
      row("sky-quality", { bortleClass: 3, sqm: null, brightZone }),
      fr,
    ),
    /^Bortle 3 \(estimation\)\. Traverse une zone lumineuse/,
  );
});

test("the sentence names the compass point in the language of the layer's description, and English and Japanese say the same", () => {
  const compass = {
    N: ["au nord", "to the north", "北"],
    NE: ["au nord-est", "to the north-east", "北東"],
    E: ["à l’est", "to the east", "東"],
    SE: ["au sud-est", "to the south-east", "南東"],
    S: ["au sud", "to the south", "南"],
    SW: ["au sud-ouest", "to the south-west", "南西"],
    W: ["à l’ouest", "to the west", "西"],
    NW: ["au nord-ouest", "to the north-west", "北西"],
  };
  for (const [point, [french, english, japanese]] of Object.entries(compass)) {
    const zone = { ...brightZone, compass: point };
    assert.match(
      targetScoreSentence(skyRow(zone), fr),
      new RegExp(`zone lumineuse ${french} de 01:00 à 03:10`),
    );
    assert.match(
      targetScoreSentence(skyRow(zone), { locale: "en", timeZone: "UTC" }),
      new RegExp(
        `bright zone ${english} from 01:00 to 03:10 \\(as bright as 19\\.2 mag/arcsec²\\)\\.$`,
      ),
    );
    const ja = targetScoreSentence(skyRow(zone), {
      locale: "ja",
      timeZone: "UTC",
    });
    assert.ok(ja.includes(`${japanese}の明るい空域を01:00〜03:10に`), ja);
    // Japanese runs its sentences together.
    assert.ok(
      ja.startsWith("ボートル3、21.4 mag/arcsec²（推定）。" + japanese),
      ja,
    );
    assert.doesNotMatch(ja, /\{\w+\}|undefined|NaN/);
  }
});

test("the dialog's sheet carries the sentence in the sky quality row, and nowhere else", () => {
  const withZone = {
    ...referenceScore,
    criteria: referenceScore.criteria.map((criterion) =>
      criterion.key === "sky-quality"
        ? { ...criterion, points: 4, facts: { ...criterion.facts, brightZone } }
        : criterion,
    ),
  };
  const sheet = (score) =>
    targetScoreSheet({
      score,
      card,
      locale: "fr",
      timeZone: "UTC",
      placeName: "Camping du Lac Noir",
      date: "2026-10-14",
    });
  const rows = sheet(withZone).rows;
  const plain = sheet(referenceScore).rows;
  assert.match(
    rows.find((entry) => entry.key === "sky-quality").sentence,
    /Traverse une zone lumineuse au nord-ouest/,
  );
  for (const [index, entry] of rows.entries())
    if (entry.key !== "sky-quality")
      assert.equal(entry.sentence, plain[index].sentence);
});

test("reviewed Moon wording separates numeric designations and describes the scoring approximation", () => {
  const expected = {
    "zh-Hans":
      "月面受光比例为80%，与 NGC 7000 的角距为 1°；整夜位于地平线以上；评分计算中，窄带滤光片的作用近似按月光影响减半处理。",
    "zh-Hant":
      "月面受光比例為 80%，與 NGC 7000 的角距為 1°；整夜位於地平線以上；評分計算中，窄頻濾鏡的作用近似以月光影響減半計算。",
    ru: "Освещено 80 % лунного диска, угловое расстояние до NGC 7000 — 1°; над горизонтом всю ночь; при расчёте оценки влияние Луны с узкополосным фильтром приближённо считается вдвое меньшим.",
  };
  for (const [locale, text] of Object.entries(expected))
    assert.equal(
      targetScoreSentence(
        row("moon", {
          illumination: 80,
          separation: 1,
          targetName: "NGC 7000",
          state: "up",
          narrowbandFilter: "ha",
        }),
        { locale, timeZone: "UTC" },
      ),
      text,
    );
});

test("missing horizon data is excluded rather than described as a clear horizon", () => {
  const expected = {
    "zh-Hans": "此地点没有地平遮挡数据：此项不计入评分。",
    "zh-Hant": "此地點沒有地平遮擋資料：此項不納入評分。",
    ru: "Для этого места нет данных о маске горизонта: этот критерий не учитывается при расчёте оценки.",
  };
  for (const [locale, text] of Object.entries(expected))
    assert.equal(
      targetScoreSentence(
        { key: "horizon-mask", available: false, reason: "no-mask" },
        { locale },
      ),
      text,
    );
});

test("wind wording names the configured threshold with units and the score's custom profile", () => {
  const expected = {
    "zh-Hans":
      "22:00前后持续风速最高24 km/h；设定的容许阈值为22 km/h（自定义设置）。",
    "zh-Hant":
      "22:00 前後持續風速最高 24 km/h；設定的容許值為 22 km/h（「自訂」設定）。",
    ru: "Устойчивый ветер до 24 км/ч около 22:00; заданный порог — 22 км/ч (профиль «Пользовательский»).",
  };
  for (const [locale, text] of Object.entries(expected))
    assert.equal(
      targetScoreSentence(
        row("wind", {
          subject: "sustained",
          value: 24,
          at: "2026-10-14T22:00:00.000Z",
          limit: 22,
          preset: "custom",
        }),
        { locale, timeZone: "UTC" },
      ),
      text,
    );
});

test("the sky sentence names a measured or typed value instead of « estimation » (TARGET-STATS-SKY-PLACE-01, Q4)", () => {
  const sourced = (source) =>
    row("sky-quality", { bortleClass: 4, sqm: 21.3, source });
  assert.equal(
    targetScoreSentence(sourced("entered"), fr),
    "Bortle 4, 21,3 mag/arcsec² (valeur saisie).",
  );
  assert.equal(
    targetScoreSentence(sourced("measured"), fr),
    "Bortle 4, 21,3 mag/arcsec² (valeur mesurée).",
  );
  assert.equal(
    targetScoreSentence(sourced(undefined), fr),
    "Bortle 4, 21,3 mag/arcsec² (estimation).",
  );
});

// TONIGHT-SCORE-WINDOW-01: the useful window, the visual evening and the
// short window, in the French of the sheet.
test("the useful window in visual, with the evening bonus", () => {
  const visual = row(
    "altitude-window",
    {
      culminationAltitude: 61,
      culminationAt: "2026-11-03T10:30:00.000Z",
      minAltitude: 30,
      usableMinutes: 154,
      fullMinutes: 120,
      mode: "visual",
      eveningBonus: {
        points: 2,
        minutes: 94,
        from: "2026-11-03T10:17:00.000Z",
        to: "2026-11-03T14:31:00.000Z",
      },
    },
    { points: 25, max: 30 },
  );
  assert.equal(
    targetScoreSentence(visual, fr),
    `Culmine à 61° à 10:30${n}; utilisable 2${n}h${n}34 au-dessus de 30° cette nuit${n}; durée comptée pleine dès 2${n}h en visuel${n}; +2 en début de nuit (utilisable 1${n}h${n}34 entre 10:17 et 14:31).`,
  );
  const never = row("altitude-window", {
    culminationAltitude: 28,
    culminationAt: "2026-11-03T10:30:00.000Z",
    minAltitude: 30,
    usableMinutes: 0,
    fullMinutes: 240,
    mode: "photo",
    eveningBonus: null,
  });
  assert.equal(
    targetScoreSentence(never, fr),
    `Culmine à 28° à 10:30${n}; jamais utilisable au-dessus de 30° cette nuit${n}; durée comptée pleine dès 4${n}h en photo.`,
  );
});

test("« Fenêtre courte »: the line of a capped score, on 100", () => {
  const capped = {
    ...referenceScore,
    total: 44,
    max: 90,
    verdict: "difficult",
    cap: { minutes: 31, limit: 45, ceiling: 44, uncapped: 51 },
  };
  const sheet = targetScoreSheet({ score: capped, card, ...fr });
  assert.equal(
    sheet.shortWindow,
    `Fenêtre courte${n}: 31${n}min (moins de 45${n}min). La note est plafonnée à 49.`,
  );
  assert.equal(sheet.total, "49");
  for (const locale of [
    "en",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const text = targetScoreSheet({
      score: capped,
      card,
      locale,
      timeZone: "UTC",
    }).shortWindow;
    assert.match(text, /31/, locale);
    assert.match(text, /49/, locale);
    assert.doesNotMatch(text, /\{\w+\}|undefined|NaN/, locale);
  }
});
