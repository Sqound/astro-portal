import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import {
  parseUstarHeader,
  readUstarEntries,
  ustarBlockSize,
  ustarEndMarker,
  ustarHeader,
  writeUstarEntry,
} from "portal/sky-tiles/tar.js";

/** Writes `entries` (`{ name, size, data }`) plus the end marker to an
 * in-memory ustar archive and returns the resulting `Buffer` — the harness
 * every round-trip test below builds on. */
async function buildArchive(entries) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve) => stream.on("end", resolve));
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    await writeUstarEntry(
      stream,
      { name: entry.name, size: entry.data.length },
      entry.data,
    );
  }
  await new Promise((resolvePromise, reject) => {
    stream.write(ustarEndMarker(), (error) =>
      error ? reject(error) : resolvePromise(),
    );
  });
  stream.end();
  await ended;
  return Buffer.concat(chunks);
}

test("a single entry round-trips bit for bit, header and data alike", async () => {
  const data = Buffer.from("hello sky tile");
  const archive = await buildArchive([
    { name: "Norder3/Dir0/Npix17.jpg", data },
  ]);
  const entries = readUstarEntries(archive);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Norder3/Dir0/Npix17.jpg");
  assert.equal(entries[0].size, data.length);
  assert.ok(entries[0].data.equals(data));
});

test("entry sizes that are not multiples of 512 are padded and stripped back off exactly", async () => {
  for (const size of [0, 1, 511, 512, 513, 1023]) {
    const data = randomBytes(size);
    // eslint-disable-next-line no-await-in-loop
    const archive = await buildArchive([
      { name: `entries/size-${size}.bin`, data },
    ]);
    // Every entry after its header ends on a 512-byte boundary except for
    // the very last byte of real data — i.e. the archive's total length,
    // header included, is itself always a multiple of 512.
    assert.equal(
      archive.length % ustarBlockSize,
      0,
      `size ${size} archive must block-align`,
    );
    const [entry] = readUstarEntries(archive);
    assert.equal(entry.size, size);
    assert.ok(
      entry.data.equals(data),
      `size ${size} must round-trip bit for bit`,
    );
  }
});

test("multiple entries preserve both order and exact bytes, hashed to confirm", async () => {
  const sourceEntries = Array.from({ length: 12 }, (unused, index) => ({
    name: `Norder5/Dir${Math.floor(index / 4) * 10000}/Npix${index}.jpg`,
    data: randomBytes(1000 + index * 37),
  }));
  const archive = await buildArchive(sourceEntries);
  const entries = readUstarEntries(archive);
  assert.equal(entries.length, sourceEntries.length);
  entries.forEach((entry, index) => {
    assert.equal(entry.name, sourceEntries[index].name);
    assert.equal(
      createHash("sha256").update(entry.data).digest("hex"),
      createHash("sha256").update(sourceEntries[index].data).digest("hex"),
    );
  });
});

test("a 256-entry archive (an order-5 chunk) has exactly 256 entries, in order", async () => {
  const sourceEntries = Array.from({ length: 256 }, (unused, index) => ({
    name: `Norder5/Dir${Math.floor((512 + index) / 10000) * 10000}/Npix${512 + index}.jpg`,
    data: Buffer.from(`tile-${index}`),
  }));
  const archive = await buildArchive(sourceEntries);
  const entries = readUstarEntries(archive);
  assert.equal(entries.length, 256);
  entries.forEach((entry, index) => {
    assert.equal(entry.name, `Norder5/Dir0/Npix${512 + index}.jpg`);
  });
});

test("the archive ends with the mandatory two zero-filled 512-byte end-of-archive blocks", async () => {
  const archive = await buildArchive([
    { name: "a.bin", data: Buffer.from("x") },
  ]);
  const endMarker = archive.subarray(archive.length - ustarBlockSize * 2);
  assert.equal(endMarker.length, ustarBlockSize * 2);
  assert.ok(endMarker.every((byte) => byte === 0));
  // readUstarEntries must stop there rather than trying to parse past it.
  assert.equal(readUstarEntries(archive).length, 1);
});

