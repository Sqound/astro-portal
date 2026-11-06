import { NotFoundPage } from "portal/components/not-found/NotFoundPage.js";
import { pageLocale } from "../lib/page-locale.server.js";

/**
 * The page of an address that leads nowhere, in the language of the
 * address or, when it names none, of the visitor's last choice. It
 * replaces the framework's default page (English, on black).
 */
export default async function NotFound() {
  return <NotFoundPage fallbackLocale={await pageLocale()} />;
}
