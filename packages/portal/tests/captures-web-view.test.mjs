// « Mon espace › Captures » drawn from
// data — the list, the space line, the add box, the owner's detail and the
// main image and the variants — with
// the specified French words, to the character (no-break spaces compared as
// plain ones).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const {
  CapturesView,
  CaptureDraftBanner,
  CapturePills,
  CaptureStateNotices,
  DeleteCaptureBody,
  PublishDialogBody,
  autoReasonWords,
  captureTitle,
  footMayStick,
  publicSinceLine,
  uploadRefusalWords,
} = await import("portal/components/manage/CapturesTab.js");
const {
  CaptureVariants,
  DeleteVariantDialogBody,
  MainImageDialogBody,
  mainChosenLine,
  variantPending,
} = await import("portal/components/manage/CaptureVariants.js");
const { AddStepBody, addMetadata, addStepParts, checkBeforeSending } =
  await import("portal/components/manage/CaptureAddDialog.js");
const { captureChips, captureCounts, filteredCaptures, storageLine } =
  await import("portal/components/manage/captures-list.js");
const { capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");
const { metadataCopyFor } =
  await import("portal/components/manage/capture-metadata-copy.js");
const { readOnlyInfoFor } =
  await import("portal/components/manage/CaptureMetadata.js");
const { captureMediaPath } =
  await import("portal/components/manage/captures-client.js");
const { fileSize, dimensions, fileKind, shortDigest } =
  await import("portal/components/manage/captures-format.js");
const { exifOf, nameFromFile, nearestPlace } =
  await import("portal/components/manage/photo-exif.js");
const { imageName, shownImages } =
  await import("portal/captures/image-names.js");
const { registerCheckReasonWords } =
  await import("portal/components/manage/check-reason-words.js");
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { AssetVariantSelect } =
  await import("portal/components/detail/DetailsPanel.js");
const { CaptureImageLoading, imageSwapState } =
  await import("portal/components/detail/CaptureImageCarousel.js");
const { messages } = await import("portal/i18n.js");
const { captureState } = await import("portal/captures/capture-state.js");
const { clearHostedCopy, registerHostedCopy } =
  await import("portal/components/manage/hosted-copy.js");

const fr = capturesCopyFor("fr");
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const NOW = "2026-10-08T09:00:00.000Z";
const plain = (text) => String(text).replace(/ /g, " ");
const textOf = (markup) =>
  plain(
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " "),
  );
/** The text of a page without the viewer's top bar (its labels and tooltips). */
const withoutBar = (markup) =>
  textOf(
    markup.replace(
      /<div class="viewer-bar"[\s\S]*?(?=<div class="image-frame")/,
      "",
    ),
  );
const has = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(
      text.includes(sentence),
      `« ${sentence} » missing from: ${text.slice(0, 900)}`,
    );
};
const lacks = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(!text.includes(sentence), `« ${sentence} » should not be drawn`);
};

const checks = (changes = {}) => ({
  automatic: "sky",
  automaticAt: "2026-10-06T22:00:00.000Z",
  team: null,
  teamAt: null,
  teamReason: null,
  reviewRequestedAt: null,
  protectionNoticeAt: null,
  protectionLiftedAt: null,
  removedFromGalleryAt: null,
  ...changes,
});
let counter = 0;
/** A capture of Camille's space as `GET /api/v1/manage/captures` writes it. */
function capture({
  designation = "M31",
  name = "Galaxie d’Andromède",
  aliases = ["NGC 224"],
  label = "Galaxie",
  personal = false,
  night = "2026-10-05",
  integration = 140,
  stage = "finalized",
  visibility = "private",
  check = {},
  bytes = 42 * MIB,
  file = "M31_final.jpg",
  variants = null,
  tags = [],
} = {}) {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  const own = checks(check);
  const targetId = personal ? `personal-${counter}` : designation.toLowerCase();
  return {
    id,
    sessionId: null,
    planId: null,
    targetIds: [targetId],
    originalName: file,
    sha256: "9c1e5a7d".padEnd(60, "0") + "4b07",
    byteSize: bytes,
    status: "uploaded",
    visibility,
    stage,
    checks: own,
    createdAt: "2026-10-06T21:02:00.000Z",
    state: captureState({ visibility, checks: own, now: NOW }),
    preview: true,
    thumbnail: true,
    showable: true,
    protectionLapsed: false,
    tags,
    galleryLabel: label,
    telescope: "Askar 50P",
    targets: [
      personal
        ? { id: targetId, source: "personal", name: designation, label }
        : {
            id: targetId,
            source: "catalogue",
            designation,
            type: "Galaxie",
            aliases,
            raHours: 0.712,
            decDegrees: 41.27,
          },
    ],
    integrationMinutes: integration,
    detail: {
      targets: personal ? [] : [{ id: targetId, designation, name }],
      night,
      addedAt: "2026-10-06T21:02:00.000Z",
      fileName: file,
      byteSize: bytes,
      equipment: ["Askar 50P", "ZWO ASI533MC Pro"],
      skyQuality: null,
      place: { name: "Col des Étoiles" },
    },
    variants: variants ?? [image({ main: true, file, bytes })],
  };
}
/** One image of a capture (`capture-variant.schema.json`). */
function image({
  id = `image-${(counter += 1)}`,
  main = false,
  file = "M31_final.jpg",
  bytes = 14 * MIB,
  width = 4000,
  height = 2670,
  source = "phone",
  isPublic = false,
  check = "sky",
  at = "2026-10-06T21:02:00.000Z",
  title = null,
  description = null,
  rank = 1,
  sha = "9c1e5a7d",
} = {}) {
  return {
    id,
    main,
    sha256: sha.padEnd(60, "0") + "4b07",
    byteSize: bytes,
    originalName: file,
    width,
    height,
    source,
    public: isPublic,
    automaticCheck: check,
    createdAt: at,
    thumbnail: true,
    title,
    description,
    arrivalRank: rank,
  };
}
/** The three images of a capture. */
const threeImages = () => [
  image({ id: "main", main: true, rank: 1 }),
  image({
    id: "stack",
    file: "IMG_2041.tif",
    bytes: 412 * MIB,
    width: 6248,
    height: 4176,
    source: "stacking",
    at: "2026-10-08T07:41:00.000Z",
    rank: 3,
    sha: "3f9a1c07",
  }),
  image({
    id: "crop",
    file: "M31_recadree.jpg",
    bytes: 15 * MIB,
    source: "web",
    isPublic: true,
    at: "2026-10-07T12:05:00.000Z",
    title: "Recadrée sur le noyau",
    description:
      "Recadrage serré sur le noyau et sur M32, pour mieux voir les nuages de poussière.",
    rank: 2,
    sha: "b72d04e9",
  }),
];

const page = (captures, changes = {}) => ({
  captures,
  hasMore: false,
  nextBefore: null,
  storage: {
    usedBytes: 1.2 * GIB,
    quotaBytes: 50 * GIB,
    maxFileBytes: GIB,
    captureCount: captures.length,
  },
  publishing: { available: true, warningsCount: 0, blockedUntil: null },
  names: { publicNameRefusedAt: null, portalNameRefusedAt: null },
  nights: [],
  places: [],
  ...changes,
});
const state = (listPage, extra = {}) => ({
  list: { status: "ready", page: listPage },
  detail: { status: "loading", capture: null },
  touched: new Set(),
  retired: new Set(),
  busy: null,
  dialog: null,
  upload: { busy: false, refusal: null },
  failure: null,
  filter: { chip: "", query: "", oldestFirst: false },
  view: "list",
  ...extra,
});
const draw = (props) =>
  renderToStaticMarkup(
    createElement(CapturesView, {
      locale: "fr",
      actions: {},
      timeZone: "Europe/Paris",
      now: new Date(NOW),
      wide: true,
      // A composition that sells hands the address of its offers over.
      offersHref: "/fr/manage/plan",
      ...props,
    }),
  );
const detail = (one, { extra = {}, pageChanges = {}, ...props } = {}) =>
  draw({
    state: state(page([one], pageChanges), {
      detail: { status: "ready", capture: one },
      ...extra,
    }),
    captureId: one.id,
    ...props,
  });

// ——— The list ———

