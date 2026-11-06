import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { getHeapStatistics } from "node:v8";
import next from "next";
import { isShippedLocale, shippedLocales } from "astro-contracts/locales";
import { messages } from "portal/i18n.js";
import { v1Error } from "../lib/v1/response.js";
import {
  maintainServiceBackups,
  serviceBackupSettings,
} from "portal/persistence/backup/service.js";
import {
  consoleLog,
  runStartupMaintenanceOffThread,
} from "portal/persistence/backup/startup.js";
import { testInboxProblems } from "portal/mail/test-inbox.js";
import { acquireSqliteLease } from "portal/persistence/sqlite-lease.js";
import { captureStoreProblems } from "portal/uploads/capture-store.js";
import { ADDRESS_LANGUAGE_HEADER } from "../lib/address-language.js";
import { sourceCommitOf } from "../lib/build-identity.server.js";
import { hygCatalog } from "../lib/config.server.js";
import {
  ensureHygCatalog,
  hygDownloadEnabled,
} from "portal/sky-annotations/hyg-catalog-install.js";
import { REQUEST_WINDOW_MS, createRequestTimings } from "./request-timings.js";
import { createTaskTracker } from "./task-runs.js";
import { warmOfflinePack } from "./warm-offline-pack.js";
import { warmPlannerCatalogue } from "./warm-planner-catalogue.js";
import {
  runBackgroundWarmUp,
  runStartupWarmUp,
  warmUpBudgetMilliseconds,
  warmUpHeader,
} from "./startup-warm-up.js";

/**
 * Starts the service: the duties every composition of the core shares, in
 * this order —
 *
 * 0. listening, at once: the platform's probes are answered while the rest
 *    runs (`/healthz` 200 as soon as the process runs, `/readyz` 503 until
 *    step 5 is done, warm-up included, then 200), and any other request gets
 *    503 with `Retry-After` until then (a startup backup of a large database
 *    can outlast a platform's startup probe);
 * 1. the sign-in settings the service cannot run safely without, those of
 *    the test inbox (refused unless the deployment is a test one), those of
 *  the capture store (ASTRO_PORTAL_CAPTURE_STORE) and those of the
 *    composition (`composition.startupProblems`, its backup policy);
 * 2. the SQLite lease: one process at a time on SQLite data
 *    (`ASTRO_PORTAL_SQLITE_LEASE=off` disables it);
 * 3. the refusal of a database migrated by a newer version, a pending
 *    restore, the startup backup, then the migrations, on a worker thread
 *    (the probes keep their answers while it runs; the worker has its own
 *    globals, so the modules in which a composition registers its
 *    migrations are named by `composition.migrationModules`, absolute
 *    `file:` URLs the worker imports first);
 * 4. the composition's own work before serving (`composition.maintain`),
 *    then every hour: a backup when they have a maximum age, and that work;
 * 5. Next.js, the startup lines kept in the application log, the sweep of
 *    abandoned uploads, then the warm-up (startup-warm-up.js), before the
 *    service says it is ready: the catalogue made to describe its source (the
 *    import when the source's revision moved: minutes on 17,000 targets over a
 *    network) and loaded, then what the web planner reads of it. Each step's
 *    start, end and duration go to the application log. The first request
 *    after `/readyz` answers 200 therefore finds a warm service; the warm-up
 *    has `ASTRO_PORTAL_WARMUP_BUDGET_SECONDS` (default 45) before the service
 *    is ready anyway — always under the window in which the platform's
 *    readiness probe gives a revision up. What does not decide a request's
 *    answer runs after ready, in the background, told to the log the same
 *    way: the catalogue's media check (80 s on the production share) and the
 *    offline pack's first manifest, which waits for the import of every stored
 *    text (minutes) and which a phone asking sooner gets as the `503`
 *    `offline_pack_preparing` its transport waits out. Never in development,
 *    where the catalogue is written meanwhile;
 * 6. every request: `X-Content-Type-Options: nosniff`, the client address
 *    the admin routes trust, the private pages behind the sign-in; and, when
 *    the composition keeps them (`composition.storeRequestRollups`), its
 *    duration by route template, handed over every five minutes
 *    (request-timings.js);
 * 7. SIGTERM/SIGINT: stop accepting, let the requests in flight finish (5 s
 *    at most), release the lease, exit; a second signal exits at once.
 *
 * Every task of steps 4 and 5 that runs again later (the hourly work, the
 * trash, the pending captures) runs through a tracker (task-runs.js) that
 * hands each run to `composition.recordTaskRun` when the composition keeps
 * them; the composition's own work receives the same tracker
 * (`composition.maintain({ phase, log, track })`).
 *
 * `serviceDir` is the repository the service runs from: the default
 * directories (`.astro-portal/`, `examples/`, `public/`) are read from it,
 * whatever the working directory.
 */
