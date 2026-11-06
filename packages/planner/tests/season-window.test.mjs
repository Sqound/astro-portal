import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { planNightGeometry } from "../src/planner.js";
import {
  seasonMinimumMinutes,
  seasonNight,
  seasonSubject,
  seasonWindow,
  targetSeason,
  targetSeasonYear,
} from "../src/season-window.js";
import {
  minuteInstant,
  projectMoonSeparation,
  projectNight,
} from "../src/project-night.js";

// The season of a multi-night plan's target, computed on the device. The
// fixture `project-season-window` pins the numbers; these tests pin the rules.

const mask = (west) => ({
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: index * 10 >= 230 && index * 10 <= 320 ? west : 10,
  })),
});
const place = {
  name: "Col des Mélèzes",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
  horizonMask: mask(35),
};
const western = { coordinate: { ra: 310, dec: 20 } };
const ngc7000 = { coordinate: { ra: 314.75, dec: 44.33 } };
const constraints = {
  minAltitude: 30,
  moonSeparationMinimum: 40,
  moonSeparationMinimumByFilter: { "Dual band": 30, L: 90 },
};

const season = (overrides = {}) =>
  seasonWindow({
    target: western,
    place,
    constraints,
    from: "2026-09-28",
    nights: 60,
    ...overrides,
  });

test("one entry per night, consecutive dates from the first night", () => {
  const result = season({ nights: 40 });
  assert.equal(result.nights.length, 40);
  assert.equal(result.nights[0].date, "2026-09-28");
  assert.equal(result.nights[3].date, "2026-10-01");
  assert.equal(result.nights.at(-1).date, "2026-11-06");
  for (const night of result.nights) {
    assert.ok(Number.isInteger(night.usableMinutes));
    assert.ok(Number.isInteger(night.seasonMinutes));
    assert.ok(night.usableMinutes <= night.seasonMinutes);
    assert.ok(night.moonIllumination >= 0 && night.moonIllumination <= 100);
  }
});

test("the season ends on the last night that still reaches the threshold", () => {
  const result = season();
  assert.equal(result.state, "ends");
  const index = result.nights.findIndex(
    (night) => night.date === result.workableUntil,
  );
  assert.ok(result.nights[index].seasonMinutes >= 180);
  for (const night of result.nights.slice(index + 1))
    assert.ok(night.seasonMinutes < 180, `${night.date} is past the season`);
  // 28 September → 11 November: 44 days, six whole weeks.
  assert.equal(result.workableUntil, "2026-11-11");
  assert.equal(result.weeksLeft, 6);
});

test("a full Moon in the middle does not end the season", () => {
  const result = season();
  const moonlit = result.nights.filter(
    (night) => night.usableMinutes < 180 && night.seasonMinutes >= 180,
  );
  assert.ok(moonlit.length > 0, "some nights are lost to the Moon only");
  assert.ok(
    moonlit.every((night) => night.date < result.workableUntil),
    "they come before the end of the season",
  );
});

test("a higher threshold ends the season earlier", () => {
  const strict = season({ minimumMinutes: 240 });
  assert.equal(strict.state, "ends");
  assert.ok(strict.workableUntil < season().workableUntil);
  assert.ok(strict.weeksLeft < season().weeksLeft);
});

test("a target that stays workable continues, one that never is says none", () => {
  const circumpolar = season({ target: ngc7000, nights: 20 });
  assert.equal(circumpolar.state, "continues");
  assert.equal(circumpolar.workableUntil, null);
  assert.equal(circumpolar.weeksLeft, null);
  const southern = season({
    target: { coordinate: { ra: 100, dec: -65 } },
    nights: 5,
  });
  assert.equal(southern.state, "none");
  assert.equal(southern.weeksLeft, 0);
  assert.ok(southern.nights.every((night) => night.seasonMinutes === 0));
});

