"use client";

import { message } from "portal/i18n.js";

// The page of a session that could not be read: the storage did not answer,
// which is not « not found ». One sentence and « Réessayer » (a secondary:
// the action of a zone without a primary), the way back to the Journal a
// link.
export function SessionReadFailed({ locale = "en" }) {
  return (
    <main className="debrief-session-detail night-detail session-page">
      <a className="btn-link debrief-back" href={`/${locale}/sessions`}>
        {message(locale, "debriefSessionDetailBack")}
      </a>
      <section className="night-card session-read-failed" role="alert">
        <p>{message(locale, "sessionPageReadFailed")}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.location.reload()}
          >
            {message(locale, "sessionPageReadRetry")}
          </button>
        </div>
      </section>
    </main>
  );
}
