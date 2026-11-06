"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { shippedLocales } from "astro-contracts/locales";
import { resetPlannerBrowserCopy } from "./browser-copy.js";
import { errorPageCopyFor } from "./error-copy.js";

/**
 * The page of a page that failed while it drew, shown by the `error` file of
 * the application in place of the framework's « This page couldn’t load ».
 * The language is the first segment of the address, else English.
 * « Try again » reloads the page; « Reset this browser’s copy » -- behind a
 * warning of what it removes, in a zone of its own -- empties what the browser keeps for the
 * planner, then reloads: the way out of a page that dies on a value it saved.
 * The message of the error is shown in a closed « Technical detail » for
 * whoever reports it.
 */
export function ErrorPage({ error, locale: given }) {
  const pathname = usePathname() || "";
  const first = pathname.split("/")[1] || "";
  const locale = given || (shippedLocales().includes(first) ? first : "en");
  const copy = errorPageCopyFor(locale);
  const [confirming, setConfirming] = useState(false);
  const reload = () => window.location.reload();
  const reset = () => {
    try {
      resetPlannerBrowserCopy(window.localStorage);
    } catch {
      // Storage refused: the reload is all there is.
    }
    reload();
  };
  const detail = [error?.name, error?.message].filter(Boolean).join(": ");
  return (
    <main className="account-page not-found-page" data-page-error="">
      <section
        className="account-panel not-found-panel"
        aria-labelledby="page-error-title"
      >
        <h1 id="page-error-title">{copy.title}</h1>
        <p className="account-muted">{copy.body}</p>
        <div className="not-found-actions">
          <button type="button" className="btn-primary" onClick={reload}>
            {copy.retry}
          </button>
          <a className="btn-secondary" href={`/${locale}`}>
            {copy.home}
          </a>
        </div>
        <section
          className="not-found-reset"
          aria-label={copy.reset}
          data-page-error-reset=""
        >
          {confirming ? (
            <>
              <p className="account-muted">{copy.resetWarning}</p>
              <div className="not-found-actions">
                <button type="button" className="btn-primary" onClick={reset}>
                  {copy.resetConfirm}
                </button>
                <button
                  type="button"
                  className="btn-tertiary"
                  onClick={() => setConfirming(false)}
                >
                  {copy.cancel}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setConfirming(true)}
            >
              {copy.reset}
            </button>
          )}
        </section>
        {detail && (
          <details>
            <summary>{copy.detail}</summary>
            <p className="account-muted">
              <code>{detail}</code>
            </p>
          </details>
        )}
      </section>
    </main>
  );
}
