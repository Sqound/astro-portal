// The worker thread of runStartupMaintenanceOffThread (startup.js): runs the
// startup maintenance and relays its log lines and its outcome.
import { parentPort, workerData } from "node:worker_threads";

// The main process already printed node:sqlite's experimental warning once.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const text = typeof warning === "string" ? warning : warning?.message;
  if (/SQLite is an experimental feature/.test(String(text))) return;
  return emitWarning.call(this, warning, ...rest);
};

const relay = (level) => (event, message) =>
  parentPort.postMessage({ type: "log", level, event, message });

try {
  // The composition's registrations, before anything reads the database.
  for (const specifier of workerData.migrationModules ?? [])
    await import(specifier);
  const { runStartupMaintenance } = await import("./startup.js");
  const outcome = await runStartupMaintenance({
    appVersion: workerData.appVersion,
    appBuild: workerData.appBuild,
    log: { info: relay("info"), warn: relay("warn"), error: relay("error") },
  });
  parentPort.postMessage({ type: "result", outcome });
} catch (error) {
  parentPort.postMessage({
    type: "error",
    message: error?.stack || String(error),
  });
}
