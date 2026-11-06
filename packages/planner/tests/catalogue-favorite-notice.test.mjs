// Ticking the photo or the visual favorite of a catalogue target says which one
// was touched, added or removed, in ten languages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  favoriteNoticeDurationMs,
  favoriteNoticeKey,
} from "../src/favorite-notice.js";
import { message, messages } from "portal/i18n.js";

const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("the notice names the favorite and the gesture", () => {
  assert.equal(
    favoriteNoticeKey("photo", true),
    "plannerTargetCataloguePhotoFavoriteAdded",
  );
  assert.equal(
    favoriteNoticeKey("photo", false),
    "plannerTargetCataloguePhotoFavoriteRemoved",
  );
  assert.equal(
    favoriteNoticeKey("visual", true),
    "plannerTargetCatalogueVisualFavoriteAdded",
  );
  assert.equal(
    favoriteNoticeKey("visual", false),
    "plannerTargetCatalogueVisualFavoriteRemoved",
  );
  assert.ok(favoriteNoticeDurationMs <= 3000);
});

test("English and French say it, and the four texts differ in every language", () => {
  assert.equal(
    message("en", favoriteNoticeKey("photo", true)),
    "Added to photo favorites",
  );
  assert.equal(
    message("en", favoriteNoticeKey("visual", false)),
    "Removed from visual favorites",
  );
  assert.equal(
    message("fr", favoriteNoticeKey("visual", true)),
    "Cible ajoutée aux préférées (visuel)",
  );
  for (const locale of Object.keys(messages)) {
    const texts = [
      ["photo", true],
      ["photo", false],
      ["visual", true],
      ["visual", false],
    ].map(([mode, added]) => message(locale, favoriteNoticeKey(mode, added)));
    assert.equal(new Set(texts).size, 4, locale);
    for (const text of texts) assert.ok(text && !/^plannerTarget/.test(text));
  }
});

