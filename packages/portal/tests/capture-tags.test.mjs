import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  CAPTURE_TAGS_MAX,
  CAPTURE_TAG_MAX_LENGTH,
  captureTagsProblem,
  captureTagsText,
  cleanCaptureTags,
  parseCaptureTags,
  storedCaptureTags,
} from "../dist/captures/capture-tags.js";
import {
  CaptureRepositoryError,
  createCaptureRepository,
} from "../dist/persistence/capture-repository.js";
import { subscribe } from "../dist/api/change-bus.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

// The owner's own tags of a capture (`capture_tags`): free text of the owner, never normalised, 40 characters
// at most, 20 tags at most per capture, read and written within one space
// only.

test("the field: tags separated by commas or by lines, trimmed, the empty ones and the repetitions dropped, never otherwise changed", () => {
  assert.deepEqual(
    parseCaptureTags(
      " Nuit très froide, première lumière ,\nM31 ,, nuit très froide\n\nNuit très froide",
    ),
    ["Nuit très froide", "première lumière", "M31", "nuit très froide"],
  );
  assert.deepEqual(parseCaptureTags(""), []);
  assert.deepEqual(parseCaptureTags(null), []);
  assert.equal(
    captureTagsText(["Nuit très froide", "M31"]),
    "Nuit très froide, M31",
  );
  // A list sent by a route is never split on its commas.
  assert.deepEqual(cleanCaptureTags(["Lune, Soleil", " Lune, Soleil "]), [
    "Lune, Soleil",
  ]);
});

test("the bounds: 40 characters a tag (as a person counts them), 20 tags a capture, a list of strings", () => {
  assert.equal(CAPTURE_TAG_MAX_LENGTH, 40);
  assert.equal(CAPTURE_TAGS_MAX, 20);
  assert.equal(captureTagsProblem([]), null);
  assert.equal(captureTagsProblem(["é".repeat(40)]), null);
  assert.equal(captureTagsProblem(["🌌".repeat(40)]), null);
  assert.equal(captureTagsProblem([` ${"a".repeat(40)} `]), null);
  assert.equal(captureTagsProblem(["é".repeat(41)]), "too_long");
  const twenty = Array.from({ length: 20 }, (_, index) => `tag ${index}`);
  assert.equal(captureTagsProblem(twenty), null);
  assert.equal(captureTagsProblem([...twenty, "tag 0", " ", ""]), null);
  assert.equal(captureTagsProblem([...twenty, "tag 20"]), "too_many");
  for (const value of ["Lune", [1], [null], { tags: [] }, null])
    assert.equal(captureTagsProblem(value), "not_a_list");
  // Read in the order of their text, whatever the order typed.
  assert.deepEqual(storedCaptureTags(["nuit 10", "Lune", "nuit 9", "lune"]), [
    "lune",
    "Lune",
    "nuit 9",
    "nuit 10",
  ]);
});

const at = "2026-10-07T20:00:00.000Z";

async function space(driver, label) {
  const tenantId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, label, at],
  );
  return tenantId;
}

async function capture(repository, tenantId, name) {
  const { capture: created } = await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: name,
    sha256: createHash("sha256").update(`${tenantId}:${name}`).digest("hex"),
    byteSize: 1000,
    createdAt: at,
  });
  return created;
}

