import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  DATA_EXPORT_GALLERY_LINE,
  DATA_EXPORT_PARTS,
  dataExportCounts,
  dataExportDocuments,
  dataExportFileText,
  dataExportFilename,
  dataExportParts,
  parseDataExportReadme,
} from "portal/data-export/rules.js";
import { crc32, zipArchive, zipEntrySize } from "portal/data-export/zip.js";
import {
  assertValid,
  schemaErrors,
} from "../../astro-contracts/tests/schema-assert.mjs";

/**
 * « Exporter mes données »: the rule box → JSON, the README's first lines,
 * and the ZIP written without a dependency, read back here header by
 * header. The data are the fixture's: synthetic names, places at 45° N,
 * 30° W, in the Atlantic.
 */

const contracts = new URL("../../astro-contracts/", import.meta.url);
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, contracts), "utf8"));
const schemaOf = (part) =>
  json(`schemas/export/data-export-${part}.schema.json`);
const fixture = await json("fixtures/data-export.json");
const source = fixture.cases.find((entry) => entry.id === "six-boxes").args[0]
  .source;
const EXPORTED_AT = "2026-10-05T18:30:00.000Z";

/** Every entry of a ZIP, read from its central directory and checked
 * against its local header and its CRC-32. */
function readZip(buffer) {
  const end = buffer.length - 22;
  assert.equal(
    buffer.readUInt32LE(end),
    0x06054b50,
    "end of central directory",
  );
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  assert.equal(directoryOffset + directorySize, end);
  const entries = [];
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50, "central header");
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const checksum = buffer.readUInt32LE(at + 16);
    const packedSize = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    assert.equal(flags & 0x0800, 0x0800, "UTF-8 names");
    assert.equal(method, 8, "deflated");

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, "local header");
    assert.equal(buffer.readUInt32LE(localOffset + 14), checksum);
    assert.equal(buffer.readUInt32LE(localOffset + 18), packedSize);
    assert.equal(buffer.readUInt32LE(localOffset + 22), size);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    assert.equal(
      buffer.toString(
        "utf8",
        localOffset + 30,
        localOffset + 30 + localNameLength,
      ),
      name,
    );
    const start = localOffset + 30 + localNameLength + localExtra;
    const data = inflateRawSync(buffer.subarray(start, start + packedSize));
    assert.equal(data.length, size);
    assert.equal(crc32(data), checksum, `CRC-32 of ${name}`);
    entries.push({ name, text: data.toString("utf8") });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const archiveOf = (parts) =>
  zipArchive(
    dataExportDocuments({ parts, exportedAt: EXPORTED_AT, source }).files.map(
      (file) => ({ name: file.name, data: dataExportFileText(file) }),
    ),
    { modifiedAt: new Date(EXPORTED_AT) },
  );

test("each JSON of the six boxes validates against its schema", async () => {
  const { files } = dataExportDocuments({
    parts: DATA_EXPORT_PARTS,
    exportedAt: EXPORTED_AT,
    source,
  });
  for (const part of DATA_EXPORT_PARTS) {
    const file = files.find((entry) => entry.document?.part === part);
    assert.ok(file, part);
    assertValid(await schemaOf(part), file.document);
  }
  // An empty box is a file whose lists are empty, valid all the same.
  const empty = dataExportDocuments({
    parts: DATA_EXPORT_PARTS,
    exportedAt: EXPORTED_AT,
    source: {},
  }).files;
  for (const file of empty.slice(1))
    assertValid(await schemaOf(file.document.part), file.document);
  // And a schema refuses a later version.
  assert.notDeepEqual(
    schemaErrors(await schemaOf("plans"), {
      ...files[1].document,
      formatVersion: 2,
    }),
    [],
  );
});

test("the README carries formatVersion: 1, the boxes present and the gallery line", async () => {
  const { files } = dataExportDocuments({
    parts: ["places", "plans", "framings"],
    exportedAt: EXPORTED_AT,
    source,
  });
  assert.equal(files[0].name, "README.md");
  const text = files[0].text;
  assert.match(
    text,
    /^formatVersion: 1\nexportedAt: 2026-10-05T18:30:00\.000Z\nparts: plans, places, framings\n\n/,
  );
  assert.ok(text.includes(DATA_EXPORT_GALLERY_LINE));
  const front = parseDataExportReadme(text);
  assert.deepEqual(front, {
    formatVersion: 1,
    exportedAt: EXPORTED_AT,
    parts: ["plans", "places", "framings"],
  });
  assertValid(
    await json("schemas/export/data-export-readme.schema.json"),
    front,
  );
});

