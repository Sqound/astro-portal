#!/usr/bin/env node
/*
 * Deploys an immutable release of the checked-out commit on this machine
 * (docs/SELF_HOSTING.md, « Updating with releases »; docs/DEPLOYMENT.md,
 * « Immutable releases and rollback »):
 *
 *   git archive → npm ci → build → a candidate probed on a loopback port,
 *   without the live database → a verified SQLite snapshot → the atomic
 *   switch of `current` → the restart of the service → a probe of the live
 *   service → the removal of old releases.
 *
 * When the candidate fails, `current` is not touched and the release is
 * removed. When the live service does not answer after the switch, `current`
 * goes back to the previous release, the service is restarted again, and the
 * command fails: the automatic rollback.
 *
 * Settings, all from the environment — no path nor label is written here:
 *
 * - ASTRO_PORTAL_PRIVATE_ROOT (required): the deployment root, holding
 *   `releases/`, `current` and `backups/`; private data stays outside
 *   `releases/` and `current/`.
 * - ASTRO_PORTAL_DATABASE_PATH: the live SQLite database, snapshotted
 *   before the switch (never opened by the candidate).
 * - ASTRO_PORTAL_LAUNCHD_LABEL or ASTRO_PORTAL_LAUNCHD_PLIST (macOS): the
 *   launchd job restarted after the switch (`kickstart -k`, or
 *   `bootout`/`bootstrap` of the plist).
 * - ASTRO_PORTAL_RESTART_COMMAND: instead of launchd, a shell command that
 *   restarts the service (for example `systemctl --user restart astro-portal`).
 * - ASTRO_PORTAL_LIVE_URL: the address of the live service, probed after the
 *   restart (for example `http://127.0.0.1:8787`); unset, it is not probed
 *   and no automatic rollback can happen after the switch.
 * - ASTRO_PORTAL_CANDIDATE_PORT (default 8878): the candidate's loopback port.
 * - ASTRO_PORTAL_PROBE_TIMEOUT_SECONDS (default 90): how long a probe waits.
 *
 * Options:
 *
 * - `--app root|portal-oss`: which application to deploy — `portal-oss`,
 *   `apps/portal-oss/server.mjs` (the default when there is no `server.mjs`
 *   at the repository's root, as in the Astro Portal repository), or `root`,
 *   the `server.mjs` at the repository's root (the default where it exists;
 *   the Astro Portal repository has none, so `--app root` does not apply
 *   there).
 * - `--no-launchd`: switch `current` without restarting any launchd job.
 * - `--local`: deploy a commit of a repository that has no upstream (a local
 *   repository); by default the commit must be pushed to its upstream.
 */
