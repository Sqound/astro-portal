import { copyFor } from "astro-contracts/locales";

/**
 * What the pages that need a space say on a server that runs without a
 * sign-in (`ASTRO_PORTAL_AUTH_MODE=disabled`): once, in the page's language,
 * with no button to press. The service has no private API in that mode, so
 * the account page's pairing and export and the Journal's list could only
 * fail; they used to show the service's English error, a primary button that
 * led nowhere and « Connectez un espace ».
 */
export const noSignInCopy = {
  en: {
    account: "Account",
    notice:
      "This portal runs without a sign-in, so this page has nothing to show. Turn on the portal’s sign-in to use it.",
  },
  fr: {
    account: "Compte",
    notice:
      "Ce portail fonctionne sans connexion : cette page n’a donc rien à afficher. Activez la connexion du portail pour l’utiliser.",
  },
  ja: {
    account: "アカウント",
    notice:
      "このポータルはログインなしで動作しているため、このページに表示できる内容はありません。利用するには、ポータルのログインを有効にしてください。",
  },
  de: {
    account: "Konto",
    notice:
      "Dieses Portal läuft ohne Anmeldung, daher gibt es hier nichts anzuzeigen. Aktiviere die Anmeldung des Portals, um diese Seite zu nutzen.",
  },
  es: {
    account: "Cuenta",
    notice:
      "Este portal funciona sin inicio de sesión, así que esta página no tiene nada que mostrar. Activa el inicio de sesión del portal para usarla.",
  },
  it: {
    account: "Account",
    notice:
      "Questo portale funziona senza accesso, quindi questa pagina non ha nulla da mostrare. Per usarla, attiva l’accesso del portale.",
  },
  "pt-BR": {
    account: "Conta",
    notice:
      "Este portal funciona sem login, então esta página não tem nada para mostrar. Ative o login do portal para usá-la.",
  },
  ru: {
    account: "Аккаунт",
    notice:
      "Этот портал работает без входа, поэтому на этой странице нечего показывать. Включите вход в портал, чтобы пользоваться ею.",
  },
  "zh-Hans": {
    account: "账户",
    notice:
      "此门户未启用登录，因此该页面没有可显示的内容。请启用门户的登录功能后再使用。",
  },
  "zh-Hant": {
    account: "帳號",
    notice:
      "此入口網站未啟用登入，因此此頁面沒有可顯示的內容。請啟用入口網站的登入功能後再使用。",
  },
};

export const noSignInCopyFor = (locale) =>
  copyFor(noSignInCopy, locale, "noSignInCopy");
