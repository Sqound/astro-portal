// The zone of a place on the web — the hours of a debriefing in
// the zone of the place, the encadré and the dialog « Choisir le fuseau », the
// editor of a place that reads the table at once, and the words in ten
// languages.
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", null, footer)); export const WebConfirmDialog = () => null;',
)}`;
const EMPTY = "data:text/javascript,export default {};";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css")) return { url: EMPTY, shortCircuit: true };
    if (/dialog\/WebDialog\.js$/.test(specifier))
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const moment = await import("../dist/components/sessions/debrief-moment.js");
const {
  PlaceTimeZoneDialog,
  PlaceTimeZoneNotice,
  selectableTimeZones,
  timeZoneMatches,
  timeZoneOffsetLabel,
} = await import("../dist/components/sessions/PlaceTimeZoneNotice.js");
const { PlannerPlaceDialog } =
  await import("../dist/components/planner/PlannerPlaceDialog.js");

const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&quot;/g, "“")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const plain = (text) => text.replaceAll(" ", " ");

test("the hours of a debriefing are written and read in the zone of the place", () => {
  // 21:08 UTC on 7 October 2026: Paris is on summer time.
  const at = "2026-10-07T21:08:00.000Z";
  assert.equal(moment.clockValue(at), "21:08", "UTC by default");
  assert.equal(moment.clockValue(at, "Europe/Paris"), "23:08");
  assert.equal(moment.clockValue(at, "Asia/Kolkata"), "02:38");
  assert.equal(moment.clockValue(at, "Not/AZone"), "21:08", "UTC when unknown");
  // 23:08 in Paris, on the day of the slot, is 21:08 UTC.
  assert.equal(
    new Date(
      moment.instantOfClock("23:08", at, null, "Europe/Paris"),
    ).toISOString(),
    at,
  );
  // A night crosses midnight in the zone, not in UTC: 01:30 comes after 23:08.
  assert.equal(
    new Date(
      moment.instantOfClock(
        "01:30",
        at,
        moment.instantOfClock("23:08", at, null, "Europe/Paris"),
        "Europe/Paris",
      ),
    ).toISOString(),
    "2026-10-07T23:30:00.000Z",
  );
  const rows = moment.initialMomentRows({
    items: [{ id: "a", targetId: "ngc7000", startMinute: 0, endMinute: 120 }],
    nightStartAt: at,
    timeZone: "Europe/Paris",
  });
  assert.deepEqual(
    [rows[0].start, rows[0].end, rows[0].zone],
    ["23:08", "01:08", "Europe/Paris"],
  );
  assert.deepEqual(moment.rowInstants(rows[0]), {
    startedAt: "2026-10-07T21:08:00.000Z",
    finishedAt: "2026-10-07T23:08:00.000Z",
  });
});

test("the rows are read again in the zone the person chose, the instants kept", () => {
  const at = "2026-10-07T21:08:00.000Z";
  const utc = moment.initialMomentRows({
    items: [{ id: "a", targetId: "ngc7000", startMinute: 0, endMinute: 120 }],
    nightStartAt: at,
  });
  assert.deepEqual([utc[0].start, utc[0].end], ["21:08", "23:08"]);
  const paris = moment.momentRowsInZone(utc, "Europe/Paris");
  assert.deepEqual([paris[0].start, paris[0].end], ["23:08", "01:08"]);
  assert.deepEqual(moment.rowInstants(paris[0]), moment.rowInstants(utc[0]));
  assert.equal(
    moment.momentRowsInZone(utc, "UTC")[0],
    utc[0],
    "the same zone changes nothing",
  );
});

test("the dialog lists the zones with their offset at the date of the session", () => {
  assert.equal(
    timeZoneOffsetLabel("Europe/Paris", new Date("2026-10-15T12:00:00Z")),
    "UTC+2",
  );
  assert.equal(
    timeZoneOffsetLabel("Europe/Paris", new Date("2026-01-15T12:00:00Z")),
    "UTC+1",
  );
  assert.equal(
    timeZoneOffsetLabel("Asia/Kolkata", new Date("2026-06-01T12:00:00Z")),
    "UTC+5:30",
  );
  assert.equal(
    timeZoneOffsetLabel("America/Sao_Paulo", new Date("2026-06-01T12:00:00Z")),
    "UTC−3",
  );
  assert.equal(
    timeZoneOffsetLabel("Africa/Abidjan", new Date("2026-06-01T12:00:00Z")),
    "UTC+0",
  );
  const zones = selectableTimeZones();
  assert.ok(zones.includes("Europe/Paris"));
  assert.equal(zones.at(-1), "UTC");
  assert.ok(!zones.some((zone) => zone.startsWith("Etc/")));
  assert.ok(timeZoneMatches("America/Paramaribo", "par"));
  assert.ok(timeZoneMatches("America/Paramaribo", "america paramaribo"));
  assert.ok(!timeZoneMatches("Europe/Paris", "xyz"));
  const markup = renderToStaticMarkup(
    createElement(PlaceTimeZoneDialog, {
      locale: "fr",
      place: { name: "Maison", latitude: 48.8566, longitude: 2.3522 },
      placeName: "Maison",
      at: new Date("2026-10-15T12:00:00Z"),
      onClose() {},
      onChosen() {},
    }),
  );
  const text = plain(textOf(markup));
  assert.match(text, /Fuseau horaire du lieu/);
  assert.match(
    text,
    /Les heures de « Maison » seront affichées dans ce fuseau, et gardées dans le lieu et dans ses sessions\./,
  );
  // On a machine whose own zone is Paris the row also says « Proposé : … ».
  assert.match(text, /Europe\/Paris(?: Proposé : [^U]*?)? UTC\+2/);
  assert.ok(markup.includes('placeholder="Rechercher un fuseau ou une ville"'));
});

test("the encadré says the last resort in the specified words, with « Choisir le fuseau »", () => {
  const page = plain(
    textOf(
      renderToStaticMarkup(
        createElement(PlaceTimeZoneNotice, {
          locale: "fr",
          place: { name: "Maison" },
          placeName: "Maison",
          at: new Date("2026-10-15T12:00:00Z"),
          onChosen() {},
        }),
      ),
    ),
  );
  assert.equal(
    page,
    "Le fuseau horaire de ce lieu n’a pas pu être déterminé : les heures sont en UTC. Choisir le fuseau",
  );
  const editor = plain(
    textOf(
      renderToStaticMarkup(
        createElement(PlaceTimeZoneNotice, {
          locale: "fr",
          editor: true,
          place: { name: "Maison" },
          placeName: "Maison",
          at: new Date(),
          onChosen() {},
          onRetry() {},
        }),
      ),
    ),
  );
  assert.match(
    editor,
    /^Le fuseau horaire de ce lieu n’a pas pu être déterminé\. Choisissez-le, ou réessayez quand la connexion sera rétablie\. Choisir le fuseau Réessayer$/,
  );
  assert.ok(!/UTC/.test(editor), "the editor shows no hours, so no « UTC »");
});

test("the editor reads the table at once: a place without a zone has one as it opens", () => {
  const markup = renderToStaticMarkup(
    createElement(PlannerPlaceDialog, {
      locale: "fr",
      place: {
        id: "home",
        name: "Maison",
        locality: "Maison",
        latitude: "43.9",
        longitude: "7.4",
        elevation: "310",
      },
      places: [{ id: "home", name: "Maison" }],
      autoLocate: false,
      onSave() {},
      onClose() {},
    }),
  );
  assert.match(textOf(markup), /Europe\/Paris/);
  assert.ok(!markup.includes("session-time-zone-unresolved"));
  assert.ok(!markup.includes("planner-place-save-blocked"));
});
