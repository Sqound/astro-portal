// The owner's detail drawn from data: each value with its
// pencil, its origin in one line, « · modifié », « · calculé »; the title
// open in place; a line corrected; the error
// lines; the read-only state (no pencil) — with the specified French words to
// the character (no-break spaces compared as plain ones).
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { CapturesView } =
  await import("portal/components/manage/CapturesTab.js");
const { metadataCopy, metadataCopyFor } =
  await import("portal/components/manage/capture-metadata-copy.js");
const {
  lineProblems,
  acquisitionOriginText,
  processingOriginText,
  nightLine,
  equipmentName,
  saveChangedSlots,
} = await import("portal/components/manage/CaptureMetadata.js");
const { captureState } = await import("portal/captures/capture-state.js");

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
const has = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(
      text.includes(plain(sentence)),
      `« ${sentence} » missing from: ${text.slice(0, 1200)}`,
    );
};
const lacks = (text, ...sentences) => {
  for (const sentence of sentences)
    assert.ok(
      !text.includes(plain(sentence)),
      `« ${sentence} » should not be drawn`,
    );
};
const zone = (markup, name) => {
  const found = new RegExp(
    `<section class="capture-zone capture-meta-zone[a-z -]*" aria-label="${name}"[\\s\\S]*?</section>`,
  ).exec(markup);
  assert.ok(found, `zone ${name}`);
  return found[0];
};

const origin = (value, source = null, extra = {}) => ({
  value,
  source,
  at: null,
  edited: false,
  ...extra,
});
const SYNC_AT = "2026-10-08T07:41:00.000Z";
const line = (id, filter, frames, exposure, extra = {}) => ({
  id,
  filter,
  frameCount: frames,
  exposureSeconds: exposure,
  gain: 100,
  integrationSeconds: frames * exposure,
  origin: "astro-sync",
  provenance: "measured",
  editedAt: null,
  edited: false,
  ...extra,
});

/** The metadata of M31 as the page draws it. */
function metadata() {
  return {
    title: origin(null),
    description: origin(
      "Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
      "owner",
      { edited: true },
    ),
    notes: origin(
      "Rosée sur la lunette vers 2 h : les poses de 2:10 à 2:30 sont retirées de l’empilement.",
      "owner",
      { edited: true },
    ),
    calibration: origin("30 darks · 30 flats · 30 dark-flats", "astro-sync"),
    sensor: origin({ temperatureC: -10, binning: 1 }, "astro-sync"),
    acquisition: {
      source: "astro-sync",
      at: SYNC_AT,
      edited: true,
      own: true,
      lines: [
        line("dual", "Dual-band", 38, 180, {
          edited: true,
          editedAt: NOW,
        }),
        line("clear", null, 20, 120),
      ],
      totalFrames: 58,
      totalSeconds: 9240,
    },
    equipment: {
      telescope: origin({ id: "scope", name: "Askar 50P" }, "plan"),
      camera: origin({ id: "cam", name: "ZWO ASI533MC Pro" }, "plan"),
      mount: origin({ id: "mount", name: "ZWO AM5N" }, "plan"),
      filters: origin([{ id: "filter", name: "Dual-band" }], "owner", {
        edited: true,
      }),
    },
    processing: {
      software: origin("Siril 1.4.4 · Adobe Photoshop", "astro-sync"),
      steps: origin(
        "Calibration, alignement, empilement, étirement, réduction du bruit",
        "owner",
        { edited: true },
      ),
    },
    sessionId: "night-1",
    night: {
      value: {
        title: "Nuit d’octobre au col",
        date: "2026-10-05",
        startedAt: "2026-10-05T21:40:00.000Z",
        finishedAt: "2026-10-06T04:50:00.000Z",
      },
      source: "plan",
      planName: "Nuit d’octobre au col",
    },
    place: { value: { name: "Col des Étoiles" }, source: "plan" },
    computed: {
      skyQuality: { bortle: 4 },
      moon: { illumination: 12, setsAt: "2026-10-05T23:10:00.000Z" },
    },
  };
}

const checks = {
  automatic: "sky",
  automaticAt: "2026-10-06T22:00:00.000Z",
  team: "approved",
  teamAt: null,
  teamReason: null,
  reviewRequestedAt: null,
  protectionNoticeAt: null,
  protectionLiftedAt: null,
  removedFromGalleryAt: null,
};
const image = (id, main, extra = {}) => ({
  id,
  main,
  sha256: "9c1e5a7d".padEnd(60, "0") + "4b07",
  byteSize: 14 * 1024 * 1024,
  originalName: "M31_final.jpg",
  width: 4000,
  height: 2670,
  source: "phone",
  public: false,
  automaticCheck: "sky",
  createdAt: "2026-10-06T21:02:00.000Z",
  thumbnail: true,
  title: null,
  description: null,
  titleSource: null,
  edited: false,
  arrivalRank: 1,
  ...extra,
});
function m31(changes = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000031",
    sessionId: "night-1",
    planId: "plan-1",
    targetIds: ["m31"],
    originalName: "M31_final.jpg",
    sha256: "9c1e5a7d".padEnd(60, "0") + "4b07",
    byteSize: 14 * 1024 * 1024,
    status: "uploaded",
    visibility: "public",
    stage: "finalized",
    finalizedAt: "2026-10-06T21:02:00.000Z",
    checks,
    createdAt: "2026-10-06T21:02:00.000Z",
    state: captureState({ visibility: "public", checks, now: NOW }),
    preview: true,
    thumbnail: true,
    showable: true,
    protectionLapsed: false,
    tags: ["automne", "col"],
    galleryLabel: "Galaxie",
    telescope: "Askar 50P",
    targets: [],
    integrationMinutes: 154,
    detail: {
      targets: [{ id: "m31", designation: "M31", name: "Galaxie d’Andromède" }],
      night: "2026-10-05",
      addedAt: "2026-10-06T21:02:00.000Z",
      fileName: "M31_final.jpg",
      byteSize: 14 * 1024 * 1024,
      equipment: ["Askar 50P", "ZWO ASI533MC Pro"],
      skyQuality: { bortle: 4 },
      place: { name: "Col des Étoiles" },
    },
    metadata: metadata(),
    variants: [
      image("main", true, {
        title: "Rendu naturel",
        description: "Traitée sur l’ordinateur, envoyée depuis le téléphone.",
        titleSource: "owner",
        edited: true,
      }),
      image("stack", false, {
        title: "Rendu brut",
        description: "Les couleurs du capteur, sans retouche de teinte.",
        titleSource: "astro-sync",
        source: "stacking",
        originalName: "IMG_2041.tif",
        arrivalRank: 3,
        createdAt: SYNC_AT,
      }),
    ],
    ...changes,
  };
}

