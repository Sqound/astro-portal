import assert from "node:assert/strict";
import test from "node:test";
import {
  plannerCatalogueReads,
  warmPlannerCatalogue,
} from "../dist/server/warm-planner-catalogue.js";

// A service that has just started asks itself for what the web planner reads
// of the catalogue, so that the first person on a fresh browser does not
// wait 13 to 20 s for it.

test("the warm-up asks, one after the other, for the planner's own three reads of a language", async () => {
  const asked = [];
  let running = 0;
  let overlapping = false;
  const outcome = await warmPlannerCatalogue({
    origin: "http://127.0.0.1:9",
    locales: ["en", "fr"],
    fetchImplementation: async (url) => {
      running += 1;
      overlapping ||= running > 1;
      asked.push(`${url.pathname}${url.search}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(outcome, { answered: 6, failed: 0 });
  assert.equal(overlapping, false, "never two at once: the health probe waits");
  assert.deepEqual(asked, [
    ...plannerCatalogueReads("en"),
    ...plannerCatalogueReads("fr"),
  ]);
  assert.deepEqual(
    plannerCatalogueReads("en").map((path) => path.split("?")[0]),
    ["/api/planner-targets", "/api/catalog", "/api/target-library"],
  );
});

test("a read that cannot be reached is counted and never thrown", async () => {
  const lines = [];
  const outcome = await warmPlannerCatalogue({
    origin: "http://127.0.0.1:9",
    fetchImplementation: async () => {
      throw new Error("connect ECONNREFUSED");
    },
    log: (event, message) => lines.push([event, message]),
  });
  assert.deepEqual(outcome, { answered: 0, failed: 3 });
  assert.equal(lines.at(-1)[0], "warm-up.planner-done");
});
