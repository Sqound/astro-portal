import assert from "node:assert/strict";
import test from "node:test";
import {
  climatePeriods,
  climatePlaceKey,
  climateTrendYears,
  placeClimateArchiveUrl,
  reducePlaceClimateTrend,
  roundClimateCoordinate,
} from "../dist/place-climate-trend.js";

// The trend of a place from ten years of the
// archive. Every archive here is synthetic: nothing reaches the network.

const years = { from: 2016, to: 2025 };
const hour = 3600;

/**
 * The archive's hourly series for `span` years, one value of cloud cover (and
 * of rain) a UTC hour, from functions of the date and the UTC hour.
 */
function archive(span, { cloud, rain = () => 0, skip = () => false }) {
  const time = [];
  const cloud_cover = [];
  const precipitation = [];
  for (
    let stamp = Date.UTC(span.from, 0, 1) / 1000;
    stamp < Date.UTC(span.to + 1, 0, 1) / 1000;
    stamp += hour
  ) {
    const date = new Date(stamp * 1000);
    time.push(stamp);
    if (skip(date)) {
      cloud_cover.push(null);
      precipitation.push(null);
    } else {
      cloud_cover.push(cloud(date));
      precipitation.push(rain(date));
    }
  }
  return { time, cloud_cover, precipitation };
}

const month = (date) => date.getUTCMonth() + 1;
// Paris: 48.85° N, 2.35° E.
const paris = { latitude: 48.85, longitude: 2.35 };
const reduce = (hourly, place = paris, span = years) =>
  reducePlaceClimateTrend({
    hourly,
    ...place,
    years: span,
    computedAt: "2026-10-13T00:00:00Z",
  });

test("a place clear in summer and overcast in winter has its best period in summer and its worst in winter", () => {
  const trend = reduce(
    archive(years, {
      cloud: (date) =>
        [6, 7, 8].includes(month(date))
          ? 10
          : [11, 12, 1].includes(month(date))
            ? 90
            : date.getUTCHours() % 2
              ? 20
              : 90,
    }),
  );
  assert.deepEqual(trend.years, [2016, 2025]);
  assert.equal(trend.yearsWithData, 10);
  assert.equal(trend.trend, "distinct");
  assert.equal(trend.computedAt, "2026-10-13T00:00:00.000Z");
  // The best period is inside the clear months and holds all of them.
  assert.deepEqual([trend.best.from, trend.best.to], [6, 8]);
  // The cloud follows the UTC month, the night the local evening: a few
  // hours at the edges of a month belong to the next one.
  assert.ok(trend.best.clearShare > 97, String(trend.best.clearShare));
  assert.deepEqual([trend.worst.from, trend.worst.to], [11, 1]);
  assert.ok(trend.worst.clearShare < 3, String(trend.worst.clearShare));
  assert.equal(trend.months.length, 12);
  const july = trend.months[6];
  assert.equal(july.clearShare, 100);
  assert.equal(july.clearHours, july.nightHours);
  assert.equal(trend.months[11].clearShare, 0);
  assert.equal(trend.months[11].goodNights, 0);
});

test("night hours are the Sun under -12°: December has far more of them than June, whatever the cloud", () => {
  const { months } = reduce(archive(years, { cloud: () => 50 }));
  // At 48.85° N the Sun stays above -12° only for a few hours around midnight
  // in June; ten years of December nights are about 14 h a night.
  const perYear = (index) => months[index].nightHours / 10;
  assert.ok(perYear(11) > 350 && perYear(11) < 450, String(perYear(11)));
  assert.ok(perYear(5) > 100 && perYear(5) < 200, String(perYear(5)));
  assert.ok(months[11].nights >= 300, "ten years of December nights");
});

test("a place with no seasonal difference has no trend: a best period and no worst one", () => {
  // A cloud cover drawn at random for every hour, 30 % of them clear: the
  // same share all year, so the gap between any two windows is far under ten
  // points.
  let seed = 12345;
  const draw = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed >> 8) % 100;
  };
  const trend = reduce(archive(years, { cloud: draw }));
  assert.equal(trend.trend, "flat");
  assert.equal(trend.worst, null);
  assert.ok(trend.best.clearShare > 25 && trend.best.clearShare < 42);
});

test("a gap of ten points is a trend, nine and a half is not", () => {
  const share = (value) => ({
    month: 0,
    nightHours: 1000,
    clearHours: value * 10,
  });
  // January to March 60 %, July to September 50 %, the rest 55 %.
  const build = (low) =>
    Array.from({ length: 12 }, (_, index) => ({
      ...share(
        [0, 1, 2].includes(index) ? 60 : [6, 7, 8].includes(index) ? low : 55,
      ),
      month: index + 1,
    }));
  assert.equal(climatePeriods(build(50), 10).trend, "distinct");
  assert.equal(climatePeriods(build(50.5), 10).trend, "flat");
});