const draw = (capture, extra = {}, page = {}, actions = {}) =>
  renderToStaticMarkup(
    createElement(CapturesView, {
      locale: "fr",
      actions,
      timeZone: "UTC",
      now: new Date(NOW),
      wide: true,
      captureId: capture.id,
      state: {
        list: {
          status: "ready",
          page: {
            captures: [capture],
            hasMore: false,
            nextBefore: null,
            storage: {
              usedBytes: 1,
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
            nights: [
              {
                sessionId: "night-1",
                planId: "plan-1",
                night: "2026-10-05",
                place: "Col des Étoiles",
                targets: [],
              },
              {
                sessionId: "night-2",
                planId: null,
                night: "2026-10-07",
                place: null,
                targets: [],
              },
            ],
            places: [],
            readOnly: false,
            ...page,
          },
        },
        detail: { status: "ready", capture },
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

test("the zones in their fixed order, each value with its pencil named by its object, its origin line, « · modifié » and « · calculé »", () => {
  const markup = draw(m31());
  const text = textOf(markup);
  has(
    text,
    "M31 — Galaxie d’Andromède",
    "Titre d’après les cibles de la capture.",
    "Description",
    "Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
    "Saisie par vous · visible dans les galeries.",
    "Finalisée le 6 oct. 2026.",
    "La session",
    "Ouvrir la session",
    "D’après la session du plan « Nuit d’octobre au col » ; le lieu se change sur la page de la session.",
    "Nuit du lun. 5 oct. 2026 · 21:40 → 04:50 (mar. 6 oct.) · UTC",
    "Col des Étoiles (jamais publié)",
    "Bortle 4 · calculé",
    "Illuminée à 12 %, couchée à 23:10 · calculé",
    "Intégrations",
    "Mesurées par Astro Sync le 8 oct. à 07:41 ; elles remplacent les lignes déclarées par la session. Vous pouvez corriger chaque ligne.",
    "Dual-band 38 180 s 100 1 h 54 mesurée, modifiée par vous",
    "Sans filtre 20 120 s 100 40 min mesurée par Astro Sync",
    "Total 58 poses 2 h 34",
    "Ajouter une ligne",
    "Calibration 30 darks · 30 flats · 30 dark-flats",
    "Capteur −10 °C · binning 1 × 1",
    "Matériel",
    "D’après le plan « Nuit d’octobre au col » ; chaque choix vient de votre onglet « Matériel ».",
    "Télescope Askar 50P",
    "Caméra ZWO ASI533MC Pro",
    "Monture ZWO AM5N",
    "Filtre Dual-band · modifié",
    "Traitement",
    "Logiciels Siril 1.4.4 · Adobe Photoshop",
    "Étapes Calibration, alignement, empilement, étirement, réduction du bruit",
    "Notes",
    "Pour vous seulement : jamais publiées.",
    "Rendu brut",
    "D’après Astro Sync (pipeline « Rendu brut »).",
    "Saisis par vous.",
  );
  // The order of the zones.
  const order = [
    "M31 — Galaxie d’Andromède",
    "Saisie par vous · visible",
    "Fichier",
    "Variantes",
    "Finalisée le",
    "La session",
    "Intégrations",
    "Matériel",
    "Traitement",
    "Pour vous seulement",
    "Tags",
    "Supprimer la capture",
  ].map((word) => text.indexOf(plain(word)));
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    String(order),
  );
  // A pencil per value, named by its object (rules 7 and 8).
  for (const name of [
    "Modifier le titre",
    "Modifier la description",
    "Changer la session de la capture",
    "Modifier la ligne Dual-band",
    "Supprimer la ligne Dual-band",
    "Modifier le titre et la description",
  ])
    assert.match(markup, new RegExp(`aria-label="${name}"`), name);
  // One « Modifier » per card — never the same pencil on every line of a
  // card; the card's own name says which card it opens.
  for (const [card, name] of [
    ["Intégrations", "Calibration · Capteur"],
    ["Matériel", "Matériel"],
    ["Traitement", "Traitement"],
    ["Notes", "Notes"],
  ]) {
    const html = zone(markup, card);
    const buttons = html.match(/<button[^>]*>Modifier<\/button>/g) ?? [];
    assert.equal(buttons.length, 1, `${card}: one « Modifier »`);
    assert.match(
      buttons[0],
      new RegExp(
        `aria-label="Modifier la section « ${name} »"`.replace(/ /g, "[  ]"),
      ),
      card,
    );
    assert.doesNotMatch(
      html.replace(/<tr[\s\S]*?<\/tr>/g, ""),
      /class="capture-pencil"/,
      `${card}: no pencil on a line`,
    );
  }
  // The row of a value is no longer a button, nor a click to edit.
  for (const field of ["calibration", "sensor", "equipment.cameraId", "notes"])
    assert.doesNotMatch(
      new RegExp(
        `<div class="capture-meta-row[^"]*" data-field="${field}">`,
      ).exec(markup)[0],
      /is-editable/,
      field,
    );
  // No pencil on the place, the sky quality, the Moon (computed or the night's).
  for (const field of ["place", "sky", "moon"]) {
    const row = new RegExp(
      `<div class="capture-meta-row" data-field="${field}">[\\s\\S]*?</div>`,
    ).exec(markup)[0];
    assert.doesNotMatch(row, /capture-pencil/, field);
  }
  // « Ouvrir la session » a link to the night's page; no primary in reading.
  assert.match(
    markup,
    /<a class="btn-link" href="\/fr\/sessions\/night-1">Ouvrir la session<\/a>/,
  );
  for (const name of [
    "La session",
    "Intégrations",
    "Matériel",
    "Traitement",
    "Notes",
  ])
    assert.doesNotMatch(zone(markup, name), /btn-primary/, name);
  // « Ajouter une ligne » a tertiary; the facts card is gone.
  assert.match(markup, /class="btn-tertiary"[^>]*>Ajouter une ligne</);
  assert.doesNotMatch(markup, /capture-facts/);
});

test("the title open in place — the field, its counter, its help, « Annuler » a link, « Enregistrer le titre » the primary greyed while unchanged", () => {
  const markup = draw(m31(), {
    editingField: "title",
    fieldDraft: { draft: "M31 — Galaxie d’Andromède, première nuit d’automne" },
  });
  const text = textOf(markup);
  has(
    text,
    "Titre de la capture",
    "50 / 80",
    "Les cibles ne changent pas ; vide, le titre redevient « M31 — Galaxie d’Andromède ».",
    "Annuler",
    "Enregistrer le titre",
  );
  assert.match(markup, /class="btn-link"[^>]*>Annuler/);
  assert.match(markup, /class="btn-primary"[^>]*>Enregistrer le titre/);
  // One field open at a time: no other editor is drawn.
  assert.equal((markup.match(/class="capture-meta-editor/g) || []).length, 1);
  // Unchanged: the primary greyed.
  const same = draw(m31(), { editingField: "title" });
  assert.match(same, /class="btn-primary" disabled="">Enregistrer le titre/);
});

test("a line corrected in place — four fields, the integration computed, the help line, « Enregistrer la ligne »", () => {
  const markup = draw(m31(), { editingField: "line:dual" });
  const text = textOf(markup);
  has(
    text,
    "1 h 54",
    "L’intégration se calcule : poses × exposition. Astro Sync ne changera plus cette ligne.",
    "Annuler",
    "Enregistrer la ligne",
    "Sans filtre 20 120 s 100 40 min",
  );
  assert.match(markup, /value="Dual-band"/);
  assert.match(markup, /value="38"/);
  assert.match(markup, /value="180"/);
});

test("the error lines — a zero exposure (« — » for the integration and the total), an image title of 94 characters; the input kept, the primary active", () => {
  const markup = draw(m31(), {
    editingField: "line:dual",
    fieldDraft: {
      draft: {
        filter: "Dual-band",
        frameCount: "38",
        exposureSeconds: "0",
        gain: "100",
      },
      checked: true,
    },
  });
  const text = textOf(markup);
  has(
    text,
    "Exposition : indiquez une durée de plus de 0 s.",
    "Total 58 poses —",
  );
  assert.match(markup, /value="0"/);
  assert.match(markup, /class="btn-primary">Enregistrer la ligne/);
  // The example title is 62 characters; the line below is 94.
  const title94 =
    "Rendu brut, sans correction de teinte ni réduction des étoiles".padEnd(
      94,
      ".",
    );
  assert.equal([...title94].length, 94);
  const variants = draw(m31(), {
    editingImage: "stack",
    fieldDraft: {
      title: title94,
      description:
        "Les couleurs du capteur, sans retouche de teinte. Les étoiles gardent leur taille.",
    },
  });
  has(
    textOf(variants),
    "Le titre tient en 90 caractères au plus : retirez-en 4.",
    "94 / 90",
    `${[..."Les couleurs du capteur, sans retouche de teinte. Les étoiles gardent leur taille."].length} / 280`,
    "Enregistrer le titre et la description",
  );
  assert.equal(
    lineProblems(metadataCopyFor("fr"), {
      filter: "",
      frameCount: "0",
      exposureSeconds: "1",
    }).length,
    1,
  );
});

test("read only — the notice with « Voir les offres », no pencil, no switch, no « Ajouter », no « Enregistrer les tags », no « Supprimer »; the values and their marks readable, the download kept", () => {
  const markup = draw(m31(), {}, { readOnly: true });
  const text = textOf(markup);
  has(
    text,
    "Votre abonnement est terminé : votre espace est en lecture seule. Tout reste visible ; rien ne se modifie.",
    "Dual-band · modifié",
    "Bortle 4 · calculé",
    "Télécharger l’original",
    "Principale",
    "D’après Astro Sync, le 8 oct. à 07:41 (paliers de M31).",
  );
  lacks(
    text,
    "Ajouter une ligne",
    "Synchroniser avec la session",
    "Enregistrer les tags",
    "Supprimer la capture",
    "Rendre cette variante publique",
    "Utiliser comme image principale",
    "vous pouvez corriger chaque ligne",
  );
  assert.doesNotMatch(markup, /capture-pencil/);
  assert.doesNotMatch(markup, /role="switch"/);
});

test("the origin lines in their words: the night's steps, the processing from two sources, a night without plan", () => {
  const meta = metadataCopyFor("fr");
  const night = metadata();
  night.acquisition = { ...night.acquisition, own: false, source: "night" };
  assert.equal(
    plain(
      acquisitionOriginText(meta, night, {
        locale: "fr",
        timeZone: "UTC",
        targets: "M31",
        readOnly: false,
      }),
    ),
    "D’après la session ; vous pouvez corriger chaque ligne.",
  );
  assert.equal(
    plain(processingOriginText(meta, metadata())),
    plain("Logiciel d’après Astro Sync ; les étapes sont saisies par vous."),
  );
  const photo = metadata();
  photo.processing.software = origin("Adobe Photoshop 26.0", "photo");
  photo.processing.steps = origin(null);
  assert.equal(processingOriginText(meta, photo), "Logiciel d’après la photo.");
  assert.equal(
    plain(
      nightLine(
        meta,
        { value: { date: "2026-10-05", startedAt: null, finishedAt: null } },
        "fr",
      ),
    ),
    "Nuit du lun. 5 oct. 2026",
  );
  for (const locale of ["en"]) {
    const words = metadataCopyFor(locale);
    assert.ok(words.addLine && words.notesPrivate && words.readOnly, locale);
  }
});

// « La session », the block « Intégrations » with its provenance per line
// and « Synchroniser avec la session », and the intermediate line of a
// capture that is a step of a multi-night plan in progress.
test("« Intégrations » says where each line comes from, offers « Synchroniser avec la session » (secondary) beside « Ajouter une ligne à la main » (tertiary), and the intermediate line names the sessions done and planned", () => {
  const actions = { syncAcquisition() {} };
  const own = (lines, source, extra = {}) => {
    const value = m31();
    value.metadata.acquisition = {
      source,
      at: SYNC_AT,
      edited: false,
      own: lines.length > 0,
      lines,
      totalFrames: lines.reduce((sum, entry) => sum + entry.frameCount, 0),
      totalSeconds: lines.reduce(
        (sum, entry) => sum + entry.integrationSeconds,
        0,
      ),
      ...extra,
    };
    return value;
  };
  // Empty: the hint, the session's day, the two actions.
  const empty = draw(own([], null), {}, {}, actions);
  const emptyZone = textOf(zone(empty, "Intégrations"));
  has(
    emptyZone,
    "Comment l’image a été faite : filtre, poses, temps de pose, instrument. Une ligne par famille de poses.",
    "Reprend les cibles, les temps et les poses de la session du 5 oct.",
    "Ajouter une ligne à la main",
    "Synchroniser avec la session",
  );
  assert.match(
    zone(empty, "Intégrations"),
    /class="btn-secondary" data-action="sync-acquisition"[^>]*>Synchroniser avec la session</,
  );
  assert.match(
    zone(empty, "Intégrations"),
    /class="btn-tertiary"[^>]*>Ajouter une ligne à la main</,
  );
  assert.doesNotMatch(zone(empty, "Intégrations"), /btn-primary/);

  // Declared by the session, one without its frames, one measured and
  // corrected, one by hand: the provenance of each, the origin line, the total.
  const mixed = own(
    [
      line("declared:m31", "Dual-band", 0, 0, {
        origin: "session",
        provenance: "declared",
        integrationSeconds: 6840,
      }),
      line("clear", null, 20, 120, {
        edited: true,
        editedAt: NOW,
        origin: "astro-sync",
      }),
      line("ha", "Hα 7 nm", 12, 300, {
        origin: "owner",
        provenance: "manual",
      }),
    ],
    "night",
  );
  const filled = draw(mixed, {}, {}, actions);
  const filledZone = zone(filled, "Intégrations");
  const filledText = textOf(filledZone);
  has(
    filledText,
    "Synchronisées avec la session du 5 oct., le 8 oct. à 07:41 ; vous pouvez corriger chaque ligne.",
    "Provenance",
    "Dual-band — — 100 1 h 54 déclarée par la session",
    "Sans filtre 20 120 s 100 40 min mesurée, modifiée par vous",
    "Hα 7 nm 12 300 s 100 1 h saisie à la main",
    "Synchroniser de nouveau",
    "Ajouter une ligne",
  );
  lacks(filledText, "Ajouter une ligne à la main", "Reprend les cibles");
  // Measured by Astro Sync: it replaces the lines the session declared.
  has(
    textOf(
      zone(
        draw(
          own([line("a", "Dual-band", 38, 180)], "astro-sync"),
          {},
          {},
          actions,
        ),
        "Intégrations",
      ),
    ),
    "Mesurées par Astro Sync le 8 oct. à 07:41 ; elles remplacent les lignes déclarées par la session. Vous pouvez corriger chaque ligne.",
  );
  // A capture without a session has no synchronisation, only the hand.
  const alone = m31();
  alone.metadata.sessionId = null;
  alone.metadata.acquisition = { ...own([], null).metadata.acquisition };
  const aloneZone = zone(draw(alone, {}, {}, actions), "Intégrations");
  assert.doesNotMatch(aloneZone, /sync-acquisition/);
  has(textOf(aloneZone), "Ajouter une ligne à la main");
  // Read only: no action at all.
  const readOnly = zone(
    draw(mixed, {}, { readOnly: true }, actions),
    "Intégrations",
  );
  assert.doesNotMatch(readOnly, /sync-acquisition|btn-tertiary/);

  // The intermediate line: sessions done (a link each), then the planned ones greyed.
  const step = m31();
  step.detail.intermediate = {
    projectId: "project-ic1805",
    projectName: "IC 1805",
    sessionsDone: [
      { eveningDate: "2026-08-09", sessionId: "ses-9", planId: "plan-9" },
      { eveningDate: "2026-08-10", sessionId: "ses-10", planId: "plan-10" },
    ],
    sessionsPlanned: [
      { eveningDate: "2026-10-17", sessionId: null, planId: "plan-17" },
    ],
  };
  const stepMarkup = draw(step, {}, {}, actions);
  const stepText = textOf(stepMarkup);
  has(
    stepText,
    "Cette image est une étape intermédiaire d’une série prévue sur cette cible.",
    "✓ Dim. 9 août · session",
    "✓ Lun. 10 août · session",
    "○ Sam. 17 oct. · prévue",
    "Ouvrir le plan multi-nuits IC 1805",
  );
  assert.match(stepMarkup, /href="\/fr\/sessions\/ses-9"/);
  assert.match(
    stepMarkup,
    /href="\/fr\/planner\?view=plans&amp;kind=multi&amp;multiNight=project-ic1805"/,
  );
  assert.match(stepMarkup, /<li class="is-planned" data-state="planned">/);
  // No intermediate: nothing is drawn.
  assert.doesNotMatch(draw(m31(), {}, {}, actions), /capture-intermediate/);
});

// What the web takes from the captures exchange fixtures, and only that.
const { readFile } = await import("node:fs/promises");
const exchange = async (name) =>
  JSON.parse(
    await readFile(
      new URL(
        `../../astro-contracts/fixtures/captures-exchange-${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ).response.body;
const { describeConflict } =
  await import("portal/components/manage/capture-conflict.js");
const { capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");
const quality = {
  fwhmPixels: 2.8,
  fwhmArcsec: 2.1,
  eccentricity: 0.38,
  starCount: 12480,
  measuredOn: "linear",
  measuredAt: "2026-10-06T22:10:00.000Z",
  tool: { name: "Astro Sync", version: "1.8" },
};
const sessionQuality = {
  sessionId: "night-1",
  eveningDate: "2026-10-05",
  frameCount: 58,
  skyBackground: 905,
  fwhm: 2.6,
  eccentricity: 0.42,
};

test("the session's line sits under the pills — « Session du 5 au 6 oct. », « Voir la session » secondary; without a session one line + ⓘ; the image of a plan says it combines sessions; a replacement is told", () => {
  const withSession = draw(
    m31({ replacedAt: SYNC_AT, replacedSource: "phone" }),
  );
  const text = textOf(withSession);
  has(
    text,
    "Session du 5 au 6 oct.",
    "Voir la session",
    "Astro Sync a remplacé la photo envoyée du téléphone par son image.",
  );
  assert.match(
    withSession,
    /<a class="btn-secondary" href="\/fr\/sessions\/night-1">Voir la session<\/a>/,
  );
  // Under the pills, before the zones; the zone's own link stays.
  assert.ok(
    withSession.indexOf("capture-pills") <
      withSession.indexOf("capture-session-line"),
  );
  assert.ok(
    withSession.indexOf("capture-session-line") <
      withSession.indexOf('data-zone="description"'),
  );
  has(text, "Ouvrir la session");
  // Across a month: both dates are written.
  const april = m31();
  april.metadata.night.value.date = "2026-04-30";
  april.metadata.night.value.startedAt = "2026-04-30T21:40:00.000Z";
  has(textOf(draw(april)), "Session du 30 avr. au 1 mai");
  // No session: the line and its ⓘ, no button.
  const alone = m31();
  alone.metadata.sessionId = null;
  alone.sessionId = null;
  const loose = draw(alone);
  has(textOf(loose), "Cette capture n’est liée à aucune session.");
  assert.doesNotMatch(loose, /Voir la session/);
  assert.match(loose, /class="info-line capture-session-line"/);
  // Said once on the sheet: the line under the pills, not again as the
  // origin of the zone « La session » (the row there keeps its dash and its
  // pencil).
  assert.equal(
    (textOf(loose).match(/aucune session/g) ?? []).length,
    1,
    "« aucune session » is said once",
  );
  // The image of a multi-night plan: no « aucune session ».
  const plan = m31({ projectId: "project-ic1805" });
  plan.metadata.sessionId = null;
  const planText = textOf(draw(plan));
  has(planText, "Cette image combine les sessions d’un plan multi-nuits.");
  lacks(planText, "Cette capture n’est liée à aucune session.");
  // Nothing replaced: nothing said.
  lacks(textOf(draw(m31())), "a remplacé la photo");
});

test("« Qualité des captures » in two parts after « Intégrations » — « Cette image » (the stacked image's FWHM in arc seconds, else pixels) and « La session » (the three medians, « Voir la session ») —, each absent when its data is null, the zone absent when both are; read-only keeps it", async () => {
  // The service's own answer (fixture `detail-both-qualities`) draws both.
  const served = (await exchange("detail-both-qualities")).capture;
  has(
    textOf(zone(draw(served), "Qualité des captures")),
    "Cette image",
    "2,10″ FWHM des étoiles",
    "0,38 Excentricité",
    "1 840 étoiles mesurées",
    "La session",
    "1 300 ADU Fond du ciel",
    "2,16″ FWHM des étoiles",
    "Médianes de la nuit du 5 oct.",
  );
  const both = m31({ quality });
  both.detail.sessionQuality = sessionQuality;
  const markup = draw(both);
  const qualityZone = textOf(zone(markup, "Qualité des captures"));
  has(
    qualityZone,
    "Cette image",
    "2,10″ FWHM des étoiles",
    "0,38 Excentricité",
    "12 480 étoiles mesurées",
    "Mesurée par Astro Sync sur l’image empilée, avant traitement.",
    "La session",
    "905 ADU Fond du ciel",
    "2,60″ FWHM des étoiles",
    "0,42 Excentricité",
    "Médianes de la nuit du 5 oct. : le détail par pose est dans la session.",
    "Voir la session",
  );
  // After « Intégrations », before « Matériel ».
  assert.ok(
    markup.indexOf('aria-label="Intégrations"') <
      markup.indexOf('aria-label="Qualité des captures"'),
  );
  assert.ok(
    markup.indexOf('aria-label="Qualité des captures"') <
      markup.indexOf('aria-label="Matériel"'),
  );
  assert.match(
    zone(markup, "Qualité des captures"),
    /<a class="btn-link" href="\/fr\/sessions\/night-1">Voir la session<\/a>/,
  );
  // Without the pixel scale: pixels; no eccentricity: no tile.
  const pixels = m31({
    quality: { ...quality, fwhmArcsec: null, eccentricity: null },
  });
  const pixelText = textOf(zone(draw(pixels), "Qualité des captures"));
  has(pixelText, "2,8 px FWHM des étoiles");
  lacks(pixelText, "Excentricité", "La session");
  // Only the session's: no « Cette image ».
  const sessionOnly = m31();
  sessionOnly.detail.sessionQuality = sessionQuality;
  const sessionOnlyText = textOf(
    zone(draw(sessionOnly), "Qualité des captures"),
  );
  has(sessionOnlyText, "La session", "905 ADU Fond du ciel");
  lacks(sessionOnlyText, "Cette image");
  // Neither (or a session whose medians are all null): no zone.
  assert.doesNotMatch(draw(m31()), /Qualité des captures/);
  const empty = m31({ quality: null });
  empty.detail.sessionQuality = {
    ...sessionQuality,
    skyBackground: null,
    fwhm: null,
    eccentricity: null,
  };
  assert.doesNotMatch(draw(empty), /Qualité des captures/);
  // The window of an ended subscription still reads it.
  has(
    textOf(draw(both, {}, { readOnly: true })),
    "Qualité des captures",
    "Cette image",
  );
});

test("a field that changed on another device — the open editor keeps what was typed, shows both values and asks which to keep (« Garder ma version » the primary, « Garder la version actuelle » the secondary); a field without an editor is said above the detail", () => {
  const meta = metadataCopyFor("fr");
  const copy = capturesCopyFor("fr");
  const current = m31();
  current.metadata.title = origin("Titre écrit ailleurs", "owner", {
    edited: true,
  });
  const described = describeConflict({
    meta,
    copy,
    locale: "fr",
    field: "title",
    capture: current,
    editing: "title",
  });
  assert.equal(described.key, "title");
  assert.equal(described.inline, true);
  assert.equal(described.current, "Titre écrit ailleurs");
  const markup = draw(current, {
    editingField: "title",
    fieldDraft: { draft: "Mon titre" },
    conflict: described,
  });
  has(
    textOf(markup),
    "« Titre de la capture » a changé sur un autre appareil. Choisissez la version à garder.",
    "Votre saisie : Mon titre",
    "Valeur actuelle : Titre écrit ailleurs",
    "Garder la version actuelle",
    "Garder ma version",
  );
  // The two choices replace « Annuler » and the save: the strongest last.
  assert.doesNotMatch(textOf(markup), /Enregistrer le titre/);
  assert.match(
    markup,
    /capture-conflict-keep-current[^>]*>[^<]*<\/button><button[^>]*btn-primary[^>]*capture-conflict-keep-mine|btn-secondary[^>]*capture-conflict-keep-current[\s\S]*btn-primary[^>]*capture-conflict-keep-mine/,
  );
  // What was typed is kept; it is the entry, not the other hand's value.
  assert.match(markup, /value="Mon titre"/);
  // Said once: by the editor, not by the page.
  assert.doesNotMatch(markup, /capture-notice/);
  assert.doesNotMatch(markup, /L’enregistrement n’a pas abouti/);

  // A line of the integrations changed elsewhere: its name, its figures.
  const line38 = describeConflict({
    meta,
    copy,
    locale: "fr",
    field: "acquisition",
    line: "dual",
    capture: current,
    editing: "line:dual",
  });
  assert.equal(line38.key, "line:dual");
  assert.equal(line38.current, "Dual-band · 38 × 180 s");
  assert.deepEqual(line38.currentLine.slice(0, 2), ["Dual-band", "38 × 180 s"]);
  assert.equal(line38.fromSync, false, "a correction of the owner");
  assert.match(
    plain(line38.message),
    /^« Dual-band » a changé sur un autre appareil\./,
  );
  const lineMarkup = draw(current, {
    editingField: "line:dual",
    conflict: line38,
  });
  // The two versions of the line side by side, three cells each.
  assert.match(lineMarkup, /data-side="yours"/);
  assert.match(lineMarkup, /data-side="current"/);
  has(
    textOf(lineMarkup),
    "Votre saisie",
    "Valeur actuelle",
    "Dual-band",
    "38 × 180 s",
    "Garder ma version",
  );

  // Where the current value comes from: Astro Sync, when it is Astro Sync's
  // and the owner did not correct it.
  const measured = m31();
  measured.metadata.description = origin("Décrit par Astro Sync", "astro-sync");
  const fromSync = describeConflict({
    meta,
    copy,
    locale: "fr",
    field: "description",
    capture: measured,
    editing: "description",
  });
  assert.equal(fromSync.fromSync, true);
  has(
    textOf(
      draw(measured, {
        editingField: "description",
        fieldDraft: { draft: "Ma description" },
        conflict: fromSync,
      }),
    ),
    "Valeur actuelle (Astro Sync) : Décrit par Astro Sync",
    "Votre saisie : Ma description",
  );

  // « Finaliser »: no editor is open — the page says it, above the detail.
  const stage = describeConflict({
    meta,
    copy,
    locale: "fr",
    field: "stage",
    capture: current,
    editing: null,
  });
  assert.equal(stage.inline, false);
  const above = draw(current, { conflict: stage });
  has(textOf(above), "« État » a changé sur un autre appareil.");
  assert.ok(
    above.indexOf("capture-notice") < above.indexOf("capture-detail-title"),
  );
  // The tags: the field says it, with the tags as they are now.
  const tags = describeConflict({
    meta,
    copy,
    locale: "fr",
    field: "tags",
    capture: current,
  });
  assert.equal(tags.current, "automne, col");
  const tagMarkup = draw(current, { conflict: tags });
  has(
    textOf(tagMarkup),
    "« Tags » a changé sur un autre appareil.",
    "Votre saisie : automne, col",
    "Valeur actuelle : automne, col",
    "Garder la version actuelle",
  );
  assert.doesNotMatch(tagMarkup, /capture-notice/);
});

test("the image of a plan lists its lines by session with the day of each, the sentence of its origin, « Synchroniser avec les sessions du plan », what the plan left out; « Mesurées par Astro Sync … depuis « <appareil> » »; the intermediate lines with their duration", async () => {
  // The service's own answer (fixture `detail-plan-image`): its lines by
  // session, a declared one without frames, the head line of a plan image.
  const served = (await exchange("detail-plan-image")).capture;
  const servedMarkup = draw(served, {}, {}, { syncAcquisition() {} });
  has(
    textOf(zone(servedMarkup, "Intégrations")),
    "Image d’un plan multi-nuits : ses lignes viennent des sessions qu’elle combine.",
    "Dual-band 40 180 s 100 2 h mesurée par Astro Sync 6 oct.",
    "déclarée par la session 7 oct.",
    "Synchroniser avec les sessions du plan",
  );
  has(
    textOf(servedMarkup),
    "Cette image combine les sessions d’un plan multi-nuits.",
  );
  const plan = m31({
    projectId: "project-ic1805",
    plan: {
      combinedNightIds: ["ses-9", "ses-10"],
      totalsByFilter: [],
      render: "dualband",
    },
  });
  plan.metadata.sessionId = null;
  plan.metadata.acquisition = {
    source: "astro-sync",
    at: SYNC_AT,
    edited: false,
    own: true,
    lines: [
      line("plan:ses-9:ic1805:bi", "Bibande", 98, 180, {
        sessionId: "ses-9",
        eveningDate: "2026-08-09",
      }),
      line("plan:ses-10:ic1805:rgb", "RGB", 89, 90, {
        sessionId: "ses-10",
        eveningDate: "2026-08-10",
        origin: "session",
        provenance: "declared",
      }),
    ],
    totalFrames: 187,
    totalSeconds: 98 * 180 + 89 * 90,
  };
  plan.detail.intermediate = {
    projectId: "project-ic1805",
    projectName: "IC 1805",
    sessionsDone: [
      {
        eveningDate: "2026-08-09",
        sessionId: "ses-9",
        planId: null,
        acquiredSeconds: 17640,
      },
      {
        eveningDate: "2026-08-10",
        sessionId: "ses-10",
        planId: null,
        acquiredSeconds: 8010,
      },
      {
        eveningDate: "2026-08-12",
        sessionId: "ses-12",
        planId: null,
        acquiredSeconds: 14400,
      },
    ],
    sessionsPlanned: [
      {
        eveningDate: "2026-10-17",
        sessionId: null,
        planId: "plan-17",
        acquiredSeconds: null,
      },
    ],
  };
  const markup = draw(plan, {}, {}, { syncAcquisition() {} });
  const integrations = zone(markup, "Intégrations");
  has(
    textOf(integrations),
    "Image du plan multi-nuits IC 1805 : ses lignes viennent des sessions qu’elle combine.",
    "Bibande 98 180 s 100 4 h 54 mesurée par Astro Sync 9 août",
    "RGB 89 90 s 100 2 h 14 déclarée par la session 10 août",
    "Total 187 poses 7 h 08",
    "non combinée : 12 août · 4 h",
    "Synchroniser avec les sessions du plan",
  );
  assert.match(
    integrations,
    /class="btn-secondary" data-action="sync-acquisition"[^>]*>Synchroniser avec les sessions du plan</,
  );
  lacks(textOf(integrations), "Reprend les cibles", "Synchroniser de nouveau");
  // The intermediate lines say what the plan gathered each night.
  has(
    textOf(markup),
    "✓ Dim. 9 août · session 4 h 54",
    "✓ Lun. 10 août · session 2 h 14",
    "○ Sam. 17 oct. · prévue",
  );
  // The computer Astro Sync measured on, when it sent the name.
  const measured = m31();
  measured.metadata.acquisition.lines = measured.metadata.acquisition.lines.map(
    (entry) => ({ ...entry, computerLabel: "MacBook de Camille" }),
  );
  has(
    textOf(zone(draw(measured), "Intégrations")),
    "Mesurées par Astro Sync le 8 oct. à 07:41 depuis « MacBook de Camille » ; elles remplacent les lignes déclarées par la session. Vous pouvez corriger chaque ligne.",
  );
  // The other languages say the same: every new sentence exists in ten.
  for (const locale of [
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
    const words = metadataCopyFor(locale);
    for (const text of [
      words.captureSessionLine("7 oct.", "8 oct.", "7", true),
      words.captureNoSessionLine,
      words.captureNoSessionInfo,
      words.capturePlanImageLine,
      words.integrationsMeasuredFrom("8 oct.", "MacBook"),
      words.integrationsPlanOrigin("IC 1805"),
      words.integrationsPlanOrigin(""),
      words.integrationsSyncPlan,
      words.integrationsNotCombined(2, "12 août"),
      words.qualityImageTitle,
      words.qualityImageNote,
      words.qualityStars(3),
      words.qualitySessionLine("8 oct."),
      words.captureEditConflict("X"),
      words.captureEditCurrent("Y"),
      words.captureEditYours("Z"),
      words.captureEditCurrentSync("Y"),
      words.captureCurrentSyncHeading,
      words.keepMine,
      words.keepCurrent,
    ])
      assert.ok(
        typeof text === "string" && text.length > 3,
        `${locale} lacks a new sentence`,
      );
    assert.ok(
      words.captureYoursHeading.length > 1 &&
        words.captureCurrentHeading.length > 1,
      `${locale} lacks a heading`,
    );
    assert.notEqual(
      words.captureNoSessionLine,
      metadataCopyFor("fr").captureNoSessionLine,
    );
  }
});

// ——— The metadata cards ———

test("the night's hours are the place's, like the session's page — 01:44 → 01:47 at Gamsberg, « UTC » only when the place has no zone", () => {
  const windhoek = m31();
  windhoek.metadata.night = {
    value: {
      title: null,
      date: "2026-10-21",
      startedAt: "2026-10-21T23:44:00.000Z",
      finishedAt: "2026-10-21T23:47:00.000Z",
    },
    source: "plan",
    planName: "Plan web",
    placeTimeZone: "Africa/Windhoek",
  };
  const zoned = textOf(draw(windhoek));
  has(zoned, "Nuit du mer. 21 oct. 2026 · 01:44 → 01:47");
  lacks(zoned, "23:44", "23:47", "01:47 · UTC");
  assert.ok(!/01:44 → 01:47 · UTC/.test(zoned));
  // The moon's setting time is the place's too.
  windhoek.metadata.computed.moon.setsAt = "2026-10-21T21:10:00.000Z";
  has(textOf(draw(windhoek)), "couchée à 23:10");
  // Another zone moves the hours, not the night's name (the evening of the
  // 5th, whose hours are the 6th in Tokyo).
  const tokyo = m31();
  tokyo.metadata.night.placeTimeZone = "Asia/Tokyo";
  has(textOf(draw(tokyo)), "Nuit du lun. 5 oct. 2026 · 06:40 → 13:50");
  // No zone known: UTC, written once.
  const none = textOf(draw(m31()));
  has(none, "Nuit du lun. 5 oct. 2026 · 21:40 → 04:50 (mar. 6 oct.) · UTC");
  for (const bad of [null, "Etc/UTC", "Nowhere/Land"]) {
    const read = m31();
    read.metadata.night.placeTimeZone = bad;
    has(
      textOf(draw(read)),
      "Nuit du lun. 5 oct. 2026 · 21:40 → 04:50 (mar. 6 oct.) · UTC",
    );
  }
});

test("no equipment identifier and no `none` is ever drawn — a dash for nothing", () => {
  const read = m31();
  read.metadata.equipment = {
    telescope: origin({ id: "gone-telescope", name: null }, "plan"),
    camera: origin(null),
    mount: origin({ id: "none", name: null }, "plan"),
    filters: origin([{ id: "gone", name: null }], "plan"),
  };
  const markup = draw(read);
  const text = textOf(zone(markup, "Matériel"));
  has(text, "Télescope —", "Caméra —", "Monture —");
  has(text, "Filtre —");
  assert.ok(!/\b(custom|none|gone)\b/i.test(text), text);
  assert.ok(!/Personnalisé/.test(text), text);
});

test("the camera built into a smart telescope reads « Intégrée au Seestar S50 · IMX462 » (the planner's sentence, in each language), not « Personnalisé »", () => {
  const read = m31();
  read.metadata.equipment = {
    telescope: origin({ id: "seestar-s50", name: "Seestar S50" }, "plan"),
    camera: origin({ id: "integrated", name: "IMX462" }, "plan"),
    mount: origin({ id: "none", name: null }, "plan"),
    filters: origin([], "plan"),
  };
  const text = textOf(zone(draw(read), "Matériel"));
  has(text, "Télescope Seestar S50", "Caméra Intégrée au Seestar S50 · IMX462");
  lacks(text, "Personnalisé", "integrated");
  // Every language says it with the planner's own sentence.
  for (const locale of Object.keys(metadataCopy)) {
    const said = equipmentName(
      metadataCopyFor(locale),
      { id: "integrated", name: "IMX462" },
      { locale, telescope: { id: "seestar-s50", name: "Seestar S50" } },
    );
    assert.match(said, /Seestar S50/, locale);
    assert.match(said, /IMX462/, locale);
    assert.ok(!/integrated/i.test(said), locale);
  }
});

test("a card's form — « Modifier » opens every field of the card at once, one « Annuler » (a link) and one primary named by the card; no Save per field", () => {
  for (const [name, card, fields, primary] of [
    [
      "equipment",
      "Matériel",
      [
        "equipment-telescopeId",
        "equipment-cameraId",
        "equipment-mountId",
        "equipment-filterIds",
      ],
      "Enregistrer la section « Matériel »",
    ],
    [
      "processing",
      "Traitement",
      ["processing.software", "processing.steps"],
      "Enregistrer la section « Traitement »",
    ],
    ["notes", "Notes", ["notes"], "Enregistrer la section « Notes »"],
    [
      "acquisition",
      "Intégrations",
      ["calibration", "sensor"],
      "Enregistrer la section « Calibration · Capteur »",
    ],
  ]) {
    const markup = draw(m31(), {
      editingField: `zone:${name}`,
      equipmentOptions: [],
    });
    const html = zone(markup, card);
    for (const field of fields)
      assert.match(
        html,
        new RegExp(`data-editor="${field}"`),
        `${card}: ${field} is open`,
      );
    assert.equal(
      (html.match(/<form/g) ?? []).length,
      0,
      `${card}: no form inside the form`,
    );
    assert.equal((html.match(/data-action="save-zone"/g) ?? []).length, 1);
    assert.match(
      html,
      new RegExp(`class="btn-primary"[^>]*>${primary.replace(/ /g, "[  ]")}<`),
    );
    assert.equal(
      (html.match(/class="btn-link"[^>]*>Annuler</g) ?? []).length,
      1,
    );
    assert.doesNotMatch(html, /type="submit"/);
    assert.doesNotMatch(
      html,
      />Modifier</,
      "the card's own button is replaced",
    );
    // The other cards keep their button.
    const others = markup.match(/<button[^>]*>Modifier<\/button>/g) ?? [];
    assert.ok(others.length >= 1);
  }
  // Read only: no « Modifier » at all.
  const readOnly = draw(m31(), {}, { readOnly: true });
  assert.doesNotMatch(readOnly, /<button[^>]*>Modifier<\/button>/);
});

test("a card's save sends the changed fields one after the other, each on the capture the previous save answered, the form closing with the last", async () => {
  const calls = [];
  const slot = (name, changes = {}) => ({
    dirty: true,
    valid: true,
    run: async () => {
      // What `save` reads while a run is going: the capture to write on and
      // whether the form stays open after this write.
      calls.push({ name, ...run.current });
      return { kind: "ok", capture: { revision: `after-${name}` } };
    },
    ...changes,
  });
  const run = { current: null };
  const slots = new Map([
    ["calibration", slot("calibration")],
    ["sensor", slot("sensor", { dirty: false })],
    ["notes", slot("notes")],
    ["software", slot("software")],
  ]);
  const start = { revision: "start" };
  assert.equal(await saveChangedSlots({ slots, capture: start, run }), "saved");
  assert.deepEqual(
    calls.map((call) => [call.name, call.capture.revision, call.keep]),
    [
      ["calibration", "start", true],
      ["notes", "after-calibration", true],
      ["software", "after-notes", false],
    ],
  );
  assert.equal(run.current, null);
  // Nothing changed: nothing is sent (the card just closes).
  calls.length = 0;
  const idle = new Map([["notes", slot("notes", { dirty: false })]]);
  assert.equal(
    await saveChangedSlots({ slots: idle, capture: start, run }),
    "unchanged",
  );
  // A field that is not valid blocks the whole save: nothing is sent.
  const invalid = new Map([
    ["notes", slot("notes", { valid: false })],
    ["calibration", slot("calibration")],
  ]);
  assert.equal(
    await saveChangedSlots({ slots: invalid, capture: start, run }),
    "invalid",
  );
  assert.deepEqual(calls, []);
  // A refusal (or a conflict) stops the chain: the next field is not sent.
  const stopped = new Map([
    [
      "calibration",
      slot("calibration", { run: async () => ({ kind: "conflict" }) }),
    ],
    ["notes", slot("notes")],
  ]);
  assert.equal(
    await saveChangedSlots({ slots: stopped, capture: start, run }),
    "stopped",
  );
  assert.deepEqual(calls, []);
});

test("a capture without a target is never titled « Sans cible »: an untitled capture, and the line under says there is no target", () => {
  const bare = m31({ targetIds: [], detail: { ...m31().detail, targets: [] } });
  const text = textOf(draw(bare));
  has(
    text,
    "Capture sans titre",
    "Aucune cible : donnez un titre à cette capture.",
  );
  lacks(text, "Sans cible", "Titre d’après les cibles de la capture.");
});
