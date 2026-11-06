import assert from "node:assert/strict";
import test from "node:test";
import {
  clearClientStateSink,
  noteClientState,
  registerClientStateSink,
} from "../src/auth/client-state-sink.js";

// ADMIN-09: the seam through which a service is told the state a device
// reports about itself; the core keeps nothing, and a sink never costs a
// request.

test("the sink registered is told; with none, nothing happens", async () => {
  clearClientStateSink();
  await noteClientState({ kind: "space", deviceId: "d", headers: {} });
  const seen = [];
  registerClientStateSink(async (event) => seen.push(event));
  await noteClientState({ kind: "space", deviceId: "d1", headers: {} });
  assert.deepEqual(
    seen.map((event) => event.deviceId),
    ["d1"],
  );
  clearClientStateSink();
});

test("a sink that throws is swallowed", async () => {
  registerClientStateSink(async () => {
    throw new Error("the database is gone");
  });
  await noteClientState({ kind: "space", deviceId: "d2", headers: {} });
  clearClientStateSink();
});

test("a sink is a function", () => {
  assert.throws(() => registerClientStateSink("nope"));
});
