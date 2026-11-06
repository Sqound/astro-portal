"use client";

import { usePathname } from "next/navigation";
import { shippedLocales } from "astro-contracts/locales";
import { notFoundCopyFor } from "./not-found-copy.js";

/**
 * The page of an address that leads nowhere, drawn by the `not-found` file of
 * the application. A `not-found` page receives no parameters: the language is
 * the first segment of the address (`/fr/…`), else the visitor's last choice
 * (`fallbackLocale`, read from the language cookie on the server). The page
 * is the app's own (header and footer around it, the panel's surface), with
 * one link back to the home page.
 */
export function NotFoundPage({ fallbackLocale = "en" }) {
  const pathname = usePathname() || "";
  const first = pathname.split("/")[1] || "";
  const locale = shippedLocales().includes(first) ? first : fallbackLocale;
  const copy = notFoundCopyFor(locale);
  return (
    <main className="account-page not-found-page" data-not-found="">
      <section
        className="account-panel not-found-panel"
        aria-labelledby="not-found-title"
      >
        <h1 id="not-found-title">{copy.title}</h1>
        <p className="account-muted">{copy.body}</p>
        <a className="btn-primary" href={`/${locale}`}>
          {copy.home}
        </a>
      </section>
    </main>
  );
}
