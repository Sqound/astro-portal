import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// `GET /api/target-library` (the listing the web planner's catalogue
// reads):
// - gives one unit for the right ascension, hours — the curated catalogue,
//   which keeps degrees, no longer slips degrees among hours (NGC 188 at
//   314,7 where the database's targets are at 20,98);
// - serves no text of its own for a target whose page it does not carry (the
//   pages of tier C are read online): the old three-sentence template is
//   never served, the reader asks `GET /v1/targets/{id}` for the page.
const root = await mkdtemp(join(tmpdir(), "astro-library-listing-"));
process.env.ASTRO_PORTAL_RUNTIME_DIR = join(root, "runtime");
process.env.ASTRO_PORTAL_DATABASE_PATH = join(root, "db", "portal.sqlite");
delete process.env.ASTRO_PORTAL_DATABASE_URL;
test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

const { plannerCatalogue } = await import("astro-core/planner-targets.js");
const library = await import("portal-app/lib/target-library.server.js");

test("a curated target's right ascension is in hours in the listing, as every other", async () => {
  const curated = plannerCatalogue.find(
    (target) => target.designation === "NGC 7000",
  );
  assert.ok(curated, "NGC 7000 is in the curated catalogue (degrees)");
  const found = await library.targetLibrarySearch({
    query: "NGC 7000",
    limit: 12,
  });
  const target = found.targets.find(
    (entry) => entry.designation === "NGC 7000",
  );
  assert.ok(target, "NGC 7000 is in the library");
  assert.ok(Math.abs(target.coordinate.ra - curated.coordinate.ra / 15) < 1e-9);
  assert.ok(target.coordinate.ra < 24);
  assert.equal(target.coordinate.dec, curated.coordinate.dec);
});

test("no right ascension of the listing is out of 0 to 24 hours", async () => {
  const found = await library.targetLibrarySearch({ limit: 200 });
  assert.ok(found.targets.length > 50);
  const out = found.targets
    .filter((target) => target.coordinate)
    .filter((target) => target.coordinate.ra < 0 || target.coordinate.ra >= 24)
    .map((target) => `${target.designation} ${target.coordinate.ra}`);
  assert.deepEqual(out, []);
});

test("a row without its page carries no text: the template is never served, in any language", async () => {
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "zh-Hans",
    "zh-Hant",
    "ru",
  ]) {
    const found = await library.targetLibrarySearch({ locale, limit: 200 });
    assert.ok(found.targets.length > 50, locale);
    for (const target of found.targets) {
      if (target.storyParagraphs?.length) continue;
      assert.equal(target.story, "", `${locale} ${target.designation}`);
      assert.equal(
        target.storyFallbackLocale,
        undefined,
        `${locale} ${target.designation}`,
      );
    }
  }
  // The text a row does carry is its page's, never the generated sentence.
  const found = await library.targetLibrarySearch({ limit: 200 });
  const generated = /apparent extent|étendue apparente/i;
  for (const target of found.targets)
    assert.doesNotMatch(target.story ?? "", generated, target.designation);
});
