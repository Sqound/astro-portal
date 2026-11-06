"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { message } from "portal/i18n.js";
import { countedText } from "portal/components/filters/FilterControls.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import { NightModeControl } from "portal/components/NightModeControl.js";
import { HEADER_STALE_EVENT } from "portal/components/header-refresh.js";
import { copyFor, shippedLocales } from "portal/locales.js";
import { signInHrefFor } from "portal/sign-in-href.js";

const labels = {
  en: {
    account: "Account",
    space: "Astro Portal space",
    admin: "Administration",
    publicGallery: "Public gallery",
    privateGallery: "Private gallery",
    mySpace: "My space",
    journal: "Journal",
    login: "Sign in",
    logout: "Sign out",
    menu: "Main navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    plan: "Plan",
    tonight: "Tonight",
  },
  fr: {
    account: "Compte",
    space: "Espace Astro Portal",
    admin: "Administration",
    publicGallery: "Galerie publique",
    privateGallery: "Galerie privée",
    mySpace: "Mon espace",
    journal: "Journal",
    login: "Se connecter",
    logout: "Se déconnecter",
    menu: "Navigation principale",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    plan: "Planifier",
    tonight: "Cette nuit",
  },
  ja: {
    account: "アカウント",
    space: "Astro Portal スペース",
    admin: "管理",
    publicGallery: "公開ギャラリー",
    privateGallery: "プライベートギャラリー",
    mySpace: "マイスペース",
    journal: "記録",
    login: "サインイン",
    logout: "サインアウト",
    menu: "メインナビゲーション",
    openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる",
    plan: "プラン作成",
    tonight: "今夜",
  },
  de: {
    account: "Konto",
    space: "Bereich in Astro Portal",
    admin: "Verwaltung",
    publicGallery: "Öffentliche Galerie",
    privateGallery: "Private Galerie",
    mySpace: "Mein Bereich",
    journal: "Journal",
    login: "Anmelden",
    logout: "Abmelden",
    menu: "Hauptnavigation",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
    plan: "Planen",
    tonight: "Heute Nacht",
  },
  es: {
    account: "Cuenta",
    space: "Espacio de Astro Portal",
    admin: "Administración",
    publicGallery: "Galería pública",
    privateGallery: "Galería privada",
    mySpace: "Mi espacio",
    journal: "Diario",
    login: "Iniciar sesión",
    logout: "Cerrar sesión",
    menu: "Navegación principal",
    openMenu: "Abrir el menú",
    closeMenu: "Cerrar el menú",
    plan: "Planificar",
    tonight: "Esta noche",
  },
  it: {
    account: "Account",
    space: "Spazio Astro Portal",
    admin: "Amministrazione",
    publicGallery: "Galleria pubblica",
    privateGallery: "Galleria privata",
    mySpace: "Il mio spazio",
    journal: "Diario",
    login: "Accedere",
    logout: "Disconnettersi",
    menu: "Navigazione principale",
    openMenu: "Aprire il menu",
    closeMenu: "Chiudere il menu",
    plan: "Pianificare",
    tonight: "Questa notte",
  },
  "pt-BR": {
    account: "Conta",
    space: "Espaço do Astro Portal",
    admin: "Administração",
    publicGallery: "Galeria pública",
    privateGallery: "Galeria privada",
    mySpace: "Meu espaço",
    journal: "Diário",
    login: "Entrar",
    logout: "Sair",
    menu: "Navegação principal",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    plan: "Planejar",
    tonight: "Esta noite",
  },
  "zh-Hans": {
    account: "账户",
    space: "Astro Portal空间",
    admin: "管理",
    publicGallery: "公开图库",
    privateGallery: "私人图库",
    mySpace: "我的空间",
    journal: "日志",
    login: "登录",
    logout: "退出登录",
    menu: "主导航",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    plan: "计划",
    tonight: "今晚",
  },
  "zh-Hant": {
    account: "帳號",
    space: "Astro Portal 空間",
    admin: "管理",
    publicGallery: "公開圖庫",
    privateGallery: "私人圖庫",
    mySpace: "我的空間",
    journal: "日誌",
    login: "登入",
    logout: "登出",
    menu: "主導覽",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    plan: "計畫",
    tonight: "今晚",
  },
  ru: {
    account: "Аккаунт",
    space: "Пространство Astro Portal",
    admin: "Администрирование",
    publicGallery: "Публичная галерея",
    privateGallery: "Закрытая галерея",
    mySpace: "Моё пространство",
    journal: "Журнал",
    login: "Войти",
    logout: "Выйти",
    menu: "Главная навигация",
    openMenu: "Открыть меню",
    closeMenu: "Закрыть меню",
    plan: "Планирование",
    tonight: "Сегодня ночью",
  },
};

