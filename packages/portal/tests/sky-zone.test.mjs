// The zone « Plate solving » of the owner's detail — the switch « Afficher
// le plate solving » outside the four levels, greyed without a solution,
// the line + ⓘ, the link « Résoudre dans Astro Sync », « Résoudre sur ce
// serveur » only where the server announces it — drawn from data with the
// French words, to the character.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { CapturesView, SkySolutionZone, skyFailureLine, skyProvenanceKey } =
  await import("portal/components/manage/CapturesTab.js");
const { capturesCopy, capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");
const { astroSyncDownloadUrl } =
  await import("portal/captures/astro-sync-link.js");
const { captureState } = await import("portal/captures/capture-state.js");

const fr = capturesCopyFor("fr");
const NOW = "2026-10-08T09:00:00.000Z";
const plain = (text) => String(text).replace(/[  ]/g, " ");
const textOf = (markup) =>
  plain(
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " "),
  );

const SOLUTION = {
  schemaVersion: 1,
  source: "astap",
  solverVersion: "ASTAP 2026.10",
  raDeg: 10.68,
  decDeg: 41.27,
  pixelScaleArcsec: 1.9,
  rotationDeg: 0,
  fieldWidthDeg: 3.3,
  fieldHeightDeg: 2.2,
  parity: "normal",
  width: 6248,
  height: 4176,
  solvedAt: "2026-10-06T14:10:00.000Z",
  imageId: "main",
  sha256: "a".repeat(64),
  annotationsEnabled: true,
  createdAt: "2026-10-06T22:11:00.000Z",
  updatedAt: "2026-10-06T22:11:00.000Z",
};

function capture(changes = {}) {
  const checks = {
    automatic: "sky",
    automaticAt: "2026-10-06T22:00:00.000Z",
    team: "approved",
    teamAt: "2026-10-06T23:00:00.000Z",
    teamReason: null,
    reviewRequestedAt: null,
    protectionNoticeAt: null,
    protectionLiftedAt: null,
    removedFromGalleryAt: null,
  };
  return {
    id: "00000000-0000-4000-8000-000000000001",
    originalName: "IMG_2041.tif",
    sha256: "9c1e5a7d".padEnd(64, "0"),
    byteSize: 412 * 1024 * 1024,
    status: "uploaded",
    visibility: "public",
    stage: "finalized",
    checks,
    createdAt: "2026-10-06T21:02:00.000Z",
    state: captureState({ visibility: "public", checks, now: NOW }),
    preview: true,
    thumbnail: true,
    showable: true,
    protectionLapsed: false,
    tags: [],
    targets: [
      {
        id: "ic1396",
        source: "catalogue",
        designation: "IC 1396",
        type: "Nébuleuse",
        aliases: [],
      },
    ],
    detail: {
      targets: [{ id: "ic1396", designation: "IC 1396" }],
      night: "2026-10-05",
      addedAt: "2026-10-06T21:02:00.000Z",
      fileName: "IMG_2041.tif",
      byteSize: 412 * 1024 * 1024,
      equipment: [],
      skyQuality: null,
      place: null,
    },
    variants: [
      {
        id: "main",
        main: true,
        sha256: "9c1e5a7d".padEnd(64, "0"),
        byteSize: 412 * 1024 * 1024,
        originalName: "IMG_2041.tif",
        width: 6248,
        height: 4176,
        source: "astro-sync",
        public: true,
        automaticCheck: "sky",
        createdAt: "2026-10-06T21:02:00.000Z",
        thumbnail: true,
        title: null,
        description: null,
        arrivalRank: 1,
      },
    ],
    ...changes,
  };
}

const view = (one, { serverFeatures, extra = {} } = {}) =>
  renderToStaticMarkup(
    createElement(CapturesView, {
      locale: "fr",
      actions: {},
      timeZone: "Europe/Paris",
      now: new Date(NOW),
      wide: true,
      captureId: one.id,
      state: {
        list: {
          status: "ready",
          page: {
            captures: [one],
            hasMore: false,
            nextBefore: null,
            storage: {
              usedBytes: 412 * 1024 * 1024,
              quotaBytes: 50 * 1024 ** 3,
              maxFileBytes: 1024 ** 3,
              captureCount: 1,
            },
            publishing: {
              available: true,
              warningsCount: 0,
              blockedUntil: null,
            },
            names: { publicNameRefusedAt: null, portalNameRefusedAt: null },
            nights: [],
            places: [],
            ...(serverFeatures ? { serverFeatures } : {}),
          },
        },
        detail: { status: "ready", capture: one },
        touched: new Set(),
        retired: new Set(),
        busy: null,
        dialog: null,
        upload: { busy: false, refusal: null },
        failure: null,
        filter: { chip: "", query: "", oldestFirst: false },
        view: "list",
        ...extra,
      },
    }),
  );

const zone = (markup) =>
  /<section class="capture-zone capture-sky-zone"[\s\S]*?<\/section>/.exec(
    markup,
  )?.[0] ?? "";

test("state 2: the switch off — the solution stays, the gallery no longer offers the annotations", () => {
  const html = zone(
    view(capture({ skySolution: { ...SOLUTION, annotationsEnabled: false } })),
  );
  const text = textOf(html);
  assert.ok(text.includes("Solution de ciel : calculée par Astro Sync le"));
  assert.ok(
    text.includes(
      "La galerie ne propose pas les annotations de cette capture.",
    ),
  );
  assert.doesNotMatch(html, /role="switch"[^>]*checked=""/);
  assert.doesNotMatch(html, /aria-disabled/);
});

