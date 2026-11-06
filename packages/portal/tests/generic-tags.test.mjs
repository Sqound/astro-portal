import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GENERIC_TAGS,
  GENERIC_TAG_WORDS,
  PUBLIC_GALLERY_TAGS,
  defaultGenericTag,
  genericTagKey,
  genericTagValue,
  isGenericTag,
  publicGalleryTag,
} from "../dist/captures/generic-tags.js";
import {
  localizedTag,
  storedTag,
} from "../dist/components/gallery/gallery-tags.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { objectTypes } from "astro-core/catalog-taxonomy.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

await registerJsx();
const { captureChips, filteredCaptures } =
  await import("portal/components/manage/captures-list.js");
const { CaptureTagsField } =
  await import("portal/components/manage/CapturesTab.js");

// A capture takes its target's type as its
// default tag, and every generic tag reads in the language of the page.

const LOCALES = [
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
];

const contract = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../astro-contracts/schemas/api/${name}`, import.meta.url),
      "utf8",
    ),
  );

test("the vocabulary: a key and a stored French word for each generic tag, the types of the catalogue mapped", () => {
  assert.deepEqual(
    GENERIC_TAGS.map((tag) => [tag.key, tag.value]),
    [
      ["galaxy", "Galaxie"],
      ["nebula", "Nébuleuse"],
      ["cluster", "Amas"],
      ["moon", "Lune"],
      ["planet", "Planète"],
      ["sun", "Soleil"],
      ["star", "Étoile"],
      ["comet", "Comète"],
      ["wide_field", "Grand champ"],
    ],
  );
  assert.deepEqual(
    PUBLIC_GALLERY_TAGS,
    GENERIC_TAGS.map((tag) => tag.value),
  );
  assert.equal(genericTagKey("Nébuleuse"), "nebula");
  assert.equal(genericTagKey("Messier"), "messier");
  assert.equal(genericTagKey("Askar"), null);
  assert.equal(genericTagValue("comet"), "Comète");
  assert.equal(genericTagValue("nebula "), null);
  assert.equal(isGenericTag("Messier"), true);
  // The types of the catalogue, one by one (a nebula of any kind, a remnant
  // included, is « Nébuleuse »; the solar system and a constellation alone have none).
  const expected = {
    Galaxie: "Galaxie",
    "Amas globulaire": "Amas",
    "Amas ouvert": "Amas",
    "Nébuleuse en émission": "Nébuleuse",
    "Nébuleuse en réflexion": "Nébuleuse",
    "Nébuleuse planétaire": "Nébuleuse",
    "Rémanent de supernova": "Nébuleuse",
    "Nébuleuse sombre": "Nébuleuse",
    Étoile: "Étoile",
    "Étoile brillante": "Étoile",
    Constellation: null,
    Soleil: "Soleil",
    Lune: "Lune",
    Planète: "Planète",
    "Planète naine": "Planète",
    "Système solaire": null,
  };
  assert.deepEqual(
    Object.fromEntries(
      objectTypes.map((type) => [type, publicGalleryTag(type)]),
    ),
    expected,
  );
  // The alias of the catalogue that reads as an emission nebula, a comet.
  assert.equal(
    publicGalleryTag("Région H II / nébuleuse en émission"),
    "Nébuleuse",
  );
  assert.equal(publicGalleryTag("Comète"), "Comète");
  assert.equal(publicGalleryTag(null), null);
  assert.equal(publicGalleryTag("", { hasTarget: false }), "Grand champ");
  // A target's row: the catalogue's type, a personal target's label.
  assert.equal(
    defaultGenericTag({ library_source: "catalogue", type_key: "Galaxie" }),
    "Galaxie",
  );
  assert.equal(
    defaultGenericTag({ library_source: "personal", gallery_label: "Comète" }),
    "Comète",
  );
  assert.equal(
    defaultGenericTag({ library_source: "personal", gallery_label: "Askar" }),
    "Grand champ",
  );
});

test("the contract names the same words as the code, in each schema that lists them", () => {
  const gallery = contract("gallery.schema.json");
  assert.deepEqual(
    gallery.$defs.tag["x-keys"],
    Object.fromEntries(
      GENERIC_TAG_WORDS.map((word) => [word, genericTagKey(word)]),
    ),
  );
  assert.deepEqual(gallery.$defs.tag.enum, PUBLIC_GALLERY_TAGS);
  assert.deepEqual(
    contract("private-gallery.schema.json").$defs.genericTag.enum,
    PUBLIC_GALLERY_TAGS,
  );
  assert.deepEqual(
    contract("personal-target.schema.json").$defs.label.enum,
    PUBLIC_GALLERY_TAGS,
  );
  assert.deepEqual(
    contract("capture.schema.json").$defs.capture.properties.galleryLabel
      .anyOf[0].enum,
    PUBLIC_GALLERY_TAGS,
  );
});

test("every generic word reads in the ten languages and comes back to its stored word", () => {
  for (const word of GENERIC_TAG_WORDS) {
    for (const locale of LOCALES) {
      const label = localizedTag(word, locale);
      assert.ok(label && typeof label === "string", `${word} in ${locale}`);
      // The round trip of the field where an owner edits the tags.
      assert.equal(storedTag(label, locale), word, `${word} in ${locale}`);
    }
    assert.equal(localizedTag(word, "fr"), word);
  }
  assert.equal(localizedTag("Nébuleuse", "en"), "Nebula");
  assert.equal(localizedTag("Nébuleuse", "ja"), "星雲");
  assert.equal(localizedTag("Étoile", "de"), "Stern");
  assert.equal(localizedTag("Comète", "es"), "Cometa");
  // An owner's own tag is never translated nor normalised.
  for (const locale of LOCALES) {
    for (const own of ["Askar", "nébuleuse", "nebula", " Nébuleuse", "M31"]) {
      assert.equal(localizedTag(own, locale), own);
      assert.equal(storedTag(own, locale), own);
    }
  }
});

// ---- The service: the default tag at creation, the backfill.

const at = "2026-10-23T08:00:00.000Z";

async function space(driver, label) {
  const tenantId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, label, at],
  );
  return tenantId;
}

async function target(driver, id, type, tenantId = null, label = null) {
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, type_key, ra_hours,
       dec_degrees, catalogues_json, catalogue, source_json, source_revision,
       created_at, updated_at, space_id, library_source, gallery_label
     ) VALUES (?, ?, '[]', '[]', ?, 0.7, 41.2, '[]', ?, '{}', 'r1', ?, ?, ?, ?, ?)`,
    [
      id,
      id.toUpperCase(),
      type,
      tenantId ? "personal" : "Test",
      at,
      at,
      tenantId,
      tenantId ? "personal" : "catalogue",
      label,
    ],
  );
}

