import assert from "node:assert/strict";
import test from "node:test";
import { catalogueDesignation } from "../dist/catalogue-designation.js";

test("catalogue designations retain their catalogues and suffixes", () => {
  for (const [input, expected] of [
    ["M 031", "M31"],
    ["B 033A", "B33a"],
    ["NGC0061A", "NGC 61A"],
    ["IC0080 NED01", "IC 80 NED01"],
  ]) {
    assert.equal(catalogueDesignation(input), expected);
    assert.equal(catalogueDesignation(expected), expected);
  }
});

test("other catalogues, names and identifiers remain exactly as supplied", () => {
  for (const value of [
    "C14",
    "Sh2-155",
    "LDN 1622",
    "Abell 39",
    "Andromeda Galaxy",
    "unknown-target",
    " User name ",
  ]) {
    assert.equal(catalogueDesignation(value), value);
  }
});
