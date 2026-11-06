import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPlanTargetPictures,
  planTargetIds,
  plansTargetIds,
  targetWithPicture,
} from "../src/plan-target-pictures.js";

// PORTAL-SYNC-LOOP-01: the rows of a plan's dialog draw the catalogue's
// picture of each target, read by the targets' ids.

const plan = {
  items: [
    { id: "openngc-ic0348", target: { id: "openngc-ic0348", title: "IC 348" } },
    { id: "openngc-ic0417" },
    { id: "again", target: { id: "openngc-ic0348" } },
    { target: { title: "no id" } },
  ],
};

test("the ids of a plan's targets, in order, each once", () => {
  assert.deepEqual(planTargetIds(plan), ["openngc-ic0348", "openngc-ic0417"]);
  assert.deepEqual(planTargetIds(null), []);
});

test("the catalogue is read once, by the targets' ids; a failure leaves the pictograms", async () => {
  const asked = [];
  const rows = await loadPlanTargetPictures({
    locale: "fr",
    ids: ["openngc-ic0348", "openngc-ic0417"],
    request: async (url) => {
      asked.push(url);
      return {
        ok: true,
        json: async () => ({
          targets: [
            { id: "openngc-ic0348", photoThumbnailUrl: "/p/ic0348.jpg" },
            { id: "elsewhere", photoThumbnailUrl: "/p/x.jpg" },
          ],
        }),
      };
    },
  });
  assert.equal(asked.length, 1);
  const query = new URL(asked[0], "http://portal.test").searchParams;
  assert.equal(query.get("targetIds"), "openngc-ic0348,openngc-ic0417");
  assert.equal(query.get("limit"), "2");
  assert.deepEqual([...rows.keys()], ["openngc-ic0348"]);
  assert.equal(
    (
      await loadPlanTargetPictures({
        locale: "fr",
        ids: ["a"],
        request: async () => {
          throw new TypeError("offline");
        },
      })
    ).size,
    0,
  );
  let called = false;
  await loadPlanTargetPictures({
    locale: "fr",
    ids: [],
    request: async () => {
      called = true;
    },
  });
  assert.equal(called, false, "a plan without targets asks nothing");
});

test("the plan's snapshot keeps its words, the catalogue gives the picture", () => {
  const row = { id: "openngc-ic0348", photoThumbnailUrl: "/p/ic0348.jpg" };
  const snapshot = { id: "openngc-ic0348", title: "IC 348" };
  assert.deepEqual(targetWithPicture(snapshot, row), {
    ...snapshot,
    knowledge: row,
  });
  assert.equal(targetWithPicture(snapshot, undefined), snapshot);
  assert.equal(targetWithPicture(undefined, row), row);
  const known = { ...snapshot, knowledge: { photoThumbnailUrl: "/own.jpg" } };
  assert.equal(targetWithPicture(known, row), known);
});

test("the ids the cards of several plans draw: the first of each plan, each once", () => {
  const plans = [
    plan,
    { items: [{ id: "a" }, { id: "b" }, { id: "openngc-ic0348" }] },
    null,
  ];
  assert.deepEqual(plansTargetIds(plans), [
    "openngc-ic0348",
    "openngc-ic0417",
    "a",
    "b",
  ]);
  assert.deepEqual(plansTargetIds(plans, 1), ["openngc-ic0348", "a"]);
  assert.deepEqual(plansTargetIds(null), []);
});