async function capture(repository, tenantId, name, targetIds = []) {
  const { capture: created } = await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: name,
    sha256: createHash("sha256").update(`${tenantId}:${name}`).digest("hex"),
    byteSize: 1000,
    targetIds,
    createdAt: at,
  });
  return created;
}

onBothBackends(
  "the default tag: the target's type at the creation, only when there is no generic tag yet, never over the owner's edits",
  async (driver) => {
    const repository = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
    });
    const alice = await space(driver, "Alice");
    await target(driver, "ic1805", "Nébuleuse en émission");
    await target(driver, "m31", "Galaxie");
    await target(driver, "m13", "Amas globulaire");
    await target(driver, "m1", "Rémanent de supernova");
    await target(driver, "vega", "Étoile");
    await target(driver, "sol", "Système solaire");
    await target(driver, "bare", null);
    await target(driver, "mine", null, alice, "Comète");

    // An emission nebula: « Nébuleuse », and nothing else.
    const nebula = await capture(repository, alice, "ic1805.jpg", ["ic1805"]);
    assert.deepEqual(await repository.getCaptureTags(alice, nebula.id), [
      "Nébuleuse",
    ]);
    assert.deepEqual((await repository.getCaptureById(alice, nebula.id)).tags, [
      "Nébuleuse",
    ]);
    for (const [name, id, tag] of [
      ["m31.jpg", "m31", "Galaxie"],
      ["m13.jpg", "m13", "Amas"],
      ["m1.jpg", "m1", "Nébuleuse"],
      ["vega.jpg", "vega", "Étoile"],
      ["mine.jpg", "mine", "Comète"],
    ])
      assert.deepEqual(
        await repository.getCaptureTags(
          alice,
          (await capture(repository, alice, name, [id])).id,
        ),
        [tag],
        id,
      );
    // No tag for a type without one, a target without a type, or no target.
    for (const [name, ids] of [
      ["sol.jpg", ["sol"]],
      ["bare.jpg", ["bare"]],
      ["none.jpg", []],
    ])
      assert.deepEqual(
        await repository.getCaptureTags(
          alice,
          (await capture(repository, alice, name, ids)).id,
        ),
        [],
        name,
      );

    // The owner's edits are never overwritten: his own words stay, and a
    // second sight of the same capture (the same bytes sent again) writes
    // nothing.
    await repository.replaceCaptureTags(alice, nebula.id, [
      "Askar",
      "Nébuleuse",
    ]);
    await capture(repository, alice, "ic1805.jpg", ["ic1805"]);
    assert.deepEqual(await repository.getCaptureTags(alice, nebula.id), [
      "Askar",
      "Nébuleuse",
    ]);
    // He removed the generic tag: a replay of the bytes does not bring it back.
    await repository.replaceCaptureTags(alice, nebula.id, ["Askar"]);
    await capture(repository, alice, "ic1805.jpg", ["ic1805"]);
    assert.deepEqual(await repository.getCaptureTags(alice, nebula.id), [
      "Askar",
    ]);
    // A capture that has a generic tag of its own keeps it, with no second one.
    const chosen = await capture(repository, alice, "chosen.jpg", []);
    await repository.replaceCaptureTags(alice, chosen.id, ["Galaxie"]);
    await repository.setCaptureTargets(alice, chosen.id, ["ic1805"]);
    assert.deepEqual(await repository.getCaptureTags(alice, chosen.id), [
      "Galaxie",
    ]);
  },
);

