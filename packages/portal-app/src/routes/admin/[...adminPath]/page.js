import { redirect } from "next/navigation";
import { portalConfig } from "../../../lib/config.server.js";

export default async function Page({ params }) {
  const { adminPath } = await params;
  const configuration = await portalConfig();
  const path = adminPath
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  redirect(`/${encodeURIComponent(configuration.defaultLocale)}/admin/${path}`);
}
