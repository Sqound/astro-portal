import { createServer } from "node:http";

/**
 * A local, in-process stand-in for the CDS HiPS server the sky-tile mirror
 * fetches from (`packages/portal/src/sky-tiles/mirror.js`). No test in this
 * repository is allowed to contact the real CDS, so every mirror test that
 * needs an upstream to fetch from starts one of these instead — a real
 * `node:http` server bound to `127.0.0.1`, which lets the tests exercise the
 * mirror's actual `fetch()` path (retries, timeouts, concurrency) rather
 * than a mocked function.
 *
 * Tile bytes are deterministic and depend only on the request path, so two
 * requests for the same tile always get bit-identical bytes — which is what
 * an "archive built from already-cached tiles" or a "second request costs
 * zero upstream calls" assertion needs to check against.
 */

/**
 * A URL nothing is listening on: binding to port 0 and closing immediately
 * hands back a port number that was free a moment ago, so a connection
 * attempt to it fails fast with `ECONNREFUSED` — "the socket does not
 * accept", distinct from a host
 * that accepts the connection and then never answers
 * (`createFakeHipsUpstream`'s own `latencyMs`, far larger than the mirror's
 * connect timeout, simulates that instead: the TCP handshake completes but
 * no response ever arrives within the window — which is exactly what a
 * `fetch()` call sees either way, so `packages/portal/src/sky-tiles/mirror.js`'s
 * connect-timeout classification does not need to tell the two apart).
 */
export async function unreachableUpstreamUrl() {
  const probe = createServer();
  const port = await new Promise((resolvePromise) => {
    probe.listen(0, "127.0.0.1", () => resolvePromise(probe.address().port));
  });
  await new Promise((resolveClose) => probe.close(resolveClose));
  return `http://127.0.0.1:${port}/`;
}

/**
 * @param {number} [port] Binds this exact port instead of an OS-assigned
 * one — the one way a test simulates a host that *recovers*: fetch
 * `unreachableUpstreamUrl()`'s port once while nothing listens on it, run
 * a scenario against that dead host, then start a fake upstream on that
 * same port and confirm the very next attempt succeeds there (used to test
 * that a host breaker really closes on success, not merely on a timer).
 */
export function createFakeHipsUpstream({
  latencyMs = 0,
  tileBytes = 4096,
  failuresBeforeSuccess = 0,
  failureStatus = 503,
  port = 0,
  // `(path) => Buffer | null`: a tile's own bytes (a real JPEG, for a test
  // that decodes it), `null` for a `404`; the deterministic payload below
  // otherwise.
  tileBody = null,
} = {}) {
  const requests = [];
  let active = 0;
  let maxActive = 0;
  const failureCounts = new Map();

  const server = createServer((request, response) => {
    const path = request.url;
    requests.push({ path, headers: { ...request.headers } });
    active += 1;
    maxActive = Math.max(maxActive, active);
    const respond = () => {
      active -= 1;
      const remainingFailures =
        failureCounts.get(path) ?? failuresBeforeSuccess;
      if (remainingFailures > 0) {
        failureCounts.set(path, remainingFailures - 1);
        response.writeHead(failureStatus, { "Content-Type": "text/plain" });
        response.end("synthetic upstream failure");
        return;
      }
      if (path === "/properties") {
        const body = "creator_did = fixture\nhips_version = 1.4\n";
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end(body);
        return;
      }
      if (tileBody) {
        const own = tileBody(path);
        if (!own) {
          response.writeHead(404, { "Content-Type": "text/plain" });
          response.end("no such tile");
          return;
        }
        response.writeHead(200, { "Content-Type": "image/jpeg" });
        response.end(own);
        return;
      }
      // Deterministic per-path payload: the path's own bytes, repeated and
      // truncated/padded to `tileBytes`, so every fetch of the same tile is
      // bit-for-bit identical and a differently-named tile is not.
      const seed = Buffer.from(path, "utf8");
      const body = Buffer.alloc(tileBytes);
      for (let index = 0; index < tileBytes; index += 1)
        body[index] = seed[index % seed.length];
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end(body);
    };
    // `.unref()`: a caller that gave up on this request (the mirror's own
    // connect/total timeout aborting first, which several mirror-fallback
    // tests deliberately do against a `latencyMs` far longer than either)
    // must not keep this process — or `node --test`'s — event loop alive
    // for the rest of `latencyMs` merely because this timer is still
    // pending.
    if (latencyMs > 0) setTimeout(respond, latencyMs).unref();
    else respond();
  });

  return new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${port}/`,
        requests,
        get requestCount() {
          return requests.length;
        },
        get maxConcurrent() {
          return maxActive;
        },
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}
