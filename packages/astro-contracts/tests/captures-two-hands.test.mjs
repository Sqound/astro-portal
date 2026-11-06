// The contract of a capture written by two hands — the revision and the
// `If-Match` of an owner write, the 409 judged by field, what a device may
// write, the two synchronisations, both qualities (the session's and the
// stacked image's own), what the lists and the cards read. Additive
// throughout: the earlier shapes still validate.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { registerExternalSchema, schemaErrors } from "./schema-assert.mjs";

const schemasDirectory = new URL("../schemas/api/", import.meta.url);
const documents = {};
for (const name of await readdir(schemasDirectory)) {
  if (!name.endsWith(".schema.json")) continue;
  documents[name] = JSON.parse(
    await readFile(new URL(name, schemasDirectory), "utf8"),
  );
  registerExternalSchema(name, documents[name]);
}
const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/captures/two-hands.json", import.meta.url),
    "utf8",
  ),
);

function definition(reference) {
  const [file, pointer = ""] = reference.split("#");
  let schema = documents[file];
  assert.ok(schema, `unknown schema ${file}`);
  for (const segment of pointer.split("/").filter(Boolean)) {
    schema = schema[segment];
    assert.ok(schema, `unknown definition ${reference}`);
  }
  return { ...schema, $defs: documents[file].$defs };
}
const errors = (reference, value) => schemaErrors(definition(reference), value);
const valid = (reference, value) =>
  assert.deepEqual(errors(reference, value), [], reference);
const invalid = (reference, value, why) =>
  assert.notDeepEqual(errors(reference, value), [], why ?? reference);

const manage = (name) => `manage-captures.schema.json#/$defs/${name}`;
const capture = (name) => `capture.schema.json#/$defs/${name}`;
const example = (name) => structuredClone(fixture.examples[name].body);

test("the shared fixture: every example satisfies the schema it names, and nothing is a new shape", () => {
  for (const [name, { schema, body }] of Object.entries(fixture.examples))
    valid(schema, body);
  assert.ok(Object.keys(fixture.examples).length >= 12);
});

test("the revision and the conflict by field: the 409 carries the field, the line and the current capture", () => {
  const list = example("list");
  assert.equal(list.captures[0].revision, 7);
  invalid(capture("capture"), { ...list.captures[0], revision: 0 });
  // The owner's resource and the items of both lists read the same revision.
  const owner = example("owner").capture;
  assert.equal(owner.revision, 7);
  invalid(manage("capture"), { ...owner, revision: 0 });
  // The header: a quoted positive integer, nothing else.
  for (const header of ['"1"', '"7"', '"120"'])
    assert.deepEqual(errors(manage("ifMatch"), header), [], header);
  for (const header of ["7", '"0"', '"07"', 'W/"7"', '""', '"-1"'])
    assert.notDeepEqual(errors(manage("ifMatch"), header), [], header);
  // The refusal: the two new codes, the field, the line, the capture.
  const conflict = example("conflict");
  assert.equal(conflict.error.code, "capture_conflict");
  assert.equal(conflict.capture.revision, 6);
  valid(manage("refusal"), example("conflictLine"));
  valid(manage("refusal"), {
    error: { code: "invalid_if_match", message: "Quoted revision expected." },
  });
  invalid(manage("refusal"), {
    ...conflict,
    error: { ...conflict.error, code: "capture_stale" },
  });
  invalid(manage("refusal"), { ...conflict, session: {} });
  // One change per request: the body of a write is still one of the cases.
  for (const body of ["patchTitle", "patchTags", "patchStage"])
    valid(manage("patch"), example(body));
  invalid(manage("patch"), {
    metadata: { title: "a" },
    tags: ["b"],
  });
  invalid(manage("patch"), {
    metadata: { title: "a", description: "b" },
  });
});

