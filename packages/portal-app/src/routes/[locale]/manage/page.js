import { redirect } from "next/navigation";
import { spacePageServed } from "./manage-page.js";

/**
 * `/{locale}/manage`: the first tab of « Mon espace », « Captures »; the
 * account page where the space page is not served (a private server signing
 * in by password). A composition registers its space pages before this runs.
 */
export default async function Page({ params }) {
  const { locale } = await params;
  const base = `/${encodeURIComponent(locale)}`;
  redirect(
    spacePageServed({ HostedSpace: true })
      ? `${base}/manage/captures`
      : `${base}/account`,
  );
}