test("parseUstarHeader returns null for the zero block and throws on a corrupted checksum", () => {
  assert.equal(parseUstarHeader(Buffer.alloc(ustarBlockSize)), null);
  const header = ustarHeader({ name: "a.bin", size: 3 });
  header[0] = "b".charCodeAt(0); // mutate the name without recomputing chksum
  assert.throws(() => parseUstarHeader(header), /checksum mismatch/);
});

test("ustarHeader rejects a name that does not fit the 100-byte field", () => {
  assert.throws(
    () => ustarHeader({ name: "x".repeat(101), size: 0 }),
    /exceeds/,
  );
  // Exactly 100 bytes is the field's own size and must be accepted.
  assert.doesNotThrow(() => ustarHeader({ name: "x".repeat(100), size: 0 }));
});

test("writeUstarEntry throws when the source does not actually contain `size` bytes", async () => {
  const stream = new PassThrough();
  stream.resume();
  await assert.rejects(
    writeUstarEntry(
      stream,
      { name: "short.bin", size: 10 },
      Buffer.from("abc"),
    ),
    /wrote 3 bytes, declared 10/,
  );
});

test("writing a 300-entry archive to a slow-draining stream never trips Node's MaxListenersExceededWarning", async () => {
  // A `highWaterMark` of 1 byte makes `writable.write(...)` report
  // backpressure on essentially every call (header, body, padding alike),
  // exactly the condition that used to leave a stale `error` listener
  // behind on every one of them (see `writeToStream`'s docblock in
  // `tar.js`) — with 300 entries this reliably exceeds Node's default
  // 10-listener warning threshold if the fix ever regresses.
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      // Asynchronous, like a real `fs.WriteStream`'s underlying disk I/O:
      // if the callback fired synchronously, Node would fold the chunk back
      // out of its internal buffer before `.write()` even returns, and
      // `.write()` would then report `true` (no backpressure) instead of
      // reproducing the condition this test targets.
      setImmediate(callback);
    },
  });

  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on("warning", onWarning);
  try {
    for (let index = 0; index < 300; index += 1) {
      const data = Buffer.from(`tile-${index}-${"x".repeat(64)}`);
      // eslint-disable-next-line no-await-in-loop
      await writeUstarEntry(
        stream,
        { name: `Norder6/Dir0/Npix${index}.jpg`, size: data.length },
        data,
      );
    }
    await new Promise((resolvePromise, reject) => {
      stream.write(ustarEndMarker(), (error) =>
        error ? reject(error) : resolvePromise(),
      );
    });
    await new Promise((resolvePromise, reject) => {
      stream.end((error) => (error ? reject(error) : resolvePromise()));
    });
    // Give any already-scheduled `process.emitWarning` a tick to land before
    // asserting there is none.
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
  } finally {
    process.off("warning", onWarning);
  }

  const listenerWarnings = warnings.filter(
    (warning) => warning.name === "MaxListenersExceededWarning",
  );
  assert.equal(
    listenerWarnings.length,
    0,
    `expected no MaxListenersExceededWarning, got: ${listenerWarnings
      .map((warning) => warning.message)
      .join("; ")}`,
  );
});

test("an async-iterable source (a stream stand-in) is accepted, not only a Buffer", async () => {
  async function* chunks() {
    yield Buffer.from("hel");
    yield Buffer.from("lo!");
  }
  const stream = new PassThrough();
  const collected = [];
  stream.on("data", (chunk) => collected.push(chunk));
  const ended = new Promise((resolve) => stream.on("end", resolve));
  await writeUstarEntry(stream, { name: "stream.bin", size: 6 }, chunks());
  stream.end();
  await ended;
  const [entry] = readUstarEntries(
    Buffer.concat([Buffer.concat(collected), ustarEndMarker()]),
  );
  assert.equal(entry.data.toString(), "hello!");
});
