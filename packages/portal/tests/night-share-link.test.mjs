import assert from "node:assert/strict";
import test from "node:test";
import {
  nightShareCodeOfLink,
  nightShareEvents,
  nightShareLink,
  nightSharePlanPayload,
  nightShareScript,
  nightShareTag,
} from "../dist/link/night-share.js";

// The shared night's link, held by the shared fixture `night-share-link`.

test("the plan leaves the host with its place's name and rounded coordinates, without notes", () => {
  const shared = nightSharePlanPayload({
    name: "Soirée",
    notes: "privé",
    location: {
      name: "Col des Mélèzes",
      latitude: "45.0437",
      longitude: -30.0812,
      elevation: 1847,
      address: "3 chemin du col",
      locality: "Hameau",
    },
    items: [{ id: "a", note: "mon mot", targetId: "m57" }],
  });
  assert.deepEqual(shared, {
    name: "Soirée",
    location: {
      name: "Col des Mélèzes",
      latitude: 45,
      longitude: -30.1,
      elevation: 1800,
    },
    items: [{ id: "a", targetId: "m57" }],
  });
  assert.equal(nightShareCodeOfLink(nightShareLink("km7q2x")), "KM7Q2X");
  assert.equal(nightShareCodeOfLink("https://portal.example/n/KM7Q2X"), null);
  assert.ok(!nightShareTag("KM7Q2X").includes("KM7Q2X"));
});

test("a viewer's write is refused, told bye(readOnly) and cut", () => {
  const result = nightShareScript({
    code: "KM7Q2X",
    label: "Soirée",
    deviceId: "dev-host",
    epoch: "run-host",
    steps: [
      { connect: "v" },
      {
        receive: {
          from: "v",
          message: {
            v: 1,
            t: "hello",
            s: 1,
            b: {
              device: "d",
              epoch: "e",
              role: "viewer",
              space: sharedProof(),
              name: "",
            },
          },
        },
      },
      {
        receive: {
          from: "v",
          message: { v: 1, t: "target", s: 2, b: { key: "m42", name: "M42" } },
        },
      },
    ],
  });
  assert.deepEqual(
    result.steps[2].map(
      (action) => action.refused ?? action.cut ?? action.message?.b?.reason,
    ),
    ["v", "readOnly", "v"],
  );
  assert.deepEqual(result.watching, []);
});

function sharedProof() {
  return nightShareScript({
    code: "KM7Q2X",
    label: "",
    deviceId: "",
    epoch: "",
  }).proof;
}

// The four kinds Astro Sync detects describe the equipment, they stay private
// in a shared night, like the notes and the equipment issues.
test("the shared night never carries a note, an equipment issue or a kind detected by Astro Sync", () => {
  const events = [
    "note",
    "equipment_issue",
    "exposure_change",
    "guiding_timeouts",
    "sensor_temperature_drift",
    "guiding_spikes",
    "target_started",
    "condition",
  ].map((type, rank) => ({
    eventId: `e${rank}`,
    type,
    payload: {},
    occurredAt: "2026-10-03T20:02:00.000Z",
  }));
  assert.deepEqual(
    nightShareEvents(events).map((event) => event.type),
    ["target_started", "condition"],
  );
});

// The events of the night's mount or smart telescope and the pointing helps
// describe the equipment too.
test("the shared night never carries an event of the mount, of a smart telescope or of a pointing help", () => {
  const equipment = [
    "mount_connected",
    "mount_goto",
    "mount_stop",
    "mount_link_lost",
    "mount_link_back",
    "mount_disconnected",
    "mount_parked",
    "mount_aligned",
    "pointing_help",
    "device_connected",
    "device_goto",
    "device_stop",
    "device_parked",
    "device_link_lost",
    "device_link_back",
  ];
  const events = [...equipment, "target_finished", "pause"].map(
    (type, rank) => ({
      eventId: `e${rank}`,
      type,
      payload: {},
      occurredAt: "2026-10-03T20:02:00.000Z",
    }),
  );
  assert.deepEqual(
    nightShareEvents(events).map((event) => event.type),
    ["target_finished", "pause"],
  );
});
