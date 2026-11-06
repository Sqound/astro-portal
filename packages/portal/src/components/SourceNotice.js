"use client";

import { copyFor } from "astro-contracts/locales";
import { usePathname } from "next/navigation";
import {
  isFullViewportPath,
  showsBuildIdentity,
} from "../source-notice-scope.js";

/**
 * The footer of every page, in the language of the page: the one its
 * address names (`/fr/…`), else `fallbackLocale` — the language the root
 * layout also gives to the header's selector for a page whose address names
 * none.
 *
 * A composition may add a link after « Code source · GNU AGPL v3 » (`extra`,
 * an element the root layout asks of the composition for this request, with
 * its own words and its own address): the open-source composition adds none.
 *
 * The version of the running software and the commit it was built from
 * close the line, small and muted: « v1.0.1 · 5f295f159 », or the version
 * alone when no commit is known. The root layout reads both from the server
 * (`portal-app/lib/build-identity.server.js`); the footer draws them only
 * under `/<locale>/admin`, the rule being `source-notice-scope.js`.
 * Everywhere else the line keeps its copyright, its licence and its
 * link of the composition. The full-viewport pages (`isFullViewportPath`) have no
 * footer at all.
 */
const notices = {
  en: { warranty: "No warranty", source: "Source code" },
  fr: { warranty: "Sans garantie", source: "Code source" },
  ja: { warranty: "無保証", source: "ソースコード" },
  de: { warranty: "Keine Gewährleistung", source: "Quellcode" },
  es: { warranty: "Sin garantía", source: "Código fuente" },
  it: { warranty: "Nessuna garanzia", source: "Codice sorgente" },
  "pt-BR": { warranty: "Sem garantia", source: "Código-fonte" },
  "zh-Hans": { warranty: "不提供担保", source: "源代码" },
  "zh-Hant": { warranty: "不提供保固", source: "原始碼" },
  ru: { warranty: "Без гарантий", source: "Исходный код" },
};

export function SourceNotice({
  fallbackLocale = "en",
  extra = null,
  version = null,
  commit = null,
}) {
  const pathname = usePathname() || "/";
  const first = pathname.split("/").filter(Boolean)[0];
  const locale = notices[first] ? first : fallbackLocale;
  const words = copyFor(notices, locale, "SourceNotice.notices");
  // A full-viewport page (the sheet of a capture, the viewer, the image
  // alone) draws no footer: it would float over the image.
  if (isFullViewportPath(pathname)) return null;
  const buildShown = showsBuildIdentity(pathname);
  return (
    <footer className="source-notice" lang={locale}>
      <span>© 2026 Sqound · {words.warranty} · </span>
      <a href="https://github.com/sqound/astro-portal">
        {words.source} · GNU AGPL v3
      </a>
      {extra}
      {buildShown && version && (
        <span className="source-notice-version" data-build-version="">
          {` · v${version}${commit ? ` · ${commit}` : ""}`}
        </span>
      )}
    </footer>
  );
}
