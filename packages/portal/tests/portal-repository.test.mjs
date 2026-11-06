import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PORTAL_NAME_MAX,
  PUBLIC_NAME_MAX,
  PortalRepositoryError,
  createPortalRepository,
} from "../dist/persistence/portal-repository.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";

// The private gallery of a space (« Galerie privée »), on SQLite and on
// PostgreSQL.

const at = "2026-10-06T20:00:00.000Z";

async function twoSpaces(driver) {
  const camille = randomUUID();
  const other = randomUUID();
  await seedSpace(driver, camille, null, at);
  await seedSpace(driver, other, null, at);
  return { camille, other, portals: await createPortalRepository({ driver }) };
}

const refusedWith = (code) => (error) => {
  assert.ok(error instanceof PortalRepositoryError);
  assert.equal(error.code, code);
  return true;
};

onBothBackends(
  "the address of a gallery is minted once, at the first read, and differs per space",
  async (driver) => {
    const { camille, other, portals } = await twoSpaces(driver);
    assert.equal(
      (
        await driver.query(
          "SELECT portal_token FROM organizations WHERE id = ?",
          [camille],
        )
      ).rows[0].portal_token,
      null,
    );
    const first = await portals.getPortal(camille);
    assert.match(first.token, /^[A-Za-z0-9_-]{24}$/);
    assert.equal((await portals.getPortal(camille)).token, first.token);
    const both = await Promise.all([
      portals.getPortal(other),
      portals.getPortal(other),
    ]);
    assert.equal(both[0].token, both[1].token, "two first reads, one address");
    assert.notEqual(both[0].token, first.token);
    assert.deepEqual(first, {
      token: first.token,
      mode: "none",
      publicName: null,
      portalName: null,
      publicNameRefusedAt: null,
      portalNameRefusedAt: null,
    });
    assert.equal(await portals.getPortal(randomUUID()), null);
    await portals.close();
  },
);

onBothBackends(
  "a new address on request: the former one leads nowhere any more",
  async (driver) => {
    const { camille, portals } = await twoSpaces(driver);
    const before = (await portals.getPortal(camille)).token;
    assert.equal((await portals.spaceByPortalToken(before)).tenantId, camille);
    const after = await portals.regenerateToken(camille);
    assert.match(after, /^[A-Za-z0-9_-]{24}$/);
    assert.notEqual(after, before);
    assert.equal(await portals.spaceByPortalToken(before), null);
    const found = await portals.spaceByPortalToken(after);
    assert.equal(found.tenantId, camille);
    assert.equal(found.mode, "none");
    assert.equal(await portals.spaceByPortalToken(""), null);
    assert.equal(await portals.regenerateToken(randomUUID()), null);
    await portals.close();
  },
);

onBothBackends("the two modes are stored, and nothing else", async (driver) => {
  const { camille, portals } = await twoSpaces(driver);
  for (const mode of ["link", "none"]) {
    assert.equal(await portals.setMode(camille, mode), true);
    assert.equal((await portals.getPortal(camille)).mode, mode);
  }
  // A mode the core does not name is the composition's to name.
  for (const other of ["public", "guests"])
    await assert.rejects(
      portals.setMode(camille, other),
      refusedWith("invalid_request"),
    );
  assert.equal((await portals.getPortal(camille)).mode, "none");
  assert.equal(await portals.setMode(randomUUID(), "link"), false);
  await portals.close();
});

onBothBackends(
  "the two names: optional, kept as typed, 60 and 80 characters at most, a saved name clears its refusal",
  async (driver) => {
    const { camille, portals } = await twoSpaces(driver);
    await portals.setNames(camille, {
      publicName: " Camille ",
      portalName: "Ciel du Lac Noir",
    });
    let portal = await portals.getPortal(camille);
    assert.equal(portal.publicName, " Camille ", "never trimmed");
    assert.equal(portal.portalName, "Ciel du Lac Noir");

    // Characters, not bytes nor UTF-16 units.
    await portals.setNames(camille, {
      publicName: "é".repeat(PUBLIC_NAME_MAX),
    });
    await portals.setNames(camille, {
      portalName: "星".repeat(PORTAL_NAME_MAX),
    });
    await assert.rejects(
      portals.setNames(camille, {
        publicName: "é".repeat(PUBLIC_NAME_MAX + 1),
      }),
      refusedWith("invalid_request"),
    );
    await assert.rejects(
      portals.setNames(camille, {
        portalName: "a".repeat(PORTAL_NAME_MAX + 1),
      }),
      refusedWith("invalid_request"),
    );
    portal = await portals.getPortal(camille);
    assert.equal(portal.publicName, "é".repeat(PUBLIC_NAME_MAX));
    assert.equal(portal.portalName, "星".repeat(PORTAL_NAME_MAX));

    // A field left out is unchanged; "" or null empties it.
    await portals.setNames(camille, { portalName: "" });
    portal = await portals.getPortal(camille);
    assert.equal(portal.portalName, null);
    assert.equal(portal.publicName, "é".repeat(PUBLIC_NAME_MAX));

    // The team refused the public name; saving another clears it.
    await driver.run(
      "UPDATE organizations SET public_name = NULL, public_name_refused_at = ?, portal_name_refused_at = ? WHERE id = ?",
      [at, at, camille],
    );
    await portals.setNames(camille, { publicName: "Camille" });
    portal = await portals.getPortal(camille);
    assert.equal(portal.publicName, "Camille");
    assert.equal(portal.publicNameRefusedAt, null);
    assert.equal(
      portal.portalNameRefusedAt,
      at,
      "the other name's refusal stays",
    );
    await portals.close();
  },
);

onBothBackends(
  "« Masquer le matériel par défaut » is read and written per space",
  async (driver) => {
    const { camille, other, portals } = await twoSpaces(driver);
    assert.equal(await portals.hideDefaultEquipment(camille), false);
    assert.equal(await portals.setHideDefaultEquipment(camille, true), true);
    assert.equal(await portals.hideDefaultEquipment(camille), true);
    assert.equal(await portals.hideDefaultEquipment(other), false);
    await portals.setHideDefaultEquipment(camille, false);
    assert.equal(await portals.hideDefaultEquipment(camille), false);
    await portals.close();
  },
);