test("state 3: no solution — the switch greyed and off, the line + ⓘ, and the link « Résoudre dans Astro Sync » to the download page, no primary", () => {
  const html = zone(view(capture()));
  const text = textOf(html);
  assert.ok(text.includes("Afficher le plate solving"));
  assert.ok(
    text.includes(
      "Cette image n’a pas de solution de ciel : les annotations ne peuvent pas être dessinées.",
    ),
  );
  assert.ok(!text.includes("Solution de ciel :"), "no provenance line");
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /data-greyed/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /disabled=""/);
  // The link: a link (rule 6, rule 7), to the site's download page.
  assert.match(
    html,
    /<a class="btn-link capture-download" href="https:\/\/www\.planastro\.space\/fr\/download\/" target="_blank" rel="noopener noreferrer">[\s\S]*Résoudre dans Astro Sync<\/a>/,
  );
  // Rule 10: no primary in the zone; and no server button here.
  assert.doesNotMatch(html, /btn-primary/);
  assert.doesNotMatch(html, /Résoudre sur ce serveur/);
});

test("the ⓘ of the zone names Astro Sync and its download page only without a solution", () => {
  assert.match(fr.skyInfoNone, /Astro Sync/);
  assert.match(fr.skyInfoNone, /page de téléchargement/);
  assert.doesNotMatch(fr.skyInfo, /Astro Sync/);
});

test("state 4: a private server that has solve-field — « Résoudre sur ce serveur » a tertiary left of the link (two levels, no primary); never without the server feature", () => {
  const html = zone(
    view(capture(), { serverFeatures: { "sky.solve_on_server": true } }),
  );
  assert.match(
    html,
    /<button type="button" class="btn-tertiary">Résoudre sur ce serveur<\/button>/,
  );
  assert.ok(
    html.indexOf("Résoudre sur ce serveur") <
      html.indexOf("Résoudre dans Astro Sync"),
  );
  assert.doesNotMatch(html, /btn-primary/);
  for (const features of [undefined, { "sky.solve_on_server": false }, {}])
    assert.doesNotMatch(
      zone(view(capture(), { serverFeatures: features })),
      /Résoudre sur ce serveur/,
    );
});

test("« Résoudre sur ce serveur », running and failed — the button says it runs and is off; a failure is said in words, never a code", () => {
  const id = capture().id;
  const running = zone(
    view(capture(), {
      serverFeatures: { "sky.solve_on_server": true },
      extra: { solve: { captureId: id, state: "running" } },
    }),
  );
  assert.match(
    running,
    /class="btn-tertiary"[^>]*disabled=""[^>]*>Résolution en cours…/,
  );
  const failed = textOf(
    zone(
      view(capture(), {
        serverFeatures: { "sky.solve_on_server": true },
        extra: {
          solve: { captureId: id, state: "failed", reason: "not_solved" },
        },
      }),
    ),
  );
  assert.ok(
    failed.includes(
      "Trop peu d’étoiles reconnues, ou champ hors des index installés.",
    ),
  );
  assert.ok(!failed.includes("not_solved"));
  // Another capture's failure is not this one's.
  assert.ok(
    !textOf(
      zone(
        view(capture(), {
          extra: {
            solve: {
              captureId: "other",
              state: "failed",
              reason: "not_solved",
            },
          },
        }),
      ),
    ).includes("Trop peu"),
  );
});

test("the words of where a solution comes from, by source", () => {
  assert.equal(skyProvenanceKey("astap"), "astro-sync");
  assert.equal(skyProvenanceKey("header"), "astro-sync");
  assert.equal(skyProvenanceKey("astrometry-net"), "astrometry-net");
  assert.equal(skyProvenanceKey("import"), "import");
  const day = "6 oct. 2026";
  assert.equal(
    plain(fr.skyProvenance["astrometry-net"](day)),
    "Solution de ciel : calculée avec astrometry.net le 6 oct. 2026.",
  );
  assert.equal(
    plain(fr.skyProvenance.import(day)),
    "Solution de ciel : reprise de l’import le 6 oct. 2026.",
  );
  assert.equal(skyFailureLine(fr, "unknown_reason"), fr.skyFailed.other);
});

test("the zone's words exist, whole, in the ten languages; the download page is in the page's language", () => {
  const keys = Object.keys(fr).filter((key) => key.startsWith("sky"));
  assert.ok(keys.length >= 13);
  for (const [locale, copy] of Object.entries(capturesCopy)) {
    for (const key of keys)
      assert.ok(copy[key] !== undefined, `${locale}: ${key}`);
    assert.deepEqual(
      Object.keys(copy.skyFailed),
      Object.keys(fr.skyFailed),
      locale,
    );
    assert.equal(typeof copy.skyProvenance.import("x"), "string", locale);
    assert.equal(
      astroSyncDownloadUrl(locale),
      `https://www.planastro.space/${locale}/download/`,
    );
  }
  assert.equal(
    astroSyncDownloadUrl("xx"),
    "https://www.planastro.space/en/download/",
  );
});

test("the owner's detail is the only place that names Astro Sync and the plate solving of a capture", () => {
  assert.ok(SkySolutionZone);
  const text = textOf(view(capture({ skySolution: SOLUTION })));
  assert.ok(text.includes("Plate solving"));
});
