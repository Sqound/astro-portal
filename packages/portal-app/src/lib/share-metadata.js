import { copyFor } from "astro-contracts/locales";
import { defaultProductName } from "./product-name.js";

// The product name is a parameter of this copy rather than hard-coded, so a
// configured deployment (`ASTRO_PORTAL_PRODUCT_NAME`) sees it in its own
// share previews too. `productName` defaults to the exact current,
// hard-coded name, so an unconfigured deployment's metadata is
// byte-for-byte unchanged.
function sharingCopy(productName = defaultProductName) {
  return {
    en: {
      title: `${productName} — Astrophotography gallery`,
      description:
        "Explore final astrophotography images, capture progressions, sky maps and technical details.",
      imageAlt: `Featured astrophotography image from the ${productName} gallery`,
      openGraphLocale: "en_US",
    },
    fr: {
      title: `${productName} — Galerie d’astrophotographie`,
      description:
        "Découvrez les images finales, les progressions de capture, les cartes du ciel et les détails techniques.",
      imageAlt: `Image d’astrophotographie mise en avant dans la galerie ${productName}`,
      openGraphLocale: "fr_FR",
    },
    ja: {
      title: `${productName} — 天体写真ギャラリー`,
      description:
        "完成画像、撮影の進行、星図、技術的な詳細をまとめた天体写真ギャラリーです。",
      imageAlt: `${productName} ギャラリーの注目の天体写真`,
      openGraphLocale: "ja_JP",
    },
    de: {
      title: `${productName} — Astrofotografie-Galerie`,
      description:
        "Entdecke fertige Astrofotos, Aufnahmeverläufe, Himmelskarten und technische Details.",
      imageAlt: `Hervorgehobenes Astrofoto aus der ${productName}-Galerie`,
      openGraphLocale: "de_DE",
    },
    es: {
      title: `${productName} — Galería de astrofotografía`,
      description:
        "Explore las imágenes finales de astrofotografía, la progresión de las capturas, los mapas del cielo y los detalles técnicos.",
      imageAlt: `Imagen de astrofotografía destacada de la galería de ${productName}`,
      openGraphLocale: "es_ES",
    },
    it: {
      title: `${productName} — Galleria di astrofotografia`,
      description:
        "Scopri le immagini finali di astrofotografia, l’avanzamento delle riprese, le mappe del cielo e i dettagli tecnici.",
      imageAlt: `Immagine di astrofotografia in evidenza dalla galleria di ${productName}`,
      openGraphLocale: "it_IT",
    },
    "pt-BR": {
      title: `${productName} — Galeria de astrofotografia`,
      description:
        "Explore imagens finais de astrofotografia, a progressão das capturas, mapas celestes e detalhes técnicos.",
      imageAlt: `Imagem de astrofotografia em destaque da galeria ${productName}`,
      openGraphLocale: "pt_BR",
    },
    "zh-Hans": {
      title: `${productName} — 天文摄影图库`,
      description: "浏览天文摄影成品图像、拍摄进展、星图和技术细节。",
      imageAlt: `${productName}图库中的精选天文摄影图像`,
      openGraphLocale: "zh_CN",
    },
    "zh-Hant": {
      title: `${productName} — 天文攝影圖庫`,
      description: "瀏覽天文攝影成品影像、拍攝進度、星圖與技術細節。",
      imageAlt: `${productName} 圖庫中的精選天文攝影影像`,
      openGraphLocale: "zh_TW",
    },
    ru: {
      title: `${productName} — Галерея астрофотографии`,
      description:
        "Смотрите готовые астрофотографии, ход съёмки, карты неба и технические подробности.",
      imageAlt: `Избранная астрофотография из галереи ${productName}`,
      openGraphLocale: "ru_RU",
    },
  };
}

function firstHeaderValue(headers, name) {
  return headers?.get(name)?.split(",")[0]?.trim();
}

function validHttpOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

function requestProtocol(headers) {
  const forwarded = firstHeaderValue(
    headers,
    "x-forwarded-proto",
  )?.toLowerCase();
  if (["http", "https"].includes(forwarded)) return forwarded;
  try {
    const cloudflareScheme = JSON.parse(
      headers?.get("cf-visitor") || "{}",
    ).scheme;
    if (["http", "https"].includes(cloudflareScheme)) return cloudflareScheme;
  } catch {
    // A malformed proxy header must not prevent a page from rendering.
  }
  return headers?.get("cf-ray") ? "https" : "http";
}

/**
 * Returns the configured canonical origin when available, otherwise the safe
 * public origin of the current request. This keeps Quick Tunnel links usable
 * without embedding a temporary hostname in the public repository.
 */
export function metadataBaseFromRequest(headers, configuredPublicUrl = null) {
  const configured = validHttpOrigin(configuredPublicUrl);
  if (configured) return configured;
  const host =
    firstHeaderValue(headers, "x-forwarded-host") ||
    firstHeaderValue(headers, "host");
  if (
    !host ||
    /\s/.test(host) ||
    host.includes("/") ||
    host.includes("@") ||
    host.includes("\\")
  )
    return null;
  return validHttpOrigin(`${requestProtocol(headers)}://${host}`);
}

export function galleryShareMetadata({
  locale,
  supportedLocales,
  metadataBase = null,
  productName = defaultProductName,
}) {
  const copyByLocale = sharingCopy(productName);
  const copy = copyFor(copyByLocale, locale, "share-metadata.sharingCopy");
  const path = `/${locale}`;
  const image = {
    url: `${path}/share-preview`,
    width: 1200,
    height: 630,
    alt: copy.imageAlt,
  };
  const metadata = {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: path,
      languages: Object.fromEntries(
        supportedLocales.map((supportedLocale) => [
          supportedLocale,
          `/${supportedLocale}`,
        ]),
      ),
    },
    openGraph: {
      type: "website",
      locale: copy.openGraphLocale,
      // Each other language once: a locale without its own copy reads the
      // English one (said by `copyFor`) and adds no second `en_US`.
      alternateLocale: [
        ...new Set(
          supportedLocales.map(
            (supportedLocale) =>
              copyFor(
                copyByLocale,
                supportedLocale,
                "share-metadata.sharingCopy",
              ).openGraphLocale,
          ),
        ),
      ].filter((openGraphLocale) => openGraphLocale !== copy.openGraphLocale),
      url: path,
      siteName: productName,
      title: copy.title,
      description: copy.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [image.url],
    },
  };
  return metadataBase ? { ...metadata, metadataBase } : metadata;
}

/** A page overrides the gallery preview with its own existing title. */
export function pageShareMetadata(title) {
  return { title, openGraph: { title }, twitter: { title } };
}
