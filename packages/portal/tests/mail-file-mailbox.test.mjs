import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSender, readFakeMailbox } from "../dist/mail/file.js";

async function withDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), "astro-fake-mailbox-"));
  try {
    return await action(join(directory, "mailbox"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a mailbox that does not exist yet is empty", async () => {
  await withDirectory(async (mailbox) => {
    assert.deepEqual(await readFakeMailbox(mailbox), []);
  });
});

test("the messages come back oldest first, whatever their file names", async () => {
  await withDirectory(async (mailbox) => {
    const instants = ["2026-10-05T10:00:02.000Z", "2026-10-05T10:00:01.000Z"];
    for (const [index, instant] of instants.entries()) {
      const sender = createFileSender({
        directory: mailbox,
        clock: () => new Date(instant),
      });
      await sender.send({
        to: `person-${index}@example.com`,
        subject: "s",
        text: "t",
        html: "<p>t</p>",
        meta: { code: String(index) },
      });
    }
    const messages = await readFakeMailbox(mailbox);
    assert.deepEqual(
      messages.map((message) => message.to),
      ["person-1@example.com", "person-0@example.com"],
    );
  });
});

test("a message erased between the listing and the reading is left out, not raised", async () => {
  await withDirectory(async (mailbox) => {
    const sender = createFileSender({ directory: mailbox });
    await sender.send({
      to: "kept@example.com",
      subject: "s",
      text: "t",
      html: "<p>t</p>",
    });
    // A name the listing returns whose file is gone by the time it is read:
    // what the erasure of a deleted space does to its messages meanwhile.
    await symlink(
      join(mailbox, "never-there.json"),
      join(mailbox, "2000-01-01T00-00-00-000Z-gone.json"),
    );
    const messages = await readFakeMailbox(mailbox);
    assert.deepEqual(
      messages.map((message) => message.to),
      ["kept@example.com"],
    );
  });
});

test("a message that cannot be parsed is still an error", async () => {
  await withDirectory(async (mailbox) => {
    const sender = createFileSender({ directory: mailbox });
    await sender.send({
      to: "a@example.com",
      subject: "s",
      text: "t",
      html: "",
    });
    await writeFile(join(mailbox, "broken.json"), "{ not json", "utf8");
    await assert.rejects(readFakeMailbox(mailbox), SyntaxError);
  });
});

test("a message is whole the moment its file is listed, and nothing else is left behind", async () => {
  await withDirectory(async (mailbox) => {
    const sender = createFileSender({ directory: mailbox });
    const { readdir, readFile } = await import("node:fs/promises");
    let listed = 0;
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        for (const name of await readdir(mailbox).catch(() => [])) {
          if (!name.endsWith(".json")) continue;
          const text = await readFile(join(mailbox, name), "utf8").catch(
            () => null,
          );
          if (text === null) continue;
          JSON.parse(text);
          listed += 1;
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
    for (let index = 0; index < 60; index += 1)
      await sender.send({
        to: `person-${index}@example.com`,
        subject: "s",
        text: "t".repeat(20_000),
        html: "<p>t</p>",
      });
    stop = true;
    await reader;
    assert.ok(listed > 0, "the reader saw messages");
    const names = await readdir(mailbox);
    assert.equal(names.length, 60);
    assert.ok(
      names.every((name) => name.endsWith(".json")),
      names.join(),
    );
  });
});