test("the filter bar: « Toutes », the generic labels present in their order, then the owner's tags; a chip, a search and the order keep the captures", () => {
  const m31 = capture({ tags: ["Askar", "Empilée"] });
  const ngc = capture({
    designation: "NGC 7000",
    name: "Nébuleuse de l’Amérique du Nord",
    aliases: ["Caldwell 20"],
    label: "Nébuleuse",
    night: "2026-09-29",
  });
  const cygnus = capture({
    designation: "Voie lactée dans le Cygne",
    personal: true,
    label: "Grand champ",
    night: "2026-10-03",
    tags: ["Askar"],
  });
  const all = [m31, ngc, cygnus];
  assert.deepEqual(
    captureChips(all, "fr").map((chip) => chip.label),
    ["Galaxie", "Nébuleuse", "Grand champ", "Askar", "Empilée"],
  );
  const keep = (options) =>
    filteredCaptures(all, { locale: "fr", ...options }).map((c) => c.id);
  assert.deepEqual(keep({ chip: "Nébuleuse" }), [ngc.id]);
  assert.deepEqual(keep({ chip: "Askar" }), [m31.id, cygnus.id]);
  // A search reads designations, names and aliases, accents aside.
  assert.deepEqual(keep({ query: "caldwell" }), [ngc.id]);
  assert.deepEqual(keep({ query: "andromede" }), [m31.id]);
  assert.deepEqual(keep({ query: "cygne" }), [cygnus.id]);
  // « Plus récentes » by night, then reversed.
  assert.deepEqual(keep({}), [m31.id, cygnus.id, ngc.id]);
  assert.deepEqual(keep({ oldestFirst: true }), [ngc.id, cygnus.id, m31.id]);
  const text = textOf(draw({ state: state(page(all)) }));
  has(text, "Toutes", "Plus récentes", "Liste", "Carte");
  const markup = draw({ state: state(page(all)) });
  assert.match(markup, /placeholder="Rechercher une cible"/);
  assert.match(markup, /aria-label="Inverser le tri par date"/);
});

test("one counter « 12 captures · 9 cibles », the targets counted once", () => {
  const list = [
    capture(),
    capture(),
    capture({ designation: "NGC 7000", name: "Amérique du Nord" }),
  ];
  assert.deepEqual(captureCounts(list), { captures: 3, targets: 2 });
  assert.equal(plain(fr.counter(12, 9)), "12 captures · 9 cibles");
  assert.equal(plain(fr.counter(1, 1)), "1 capture · 1 cible");
  has(textOf(draw({ state: state(page(list)) })), "3 captures · 2 cibles");
});

test("a mosaic counts every one of its targets", () => {
  const single = capture({ designation: "M31" });
  const other = capture({ designation: "NGC 7000", name: "Amérique du Nord" });
  const mosaic = {
    ...capture(),
    targetIds: ["ngc 7000", "ic 5070", "m31"],
  };
  assert.deepEqual(captureCounts([single, other, mosaic]), {
    captures: 3,
    targets: 3,
  });
  assert.deepEqual(captureCounts([mosaic]), { captures: 1, targets: 3 });
});

test("sizes read in base 1 024 under « Mo » and « Go »; dimensions, kinds and short SHA-256 written the same way", () => {
  assert.equal(plain(fileSize(412 * MIB, "fr")), "412 Mo");
  assert.equal(plain(fileSize(1.2 * GIB, "fr")), "1,2 Go");
  assert.equal(plain(fileSize(50 * GIB, "fr")), "50 Go");
  assert.equal(plain(fileSize(25 * MIB, "fr")), "25 Mo");
  // A file of a few hundred kilobytes is « 0,3 Mo », never « 0 Mo », in the
  // locale's number form; a few kilobytes read « < 0,1 Mo ».
  assert.equal(plain(fileSize(0.3 * MIB, "fr")), "0,3 Mo");
  assert.equal(plain(fileSize(0.3 * MIB, "en")), "0.3 MB");
  assert.equal(plain(fileSize(0.3 * MIB, "de")), "0,3 MB");
  assert.equal(plain(fileSize(12 * 1024, "fr")), "< 0,1 Mo");
  assert.equal(dimensions(6248, 4176, "fr"), "6 248 × 4 176 px");
  assert.equal(fileKind("IMG_2041.tif"), "TIFF");
  assert.equal(fileKind("M31_final.jpg"), "JPEG");
  assert.equal(
    shortDigest("3f9a1c07".padEnd(60, "0") + "c21e"),
    "3f9a1c07…c21e",
  );
});

// ——— The add box ———

const nights = [
  {
    sessionId: "night-5",
    planId: "plan-5",
    night: "2026-10-05",
    place: "Col des Étoiles",
    targets: [
      {
        id: "m31",
        designation: "M31",
        name: "Galaxie d’Andromède",
        outcome: "done",
        integrationMinutes: 140,
        captureCount: 1,
      },
      {
        id: "ngc7000",
        designation: "NGC 7000",
        name: "Amérique du Nord",
        outcome: "done",
        integrationMinutes: 65,
        captureCount: 0,
      },
      {
        id: "m45",
        designation: "M45",
        name: "Les Pléiades",
        outcome: "partial",
        integrationMinutes: 45,
        captureCount: 0,
      },
    ],
  },
];
/**
 * One step of the add box as its dialog draws it — title, body, footer (a
 * `WebDialog` renders in the page only, so the parts are drawn here).
 */
const box = ({ initial = null } = {}) => {
  const step = initial?.target ? "image" : "files";
  const { title, body, footer } = addStepParts({
    state: {
      step,
      night: initial?.night ?? null,
      target: initial?.target ?? null,
      notice: null,
      busy: false,
      query: "",
      results: null,
      form: null,
    },
    patch: () => {},
    copy: fr,
    locale: "fr",
    nights,
    initial,
  });
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement("h2", null, title),
      createElement(AddStepBody, {
        copy: fr,
        step,
        notice: null,
        body,
        filing: !initial?.target,
      }),
      createElement("footer", null, footer),
    ),
  );
};

test("the add box, step 1 « Image »: the file first — the drop zone, « Choisir un fichier » the primary, « Créer la capture sans image » the tertiary — and « Image › Rangement » as the two steps; no night to choose, no « Hors plan »", () => {
  const markup = box({});
  const text = textOf(markup);
  has(
    text,
    "Ajouter une capture",
    "Image",
    "Rangement",
    "Glissez l’image ici",
    "Choisir un fichier",
    "Créer la capture sans image",
    "Elle sera ajoutée en brouillon, privée.",
  );
  lacks(
    text,
    "Hors plan",
    "Quelle nuit ?",
    "Quelle cible ?",
    "Une cible du catalogue, sans nuit",
  );
  assert.match(markup, /class="btn-primary"[^>]*>Choisir un fichier/);
  assert.match(markup, /class="btn-tertiary"[^>]*>Créer la capture sans image/);
  assert.match(markup, /<input[^>]*type="file"[^>]*multiple/);
});

test("the add box opened from the page of a session (night and target known): « Choisir un fichier » the primary, the drop zone, the draft line; the upload asks for a private draft", () => {
  const markup = box({
    initial: { night: nights[0], target: nights[0].targets[0] },
  });
  const text = textOf(markup);
  has(
    text,
    "M31 · Galaxie d’Andromède",
    "Lun. 5 oct. · Col des Étoiles",
    "Glissez l’image ici",
    "Choisir un fichier",
    "Retour",
    "Elle sera ajoutée en brouillon, privée.",
  );
  assert.match(markup, /class="btn-primary"[^>]*>Choisir un fichier/);
  assert.deepEqual(addMetadata(nights[0].targets[0], nights[0]), {
    targetIds: ["m31"],
    sessionId: "night-5",
    stage: "draft",
  });
});

test("the SHA-256 is checked before a byte is sent: « déjà dans votre espace » when present, the reason in words when refused, nothing sent", async () => {
  const calls = [];
  const fetcherAnswering = (body) => async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const file = new File([Buffer.from("M31 stack")], "M31_empilee.jpg");
  const run = (answer) =>
    checkBeforeSending({
      fetcher: fetcherAnswering(answer),
      csrf: "token",
      file,
      metadata: addMetadata(nights[0].targets[0], nights[0]),
      copy: fr,
      refusalWords: (outcome, name) => uploadRefusalWords(outcome, fr, name),
    });
  const present = await run({
    result: "present",
    captureId: "c",
    imageId: "i",
    main: true,
    storage: {},
  });
  assert.equal(
    plain(present.notice.title),
    "M31_empilee.jpg est déjà dans votre espace : rien n’a été envoyé.",
  );
  const refused = await run({
    result: "refused",
    code: "storage_quota_reached",
    message: "Full.",
    storage: {},
  });
  assert.equal(
    plain(refused.notice.title),
    "M31_empilee.jpg n’a pas été ajoutée : votre espace n’a plus de place pour elle.",
  );
  const accepted = await run({
    result: "accepted",
    adds: "capture",
    storage: {},
  });
  assert.equal(accepted.notice, null);
  assert.match(accepted.sha256, /^[0-9a-f]{64}$/);
  // Only the check was called: its body names the file, never its bytes.
  assert.ok(calls.every((call) => call.path === "/api/v1/uploads/check"));
  assert.deepEqual(Object.keys(calls[0].body).sort(), [
    "byteSize",
    "originalName",
    "sessionId",
    "sha256",
    "stage",
    "targetIds",
  ]);
});

