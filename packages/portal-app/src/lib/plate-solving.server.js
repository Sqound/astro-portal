import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { captureStore } from "portal/uploads/capture-store.js";
import {
  astrometryIndexDir,
  defaultScaleHigh,
  defaultScaleLow,
  hygCatalog,
  imagesDir,
  plateSolveDir,
  plotConstellationsCommand,
  solveCpuLimit,
  solveFieldCommand,
  wcsInfoCommand,
} from "./config.server.js";
import { fileExists, safePath } from "./filesystem.server.js";
import {
  skySolutionFromWcsCards,
  numericFitsCards,
} from "portal/sky-annotations/wcs-header.js";

const jobs = new Set();
const wcsCache = new Map();
let hygStarsPromise;

function astronomyEnvironment() {
  return {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
  };
}

function runCapture(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: astronomyEnvironment(),
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolveRun({ code: null, output }));
    child.on("close", (code) => resolveRun({ code, output }));
  });
}

function csvFields(line) {
  return [...line.matchAll(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g)].map(
    (match) => (match[1] ?? match[2] ?? "").replaceAll('""', '"'),
  );
}

async function loadHygStars() {
  if (!hygStarsPromise) {
    hygStarsPromise = readFile(hygCatalog, "utf8")
      .then((content) => content.split("\n").slice(1).map(csvFields))
      .then((rows) =>
        rows.map((row) => ({
          ra: Number(row[7]) * 15,
          dec: Number(row[8]),
          vmag: Number(row[13]),
          label:
            row[6] ||
            row[5] ||
            (row[2] ? `HD ${row[2]}` : row[1] ? `HIP ${row[1]}` : ""),
        })),
      )
      .then((stars) =>
        stars.filter(
          (star) =>
            Number.isFinite(star.ra) &&
            Number.isFinite(star.dec) &&
            Number.isFinite(star.vmag) &&
            star.label &&
            star.label !== "Sol",
        ),
      )
      .catch(() => []);
  }
  return hygStarsPromise;
}

async function hygAnnotations(wcsPath) {
  const info = await runCapture(wcsInfoCommand, [wcsPath]);
  const value = (name) =>
    Number(info.output.match(new RegExp(`^${name}\\s+(.+)$`, "m"))?.[1]);
  const [crpixX, crpixY, ra0, dec0, cd11, cd12, cd21, cd22, width, height] = [
    "crpix0",
    "crpix1",
    "crval0",
    "crval1",
    "cd11",
    "cd12",
    "cd21",
    "cd22",
    "imagew",
    "imageh",
  ].map(value);
  const determinant = cd11 * cd22 - cd12 * cd21;
  if (
    ![
      crpixX,
      crpixY,
      ra0,
      dec0,
      cd11,
      cd12,
      cd21,
      cd22,
      width,
      height,
      determinant,
    ].every(Number.isFinite) ||
    !determinant
  )
    return [];
  const cosDec = Math.cos((dec0 * Math.PI) / 180);
  return (await loadHygStars())
    .map((star) => {
      const dra = (((star.ra - ra0 + 540) % 360) - 180) * cosDec;
      const ddec = star.dec - dec0;
      return {
        type: "bright",
        names: [star.label],
        pixelx: crpixX + (cd22 * dra - cd12 * ddec) / determinant,
        pixely: crpixY + (-cd21 * dra + cd11 * ddec) / determinant,
        radius: 0,
        vmag: star.vmag,
      };
    })
    .filter(
      (star) =>
        star.pixelx >= 0 &&
        star.pixelx <= width &&
        star.pixely >= 0 &&
        star.pixely <= height,
    )
    .sort((left, right) => left.vmag - right.vmag);
}