onBothBackends(
  "the default tag follows « Changer la cible » only while it is still the previous target's default",
  async (driver) => {
    const repository = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
    });
    const alice = await space(driver, "Alice");
    await target(driver, "ic1805", "Nébuleuse en émission");
    await target(driver, "m31", "Galaxie");
    const first = await capture(repository, alice, "a.jpg", ["ic1805"]);
    await repository.replaceCaptureTags(alice, first.id, [
      "Askar",
      "Nébuleuse",
    ]);
    await repository.setCaptureTargets(alice, first.id, ["m31"]);
    assert.deepEqual(await repository.getCaptureTags(alice, first.id), [
      "Askar",
      "Galaxie",
    ]);
    // Same target again: nothing to write.
    await repository.setCaptureTargets(alice, first.id, ["m31"]);
    assert.deepEqual(await repository.getCaptureTags(alice, first.id), [
      "Askar",
      "Galaxie",
    ]);
    // A generic tag the owner chose (not the previous target's) stays.
    const second = await capture(repository, alice, "b.jpg", ["ic1805"]);
    await repository.replaceCaptureTags(alice, second.id, ["Lune"]);
    await repository.setCaptureTargets(alice, second.id, ["m31"]);
    assert.deepEqual(await repository.getCaptureTags(alice, second.id), [
      "Lune",
    ]);
    // A capture born without a target takes its tag when a target joins it.
    const third = await capture(repository, alice, "c.jpg", []);
    await repository.setCaptureTargets(alice, third.id, ["m31"]);
    assert.deepEqual(await repository.getCaptureTags(alice, third.id), [
      "Galaxie",
    ]);
    // The definition of a capture to come is tagged at once.
    const definition = await repository.createDefinition({
      tenantId: alice,
      targetIds: ["ic1805"],
    });
    assert.deepEqual(await repository.getCaptureTags(alice, definition.id), [
      "Nébuleuse",
    ]);
  },
);

onBothBackends(
  "the backfill (migration 99) gives the existing captures their tag, once, and a second run writes nothing",
  async (driver) => {
    const repository = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
    });
    const alice = await space(driver, "Alice");
    await target(driver, "ic1805", "Nébuleuse en émission");
    await target(driver, "m31", "Galaxie");
    await target(driver, "sol", "Système solaire");
    await target(driver, "mine", null, alice, "Planète");
    const nothing = async () => {
      // Captures as they were before the tags existed: no tag written at
      // creation.
      await driver.run("DELETE FROM capture_tags");
    };
    const seeded = {};
    for (const [name, ids] of [
      ["nebula", ["ic1805"]],
      ["galaxy", ["m31"]],
      ["solar", ["sol"]],
      ["personal", ["mine"]],
      ["wide", []],
      ["own", ["ic1805"]],
      ["chosen", ["ic1805"]],
    ])
      seeded[name] = (await capture(repository, alice, `${name}.jpg`, ids)).id;
    await nothing();
    await repository.replaceCaptureTags(alice, seeded.own, ["Askar"]);
    await repository.replaceCaptureTags(alice, seeded.chosen, ["Galaxie"]);

    const migration = migrations.find((entry) => entry.version === 99);
    assert.ok(migration, "migration 99");
    const run = async () => {
      for (const statement of statementsFor(migration, driver.dialect))
        await driver.run(statement);
    };
    const tagsOf = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(seeded).map(async ([name, id]) => [
            name,
            await repository.getCaptureTags(alice, id),
          ]),
        ),
      );
    await run();
    const once = await tagsOf();
    assert.deepEqual(once, {
      nebula: ["Nébuleuse"],
      galaxy: ["Galaxie"],
      solar: [],
      personal: ["Planète"],
      wide: [],
      own: ["Askar", "Nébuleuse"],
      chosen: ["Galaxie"],
    });
    await run();
    assert.deepEqual(await tagsOf(), once);
  },
);