test("the plan works with the most tolerant of its filters", () => {
  assert.equal(projectMoonSeparation(constraints, ["L"]), 90);
  assert.equal(projectMoonSeparation(constraints, ["L", "Dual band"]), 30);
  assert.equal(projectMoonSeparation(constraints, ["Ha"]), 40);
  assert.equal(projectMoonSeparation(constraints, []), 40);
  assert.equal(projectMoonSeparation({}, []), 25);
  const broadband = season({
    target: ngc7000,
    from: "2026-10-20",
    nights: 8,
    filters: ["L"],
  });
  const both = season({
    target: ngc7000,
    from: "2026-10-20",
    nights: 8,
    filters: ["L", "Dual band"],
  });
  const lostToTheMoon = broadband.nights.filter(
    (night) => night.usableMinutes < night.seasonMinutes,
  );
  assert.ok(lostToTheMoon.length > 0, "broadband loses moonlit nights");
  both.nights.forEach((night, index) =>
    assert.ok(night.usableMinutes >= broadband.nights[index].usableMinutes),
  );
});

test("the horizon mask takes its minutes away", () => {
  const open = season({ place: { ...place, horizonMask: undefined } });
  const masked = season();
  masked.nights.forEach((night, index) =>
    assert.ok(night.seasonMinutes <= open.nights[index].seasonMinutes),
  );
  assert.ok(
    masked.nights.some(
      (night, index) => night.seasonMinutes < open.nights[index].seasonMinutes,
    ),
  );
});

test("nautical darkness gives longer nights than astronomical", () => {
  const astronomical = season({ nights: 5 });
  const nautical = season({ nights: 5, darkness: "nautical" });
  nautical.nights.forEach((night, index) =>
    assert.ok(night.seasonMinutes > astronomical.nights[index].seasonMinutes),
  );
});

test("the night is the planner's own: same start, end and Moon", () => {
  const night = projectNight({
    date: "2026-10-02",
    place,
    plans: [{ key: "a", target: western, constraints }],
  });
  const geometry = planNightGeometry({
    date: "2026-10-02",
    location: { latitude: 45, longitude: -30, elevation: 0, timeZone: "UTC" },
    targets: [],
    planetReferences: { planets: [] },
  });
  assert.equal(night.start, minuteInstant(geometry.start));
  assert.equal(night.end, minuteInstant(geometry.end));
  assert.equal(night.moonIllumination, geometry.moonIllumination);
  assert.deepEqual(night.moonSeries, geometry.moonSeries);
});

test("nothing is computed without a place, a date or a coordinate", () => {
  assert.equal(season({ target: { name: "NGC 7000" } }), null);
  assert.equal(season({ from: "2026-13-45" }), null);
  assert.equal(season({ nights: 0 }), null);
  assert.equal(season({ nights: 367 }), null);
  assert.equal(season({ place: { name: "Nowhere" } }), null);
  assert.equal(seasonWindow(), null);
});

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/fixtures/project-season-window.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

for (const entry of fixture.cases)
  test(`project-season-window/${entry.id}`, () => {
    assert.deepEqual(
      JSON.parse(JSON.stringify(seasonWindow(...entry.args))),
      entry.result,
    );
  });

// The "Saison" card is one component, free, used by the page of a
// multi-night plan (with its link) and the dialog of a target.
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { registerJsx } = await import("../../../tests/helpers/jsx-render.mjs");
await registerJsx();
const { SeasonCard } = await import("planner/components/SeasonCard.js");
const { message, messages } = await import("portal/i18n.js");
const { seasonPlural, seasonRulesLine } =
  await import("planner/season-card-model.js");

const cardText = (props) =>
  renderToStaticMarkup(createElement(SeasonCard, { locale: "fr", ...props }))
    .replaceAll(/<[^>]+>/g, "|")
    .replaceAll(/\|+/g, "|")
    .replaceAll(" ", " ");