test("a tick of either favorite raises the notice and a failure takes it down", () => {
  const toggle = page.slice(
    page.indexOf("const toggleFavorite = async (targetId, mode) => {"),
  );
  const body = toggle.slice(0, toggle.indexOf("\n  };\n"));
  assert.match(
    body,
    /setFavoriteNotice\(\{[\s\S]*?favoriteNoticeKey\(mode, favorite\)/,
  );
  assert.match(body, /setFavoriteError\(true\);\s*setFavoriteNotice\(null\);/);
  assert.match(page, /planner-add-notice planner-favorite-notice/);
});

// Rule: a space only holds personal data that is synchronised; a function
// that does not need one is never blocked without it:
// "Mes préférées" of a person with no space live in the browser, like the
// plans and the places, and go to the space at the first sign-in.
import {
  browserFavoriteIds,
  browserFavoritesPayload,
  browserFavoritesStorageKey,
  carryBrowserFavorites,
  emptyBrowserFavorites,
  readBrowserFavorites,
  withBrowserFavorite,
  writeBrowserFavorites,
} from "../src/browser-favorites.js";

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test("a visitor's favorites live in the browser: ticked, kept, read back, and unticked", () => {
  const storage = memoryStorage();
  assert.deepEqual(readBrowserFavorites(storage), emptyBrowserFavorites());
  let held = readBrowserFavorites(storage);
  held = withBrowserFavorite(held, "m31", "photo", true);
  held = withBrowserFavorite(held, "m31", "visual", true);
  held = withBrowserFavorite(held, "ngc7000", "photo", true);
  assert.ok(writeBrowserFavorites(storage, held));
  const read = readBrowserFavorites(storage);
  assert.deepEqual(browserFavoritesPayload(read), {
    photoTargetIds: ["m31", "ngc7000"],
    visualTargetIds: ["m31"],
  });
  assert.deepEqual([...browserFavoriteIds(read)].sort(), ["m31", "ngc7000"]);
  assert.deepEqual([...browserFavoriteIds(read, "visual")], ["m31"]);
  // Ticking twice does not double; unticking the last one leaves nothing.
  held = withBrowserFavorite(read, "m31", "photo", true);
  assert.deepEqual(held.photoTargetIds, ["ngc7000", "m31"]);
  for (const [id, mode] of [
    ["m31", "photo"],
    ["m31", "visual"],
    ["ngc7000", "photo"],
  ])
    held = withBrowserFavorite(held, id, mode, false);
  writeBrowserFavorites(storage, held);
  assert.equal(storage.values.has(browserFavoritesStorageKey), false);
});

test("a storage that fails or holds something else reads as no favorite", () => {
  assert.deepEqual(
    readBrowserFavorites(
      memoryStorage({ [browserFavoritesStorageKey]: "not json" }),
    ),
    emptyBrowserFavorites(),
  );
  assert.deepEqual(
    readBrowserFavorites({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
    emptyBrowserFavorites(),
  );
  assert.equal(
    writeBrowserFavorites(
      {
        setItem: () => {
          throw new Error("full");
        },
        removeItem: () => {},
      },
      { photoTargetIds: ["m31"], visualTargetIds: [] },
    ),
    false,
  );
});

test("at the sign-in the favorites go to the space, one tick at a time, and leave the browser", async () => {
  const storage = memoryStorage();
  writeBrowserFavorites(storage, {
    photoTargetIds: ["m31", "gone"],
    visualTargetIds: ["m31"],
  });
  const sent = [];
  const outcome = await carryBrowserFavorites({
    storage,
    request: async (body) => {
      sent.push(body);
      // The space no longer has this target: dropped for good.
      return {
        ok: body.targetId !== "gone",
        status: body.targetId === "gone" ? 404 : 200,
      };
    },
  });
  assert.deepEqual(sent, [
    { targetId: "m31", mode: "photo", favorite: true },
    { targetId: "gone", mode: "photo", favorite: true },
    { targetId: "m31", mode: "visual", favorite: true },
  ]);
  assert.deepEqual(outcome, { sent: 2, kept: 0 });
  assert.equal(storage.values.has(browserFavoritesStorageKey), false);
});

test("a cut in the middle of the carry keeps what the space did not take for the next time", async () => {
  const storage = memoryStorage();
  writeBrowserFavorites(storage, {
    photoTargetIds: ["m31", "ngc7000", "ic342"],
    visualTargetIds: [],
  });
  let calls = 0;
  const outcome = await carryBrowserFavorites({
    storage,
    request: async () => {
      calls += 1;
      if (calls === 2) throw new Error("offline");
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(outcome, { sent: 1, kept: 2 });
  assert.deepEqual(readBrowserFavorites(storage).photoTargetIds, [
    "ngc7000",
    "ic342",
  ]);
  // Two sign-ins at once send each tick once.
  let sentTwice = 0;
  const request = async () => {
    sentTwice += 1;
    return { ok: true, status: 200 };
  };
  await Promise.all([
    carryBrowserFavorites({ storage, request }),
    carryBrowserFavorites({ storage, request }),
  ]);
  assert.equal(sentTwice, 2);
  assert.equal(storage.values.has(browserFavoritesStorageKey), false);
});

test("the page keeps the favorites in the browser for a visitor and greys nothing out", () => {
  // The catalogue: no more "se connecter" title, no disabled star or tab.
  assert.doesNotMatch(page, /plannerTargetCatalogueFavoriteLogin/);
  assert.doesNotMatch(page, /canManageFavorites/);
  const toggle = page.slice(
    page.indexOf("const toggleFavorite = async (targetId, mode) => {"),
  );
  const body = toggle.slice(0, toggle.indexOf("\n  };\n"));
  assert.match(
    body,
    /if \(favoritesInBrowser\) \{[\s\S]*?withBrowserFavorite\(/,
  );
  assert.match(body, /writeBrowserFavorites\(window\.localStorage, kept\)/);
  // A visitor asks the catalogue for the identifiers, never for the session's.
  assert.match(
    page,
    /favorites:\s*catalogueView === "favorites" && !favoritesInBrowser \? "1" : "0"/,
  );
  assert.match(page, /parameters\.set\(\s*"targetIds"/);
  // The planner's own "Favoris" selection is offered to a visitor and reads
  // the browser; a signed-in person's carry goes first.
  assert.doesNotMatch(
    page,
    /\.\.\.\(auth\.authenticated\s*\?\s*\[\s*\[\s*"favorites"/,
  );
  assert.match(
    page,
    /setPlannerFavoriteTargetIds\(\s*browserFavoriteIds\(readBrowserFavorites\(window\.localStorage\)\)/,
  );
  assert.equal(
    (
      page.match(
        /carryBrowserFavorites\(\{\s*storage: window\.localStorage/g,
      ) || []
    ).length,
    2,
    "the catalogue and the planner both carry before reading the space",
  );
});