export async function startPortalServer({
  appDir,
  serviceDir,
  version,
  name = "Astro Portal",
  composition = {},
  argv = process.argv,
  env = process.env,
  // The Next.js application; a test may give a stand-in.
  createNextApp = next,
}) {
  env.ASTRO_PORTAL_SERVICE_DIR ||= serviceDir;
  env.ASTRO_PORTAL_APP_VERSION ||= String(version);
  // The commit the footer shows (lib/build-identity.server.js): an image
  // gives it as ASTRO_PORTAL_BUILD_ID; a release or a checkout is read here,
  // once.
  if (!env.ASTRO_PORTAL_BUILD_ID && !env.ASTRO_PORTAL_SOURCE_COMMIT) {
    const commit = sourceCommitOf(serviceDir);
    if (commit) env.ASTRO_PORTAL_SOURCE_COMMIT = commit;
  }
  const development = argv.includes("--dev");
  const valueAfter = (shortName, longName) => {
    const index = argv.findIndex(
      (argument) => argument === shortName || argument === longName,
    );
    return index >= 0 ? argv[index + 1] : null;
  };
  const port = Number(valueAfter("-p", "--port") || env.PORT || 8787);
  const hostname = valueAfter("-H", "--hostname") || env.HOST || "0.0.0.0";

  // Listening before anything else (step 0): until the service is `ready`,
  // the server answers the probes and refuses the rest with 503 — but for its
  // own warm-up requests (step 5), which carry the header and the secret
  // below and reach the application once `serveRequest` is set.
  let serveRequest = null;
  let ready = false;
  let stopping = false;
  const warmUpSecret = randomUUID();
  const httpServer = createServer((request, response) => {
    // The platform's probes: answered before anything else, with no routing,
    // no sign-in and no database (see answerHealthProbe, answerReadinessProbe).
    if (answerHealthProbe(request, response)) return;
    if (answerReadinessProbe(request, response, ready && !stopping)) return;
    if (
      !serveRequest ||
      (!ready && request.headers[warmUpHeader] !== warmUpSecret)
    ) {
      refuseUntilReady(response);
      return;
    }
    void serveRequest(request, response);
  });
  httpServer.listen(port, hostname, () => {
    console.log(
      `${name}: listening on port ${httpServer.address()?.port ?? port} (probes answered; ready once started)`,
    );
  });

  // Loaded once the service directory is known: the default directories of
  // the application are resolved as its modules load.
  const [
    {
      authEnabled,
      authService,
      signInAnnouncement,
      signInPath,
      signInStartupNotices,
      signInStartupProblems,
    },
    { appLogRepository, recordBackendLog },
    { purgeExpiredUploadsAtStartup },
    { purgeExpiredAppLogs },
  ] = await Promise.all([
    import("../lib/auth.server.js"),
    import("../lib/app-log.server.js"),
    import("../lib/upload-maintenance.server.js"),
    import("../lib/mobile-app-logs.server.js"),
  ]);

  const demoReadOnly = env.ASTRO_PORTAL_DEMO === "1";
  const appVersion = String(version);
  const appBuild = env.ASTRO_PORTAL_BUILD_ID || null;
  const refuse = (message) => {
    console.error(`[Astro Portal] The service does not start: ${message}`);
    process.exit(1);
  };

  // A sign-in mode is accepted only with the settings it cannot run safely
  // without, named before anything else is read: a mode that is not one
  // (`totp` is gone, and the message says which modes to choose), a private
  // server's key, its public address and the sender of its codes
  // (docs/PRIVATE_NOTEBOOK_AUTH.md), a composition's own.
  try {
    const problems = [
      ...signInStartupProblems(),
      ...captureStoreProblems(env),
      // The test inbox, whatever the sign-in mode: refused on a deployment
      // that is not affirmatively a test one (mail/test-inbox.js).
      ...testInboxProblems(env),
      ...(composition.startupProblems?.(env) || []),
    ];
    if (problems.length)
      throw new Error(`${[...new Set(problems)].join("; ")}.`);
    signInAnnouncement();
  } catch (error) {
    refuse(error.message);
  }

  // A composition may bound the age of its backups.
  if (composition.backupPolicy) {
    const policy = composition.backupPolicy(env);
    if (policy.problem) refuse(policy.problem);
    Object.assign(env, policy.env);
  }

  // The startup lines go to the console now, and into the application log
  // (Administration → Logs) once the database is migrated.
  const startupEvents = [];
  const startupLog = Object.fromEntries(
    Object.entries(consoleLog).map(([level, write]) => [
      level,
      (event, message) => {
        write(event, message);
        startupEvents.push({
          level: level === "warn" ? "warning" : level,
          event,
          message,
        });
      },
    ]),
  );
  // Each run of a task, measured and handed to the composition when it
  // keeps them (task-runs.js); never the reason a task fails.
  const track = createTaskTracker({
    record: composition.recordTaskRun
      ? (run) => composition.recordTaskRun(run)
      : null,
    log: consoleLog,
  });

  // A composition's notices, then how a private server's codes leave (the host
  // and port of a mail server, never its address, which holds the password).
  for (const notice of [
    ...(composition.startupNotices?.() || []),
    ...signInStartupNotices(),
  ])
    startupLog[notice.level](notice.event, notice.message);

  // Stopping (SIGTERM from the platform or launchd, Ctrl+C): stop accepting
  // connections, let the requests in flight finish (5 s at most; none
  // awaited in development), release the SQLite lease, exit. Node runs as
  // PID 1 in a container, where a signal without a handler is ignored. A
  // second signal exits at once.
  let lease = null;
  let inFlight = 0;
  const drainMs = development ? 0 : 5_000;
  const stopController = new AbortController();
  function exitNow(code) {
    if (lease?.release())
      console.info(
        `[Astro Portal] info lease.release: SQLite lease released (generation ${lease.generation}).`,
      );
    process.exit(code);
  }
  function stopService(signal) {
    // Not ready yet (a lease awaited, the startup maintenance, Next.js, the
    // warm-up): no request but the warm-up's own is in flight, nothing to
    // drain.
    if (stopping || !ready) {
      stopController.abort();
      return exitNow(0);
    }
    stopping = true;
    console.info(
      `[Astro Portal] info server.stop: ${signal} received; ${inFlight} request(s) in flight.`,
    );
    httpServer.close();
    httpServer.closeIdleConnections();
    if (inFlight === 0 || drainMs === 0) return exitNow(0);
    setTimeout(() => exitNow(0), drainMs).unref();
  }
  process.on("SIGTERM", () => stopService("SIGTERM"));
  process.on("SIGINT", () => stopService("SIGINT"));
  // Any other way out (a refusal below, a crash, process.exit from a
  // library) still releases the lease; a lost lease is left to its holder.
  process.on("exit", () => lease?.release());

  // One process at a time on SQLite data, before anything opens the
  // database (portal/persistence/sqlite-lease.js). A live holder is waited
  // for, then the service does not start; losing the lease later stops the
  // process at once.
  const leased = await acquireSqliteLease({
    appVersion,
    appBuild,
    log: startupLog,
    signal: stopController.signal,
  });
  if (!leased.ok) {
    if (leased.status === "aborted") process.exit(0);
    refuse(leased.message);
  }
  lease = leased.lease;

  // Before anything else touches the database (Next.js, the repositories
  // and their migrations): the refusal of a database migrated by a newer
  // version, a pending restore request, the startup backup, then the
  // migrations (portal/persistence/backup/startup.js). When the backup
  // fails with migrations pending, the service stops here: the revision
  // never becomes healthy and the database stays as it was.
  let startup;
  try {
    startup = await runStartupMaintenanceOffThread({
      env,
      appVersion,
      appBuild,
      log: startupLog,
      migrationModules: composition.migrationModules ?? [],
    });
  } catch (error) {
    refuse(`the startup maintenance could not run (${error.message}).`);
  }
  if (!startup.ok) refuse(startup.message);
  startupLog.info(
    "startup.maintenance",
    `Startup maintenance done in ${startup.durationMs} ms${startup.backup ? ` (backup ${startup.backup.durationMs} ms, ${(startup.backup.artifactBytes / 1048576).toFixed(1)} MB)` : ""}.`,
  );

  // A composition's own work before serving.
  if (composition.maintain) {
    try {
      await composition.maintain({
        phase: "startup",
        log: startupLog,
        track: (name, run, options = {}) =>
          track(name, run, { phase: "startup", ...options }),
      });
    } catch (error) {
      refuse(
        `${composition.maintenanceName || "the maintenance"} could not run (${error.message}).`,
      );
    }
  }

  // Every hour while the service runs: a fresh backup and the removal of
  // the old ones when backups have a maximum age, and the composition's
  // work.
  async function periodicMaintenance() {
    await track("backups", async () => {
      try {
        const backups = await maintainServiceBackups({
          settings: serviceBackupSettings(env),
          appVersion,
          appBuild,
        });
        if (backups.backup || backups.removed.length)
          consoleLog.info(
            "backup.scheduled",
            `${backups.backup ? `Backup ${backups.backup.id} taken (${backups.backup.reason}); ` : ""}${backups.removed.length} old backup(s) removed.`,
          );
        return (backups.backup ? 1 : 0) + backups.removed.length;
      } catch (error) {
        consoleLog.warn(
          "backup.scheduled",
          `The periodic backup work did not run (${error.message}).`,
        );
        throw error;
      }
    });
    // The application's logs past their 30 days, whatever their source.
    await track("app-logs.purge", () =>
      purgeExpiredAppLogs({ log: consoleLog, rethrow: true }),
    );
    if (composition.maintain) {
      try {
        await composition.maintain({
          phase: "periodic",
          log: consoleLog,
          track,
        });
      } catch (error) {
        consoleLog.error(
          composition.maintenanceEvent || "maintenance",
          `${composition.maintenanceName || "The maintenance"} did not run (${error.message}).`,
        );
      }
    }
  }
  const pendingCaptures = () =>
    track("captures.pending", pickUpPendingCaptures);
  // The sessions deleted more than 30 days ago are erased with their
  // captures; the plans and multi-night plans likewise.
  const deletedSessions = () => track("sessions.purge", purgeDeletedSessions);
  const deletedPlans = () => track("plans.purge", purgeDeletedPlans);
  // The files of deleted captures that the store did not delete at once:
  // tried again, a longer time after each failure.
  const captureFileDeletions = () =>
    track("captures.files.replay", replayCaptureFileDeletions);
  setInterval(periodicMaintenance, 60 * 60_000).unref();
  // Each now (below, once Next.js is prepared), then every hour.
  setInterval(pendingCaptures, 60 * 60_000).unref();
  setInterval(deletedSessions, 60 * 60_000).unref();
  setInterval(deletedPlans, 60 * 60_000).unref();
  setInterval(captureFileDeletions, 60 * 60_000).unref();

  // The duration of each request by route, when the composition keeps it:
  // handed over every five minutes; a window that cannot be kept is dropped
  // (it is a measure, not a record).
  const requestTimings = composition.storeRequestRollups
    ? createRequestTimings()
    : null;
  if (requestTimings)
    setInterval(async () => {
      const rows = requestTimings.drain();
      if (!rows.length) return;
      try {
        await composition.storeRequestRollups(rows);
      } catch (error) {
        consoleLog.warn(
          "requests.timings",
          `The request timings of the last five minutes were not kept (${error.message}).`,
        );
      }
    }, REQUEST_WINDOW_MS).unref();

  const app = createNextApp({
    dev: development,
    dir: appDir,
    hostname,
    port,
  });
  const handle = app.getRequestHandler();

  await app.prepare();
  // The startup lines were printed already; keep them in the application
  // log too (Administration → Logs) now that the database is migrated.
  void appLogRepository()
    .then(async (store) => {
      for (const entry of startupEvents)
        await store?.recordAppLog({
          ...entry,
          source: "server",
          context: null,
        });
    })
    .catch((error) =>
      console.error(
        `[Astro Portal] unable to persist the startup log: ${error.message}`,
      ),
    );
  // The captures left without a thumbnail and an automatic check (a
  // process stopped before it finished, a crash): queued now, then every hour.
  void pendingCaptures();
  void deletedSessions();
  void deletedPlans();
  void captureFileDeletions();
  // The target catalogue, written to the database before the first request
  // that checks a target against it: a new database holds none. In
  // development now, meanwhile; otherwise the warm-up below does it, before
  // the service is ready.
  if (development) void fillTargetCatalogue();
  // Abandoned resumable uploads are swept once now, then along the upload
  // requests (lib/upload-maintenance.server.js): no timer.
  void purgeExpiredUploadsAtStartup().then((count) => {
    if (count > 0)
      recordBackendLog({
        event: "uploads.purged",
        message: `${count} abandoned upload(s) purged at startup.`,
      });
  });

  // The application can answer from now on, but only the warm-up's own
  // requests reach it until the service is ready (the gate of the server
  // above); then every request does, and `/readyz` answers 200.
  serveRequest = async (request, response) => {
    inFlight += 1;
    const measured = requestTimings
      ? { method: request.method, url: request.url, from: performance.now() }
      : null;
    response.once("close", () => {
      inFlight -= 1;
      // A request the client gave up before its answer ended counts as 499.
      if (measured)
        requestTimings.record({
          method: measured.method,
          url: measured.url,
          status: response.writableFinished ? response.statusCode : 499,
          durationMs: performance.now() - measured.from,
        });
      if (stopping && inFlight === 0) exitNow(0);
    });
    // The warm-up's secret never reaches the application.
    delete request.headers[warmUpHeader];
    // Always overwrite this internal header. Admin routes use it instead of
    // a caller-controlled X-Forwarded-For value.
    request.headers["x-astro-client-ip"] = request.socket.remoteAddress || "";
    // The language the address names, handed to the root layout, which
    // cannot read the address itself: overwritten (or removed) on every
    // request, so a caller cannot choose the language of the page.
    const addressLanguage = pageLanguageOf(
      String(request.url || "/").split(/[?#]/)[0],
    );
    if (addressLanguage)
      request.headers[ADDRESS_LANGUAGE_HEADER] = addressLanguage;
    else delete request.headers[ADDRESS_LANGUAGE_HEADER];
    // No answer of this server, a file served from `public/` or `.next/`
    // included, is ever reinterpreted by a browser as another type than the
    // one it declares. The routes that serve a
    // person's file add their own sandboxing content policy.
    response.setHeader("X-Content-Type-Options", "nosniff");
    const demoRefusal = demoWriteResponse(request, demoReadOnly);
    if (demoRefusal) {
      response.writeHead(
        demoRefusal.status,
        Object.fromEntries(demoRefusal.headers),
      );
      response.end(await demoRefusal.text());
      return;
    }
    if (authEnabled()) {
      const url = new URL(
        request.url || "/",
        `http://${request.headers.host || "localhost"}`,
      );
      if (protectedApplicationPath(url.pathname)) {
        try {
          const session = await authService().session(request.headers);
          if (!session) {
            refuseSignedOut(request, response, url, signInPath());
            return;
          }
        } catch (error) {
          response.writeHead(503, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          response.end(
            JSON.stringify({
              error: `Authentication configuration unavailable: ${error.message}`,
            }),
          );
          return;
        }
      }
    }
    // The sign-in page reached with `?next=/fr/…` and no saved language
    // speaks the language of `next`, in the page and in the header around
    // it alike.
    const hintedLanguage = authPageLanguageHint(request);
    if (hintedLanguage) {
      request.headers.cookie = [
        String(request.headers.cookie || ""),
        `astro-portal-locale=${hintedLanguage}`,
      ]
        .filter(Boolean)
        .join("; ");
      response.setHeader(
        "set-cookie",
        `astro-portal-locale=${hintedLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`,
      );
    }
    try {
      await handle(request, response);
    } catch (error) {
      recordBackendLog({
        level: "error",
        event: "server.request_failed",
        message: error.message || "Unhandled request failure",
        context: {
          method: request.method,
          path: new URL(
            request.url || "/",
            `http://${request.headers.host || "localhost"}`,
          ).pathname,
        },
      });
      if (!response.headersSent) {
        response.writeHead(500, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ error: "Internal server error." }));
      }
    }
  };
  watchHeap(consoleLog);
  console.log(`${name}: http://localhost:${port}`);
  console.log(`Mode: ${development ? "development" : "production"}`);

  // The warm-up, before the service is ready (step 5): the probes keep their
  // answers meanwhile (`/healthz` 200, `/readyz` 503), the other requests are
  // refused with 503, and the work goes through slices that hand the event
  // loop back, so the answers stay prompt. Never in development.
  let startBackgroundWarmUp = () => {};
  if (!development) {
    const origin = `http://127.0.0.1:${httpServer.address()?.port ?? port}`;
    const headers = { [warmUpHeader]: warmUpSecret };
    const log = ({ level = "info", event, message, context }) =>
      recordBackendLog({ level, event, message, context });
    // What runs after ready (`runBackgroundWarmUp`): the catalogue's media
    // check, which the catalogue step hands over, and the steps below.
    const mediaCheck = Promise.withResolvers();
    mediaCheck.promise.catch(() => {});
    const backgroundSteps = [
      {
        name: "media",
        run: async () => (await mediaCheck.promise) || "nothing to check",
      },
    ];
    const steps = [
      // The catalogue written to its database when its source moved (the
      // resynchronization) and loaded: here, in the server's own copy of the
      // module, which shares the database, not the routes' memory — the
      // routes then find it done. Its media check is over later, in the
      // background.
      {
        name: "catalogue",
        run: async () => {
          let outcome;
          try {
            outcome = await (
              await import(targetLibraryModule)
            ).warmTargetCatalogue({
              log: (event, message, context) =>
                log({ event, message, context }),
            });
          } catch (error) {
            mediaCheck.reject(error);
            throw error;
          }
          if (!outcome) {
            mediaCheck.resolve("no database");
            return "no database";
          }
          mediaCheck.resolve(
            outcome.mediaChecked.then(
              ({ durationMs }) =>
                `${durationMs} ms since the catalogue was loaded`,
            ),
          );
          return outcome.resynchronized ? "resynchronized" : "already in sync";
        },
      },
    ];
    // What the web planner reads of the catalogue: the first person on a
    // fresh browser does not wait for the service to load it. Never when
    // switched off.
    if (env.ASTRO_PORTAL_PLANNER_WARMUP !== "off")
      steps.push({
        name: "planner-reads",
        run: async () => {
          const { answered, failed } = await warmPlannerCatalogue({
            origin,
            headers,
            locales: ["en"],
            log: (event, message) =>
              log({
                level: event.endsWith("unreachable") ? "warning" : "info",
                event,
                message,
              }),
          });
          return `${answered} answered, ${failed} failed`;
        },
      });
    // The offline-pack manifest is asked for, so that the first phone to ask
    // after a restart does not meet a service computing it. After ready, in
    // the background: its first computation waits for the import of every
    // stored text (a few hundred megabytes) and takes minutes on the
    // production data, more than any readiness probe waits. A phone asking
    // sooner is told `503 offline_pack_preparing` with `Retry-After` (a wait
    // its transport knows), or served the last manifest kept; never a pack
    // computed from texts half imported. Never when switched off.
    if (env.ASTRO_PORTAL_OFFLINE_PACK_WARMUP !== "off")
      backgroundSteps.push({
        name: "offline-pack",
        run: async () => {
          const outcome = await warmOfflinePack({
            origin,
            headers,
            log: (event, message) =>
              log({
                level: event.endsWith("unreachable") ? "warning" : "info",
                event,
                message,
              }),
          });
          return outcome.status
            ? `answered ${outcome.status}`
            : "could not be reached";
        },
      });
    // The star catalogue of the sky annotations (HYG v4.1, CC BY-SA 4.0), put
    // where the annotations read it when it is missing: fetched from the
    // catalogue's author, checked against its SHA-256, in the background (34
    // MB). The annotations say « no stars » until it is there. Never when
    // switched off (`ASTRO_PORTAL_HYG_DOWNLOAD=off`) or when a file is there.
    backgroundSteps.push({
      name: "hyg-catalogue",
      run: async () => {
        const outcome = await ensureHygCatalog({
          path: hygCatalog,
          enabled: hygDownloadEnabled(env),
        });
        if (outcome.status === "failed")
          throw new Error(
            `the star catalogue could not be installed at ${hygCatalog} (${outcome.reason}); the sky annotations hold no stars until it is (docs/INSTALLATION.md)`,
          );
        if (outcome.status === "disabled")
          return "missing, download switched off: the sky annotations hold no stars";
        return outcome.status === "installed"
          ? `installed, ${outcome.bytes} bytes`
          : "already there";
      },
    });
    const budgetSeconds = Number(env.ASTRO_PORTAL_WARMUP_BUDGET_SECONDS);
    await runStartupWarmUp({
      steps,
      log,
      budgetMs:
        Number.isFinite(budgetSeconds) && budgetSeconds > 0
          ? budgetSeconds * 1000
          : warmUpBudgetMilliseconds,
    });
    startBackgroundWarmUp = () =>
      void runBackgroundWarmUp({ steps: backgroundSteps, log }).catch(() => {});
  }
  ready = true;
  recordBackendLog({
    event: "server.ready",
    message: `Server ready on ${hostname}:${port}`,
    context: { development },
  });
  startupLog.info(
    "server.ready",
    "Ready: /readyz answers 200 and requests reach the application.",
  );
  startBackgroundWarmUp();
  return httpServer;
}

/** Share of the heap limit above which the service says so (see watchHeap). */
export const heapWarningRatio = 0.8;

/**
 * What the next line of the heap's watch should say: `null` while the heap is
 * well under its limit, `"high"` once, when it passes [heapWarningRatio], and
 * `"recovered"` once it is back under three quarters of that. [warned] is
 * whether `"high"` was already said.
 */
export function heapPressure({ heapUsed, heapLimit, warned }) {
  const ratio = heapUsed / heapLimit;
  if (!warned && ratio > heapWarningRatio) return "high";
  if (warned && ratio < heapWarningRatio * 0.75) return "recovered";
  return null;
}

/**
 * When a process runs out of heap the only trace is V8's own last words. The
 * service says its heap limit once at start, and a warning when it passes
 * 80 % of it (and when it comes back): the console then shows what the heap
 * was doing before it died.
 * Never throws, never keeps the process alive.
 */
function watchHeap(log, intervalMs = 15_000) {
  const megabytes = (bytes) => Math.round(bytes / 1048576);
  const heapLimit = getHeapStatistics().heap_size_limit;
  log.info(
    "memory.heap",
    `The JavaScript heap may use ${megabytes(heapLimit)} MB.`,
  );
  let warned = false;
  setInterval(() => {
    try {
      const { heapUsed, rss } = process.memoryUsage();
      const said = heapPressure({ heapUsed, heapLimit, warned });
      if (said === "high") {
        warned = true;
        log.warn(
          "memory.heap",
          `${megabytes(heapUsed)} MB of the ${megabytes(heapLimit)} MB heap in use (${megabytes(rss)} MB resident).`,
        );
      } else if (said === "recovered") {
        warned = false;
        log.info(
          "memory.heap",
          `${megabytes(heapUsed)} MB of the heap in use.`,
        );
      }
    } catch {
      /* the watch is a courtesy */
    }
  }, intervalMs).unref();
}

/** The path the hosting platform's startup and liveness probes ask for. */
export const healthProbePath = "/healthz";

/** The path the hosting platform's readiness probe asks for. */
export const readinessProbePath = "/readyz";

/** Seconds a request refused before the service is ready is told to wait. */
export const startingRetryAfterSeconds = 5;

const probePathOf = (request, path) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = request.url || "";
  return url === path || url.startsWith(`${path}?`);
};

