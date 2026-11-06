import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serviceDir } from "./config.server.js";

let cached = null;

/**
 * The version of the running software: the one the start of the service
 * (`server/start.js`) read from its composition's `package.json` and put in
 * `ASTRO_PORTAL_APP_VERSION`, else the `package.json` of the service
 * directory (the repository the service runs from).
 */
export function appVersion() {
  const fromStart = String(process.env.ASTRO_PORTAL_APP_VERSION || "").trim();
  if (fromStart) return fromStart;
  if (cached === null) {
    try {
      cached = String(
        JSON.parse(
          readFileSync(
            join(/* turbopackIgnore: true */ serviceDir, "package.json"),
            "utf8",
          ),
        ).version || "0.0.0",
      );
    } catch {
      cached = "0.0.0";
    }
  }
  return cached;
}