// ---- The web: « Mon espace › Captures », the tags in the page's language.

test("Mon espace › Captures: the default tag is one generic chip in the page's language, however it arrives", () => {
  const capture = (id, galleryLabel, tags) => ({
    id,
    galleryLabel,
    tags,
    targets: [],
    createdAt: "2026-10-23T08:00:00.000Z",
  });
  const all = [
    capture("a", "Nébuleuse", ["Nébuleuse", "Askar"]),
    capture("b", null, ["Nébuleuse"]),
    capture("c", null, ["Comète"]),
  ];
  assert.deepEqual(
    captureChips(all, "ja").map((chip) => chip.label),
    ["星雲", "彗星", "Askar"],
  );
  assert.deepEqual(
    captureChips(all, "fr").map((chip) => chip.label),
    ["Nébuleuse", "Comète", "Askar"],
  );
  const keep = (chip, locale) =>
    filteredCaptures(all, { chip, locale })
      .map((entry) => entry.id)
      .sort();
  assert.deepEqual(keep("星雲", "ja"), ["a", "b"]);
  assert.deepEqual(keep("Askar", "ja"), ["a"]);
  assert.deepEqual(keep("Nebula", "en"), ["a", "b"]);
});

test("the tags field shows the generic tag in the page's language and keeps it stored in French when it is saved", () => {
  const copy = {
    tags: "Tags",
    tagsHelp: "aide",
    tagsBounds: "bornes",
    saveTags: "Enregistrer",
  };
  const draw = (locale) =>
    renderToStaticMarkup(
      createElement(CaptureTagsField, {
        capture: { id: "c1", tags: ["Askar", "Nébuleuse"] },
        copy,
        locale,
        busy: false,
        onSave: () => {},
      }),
    );
  assert.match(draw("ja"), /value="Askar, 星雲"/);
  assert.match(draw("en"), /value="Askar, Nebula"/);
  assert.match(draw("fr"), /value="Askar, Nébuleuse"/);
});

onBothBackends(
  "the private gallery carries the generic tag apart from the owner's own, on the grid and on the capture's page (the view model it draws)",
  async (driver) => {
    const repository = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
    });
    const owner = await space(driver, "Alice");
    await target(driver, "ic1805", "Nébuleuse en émission");
    const created = await repository.insertCaptureWithTargets({
      id: randomUUID(),
      tenantId: owner,
      originalName: "ic1805.jpg",
      sha256: createHash("sha256").update("ic1805").digest("hex"),
      byteSize: 1000,
      stage: "finalized",
      targetIds: ["ic1805"],
      createdAt: at,
    });
    const id = created.capture.id;
    const gallery = await createPrivateGalleryService({
      driver,
      dialect: driver.dialect,
      captureStore: { stat: async () => null },
    });
    const viewer = { tenantId: owner, userId: randomUUID(), email: "d@x.test" };
    const settings = await gallery.settings({
      ...viewer,
      origin: "https://portal.example.test",
    });
    const token = settings.address.split("/").at(-1);
    const read = async () => {
      const grid = (await gallery.gallery({ token, viewer })).view;
      const page = (await gallery.capture({ token, captureId: id, viewer }))
        .view.capture;
      return { grid, page };
    };
    // At its creation: the generic tag, no own tag.
    let { grid, page } = await read();
    assert.deepEqual(grid.captures[0].tags, ["Nébuleuse"]);
    assert.deepEqual(grid.captures[0].ownTags, []);
    assert.deepEqual(grid.tags, ["Nébuleuse"]);
    assert.deepEqual(grid.ownTags, []);
    assert.deepEqual(page.tags, ["Nébuleuse"]);
    assert.deepEqual(page.ownTags, []);
    // The owner's own tag beside it: the two lists stay apart.
    await repository.replaceCaptureTags(owner, id, ["Nébuleuse", "Askar"]);
    ({ grid, page } = await read());
    assert.deepEqual(grid.captures[0].tags, ["Nébuleuse"]);
    assert.deepEqual(grid.captures[0].ownTags, ["Askar"]);
    assert.deepEqual(page.tags, ["Nébuleuse"]);
    assert.deepEqual(page.ownTags, ["Askar"]);
    // He chose another generic word for it: both are generic, none is lost.
    await repository.replaceCaptureTags(owner, id, ["Galaxie"]);
    ({ grid, page } = await read());
    assert.deepEqual(page.tags, ["Galaxie", "Nébuleuse"]);
    assert.deepEqual(page.ownTags, []);
  },
);