/**
 * The readiness probe's answer: `200 ready` once the service has done its
 * startup (the lease, the startup maintenance — restore, backup, migrations —
 * Next.js, and the warm-up: the catalogue resynchronized and loaded, the
 * routes' first answers computed), `503 starting` with `Retry-After` before,
 * and again once it is stopping. A platform sends traffic to an instance only while this
 * answers 200. Like `/healthz`, it touches nothing. Returns whether it
 * answered.
 */
export function answerReadinessProbe(request, response, ready) {
  if (!probePathOf(request, readinessProbePath)) return false;
  response.writeHead(ready ? 200 : 503, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...(ready ? {} : { "retry-after": String(startingRetryAfterSeconds) }),
  });
  response.end(
    request.method === "HEAD" ? undefined : ready ? "ready\n" : "starting\n",
  );
  return true;
}

/**
 * Any request but a probe before the service is ready: `503` with
 * `Retry-After` and the v1 error envelope (`service_starting`), never the
 * application. Only the probes reach the server before readiness.
 */
export function refuseUntilReady(response) {
  response.writeHead(503, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "retry-after": String(startingRetryAfterSeconds),
  });
  response.end(
    JSON.stringify({
      error: {
        code: "service_starting",
        message: "The service is starting; try again in a few seconds.",
      },
    }),
  );
}

