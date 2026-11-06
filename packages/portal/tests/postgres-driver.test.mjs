import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresDriver,
  postgresPlaceholders,
} from "../dist/persistence/postgres-driver.js";

test("PostgreSQL placeholder rewriting preserves SQL literals and comments", () => {
  assert.equal(
    postgresPlaceholders(
      "SELECT '?', \"?\", $tag$?$tag$, value FROM entries WHERE first = ? -- ?\nAND second = ? /* ? */",
    ),
    "SELECT '?', \"?\", $tag$?$tag$, value FROM entries WHERE first = $1 -- ?\nAND second = $2 /* ? */",
  );
});

test(
  "PostgreSQL driver executes a portable query inside a transaction",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const driver = PostgresDriver.open(
      process.env.ASTRO_PORTAL_TEST_DATABASE_URL,
    );
    try {
      const value = await driver.transaction(async (transaction) => {
        const result = await transaction.query("SELECT ? AS value", ["ready"]);
        return result.rows[0]?.value;
      });
      assert.equal(value, "ready");
    } finally {
      await driver.close();
    }
  },
);
