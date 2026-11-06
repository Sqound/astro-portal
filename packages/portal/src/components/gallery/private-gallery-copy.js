import { copyFor } from "astro-contracts/locales";

/**
 * The words of the private gallery as its visitor sees it
 * (`PrivatePortalCapture`, `PrivatePortalGate`). The French wording is fixed
 * to the character; the other languages say the same thing in the register
 * of their catalogue. The labels of a capture's detail (« Matériel », « Pose
 * totale », « Qualité du ciel », « Bortle 4 ») are the tab « Captures »'s
 * own (`captures-copy.js`), read by the page.
 *
 * The line « N captures, newest first » is gone: the list under the title is
 * the public gallery's, and says « N / N captures » itself
 * (`galleryCaptures` of the message catalogues).
 */
const fr = {
  defaultTitle: "Galerie privée",
  by: (name) => `par ${name}`,
  empty: "Aucune capture dans cette galerie pour l’instant.",
  notFoundTitle: "Cette galerie n’existe pas ou n’est plus partagée.",
  night: "Nuit",
};

const en = {
  defaultTitle: "Private gallery",
  by: (name) => `by ${name}`,
  empty: "No captures in this gallery yet.",
  notFoundTitle: "This gallery does not exist or is no longer shared.",
  night: "Night",
};

const ja = {
  defaultTitle: "プライベートギャラリー",
  by: (name) => `撮影：${name}`,
  empty: "このギャラリーにはまだキャプチャがありません。",
  notFoundTitle: "このギャラリーは存在しないか、共有が終了しています。",
  night: "夜",
};

const de = {
  defaultTitle: "Private Galerie",
  by: (name) => `von ${name}`,
  empty: "Noch keine Aufnahmen in dieser Galerie.",
  notFoundTitle: "Diese Galerie existiert nicht oder wird nicht mehr geteilt.",
  night: "Nacht",
};

const es = {
  defaultTitle: "Galería privada",
  by: (name) => `por ${name}`,
  empty: "Todavía no hay capturas en esta galería.",
  notFoundTitle: "Esta galería no existe o ya no se comparte.",
  night: "Noche",
};

const it = {
  defaultTitle: "Galleria privata",
  by: (name) => `di ${name}`,
  empty: "Ancora nessuna ripresa in questa galleria.",
  notFoundTitle: "Questa galleria non esiste o non è più condivisa.",
  night: "Notte",
};

const ptBR = {
  defaultTitle: "Galeria privada",
  by: (name) => `por ${name}`,
  empty: "Ainda não há capturas nesta galeria.",
  notFoundTitle: "Esta galeria não existe ou não está mais compartilhada.",
  night: "Noite",
};

const zhHans = {
  defaultTitle: "私人图库",
  by: (name) => `作者：${name}`,
  empty: "此图库中还没有作品。",
  notFoundTitle: "此图库不存在或已不再共享。",
  night: "夜晚",
};

const zhHant = {
  defaultTitle: "私人圖庫",
  by: (name) => `作者：${name}`,
  empty: "此圖庫中還沒有影像。",
  notFoundTitle: "此圖庫不存在或已不再分享。",
  night: "夜晚",
};

const ru = {
  defaultTitle: "Закрытая галерея",
  by: (name) => `автор: ${name}`,
  empty: "В этой галерее пока нет снимков.",
  notFoundTitle: "Этой галереи не существует, или она больше не открыта.",
  night: "Ночь",
};

export const privateGalleryCopy = {
  en: en,
  fr: fr,
  ja: ja,
  de: de,
  es: es,
  it: it,
  "pt-BR": ptBR,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ru: ru,
};

/** The gallery's words in `locale` (English where a language lacks them). */
export const privateGalleryCopyFor = (locale) =>
  copyFor(privateGalleryCopy, locale, "private-gallery-copy");