/**
 * The light answer to the platform's startup and liveness probes: `200 ok` as
 * soon as the process runs, nothing else — the process is alive. Whether it
 * serves is `/readyz`'s answer (answerReadinessProbe). A probe that went
 * through the application (Next.js, the composition, the sign-in
 * announcement) could miss a platform's one-second allowance on a busy
 * process. This one costs a few bytes and touches nothing. It does not prove
 * the application's routes work: `/api/v1/service` does. Returns whether it
 * answered.
 */
export function answerHealthProbe(request, response) {
  if (!probePathOf(request, healthProbePath)) return false;
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : "ok\n");
  return true;
}

// The processing of the captures reaches `sharp`, which the image keeps
// for `/_next/image` and the routes, but which the import graph of
// `server.mjs` must not load (it runs outside the Next.js build). Its module
// is therefore named
// at run time, not written in an import.
const captureProcessingModule = new URL(
  "../lib/capture-processing.server.js",
  import.meta.url,
).href;

/**
 * Queues the captures left without a result: how many. Logs a failure and
 * throws it again, for the task tracker.
 */
async function pickUpPendingCaptures() {
  try {
    const processing = await import(captureProcessingModule);
    const queued = await processing.pickUpPendingCaptures();
    if (queued)
      consoleLog.info(
        "captures.pending",
        `${queued} capture(s) queued for their thumbnail and automatic check.`,
      );
    return queued;
  } catch (error) {
    consoleLog.warn(
      "captures.pending",
      `The captures without a check were not queued (${error.message}).`,
    );
    throw error;
  }
}