test("the « Saison » card: title, reason, chart, legend, then what it was computed from, in this order", () => {
  const result = season();
  const rules = seasonRulesLine("fr", {
    constraints,
    filters: ["Dual band"],
    place,
  });
  const text = cardText({
    season: result,
    rules,
    endCause: "mask",
    trailing: createElement("button", null, "Nuits à venir"),
  });
  const order = [
    "Saison",
    "Nuits à venir",
    "Encore 6 semaines avant que la cible ne soit plus exploitable cette saison",
    "passe derrière votre masque d’horizon",
    "Nouvelle Lune",
    "Pleine Lune",
    "Sous le seuil, hors saison",
    "Calculé sur cet appareil : hauteur d’au moins 30°, masque d’horizon",
  ];
  let from = 0;
  for (const part of order) {
    const at = text.indexOf(part, from);
    assert.ok(at >= from, `${part} after position ${from}`);
    from = at;
  }
  assert.match(text, /Lune à moins de 30° exclue \(Dual band\)/);
  // In the dialog of a target there is no link, and an unknown season says so.
  const bare = cardText({ season: null, rules, trailing: null });
  assert.doesNotMatch(bare, /Nuits à venir/);
  assert.match(bare, /Saison inconnue/);
});

test("the card's words exist in the ten catalogues and its plural follows each language", () => {
  const keys = Object.keys(messages.en).filter((key) =>
    /^multiNight(Season|Chart|Legend|ComputedHere|Rule)/.test(key),
  );
  // The 18 words of the card and the 15 of its year view and its
  // planets.
  assert.ok(keys.length >= 33);
  for (const key of [
    "multiNightSeasonYearExpand",
    "multiNightSeasonYearCollapse",
    "multiNightSeasonYearPeriods",
    "multiNightRulePlanetMoon",
  ])
    assert.ok(keys.includes(key), key);
  for (const [locale, catalogue] of Object.entries(messages))
    for (const key of keys) assert.ok(catalogue[key], `${locale}.${key}`);
  const weeks = (locale, count) =>
    seasonPlural(locale, message(locale, "multiNightSeasonWeeksLeft"), count);
  assert.match(weeks("fr", 0), /^Dernière semaine/);
  assert.match(weeks("fr", 1), /^Encore 1 semaine /);
  assert.match(weeks("fr", 6), /^Encore 6 semaines /);
  assert.match(weeks("ru", 1), /неделя/);
  assert.match(weeks("ru", 2), /недели/);
  assert.match(weeks("ru", 5), /недель/);
  assert.match(weeks("ja", 3), /3週間/);
});

