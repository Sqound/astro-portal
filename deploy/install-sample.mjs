#!/usr/bin/env node
// Run by Compose inside the portal, which already has its database settings.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_MANIFEST_URL } from "../scripts/sample-data/lib/constants.mjs";

export async function installSample({
  recordsPresent = existsSync(
    new URL("../sample/manifest.json", import.meta.url),
  ),
  fetchManifest = fetch,
  run = spawnSync,
  log = console.log,
} = {}) {
  const unpublished = () => {
    log(
      "Sample records or image pack are not published yet; run the sample command below after publication.",
    );
    return 0;
  };
  if (!recordsPresent) return unpublished();
  const response = await fetchManifest(DEFAULT_MANIFEST_URL, {
    signal: AbortSignal.timeout(30_000),
  });
  await response.body?.cancel();
  if (response.status === 404 || response.status === 410) return unpublished();
  if (!response.ok)
    throw new Error(
      `Sample manifest request failed (HTTP ${response.status}).`,
    );
  const result = run(
    process.execPath,
    [
      "scripts/sample-data/install.mjs",
      "--yes",
      "--database",
      process.env.ASTRO_PORTAL_DATABASE_URL,
      "--images-dir",
      process.env.ASTRO_PORTAL_IMAGES_DIR || "/data/images",
      "--captures-dir",
      process.env.ASTRO_PORTAL_CAPTURES_DIR || "/data/runtime/captures",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  installSample()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