test("the EXIF read in the browser: the date and the position of a photo, the saved place nearest to it, the name a file proposes", () => {
  // A little-endian TIFF: IFD0 → Exif IFD (DateTimeOriginal) and GPS IFD.
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  const entry = (at, tag, type, count, value) => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  };
  view.setUint16(8, 2, true);
  entry(10, 0x8769, 4, 1, 100);
  entry(22, 0x8825, 4, 1, 200);
  view.setUint16(100, 1, true);
  entry(102, 0x9003, 2, 20, 300);
  "2026:10:05 23:14:00\0"
    .split("")
    .forEach((c, i) => (bytes[300 + i] = c.charCodeAt(0)));
  view.setUint16(200, 4, true);
  entry(202, 0x0001, 2, 2, "N".charCodeAt(0));
  entry(214, 0x0002, 5, 3, 340);
  entry(226, 0x0003, 2, 2, "W".charCodeAt(0));
  entry(238, 0x0004, 5, 3, 370);
  for (const [at, value] of [
    [340, 45],
    [348, 0],
    [356, 0],
    [370, 30],
    [378, 0],
    [386, 0],
  ]) {
    view.setUint32(at, value, true);
    view.setUint32(at + 4, 1, true);
  }
  const exif = exifOf(bytes.buffer);
  assert.deepEqual(exif, {
    date: "2026-10-05",
    time: "23:14",
    latitude: 45,
    longitude: -30,
  });
  const places = [
    { name: "Plateau des Cimes", latitude: 46, longitude: -31 },
    { name: "Col des Étoiles", latitude: 45.01, longitude: -30.02 },
  ];
  assert.equal(nearestPlace(places, exif).name, "Col des Étoiles");
  assert.equal(nameFromFile("Cygne_grand-champ.jpg"), "Cygne grand champ");
});

// ——— The owner's detail ———

test("the detail of a private draft: « Fichier » with its secondary « Télécharger l’original (TIFF, 412 Mo) », « État » with the primary « Finaliser cette capture », « Rendre publique » greyed", () => {
  const draft = capture({
    designation: "IC 1396",
    name: "Nébuleuse de la Trompe d’Éléphant",
    stage: "draft",
    file: "IMG_2041.tif",
    bytes: 412 * MIB,
    variants: [
      image({
        main: true,
        file: "IMG_2041.tif",
        bytes: 412 * MIB,
        width: 6248,
        height: 4176,
      }),
    ],
  });
  const markup = detail(draft);
  const text = textOf(markup);
  has(
    text,
    "Toutes les captures",
    "IC 1396 — Nébuleuse de la Trompe d’Éléphant",
    "Ajoutée le 6 oct. 2026 · Nuit du 5 oct.",
    "Brouillon",
    "Privée",
    "Fichier",
    "IMG_2041.tif · 412 Mo · 6 248 × 4 176 px",
    "Télécharger l’original (TIFF, 412 Mo)",
    "Le fichier que vous avez envoyé, sans changement.",
    "État",
    "Brouillon : la capture n’est pas encore finalisée.",
    "Finaliser cette capture",
    "Rendre publique",
    "Finalisez la capture pour pouvoir la rendre publique.",
    "Supprimer la capture",
  );
  assert.match(
    markup,
    new RegExp(
      `class="btn-secondary capture-download" href="/api/v1/manage/captures/${draft.id}/media\\?download=1" download="IMG_2041.tif"`,
    ),
  );
  assert.match(markup, /class="btn-primary"[^>]*>Finaliser cette capture/);
  assert.match(
    markup,
    /role="switch"[^>]*aria-disabled="true"[^>]*disabled=""/,
  );
  // One image: no zone « Variantes ».
  lacks(text, "Variantes");
  assert.match(
    markup,
    /class="btn-tertiary is-destructive"[^>]*>.*Supprimer la capture/,
  );
});

test("once finalized: no primary in « État », « Finalisée. », « Rendre publique » active; public: « Déjà visible dans la galerie publique. »", () => {
  const finalized = capture({ stage: "finalized" });
  const markup = detail(finalized);
  has(textOf(markup), "Finalisée.", "Rendre publique");
  lacks(textOf(markup), "Finaliser cette capture", "Finalisez la capture");
  // Scoped to the zone « État » (the zone « Plate solving » has a
  // greyed switch of its own where no sky solution exists).
  const stateZone =
    /<section class="capture-zone capture-state-zone"[\s\S]*?<\/section>/.exec(
      markup,
    )[0];
  assert.doesNotMatch(stateZone, /role="switch"[^>]*disabled/);
  const shown = capture({ visibility: "public", check: { team: "approved" } });
  has(textOf(detail(shown)), "Déjà visible dans la galerie publique.");
  assert.match(detail(shown), /role="switch" aria-checked="true" checked=""/);
});

test("a capture whose public image was replaced is private again and its state line says so, with what to do; one replaced while private says nothing", () => {
  const stateZone = (markup) =>
    /<section class="capture-zone capture-state-zone"[\s\S]*?<\/section>/.exec(
      markup,
    )[0];
  const replaced = {
    ...capture({ stage: "finalized" }),
    replacedAt: "2026-10-14T05:12:00.000Z",
    replacedSource: "astro-sync",
  };
  const told = stateZone(detail({ ...replaced, replacedMadePrivate: true }));
  has(textOf(told), "Redevenue privée : l’image a été remplacée");
  // The whole message is the body of the line's information dialog.
  assert.ok(
    told.includes("Redevenue privée") && told.includes("capture-zone-line"),
  );
  lacks(textOf(told), "Déjà visible dans la galerie publique.");
  // Replaced while it was private: nothing to tell.
  lacks(textOf(stateZone(detail(replaced))), "Redevenue privée");
  // Published again: the flag is gone from the service, and a public capture
  // never says it.
  lacks(
    textOf(
      stateZone(
        detail({
          ...replaced,
          visibility: "public",
          check: { team: "approved" },
          replacedMadePrivate: true,
        }),
      ),
    ),
    "Redevenue privée",
  );
});

test("« Finalisée le 6 oct. 2026. » once the date is kept; « Finalisée. » for a capture finalized before it; a draft says neither", () => {
  const dated = {
    ...capture({ stage: "finalized" }),
    finalizedAt: "2026-10-06T21:02:00.000Z",
  };
  const stateZone = (markup) =>
    textOf(
      /<section class="capture-zone capture-state-zone"[\s\S]*?<\/section>/.exec(
        markup,
      )[0],
    );
  has(stateZone(detail(dated)), "Finalisée le 6 oct. 2026.");
  const undated = { ...capture({ stage: "finalized" }), finalizedAt: null };
  has(stateZone(detail(undated)), "Finalisée.");
  lacks(stateZone(detail(undated)), "Finalisée le");
  const draft = { ...capture({ stage: "draft" }), finalizedAt: null };
  lacks(stateZone(detail(draft)), "Finalisée le", "Finalisée.");
  for (const [locale, words] of [
    ["en", "Finalized on"],
    ["ja", "に確定しました。"],
  ])
    assert.ok(
      capturesCopyFor(locale).finalizedOn("x").includes(words),
      `${locale}: ${words}`,
    );
});

// ——— The main image and the variants ———

