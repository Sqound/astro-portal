import assert from "node:assert/strict";
import test from "node:test";
import { catalogueDesignation } from "../dist/catalogue-designation.js";
import { plannerCatalogue } from "../dist/planner-targets.js";

test("curated planner targets already use the catalogue writing independently of their translated common names", () => {
  for (const target of plannerCatalogue) {
    assert.equal(
      target.designation,
      catalogueDesignation(target.designation),
      target.id,
    );
    for (const label of target.objects) {
      assert.equal(
        label,
        catalogueDesignation(label),
        `${target.id}: timeline label`,
      );
    }
  }
});