test("the best period prefers the longest window within a point of the best", () => {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    nightHours: 1000,
    // 80 % in June to August, 79.5 % in May, 30 % elsewhere: June to August
    // is the clearest window, May to August is within a point of it and
    // longer.
    clearHours: [5, 6, 7].includes(index) ? 800 : index === 4 ? 795 : 300,
  }));
  const { best, worst } = climatePeriods(months, 10);
  assert.deepEqual([best.from, best.to], [5, 8]);
  assert.ok(best.clearShare > 79 && best.clearShare < 80);
  // Outside the best window: the worst one never overlaps it.
  assert.ok([9, 10, 11, 12, 1, 2, 3, 4].includes(worst.from));
  assert.ok([9, 10, 11, 12, 1, 2, 3, 4].includes(worst.to));
});

test("a window wraps around the year-end", () => {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    nightHours: 1000,
    clearHours: [10, 11, 0].includes(index) ? 800 : 300,
  }));
  const { best } = climatePeriods(months, 10);
  assert.deepEqual([best.from, best.to], [11, 1]);
});

test("rain makes a clear sky an unclear hour", () => {
  const dry = reduce(archive(years, { cloud: () => 0 }));
  const wet = reduce(
    archive(years, {
      cloud: () => 0,
      rain: (date) => (date.getUTCDate() % 2 ? 0.5 : 0),
    }),
  );
  assert.equal(dry.months[0].clearShare, 100);
  assert.ok(wet.months[0].clearShare < 70 && wet.months[0].clearShare > 30);
  // A rain amount under the measured-rain threshold is no rain.
  const drizzle = reduce(archive(years, { cloud: () => 0, rain: () => 0.05 }));
  assert.equal(drizzle.months[0].clearShare, 100);
});

test("the cover limit is 30 % included", () => {
  assert.equal(
    reduce(archive(years, { cloud: () => 30 })).months[0].clearShare,
    100,
  );
  assert.equal(
    reduce(archive(years, { cloud: () => 31 })).months[0].clearShare,
    0,
  );
});

test("a good night has four clear hours, not necessarily consecutive", () => {
  // Alternating clear and cloudy hours: a December night of 14 hours has
  // seven clear ones, a good night although no two follow each other.
  const alternate = reduce(
    archive(years, { cloud: (date) => (date.getUTCHours() % 2 ? 0 : 100) }),
  );
  assert.equal(alternate.months[11].goodNights, alternate.months[11].nights);
  // Clear only two hours a night: never a good one.
  const brief = reduce(
    archive(years, { cloud: (date) => (date.getUTCHours() < 2 ? 0 : 100) }),
  );
  assert.equal(brief.months[11].goodNights, 0);
  assert.ok(brief.months[11].clearHours > 0);
});

test("an incomplete year counts the hours it has and no night it only half knows", () => {
  // The last year is absent from the second half of November: the nights
  // that straddle the gap are not counted as nights, the hours around it are.
  const gap = reduce(
    archive(years, {
      cloud: () => 0,
      skip: (date) =>
        date.getUTCFullYear() === 2025 &&
        date.getUTCMonth() === 10 &&
        date.getUTCDate() >= 16,
    }),
  );
  const full = reduce(archive(years, { cloud: () => 0 }));
  assert.equal(gap.months[10].clearShare, 100);
  assert.ok(gap.months[10].nightHours < full.months[10].nightHours);
  assert.ok(gap.months[10].nights < full.months[10].nights);
  assert.ok(gap.months[10].nights >= 270, "the other nine Novembers and half");
  assert.equal(gap.yearsWithData, 10);
});

test("a series missing most years says nothing", () => {
  const trend = reduce(
    archive(
      { from: 2016, to: 2025 },
      {
        cloud: (date) => (month(date) === 7 ? 0 : 100),
        skip: (date) => date.getUTCFullYear() < 2022,
      },
    ),
  );
  assert.equal(trend.yearsWithData, 4);
  assert.equal(trend.trend, "insufficient");
  assert.equal(trend.best, null);
  assert.equal(trend.worst, null);
  // The months are still reported, for whoever wants the figures.
  assert.ok(trend.months[6].clearShare > 95);
});

