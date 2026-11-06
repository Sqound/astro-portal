import { createApplicationLogRepository } from "portal/persistence/application-log-repository.js";
import { databaseDriver } from "portal/persistence/database.js";

let repository;
let configurationKey;

const cleanText = (value, fallback, maximum) => {
  const text = String(value || "")
    // Control characters, and the invisible ones that change the reading
    // direction or hide text, never reach the administration's display.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .trim()
    .slice(0, maximum);
  return text || fallback;
};

function cleanContext(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === "string") return cleanText(value, "", 320);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.slice(0, 12).map((entry) => cleanContext(entry, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 120);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, entry]) => [
        cleanText(key, "field", 80),
        cleanContext(entry, depth + 1),
      ])
      .filter(([, entry]) => entry !== null),
  );
}

export async function appLogRepository() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (repository && configurationKey !== nextKey)
    throw new Error(
      "Logging database configuration cannot change during a process.",
    );
  if (repository) return repository;
  // One store per process, even when the first writes come together (the
  // startup lines and « server.ready »): the calls
  // share the one being opened.
  configurationKey = nextKey;
  repository = createApplicationLogRepository({
    databasePath,
    databaseUrl,
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  }).catch((error) => {
    repository = undefined;
    configurationKey = undefined;
    throw error;
  });
  return repository;
}

export function recordBackendLog({ level = "info", event, message, context }) {
  const entry = {
    level,
    source: "server",
    event: cleanText(event, "server.event", 120),
    message: cleanText(message, "Server event", 1200),
    context: cleanContext(context),
  };
  const output = `[Astro Portal] ${entry.level} ${entry.event}: ${entry.message}`;
  if (entry.level === "error") console.error(output);
  else if (entry.level === "warning") console.warn(output);
  else console.info(output);
  // Server logging must never delay or fail the request that it describes.
  // Deliberately detach the persistence write while retaining a diagnostic if
  // the configured backend is unavailable.
  void appLogRepository()
    .then((store) => store?.recordAppLog(entry))
    .catch((error) =>
      console.error(`[Astro Portal] unable to persist log: ${error.message}`),
    );
  return null;
}

export function normalizeClientLog(value) {
  const level = ["warning", "error"].includes(value?.level)
    ? value.level
    : "warning";
  return {
    level,
    source: "client",
    event: cleanText(value?.event, "client.event", 120),
    message: cleanText(value?.message, "Client event", 1200),
    context: cleanContext(value?.context),
  };
}