function csrfToken() {
  return csrfCookieValue();
}

export function LocaleSwitcher({
  supportedLocales = shippedLocales(),
  localeNames = {},
  // The header brand text, configurable per deployment; defaults to the
  // current fixed name so an unconfigured deployment is unchanged.
  productName = "Astro Portal",
  // The language of a page whose address names none (`/auth/…`), decided by
  // the root layout like the page's own body and footer.
  fallbackLocale = "en",
  // Where the server is made of spaces, not accounts, the root layout says
  // so, and the header calls the person's page « Espace Astro Portal » from
  // the first paint (a private server keeps « Compte »).
  spaces = false,
  // What the header decides, read on the server by the root layout
  // (`portal-app/lib/header-state.server.js`): the HTML is served right for
  // each role — visitor, member, administrator — with no state « pending »
  // and no read of its own in the browser. The shape of
  // `GET /api/auth/status`.
  authentication = { enabled: false, authenticated: false },
  // The path of the person's own private gallery (`/p/{token}`), or null.
  privateGalleryPath = null,
  // The nights waiting for their debriefing.
  debriefQueueCount = 0,
}) {
  const locales = supportedLocales.length ? supportedLocales : shippedLocales();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const parts = pathname.split("/").filter(Boolean);
  const localizedPath = locales.includes(parts[0]);
  const locale = localizedPath ? parts[0] : fallbackLocale;
  const copy = copyFor(labels, locale, "LocaleSwitcher.labels");
  const accountLabel = spaces ? copy.space : copy.account;
  // Keep the URL path byte-for-byte intact: an asset id can already contain
  // percent-encoded characters such as %3A.
  const localePrefix = new RegExp(
    `^/(?:${locales.map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=/|$)`,
  );
  const remainder = locales.includes(parts[0])
    ? pathname.replace(localePrefix, "")
    : pathname;
  const remember = (candidate) => {
    document.cookie = `astro-portal-locale=${candidate}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };
  // Kept across the navigations inside the site; asked again of the server
  // only when a change of the person's own moves it (`header-refresh.js`).
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(HEADER_STALE_EVENT, refresh);
    return () => window.removeEventListener(HEADER_STALE_EVENT, refresh);
  }, [router]);
  // The document's language follows the page across the navigations inside
  // the site, which the root layout does not render again: the server wrote
  // the first page's, this writes the next ones'.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // A menu left open does not follow the person to the next page.
  useEffect(() => {
    setLanguageOpen(false);
    setAccountOpen(false);
    setNavigationOpen(false);
  }, [pathname]);
  const signOut = async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "x-astro-csrf": csrfToken() || "" },
    });
    if (response.ok) window.location.assign(`/${locale}`);
  };
  const isGallery =
    pathname === `/${locale}` ||
    pathname.startsWith(`/${locale}/gallery/`) ||
    pathname.startsWith(`/${locale}/image`) ||
    pathname.startsWith(`/${locale}/target`);
  const isPlanner = pathname.startsWith(`/${locale}/planner`);
  const isTonight = pathname.startsWith(`/${locale}/tonight`);
  const isJournal = pathname.startsWith(`/${locale}/sessions`);
  const isAdmin = pathname.startsWith(`/${locale}/admin`);
  // « Mon espace »: the page of the space and its tabs; a private server
  // signing in by password keeps its account page.
  const passwordAccount = authentication?.method === "password";
  const spacePath = passwordAccount
    ? `/${locale}/account`
    : `/${locale}/manage`;
  const isSpace =
    pathname.startsWith(`/${locale}/manage`) ||
    pathname.startsWith(`/${locale}/account`);
  const privateGalleryHref = privateGalleryPath
    ? `/${locale}${privateGalleryPath}`
    : null;
  const isPrivateGallery = Boolean(
    privateGalleryHref && pathname.startsWith(privateGalleryHref),
  );
  const signedIn = Boolean(authentication?.authenticated);
  // The catalogue and planner deliberately share a comfortable reading width.
  // Administration and the immersive capture detail use the full viewport, so
  // their header must align to that wider canvas instead.
  const usesFullWidthCanvas =
    pathname.startsWith(`/${locale}/admin`) ||
    pathname.startsWith(`/${locale}/gallery/`) ||
    pathname.startsWith(`/${locale}/image/`);
  const closeNavigation = () => setNavigationOpen(false);

  // The three times of the person's work in the order of time — plan,
  // tonight, journal — after
  // the gallery, which stays the site's root.
  // Inside the site, a link of the header is a navigation of the page, not
  // a new document: the header stays as the server drew it. Never fetched
  // ahead of the click (`prefetch={false}`): a header link is not a reason
  // to render a page the person may not open.
  const navigation = (
    <nav
      id="portal-navigation"
      className={`portal-navigation${navigationOpen ? " is-open" : ""}`}
      aria-label={copy.menu}
    >
      <Link
        prefetch={false}
        className={isGallery ? "is-active" : ""}
        aria-current={isGallery ? "page" : undefined}
        href={`/${locale}`}
        onClick={closeNavigation}
      >
        {copy.publicGallery}
      </Link>
      {signedIn && privateGalleryHref ? (
        <Link
          prefetch={false}
          className={isPrivateGallery ? "is-active" : ""}
          aria-current={isPrivateGallery ? "page" : undefined}
          href={privateGalleryHref}
          onClick={closeNavigation}
        >
          {copy.privateGallery}
        </Link>
      ) : null}
      <Link
        prefetch={false}
        className={isPlanner ? "is-active" : ""}
        aria-current={isPlanner ? "page" : undefined}
        href={`/${locale}/planner`}
        onClick={closeNavigation}
      >
        {copy.plan}
      </Link>
      <Link
        prefetch={false}
        className={isTonight ? "is-active" : ""}
        aria-current={isTonight ? "page" : undefined}
        href={`/${locale}/tonight`}
        onClick={closeNavigation}
      >
        {copy.tonight}
      </Link>
      <Link
        prefetch={false}
        className={isJournal ? "is-active" : ""}
        aria-current={isJournal ? "page" : undefined}
        href={`/${locale}/sessions`}
        onClick={closeNavigation}
      >
        {copy.journal}
        {debriefQueueCount > 0 && (
          <span
            className="nav-debrief-badge"
            aria-label={countedText(
              locale,
              "journalToDebriefCount",
              debriefQueueCount,
            )}
          >
            {debriefQueueCount}
          </span>
        )}
      </Link>
      {signedIn ? (
        <Link
          prefetch={false}
          className={isSpace ? "is-active" : ""}
          aria-current={isSpace ? "page" : undefined}
          href={spacePath}
          onClick={closeNavigation}
        >
          {passwordAccount ? accountLabel : copy.mySpace}
        </Link>
      ) : null}
      {isAdmin && (
        <Link
          prefetch={false}
          className="is-active"
          aria-current="page"
          href={`/${locale}/admin`}
          onClick={closeNavigation}
        >
          {copy.admin}
        </Link>
      )}
    </nav>
  );

  // The same controls for guests and members: the right side of the header
  // never changes shape from one page to the next.
  const accountControls = (
    <div className="locale-switcher session-controls" aria-label={accountLabel}>
      <div className="session-control">
        <button
          type="button"
          className="session-trigger language-trigger"
          aria-expanded={languageOpen}
          aria-haspopup="menu"
          onClick={() => {
            setLanguageOpen((current) => !current);
            setAccountOpen(false);
            setNavigationOpen(false);
          }}
        >
          <span>{locale.toUpperCase()}</span>
          <svg
            className="session-chevron"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="m2.5 4.25 3.5 3.5 3.5-3.5" />
          </svg>
        </button>
        {languageOpen && (
          <div className="session-menu language-menu" role="menu">
            {locales.map((candidate) => (
              <a
                aria-current={candidate === locale ? "page" : undefined}
                href={
                  localizedPath
                    ? `/${candidate}${remainder === "/" ? "" : remainder}`
                    : pathname
                }
                key={candidate}
                lang={candidate}
                role="menuitem"
                onClick={(event) => {
                  remember(candidate);
                  // A page whose address names no language reads the
                  // choice from the cookie: reload it where it stands,
                  // query included (`?next=` of a sign-in page).
                  if (!localizedPath) {
                    event.preventDefault();
                    window.location.reload();
                  }
                }}
              >
                {localeNames[candidate] || candidate.toUpperCase()}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="session-control">
        <button
          type="button"
          className="session-trigger account-trigger"
          aria-label={accountLabel}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          onClick={() => {
            setAccountOpen((current) => !current);
            setLanguageOpen(false);
            setNavigationOpen(false);
          }}
        >
          <svg className="account-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
          </svg>
          <svg
            className="session-chevron"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="m2.5 4.25 3.5 3.5 3.5-3.5" />
          </svg>
        </button>
        {accountOpen && (
          <div className="session-menu account-menu" role="menu">
            {authentication?.authenticated ? (
              <>
                <p className="account-email">{authentication.user?.email}</p>
                <Link
                  prefetch={false}
                  href={spacePath}
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                >
                  {passwordAccount ? accountLabel : copy.mySpace}
                </Link>
                {/* Where spaces are open to any address, only the addresses the
                    service names administer it; a private server says
                    nothing. */}
                {authentication.user?.administrator === false ? null : (
                  <Link
                    prefetch={false}
                    href={`/${locale}/admin`}
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                  >
                    {copy.admin}
                  </Link>
                )}
                <button type="button" role="menuitem" onClick={signOut}>
                  {copy.logout}
                </button>
              </>
            ) : (
              <a
                href={signInHrefFor(authentication, pathname)}
                role="menuitem"
                // The sign-in page names no language in its address: it
                // opens in the one of the page it was asked from.
                onClick={() => remember(locale)}
              >
                {copy.login}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <header className="portal-header">
      <div
        className={`portal-header-inner${usesFullWidthCanvas ? " portal-header-inner-full" : ""}`}
      >
        <button
          className="portal-menu-toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="portal-navigation"
          aria-label={navigationOpen ? copy.closeMenu : copy.openMenu}
          onClick={() => {
            setNavigationOpen((current) => !current);
            setLanguageOpen(false);
            setAccountOpen(false);
          }}
        >
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </button>
        <Link
          prefetch={false}
          className="portal-brand"
          href={`/${locale}`}
          // The name is a span that goes away under 431 px; the logo link
          // keeps one.
          aria-label={productName}
          onClick={closeNavigation}
        >
          <img src="/icon.svg" width="32" height="32" alt="" />
          <span>{productName}</span>
        </Link>
        {navigation}
        <div className="portal-header-actions">
          {/* The red night mode: first of the actions, before the language
              and the account. */}
          <NightModeControl
            locale={locale}
            onOpen={() => {
              setLanguageOpen(false);
              setAccountOpen(false);
              setNavigationOpen(false);
            }}
          />
          {accountControls}
        </div>
      </div>
    </header>
  );
}