test("the zone « Variantes »: the main image first, then the newest; names by default from the rank of arrival, pills, pencil, description, date and source, file, short SHA-256", () => {
  const m31 = capture({
    visibility: "public",
    check: { team: "approved" },
    variants: threeImages(),
  });
  const markup = detail(m31);
  const text = textOf(markup);
  has(
    text,
    "Le fichier de l’image principale, sans changement.",
    "Variantes",
    "Une nouvelle variante est arrivée : elle est privée, l’image principale n’a pas changé.",
    "Image principale",
    "Principale",
    "6 oct. 2026 · 23:02 · Téléphone",
    "M31_final.jpg · 14 Mo · 4 000 × 2 670 px",
    "SHA-256 9c1e5a7d…4b07",
    "Variante 3",
    "8 oct. 2026 · 09:41 · Astro Sync · empilement",
    "IMG_2041.tif · 412 Mo · 6 248 × 4 176 px",
    "SHA-256 3f9a1c07…4b07",
    "Recadrée sur le noyau",
    "Recadrage serré sur le noyau et sur M32, pour mieux voir les nuages de poussière.",
    "7 oct. 2026 · 14:05 · Web",
  );
  assert.ok(text.indexOf("Image principale") < text.indexOf("Variante 3"));
  assert.ok(text.indexOf("Variante 3") < text.indexOf("Recadrée sur le noyau"));
  assert.equal(
    markup.match(/aria-label="Modifier le titre et la description"/g).length,
    3,
  );
  // A private server's line once nothing waits.
  assert.equal(variantPending(threeImages()), true);
  const answered = threeImages().map((one) =>
    one.id === "stack" ? { ...one, public: true } : one,
  );
  assert.equal(variantPending(answered), false);
  has(
    textOf(
      detail(capture({ visibility: "public", variants: answered }), {
        offersHref: null,
      }),
    ),
    "3 images. La galerie privée montre toutes les images ; la galerie publique, l’image principale puis les variantes publiques.",
  );
});

test("one pencil opens the title and the description together, one primary « Enregistrer le titre et la description » greyed while unchanged, « Annuler » a link, a counter and an error line past the limit", () => {
  const m31 = capture({ visibility: "public", variants: threeImages() });
  const markup = detail(m31, { extra: { editingImage: "crop" } });
  const text = textOf(markup);
  has(
    text,
    "Titre de l’image",
    "Visible dans les galeries, dans le bandeau sous l’image.",
    "21 / 90",
    "Description de l’image",
    "Facultative. Visible sous l’image quand elle est affichée.",
    "81 / 280",
    "Annuler",
    "Enregistrer le titre et la description",
  );
  lacks(text, "Enregistrer le titre Description", "Fermer");
  assert.match(
    markup,
    /class="btn-primary" disabled="">Enregistrer le titre et la description/,
  );
  assert.match(markup, /class="btn-link"[^>]*>Annuler/);
  // The row's switch and two tertiaries stay hidden while the field is open.
  const row =
    /<li class="capture-image-row" data-image-id="crop">[\s\S]*?<\/li>/.exec(
      markup,
    )[0];
  assert.doesNotMatch(row, /Utiliser comme image principale|role="switch"/);
  // Past the limit (a title of 91 characters): the error line, the input kept.
  const long = threeImages().map((one) =>
    one.id === "crop" ? { ...one, title: "é".repeat(91) } : one,
  );
  const over = detail(capture({ visibility: "public", variants: long }), {
    extra: { editingImage: "crop" },
  });
  has(
    textOf(over),
    "Le titre tient en 90 caractères au plus : retirez-en 1.",
    "91 / 90",
  );
  assert.match(over, /aria-invalid="true"/);
});

test("« Utiliser comme image principale ? »: a plain primary; the message of one line + ⓘ when the visibilities differ, none when they are the same or the capture is private; the zone's line after the choice", () => {
  const m31 = capture({ visibility: "public", variants: threeImages() });
  const [main, stack, crop] = m31.variants;
  const dialog = (one, chosen) =>
    renderToStaticMarkup(
      createElement(MainImageDialogBody, {
        capture: one,
        image: chosen,
        copy: fr,
        locale: "fr",
        target: "M31",
      }),
    );
  const differs = dialog(m31, stack);
  has(
    textOf(differs),
    "La variante « Variante 3 » (IMG_2041.tif, 412 Mo) deviendra l’image principale de M31 : c’est elle que la galerie montrera en premier.",
    "Cette variante est privée : comme image principale, elle sera publique, comme la capture.",
  );
  // One line + ⓘ, not one more dialog.
  assert.match(differs, /class="info-line capture-visibility-message"/);
  assert.equal(plain(fr.useAsMainTitle), "Utiliser comme image principale ?");
  lacks(textOf(dialog(m31, crop)), "Cette variante est privée");
  has(
    textOf(dialog(m31, crop)),
    "La variante « Recadrée sur le noyau » (M31_recadree.jpg, 15 Mo)",
  );
  const privateOne = capture({
    visibility: "private",
    variants: threeImages(),
  });
  lacks(
    textOf(dialog(privateOne, privateOne.variants[1])),
    "Cette variante est privée",
  );
  assert.equal(
    plain(
      mainChosenLine({ capture: m31, chosen: stack, former: main, copy: fr }),
    ),
    "IMG_2041.tif est devenue l’image principale, donc publique comme la capture ; M31_final.jpg reste publique, en variante.",
  );
  assert.equal(
    plain(
      mainChosenLine({ capture: m31, chosen: crop, former: main, copy: fr }),
    ),
    "M31_recadree.jpg est devenue l’image principale ; M31_final.jpg reste publique, en variante.",
  );
  // The line stands at the head of the zone after the choice.
  has(
    textOf(
      detail(m31, {
        extra: {
          variantLine: mainChosenLine({
            capture: m31,
            chosen: stack,
            former: main,
            copy: fr,
          }),
        },
      }),
    ),
    "IMG_2041.tif est devenue l’image principale",
  );
});

