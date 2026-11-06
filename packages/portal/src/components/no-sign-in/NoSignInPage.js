import { message } from "portal/i18n.js";
import { noSignInCopyFor } from "./no-sign-in-copy.js";

/**
 * A page that needs a space, on a server that runs without a sign-in
 * (`page`: `"account"` or `"journal"`): its title and one sentence, no
 * button, no request to the private API.
 */
export function NoSignInPage({ locale = "en", page = "account" }) {
  const copy = noSignInCopyFor(locale);
  return (
    <main
      className="account-page no-sign-in-page"
      data-no-sign-in=""
      data-page={page}
    >
      <header className="account-header">
        <h1>
          {page === "journal"
            ? message(locale, "galleryJournal")
            : copy.account}
        </h1>
      </header>
      <section className="account-panel" role="status">
        <p className="account-muted">{copy.notice}</p>
      </section>
    </main>
  );
}
