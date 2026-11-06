import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { portalConfig } from "../../../lib/config.server.js";

/**
 * `/p/{portalToken}`: the address of a private gallery as its owner gives
 * it — without a language, so that each visitor reads it in their own —
 * sent to `/{locale}/p/{portalToken}` in the language the visitor last
 * chose, else the default, as the root page does. Nothing is read here: the
 * gate is the gallery page's.
 */
export default async function Page({ params }) {
  const { portalToken } = await params;
  const { defaultLocale, supportedLocales } = await portalConfig();
  const preferred = (await cookies()).get("astro-portal-locale")?.value;
  const locale = supportedLocales.includes(preferred)
    ? preferred
    : defaultLocale;
  redirect(`/${locale}/p/${encodeURIComponent(portalToken)}`);
}