test("« Supprimer cette variante ? »: the primary in the red tint, what goes, what stays, what is freed", () => {
  const m31 = capture({ visibility: "public", variants: threeImages() });
  const markup = renderToStaticMarkup(
    createElement(DeleteVariantDialogBody, {
      capture: m31,
      image: m31.variants[2],
      copy: fr,
      locale: "fr",
      timeZone: "Europe/Paris",
    }),
  );
  assert.equal(plain(fr.deleteVariantTitle), "Supprimer cette variante ?");
  has(
    textOf(markup),
    "La variante « Recadrée sur le noyau » (M31_recadree.jpg, Web, 7 oct. 2026 · 14:05, 15 Mo) sera supprimée de votre espace, avec son fichier. Elle disparaît aussi de la galerie publique.",
    "L’image principale et la capture ne changent pas. 15 Mo sont libérés.",
  );
  // Its confirmation is the dialog's primary in the red tint (`tone`
  // danger), the choice of the main image a plain primary (rule 4).
  const source = readFileSync(
    new URL("../src/components/manage/CaptureVariants.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /confirmLabel=\{copy\.deleteVariant\}[\s\S]*?tone="danger"/,
  );
  assert.match(source, /confirmLabel=\{copy\.useAsMain\}[\s\S]*?tone="plain"/);
});

test("« Supprimer la capture » counts its images and says what it frees", () => {
  const m31 = capture({ visibility: "public", variants: threeImages() });
  const text = textOf(
    renderToStaticMarkup(
      createElement(DeleteCaptureBody, {
        capture: m31,
        copy: fr,
        locale: "fr",
      }),
    ),
  );
  has(
    text,
    "La capture et ses 3 images sont effacées de votre espace, avec leurs fichiers.",
    "441 Mo sont libérés.",
  );
});

test("deleting a PUBLIC capture says it also leaves the public gallery, a private one says nothing of the kind (U-H2)", () => {
  const body = (visibility, copy = fr, locale = "fr") =>
    textOf(
      renderToStaticMarkup(
        createElement(DeleteCaptureBody, {
          capture: capture({ visibility, variants: threeImages() }),
          copy,
          locale,
        }),
      ),
    );
  has(body("public"), "Elle quitte aussi la galerie publique.");
  assert.ok(!body("private").includes("galerie publique"));
  // Every shipped language carries the line, none keeps the English by default.
  const words = new Set();
  for (const locale of shippedLocales()) {
    const copy = capturesCopyFor(locale);
    assert.equal(typeof copy.deletePublicNote, "string", locale);
    assert.ok(copy.deletePublicNote.length > 5, locale);
    has(body("public", copy, locale), copy.deletePublicNote);
    assert.ok(!body("private", copy, locale).includes(copy.deletePublicNote));
    words.add(copy.deletePublicNote);
  }
  assert.equal(words.size, shippedLocales().length);
});

test("the names: the owner's title, else « Image principale » or « Variante N » by the rank of arrival, in the ten languages", () => {
  assert.equal(
    imageName({ main: true, title: null, arrivalRank: 1 }, "fr"),
    "Image principale",
  );
  assert.equal(
    imageName({ main: false, title: null, arrivalRank: 2 }, "fr"),
    "Variante 2",
  );
  assert.equal(
    imageName({ main: false, title: " Noyau ", arrivalRank: 2 }, "fr"),
    "Noyau",
  );
  assert.equal(imageName({ main: false, arrivalRank: 3 }, "en"), "Variant 3");
  for (const [locale, catalogue] of Object.entries(messages))
    for (const key of [
      "imagePrevious",
      "imageNext",
      "imagePosition",
      "imageLoading",
      "imageMainDefault",
      "imageVariantDefault",
    ])
      assert.ok(catalogue[key], `${locale} ${key}`);
  for (const catalogue of Object.values(messages))
    assert.match(catalogue.imageVariantDefault, /\{rank\}/);
  for (const catalogue of Object.values(messages))
    assert.match(
      catalogue.imagePosition,
      /\{index\}.*\{count\}|\{count\}.*\{index\}/,
    );
});

// ——— the galleries ———

const publicCapture = (variants, mainImage) => ({
  id: "capture-m31",
  targets: [
    { designation: "M31", name: "Galaxie d’Andromède", aliases: ["NGC 224"] },
  ],
  tag: "Galaxie",
  tags: ["Galaxie"],
  telescope: "Askar 50P",
  exposure: null,
  nightMonth: "2026-10",
  signature: "Camille",
  media: {
    image: "/api/v1/gallery/capture-m31/media",
    thumbnail: "/api/v1/gallery/capture-m31/media?variant=thumbnail",
  },
  equipment: [],
  skyQuality: null,
  image: { width: 4000, height: 2670 },
  mainImage,
  variants,
});
const publicVariant = {
  id: "crop",
  media: {
    image: "/api/v1/gallery/capture-m31/media?imageId=crop",
    thumbnail:
      "/api/v1/gallery/capture-m31/media?variant=thumbnail&imageId=crop",
  },
  image: { width: 4000, height: 2670 },
  title: "Recadrée sur le noyau",
  description:
    "Recadrage serré sur le noyau et sur M32, pour mieux voir les nuages de poussière.",
  arrivalRank: 2,
};

test("the public gallery: the catalogue's arrows on each side of the image, the dots under it and a dark band naming the image shown; the main image first; no menu, date, file, count nor download", () => {
  const markup = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: publicCapture([publicVariant], {
        id: "main",
        title: null,
        description: null,
        arrivalRank: 1,
      }),
      locale: "fr",
    }),
  );
  const text = textOf(markup);
  // The first image: « Image précédente » stops there, « Image suivante » leads on.
  assert.match(
    markup,
    /<button type="button" class="asset-nav asset-nav-prev" disabled="" aria-label="Image précédente"/,
  );
  assert.match(
    markup,
    /<button type="button" class="asset-nav asset-nav-next" aria-label="Image suivante"/,
  );
  assert.match(
    markup,
    /<div class="asset-pagination" role="img" aria-label="Image 1 sur 2"><span class="asset-pagination-dot is-active"><\/span><span class="asset-pagination-dot"><\/span><\/div>/,
  );
  // The band: the name, the caption, then the description (none here).
  assert.match(
    markup,
    /<div class="capture-image-band"><div class="image-legend"><strong class="capture-image-name">Image principale<\/strong> · Octobre 2026 · /,
  );
  assert.doesNotMatch(markup, /<select|<optgroup|capture-image-menu/);
  // The bar's own « Télécharger » (the shared copy) is the one download; the
  // band and the sheet offer none.
  lacks(withoutBar(markup), "Télécharger");
  lacks(
    text,
    "Image affichée",
    "Rendu ou étape",
    "Variante 3",
    "SHA-256",
    "IMG_2041",
  );
  // The main image is shown: its description only (it has none).
  lacks(text, "Recadrage serré");
  // No star on the first drawing: nothing is loading yet.
  assert.doesNotMatch(markup, /capture-image-loading|data-brand-loader/);
  // Without a public variant: one image, no arrows, no dots; the band keeps
  // the caption, the description goes to the details panel.
  const aloneMarkup = renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: publicCapture([], {
        id: "main",
        title: null,
        description: "La galaxie entière.",
        arrivalRank: 1,
      }),
      locale: "fr",
    }),
  );
  assert.doesNotMatch(aloneMarkup, /asset-nav|asset-pagination|<select/);
  assert.doesNotMatch(aloneMarkup, /capture-image-name/);
  assert.doesNotMatch(aloneMarkup, /capture-image-description/);
  assert.match(
    aloneMarkup,
    /<p class="detail-description detail-image-description">La galaxie entière.<\/p>/,
  );
  assert.equal(shownImages({ variants: [], mainImage: null }).several, false);
});

