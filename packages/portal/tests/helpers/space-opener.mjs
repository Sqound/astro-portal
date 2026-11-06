import { randomUUID } from "node:crypto";

/**
 * A minimal `openSpace` for the tests of the core's seams
 * (`openSpacePolicy({ openSpace })`): what a composition that opens spaces
 * brings, reduced to the three rows that make a space.
 */
export async function testOpenSpace(
  transaction,
  { email, timestamp, language = null },
) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await transaction.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, email, timestamp],
  );
  await transaction.run(
    "INSERT INTO users (id, email, password_hash, created_at, language) VALUES (?, ?, NULL, ?, ?)",
    [userId, email, timestamp, language],
  );
  await transaction.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, timestamp],
  );
  return { tenantId, userId };
}
