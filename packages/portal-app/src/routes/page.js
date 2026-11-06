import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { portalConfig } from "../lib/config.server.js";

export default async function Page() {
  const { defaultLocale, supportedLocales } = await portalConfig();
  const preferred = (await cookies()).get("astro-portal-locale")?.value;
  redirect(
    `/${supportedLocales.includes(preferred) ? preferred : defaultLocale}`,
  );
}
