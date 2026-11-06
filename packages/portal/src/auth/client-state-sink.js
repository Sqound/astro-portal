/**
 * The seam through which a service that wants to know the state an
 * application reports about itself (the `X-PlanAstro-Client-State` header,
 * ADMIN-09) is told, at the authentication of a device. The core keeps
 * nothing of it: it only calls the sink registered, after the device's own
 * stamp, with `{ kind, deviceId, headers }` -- `kind` is `space` for a
 * space's device token. The sink parses the header itself, ignores a value
 * it does not understand, and never makes a request fail: an error it throws
 * is swallowed here.
 *
 * The registry lives on `globalThis` under a registered symbol for the reason
 * `sign-in-extension.js` gives (one registration at process start, seen by
 * every bundled copy of this module). A private server registers none.
 */
const registryKey = Symbol.for("astro-portal.client-state-sink");

/** Registers the sink (`async ({ kind, deviceId, headers }) => void`). */
export function registerClientStateSink(sink) {
  if (typeof sink !== "function")
    throw new Error("A client state sink is a function.");
  globalThis[registryKey] = sink;
  return sink;
}

/** Tells the sink registered, if any; never throws. */
export async function noteClientState(event) {
  const sink = globalThis[registryKey];
  if (typeof sink !== "function") return;
  try {
    await sink(event);
  } catch {
    // The report of a state never costs a request.
  }
}

/** Tests only: forgets the registration. */
export function clearClientStateSink() {
  delete globalThis[registryKey];
}
