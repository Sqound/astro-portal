import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_SOURCE_PROFILE } from "portal/capabilities/profiles.js";
import {
  SERVICE_EXTENSION_POINTS,
  clearServiceExtensions,
  enabledServiceExtension,
  galleryTeam,
  registerServiceExtension,
  serviceExtension,
} from "../dist/lib/service-extensions.js";
import {
  capabilitiesWithoutDatabase,
  entitlementProviderFor,
  privateServerCapabilities,
} from "../dist/lib/v1/entitlement-provider.js";
import {
  pageLanguageOf,
  protectedApplicationPath,
} from "../dist/server/start.js";
import { shippedLocales } from "astro-contracts/locales";

// The points where a composition adds to the core's application, and what
// the core answers when nothing is registered there: a private server's.

test("the list of points is closed", () => {
  assert.deepEqual(SERVICE_EXTENSION_POINTS, [
    "entitlements.provider",
    "entitlements.read",
    "spaces.signIn",
    "spaces.pageSettings",
    "devices.anonymous",
    "footer.link",
    "layout.overlay",
    "sessions.erasure",
    "gallery.moderation",
    "gallery.audience",
    "planner.projects",
    "appLogs.incidents",
  ]);
  assert.throws(() => registerServiceExtension("billing", {}), /Unknown/);
  assert.throws(() => serviceExtension("billing"), /Unknown/);
  assert.throws(
    () => registerServiceExtension("spaces.signIn", null),
    /missing/,
  );
});

test("the footer's link and the erasure's rows are a composition's: nothing registered, nothing added", async () => {
  clearServiceExtensions();
  assert.equal(enabledServiceExtension("footer.link"), null);
  assert.equal(enabledServiceExtension("sessions.erasure"), null);
  registerServiceExtension("footer.link", {
    enabled: (env) => env.SPACES === "open",
    element: async () => "link",
  });
  assert.equal(
    enabledServiceExtension("footer.link", { SPACES: "closed" }),
    null,
  );
  assert.equal(
    await enabledServiceExtension("footer.link", { SPACES: "open" }).element(),
    "link",
  );
  clearServiceExtensions();
});

test("the team that checks the galleries is a composition's: nothing registered, no team, no dictionary, no « Signaler »", async () => {
  clearServiceExtensions();
  assert.equal(galleryTeam(), null);
  const team = {
    enabled: (env) => env.TEAM === "on",
    nameRefusal: async () => ({ field: "publicName", word: "casino" }),
    report: { publicPath: (id) => `/reports/${id}` },
  };
  registerServiceExtension("gallery.moderation", team);
  try {
    assert.equal(galleryTeam({ TEAM: "off" }), null);
    assert.equal(galleryTeam({ TEAM: "on" }), team);
  } finally {
    clearServiceExtensions();
  }
  assert.equal(galleryTeam({ TEAM: "on" }), null);
});

test("the people a gallery is reserved to by name are a composition's: nothing registered, the owner and the address alone", () => {
  clearServiceExtensions();
  assert.equal(enabledServiceExtension("gallery.audience"), null);
  const audience = { enabled: (env) => env.AUDIENCE === "on" };
  registerServiceExtension("gallery.audience", audience);
  try {
    assert.equal(
      enabledServiceExtension("gallery.audience", { AUDIENCE: "off" }),
      null,
    );
    assert.equal(
      enabledServiceExtension("gallery.audience", { AUDIENCE: "on" }),
      audience,
    );
  } finally {
    clearServiceExtensions();
  }
  assert.equal(enabledServiceExtension("gallery.audience"), null);
});

test("nothing registered: a private server serves the open-source profile", async () => {
  clearServiceExtensions();
  assert.equal(serviceExtension("entitlements.provider"), null);
  assert.deepEqual(privateServerCapabilities({}), OPEN_SOURCE_PROFILE);
  assert.deepEqual(
    await entitlementProviderFor(null).capabilitiesFor("someone"),
    OPEN_SOURCE_PROFILE,
  );
  assert.deepEqual(capabilitiesWithoutDatabase(), OPEN_SOURCE_PROFILE);
});

test("the person who hosts the server may cap its storage, and nothing else", () => {
  const capped = privateServerCapabilities({
    ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES: "1000",
    ASTRO_PORTAL_STORAGE_QUOTA_BYTES: "5000",
  });
  assert.equal(capped["storage.max_file_bytes"], 1000);
  assert.equal(capped["storage.quota_bytes"], 5000);
  assert.deepEqual(
    { ...capped, "storage.max_file_bytes": 0, "storage.quota_bytes": 0 },
    {
      ...OPEN_SOURCE_PROFILE,
      "storage.max_file_bytes": 0,
      "storage.quota_bytes": 0,
    },
  );
  for (const value of ["0", "-1", "abc", ""])
    assert.deepEqual(
      privateServerCapabilities({ ASTRO_PORTAL_STORAGE_QUOTA_BYTES: value }),
      OPEN_SOURCE_PROFILE,
      value,
    );
});

test("a registered provider is used while it is on", async () => {
  clearServiceExtensions();
  const bought = { ...OPEN_SOURCE_PROFILE, "planner.mosaic": true };
  let on = true;
  registerServiceExtension("entitlements.provider", {
    enabled: () => on,
    provider: () => ({ capabilitiesFor: async () => bought }),
    visitorCapabilities: () => ({ ...bought, "planner.multiple": false }),
  });
  try {
    assert.deepEqual(
      await entitlementProviderFor(null).capabilitiesFor("a"),
      bought,
    );
    assert.equal(capabilitiesWithoutDatabase()["planner.multiple"], false);
    on = false;
    assert.equal(enabledServiceExtension("entitlements.provider"), null);
    assert.deepEqual(
      await entitlementProviderFor(null).capabilitiesFor("a"),
      OPEN_SOURCE_PROFILE,
    );
  } finally {
    clearServiceExtensions();
  }
});

test("the private pages are behind the sign-in, the public ones are not", () => {
  for (const path of [
    "/admin",
    "/admin/catalog",
    "/fr/admin",
    "/ja/account",
    "/api/plans",
    "/api/admin/backups",
  ])
    assert.equal(protectedApplicationPath(path), true, path);
  for (const path of [
    "/",
    "/fr",
    "/fr/planner",
    "/api/v1/service",
    "/auth/sign-in",
  ])
    assert.equal(protectedApplicationPath(path), false, path);
});

test("« Mon espace », the account page and the administration are behind the sign-in in every shipped language", () => {
  const languages = shippedLocales();
  assert.equal(languages.length, 10);
  for (const language of languages)
    for (const page of [
      "manage",
      "manage/captures",
      "manage/captures/2f0c",
      "manage/settings",
      "account",
      "admin",
      "admin/catalogue",
    ])
      assert.equal(
        protectedApplicationPath(`/${language}/${page}`),
        true,
        `/${language}/${page}`,
      );
  // A private gallery is gated by its own page; a look-alike section and a
  // language the registry does not ship are not this guard's.
  for (const path of [
    "/fr/p/k7Qm2xV9aTfR4bWc8ZpL3n",
    "/fr/managed",
    "/xx/manage",
    "/manage",
  ])
    assert.equal(protectedApplicationPath(path), false, path);
});

test("the sign-in page speaks the language the refused page named, in every shipped language", () => {
  for (const language of shippedLocales()) {
    assert.equal(pageLanguageOf(`/${language}/manage/captures`), language);
    assert.equal(pageLanguageOf(`/${language}`), language);
  }
  assert.equal(pageLanguageOf("/auth/sign-in"), undefined);
  assert.equal(pageLanguageOf("/xx/manage"), undefined);
});