test("the private gallery: the same arrows, dots and band, in the public page; a capture without a public variant has one image", () => {
  const view = (variants) =>
    renderToStaticMarkup(
      createElement(
        PublicCapturePage,
        privateCapturePageProps({
          locale: "fr",
          token: "token-a",
          view: {
            portalName: null,
            publicName: "Camille",
            canReport: false,
            capture: {
              id: "capture-m31",
              targets: [
                {
                  id: "m31",
                  designation: "M31",
                  name: "Galaxie d’Andromède",
                  aliases: [],
                },
              ],
              nightMonth: "2026-10",
              equipment: [
                { kind: "telescope", name: "Askar 50P" },
                { kind: "camera", name: "ZWO ASI533MC Pro" },
              ],
              thumbnail: true,
              mainImage: {
                id: "main",
                title: null,
                description: null,
                arrivalRank: 1,
              },
              variants,
            },
          },
        }),
      ),
    );
  const markup = view([{ id: "crop", thumbnail: true, ...publicVariant }]);
  has(textOf(markup), "Image principale", "Camille");
  assert.match(
    markup,
    /class="asset-nav asset-nav-next" aria-label="Image suivante"/,
  );
  assert.match(markup, /aria-label="Image 1 sur 2"/);
  assert.match(markup, /src="\/api\/v1\/portals\/token-a\/media\/capture-m31"/);
  // A variant is chosen through the gallery's gate, never the public routes.
  assert.doesNotMatch(markup, /\/api\/v1\/gallery\//);
  assert.doesNotMatch(view([]), /asset-nav|asset-pagination/);
  lacks(withoutBar(markup), "Télécharger");
  lacks(textOf(markup), "Image affichée");
});

test("another image loading: the old one is hidden and the portal's star stands in its place until the new one is decoded", () => {
  // Nothing asked yet, or the image asked for is the one drawn: no star.
  assert.deepEqual(imageSwapState("/a", "/a"), { drawn: "/a", loading: false });
  assert.deepEqual(imageSwapState("/a", null), { drawn: "/a", loading: false });
  assert.deepEqual(imageSwapState(null, null), { drawn: null, loading: false });
  // Another image asked for: the old one stays in the <img> (hidden), the star shows.
  assert.deepEqual(imageSwapState("/b", "/a"), { drawn: "/a", loading: true });
  const star = renderToStaticMarkup(
    createElement(CaptureImageLoading, { locale: "fr" }),
  );
  assert.match(star, /<span class="capture-image-loading" role="status">/);
  assert.match(star, /data-brand-loader=""/);
  has(textOf(star), "Chargement de l’image…");
  // The page hides the old image while the star shows, and the band never
  // widens the frame: the image stays centred whatever its description.
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\[data-public-capture\] \.image-area \.image-canvas > img\.is-loading \{\s*visibility: hidden;/,
  );
  assert.match(
    css,
    /\[data-public-capture\] \.image-frame \{\s*width: fit-content;\s*max-width: 100%;/,
  );
  assert.match(
    css,
    /\.capture-image-band \{\s*align-self: stretch;\s*contain: inline-size;/,
  );
  assert.doesNotMatch(css, /\.capture-image-menu/);
});

test("AssetVariantSelect keeps its own words for the catalogue when no label is given", () => {
  const markup = renderToStaticMarkup(
    createElement(AssetVariantSelect, {
      asset: { assetId: "a" },
      assets: [{ assetId: "a", file: "M31_final.jpg" }],
      onSelect: () => {},
      locale: "fr",
    }),
  );
  has(textOf(markup), "Rendu ou étape");
  assert.equal(
    captureMediaPath("c", { thumbnail: true, imageId: "i" }),
    "/api/v1/manage/captures/c/media?variant=thumbnail&imageId=i",
  );
  // The opened capture asks for the shared copy, the grid for the
  // thumbnail.
  assert.equal(
    captureMediaPath("c", { preview: true }),
    "/api/v1/manage/captures/c/media?variant=preview",
  );
  assert.equal(
    captureMediaPath("c", { download: true }),
    "/api/v1/manage/captures/c/media?download=1",
  );
});

// ——— Captures created without an image, their targets and the targets picker ———

const { TargetsPickerProvider } =
  await import("portal/components/manage/TargetsPickerContext.js");
const { FilingBody, TargetSearch } =
  await import("portal/components/manage/CaptureAddDialog.js");

/** Stands for the planner's `NightTargetsPicker`, which `portal` never imports. */
const FakePicker = ({ locale, excludeIds = [] }) =>
  createElement(
    "div",
    { className: "night-targets-picker", "data-locale": locale },
    `Rechercher une cible (hors ${excludeIds.join(",") || "rien"})`,
  );
const withPicker = (node) =>
  createElement(TargetsPickerProvider, { value: FakePicker }, node);

test("a capture without an image says so in « Fichier », offers « Ajouter une image », cannot be made public and says why", () => {
  const empty = capture({ stage: "draft", variants: [] });
  Object.assign(empty, {
    hasImage: false,
    originalName: null,
    sha256: null,
    byteSize: 0,
    preview: false,
    thumbnail: false,
    showable: false,
  });
  empty.state = {
    ...empty.state,
    state: "no_image",
    publishAllowed: false,
    publishRefusal: "no_image",
    teamLine: null,
  };
  const markup = detail(empty);
  const text = textOf(markup);
  has(
    text,
    "Fichier",
    "Aucune image pour l’instant : envoyez-les depuis Astro Sync ou ajoutez-en ici.",
    "Ajouter une image",
    "Sans image, la capture ne peut pas être rendue publique : ajoutez-en une d’abord.",
    "Rendre publique",
  );
  lacks(text, "Télécharger l’original", "Ajouter une variante", "Variantes");
  assert.match(markup, /class="btn-secondary"[^>]*>Ajouter une image/);
  assert.match(
    markup,
    /role="switch"[^>]*aria-disabled="true"[^>]*disabled=""/,
  );
  // In the list the card says it too.
  const listed = textOf(draw({ state: state(page([empty])), captureId: null }));
  has(listed, "Sans image");
});

test("the owner's detail carries « Cible »: each target with « Changer » and « Retirer », « Ajouter une cible » with the search of the labelled rows; none when the shell gives no search", () => {
  const one = capture({});
  const withSearch = renderToStaticMarkup(
    withPicker(
      createElement(CapturesView, {
        locale: "fr",
        actions: {},
        timeZone: "Europe/Paris",
        now: new Date(NOW),
        wide: true,
        captureId: one.id,
        state: state(page([one]), {
          detail: { status: "ready", capture: one },
        }),
      }),
    ),
  );
  const text = textOf(withSearch);
  has(
    text,
    "Cible",
    "M31 · Galaxie d’Andromède",
    "Changer M31",
    "Retirer M31",
    "Ajouter une cible",
  );
  assert.match(withSearch, /class="btn-secondary"[^>]*>Ajouter une cible/);
  assert.match(withSearch, /class="btn-link is-destructive"[^>]*>Retirer M31/);
  // A capture without a target: « Choisir une cible ».
  const none = capture({});
  none.detail.targets = [];
  none.targetIds = [];
  const bare = renderToStaticMarkup(
    withPicker(
      createElement(CapturesView, {
        locale: "fr",
        actions: {},
        timeZone: "Europe/Paris",
        now: new Date(NOW),
        wide: true,
        captureId: none.id,
        state: state(page([none]), {
          detail: { status: "ready", capture: none },
        }),
      }),
    ),
  );
  has(textOf(bare), "Aucune cible pour l’instant.", "Choisir une cible");
  lacks(textOf(detail(one)), "Ajouter une cible");
});

test("« Une autre cible du catalogue » draws the planner's search with labelled rows, no plain list of text", () => {
  const markup = renderToStaticMarkup(
    withPicker(createElement(TargetSearch, { locale: "fr", onPick: () => {} })),
  );
  assert.match(markup, /night-targets-picker/);
  // In « Rangement », « Modifier » on a target line draws the same search.
  const entry = {
    file: new File([Buffer.from("x")], "M31.jpg"),
    sha256: "a".repeat(64),
    exif: { date: null, time: null, latitude: null, longitude: null },
    guess: null,
    night: { date: "2026-10-05", from: "tonight" },
    place: null,
  };
  const drawn = renderToStaticMarkup(
    withPicker(
      createElement(FilingBody, {
        state: {
          step: "filing",
          files: [entry],
          choices: {},
          pinned: null,
          edit: { kind: "target", index: 0 },
        },
        patch: () => {},
        copy: fr,
        locale: "fr",
      }),
    ),
  );
  assert.match(drawn, /night-targets-picker/);
  assert.doesNotMatch(drawn, /capture-add-choice/);
  assert.doesNotMatch(drawn, /type="search"/);
});

test("the image step offers « Créer la capture sans image » (tertiary) beside « Choisir un fichier » (primary); a definition asks for no file", () => {
  const { footer } = addStepParts({
    state: {
      step: "image",
      night: nights[0],
      target: nights[0].targets[0],
      notice: null,
      busy: false,
      form: null,
    },
    patch: () => {},
    copy: fr,
    locale: "fr",
    nights,
    initial: { night: nights[0], target: nights[0].targets[0] },
  });
  const markup = renderToStaticMarkup(createElement("footer", null, footer));
  assert.match(markup, /class="btn-tertiary"[^>]*>Créer la capture sans image/);
  assert.match(markup, /class="btn-primary"[^>]*>Choisir un fichier/);
  assert.ok(
    markup.indexOf("Créer la capture sans image") <
      markup.indexOf("Choisir un fichier"),
  );
});

// « Publique depuis le … » in the sheet of a capture.
test("the sheet of a public capture says since when it is public, « date inconnue » when the date was never kept, nothing for a private one", () => {
  const since = "2026-10-02T09:30:00.000Z";
  const dated = { ...capture({ visibility: "public" }), madePublicAt: since };
  const sheet = textOf(detail(dated));
  has(sheet, "Publique depuis le 2 oct. 2026");
  lacks(sheet, "date inconnue");
  assert.match(
    detail(dated),
    /<p class="capture-when capture-public-since">Publique depuis le 2 oct\. 2026<\/p>/,
  );
  // The first of the month is written « 1er » like the other dates of the sheet.
  has(
    textOf(detail({ ...dated, madePublicAt: "2026-10-01T09:30:00.000Z" })),
    "Publique depuis le 1er oct. 2026",
  );

  // Public before the date was kept (or a service that does not send it).
  for (const unknown of [
    capture({ visibility: "public" }),
    { ...capture({ visibility: "public" }), madePublicAt: null },
    { ...capture({ visibility: "public" }), madePublicAt: "not a date" },
  ]) {
    const text = textOf(detail(unknown));
    has(text, "Publique, date inconnue");
    lacks(text, "Publique depuis");
  }

  // A private capture never carries the line, even with a stale date.
  const hidden = textOf(
    detail({ ...capture({ visibility: "private" }), madePublicAt: since }),
  );
  lacks(hidden, "Publique depuis", "date inconnue");
});

test("the line of « Publique depuis le … » reads in the ten languages, the date in the portal's own format and the zone of the page", () => {
  const since = "2026-10-02T23:30:00.000Z";
  const one = { ...capture({ visibility: "public" }), madePublicAt: since };
  const lines = {};
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "zh-Hans",
    "zh-Hant",
    "ru",
  ]) {
    const copy = capturesCopyFor(locale);
    assert.equal(typeof copy.publicSince, "function", `${locale} publicSince`);
    assert.ok(copy.publicSinceUnknown, `${locale} publicSinceUnknown`);
    const line = publicSinceLine(one, copy, locale, { timeZone: "UTC" });
    const day = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(since));
    assert.equal(line, copy.publicSince(day), locale);
    assert.ok(line.includes(day), `${locale}: the date is in the line`);
    assert.notEqual(
      line,
      publicSinceLine({ ...one, madePublicAt: null }, copy, locale),
      `${locale}: the unknown reads differently`,
    );
    assert.equal(
      publicSinceLine({ ...one, visibility: "private" }, copy, locale),
      null,
    );
    lines[locale] = line;
  }
  assert.equal(new Set(Object.values(lines)).size, 10, "ten different lines");
  // The day follows the zone of the page: 23:30 UTC is already the 3rd in Tokyo.
  const copy = capturesCopyFor("fr");
  assert.equal(
    publicSinceLine(one, copy, "fr", { timeZone: "UTC" }),
    "Publique depuis le 2 oct. 2026",
  );
  assert.equal(
    publicSinceLine(one, copy, "fr", { timeZone: "Asia/Tokyo" }),
    "Publique depuis le 3 oct. 2026",
  );
});

