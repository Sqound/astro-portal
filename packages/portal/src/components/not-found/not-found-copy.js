import { copyFor } from "astro-contracts/locales";

/**
 * The words of the page shown for an address that leads nowhere: the
 * framework's own page said « This page could not be found. » in English on
 * a French page, on a pure black background, with no way back. Formal
 * address in French, one sentence, one way back.
 */
export const notFoundCopy = {
  en: {
    title: "Page not found",
    body: "This address does not lead to a page of this site. The page may have moved, or the link may be wrong.",
    home: "Back to the home page",
  },
  fr: {
    title: "Page introuvable",
    body: "Cette adresse ne mène à aucune page de ce site. La page a peut-être été déplacée, ou le lien est incorrect.",
    home: "Retour à l’accueil",
  },
  ja: {
    title: "ページが見つかりません",
    body: "このアドレスに対応するページはありません。ページが移動したか、リンクが間違っている可能性があります。",
    home: "ホームに戻る",
  },
  de: {
    title: "Seite nicht gefunden",
    body: "Diese Adresse führt zu keiner Seite dieser Website. Die Seite wurde möglicherweise verschoben, oder der Link ist falsch.",
    home: "Zurück zur Startseite",
  },
  es: {
    title: "Página no encontrada",
    body: "Esta dirección no lleva a ninguna página de este sitio. Puede que la página se haya movido o que el enlace sea incorrecto.",
    home: "Volver al inicio",
  },
  it: {
    title: "Pagina non trovata",
    body: "Questo indirizzo non porta ad alcuna pagina di questo sito. La pagina potrebbe essere stata spostata, oppure il collegamento è errato.",
    home: "Torna alla pagina iniziale",
  },
  "pt-BR": {
    title: "Página não encontrada",
    body: "Este endereço não leva a nenhuma página deste site. A página pode ter sido movida ou o link pode estar incorreto.",
    home: "Voltar ao início",
  },
  ru: {
    title: "Страница не найдена",
    body: "Этот адрес не ведёт ни на одну страницу сайта. Возможно, страницу переместили или ссылка неверна.",
    home: "На главную",
  },
  "zh-Hans": {
    title: "找不到页面",
    body: "此地址在本站没有对应的页面。页面可能已被移动，或链接有误。",
    home: "返回首页",
  },
  "zh-Hant": {
    title: "找不到頁面",
    body: "此網址在本站沒有對應的頁面。頁面可能已被移動，或連結有誤。",
    home: "回到首頁",
  },
};

export const notFoundCopyFor = (locale) =>
  copyFor(notFoundCopy, locale, "notFoundCopy");
