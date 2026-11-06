import { withSerializedSqliteRetry } from "../persistence/db-transaction-retry.js";

/**
 * The reads and writes of the sign-in by e-mail code, on the one process
 * driver (plain functions taking an open `driver`, portable `?`
 * placeholders — the convention of the other repositories). The tables are
 * the core's migrations 29 to 32 and 41. The same counters serve the
 * sign-in by password of a private server (auth/password-sign-in.js).
 *
 * Every limit is reserved before the work it limits, by one statement that
 * checks and counts at once (a conditional UPDATE or upsert), or, for a
 * message, inside a transaction that takes `sign_in_send_guard` first:
 * requests that arrive together can never all find room under a limit.
 */

const iso = (date) => new Date(date).toISOString();
const first = (result) => result.rows[0] || null;
const number = (value) => Number(value || 0);
const text = (value) => (value ? String(value) : null);

/**
 * `:name` markers become `?` placeholders, their values collected in the
 * order they appear, so that a statement naming a value twice stays
 * readable.
 */
function bind(template, values) {
  const params = [];
  const sql = template.replace(/:([A-Za-z]+)/g, (_, name) => {
    if (!(name in values)) throw new Error(`No value for :${name}.`);
    params.push(values[name]);
    return "?";
  });
  return [sql, params];
}

function uniqueViolation(error) {
  return (
    error?.code === "23505" ||
    /UNIQUE constraint failed/i.test(String(error?.message || ""))
  );
}

// ——— Codes ———

/** The tables whose rows are the messages of the e-mail budget, by default. */
export const MAIL_BUDGET_TABLES = Object.freeze(["sign_in_codes"]);

/**
 * The e-mail budget of the whole service, read over the messages reserved
 * within the hour: how many this hour and this minute, and since when.
 * `tables` names every table of the service whose rows are such messages
 * (each with a `created_at`): the sign-in's codes, and those of any other
 * message a composition sends within the same budget. Every reserved row
 * counts, sent or not yet.
 */
export async function mailBudgetState(
  driver,
  { now, hourMs, minuteMs, tables = MAIL_BUDGET_TABLES },
) {
  if (!tables.length || tables.some((table) => !/^[a-z_]+$/.test(table)))
    throw new Error("The e-mail budget needs the names of its tables.");
  const hourAgo = iso(new Date(now).getTime() - hourMs);
  const minuteAgo = iso(new Date(now).getTime() - minuteMs);
  const row =
    first(
      await driver.query(
        `SELECT
           COUNT(*) AS hour_count,
           MIN(created_at) AS hour_oldest,
           SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS minute_count,
           MIN(CASE WHEN created_at > ? THEN created_at END) AS minute_oldest
         FROM (${tables
           .map(
             (table) => `SELECT created_at FROM ${table} WHERE created_at > ?`,
           )
           .join(" UNION ALL ")}) AS messages`,
        [minuteAgo, minuteAgo, ...tables.map(() => hourAgo)],
      ),
    ) || {};
  return {
    hour: { count: number(row.hour_count), oldest: text(row.hour_oldest) },
    minute: {
      count: number(row.minute_count),
      oldest: text(row.minute_oldest),
    },
  };
}

/**
 * What limits a new message, read over the codes reserved within the hour
 * (the limits' longest window): for the whole service (`mailBudgetState`
 * over `budgetTables`), the address and the network origin, how many and
 * since when. Every reserved row counts, sent or not yet; a row whose
 * message failed was deleted.
 */
export async function sendingState(
  driver,
  {
    email,
    originHash,
    now,
    hourMs,
    minuteMs,
    budgetTables = MAIL_BUDGET_TABLES,
  },
) {
  const [sql, params] = bind(
    `SELECT
       SUM(CASE WHEN email = :email THEN 1 ELSE 0 END) AS address_count,
       MIN(CASE WHEN email = :email THEN created_at END) AS address_oldest,
       MAX(CASE WHEN email = :email THEN created_at END) AS address_latest,
       SUM(CASE WHEN origin_hash = :originHash THEN 1 ELSE 0 END) AS origin_count,
       MIN(CASE WHEN origin_hash = :originHash THEN created_at END) AS origin_oldest
     FROM sign_in_codes WHERE created_at > :hourAgo`,
    {
      hourAgo: iso(new Date(now).getTime() - hourMs),
      email,
      originHash,
    },
  );
  const row = first(await driver.query(sql, params)) || {};
  return {
    service: await mailBudgetState(driver, {
      now,
      hourMs,
      minuteMs,
      tables: budgetTables,
    }),
    address: {
      count: number(row.address_count),
      oldest: text(row.address_oldest),
      latest: text(row.address_latest),
    },
    origin: {
      count: number(row.origin_count),
      oldest: text(row.origin_oldest),
    },
  };
}

