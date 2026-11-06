import assert from "node:assert/strict";
import test from "node:test";
import { postgresPoolOptions } from "../dist/persistence/postgres-driver.js";

// Several replicas share one PostgreSQL server; each process keeps a
// bounded pool and never waits forever for a connection.

test("the pool: 10 connections and a 10 s wait by default", () => {
  const options = postgresPoolOptions("postgres://u@h/d", {});
  assert.equal(options.connectionString, "postgres://u@h/d");
  assert.equal(options.max, 10);
  assert.equal(options.connectionTimeoutMillis, 10_000);
  assert.equal(options.idleTimeoutMillis, 30_000);
});

test("the pool: sized by the environment, nonsense ignored", () => {
  const options = postgresPoolOptions("postgres://u@h/d", {
    ASTRO_PORTAL_DATABASE_POOL_MAX: "3",
    ASTRO_PORTAL_DATABASE_CONNECT_TIMEOUT_MS: "2500",
  });
  assert.equal(options.max, 3);
  assert.equal(options.connectionTimeoutMillis, 2500);
  for (const max of ["0", "-1", "many", ""])
    assert.equal(
      postgresPoolOptions("x", { ASTRO_PORTAL_DATABASE_POOL_MAX: max }).max,
      10,
    );
});