const sessionTrashModule = new URL(
  "../lib/v1/session-trash-service.js",
  import.meta.url,
).href;

/**
 * The erasure of the deleted sessions past their 30 days. The service
 * reaches the owner's captures service, hence `sharp`, which the import
 * graph of `server.mjs` must not load: the module is named at run time, as
 * the captures' processing is.
 */
async function purgeDeletedSessions() {
  try {
    const trash = await import(sessionTrashModule);
    return await trash.purgeDeletedSessions({ log: consoleLog });
  } catch (error) {
    consoleLog.warn(
      "sessions.purged",
      `The deleted sessions were not erased (${error.message}).`,
    );
    throw error;
  }
}

const planTrashModule = new URL(
  "../lib/v1/plan-trash-service.js",
  import.meta.url,
).href;

/**
 * The erasure of the deleted plans past their 30 days. Named at run time,
 * as the sessions' erasure is: the service reaches the plan service and
 * its rights, which the import graph of `server.mjs` does not load.
 */
async function purgeDeletedPlans() {
  try {
    const trash = await import(planTrashModule);
    return await trash.purgeDeletedPlans({ log: consoleLog });
  } catch (error) {
    consoleLog.warn(
      "plans.purged",
      `The deleted plans were not erased (${error.message}).`,
    );
    throw error;
  }
}

