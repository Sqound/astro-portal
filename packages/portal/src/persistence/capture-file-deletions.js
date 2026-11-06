/**
 * The deletion of a capture's files, kept as a task until it is done
 * (`capture_file_deletions`, migration 110).
 *
 * The rows of a capture, of an image or of a replaced image are deleted in a
 * transaction; the files (the original, the thumbnail, the shared copy) are
 * deleted afterwards in the capture store, which is another system (a disk, a
 * Blob container) and may not answer. So the task is written **in the same
 * transaction** as the rows it follows (`recordFileDeletions`): a rollback
 * leaves no task, a commit always leaves one. After the transaction the
 * caller tries it at once (`attempt`); the task that cannot be done stays, and
 * the hourly maintenance (`replay`) tries it again, a longer time after each
 * failure, until the store answers. A failure is logged, never thrown: the
 * capture is gone for the person whatever the store does.
 *
 * Two guards keep a late task from deleting what is wanted again. A digest
 * that an image of the space holds again (the same bytes sent after the
 * deletion) cancels the task; one an upload in progress is about to publish
 * defers it. The files are named by their digest alone, so both are the
 * rule, not a rarity.
 */

const SHA256 = /^[0-9a-f]{64}$/;

/** `all`: the original and every derived file; `derived`: the derived files. */
export const FILE_DELETION_SCOPES = Object.freeze({
  all: "all",
  derived: "derived",
});

const MINUTE_MS = 60 * 1000;
/** The first retry comes five minutes after a failure. */
export const FILE_DELETION_FIRST_DELAY_MS = 5 * MINUTE_MS;
/** No retry waits longer than six hours. */
export const FILE_DELETION_LONGEST_DELAY_MS = 6 * 60 * MINUTE_MS;
/** A task deferred for an upload in progress is looked at again an hour on. */
export const FILE_DELETION_DEFER_MS = 60 * MINUTE_MS;

/** The wait after the `attempts`-th failure: 5 min, 10, 20, … up to 6 h. */
export function fileDeletionDelayMs(attempts) {
  const count = Math.max(1, Math.trunc(Number(attempts)) || 1);
  return Math.min(
    FILE_DELETION_LONGEST_DELAY_MS,
    FILE_DELETION_FIRST_DELAY_MS * 2 ** Math.min(count - 1, 16),
  );
}

const iso = (value) =>
  (value instanceof Date ? value : new Date(value)).toISOString();

/**
 * Writes the tasks of these digests (`executor` is a transaction, or the
 * driver): one per space, digest and scope, an existing one is kept. Anything
 * that is not a digest (the placeholder of a capture without an image) is
 * left out. Answers how many digests were named.
 */
export async function recordFileDeletions(
  executor,
  { tenantId, digests, scope = FILE_DELETION_SCOPES.all, at = new Date() },
) {
  if (!Object.values(FILE_DELETION_SCOPES).includes(scope))
    throw new Error(`"${scope}" is not a scope of file deletion.`);
  const wanted = [
    ...new Set([...digests].filter((d) => SHA256.test(String(d ?? "")))),
  ];
  const stamp = iso(at);
  for (const sha256 of wanted)
    await executor.run(
      `INSERT INTO capture_file_deletions
         (id, tenant_id, sha256, scope, created_at, attempts, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT DO NOTHING`,
      [`${scope}:${tenantId}:${sha256}`, tenantId, sha256, scope, stamp, stamp],
    );
  return wanted.length;
}

const resource = (row) => ({
  id: String(row.id),
  tenantId: String(row.tenant_id),
  sha256: String(row.sha256),
  scope: String(row.scope),
  createdAt: String(row.created_at),
  attempts: Number(row.attempts),
  nextAttemptAt: String(row.next_attempt_at),
  lastError: row.last_error ?? null,
});

/**
 * The runner of the tasks. `db` is the driver; `files` a function answering
 * the capture store (read at each use, like the services that own it);
 * `log(level, event, message, context)` receives what happened; `clock()` is
 * the current time.
 */