import { execFile, spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  access,
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const env = process.env;
const root =
  env.ASTRO_PORTAL_PRIVATE_ROOT && resolve(env.ASTRO_PORTAL_PRIVATE_ROOT);
const launchdLabel = env.ASTRO_PORTAL_LAUNCHD_LABEL || null;
const launchdPlist = env.ASTRO_PORTAL_LAUNCHD_PLIST || null;
const restartCommand = env.ASTRO_PORTAL_RESTART_COMMAND || null;
const liveUrl = env.ASTRO_PORTAL_LIVE_URL || null;
const databasePath = env.ASTRO_PORTAL_DATABASE_PATH || null;
const port = Number(env.ASTRO_PORTAL_CANDIDATE_PORT || 8878);
const probeTimeoutMs =
  Number(env.ASTRO_PORTAL_PROBE_TIMEOUT_SECONDS || 90) * 1000;
const noLaunchd = flag("--no-launchd");
const localRepository = flag("--local");
const releasesToKeep = 3;
if (!root) throw new Error("ASTRO_PORTAL_PRIVATE_ROOT is required.");

const APPS = {
  // The `server.mjs` at the repository's root (absent from the Astro Portal
  // repository).
  root: {
    server: "server.mjs",
    build: [["run", "build"]],
    nextDir: ".next",
  },
  // The Astro Portal application.
  "portal-oss": {
    server: "apps/portal-oss/server.mjs",
    build: [
      ["run", "build:packages"],
      ["run", "build", "-w", "apps/portal-oss"],
    ],
    nextDir: "apps/portal-oss/.next",
  },
};

/**
 * The Next.js build of a release: every build has its own identifier, and a
 * server serves `/_next/static/<identifier>/_buildManifest.js` for its own
 * build only. Null when the release has none (a removed release).
 */
async function buildIdOf(release, app) {
  try {
    return (
      (await readFile(join(release, app.nextDir, "BUILD_ID"), "utf8")).trim() ||
      null
    );
  } catch {
    return null;
  }
}

async function command(file, commandArgs, options = {}) {
  return exec(file, commandArgs, { ...options, maxBuffer: 10_000_000 });
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
const log = (step, detail = {}) =>
  console.log(JSON.stringify({ step, ...detail }));

async function checkedOutCommit() {
  if ((await command("git", ["status", "--porcelain"])).stdout.trim())
    throw new Error("The checkout is not clean.");
  if (!localRepository) {
    await command("git", [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    await command("git", ["merge-base", "--is-ancestor", "HEAD", "@{u}"]);
  }
  return (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
}

async function restartService() {
  if (restartCommand) {
    await command("sh", ["-c", restartCommand]);
    return "command";
  }
  if (noLaunchd) return "none";
  if (launchdPlist) {
    const domain = `gui/${process.getuid()}`;
    await command("launchctl", ["bootout", domain, launchdPlist]).catch(
      () => {},
    );
    await command("launchctl", ["bootstrap", domain, launchdPlist]);
    return "launchd";
  }
  if (launchdLabel) {
    await command("launchctl", [
      "kickstart",
      "-k",
      `gui/${process.getuid()}/${launchdLabel}`,
    ]);
    return "launchd";
  }
  return "none";
}

async function switchCurrent(target) {
  const current = join(root, "current"),
    temporary = join(root, ".current.next");
  await rm(temporary, { force: true });
  await symlink(target, temporary);
  await rename(temporary, current);
}

/**
 * Waits until the service at `base` says it is an Astro Portal
 * (`/api/v1/service`), serves its catalogue (`/api/catalog`) and, with
 * `buildId`, is that build: an earlier process still answering on the port
 * (a restart that did not stop it, a new process that could not take the
 * port or the SQLite lease) answers the first two as well.
 */
async function probe(
  base,
  { buildId = null, timeoutMs = probeTimeoutMs } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const service = await fetch(`${base}/api/v1/service`, {
        signal: AbortSignal.timeout(10_000),
      });
      const identity = await service.json();
      if (!service.ok || identity.apiVersion !== 1)
        throw new Error(`/api/v1/service answered ${service.status}`);
      const catalog = await fetch(`${base}/api/catalog`, {
        signal: AbortSignal.timeout(10_000),
      });
      const body = await catalog.json();
      if (!catalog.ok || !Array.isArray(body.targets))
        throw new Error(`/api/catalog answered ${catalog.status}`);
      if (buildId) {
        const manifest = await fetch(
          `${base}/_next/static/${encodeURIComponent(buildId)}/_buildManifest.js`,
          { signal: AbortSignal.timeout(10_000) },
        );
        await manifest.arrayBuffer();
        if (!manifest.ok)
          throw new Error(
            `the service answering is not build ${buildId} (its manifest answered ${manifest.status})`,
          );
      }
      return {
        version: identity.version,
        signIn: identity.signIn?.method,
        ...(buildId ? { build: buildId } : {}),
      };
    } catch (error) {
      lastError = error;
      await new Promise((wait) => setTimeout(wait, 1000));
    }
  }
  throw new Error(
    `${base} did not answer as an Astro Portal within ${Math.round(timeoutMs / 1000)} s (${lastError?.message || "no answer"}).`,
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
async function backupDatabase(sha) {
  if (!databasePath || !(await exists(databasePath))) return null;
  const backups = join(root, "backups");
  // Snapshots of the private database are its user's alone, like the
  // database itself (packages/portal/src/persistence/backup/files.js).
  await mkdir(backups, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backup = join(
    backups,
    `portal-${timestamp}-${sha.slice(0, 12)}.sqlite`,
  );
  const database = new DatabaseSync(databasePath);
  try {
    // SQLite produces a consistent snapshot even while the current service is
    // reading the database. This is safer than copying a potential WAL pair.
    database.exec(`VACUUM INTO ${sqlLiteral(backup)}`);
  } finally {
    database.close();
  }
  await chmod(backup, 0o600);
  const snapshot = new DatabaseSync(backup);
  try {
    const result = snapshot.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok")
      throw new Error(
        `SQLite backup integrity check failed: ${result.integrity_check}`,
      );
    snapshot.prepare("SELECT version FROM schema_migrations LIMIT 1").get();
  } catch (error) {
    await rm(backup, { force: true });
    throw error;
  } finally {
    snapshot.close();
  }
  return backup;
}

async function pruneReleases(releases, current) {
  const active =
    (await exists(current)) && (await lstat(current)).isSymbolicLink()
      ? resolve(await readlink(current))
      : null;
  const candidates = await Promise.all(
    (await readdir(releases, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(releases, entry.name);
        return { path, mtimeMs: (await stat(path)).mtimeMs };
      }),
  );
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  // Keep the active release even after a manual rollback, then keep the two
  // newest alternatives. A failed deletion must not undo a healthy deployment.
  const retained = new Set(active ? [active] : []);
  for (const candidate of candidates) {
    if (retained.size >= releasesToKeep) break;
    retained.add(candidate.path);
  }
  const removed = [];
  const errors = [];
  for (const candidate of candidates) {
    if (retained.has(candidate.path)) continue;
    try {
      await rm(candidate.path, { recursive: true, force: true });
      removed.push(candidate.path);
    } catch (error) {
      errors.push({ path: candidate.path, error: String(error) });
    }
  }
  return { retained: [...retained], removed, errors };
}

/** Runs the release's server on the loopback port, without the live data. */
async function probeCandidate(release, app) {
  const {
    ASTRO_PORTAL_DATABASE_PATH: _databasePath,
    ASTRO_PORTAL_DATABASE_URL: _databaseUrl,
    ...candidateEnv
  } = env;
  const runtime = join(release, ".candidate-runtime");
  await mkdir(runtime, { recursive: true });
  const child = spawn(process.execPath, [app.server, "-p", String(port)], {
    cwd: release,
    env: {
      ...candidateEnv,
      NODE_ENV: "production",
      PORT: String(port),
      HOST: "127.0.0.1",
      ASTRO_PORTAL_SERVICE_DIR: release,
      // A candidate never opens, migrates nor backs up the live private
      // data: no database, its own runtime directory, no sign-in.
      ASTRO_PORTAL_RUNTIME_DIR: runtime,
      ASTRO_PORTAL_BACKUP_DIR: join(runtime, "backups"),
      ASTRO_PORTAL_AUTH_MODE: "disabled",
    },
    stdio: "ignore",
  });
  const exited = new Promise((resolveExit) =>
    child.once("exit", (code) => resolveExit(code)),
  );
  try {
    return await Promise.race([
      probe(`http://127.0.0.1:${port}`, {
        buildId: await buildIdOf(release, app),
      }),
      exited.then((code) => {
        throw new Error(`the candidate exited (code ${code}) before answering`);
      }),
    ]);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((wait) => setTimeout(wait, 10_000)),
    ]);
    await rm(runtime, { recursive: true, force: true });
  }
}

const appName =
  option("--app") || ((await exists("server.mjs")) ? "root" : "portal-oss");
const app = APPS[appName];
if (!app)
  throw new Error(
    `Unknown --app ${appName}: choose ${Object.keys(APPS).join(" or ")}.`,
  );
const sha = await checkedOutCommit();
const releases = join(root, "releases"),
  release = join(releases, sha),
  current = join(root, "current");
await mkdir(releases, { recursive: true });
if (await exists(release)) throw new Error(`Release already exists: ${sha}`);
const previous =
  (await exists(current)) && (await lstat(current)).isSymbolicLink()
    ? await readlink(current)
    : null;
log("release", { app: appName, sha, release, previous });
await mkdir(release);
let switched = false;
try {
  // git archive has no access to ignored private files and keeps releases
  // reproducible.
  await command("sh", [
    "-c",
    `git archive ${sha} | tar -x -C "$1"`,
    "deploy-release",
    release,
  ]);
  // The commit the footer shows (portal-app/lib/build-identity.server.js):
  // an archive has no .git.
  await writeFile(join(release, ".astro-portal-commit"), `${sha}\n`);
  await command("npm", ["ci"], { cwd: release });
  for (const step of app.build) await command("npm", step, { cwd: release });
  log("candidate", { port, ...(await probeCandidate(release, app)) });
  const backup = await backupDatabase(sha);
  await switchCurrent(release);
  switched = true;
  const restart = await restartService();
  log("switched", { current: release, backup, restart });
  if (liveUrl)
    log("live", {
      url: liveUrl,
      ...(await probe(liveUrl, { buildId: await buildIdOf(release, app) })),
    });
  else log("live", { url: null, probed: false });
  const cleanup = await pruneReleases(releases, current);
  console.log(
    JSON.stringify({
      app: appName,
      sha,
      release,
      previous,
      backup,
      cleanup,
      status: "deployed",
    }),
  );
} catch (error) {
  // The automatic rollback: `current` back to the previous release and the
  // service restarted on it; the failed release removed.
  let rolledBack = null;
  if (switched && previous) {
    try {
      await switchCurrent(previous);
      await restartService();
      rolledBack = previous;
      if (liveUrl)
        log(
          "live-after-rollback",
          await probe(liveUrl, { buildId: await buildIdOf(previous, app) }),
        );
    } catch (rollbackError) {
      log("rollback-failed", { error: rollbackError.message });
    }
  }
  // A first release that failed after the switch leaves nothing behind.
  if (switched && !previous) await rm(current, { force: true });
  await rm(release, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      app: appName,
      sha,
      status: switched ? "rolled-back" : "not-deployed",
      current: rolledBack || previous,
      error: error.message,
    }),
  );
  process.exitCode = 1;
}
