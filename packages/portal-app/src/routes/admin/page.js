import { redirect } from "next/navigation";
import { portalConfig } from "../../lib/config.server.js";

/** The administration's home (`/admin`): the first section of the bar, « Catalogue ». */
export default async function Page() {
  const configuration = await portalConfig();
  redirect(
    `/${encodeURIComponent(configuration.defaultLocale)}/admin/catalogue`,
  );
}
