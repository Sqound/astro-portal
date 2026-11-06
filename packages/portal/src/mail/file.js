import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { MailDeliveryError } from "./errors.js";

/**
 * The fake mailbox, for tests and development: one JSON file per message in
 * a directory of the runtime (ASTRO_PORTAL_MAIL_FILE_DIR, by default
 * `<runtime directory>/mailbox`). Nothing leaves the machine. The file holds
 * what a mail client would receive (`to`, `subject`, `text`, `html`) and,
 * for the tools that read it, the `code` and the `link` of the message.
 */
export function createFileSender({ directory, clock = () => new Date() }) {
  return {
    kind: "file",
    directory,
    async send({ to, subject, text, html, meta = {} }) {
      const sentAt = clock().toISOString();
      const id = randomUUID();
      const name = `${sentAt.replace(/[:.]/g, "-")}-${id}.json`;
      // The message appears whole or not at all: it is written under a name
      // that is not a message (`.part`), then renamed. A reader listing the
      // directory meanwhile (the tests do, while the service answers) never
      // finds a file that is still empty.
      const part = join(directory, `.${name}.part`);
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(
          part,
          `${JSON.stringify({ id, sentAt, to, subject, text, html, ...meta }, null, 2)}\n`,
          { mode: 0o600, flag: "wx" },
        );
        await rename(part, join(directory, name));
      } catch (error) {
        await rm(part, { force: true }).catch(() => {});
        throw new MailDeliveryError(
          `The fake mailbox could not be written (${error?.code || "error"}).`,
        );
      }
      return { accepted: true, file: name };
    },
  };
}

/**
 * Every message of a fake mailbox, oldest first (tests, local tools).
 *
 * A mailbox is not frozen while it is read: the erasure of a deleted space
 * (it starts right after the answer to the deletion and removes the messages
 * sent to the space's addresses) unlinks files between the listing and the
 * reading. A message that is gone by the time it is read is not in the
 * mailbox any more: it is left out, as if the listing had come a moment
 * later. Any other failure (a file that cannot be read, JSON that does not
 * parse) is raised.
 */
export async function readFakeMailbox(directory) {
  let names;
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const messages = (
    await Promise.all(
      names.map(async (name) => {
        let text;
        try {
          text = await readFile(join(directory, name), "utf8");
        } catch (error) {
          if (error?.code === "ENOENT") return null;
          throw error;
        }
        return JSON.parse(text);
      }),
    )
  ).filter(Boolean);
  return messages.sort((left, right) =>
    left.sentAt === right.sentAt ? 0 : left.sentAt < right.sentAt ? -1 : 1,
  );
}
