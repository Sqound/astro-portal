const SQLITE_NESTED_TRANSACTION_MESSAGE =
  "Nested database transactions are not supported.";

/**
 * Retries an arbitrary async call when it fails only because another call
 * already holds this process's single SqliteDriver instance's transaction
 * slot (packages/portal/src/persistence/sqlite-driver.ts: at most one
 * JS-level `.transaction()` call may be in flight at a time on one driver
 * instance — an intentional re-entrancy guard against a bug that opens a
 * transaction from inside another. Because every v1 repository shares ONE
 * process-owned driver (persistence/database.ts, `databaseDriver()`), that
 * same guard also fires for two logically UNRELATED concurrent requests that
 * happen to race on it, which is the case this wrapper exists for).
 *
 * `thunk` is called with no arguments and may itself call `driver.transaction`
 * one or more times sequentially (as `debriefRepository.decide()` does: its
 * own `catchUpNightBounds()` call, then its own decision transaction) — the
 * retry wraps the WHOLE call, not just its last transaction, because the
 * nested-transaction race can just as well land on the first one.
 *
 * PostgresDriver hands each `.transaction()` call its own pooled client
 * (postgres-driver.ts) and never throws this message, so on PostgreSQL this
 * wrapper's loop body always succeeds on the first attempt and is otherwise
 * a no-op; concurrency there is instead resolved by ordinary row-lock
 * blocking on the claim UPDATE inside the transaction itself.
 *
 * This is a narrow, local mitigation scoped to the debriefing routes this
 * task adds a hard concurrency guarantee for (the debriefing decision, a
 * supplement decision). It does not change sqlite-driver.ts itself — every
 * OTHER repository in this codebase still calls `driver.transaction()` the
 * same unprotected way and remains equally exposed to this race under real
 * concurrent load on SQLite; that is a pre-existing, wider gap and is
 * flagged separately rather than fixed here.
 */
export async function retryOnSqliteNestedTransaction(
  thunk,
  { retries = 500, delayMs = 2 } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await thunk();
    } catch (error) {
      if (
        attempt >= retries ||
        error?.message !== SQLITE_NESTED_TRANSACTION_MESSAGE
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** `retryOnSqliteNestedTransaction` specialized to `driver.transaction(fn)`. */
export async function withSerializedSqliteRetry(driver, fn, options) {
  return await retryOnSqliteNestedTransaction(
    () => driver.transaction(fn),
    options,
  );
}