// The card's year, and the planets.
const open = {
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
const andromeda = { coordinate: { ra: 10.68, dec: 41.27 } };
const yearOf = (target, from = "2026-10-14", extra = {}) =>
  targetSeasonYear({ target, place: open, constraints, from, ...extra });

test("the year: twelve months from the first of the month, weeks of seven nights, periods across the new year", () => {
  const year = yearOf(andromeda);
  assert.equal(year.start, "2026-10-01");
  assert.equal(year.days, 365);
  assert.equal(year.today, 13);
  assert.equal(year.weeks.length, 53);
  assert.equal(year.weeks[0].start, "2026-10-01");
  assert.ok(year.weeks.slice(0, -1).every((week) => week.nights === 7));
  assert.equal(year.weeks.at(-1).nights, 1);
  // The mean of the nights, the Moon's limit only in `usableMinutes`.
  for (const week of year.weeks)
    assert.ok(week.usableMinutes <= week.seasonMinutes);
  // A season that goes on from the end of the window to its beginning is one
  // period, its `from` after its `to`.
  assert.equal(year.state, "periods");
  assert.equal(year.periods.length, 1);
  assert.ok(year.periods[0].from > year.periods[0].to);
  // The best week is a full week with the highest mean, never the short last one.
  const best = year.weeks.find((week) => week.start === year.best.start);
  assert.equal(best.nights, 7);
  for (const week of year.weeks)
    assert.ok(week.nights < 7 || week.usableMinutes <= best.usableMinutes);
  // The window of a leap year holds its extra day.
  assert.equal(yearOf(andromeda, "2027-03-05").days, 366);
  // All year, never, nothing to work out.
  assert.equal(
    yearOf({ coordinate: { ra: 37.95, dec: 89.26 } }).state,
    "allYear",
  );
  const never = yearOf({ coordinate: { ra: 100, dec: -65 } });
  assert.deepEqual(
    [never.state, never.periods, never.best],
    ["never", [], null],
  );
  assert.equal(yearOf({ id: "solar-system-sun" }), null);
  assert.equal(yearOf(andromeda, "14/10/2026"), null);
});

test("a planet has its season from its own place of each night, with no Moon limit", () => {
  const jupiter = { id: "solar-system-jupiter" };
  const planetSeason = targetSeason({
    target: jupiter,
    place: open,
    constraints,
    filters: ["L"],
    from: "2026-10-14",
  });
  assert.equal(planetSeason.nights.length, 120);
  for (const night of planetSeason.nights)
    assert.equal(night.usableMinutes, night.seasonMinutes);
  // Computed night by night, not copied: another place, another nights.
  const elsewhere = targetSeason({
    target: jupiter,
    place: { ...open, latitude: -35 },
    constraints,
    from: "2026-10-14",
  });
  assert.notDeepEqual(
    elsewhere.nights.map((night) => night.usableMinutes),
    planetSeason.nights.map((night) => night.usableMinutes),
  );
  // The Sun, the Moon and the Earth have no card.
  for (const id of [
    "solar-system-sun",
    "solar-system-moon",
    "solar-system-earth",
  ])
    assert.equal(
      targetSeason({ target: { id }, place: open, from: "2026-10-14" }),
      null,
    );
});

// Mercury and Venus have their own rule — 10° above
// the mask, the Sun at −6° or lower, half an hour in the evening or in the
// morning (the better of the two). A table of nights, on the night's own side.
// Ten minutes for Mercury (it never gives half an hour from mid
// latitudes), half an hour for Venus.
test("Mercury and Venus: evening star, morning star, conjunction, Mercury at its elongation", () => {
  const equator = { ...open, latitude: 0 };
  const sideOf = (id, date, where) => {
    const subject = seasonSubject({
      target: { id },
      constraints: { minAltitude: 30 },
    });
    const night = projectNight({
      date,
      place: where,
      darkness: subject.darkness,
      plans: [subject.plan],
    });
    const middle = (Date.parse(night.start) + Date.parse(night.end)) / 2;
    const windows = night.plans[0].windows;
    return {
      minutes: seasonNight(subject, night).season,
      evening: windows.some((window) => Date.parse(window.end) <= middle),
      morning: windows.some((window) => Date.parse(window.start) >= middle),
    };
  };
  const threshold = 30;
  // Venus, evening star (June 2026): up after the end of civil twilight.
  const evening = sideOf("solar-system-venus", "2026-05-29", open);
  assert.ok(
    evening.minutes >= threshold && evening.evening && !evening.morning,
  );
  // Venus, morning star (December 2026): up before the morning twilight.
  const morning = sideOf("solar-system-venus", "2026-12-14", open);
  assert.ok(
    morning.minutes >= threshold && morning.morning && !morning.evening,
  );
  // Venus at its inferior conjunction: lost in the Sun's glare.
  const conjunction = sideOf("solar-system-venus", "2026-10-24", open);
  assert.equal(conjunction.minutes, 0);
  // Mercury at its greatest elongation, from the tropics: usable (from 45° N
  // the same elongation leaves less than half an hour).
  const mercury = sideOf("solar-system-mercury", "2027-03-12", equator);
  assert.ok(mercury.minutes >= threshold && mercury.morning);
  assert.ok(
    sideOf("solar-system-mercury", "2027-03-12", open).minutes < threshold,
  );
  // Mercury's own threshold is ten minutes, Venus's half an hour; at 45° N
  // Mercury reaches it in the evening around its May 2027 elongation.
  assert.equal(seasonMinimumMinutes({ id: "solar-system-mercury" }), 10);
  assert.equal(seasonMinimumMinutes({ id: "solar-system-venus" }), 30);
  assert.equal(seasonMinimumMinutes({ id: "solar-system-mars" }), 180);
  const mercuryMay = sideOf("solar-system-mercury", "2027-05-24", open);
  assert.ok(mercuryMay.minutes >= 10 && mercuryMay.evening);
  assert.ok(mercuryMay.minutes < threshold);
  assert.ok(sideOf("solar-system-mercury", "2027-05-18", open).minutes < 10);
  // The plan's minimum height (30°) and the user's darkness setting do not
  // change the rule: 10° and the civil night.
  const subject = seasonSubject({
    target: { id: "solar-system-venus" },
    constraints: { minAltitude: 30 },
    darkness: "astronomical",
  });
  assert.equal(subject.plan.constraints.minAltitude, 10);
  assert.equal(subject.darkness, "civil");
  assert.equal(subject.minimumMinutes, threshold);
  // The horizon mask still counts: a wall at 25° to the west and the east
  // takes the planet's half hour away.
  const wall = {
    enabled: true,
    points: Array.from({ length: 36 }, (_, index) => ({
      azimuth: index * 10,
      altitude: 25,
    })),
  };
  assert.equal(
    sideOf("solar-system-venus", "2026-05-29", { ...open, horizonMask: wall })
      .minutes,
    0,
  );
  // Every other planet keeps the three-hour rule at the plan's height.
  const jupiter = seasonSubject({
    target: { id: "solar-system-jupiter" },
    constraints: { minAltitude: 30 },
    darkness: "astronomical",
  });
  assert.equal(jupiter.plan.constraints.minAltitude, 30);
  assert.equal(jupiter.darkness, "astronomical");
  assert.equal(jupiter.minimumMinutes, 180);
  // The season of Venus asks half an hour a night, not three hours.
  const venusSeason = targetSeason({
    target: { id: "solar-system-venus" },
    place: open,
    constraints,
    from: "2026-11-01",
  });
  assert.equal(venusSeason.state, "ends");
  assert.ok(venusSeason.nights.some((night) => night.seasonMinutes >= 30));
  assert.ok(venusSeason.nights.every((night) => night.seasonMinutes < 180));
});

test("the year view: bars, twelve months, today, the sentence in the ten languages, the planets' rules", async () => {
  const { seasonYearMonths, seasonYearSentence, seasonYearCaption } =
    await import("planner/season-card-model.js");
  const { SeasonYearChart } = await import("planner/components/SeasonCard.js");
  const year = yearOf(andromeda);
  const markup = renderToStaticMarkup(
    createElement(SeasonYearChart, { locale: "fr", year }),
  );
  assert.equal((markup.match(/<rect/g) || []).length, 53);
  assert.equal((markup.match(/multi-night-chart-tick/g) || []).length, 12);
  assert.match(markup, /multi-night-chart-today/);
  assert.match(markup, /Aujourd’hui/);
  assert.match(markup, /seuil 3\sh/u);
  // Mercury and Venus: half an hour, a chart that reaches two hours.
  const venusYear = yearOf({ id: "solar-system-venus" });
  const innerMarkup = renderToStaticMarkup(
    createElement(SeasonYearChart, {
      locale: "fr",
      year: venusYear,
      inner: true,
    }),
  );
  assert.match(innerMarkup, /seuil 30\smin/u);
  assert.match(innerMarkup, /2 h/u);
  assert.doesNotMatch(innerMarkup, /4 h/u);
  // Mercury: ten minutes.
  const mercuryMarkup = renderToStaticMarkup(
    createElement(SeasonYearChart, {
      locale: "fr",
      year: yearOf({ id: "solar-system-mercury" }),
      inner: true,
      minimumMinutes: 10,
    }),
  );
  assert.match(mercuryMarkup, /seuil 10\smin/u);
  assert.match(
    seasonYearSentence("fr", yearOf({ coordinate: { ra: 100, dec: -65 } }), {
      inner: true,
      minimumMinutes: 10,
    }),
    /moins de 10\smin/u,
  );
  // Mercury has usable weeks around its great elongations, from 45° N and
  // from 35° N (the nights' weekly mean must reach ten minutes).
  const workableWeeks = (latitude) =>
    yearOf({ id: "solar-system-mercury" }, "2026-10-14", {
      place: { ...open, latitude },
    }).weeks.filter((week) => week.workable).length;
  assert.equal(workableWeeks(45), 1);
  assert.equal(workableWeeks(35), 3);
  assert.equal(
    seasonYearMonths("fr", year).reduce((sum, month) => sum + month.days, 0),
    365,
  );
  // The sentence names the periods and the best week with the platform's own
  // month names, in every language.
  assert.match(
    seasonYearSentence("fr", year),
    /^Exploitable de .+ à .+\s; le mieux .+\.$/u,
  );
  for (const locale of Object.keys(messages)) {
    const sentence = seasonYearSentence(locale, year);
    assert.ok(
      sentence.length > 20 && !/[{}]/.test(sentence),
      `${locale}: ${sentence}`,
    );
    assert.match(seasonYearCaption(locale, year), /\S/);
  }
  assert.match(seasonYearSentence("ja", year), /月.旬/u);
  assert.match(seasonYearSentence("ru", year), /июля|августа|июня/);
  // Why a year is empty, and the planets' own words.
  const never = yearOf({ coordinate: { ra: 100, dec: -65 } });
  assert.match(seasonYearSentence("fr", never), /^Jamais exploitable/);
  assert.match(
    seasonYearSentence("fr", never, { inner: true }),
    /^Mercure et Vénus/,
  );
  const rules = (id) =>
    seasonRulesLine("fr", {
      constraints: { minAltitude: 30 },
      place: open,
      target: { id },
    });
  assert.equal(
    rules("solar-system-venus"),
    "hauteur d’au moins 10°, Lune sans effet sur une planète, Soleil à −6° ou plus bas et au moins 30\u00a0min le soir ou le matin",
  );
  assert.equal(
    rules("solar-system-mercury"),
    "hauteur d’au moins 10°, Lune sans effet sur une planète, Soleil à −6° ou plus bas et au moins 10\u00a0min le soir ou le matin",
  );
  assert.equal(
    rules("solar-system-mars"),
    "hauteur d’au moins 30°, Lune sans effet sur une planète",
  );
});

test("the card has its « étendre » button only when it is given the year to work out", () => {
  const result = season();
  const rules = seasonRulesLine("fr", { constraints, place });
  const without = cardText({ season: result, rules });
  assert.doesNotMatch(without, /season-year-toggle/);
  const markup = (props) =>
    renderToStaticMarkup(
      createElement(SeasonCard, {
        locale: "fr",
        season: result,
        rules,
        ...props,
      }),
    );
  assert.doesNotMatch(markup({}), /season-year-toggle/);
  const withYear = markup({
    yearArgs: { target: western, place, constraints, from: "2026-09-28" },
  });
  assert.match(withYear, /season-year-toggle/);
  assert.match(withYear, /aria-label="Voir l’année"/);
  assert.match(withYear, /aria-expanded="false"/);
  // Collapsed, the card is the season as before: no year, nothing computed.
  assert.doesNotMatch(withYear, /season-year-chart/);
  assert.match(withYear.replaceAll(/<[^>]+>/g, "|"), /Encore 6 semaines/);
});