const ownerCaptureServiceModule = new URL(
  "../lib/v1/owner-capture-service.js",
  import.meta.url,
).href;

/**
 * The pending deletions of the files of deleted captures. The service
 * reaches `sharp` like the sessions' erasure does: its module is named at
 * run time.
 */
async function replayCaptureFileDeletions() {
  try {
    const owner = await import(ownerCaptureServiceModule);
    return await owner.replayCaptureFileDeletions({ log: consoleLog });
  } catch (error) {
    consoleLog.warn(
      "captures.files.replayed",
      `The pending deletions of files were not tried (${error.message}).`,
    );
    throw error;
  }
}

const targetLibraryModule = new URL(
  "../lib/target-library.server.js",
  import.meta.url,
).href;

/**
 * On a new database `target_catalogue_entries` is empty until the
 * catalogue is first read, and a night's target was refused `422
 * target_not_found` meanwhile. Filled now, in slices that hand the event
 * loop back (the health probe is not kept waiting); logs, never throws, and
 * the routes that check a target ask for it again.
 */
async function fillTargetCatalogue() {
  try {
    await (await import(targetLibraryModule)).ensureTargetCatalogue();
  } catch (error) {
    consoleLog.warn(
      "catalogue.fill",
      `The target catalogue was not written to the database (${error.message}).`,
    );
  }
}

