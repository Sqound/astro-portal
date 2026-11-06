import assert from "node:assert/strict";
import { test } from "node:test";

import {
  galleryDisplay,
  galleryImportHref,
  latestFinishedNightId,
} from "../dist/gallery-state.js";
import { messages } from "../dist/i18n.js";

// The useful empty states of the web — one sentence, one
// muted line, ONE primary, the star in filigree, no link — and the rule that
// an empty state never hides an error, a read in progress or a search that
// found nothing.

const idle = {
  loading: false,
  filterLoading: false,
  loadError: false,
  total: 0,
  catalogTotal: 0,
  query: "",
  tag: "",
};

test("the gallery is empty only when it holds no image, nothing loads, nothing is searched", () => {
  assert.equal(galleryDisplay(idle), "empty");
  // In progress is not an answer.
  assert.equal(galleryDisplay({ ...idle, loading: true }), "results");
  assert.equal(galleryDisplay({ ...idle, filterLoading: true }), "results");
  // A search or a filter that finds nothing keeps today's counter.
  assert.equal(
    galleryDisplay({ ...idle, catalogTotal: 12, query: "zzz" }),
    "results",
  );
  assert.equal(galleryDisplay({ ...idle, query: "zzz" }), "results");
  assert.equal(galleryDisplay({ ...idle, tag: "galaxie" }), "results");
  assert.equal(galleryDisplay({ ...idle, catalogTotal: 12 }), "results");
  assert.equal(
    galleryDisplay({ ...idle, total: 3, catalogTotal: 3 }),
    "results",
  );
  // A failed read is an error, whatever the counters say.
  assert.equal(galleryDisplay({ ...idle, loadError: true }), "error");
  assert.equal(
    galleryDisplay({ ...idle, loadError: true, total: 3, catalogTotal: 3 }),
    "error",
  );
});

test("« Importer une première image » leads to the latest finished night, else the journal", () => {
  const sessions = [
    {
      id: "a",
      status: "finished",
      startedAt: "2026-09-01T20:00:00Z",
      finishedAt: "2026-09-02T02:00:00Z",
    },
    {
      id: "b",
      status: "open",
      startedAt: "2026-10-04T20:00:00Z",
      finishedAt: null,
    },
    {
      id: "c",
      status: "finished",
      startedAt: "2026-09-20T20:00:00Z",
      finishedAt: "2026-09-21T02:00:00Z",
    },
    { id: "d", status: "paused", startedAt: "2026-10-01T20:00:00Z" },
    {
      id: "e",
      status: "finished",
      startedAt: "2026-09-10T20:00:00Z",
      finishedAt: "2026-09-11T02:00:00Z",
    },
  ];
  assert.equal(latestFinishedNightId(sessions), "c");
  assert.equal(latestFinishedNightId([sessions[1], sessions[3]]), null);
  assert.equal(latestFinishedNightId([]), null);
  assert.equal(latestFinishedNightId(undefined), null);
  assert.equal(galleryImportHref("fr", "c"), "/fr/sessions/c");
  assert.equal(galleryImportHref("ja", null), "/ja/sessions");
});

test("the five new sentences of the gallery exist in the ten languages", () => {
  const keys = [
    "galleryEmptySentence",
    "galleryEmptyDetail",
    "galleryEmptyAction",
    "galleryLoadFailed",
    "galleryRetry",
  ];
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of keys)
      assert.ok(
        typeof messages[locale]?.[key] === "string" && messages[locale][key],
        `${locale}.${key}`,
      );
});
