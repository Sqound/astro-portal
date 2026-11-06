import { fileURLToPath } from "node:url";
import packageInfo from "./package.json" with { type: "json" };

// Astro Portal, for one person on their own server (docs/SELF_HOSTING.md).
// The start of the service is `portal-app/server/start.js`: the sign-in
// settings, the SQLite lease, the refusal of a newer database, the startup
// backup and the migrations, the hourly backup, the private pages behind the
// sign-in, a clean stop on SIGTERM. The directories of the service are those
// of the repository (two levels up), whatever the working directory.
const appDir = fileURLToPath(new URL(".", import.meta.url));
const serviceDir = fileURLToPath(new URL("../../", import.meta.url));
process.env.ASTRO_PORTAL_SERVICE_DIR ||= serviceDir;

const { startPortalServer } = await import("portal-app/server/start.js");

await startPortalServer({
  appDir,
  serviceDir,
  version: packageInfo.version,
  name: "Astro Portal",
});