async function createAnnotations(directory) {
  const wcsPath = join(directory, "solution.wcs");
  const outputPath = join(directory, "annotations.json");
  if (!(await fileExists(wcsPath))) return false;
  const result = await runCapture(plotConstellationsCommand, [
    "-w",
    wcsPath,
    "-L",
    "-N",
    "-J",
  ]);
  const start = result.output.indexOf("{");
  const end = result.output.indexOf("\n}", start);
  if (result.code !== 0 || start < 0 || end < 0) return false;
  try {
    const astrometry = JSON.parse(result.output.slice(start, end + 2));
    const stars = await hygAnnotations(wcsPath);
    const objects = (astrometry.annotations || []).filter(
      (item) => item.type !== "star",
    );
    await writeFile(
      outputPath,
      JSON.stringify({ annotations: [...objects, ...stars] }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function wcsSummary(targetId, asset) {
  const key = Buffer.from(`${targetId}:${asset.assetId}`).toString("base64url");
  if (wcsCache.has(key)) return wcsCache.get(key);
  const pending = (async () => {
    const wcsPath = join(plateSolveDir, key, "solution.wcs");
    if (!(await fileExists(wcsPath))) return null;
    const result = await runCapture(wcsInfoCommand, [wcsPath]);
    if (result.code !== 0) return null;
    const value = (name) =>
      Number(result.output.match(new RegExp(`^${name}\\s+(.+)$`, "m"))?.[1]);
    const [ra, dec, fieldWidth, fieldHeight, scale, orientation] = [
      "ra_center",
      "dec_center",
      "fieldw",
      "fieldh",
      "pixscale",
      "orientation_center",
    ].map(value);
    return [ra, dec, fieldWidth, fieldHeight, scale, orientation].every(
      Number.isFinite,
    )
      ? { ra, dec, fieldWidth, fieldHeight, scale, orientation }
      : null;
  })();
  wcsCache.set(key, pending);
  return pending;
}

export async function plateSolve(target, asset, retry = false) {
  const key = Buffer.from(`${target.id}:${asset.assetId}`).toString(
    "base64url",
  );
  const directory = join(plateSolveDir, key);
  const solvedOverlay = join(directory, "solution-ngc.png");
  const annotationsPath = join(directory, "annotations.json");
  const statusPath = join(directory, "status.json");
  const annotationsUrl = `/plate-solves/${encodeURIComponent(key)}/annotations.json`;
  const source = safePath(imagesDir, asset.png);
  if (!source) return { state: "failed", message: "Image invalide." };
  if (await fileExists(annotationsPath))
    return { state: "ready", annotationsUrl };

  if (await fileExists(solvedOverlay)) {
    if (jobs.has(key)) return { state: "running" };
    jobs.add(key);
    createAnnotations(directory).finally(() => jobs.delete(key));
    return { state: "running" };
  }

  if (!retry && (await fileExists(statusPath))) {
    try {
      return JSON.parse(await readFile(statusPath, "utf8"));
    } catch {
      return {
        state: "failed",
        message: "Résultat du plate solving illisible.",
      };
    }
  }
  if (jobs.has(key)) return { state: "running" };

  await mkdir(directory, { recursive: true });
  jobs.add(key);
  const hints = target.plateSolveHints || {};
  const positionalHints =
    Number.isFinite(hints.ra) && Number.isFinite(hints.dec)
      ? [
          "--ra",
          String(hints.ra),
          "--dec",
          String(hints.dec),
          "--radius",
          String(hints.radius || 4),
        ]
      : [];
  const args = [
    "--overwrite",
    "--index-dir",
    astrometryIndexDir,
    "--dir",
    directory,
    "--out",
    "solution",
    "--scale-units",
    "degwidth",
    "--scale-low",
    String(hints.scaleLow || defaultScaleLow),
    "--scale-high",
    String(hints.scaleHigh || defaultScaleHigh),
    ...positionalHints,
    "--downsample",
    String(hints.downsample || 2),
    "--cpulimit",
    String(hints.cpuLimit || solveCpuLimit),
    source,
  ];
  const child = spawn(solveFieldCommand, args, {
    stdio: ["ignore", "ignore", "pipe"],
    env: astronomyEnvironment(),
  });
  let solverLog = "";
  child.stderr.on("data", (chunk) => {
    solverLog += chunk;
  });
  child.on("close", async (code) => {
    const solved = code === 0 && (await fileExists(solvedOverlay));
    if (solved) await createAnnotations(directory);
    await writeFile(join(directory, "solve.log"), solverLog);
    await writeFile(
      statusPath,
      JSON.stringify({
        state: solved ? "ready" : "failed",
        message: solved
          ? undefined
          : `Astrometry.net a quitté avec le code ${code ?? "inconnu"}.`,
        finishedAt: new Date().toISOString(),
      }),
    );
    jobs.delete(key);
  });
  child.on("error", async () => {
    await writeFile(
      statusPath,
      JSON.stringify({
        state: "failed",
        message: "Astrometry.net ne peut pas être lancé.",
      }),
    );
    jobs.delete(key);
  });
  return { state: "running" };
}

// ---- The fallback of a private server that has `solve-field` and its indices.
// The sky solution of a capture's image is Astro Sync's (computed on the
// person's computer); a private server whose operator installed
// astrometry.net may also solve an image on demand, from the owner's
// detail (« Résoudre sur ce serveur »). **A server never solves
// unless it is configured to**: the fallback exists only where
// `sky.solve_on_server` is true, and that is read from the server's
// environment alone, never from an offer — `ASTRO_PORTAL_SKY_SOLVE_ON_SERVER=1` with the binary
// (`ASTRO_PORTAL_SOLVE_FIELD`) and the indices
// (`ASTRO_PORTAL_ASTROMETRY_INDEX_DIR`) named. The catalogue's own plate
// solving above (`plateSolve`, `/api/plate-solve/…`) is unchanged.

const truthy = (value) =>
  value === "1" || String(value || "").toLowerCase() === "true";

/** `sky.solve_on_server`: whether this server solves a capture's image on demand. */
export function skySolveOnServer(env = process.env) {
  return (
    truthy(env.ASTRO_PORTAL_SKY_SOLVE_ON_SERVER) &&
    Boolean(String(env.ASTRO_PORTAL_SOLVE_FIELD || "").trim()) &&
    Boolean(String(env.ASTRO_PORTAL_ASTROMETRY_INDEX_DIR || "").trim())
  );
}

/** The server's own features, as the owner's captures carry them. */
export function serverFeatures(env = process.env) {
  return { "sky.solve_on_server": skySolveOnServer(env) };
}

const captureJobs = new Map();

/**
 * Where the on-demand resolution of one image stands: `{ state: "idle" }`,
 * `{ state: "running" }`, `{ state: "solved" }` or `{ state: "failed",
 * reason }` (`not_solved`, `unreadable_solution`, `image_changed`,
 * `not_started`), kept in memory by this process.
 */
export function captureSolveState(imageId) {
  return captureJobs.get(imageId) ?? { state: "idle" };
}

/**
 * Starts `solve-field` on the original of one image of a capture (never
 * more than one run per image), reads the WCS it writes without `wcsinfo`,
 * and hands the solution to `store(solution)` (the same rules as Astro
 * Sync's `PUT`). Answers the state at once; the caller polls
 * `captureSolveState`. Only called where `skySolveOnServer()` is true.
 */
/**
 * The original on this machine for `solve-field`: its own path on the
 * disk store, otherwise a copy read from the capture store into the
 * job's directory.
 */
async function localOriginal(image, directory) {
  if (image.path) return image.path;
  const read = await captureStore().read(image.reference);
  if (!read) throw new Error("The original is not stored.");
  const path = join(directory, "original");
  await pipeline(read.stream, createWriteStream(path));
  return path;
}

export function solveCaptureImage({ image, hints = null, store }) {
  const running = captureJobs.get(image.imageId);
  if (running?.state === "running") return running;
  const directory = join(plateSolveDir, "captures", image.imageId);
  const job = { state: "running" };
  captureJobs.set(image.imageId, job);
  const finish = (state) => captureJobs.set(image.imageId, state);
  const positional =
    Number.isFinite(hints?.raDeg) && Number.isFinite(hints?.decDeg)
      ? [
          "--ra",
          String(hints.raDeg),
          "--dec",
          String(hints.decDeg),
          "--radius",
          "5",
        ]
      : [];
  mkdir(directory, { recursive: true })
    .then(() => localOriginal(image, directory))
    .then(
      (source) =>
        new Promise((resolveRun) => {
          const child = spawn(
            solveFieldCommand,
            [
              "--overwrite",
              "--no-plots",
              "--index-dir",
              astrometryIndexDir,
              "--dir",
              directory,
              "--out",
              "solution",
              ...positional,
              "--cpulimit",
              String(solveCpuLimit),
              source,
            ],
            {
              stdio: "ignore",
              env: astronomyEnvironment(),
            },
          );
          child.on("error", () => resolveRun(null));
          child.on("close", (code) => resolveRun(code));
        }),
    )
    .then(async (code) => {
      if (code === null)
        return finish({ state: "failed", reason: "not_started" });
      const wcsPath = join(directory, "solution.wcs");
      if (code !== 0 || !(await fileExists(wcsPath)))
        return finish({ state: "failed", reason: "not_solved" });
      const fields = skySolutionFromWcsCards(
        numericFitsCards(await readFile(wcsPath)),
      );
      if (!fields)
        return finish({ state: "failed", reason: "unreadable_solution" });
      try {
        await store({
          schemaVersion: 1,
          source: "astrometry-net",
          solverVersion: null,
          ...fields,
          solvedAt: new Date().toISOString(),
        });
        finish({ state: "solved" });
      } catch (error) {
        finish({ state: "failed", reason: error?.code || "not_solved" });
      }
    })
    .catch(() => finish({ state: "failed", reason: "not_solved" }));
  return job;
}
