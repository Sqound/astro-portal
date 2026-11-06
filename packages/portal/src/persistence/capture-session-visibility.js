/**
 * The captures of a session deleted: while the session is in the trash (30
 * days, the soft deletion of a session), its captures are **masked** everywhere the service renders
 * them -- « Mes captures », the private and the public gallery, the routes of
 * a capture, the shares, the statistics -- and come back with the session when
 * it is restored; the erasure takes them with it
 * (`session-trash-repository.js`, which reads them unmasked on purpose).
 *
 * One rule, one fragment of SQL, so that no reader writes its own. A capture
 * with no session is never masked.
 */

/**
 * The condition « the session of this capture is not in the trash », for a
 * table or an alias that exposes `session_id` and `tenant_id` (`captures` by
 * default). True for a capture without a session.
 */
export function captureSessionLiveSql(alias = "captures") {
  return `NOT EXISTS (
    SELECT 1 FROM observation_sessions hidden_session
    WHERE hidden_session.id = ${alias}.session_id
      AND hidden_session.tenant_id = ${alias}.tenant_id
      AND hidden_session.deleted_at IS NOT NULL
  )`;
}