onBothBackends(
  "capture tags: replaced whole, read back as typed, bounded, isolated by space",
  async (driver) => {
    const repository = await createCaptureRepository({
      driver,
      dialect: driver.dialect,
    });
    const camille = await space(driver, "Camille");
    const other = await space(driver, "Other");
    const m31 = await capture(repository, camille, "M31.jpg");
    const ridge = await capture(repository, camille, "crete.jpg");
    const foreign = await capture(repository, other, "foreign.jpg");
    const changes = [];
    const unsubscribe = subscribe(camille, (event) => changes.push(event));
    try {
      assert.deepEqual(await repository.getCaptureTags(camille, m31.id), []);
      assert.deepEqual(
        await repository.replaceCaptureTags(camille, m31.id, [
          " première lumière ",
          "Nuit très froide",
          "nuit très froide",
          "Nuit très froide",
          "",
        ]),
        ["nuit très froide", "Nuit très froide", "première lumière"],
      );
      assert.ok(
        changes.some((event) => JSON.stringify(event).includes("captures")),
        "a paired phone reads its list again",
      );
      // Read back as typed: case and accents kept.
      assert.deepEqual(await repository.getCaptureTags(camille, m31.id), [
        "nuit très froide",
        "Nuit très froide",
        "première lumière",
      ]);
      // On the resource the owner and the phone read.
      assert.deepEqual(
        (await repository.getCaptureById(camille, m31.id)).tags,
        ["nuit très froide", "Nuit très froide", "première lumière"],
      );
      const page = await repository.listCaptures({ tenantId: camille });
      assert.deepEqual(
        page.captures.find((entry) => entry.id === m31.id).tags,
        ["nuit très froide", "Nuit très froide", "première lumière"],
      );
      assert.deepEqual(
        page.captures.find((entry) => entry.id === ridge.id).tags,
        [],
      );
      // Replaced whole: what is not sent is gone; `[]` removes them all.
      assert.deepEqual(
        await repository.replaceCaptureTags(camille, m31.id, ["Galaxie"]),
        ["Galaxie"],
      );
      await repository.replaceCaptureTags(camille, ridge.id, [
        "Voie lactée",
        "Galaxie",
      ]);
      assert.deepEqual(await repository.listSpaceTags(camille), [
        "Galaxie",
        "Voie lactée",
      ]);
      const byCapture = await repository.tagsByCapture(camille);
      assert.deepEqual(Object.fromEntries(byCapture), {
        [m31.id]: ["Galaxie"],
        [ridge.id]: ["Galaxie", "Voie lactée"],
      });
      assert.deepEqual(
        await repository.replaceCaptureTags(camille, m31.id, []),
        [],
      );
      assert.deepEqual(await repository.getCaptureTags(camille, m31.id), []);

      // The bounds: refused before anything is written.
      await repository.replaceCaptureTags(camille, m31.id, ["Nuit froide"]);
      for (const tags of [
        ["é".repeat(41)],
        Array.from({ length: 21 }, (_, index) => `tag ${index}`),
        "Nuit froide",
        [42],
      ])
        await assert.rejects(
          repository.replaceCaptureTags(camille, m31.id, tags),
          (error) =>
            error instanceof CaptureRepositoryError &&
            error.code === "invalid_request" &&
            error.field === "tags",
        );
      assert.deepEqual(await repository.getCaptureTags(camille, m31.id), [
        "Nuit froide",
      ]);
      assert.deepEqual(
        await repository
          .replaceCaptureTags(camille, m31.id, [
            "é".repeat(40),
            ...Array.from({ length: 19 }, (_, index) => `tag ${index}`),
          ])
          .then((tags) => tags.length),
        20,
      );

      // Another space neither reads nor writes them.
      await repository.replaceCaptureTags(other, foreign.id, ["Privé"]);
      assert.equal(
        await repository.replaceCaptureTags(other, m31.id, ["Intrus"]),
        null,
      );
      assert.equal(
        await repository.replaceCaptureTags(camille, foreign.id, ["Intrus"]),
        null,
      );
      assert.deepEqual(await repository.getCaptureTags(other, m31.id), []);
      assert.equal(await repository.getCaptureById(other, m31.id), null);
      assert.deepEqual(await repository.listSpaceTags(other), ["Privé"]);
      assert.ok(!(await repository.listSpaceTags(camille)).includes("Privé"));
      assert.ok(!(await repository.listSpaceTags(camille)).includes("Intrus"));
      assert.deepEqual(
        [...(await repository.tagsByCapture(other)).keys()],
        [foreign.id],
      );
      assert.deepEqual(await repository.getCaptureTags(other, foreign.id), [
        "Privé",
      ]);
      // A capture that exists nowhere.
      assert.equal(
        await repository.replaceCaptureTags(camille, randomUUID(), ["Lune"]),
        null,
      );
    } finally {
      unsubscribe();
      await repository.close();
    }
  },
);
