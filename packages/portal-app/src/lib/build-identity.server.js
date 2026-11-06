import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appVersion } from "./app-version.server.js";

/**
 * The version and the short commit the footer shows, small, after its
 * links: « v1.0.1 · 5f295f159 ».
 *
 * The commit is the one the running code was built from, fixed before the
 * service starts, by each build path:
 *
 * - an image (`Dockerfile`, `apps/portal-oss/Dockerfile` through
 *   `compose.yaml` and `deploy/install.sh`): `ASTRO_PORTAL_BUILD_ID`, the
 *   build argument `sha-<short>` the image was built with;
 * - a release (`scripts/deploy-release.mjs`, a `git archive` without
 *   `.git`): the file `RELEASE_COMMIT_FILE` it writes at the release's root;
 * - a checkout (`next build`, `node server.mjs`): `git rev-parse` of the
 *   checkout, at start.
 *
 * The start of the service (`server/start.js`) reads the last two into
 * `ASTRO_PORTAL_SOURCE_COMMIT` when the image gives none. When none is
 * known, the footer shows the version alone: never a guess.
 */

/** The file a release carries at its root: the commit it was cut from. */
export const RELEASE_COMMIT_FILE = ".astro-portal-commit";

const SHORT_LENGTH = 9;

/**
 * The short form of a commit given as `sha-<hex>`, `<hex>` or a full
 * 40-character SHA: lower case, 7 to 12 hexadecimal characters (a full SHA
 * is cut to 9). Anything else — a tag that is not a commit, an empty value —
 * is `null`.
 */
export function shortCommit(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^sha-/, "");
  if (/^[0-9a-f]{40}$/.test(text)) return text.slice(0, SHORT_LENGTH);
  return /^[0-9a-f]{7,12}$/.test(text) ? text : null;
}

/**
 * The commit of a release or of a checkout at `serviceDir`, read once at
 * start: the release's file first, then git. `null` when neither answers
 * (an image has no `.git` and no git).
 */
export function sourceCommitOf(serviceDir, { git = gitHead } = {}) {
  if (!serviceDir) return null;
  try {
    const fromRelease = shortCommit(
      readFileSync(join(serviceDir, RELEASE_COMMIT_FILE), "utf8"),
    );
    if (fromRelease) return fromRelease;
  } catch {
    // No release file: a checkout or an image.
  }
  if (!existsSync(join(serviceDir, ".git"))) return null;
  try {
    return shortCommit(git(serviceDir));
  } catch {
    return null;
  }
}

function gitHead(directory) {
  return execFileSync("git", ["rev-parse", `--short=${SHORT_LENGTH}`, "HEAD"], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  });
}

/** What the footer shows: `{ version, commit }`, `commit` possibly `null`. */
export function footerBuild(env = process.env) {
  return {
    version: appVersion(),
    commit:
      shortCommit(env.ASTRO_PORTAL_BUILD_ID) ??
      shortCommit(env.ASTRO_PORTAL_SOURCE_COMMIT),
  };
}
