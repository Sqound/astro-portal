import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { portalConfig } from "../../lib/config.server.js";
import {
  galleryShareMetadata,
  metadataBaseFromRequest,
} from "../../lib/share-metadata.js";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const config = await portalConfig();
  if (!config.supportedLocales.includes(locale)) return {};
  return galleryShareMetadata({
    locale,
    supportedLocales: config.supportedLocales,
    metadataBase: metadataBaseFromRequest(await headers(), config.publicUrl),
    productName: config.productName,
  });
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  const config = await portalConfig();
  if (!config.supportedLocales.includes(locale)) notFound();
  return <div lang={locale}>{children}</div>;
}
