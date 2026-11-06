import { AdminScreen } from "../../../../components/admin/AdminScreen.js";

/** The administration's pages (`/<locale>/admin/<section>`). */
export default async function Page({ params }) {
  const { locale, adminPath } = await params;
  return <AdminScreen locale={locale} segments={adminPath} />;
}