test("the team wins over a failed check — « Rendre publique » opens once the team approves, and the page draws the state the service gives", () => {
  const failed = {
    automatic: "other",
    protectionNoticeAt: "2026-10-01T10:00:00.000Z",
    protectionLiftedAt: "2026-10-02T10:00:00.000Z",
  };
  const stateZoneOf = (one) =>
    /<section class="capture-zone capture-state-zone"[\s\S]*?<\/section>/.exec(
      detail(one),
    )[0];

  // The check alone: the service refuses, the switch is greyed.
  const alone = capture({ check: failed });
  assert.equal(alone.state.publishAllowed, false);
  assert.equal(alone.state.publishRefusal, "check_not_passed");
  assert.match(stateZoneOf(alone), /role="switch"[^>]*disabled/);

  // The team's approval: the service allows it, the switch is open.
  const approved = capture({ check: { ...failed, team: "approved" } });
  assert.equal(approved.state.publishAllowed, true);
  assert.equal(approved.state.state, "private_verified");
  assert.equal(approved.state.teamLine, "approved");
  assert.doesNotMatch(stateZoneOf(approved), /role="switch"[^>]*disabled/);
  has(textOf(detail(approved)), "Rendre publique");

  // The page follows the state it is given, not the checks beside it.
  const told = {
    ...alone,
    state: { ...alone.state, publishAllowed: true, publishRefusal: null },
  };
  assert.doesNotMatch(stateZoneOf(told), /role="switch"[^>]*disabled/);
});

// ——— The storage line of the list ———

const freeStorage = (count) => ({
  usedBytes: 12 * MIB,
  quotaBytes: 75 * MIB,
  maxFileBytes: 25 * MIB,
  captureCount: count,
  captureCountLimit: 3,
});
const at = (markup, needle) => {
  const index = markup.indexOf(needle);
  assert.ok(index >= 0, `${needle} is drawn`);
  return index;
};

test("the title of a capture does not repeat the designation a catalogue name already starts with (parity with the phone)", () => {
  const capture = (targets) => ({ detail: { targets } });
  assert.equal(
    captureTitle(
      capture([
        {
          designation: "NGC 6960",
          name: "NGC 6960 — Dentelles du Cygne occidentales",
        },
      ]),
      fr,
    ),
    "NGC 6960 — Dentelles du Cygne occidentales",
  );
  assert.equal(
    captureTitle(
      capture([{ designation: "M 31", name: "Galaxie d’Andromède" }]),
      fr,
    ),
    "M 31 — Galaxie d’Andromède",
  );
  assert.equal(
    captureTitle(capture([{ designation: "M 31", name: "M 31" }]), fr),
    "M 31",
  );
  assert.equal(
    captureTitle(
      capture([
        { designation: "M 31", name: "Galaxie d’Andromède" },
        { designation: "M 33" },
      ]),
      fr,
    ),
    "M 31 — Galaxie d’Andromède · M 33",
  );
});

// The sticky « Ajouter une capture » of the list never covers the first
// card.
test("the foot stays over the page only while the first card is out of its strip — sweep of every scroll offset", () => {
  const viewport = 900;
  const footHeight = 64;
  const card = { top: 620, height: 330 };
  const strip = [viewport - footHeight, viewport];
  let covered = 0;
  let stuck = 0;
  for (let scroll = 0; scroll <= 1200; scroll += 1) {
    const rect = {
      top: card.top - scroll,
      bottom: card.top + card.height - scroll,
    };
    const sticks = footMayStick(rect, { viewport, footHeight });
    // The invariant: when the foot is over the page, it hides no part of
    // the card.
    const overlaps = rect.top < strip[1] && rect.bottom > strip[0];
    if (sticks) {
      stuck += 1;
      assert.equal(
        overlaps,
        false,
        `scroll ${scroll}: the foot covers the card`,
      );
    } else covered += 1;
  }
  // …and it does stick when it can: the card below the window, the card
  // gone above the strip.
  assert.ok(stuck > 600 && covered > 0, `${stuck} / ${covered}`);
  assert.equal(
    footMayStick({ top: 1000, bottom: 1330 }, { viewport, footHeight }),
    true,
  );
  assert.equal(
    footMayStick({ top: -200, bottom: 820 }, { viewport, footHeight }),
    true,
  );
  assert.equal(
    footMayStick({ top: 620, bottom: 950 }, { viewport, footHeight }),
    false,
  );
});

test("the server draws the foot in the flow (no overlay before the page has measured the first card)", () => {
  const markup = draw({
    state: state(page([capture()])),
  });
  assert.match(markup, /<div class="captures-footer">/);
  assert.doesNotMatch(markup, /captures-footer is-stuck/);
});

// ——— A server with no team looking at the captures (a private server) ———

/** The list's `publishing` of a server with no team. */
const noTeam = {
  publishing: {
    available: true,
    moderated: false,
    warningsCount: 0,
    blockedUntil: null,
  },
};
/** A capture as a server with no team states it: the sky, whatever was stored. */
function unchecked(automaticReason = "person_detected") {
  const one = capture({
    check: { automatic: "undetermined", automaticReason },
  });
  one.state = captureState({
    visibility: "private",
    checks: one.checks,
    now: NOW,
    moderated: false,
  });
  return one;
}

test("the three lines of its owner are worded in the ten languages, and nothing of a check or of a warning is", () => {
  const keys = ["ruleDecide", "rulePublic", "ruleResponsible"];
  for (const locale of shippedLocales()) {
    const words = capturesCopyFor(locale);
    for (const key of keys)
      assert.ok(
        typeof words[key] === "string" && words[key].trim().length > 0,
        `${locale} ${key}`,
      );
    assert.equal(
      new Set([words.ruleDecide, words.rulePublic, words.ruleResponsible]).size,
      3,
      locale,
    );
    // No warning before a publication, no confirmation: nothing to word.
    for (const key of ["notSkyPerson", "notSkyOther", "publishAnyway"])
      assert.equal(words[key], undefined, `${locale} ${key}`);
  }
  assert.equal(
    capturesCopyFor("en").ruleDecide,
    "You alone decide what is public, and you can make a capture private again at any time.",
  );
});

// The words of a team that checks the captures belong to the service that has
// one (`hosted-copy.js`); the core draws what a composition registers, and
// nothing without it.
test("an undetermined check says why in the words its team gave, nothing without a team or without words", (t) => {
  t.after(() => {
    registerCheckReasonWords(null);
    clearHostedCopy();
  });
  const undetermined = capture({
    check: { automatic: "undetermined", automaticReason: "unreadable" },
  });
  const sheet = (one = undetermined, pageChanges = {}) =>
    detail(one, { pageChanges });
  // No words registered: the line of the check, no reason.
  registerCheckReasonWords(null);
  lacks(textOf(sheet()), "WORDS-unreadable");
  assert.ok(!sheet().includes("capture-state-why"));
  // A team's words, registered by its composition.
  registerCheckReasonWords((locale, reason) => `WORDS-${reason}-${locale}`);
  registerHostedCopy("captures", () => ({
    auto: {
      sky: "CHECK-sky",
      person: "CHECK-person",
      undetermined: "CHECK-undetermined",
      other: "CHECK-other",
    },
  }));
  has(textOf(sheet()), "CHECK-undetermined", "WORDS-unreadable-fr");
  assert.match(
    sheet(),
    /<span class="capture-state-why">WORDS-unreadable-fr<\/span>/,
  );
  // No reason, no sentence; a passed check says no reason either.
  lacks(
    textOf(sheet(capture({ check: { automatic: "undetermined" } }))),
    "WORDS-",
  );
  lacks(
    textOf(sheet(capture({ check: { automaticReason: "unreadable" } }))),
    "WORDS-",
  );
  // Without a team nothing is checked: nothing is said of a check.
  const noTeamText = textOf(sheet(undetermined, noTeam));
  lacks(noTeamText, "WORDS-", "CHECK-");
});

