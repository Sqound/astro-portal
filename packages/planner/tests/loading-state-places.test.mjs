// The places that load — the "Lieux suggérés" list and the detail of a
// suggestion, the ranking, the position of the browser — wait with the
// portal's star and their sentence, centred in a busy status region, and show
// neither once the answer is there.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { SuggestedResults } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { normalizeSuggestedPlace } = await import("planner/places-rules.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const place = normalizeSuggestedPlace({
  id: "osm:node/11",
  name: "Belvédère de la Crête",
  type: "viewpoint",
  latitude: 45.5037,
  longitude: -30,
  skyQuality: { bortle: 2, sqm: 21.7, estimate: true },
});
const reference = {
  name: "Col des Mélèzes",
  latitude: 45.3418,
  longitude: -30,
  placeId: "col",
};
const fresh = {
  page: {
    places: [place],
    truncated: false,
    fetchedAt: "2026-10-01T12:00:00.000Z",
  },
  failure: null,
};
const results = (props) =>
  render(SuggestedResults, {
    locale: "fr",
    outcome: fresh,
    reference,
    referenceSky: { bortle: 4, sqm: 20.9 },
    sort: "darkest",
    mine: [],
    onAdd() {},
    onOpen() {},
    ...props,
  });
const stars = (markup) => (markup.match(/data-brand-loader/g) || []).length;

test("the Suggérés tab waits with the star and its sentence, centred and busy; the star is gone once the places are there", () => {
  const waiting = results({ outcome: null });
  assert.equal(stars(waiting), 1);
  assert.match(
    waiting,
    /<div [^>]*class="loading-state is-block places-loading"[^>]*role="status"[^>]*aria-busy="true"/,
  );
  assert.match(waiting, /data-testid="places-searching"/);
  assert.match(waiting, /Recherche des lieux…/);
  assert.doesNotMatch(waiting, /places-card/);

  const ready = results({});
  assert.equal(stars(ready), 0);
  assert.doesNotMatch(ready, /Recherche des lieux…/);
  assert.doesNotMatch(ready, /aria-busy/);
  assert.match(ready, /places-card/);
});

test("the ranking that waits for the forecasts shows the star, then the ranked rows without it", () => {
  const night = { start: "2026-10-01T20:00:00Z", end: "2026-10-02T05:00:00Z" };
  const waiting = results({ sort: "bestTonight", clouds: null, night });
  assert.equal(stars(waiting), 1);
  assert.match(waiting, /Calcul du classement…/);
  assert.match(waiting, /aria-busy="true"/);
  assert.doesNotMatch(waiting, /places-card/);
  const done = results({
    sort: "bestTonight",
    clouds: { [place.id]: 20 },
    night,
  });
  assert.equal(stars(done), 0);
  assert.doesNotMatch(done, /Calcul du classement…/);
});

test("the detail of a suggestion that is being read shows the star, and not once read", () => {
  const props = {
    locale: "fr",
    mode: "suggested",
    place,
    mine: null,
    reference,
    referenceSky: { bortle: 4, sqm: 20.9 },
    sky: place.sky,
    onBack() {},
    onAdd() {},
  };
  const waiting = render(PlaceDetailView, { ...props, loading: true });
  assert.equal(stars(waiting), 1);
  assert.match(waiting, /Recherche des lieux…/);
  assert.match(waiting, /role="status"/);
  const read = render(PlaceDetailView, { ...props, loading: false });
  assert.equal(stars(read), 0);
  assert.doesNotMatch(read, /Recherche des lieux…/);
});