// The languages of the pages, read from the locale registry: the guard
// knows every shipped language, never a list of its own.
const escapedLocales = () =>
  shippedLocales()
    .map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
const localizedPage = (section) =>
  new RegExp(`^/(?:${escapedLocales()})/${section}(?:/|$)`);

/** The language a page's address names, or `undefined`. */
export const pageLanguageOf = (pathname) =>
  new RegExp(`^/(${escapedLocales()})(?:/|$)`).exec(pathname)?.[1];

// The gallery and the planner chooser remain public. Authentication protects
// private plan data, the person's space (« Mon espace », `/manage`, and the
// account page) and editor administration, not the guest planner UI. A
// private gallery (`/p/…`) is gated by its own page.
export const protectedApplicationPath = (pathname) =>
  pathname === "/admin" ||
  pathname.startsWith("/admin/") ||
  localizedPage("admin").test(pathname) ||
  localizedPage("account").test(pathname) ||
  localizedPage("manage").test(pathname) ||
  pathname === "/api/plans" ||
  pathname === "/api/admin/catalog" ||
  pathname === "/api/admin/target-library" ||
  pathname === "/api/admin/static-data" ||
  pathname === "/api/admin/logs" ||
  pathname === "/api/admin/backups";

/**
 * The language of a sign-in page (`/auth/…`) reached with a `next` that names
 * one (`/auth/sign-in?next=%2Ffr%2Fplanner`) when the visitor has saved none:
 * the link « Se connecter » of a French page used to open the page in English
 * unless the language had been picked from the menu. `undefined` for any
 * other request.
 *
 * Decided: a saved choice wins over the address. The sign-in page names no
 * language in its address, so the selector of that very page can only be heard
 * through the saved choice; if the address won, a person who picked English on
 * a sign-in reached from `/fr/…` would be sent back to French by the reload.
 */