/**
 * The guard row every reservation of a message updates first, inside its
 * transaction: on PostgreSQL its row lock makes the reservations take
 * turns, whichever kind of message they reserve.
 */
export async function takeSendGuard(transaction, reservedAt) {
  await transaction.run(
    `INSERT INTO sign_in_send_guard (id, reserved_at) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET reserved_at = excluded.reserved_at`,
    [iso(reservedAt)],
  );
}

/**
 * Reserves the row of a new message, or says why not. In one transaction:
 * the guard row first (PostgreSQL makes every other reservation wait for
 * this one there), then `refusalOf(sendingState)`; a refusal writes
 * nothing, otherwise the pending row is inserted (`sent_at` NULL) and
 * counts from then on.
 */
export async function reservePendingCode(
  driver,
  row,
  { hourMs, minuteMs, budgetTables = MAIL_BUDGET_TABLES },
  refusalOf,
) {
  return await withSerializedSqliteRetry(driver, async (transaction) => {
    await takeSendGuard(transaction, row.createdAt);
    const refusal = refusalOf(
      await sendingState(transaction, {
        email: row.email,
        originHash: row.originHash,
        now: row.createdAt,
        hourMs,
        minuteMs,
        budgetTables,
      }),
    );
    if (refusal) return { refusal };
    await transaction.run(
      `INSERT INTO sign_in_codes
         (id, email, code_hash, link_token_hash, language, origin_hash, created_at, sent_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        row.id,
        row.email,
        row.codeHash,
        row.linkTokenHash,
        row.language,
        row.originHash,
        row.createdAt,
        row.expiresAt,
      ],
    );
    return { refusal: null };
  });
}

/** A message that failed: the row goes, nothing was counted. */
export async function deletePendingCode(driver, id) {
  await driver.run(
    "DELETE FROM sign_in_codes WHERE id = ? AND sent_at IS NULL",
    [id],
  );
}

/**
 * The message left: the row becomes the address's one valid code, and
 * every earlier code of the address stops being valid.
 */
export async function markCodeSent(driver, { id, email, sentAt }) {
  await withSerializedSqliteRetry(driver, async (transaction) => {
    await transaction.run(
      `UPDATE sign_in_codes SET voided_at = ?
       WHERE email = ? AND id <> ? AND consumed_at IS NULL AND voided_at IS NULL`,
      [sentAt, email, id],
    );
    await transaction.run("UPDATE sign_in_codes SET sent_at = ? WHERE id = ?", [
      sentAt,
      id,
    ]);
  });
}

/**
 * The address's valid code: sent, not used, not voided, not expired, and
 * not yet compared `maxAttempts` times.
 */
export async function validCodeForEmail(driver, email, now, maxAttempts) {
  return first(
    await driver.query(
      `SELECT * FROM sign_in_codes
       WHERE email = ? AND sent_at IS NOT NULL AND consumed_at IS NULL
         AND voided_at IS NULL AND expires_at > ? AND attempts < ?
       ORDER BY sent_at DESC, id DESC LIMIT 1`,
      [email, iso(now), maxAttempts],
    ),
  );
}

/**
 * Reserves one comparison of a code, before it is made: the number of this
 * comparison (1 to `maxAttempts`), or `null` when the code may no longer be
 * compared (used, voided, expired, or compared `maxAttempts` times). One
 * statement, so that parallel verifications cannot pass it together.
 */
export async function reserveCodeAttempt(driver, { codeId, now, maxAttempts }) {
  const row = first(
    await driver.query(
      `UPDATE sign_in_codes SET attempts = attempts + 1
       WHERE id = ? AND attempts < ? AND sent_at IS NOT NULL
         AND consumed_at IS NULL AND voided_at IS NULL AND expires_at > ?
       RETURNING attempts`,
      [codeId, maxAttempts, iso(now)],
    ),
  );
  return row ? Number(row.attempts) : null;
}

export async function codeByLinkDigest(driver, linkTokenHash) {
  return first(
    await driver.query(
      "SELECT * FROM sign_in_codes WHERE link_token_hash = ? AND sent_at IS NOT NULL",
      [linkTokenHash],
    ),
  );
}

/**
 * Forgets codes a day past their expiry, and counters that no longer
 * count: no failure within the last day and no lock that ended within it
 * (a lock that ended less than a day ago still makes the next one longer).
 */
export async function purgeOldCodes(driver, now) {
  const dayAgo = iso(new Date(now).getTime() - 24 * 3600_000);
  await driver.run("DELETE FROM sign_in_codes WHERE expires_at < ?", [dayAgo]);
  await driver.run(
    `DELETE FROM sign_in_throttles
     WHERE (locked_until IS NULL OR locked_until < ?)
       AND (window_started_at IS NULL OR window_started_at < ?)`,
    [dayAgo, dayAgo],
  );
}

// ——— Throttles ———

export async function throttleOf(driver, subjectHash) {
  return first(
    await driver.query(
      "SELECT * FROM sign_in_throttles WHERE subject_hash = ?",
      [subjectHash],
    ),
  );
}

// A window starts at its first failure and lasts `windowMs`; a failure
// after it starts a new one.
const FRESH_WINDOW = `(sign_in_throttles.window_started_at IS NULL
  OR sign_in_throttles.window_started_at <= :windowOpen)`;

/**
 * Counts one failure for a subject before the attempt it stands for, if
 * the subject's window still has room (fewer than `limit` failures): the
 * count and the start of its window (to give the failure back), or
 * `reserved: false`.
 */
export async function reserveFailure(
  driver,
  subjectHash,
  { now, windowMs, limit },
) {
  const [sql, params] = bind(
    `INSERT INTO sign_in_throttles
       (subject_hash, failures, window_started_at, locked_until, lock_level, updated_at)
     VALUES (:subject, 1, :now, NULL, 0, :now)
     ON CONFLICT (subject_hash) DO UPDATE SET
       failures = CASE WHEN ${FRESH_WINDOW} THEN 1
         ELSE sign_in_throttles.failures + 1 END,
       window_started_at = CASE WHEN ${FRESH_WINDOW}
         THEN excluded.window_started_at
         ELSE sign_in_throttles.window_started_at END,
       updated_at = excluded.updated_at
     WHERE ${FRESH_WINDOW} OR sign_in_throttles.failures < :limit
     RETURNING failures, window_started_at`,
    {
      subject: subjectHash,
      now: iso(now),
      windowOpen: iso(new Date(now).getTime() - windowMs),
      limit,
    },
  );
  const row = first(await driver.query(sql, params));
  return row
    ? {
        reserved: true,
        failures: Number(row.failures),
        windowStartedAt: String(row.window_started_at),
      }
    : { reserved: false };
}

/** Gives back a failure reserved in the window that started at `windowStartedAt`. */
export async function releaseFailure(driver, subjectHash, windowStartedAt) {
  await driver.run(
    `UPDATE sign_in_throttles SET failures = failures - 1
     WHERE subject_hash = ? AND window_started_at = ? AND failures > 0`,
    [subjectHash, windowStartedAt],
  );
}

/**
 * The same for a subject that locks: refused while it is locked; the
 * failure that reaches `limit` locks it at once, for `lockSteps[0]`, or the
 * next step when its previous lock ended less than `recidivismMs` before
 * (the last step repeats). The failure count, and `lockedUntil` when this
 * failure locked it; `reserved: false` otherwise. `addressHash`, the keyed
 * digest of the address the subject counts failures of, is kept on the row
 * so that the deletion of a space finds it.
 */
export async function reserveLockingFailure(
  driver,
  subjectHash,
  { now, windowMs, limit, lockSteps, recidivismMs, addressHash },
) {
  if (limit < 2 || lockSteps.length !== 3)
    throw new Error(
      "A locking failure needs a limit of 2 or more and three steps.",
    );
  const nowMs = new Date(now).getTime();
  const reaching = `(CASE WHEN ${FRESH_WINDOW} THEN 1
    ELSE sign_in_throttles.failures + 1 END) >= :limit`;
  const level = `(CASE WHEN sign_in_throttles.locked_until IS NOT NULL
      AND sign_in_throttles.locked_until > :recidivismSince
    THEN (CASE WHEN sign_in_throttles.lock_level >= 3 THEN 3
      ELSE sign_in_throttles.lock_level + 1 END)
    ELSE 1 END)`;
  const [sql, params] = bind(
    `INSERT INTO sign_in_throttles
       (subject_hash, failures, window_started_at, locked_until, lock_level, address_hash, updated_at)
     VALUES (:subject, 1, :now, NULL, 0, :addressHash, :now)
     ON CONFLICT (subject_hash) DO UPDATE SET
       failures = CASE WHEN ${FRESH_WINDOW} THEN 1
         ELSE sign_in_throttles.failures + 1 END,
       window_started_at = CASE WHEN ${reaching} THEN NULL
         WHEN ${FRESH_WINDOW} THEN excluded.window_started_at
         ELSE sign_in_throttles.window_started_at END,
       lock_level = CASE WHEN ${reaching} THEN ${level}
         ELSE sign_in_throttles.lock_level END,
       locked_until = CASE WHEN ${reaching} THEN
           (CASE ${level} WHEN 1 THEN :lockOne WHEN 2 THEN :lockTwo
             ELSE :lockThree END)
         ELSE sign_in_throttles.locked_until END,
       updated_at = excluded.updated_at
     WHERE (sign_in_throttles.locked_until IS NULL
         OR sign_in_throttles.locked_until <= :now)
       AND (${FRESH_WINDOW} OR sign_in_throttles.failures < :limit)
     RETURNING failures, locked_until`,
    {
      subject: subjectHash,
      addressHash,
      now: iso(now),
      windowOpen: iso(nowMs - windowMs),
      limit,
      recidivismSince: iso(nowMs - recidivismMs),
      lockOne: iso(nowMs + lockSteps[0]),
      lockTwo: iso(nowMs + lockSteps[1]),
      lockThree: iso(nowMs + lockSteps[2]),
    },
  );
  const row = first(await driver.query(sql, params));
  if (!row) return { reserved: false };
  const lockedUntil = text(row.locked_until);
  return {
    reserved: true,
    failures: Number(row.failures),
    lockedUntil: lockedUntil && lockedUntil > iso(now) ? lockedUntil : null,
  };
}

/** A success: the subject's failures, its lock and their history are forgotten. */
export async function clearFailures(driver, subjectHash, now) {
  await driver.run(
    `UPDATE sign_in_throttles
     SET failures = 0, window_started_at = NULL, locked_until = NULL,
         lock_level = 0, updated_at = ?
     WHERE subject_hash = ?`,
    [iso(now), subjectHash],
  );
}

// ——— Spaces ———

/**
 * Uses up a code and, when its address has no space yet and the composition
 * can open one (`openSpace`), creates the space in the same transaction.
 * `null` when the code was used or voided meanwhile (a concurrent
 * verification won): nothing is created then. Two verifications
 * racing for the same new address create one space: the second finds the
 * code used, and a unique address makes a second person impossible (the
 * whole transaction is retried once after such a conflict).
 *
 * `comparedAtMost`: a code typed by the person is used up only if one of
 * its comparisons was reserved (`attempts` between 1 and this number); a
 * link, which is not compared, passes `null`.
 *
 * `openSpace(transaction, { email, timestamp, language })` is the way a
 * composition that opens spaces writes one — organisation, person,
 * membership — and answers `{ tenantId, userId }`. The core holds none: a
 * private server has one person, created at its installation. Without it an
 * address without a space opens nothing; the transaction is undone, the
 * code stays unused, and the caller is refused with `not_owner`.
 */
export async function consumeCodeAndOpenSpace(
  driver,
  {
    codeId,
    email,
    now,
    language = null,
    comparedAtMost = null,
    openSpace = null,
  },
) {
  const timestamp = iso(now);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withSerializedSqliteRetry(driver, async (transaction) => {
        // `codeId: null`: a fixed code (`policy.fixedCode` of the sign-in),
        // proven by the caller, which is no row to use up.
        if (codeId !== null) {
          const consumed = await transaction.run(
            `UPDATE sign_in_codes SET consumed_at = ?
             WHERE id = ? AND consumed_at IS NULL AND voided_at IS NULL AND expires_at > ?${
               comparedAtMost === null
                 ? ""
                 : " AND attempts >= 1 AND attempts <= ?"
             }`,
            comparedAtMost === null
              ? [timestamp, codeId, timestamp]
              : [timestamp, codeId, timestamp, comparedAtMost],
          );
          if (consumed.rowCount !== 1) return null;
        }
        const findExisting = async () =>
          first(
            await transaction.query(
              `SELECT users.id AS user_id, memberships.tenant_id AS tenant_id
               FROM users
               JOIN memberships ON memberships.user_id = users.id
               WHERE users.email = ? AND users.disabled_at IS NULL
               ORDER BY memberships.created_at LIMIT 1`,
              [email],
            ),
          );
        let existing = await findExisting();
        const openExisting = async () => {
          // The language of the space's messages follows its last sign-in.
          if (language)
            await transaction.run(
              "UPDATE users SET language = ? WHERE id = ?",
              [language, String(existing.user_id)],
            );
          return {
            tenantId: String(existing.tenant_id),
            userId: String(existing.user_id),
            created: false,
          };
        };
        if (existing) return await openExisting();
        if (!openSpace)
          throw Object.assign(
            new Error("This portal belongs to someone else."),
            { code: "not_owner" },
          );
        const known = first(
          await transaction.query("SELECT id FROM users WHERE email = ?", [
            email,
          ]),
        );
        if (known) {
          // A concurrent verification of the same new address may have
          // committed its space between the two reads above (PostgreSQL reads
          // what is committed at each statement): the space is there now, and
          // this verification opens it.
          existing = await findExisting();
          if (existing) return await openExisting();
          // A disabled person, or a person without membership: no space
          // can be opened with this address.
          throw Object.assign(new Error("This address cannot open a space."), {
            code: "space_unavailable",
          });
        }
        const opened = await openSpace(transaction, {
          email,
          timestamp,
          language,
        });
        return { ...opened, created: true };
      });
    } catch (error) {
      if (attempt < 2 && uniqueViolation(error)) continue;
      throw error;
    }
  }
}

export async function serviceRoleOf(driver, userId) {
  const row = first(
    await driver.query(
      "SELECT service_role FROM users WHERE id = ? AND disabled_at IS NULL",
      [userId],
    ),
  );
  return row?.service_role ? String(row.service_role) : null;
}

export async function emailOf(driver, userId) {
  const row = first(
    await driver.query("SELECT email FROM users WHERE id = ?", [userId]),
  );
  return row?.email ? String(row.email) : null;
}

export async function countSpacesOf(driver, email) {
  const row = first(
    await driver.query(
      `SELECT COUNT(*) AS count FROM memberships
       JOIN users ON users.id = memberships.user_id
       WHERE users.email = ?`,
      [email],
    ),
  );
  return Number(row?.count || 0);
}

// ——— A private server ———

/**
 * The owner of a private server: its one active person with the `owner`
 * membership (the first one, should a database hold more). `null` before
 * the installation, or once that person is disabled.
 */
export async function portalOwner(driver) {
  const row = first(
    await driver.query(
      `SELECT users.id AS user_id, users.email AS email,
              memberships.tenant_id AS tenant_id
       FROM users
       JOIN memberships ON memberships.user_id = users.id
       WHERE users.disabled_at IS NULL AND memberships.role = 'owner'
       ORDER BY memberships.created_at LIMIT 1`,
    ),
  );
  return row
    ? {
        userId: String(row.user_id),
        tenantId: String(row.tenant_id),
        email: String(row.email),
      }
    : null;
}

export async function countUsers(driver) {
  return number(
    first(await driver.query("SELECT COUNT(*) AS count FROM users"))?.count,
  );
}

/**
 * Uses up a proven code and runs `work(transaction)` in the same
 * transaction: the installation of a private server creates its account
 * with the use of its first code. `null`, and nothing written, when the
 * code was used or voided meanwhile.
 */
export async function consumeCodeWithin(
  driver,
  { codeId, now, comparedAtMost = null },
  work,
) {
  const timestamp = iso(now);
  return await withSerializedSqliteRetry(driver, async (transaction) => {
    const consumed = await transaction.run(
      `UPDATE sign_in_codes SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL AND voided_at IS NULL AND expires_at > ?${
         comparedAtMost === null ? "" : " AND attempts >= 1 AND attempts <= ?"
       }`,
      comparedAtMost === null
        ? [timestamp, codeId, timestamp]
        : [timestamp, codeId, timestamp, comparedAtMost],
    );
    if (consumed.rowCount !== 1) return null;
    return await work(transaction);
  });
}
