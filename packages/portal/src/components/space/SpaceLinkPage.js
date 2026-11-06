"use client";

import { useEffect, useState } from "react";
import { parseSignInFragment } from "portal/spaces/link.js";
import { copyFor, linkCopy } from "./sign-in-copy.js";

/**
 * The page the link of the message opens when the application does not
 * — it shows the code, how long it stays valid, and
 * nothing else. It reads the fragment of its own address in the browser and
 * sends nothing to the service — no call, no session: a visit by a person
 * or by a mail scanner uses up nothing and opens nothing.
 */
export function SpaceLinkPage({ locale = "en" }) {
  const [link, setLink] = useState(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = parseSignInFragment(window.location.hash);
    setLink(read);
    // The page speaks the language the link carries, as the message did
    // (F-H3): the address of the page names none, so the server could only
    // guess it from the browser's cookie.
    if (read) document.documentElement.lang = read.lang;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return <SpaceLinkView link={link} locale={locale} now={now} />;
}

/**
 * The page as a function of what the fragment held (`undefined` before it is
 * read, `null` when it is not a sign-in link): the language of a link read is
 * the link's own (`lang`), the page's `locale` serving only before the
 * fragment is read and for a fragment that is not a link.
 */
export function SpaceLinkView({ link, locale = "en", now = Date.now() }) {
  const copy = copyFor(linkCopy, link ? link.lang : locale);
  const remaining = link ? Date.parse(link.expires) - now : 0;
  const minutes = Math.ceil(remaining / 60_000);
  const grouped = link ? `${link.code.slice(0, 3)} ${link.code.slice(3)}` : "";
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{copy.title}</h1>
        {link === undefined ? null : link === null ? (
          <p>{copy.incomplete}</p>
        ) : (
          <>
            <p>{copy.intro}</p>
            <p
              className="auth-link-code"
              aria-label={copy.codeLabel(link.code.split("").join(" "))}
            >
              {grouped}
            </p>
            <p className="auth-link-validity" role="status">
              {remaining > 0 ? copy.validFor(minutes) : copy.expired}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