test("without a team the publish dialog says in three lines that its owner decides — no verifier, no rules page, no warning", () => {
  const body = (one, props = {}) =>
    textOf(
      renderToStaticMarkup(
        createElement(PublishDialogBody, {
          capture: one,
          copy: fr,
          locale: "fr",
          moderated: false,
          ...props,
        }),
      ),
    );
  for (const one of [unchecked("person_detected"), capture({})]) {
    const text = body(one);
    has(text, fr.ruleDecide, fr.rulePublic, fr.ruleResponsible);
    has(text, "Ni le lieu, ni ses coordonnées");
    lacks(text, "Un vérificateur de l’équipe", "Règles de publication");
    lacks(text, "personne", "quand même");
  }
});

test("with the words of a team registered, the publish dialog says who looks and links the rules", (t) => {
  t.after(clearHostedCopy);
  registerHostedCopy("captures", () => ({
    publishVerifier: "VERIFIER-line",
    publishingRules: "RULES-link",
    publishingRulesPath: "/rules",
  }));
  const markup = renderToStaticMarkup(
    createElement(PublishDialogBody, {
      capture: unchecked(),
      copy: capturesCopyFor("fr"),
      locale: "fr",
    }),
  );
  has(textOf(markup), "VERIFIER-line", "RULES-link");
  assert.match(markup, /<a class="btn-link" href="\/fr\/rules">RULES-link/);
  lacks(textOf(markup), fr.ruleDecide);
});

test("without a team the detail of a capture offers « Publique » at once and says nothing of a check, a team or a rule", () => {
  const one = unchecked("person_detected");
  const markup = detail(one, { pageChanges: noTeam });
  const publicSwitch = (html, id) =>
    html.match(new RegExp(`<input[^>]*id="capture-public-${id}"[^>]*>`))?.[0];
  assert.ok(publicSwitch(markup, one.id), "the switch is drawn");
  assert.doesNotMatch(publicSwitch(markup, one.id), /aria-disabled/);
  const text = textOf(markup);
  lacks(
    text,
    "Demander une vérification",
    "Vérifiée par l’équipe",
    "Vérification automatique",
    "personne détectée",
  );
  // With a team the same capture is greyed (the switch follows the state).
  const teamOne = capture({
    check: { automatic: "undetermined", automaticReason: "person_detected" },
  });
  assert.match(
    publicSwitch(detail(teamOne), teamOne.id),
    /aria-disabled="true"/,
  );
  // The words of a reason are not even asked for.
  assert.equal(autoReasonWords(one, "fr", { moderated: false }), null);
});

test("without a team a public capture has no clock waiting for a team, and a notice links no rules page", () => {
  const published = capture({ visibility: "public" });
  published.state = captureState({
    visibility: "public",
    checks: published.checks,
    now: NOW,
    moderated: false,
  });
  assert.equal(published.state.teamLine, null);
  const pills = renderToStaticMarkup(
    createElement(CapturePills, { capture: published, copy: fr }),
  );
  assert.ok(pills.includes("capture-pill is-public "), pills);
  assert.ok(!pills.includes("is-warn"), pills);
  // With a team a public capture the team has not seen waits (a clock).
  const waiting = capture({ visibility: "public" });
  assert.ok(
    renderToStaticMarkup(
      createElement(CapturePills, { capture: waiting, copy: fr }),
    ).includes("is-warn"),
  );
  // The block's notice links the rules where a team writes them, not here.
  const blocked = {
    state: {
      state: "publishing_blocked",
      publishingBlockedUntil: "2026-12-01T00:00:00.000Z",
    },
  };
  const notice = (moderated) =>
    renderToStaticMarkup(
      createElement(CaptureStateNotices, {
        capture: blocked,
        copy: fr,
        locale: "fr",
        timeZone: "Europe/Paris",
        now: new Date(NOW),
        moderated,
      }),
    );
  assert.doesNotMatch(notice(true), /publishing-rules/);
  assert.doesNotMatch(notice(false), /publishing-rules/);
});

// ——— PORTAL-FINALIZE-PROMINENT-01: the banner of a draft ———

const bannerOf = (markup) =>
  /<section class="capture-draft-banner"[\s\S]*?<\/section>/.exec(
    markup,
  )?.[0] ?? null;
/** The elements of a React tree (a component called as a function). */
const elementsOf = (node, found = []) => {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, found);
    return found;
  }
  found.push(node);
  elementsOf(node.props?.children, found);
  return found;
};

test("a draft: the banner stands under « ← Toutes les captures » and above the image, with the sentence and the primary; « État » keeps its own primary", () => {
  const draft = capture({ stage: "draft" });
  const markup = detail(draft);
  const banner = bannerOf(markup);
  assert.ok(banner, "the banner is drawn");
  has(
    textOf(banner),
    "Brouillon : cette capture n’apparaît pas encore dans votre galerie privée.",
    "Finalisez-la quand elle est prête : elle apparaîtra alors dans votre galerie privée, et vous pourrez la rendre publique.",
    "Finaliser cette capture",
  );
  assert.match(banner, /role="status"/);
  assert.match(banner, /<button type="button" class="btn-primary">/);
  assert.equal(banner.match(/btn-primary/g).length, 1, "one primary per zone");
  const at = (needle) => markup.indexOf(needle);
  assert.ok(at("capture-back") < at("capture-draft-banner"), "after the link");
  assert.ok(
    at("capture-draft-banner") < at("capture-detail-image"),
    "before the image",
  );
  // The zone « État » is kept, with its own primary (two zones, two primaries).
  const zone =
    /<section class="capture-zone capture-state-zone"[\s\S]*?<\/section>/.exec(
      markup,
    )[0];
  has(textOf(zone), "Brouillon : la capture n’est pas encore finalisée.");
  assert.match(zone, /class="btn-primary"[^>]*>Finaliser cette capture/);
});

test("once finalized: no banner, no grey line left behind", () => {
  const markup = detail(capture({ stage: "finalized" }));
  assert.equal(bannerOf(markup), null);
  lacks(textOf(markup), "n’apparaît pas encore dans votre galerie privée");
});

test("read only (trial over, payment failed): the sentence stays, with no button and no hint", () => {
  const draft = capture({ stage: "draft" });
  const markup = detail(draft, { pageChanges: { readOnly: true } });
  const banner = bannerOf(markup);
  assert.ok(banner, "the sentence still says why the capture is not shown");
  has(
    textOf(banner),
    "Brouillon : cette capture n’apparaît pas encore dans votre galerie privée.",
  );
  lacks(textOf(banner), "Finaliser cette capture", "Finalisez-la quand");
  assert.doesNotMatch(banner, /<button/);
});

test("the banner's button is the zone's finalization: a click finalizes this capture; busy, it waits", () => {
  const draft = capture({ stage: "draft" });
  const finalized = [];
  const actions = { finalize: (one) => finalized.push(one.id) };
  const press = (busy) => {
    const tree = CaptureDraftBanner({
      capture: draft,
      copy: fr,
      context: { busy },
      actions,
    });
    return elementsOf(tree).find((node) => node.type === "button");
  };
  const button = press(null);
  assert.equal(button.props.className, "btn-primary");
  button.props.onClick();
  assert.deepEqual(finalized, [draft.id]);
  assert.equal(press(draft.id).props.disabled, true);
  assert.equal(
    CaptureDraftBanner({
      capture: { ...draft, stage: "finalized" },
      copy: fr,
      context: {},
      actions,
    }),
    null,
  );
});

test("the banner's words exist in the ten languages, each its own, and show on the detail", () => {
  const english = capturesCopyFor("en");
  const draft = capture({ stage: "draft" });
  assert.equal(shippedLocales().length, 10);
  for (const locale of shippedLocales()) {
    const copy = capturesCopyFor(locale);
    for (const key of ["draftBanner", "draftBannerHint"]) {
      assert.ok(copy[key]?.trim(), `${locale}.${key}`);
      if (locale !== "en")
        assert.notEqual(copy[key], english[key], `${locale}.${key} translated`);
    }
    const markup = draw({
      locale,
      state: state(page([draft]), {
        detail: { status: "ready", capture: draft },
      }),
      captureId: draft.id,
    });
    const banner = textOf(bannerOf(markup) ?? "");
    has(banner, plain(copy.draftBanner), plain(copy.draftBannerHint));
  }
});