test("an unticked box is absent from the ZIP, the ticked ones in the order of the screen", () => {
  const names = readZip(
    archiveOf(["sky-measurements", "plans", "places", "equipment"]),
  ).map((entry) => entry.name);
  assert.deepEqual(names, [
    "README.md",
    "plans.json",
    "places.json",
    "equipment.json",
    "sky-measurements.json",
  ]);
  assert.ok(!names.includes("journal.json"));
  assert.ok(!names.includes("framings.json"));
});

test("the ZIP reads back: local headers, central directory, CRC-32, the bytes written", () => {
  const entries = readZip(archiveOf(DATA_EXPORT_PARTS));
  assert.equal(entries.length, 7);
  const plans = JSON.parse(entries.find((e) => e.name === "plans.json").text);
  assert.equal(plans.formatVersion, 1);
  assert.equal(plans.part, "plans");
  // The known check value of CRC-32, and an empty archive is still one.
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const empty = zipArchive([]);
  assert.equal(empty.length, 22);
  assert.deepEqual(readZip(empty), []);
  // The estimate of an entry is its exact share of the archive.
  const one = { name: "équipement.json", data: '{"a":1}\n' };
  assert.equal(zipArchive([one]).length, zipEntrySize(one.name, one.data) + 22);
});

test("identifiers are kept as they are", () => {
  const { files } = dataExportDocuments({
    parts: DATA_EXPORT_PARTS,
    exportedAt: EXPORTED_AT,
    source,
  });
  const byPart = Object.fromEntries(
    files.slice(1).map((file) => [file.document.part, file.document]),
  );
  assert.deepEqual(
    byPart.plans.plans.map((plan) => [plan.id, plan.resourceId]),
    source.plans.map((plan) => [plan.id, plan.resourceId]),
  );
  assert.equal(byPart.plans.projects[0].id, source.projects[0].id);
  assert.deepEqual(
    byPart.places.places.map((place) => place.id),
    source.places.map((place) => place.id),
  );
  assert.equal(byPart.equipment.equipment[1].id, source.equipment[1].id);
  assert.equal(byPart.framings.framings[0].id, source.framings[0].id);
  assert.equal(byPart.journal.sessions[0].id, source.sessions[0].id);
  assert.equal(
    byPart.journal.sessions[0].events[0].eventId,
    source.sessions[0].events[0].eventId,
  );
  assert.equal(byPart.journal.debriefs[0].planId, source.debriefs[0].planId);
  assert.equal(
    byPart["sky-measurements"].places[0].placeId,
    source.skyMeasurements[0].placeId,
  );
});

test("the counts, the boxes asked for and the file's name", () => {
  assert.deepEqual(dataExportCounts(source), {
    plans: { count: 3, multiNight: 1 },
    places: { count: 3, horizons: 2 },
    equipment: { count: 2 },
    framings: { count: 1 },
    journal: { count: 1 },
    "sky-measurements": { count: 2 },
  });
  assert.deepEqual(dataExportParts("journal,plans, journal"), [
    "plans",
    "journal",
  ]);
  assert.equal(dataExportParts("plans,photos"), null);
  assert.deepEqual(dataExportParts(""), []);
  assert.equal(
    dataExportFilename("2026-10-05"),
    "planastro-export-2026-10-05.zip",
  );
  assert.equal(dataExportFilename("2026-02-30"), null);
  assert.equal(dataExportFilename("05/10/2026"), null);
});

test("the fixture specs hold at least six cases, every generated result matching the rule", async () => {
  let cases = 0;
  for (const module of [
    "data-export",
    "data-export-summary",
    "data-export-crc32",
  ]) {
    const spec = await json(`fixtures/spec/${module}.json`);
    const generated = await json(`fixtures/${module}.json`);
    assert.deepEqual(
      generated.cases.map((entry) => entry.id),
      spec.cases.map((entry) => entry.id),
    );
    cases += spec.cases.length;
  }
  assert.ok(cases >= 6, `${cases} cases`);
  for (const entry of fixture.cases)
    assert.deepEqual(
      JSON.parse(JSON.stringify(dataExportDocuments(...entry.args))),
      entry.result,
      entry.id,
    );
});