export function authPageLanguageHint(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );
  if (!url.pathname.startsWith("/auth/")) return undefined;
  if (
    /(?:^|;\s*)astro-portal-locale=/.test(String(request.headers.cookie || ""))
  )
    return undefined;
  const next = url.searchParams.get("next");
  return typeof next === "string"
    ? pageLanguageOf(next.split(/[?#]/)[0])
    : undefined;
}

function refuseSignedOut(request, response, url, signInPath) {
  if (url.pathname.startsWith("/api/")) {
    response.writeHead(401, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ error: "Authentication required." }));
    return;
  }
  // The sign-in page names no language in its address: a visitor sent there
  // from a `/fr/…` page without a saved choice gets that page's language.
  const pageLanguage = pageLanguageOf(url.pathname);
  const savedLanguage = /(?:^|;\s*)astro-portal-locale=/.test(
    String(request.headers.cookie || ""),
  );
  response.writeHead(302, {
    location: `${signInPath}?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
    "cache-control": "no-store",
    ...(pageLanguage && !savedLanguage
      ? {
          "set-cookie": `astro-portal-locale=${pageLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`,
        }
      : {}),
  });
  response.end();
}

/** The shared server calls this before authentication or Next.js routing. */
export function demoWriteResponse(request, enabled) {
  if (!enabled || ["GET", "HEAD", "OPTIONS"].includes(request.method))
    return null;
  const url = new URL(request.url || "/", "http://localhost");
  const pageLocale = url.pathname.split("/")[1];
  const savedLocale = /(?:^|;\s*)astro-portal-locale=([^;]*)/.exec(
    String(request.headers.cookie || ""),
  )?.[1];
  const requestedLocale = url.searchParams.get("locale");
  const locale =
    [pageLocale, requestedLocale, savedLocale].find((value) =>
      isShippedLocale(value),
    ) || "en";
  return v1Error(null, {
    status: 403,
    code: "demo_read_only",
    message: messages[locale].demoReadOnly,
  });
}
