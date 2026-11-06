// A real start of the service (server/start.js: lease, startup maintenance on
// its worker thread, the catalogue's warm-up, the readiness gate) with a
// stand-in for Next.js, run as a child process by
// tests/start-ready-after-warm-up.test.mjs. The stand-in answers
// `200 application` (the offline pack's route answers `503 offline_pack_preparing`
// for WARM_UP_PACK_PREPARING_MS after the start); the first read of the planner's targets takes
// WARM_UP_SLOW_FIRST_READ_MS (a catalogue being loaded), the later ones are
// instant. Every request it receives is written to the output, with whether
// the warm-up's header reached it (it must never).
import { fileURLToPath } from "node:url";
import { startPortalServer } from "../../dist/server/start.js";
import { warmUpHeader } from "../../dist/server/startup-warm-up.js";

const root = fileURLToPath(new URL("../../../..", import.meta.url));
const slowFirstReadMs = Number(process.env.WARM_UP_SLOW_FIRST_READ_MS || 0);
const packPreparingMs = Number(process.env.WARM_UP_PACK_PREPARING_MS || 0);
const startedAt = Date.now();
let plannerReads = 0;
const pause = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

await startPortalServer({
  appDir: root,
  serviceDir: root,
  version: "0.0.0-warm-up-test",
  name: "Warm-up test",
  argv: [
    process.argv[0],
    "start-server-fixture.mjs",
    "-H",
    "127.0.0.1",
    "-p",
    "0",
  ],
  createNextApp: () => ({
    getRequestHandler: () => async (request, response) => {
      const path = String(request.url).split("?")[0];
      console.log(
        `REQUEST ${path} warm-up-header=${request.headers[warmUpHeader] ? "present" : "absent"}`,
      );
      if (path === "/api/planner-targets" && (plannerReads += 1) === 1)
        await pause(slowFirstReadMs);
      // A pack still being computed: `503` + `Retry-After`, as the route does.
      if (
        path === "/api/v1/offline-pack" &&
        Date.now() - startedAt < packPreparingMs
      ) {
        response.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "2",
        });
        response.end(JSON.stringify({ code: "offline_pack_preparing" }));
        return;
      }
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("application\n");
    },
    prepare: async () => {},
  }),
});