test("what a device writes as the owner's hand: the fields of deviceMetadataField, never the session", () => {
  const change = documents["manage-captures.schema.json"].$defs.metadataChange;
  const device =
    documents["manage-captures.schema.json"].$defs.deviceMetadataField.enum;
  assert.deepEqual(
    [...device].sort(),
    Object.keys(change.properties)
      .filter((field) => field !== "sessionId")
      .sort(),
  );
  for (const field of [
    "equipment.telescopeId",
    "equipment.filterIds",
    "sensor",
    "processing.steps",
    "targetIds",
  ])
    assert.ok(device.includes(field), field);
  assert.ok(!device.includes("sessionId"));
  // The tags: the whole list, the web route's bounds.
  valid(manage("patch"), { tags: ["Andromède", "Galaxie"] });
  valid(manage("patch"), { tags: [] });
});

test("« Synchroniser avec la session »: the answer for a session's capture and for the image of a plan, one line per session", () => {
  const sync = example("sync");
  assert.equal(sync.acquisition.lines.length, 3);
  assert.deepEqual(
    sync.acquisition.lines.map((line) => line.provenance),
    ["measured", "declared", "manual"],
  );
  const plan = example("syncPlanImage");
  assert.ok(plan.capture.projectId);
  const sessions = plan.acquisition.lines.map((line) => line.sessionId);
  assert.equal(new Set(sessions).size, sessions.length);
  for (const line of plan.acquisition.lines) {
    assert.match(line.eveningDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(plan.capture.plan.combinedNightIds.includes(line.sessionId));
  }
  // A session capture's line carries neither.
  assert.equal(sync.acquisition.lines[0].sessionId, undefined);
  // The refusal for a capture with neither a session nor a plan stays.
  valid(manage("refusal"), {
    error: { code: "capture_without_session", message: "No session." },
  });
});

test("the stacked image's quality: a producer's proposal under analysis.logs, read on the image and the owner's resource", () => {
  const quality = example("imageRoute").imageQuality;
  valid(capture("imageQuality"), quality);
  valid(capture("imageQuality"), {
    ...quality,
    fwhmArcsec: null,
    eccentricity: null,
  });
  for (const broken of [
    { ...quality, measuredOn: "stretched" },
    { ...quality, eccentricity: 1.2 },
    { ...quality, fwhmPixels: 0 },
    { ...quality, starCount: -1 },
    { ...quality, tool: { name: "Astro Sync" } },
    { ...quality, extra: true },
  ])
    invalid(capture("imageQuality"), broken);
  // In the upload, and in the producers' image route (alone it is a body).
  valid(capture("uploadMetadata"), example("uploadWithQuality"));
  valid("capture-variant.schema.json#/$defs/proposal", example("imageRoute"));
  invalid("capture-variant.schema.json#/$defs/proposal", {
    source: "astro-sync",
  });
  invalid("capture-variant.schema.json#/$defs/proposal", {
    imageQuality: quality,
  });
  // The service drops it without the capability and says so.
  valid(capture("skipped"), example("skippedWithoutRight"));
  invalid(capture("skipped"), [{ field: "imageQuality", reason: "forbidden" }]);
  // Read: on each image, and on the owner's resource for the main image.
  const owner = example("owner").capture;
  assert.deepEqual(owner.quality, quality);
  assert.deepEqual(owner.variants[0].quality, owner.quality);
  assert.equal(owner.variants[1].quality, null);
  valid(manage("capture"), { ...owner, quality: null });
  invalid(manage("capture"), { ...owner, quality: { ...quality, tool: null } });
});

test("the session's quality on the capture: the medians of journal.schema.json, or null", () => {
  const owner = example("owner").capture;
  assert.equal(owner.detail.sessionQuality.sessionId, owner.sessionId);
  valid(manage("capture"), {
    ...owner,
    detail: { ...owner.detail, sessionQuality: null },
  });
  valid(manage("capture"), {
    ...owner,
    detail: {
      ...owner.detail,
      sessionQuality: {
        ...owner.detail.sessionQuality,
        fwhm: null,
        eccentricity: null,
        skyBackground: null,
      },
    },
  });
  invalid(manage("capture"), {
    ...owner,
    detail: {
      ...owner.detail,
      sessionQuality: { ...owner.detail.sessionQuality, eccentricity: 1.5 },
    },
  });
  invalid(manage("capture"), {
    ...owner,
    detail: {
      ...owner.detail,
      sessionQuality: { ...owner.detail.sessionQuality, extra: 1 },
    },
  });
});

test("what the lists and the cards read: title, acquisitionSummary, revision; the night's acquired seconds; additive", () => {
  const [first, second] = example("list").captures;
  assert.equal(first.acquisitionSummary.lineCount, 3);
  assert.equal(second.title, null);
  assert.equal(second.acquisitionSummary, null);
  invalid(capture("capture"), {
    ...first,
    acquisitionSummary: { ...first.acquisitionSummary, lineCount: 0 },
  });
  invalid(capture("capture"), { ...first, title: "t".repeat(81) });
  const owner = example("owner").capture;
  assert.equal(
    owner.detail.intermediate.sessionsDone[0].acquiredSeconds,
    10800,
  );
  assert.equal(
    owner.detail.intermediate.sessionsPlanned[0].acquiredSeconds,
    null,
  );
  // Nothing is required that an earlier answer lacked.
  const earlier = structuredClone(owner);
  delete earlier.revision;
  delete earlier.quality;
  delete earlier.detail.sessionQuality;
  for (const night of earlier.detail.intermediate.sessionsDone)
    delete night.acquiredSeconds;
  valid(manage("capture"), earlier);
  const earlierItem = structuredClone(first);
  delete earlierItem.revision;
  delete earlierItem.title;
  delete earlierItem.acquisitionSummary;
  valid(capture("capture"), earlierItem);
});

test("the owner's two switches of the quality in the galleries: qualityShown on the owner's resource, one boolean per PATCH, imageQuality on the galleries' captures", () => {
  const owner = example("owner").capture;
  // The resource says both switches; an earlier answer without them still validates.
  valid(manage("capture"), {
    ...owner,
    qualityShown: { private: true, public: false },
  });
  invalid(manage("capture"), { ...owner, qualityShown: { private: true } });
  invalid(manage("capture"), {
    ...owner,
    qualityShown: { private: true, public: false, other: true },
  });
  invalid(manage("capture"), {
    ...owner,
    qualityShown: { private: 1, public: 0 },
  });
  // One change per call, a boolean.
  valid(manage("patch"), { qualityPrivate: false });
  valid(manage("patch"), { qualityPublic: true });
  invalid(manage("patch"), { qualityPublic: "yes" });
  invalid(manage("patch"), { qualityPublic: true, qualityPrivate: true });
  invalid(manage("patch"), { qualityPublic: true, stage: "finalized" });
  // What a gallery says of an image's quality: the figures, on what, by which tool, when.
  const quality = {
    fwhmPixels: 2.6,
    fwhmArcsec: 2.1,
    eccentricity: 0.38,
    starCount: 1840,
    measuredOn: "linear",
    measuredAt: "2026-10-14T08:00:00.000Z",
    tool: { name: "Astro Sync", version: "1.4.0" },
  };
  const gallery = (name) => `gallery.schema.json#/$defs/${name}`;
  valid(gallery("imageQuality"), quality);
  valid(gallery("imageQuality"), {
    ...quality,
    fwhmArcsec: null,
    eccentricity: null,
    measuredAt: null,
    tool: null,
  });
  invalid(gallery("imageQuality"), { ...quality, path: "/tmp/m31.fits" });
  invalid(gallery("imageQuality"), { ...quality, starCount: 1.5 });
  invalid(gallery("imageQuality"), { ...quality, measuredOn: "drizzle" });
  for (const name of ["capture", "variantImage"]) {
    assert.equal(
      documents["gallery.schema.json"].$defs[name].properties.quality.$ref,
      "#/$defs/imageQuality",
    );
    assert.equal(
      documents["gallery.schema.json"].$defs[name].required.includes("quality"),
      false,
      "absent while the owner's switch is off",
    );
  }
  assert.equal(
    documents["private-gallery.schema.json"].$defs.captureQuality.$ref,
    "gallery.schema.json#/$defs/imageQuality",
  );
});
