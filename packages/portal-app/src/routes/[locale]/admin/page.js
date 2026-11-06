import { redirect } from "next/navigation";

/**
 * The administration's home in a language (`/{locale}/admin`): the first
 * section of the bar, « Catalogue ».
 */
export default async function Page({ params }) {
  const { locale } = await params;
  redirect(`/${encodeURIComponent(locale)}/admin/catalogue`);
}
