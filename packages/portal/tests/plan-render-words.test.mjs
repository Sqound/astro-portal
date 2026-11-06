// The image of a multi-night plan names its render with the service's
// words -- the four renders of Astro Sync and « Sans traitement » -- and
// refuses any other word.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUploadMetadata } from "../dist/api/upload-resources.js";

const base = {
  originalName: "ic1805-plan.jpg",
  sha256: "a".repeat(64),
  byteSize: 100,
  role: "plan",
  projectId: "5b9e0f62-8f7a-4a3e-9c2a-1d6f5c0e7a11",
};

test("planRender accepts natural, dualband, polished, hoo and none", () => {
  for (const planRender of ["natural", "dualband", "polished", "hoo", "none"]) {
    const parsed = parseUploadMetadata(JSON.stringify({ ...base, planRender }));
    assert.equal(parsed.plan.render, planRender);
  }
  assert.equal(parseUploadMetadata(JSON.stringify(base)).plan.render, null);
});

test("planRender refuses any other word", () => {
  for (const planRender of [
    "pretty",
    "Polished",
    "raw",
    "dualband-correction",
  ]) {
    assert.throws(
      () => parseUploadMetadata(JSON.stringify({ ...base, planRender })),
      /planRender is natural, dualband, polished, hoo or none/,
      planRender,
    );
  }
});
