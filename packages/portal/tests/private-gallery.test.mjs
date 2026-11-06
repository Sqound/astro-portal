import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PrivateGalleryError,
  createPrivateGalleryService,
  galleryGate,
} from "../dist/private-gallery/private-gallery.js";
import { generateRandomToken } from "../dist/persistence/random-token.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

// The private gallery of a space — the shared generator of its address,
// the gate every route of the gallery reads, the owner's settings and
// their refusals.

const at = "2026-10-07T09:00:00.000Z";

async function space(driver, label) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, label, at],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${label.toLowerCase()}@exemple.test`, "scrypt$test", at],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", at],
  );
  return { tenantId, userId, email: `${label.toLowerCase()}@exemple.test` };
}

const refused = (code, status) => (error) => {
  assert.ok(error instanceof PrivateGalleryError, String(error));
  assert.equal(error.code, code);
  if (status) assert.equal(error.status, status);
  return true;
};

test("the shared generator gives 24 unguessable base64url characters, never twice", () => {
  const tokens = new Set();
  for (let index = 0; index < 500; index += 1) {
    const token = generateRandomToken();
    assert.match(token, /^[A-Za-z0-9_-]{24}$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 500);
});

test("the gate: the owner always, anyone in link, one not_found for the rest", () => {
  const camille = { tenantId: "space-c", userId: "u-c", email: "c@x.test" };
  const noe = { tenantId: "space-n", userId: "u-n", email: "n@x.test" };
  const of = (mode) => ({ tenantId: "space-c", mode });
  for (const mode of ["none", "link"])
    assert.deepEqual(galleryGate({ space: of(mode), viewer: camille }), {
      outcome: "open",
      role: "owner",
      canReport: false,
    });
  assert.equal(
    galleryGate({ space: null, viewer: camille }).outcome,
    "not_found",
  );
  assert.equal(galleryGate({ space: of("none") }).outcome, "not_found");
  assert.equal(
    galleryGate({ space: of("none"), viewer: noe }).outcome,
    "not_found",
  );
  assert.deepEqual(galleryGate({ space: of("link") }), {
    outcome: "open",
    role: "visitor",
    canReport: true,
  });
  // A mode the core does not name is the composition's to decide: served as
  // `none`, one `not_found` for everyone but the owner.
  assert.equal(
    galleryGate({ space: of("other"), viewer: noe }).outcome,
    "not_found",
  );
  assert.equal(galleryGate({ space: of("other") }).outcome, "not_found");
});

onBothBackends(
  "the owner's settings: the address minted once, the two modes of a private server",
  async (driver) => {
    const camille = await space(driver, "Camille");
    const core = await createPrivateGalleryService({ driver });
    const first = await core.settings({
      ...camille,
      origin: "https://portal.example.test",
    });
    assert.match(
      first.address,
      /^https:\/\/portal\.example\.test\/p\/[A-Za-z0-9_-]{24}$/,
    );
    assert.equal(first.mode, "none", "shared with nobody at its creation");
    assert.equal(first.publicName, null);
    assert.equal(first.portalName, null);
    // A private server has one person: two modes only.
    assert.deepEqual(first.modes, { none: "available", link: "available" });
    assert.equal(
      (
        await core.settings({
          ...camille,
          origin: "https://portal.example.test",
        })
      ).address,
      first.address,
    );
  },
);

onBothBackends(
  "the owner's changes: one per call, the confirmation of link, no other mode, the names checked",
  async (driver) => {
    const camille = await space(driver, "Camille");
    const free = await createPrivateGalleryService({ driver });
    const update = (changes, service = free) =>
      service.update({ ...camille, changes, origin: "https://p.test" });
    await assert.rejects(update({}), refused("invalid_request", 400));
    await assert.rejects(
      update({ mode: "link", publicName: "Camille" }),
      refused("invalid_request", 400),
    );
    await assert.rejects(
      update({ mode: "link" }),
      refused("confirmation_required", 409),
    );
    assert.equal(
      (await update({ mode: "link", confirmVerifiers: true })).mode,
      "link",
    );
    // A mode the core does not name is refused: a private server has two.
    await assert.rejects(
      update({ mode: "other" }),
      refused("invalid_request", 400),
    );
    assert.equal((await update({ mode: "none" })).mode, "none");
    // Names: trimmed, 60 and 80 characters at most.
    const named = await update({
      publicName: "  Camille ",
      portalName: "Ciel du Lac Noir",
    });
    assert.equal(named.publicName, "Camille");
    assert.equal(named.portalName, "Ciel du Lac Noir");
    await assert.rejects(update({ publicName: "x".repeat(61) }), (error) => {
      refused("invalid_request", 400)(error);
      assert.equal(error.details.field, "publicName");
      return true;
    });
    // A service with a team that keeps a dictionary of forbidden words gives
    // the core its refusal (`nameRefusal`); the core refuses no name itself.
    const withWords = await createPrivateGalleryService({
      driver,
      nameRefusal: async ({ names }) =>
        /casino/i.test(names.publicName ?? "")
          ? { field: "publicName", word: "casino" }
          : null,
    });
    await assert.rejects(
      update(
        { publicName: "Camille Casino Bonus", portalName: "Autre" },
        withWords,
      ),
      (error) => {
        refused("name_forbidden", 422)(error);
        assert.deepEqual(error.details, {
          field: "publicName",
          word: "casino",
        });
        return true;
      },
    );
    const kept = await free.settings({ ...camille, origin: "" });
    assert.equal(kept.publicName, "Camille", "the former name is kept");
    assert.equal(kept.portalName, "Ciel du Lac Noir", "nothing is saved");
    // Without a team, no word is forbidden.
    assert.equal(
      (await update({ publicName: "Camille Casino Bonus" })).publicName,
      "Camille Casino Bonus",
    );
    assert.equal(
      (await update({ publicName: "Camille" })).publicName,
      "Camille",
    );
    // A new address: the former one leads nowhere.
    const before = kept.address.split("/p/")[1];
    const after = (await update({ regenerateToken: true })).address.split(
      "/p/",
    )[1];
    assert.notEqual(after, before);
    assert.equal(
      (await free.resolveGalleryAccess({ token: before, viewer: camille }))
        .outcome,
      "not_found",
    );
    assert.equal(
      (await free.resolveGalleryAccess({ token: after, viewer: camille }))
        .outcome,
      "open",
    );
  },
);

onBothBackends(
  "« Signaler » through a gallery: a visitor of link may report a capture it shows, never the owner",
  async (driver) => {
    const camille = await space(driver, "Camille");
    const gallery = await createPrivateGalleryService({ driver });
    const captureId = randomUUID();
    const refusedId = randomUUID();
    for (const [id, check, sha] of [
      [captureId, null, "a"],
      [refusedId, "refused", "b"],
    ])
      await driver.run(
        "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, admin_check, created_at, stage) VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?, 'finalized')",
        [id, camille.tenantId, "M31.jpg", sha.repeat(64), 10, check, at],
      );
    const { address } = await gallery.settings({ ...camille, origin: "" });
    const token = address.split("/p/")[1];
    const report = (viewer, id = captureId) =>
      gallery.reportableCapture({ token, captureId: id, viewer });
    // Shared with nobody: no one but the owner sees it, and the owner never
    // reports.
    assert.equal(await report(null), null);
    assert.equal(await report(camille), null);
    await gallery.update({
      ...camille,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "",
    });
    assert.deepEqual(await report(null), {
      tenantId: camille.tenantId,
      captureId,
      visibility: "private",
    });
    assert.equal(await report(camille), null, "never the owner");
    assert.equal(await report(null, refusedId), null, "a refused capture");
    assert.equal(await report(null, randomUUID()), null);
  },
);
