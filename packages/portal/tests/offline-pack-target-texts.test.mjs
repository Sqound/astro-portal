import assert from "node:assert/strict";
import test from "node:test";

import {
  isListableTextShard,
  targetTextsComponentId,
  targetTextsComponentKind,
  targetTextsPackComponent,
  targetTextsRevision,
  targetTextsUrlTemplate,
} from "portal/offline-pack/target-texts.js";

// The manifest shape of the optional « Textes complets du catalogue »
// component: a pure function of an index already read.

const shard = (number, extra = {}) => ({
  shard: number,
  path: `xx/${number}.json`,
  bytes: 1_000_000 + Number(number),
  sha256: "a".repeat(63) + (Number(number) % 10),
  revision: `rev-${number}`,
  count: 500,
  ...extra,
});

const index = {
  v: 1,
  shardCount: 32,
  locales: {
    fr: [shard("001"), shard("000")],
    en: [shard("000")],
    ja: [shard("000")],
    xx: [shard("000")],
  },
};

test("the component lists the shipped languages in the order given, the shards in shard order, and drops the index's own path", () => {
  const component = targetTextsPackComponent({
    index,
    locales: ["en", "fr", "de", "ja"],
  });
  assert.equal(component.id, targetTextsComponentId);
  assert.equal(component.kind, targetTextsComponentKind);
  assert.equal(component.id, "target-texts");
  assert.equal(component.kind, "text-shards");
  assert.equal(component.required, false);
  assert.equal(component.urlTemplate, targetTextsUrlTemplate);
  // `de` has no shard: not listed; `xx` is not shipped: not listed.
  assert.deepEqual(Object.keys(component.locales), ["en", "fr", "ja"]);
  assert.deepEqual(
    component.locales.fr.map((item) => item.shard),
    ["000", "001"],
  );
  assert.deepEqual(Object.keys(component.locales.fr[0]).sort(), [
    "bytes",
    "count",
    "revision",
    "sha256",
    "shard",
  ]);
});

test("the revision follows every language's shard revisions and digests, and only them", () => {
  const one = targetTextsPackComponent({ index, locales: ["en", "fr"] });
  const same = targetTextsPackComponent({
    index: structuredClone(index),
    locales: ["en", "fr"],
  });
  assert.equal(one.revision, same.revision);
  assert.match(one.revision, /^[0-9a-f]{16}$/);
  assert.equal(one.revision, targetTextsRevision(one.locales));
  const changed = structuredClone(index);
  changed.locales.fr[0].revision = "rev-new";
  assert.notEqual(
    targetTextsPackComponent({ index: changed, locales: ["en", "fr"] })
      .revision,
    one.revision,
  );
  // A language left out is not part of the revision.
  assert.notEqual(
    targetTextsPackComponent({ index, locales: ["en"] }).revision,
    one.revision,
  );
  // The static pack's own relative template.
  assert.equal(
    targetTextsPackComponent({
      index,
      locales: ["en"],
      urlTemplate: "target-texts/{locale}/{shard}.json",
    }).urlTemplate,
    "target-texts/{locale}/{shard}.json",
  );
});

test("nothing to list is no component, never an empty one", () => {
  assert.equal(targetTextsPackComponent({ index, locales: [] }), null);
  assert.equal(targetTextsPackComponent({ index, locales: ["de"] }), null);
  assert.equal(
    targetTextsPackComponent({ index: { locales: {} }, locales: ["en"] }),
    null,
  );
  assert.equal(
    targetTextsPackComponent({ index: null, locales: ["en"] }),
    null,
  );
  assert.equal(
    targetTextsPackComponent({
      index: { locales: { en: "not a list" } },
      locales: ["en"],
    }),
    null,
  );
});

test("a shard the manifest cannot describe is left out", () => {
  assert.ok(isListableTextShard(shard("000")));
  for (const broken of [
    shard("0", {}),
    shard("000", { bytes: 0 }),
    shard("000", { sha256: "abc" }),
    shard("000", { revision: "" }),
    shard("000", { count: 0 }),
    null,
    "000",
  ])
    assert.equal(isListableTextShard(broken), false);
  const component = targetTextsPackComponent({
    index: { locales: { en: [shard("000"), shard("001", { bytes: 0 })] } },
    locales: ["en"],
  });
  assert.deepEqual(
    component.locales.en.map((item) => item.shard),
    ["000"],
  );
});
