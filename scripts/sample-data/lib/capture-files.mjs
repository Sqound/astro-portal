// Finds the bytes of a capture: first where the portal itself keeps them
// (<root>/<space>/<aa>/<bb>/<sha256>), then anywhere under the folders given,
// by size and then by SHA-256. A file is never trusted by its name: it is the
// capture only when it hashes to the digest the database records.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

async function sha256OfFile(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", resolve);
  });
  return hash.digest("hex");
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export class CaptureFiles {
  #roots;
  #bySize = null;
  #hashes = new Map();

  constructor(roots) {
    this.#roots = roots;
  }

  async #walk() {
    if (this.#bySize) return this.#bySize;
    const bySize = new Map();
    const visited = new Set();
    const visit = async (directory) => {
      const real = await realpath(directory).catch(() => null);
      if (!real || visited.has(real)) return;
      visited.add(real);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) {
          const size = (await stat(path)).size;
          if (!bySize.has(size)) bySize.set(size, []);
          bySize.get(size).push(path);
        }
      }
    };
    for (const root of this.#roots) await visit(root);
    this.#bySize = bySize;
    return bySize;
  }

  async #digest(path) {
    if (!this.#hashes.has(path))
      this.#hashes.set(path, await sha256OfFile(path));
    return this.#hashes.get(path);
  }

  /** The bytes of the capture with this digest and size, or null when no file holds them. */
  async find({ tenantId, sha256, byteSize }) {
    for (const root of this.#roots)
      for (const candidate of [
        join(root, tenantId, sha256.slice(0, 2), sha256.slice(2, 4), sha256),
        join(root, sha256.slice(0, 2), sha256.slice(2, 4), sha256),
        join(root, sha256),
      ])
        if (
          (await isFile(candidate)) &&
          (await this.#digest(candidate)) === sha256
        )
          return readFile(candidate);
    const sameSize = (await this.#walk()).get(byteSize) || [];
    for (const path of sameSize)
      if ((await this.#digest(path)) === sha256) return readFile(path);
    return null;
  }
}