test("a polar place has no night hour in its summer and those months are in no window", () => {
  // 70° N: the Sun stays above -12° from the start of April to the start of
  // September (declination over +8°).
  const polar = { latitude: 70, longitude: 25 };
  const trend = reduce(
    archive(years, {
      // Clear in the months with no night, which must change nothing.
      cloud: (date) => ([5, 6, 7].includes(month(date)) ? 0 : 70),
    }),
    polar,
  );
  for (const index of [4, 5, 6]) {
    assert.equal(trend.months[index].nightHours, 0, `month ${index + 1}`);
    assert.equal(trend.months[index].clearShare, null);
    assert.equal(trend.months[index].nights, 0);
  }
  assert.ok(trend.months[11].nightHours > 0);
  assert.ok(trend.months[11].nightHours / 10 > 400, "the polar winter's night");
  for (const period of [trend.best, trend.worst].filter(Boolean)) {
    const covered = [];
    for (let m = period.from; ; m = (m % 12) + 1) {
      covered.push(m);
      if (m === period.to) break;
    }
    assert.ok(
      covered.every((m) => ![5, 6, 7].includes(m)),
      JSON.stringify(period),
    );
  }
});

test("the southern hemisphere has its seasons the other way round", () => {
  const sydney = { latitude: -33.87, longitude: 151.2 };
  const trend = reduce(
    archive(years, {
      cloud: (date) => (month(date) <= 2 || month(date) === 12 ? 90 : 10),
    }),
    sydney,
  );
  // Four months at most: the clearest stretch of the southern autumn.
  assert.equal(trend.best.to - trend.best.from, 3);
  assert.ok(trend.best.from >= 3 && trend.best.to <= 11);
  assert.deepEqual([trend.worst.from, trend.worst.to], [12, 2]);
});

test("the night is anchored on the local solar noon: a place far east counts its evening in the right month", () => {
  // Tokyo at 139.7° E is nine hours and a bit ahead of UTC. Only the
  // 31 October evenings are clear: the night of the 31st spans the UTC
  // 1 November morning and must stay entirely in October.
  const tokyo = { latitude: 35.7, longitude: 139.7 };
  const trend = reduce(
    archive(years, {
      cloud: (date) => {
        const local = new Date(date.getTime() + 139.7 * 240000 - 12 * 3600000);
        return local.getUTCMonth() === 9 && local.getUTCDate() === 31 ? 0 : 100;
      },
    }),
    tokyo,
  );
  assert.equal(trend.months[9].goodNights, 10, "ten 31 October nights");
  assert.equal(trend.months[10].goodNights, 0);
});

test("an ISO text series reads like a Unix one, and a broken place is refused", () => {
  const unix = archive({ from: 2024, to: 2025 }, { cloud: () => 0 });
  const iso = {
    ...unix,
    time: unix.time.map((s) => new Date(s * 1000).toISOString()),
  };
  const span = { from: 2024, to: 2025 };
  assert.deepEqual(
    reduce(iso, paris, span).months,
    reduce(unix, paris, span).months,
  );
  assert.throws(() => reduce(unix, { latitude: "x", longitude: 1 }), TypeError);
  assert.throws(() => reduce(unix, paris, { from: 2025, to: 2024 }), TypeError);
});

test("the ten years are the ten finished before today", () => {
  assert.deepEqual(climateTrendYears(new Date("2026-10-13T12:00:00Z")), {
    from: 2016,
    to: 2025,
  });
  assert.deepEqual(climateTrendYears(new Date("2027-01-01T00:00:00Z")), {
    from: 2017,
    to: 2026,
  });
});

test("coordinates are rounded to 0.05° and share a key", () => {
  assert.equal(roundClimateCoordinate(48.8566), 48.85);
  assert.equal(roundClimateCoordinate(48.8766), 48.9);
  assert.equal(roundClimateCoordinate(-0.01), 0);
  assert.equal(Object.is(roundClimateCoordinate(-0.01), -0), false);
  assert.equal(
    climatePlaceKey({ latitude: 48.8566, longitude: 2.3522 }),
    climatePlaceKey({ latitude: 48.8501, longitude: 2.3499 }),
  );
  assert.equal(
    climatePlaceKey({ latitude: 48.8566, longitude: 2.3522 }),
    "48.85:2.35",
  );
  assert.notEqual(
    climatePlaceKey({ latitude: 48.8566, longitude: 2.3522 }),
    climatePlaceKey({ latitude: 48.9166, longitude: 2.3522 }),
  );
});

test("the archive is asked once, for the ten years, with the two series that are needed", () => {
  const url = new URL(
    placeClimateArchiveUrl({ latitude: 48.85, longitude: 2.35, years }),
  );
  assert.equal(url.hostname, "archive-api.open-meteo.com");
  assert.equal(url.searchParams.get("start_date"), "2016-01-01");
  assert.equal(url.searchParams.get("end_date"), "2025-12-31");
  assert.equal(url.searchParams.get("hourly"), "cloud_cover,precipitation");
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
});