export function createFileDeletionRunner({
  db,
  files,
  log = () => {},
  clock = () => new Date(),
}) {
  if (!db) throw new Error("The file deletions need a database.");
  const store = typeof files === "function" ? files : () => files;
  const report = (level, event, message, context) => {
    try {
      log(level, event, message, context);
    } catch {
      // Logging never stops the deletions.
    }
  };

  const held = async (task) => {
    for (const table of ["capture_variants", "captures"]) {
      const row = (
        await db.query(
          `SELECT 1 AS found FROM ${table} WHERE tenant_id = ? AND sha256 = ? LIMIT 1`,
          [task.tenantId, task.sha256],
        )
      ).rows[0];
      if (row) return "image";
    }
    const upload = (
      await db.query(
        "SELECT 1 AS found FROM upload_sessions WHERE tenant_id = ? AND sha256 = ? AND state <> 'completed' LIMIT 1",
        [task.tenantId, task.sha256],
      )
    ).rows[0];
    return upload ? "upload" : null;
  };

  const forget = (task) =>
    db.run("DELETE FROM capture_file_deletions WHERE id = ?", [task.id]);

  /** Does one task: `done`, `cancelled`, `deferred` or `failed`. */
  async function execute(task) {
    const at = clock();
    const context = {
      tenantId: task.tenantId,
      sha256: task.sha256,
      scope: task.scope,
      attempts: task.attempts,
    };
    try {
      const holder = await held(task);
      if (holder === "image") {
        await forget(task);
        report(
          "info",
          "captures.files.deletion_cancelled",
          "The files were not deleted: an image holds these bytes again.",
          context,
        );
        return "cancelled";
      }
      if (holder === "upload") {
        await db.run(
          "UPDATE capture_file_deletions SET next_attempt_at = ? WHERE id = ?",
          [iso(at.getTime() + FILE_DELETION_DEFER_MS), task.id],
        );
        return "deferred";
      }
      await store().remove({
        tenantId: task.tenantId,
        sha256: task.sha256,
        file: task.scope === FILE_DELETION_SCOPES.derived ? "derived" : null,
      });
      await forget(task);
      if (task.attempts > 0)
        report(
          "info",
          "captures.files.deleted_again",
          `Files left by a failed deletion were deleted at attempt ${task.attempts + 1}.`,
          context,
        );
      return "done";
    } catch (error) {
      const attempts = task.attempts + 1;
      const message = String(error?.message || error).slice(0, 500);
      report(
        "warning",
        "captures.files.deletion_failed",
        `The files of a deleted image could not be deleted yet (attempt ${attempts}); they will be tried again.`,
        { ...context, attempts, reason: message },
      );
      try {
        await db.run(
          `UPDATE capture_file_deletions
           SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`,
          [
            attempts,
            message,
            iso(at.getTime() + fileDeletionDelayMs(attempts)),
            task.id,
          ],
        );
      } catch {
        // The task stays as it was: the next pass tries it again.
      }
      return "failed";
    }
  }

  async function runAll(tasks) {
    const outcome = { done: 0, cancelled: 0, deferred: 0, failed: 0 };
    for (const task of tasks) outcome[await execute(task)] += 1;
    return outcome;
  }

  return {
    /**
     * Tries the tasks of these digests at once, whatever their schedule —
     * the gesture that just recorded them. Never throws.
     */
    async attempt({ tenantId, digests, scope = FILE_DELETION_SCOPES.all }) {
      try {
        const wanted = [...new Set([...digests])].filter((d) =>
          SHA256.test(String(d ?? "")),
        );
        const tasks = [];
        for (const sha256 of wanted) {
          const row = (
            await db.query(
              "SELECT * FROM capture_file_deletions WHERE tenant_id = ? AND sha256 = ? AND scope = ?",
              [tenantId, sha256, scope],
            )
          ).rows[0];
          if (row) tasks.push(resource(row));
        }
        return await runAll(tasks);
      } catch (error) {
        report(
          "warning",
          "captures.files.deletion_failed",
          "The deletion of files could not be attempted; it stays recorded.",
          { tenantId, reason: String(error?.message || error).slice(0, 500) },
        );
        return { done: 0, cancelled: 0, deferred: 0, failed: 0 };
      }
    },

    /**
     * The hourly pass: the tasks that are due (`at` or now), oldest first,
     * at most `limit`; with `tenantId` those of one space, and with `force`
     * every task of the selection whatever its schedule. Never throws.
     * Answers what was done, and how many tasks remain.
     */
    async replay({
      at = clock(),
      tenantId = null,
      limit = 200,
      force = false,
    } = {}) {
      try {
        const clauses = [];
        const parameters = [];
        if (!force) {
          clauses.push("next_attempt_at <= ?");
          parameters.push(iso(at));
        }
        if (tenantId) {
          clauses.push("tenant_id = ?");
          parameters.push(tenantId);
        }
        const rows = (
          await db.query(
            `SELECT * FROM capture_file_deletions
             ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
             ORDER BY created_at ASC, id ASC LIMIT ?`,
            [...parameters, Math.max(1, Math.trunc(Number(limit)) || 200)],
          )
        ).rows.map(resource);
        const outcome = await runAll(rows);
        const remaining = Number(
          (
            await db.query(
              "SELECT COUNT(*) AS count FROM capture_file_deletions",
            )
          ).rows[0]?.count ?? 0,
        );
        return { ...outcome, remaining };
      } catch (error) {
        report(
          "warning",
          "captures.files.deletion_failed",
          "The pending deletions of files could not be read.",
          { reason: String(error?.message || error).slice(0, 500) },
        );
        return { done: 0, cancelled: 0, deferred: 0, failed: 0, remaining: 0 };
      }
    },

    /**
     * Records the task of files nothing holds (outside any transaction: the
     * rows they followed are gone already) and tries it at once — the
     * derived files written for an image deleted while it was processed.
     * Never throws.
     */
    async discard({ tenantId, digests, scope = FILE_DELETION_SCOPES.all }) {
      try {
        await recordFileDeletions(db, {
          tenantId,
          digests,
          scope,
          at: clock(),
        });
      } catch (error) {
        report(
          "warning",
          "captures.files.deletion_failed",
          "A deletion of files could not be recorded.",
          { tenantId, reason: String(error?.message || error).slice(0, 500) },
        );
        return { done: 0, cancelled: 0, deferred: 0, failed: 0 };
      }
      return await this.attempt({ tenantId, digests, scope });
    },

    /** The tasks that wait, oldest first (a space's, or every space's). */
    async pending({ tenantId = null } = {}) {
      return (
        await db.query(
          `SELECT * FROM capture_file_deletions
           ${tenantId ? "WHERE tenant_id = ?" : ""}
           ORDER BY created_at ASC, id ASC`,
          tenantId ? [tenantId] : [],
        )
      ).rows.map(resource);
    },
  };
}
