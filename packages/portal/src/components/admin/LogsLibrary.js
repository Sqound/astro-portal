"use client";

import { copyFor } from "astro-contracts/locales";
import { LoadingState } from "portal/components/LoadingState.js";
import { useEffect, useMemo, useState } from "react";

const copy = {
  fr: {
    eyebrow: "OBSERVABILITÉ",
    title: "Journal applicatif",
    help: "Erreurs et avertissements du service, incidents remontés par les navigateurs et, avec le consentement de la personne, journaux d’erreur de l’application mobile.",
    refresh: "Actualiser",
    loading: "Chargement des journaux…",
    empty: "Aucun événement ne correspond aux filtres.",
    allLevels: "Tous niveaux",
    allSources: "Toutes sources",
    client: "Web",
    server: "Service",
    mobile: "Mobile",
    probe: "Sonde",
    address: "Adresse e-mail",
    diagnosticToken: "Jeton de diagnostic",
    platform: "Plateforme",
    app: "Application",
    model: "Modèle",
    language: "Langue",
    screen: "Écran",
    route: "Route",
    network: "Réseau",
    phoneTime: "Heure sur le téléphone",
    space: "Espace",
    stack: "Pile",
    breadcrumbs: "Fil d’Ariane",
    probeSettings: "Réglages",
    probeFocus: "Mise au point",
    probeAlign: "Alignement",
    probeSolve: "Résolution",
    probeJournal: "Lignes [probe]",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi sans Internet",
    cellular: "Cellulaire",
    cellularWithoutInternet: "Cellulaire sans Internet",
    ethernet: "Ethernet",
    none: "Aucun réseau",
    other: "Autre",
    debug: "Débogage",
    info: "Information",
    warning: "Avertissement",
    error: "Erreur",
    event: "Événement",
    context: "Contexte technique",
    unavailable: "Journal indisponible",
  },
  en: {
    eyebrow: "OBSERVABILITY",
    title: "Application log",
    help: "Service warnings and errors, incidents reported by browsers and, with the person’s consent, the mobile application’s error logs.",
    refresh: "Refresh",
    loading: "Loading logs…",
    empty: "No event matches these filters.",
    allLevels: "All levels",
    allSources: "All sources",
    client: "Web",
    server: "Service",
    mobile: "Mobile",
    probe: "Probe",
    address: "E-mail address",
    diagnosticToken: "Diagnostic token",
    platform: "Platform",
    app: "Application",
    model: "Model",
    language: "Language",
    screen: "Screen",
    route: "Route",
    network: "Network",
    phoneTime: "Time on the phone",
    space: "Space",
    stack: "Stack",
    breadcrumbs: "Breadcrumb",
    probeSettings: "Settings",
    probeFocus: "Focus",
    probeAlign: "Alignment",
    probeSolve: "Solve",
    probeJournal: "[probe] lines",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi without Internet",
    cellular: "Cellular",
    cellularWithoutInternet: "Cellular without Internet",
    ethernet: "Ethernet",
    none: "No network",
    other: "Other",
    debug: "Debug",
    info: "Info",
    warning: "Warning",
    error: "Error",
    event: "Event",
    context: "Technical context",
    unavailable: "Logs unavailable",
  },
  ja: {
    eyebrow: "監視",
    title: "アプリケーションログ",
    help: "サービスの警告とエラー、ブラウザーから報告された問題、そして本人の同意を得たモバイルアプリのエラーログです。",
    refresh: "更新",
    loading: "ログを読み込み中…",
    empty: "このフィルターに一致するイベントはありません。",
    allLevels: "すべてのレベル",
    allSources: "すべての送信元",
    client: "ウェブ",
    server: "サービス",
    mobile: "モバイル",
    probe: "プローブ",
    address: "メールアドレス",
    diagnosticToken: "診断トークン",
    platform: "プラットフォーム",
    app: "アプリ",
    model: "機種",
    language: "言語",
    screen: "画面",
    route: "ルート",
    network: "ネットワーク",
    phoneTime: "端末の時刻",
    space: "スペース",
    stack: "スタック",
    breadcrumbs: "操作履歴",
    probeSettings: "設定",
    probeFocus: "ピント",
    probeAlign: "位置合わせ",
    probeSolve: "解析",
    probeJournal: "[probe] の行",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "インターネットなしの Wi‑Fi",
    cellular: "モバイル通信",
    cellularWithoutInternet: "インターネットなしのモバイル通信",
    ethernet: "イーサネット",
    none: "ネットワークなし",
    other: "その他",
    debug: "デバッグ",
    info: "情報",
    warning: "警告",
    error: "エラー",
    event: "イベント",
    context: "技術的なコンテキスト",
    unavailable: "ログを取得できません",
  },
  de: {
    eyebrow: "BEOBACHTBARKEIT",
    title: "Anwendungsprotokoll",
    help: "Fehler und Warnungen des Dienstes, von Browsern gemeldete Vorfälle und, mit Einwilligung der Person, Fehlerprotokolle der mobilen App.",
    refresh: "Aktualisieren",
    loading: "Protokolle werden geladen …",
    empty: "Kein Ereignis entspricht den Filtern.",
    allLevels: "Alle Stufen",
    allSources: "Alle Quellen",
    client: "Web",
    server: "Dienst",
    mobile: "Mobil",
    probe: "Sonde",
    address: "E-Mail-Adresse",
    diagnosticToken: "Diagnose-Token",
    platform: "Plattform",
    app: "App",
    model: "Modell",
    language: "Sprache",
    screen: "Bildschirm",
    route: "Route",
    network: "Netzwerk",
    phoneTime: "Uhrzeit auf dem Telefon",
    space: "Bereich",
    stack: "Stack",
    breadcrumbs: "Navigationspfad",
    probeSettings: "Einstellungen",
    probeFocus: "Fokussierung",
    probeAlign: "Ausrichtung",
    probeSolve: "Lösung",
    probeJournal: "[probe]-Zeilen",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi ohne Internet",
    cellular: "Mobilfunk",
    cellularWithoutInternet: "Mobilfunk ohne Internet",
    ethernet: "Ethernet",
    none: "Kein Netzwerk",
    other: "Andere",
    debug: "Debug",
    info: "Information",
    warning: "Warnung",
    error: "Fehler",
    event: "Ereignis",
    context: "Technischer Kontext",
    unavailable: "Protokoll nicht verfügbar",
  },
  es: {
    eyebrow: "OBSERVABILIDAD",
    title: "Registro de la aplicación",
    help: "Errores y advertencias del servicio, incidentes comunicados por los navegadores y, con el consentimiento de la persona, registros de errores de la aplicación para teléfono.",
    refresh: "Actualizar",
    loading: "Cargando los registros…",
    empty: "Ningún evento coincide con los filtros.",
    allLevels: "Todos los niveles",
    allSources: "Todas las fuentes",
    client: "Web",
    server: "Servicio",
    mobile: "Teléfono",
    probe: "Sonda",
    address: "Dirección de correo electrónico",
    diagnosticToken: "Token de diagnóstico",
    platform: "Plataforma",
    app: "Aplicación",
    model: "Modelo",
    language: "Idioma",
    screen: "Pantalla",
    route: "Ruta",
    network: "Red",
    phoneTime: "Hora en el teléfono",
    space: "Espacio",
    stack: "Pila",
    breadcrumbs: "Rastro de acciones",
    probeSettings: "Configuración",
    probeFocus: "Enfoque",
    probeAlign: "Alineación",
    probeSolve: "Resolución",
    probeJournal: "Líneas [probe]",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi sin Internet",
    cellular: "Celular",
    cellularWithoutInternet: "Celular sin Internet",
    ethernet: "Ethernet",
    none: "Sin red",
    other: "Otra",
    debug: "Depuración",
    info: "Información",
    warning: "Advertencia",
    error: "Error",
    event: "Evento",
    context: "Contexto técnico",
    unavailable: "Registro no disponible",
  },
  it: {
    eyebrow: "OSSERVABILITÀ",
    title: "Registro dell’applicazione",
    help: "Errori e avvisi del servizio, incidenti segnalati dai browser e, con il consenso della persona, registri degli errori dell’applicazione mobile.",
    refresh: "Aggiornare",
    loading: "Caricamento dei registri…",
    empty: "Nessun evento corrisponde ai filtri.",
    allLevels: "Tutti i livelli",
    allSources: "Tutte le fonti",
    client: "Web",
    server: "Servizio",
    mobile: "Mobile",
    probe: "Sonda",
    address: "Indirizzo e-mail",
    diagnosticToken: "Token di diagnostica",
    platform: "Piattaforma",
    app: "Applicazione",
    model: "Modello",
    language: "Lingua",
    screen: "Schermata",
    route: "Route",
    network: "Rete",
    phoneTime: "Ora sul telefono",
    space: "Spazio",
    stack: "Stack",
    breadcrumbs: "Tracciato",
    probeSettings: "Impostazioni",
    probeFocus: "Messa a fuoco",
    probeAlign: "Allineamento",
    probeSolve: "Risoluzione",
    probeJournal: "Righe [probe]",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi senza Internet",
    cellular: "Rete mobile",
    cellularWithoutInternet: "Rete mobile senza Internet",
    ethernet: "Ethernet",
    none: "Nessuna rete",
    other: "Altro",
    debug: "Debug",
    info: "Informazione",
    warning: "Avviso",
    error: "Errore",
    event: "Evento",
    context: "Contesto tecnico",
    unavailable: "Registro non disponibile",
  },
  "pt-BR": {
    eyebrow: "OBSERVABILIDADE",
    title: "Registro do aplicativo",
    help: "Erros e avisos do serviço, incidentes informados pelos navegadores e, com o consentimento da pessoa, registros de erro do aplicativo móvel.",
    refresh: "Atualizar",
    loading: "Carregando os registros…",
    empty: "Nenhum evento corresponde aos filtros.",
    allLevels: "Todos os níveis",
    allSources: "Todas as fontes",
    client: "Web",
    server: "Serviço",
    mobile: "Mobile",
    probe: "Sonda",
    address: "Endereço de e-mail",
    diagnosticToken: "Token de diagnóstico",
    platform: "Plataforma",
    app: "Aplicativo",
    model: "Modelo",
    language: "Idioma",
    screen: "Tela",
    route: "Rota",
    network: "Rede",
    phoneTime: "Hora no celular",
    space: "Espaço",
    stack: "Pilha",
    breadcrumbs: "Trilha de navegação",
    probeSettings: "Configurações",
    probeFocus: "Foco",
    probeAlign: "Alinhamento",
    probeSolve: "Plate solving",
    probeJournal: "Linhas [probe]",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi sem internet",
    cellular: "Celular",
    cellularWithoutInternet: "Celular sem internet",
    ethernet: "Ethernet",
    none: "Sem rede",
    other: "Outro",
    debug: "Depuração",
    info: "Informação",
    warning: "Aviso",
    error: "Erro",
    event: "Evento",
    context: "Contexto técnico",
    unavailable: "Registro indisponível",
  },
  "zh-Hans": {
    eyebrow: "可观测性",
    title: "应用日志",
    help: "服务的警告与错误、浏览器上报的问题，以及经本人同意的移动应用错误日志。",
    refresh: "刷新",
    loading: "正在加载日志…",
    empty: "没有符合筛选条件的事件。",
    allLevels: "所有级别",
    allSources: "所有来源",
    client: "网页",
    server: "服务",
    mobile: "移动端",
    probe: "探针",
    address: "邮箱地址",
    diagnosticToken: "诊断令牌",
    platform: "平台",
    app: "应用",
    model: "型号",
    language: "语言",
    screen: "界面",
    route: "路由",
    network: "网络",
    phoneTime: "手机上的时间",
    space: "空间",
    stack: "堆栈",
    breadcrumbs: "操作轨迹",
    probeSettings: "设置",
    probeFocus: "对焦",
    probeAlign: "对齐",
    probeSolve: "解算",
    probeJournal: "[probe] 日志行",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "无互联网的 Wi‑Fi",
    cellular: "蜂窝网络",
    cellularWithoutInternet: "无互联网的蜂窝网络",
    ethernet: "以太网",
    none: "无网络",
    other: "其他",
    debug: "调试",
    info: "信息",
    warning: "警告",
    error: "错误",
    event: "事件",
    context: "技术上下文",
    unavailable: "无法获取日志",
  },
  "zh-Hant": {
    eyebrow: "可觀測性",
    title: "應用程式日誌",
    help: "服務的警告與錯誤、瀏覽器回報的問題，以及經本人同意的行動應用程式錯誤日誌。",
    refresh: "重新整理",
    loading: "正在載入日誌……",
    empty: "沒有符合篩選條件的事件。",
    allLevels: "所有層級",
    allSources: "所有來源",
    client: "網頁",
    server: "服務",
    mobile: "行動裝置",
    probe: "探針",
    address: "電子郵件地址",
    diagnosticToken: "診斷權杖",
    platform: "平台",
    app: "應用程式",
    model: "型號",
    language: "語言",
    screen: "畫面",
    route: "路由",
    network: "網路",
    phoneTime: "手機上的時間",
    space: "空間",
    stack: "堆疊",
    breadcrumbs: "操作軌跡",
    probeSettings: "設定",
    probeFocus: "對焦",
    probeAlign: "對齊",
    probeSolve: "解算",
    probeJournal: "[probe] 日誌行",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "無網際網路的 Wi‑Fi",
    cellular: "行動網路",
    cellularWithoutInternet: "無網際網路的行動網路",
    ethernet: "乙太網路",
    none: "無網路",
    other: "其他",
    debug: "偵錯",
    info: "資訊",
    warning: "警告",
    error: "錯誤",
    event: "事件",
    context: "技術背景資訊",
    unavailable: "無法取得日誌",
  },
  ru: {
    eyebrow: "НАБЛЮДАЕМОСТЬ",
    title: "Журнал приложения",
    help: "Предупреждения и ошибки сервиса, инциденты, о которых сообщили браузеры, и — с согласия человека — журналы ошибок мобильного приложения.",
    refresh: "Обновить",
    loading: "Загрузка журналов…",
    empty: "Нет событий, подходящих под эти фильтры.",
    allLevels: "Все уровни",
    allSources: "Все источники",
    client: "Веб",
    server: "Сервис",
    mobile: "Мобильное приложение",
    probe: "Зонд",
    address: "Адрес электронной почты",
    diagnosticToken: "Токен диагностики",
    platform: "Платформа",
    app: "Приложение",
    model: "Модель",
    language: "Язык",
    screen: "Экран",
    route: "Маршрут",
    network: "Сеть",
    phoneTime: "Время на телефоне",
    space: "Пространство",
    stack: "Стек",
    breadcrumbs: "Последние действия",
    probeSettings: "Настройки",
    probeFocus: "Фокус",
    probeAlign: "Выравнивание",
    probeSolve: "Решение",
    probeJournal: "Строки [probe]",
    wifi: "Wi‑Fi",
    wifiWithoutInternet: "Wi‑Fi без интернета",
    cellular: "Мобильная сеть",
    cellularWithoutInternet: "Мобильная сеть без интернета",
    ethernet: "Ethernet",
    none: "Нет сети",
    other: "Другое",
    debug: "Отладка",
    info: "Информация",
    warning: "Предупреждение",
    error: "Ошибка",
    event: "Событие",
    context: "Технический контекст",
    unavailable: "Журнал недоступен",
  },
};

const formatDate = (value, locale) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
        hourCycle: "h23",
      }).format(new Date(value))
    : "—";

const SOURCES = ["client", "server", "mobile"];

/**
 * The fourth choice beside the sources: the plate-solving
 * probe's entries, the lines of the mobile source whose event starts with `probe.`.
 */
const PROBE = "probe";
const PROBE_EVENT = "probe.";

/** The groups of figures of a probe entry, in the order they are read. */
const PROBE_GROUPS = [
  ["probe.settings", "probeSettings"],
  ["probe.focus", "probeFocus"],
  ["probe.align", "probeAlign"],
  ["probe.solve", "probeSolve"],
];

/** The words of « Journaux » in [locale] (the owner-only fallback to English). */
export const logsText = (locale) => copyFor(copy, locale, "LogsLibrary.copy");

/** The query of the administration's route for the filters chosen. */
export function logsQuery({ level, source, address, token } = {}) {
  const parameters = new URLSearchParams({ limit: "250" });
  if (level) parameters.set("level", level);
  if (source === PROBE) {
    parameters.set("source", "mobile");
    parameters.set("event", PROBE_EVENT);
  } else if (source) parameters.set("source", source);
  // A line of the mobile source is anonymous: the mobile sources are
  // searched by the diagnostic token, the others by an address.
  const mobile = source === "mobile" || source === PROBE;
  if (mobile && token) parameters.set("token", token);
  else if (!mobile && address) parameters.set("address", address);
  return parameters.toString();
}

/** Whether a line is an entry of the plate-solving probe. */
export function isProbeEntry(entry) {
  return (
    entry?.source === "mobile" &&
    String(entry.event || "").startsWith(PROBE_EVENT)
  );
}

/**
 * A probe entry read at once: its groups of figures as rows (settings,
 * focus, alignment, solve), then the `[probe]` lines of the capture in
 * a mono block; never a JSON dump.
 */
export function ProbeLogDetails({ entry, text }) {
  const crumbs = entry.context?.breadcrumbs || [];
  return (
    <div className="admin-log-probe">
      {PROBE_GROUPS.map(([name, label]) => {
        const fields = crumbs.find((crumb) => crumb.name === name)?.fields;
        const rows = Object.entries(fields || {}).filter(
          ([, value]) => value !== null && value !== undefined,
        );
        if (!rows.length) return null;
        return (
          <section key={name} className="admin-log-probe-group">
            <h4>{text[label]}</h4>
            <dl>
              {rows.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {entry.context?.stack && (
        <section className="admin-log-probe-journal">
          <h4>{text.probeJournal}</h4>
          <pre>{entry.context.stack}</pre>
        </section>
      )}
    </div>
  );
}

const joined = (...parts) => parts.filter(Boolean).join(" ");

/**
 * The diagnosis of an entry of the application's error logs: the
 * rows the support reads first, in the order they are read.
 */
function mobileRows(entry, text, locale) {
  const diagnostic = entry.context?.diagnostic || {};
  return [
    [text.platform, joined(diagnostic.platform, diagnostic.osVersion)],
    [
      text.app,
      joined(
        diagnostic.appVersion,
        diagnostic.appBuild ? `(${diagnostic.appBuild})` : null,
      ),
    ],
    [text.model, diagnostic.model],
    [text.language, diagnostic.locale],
    [text.screen, diagnostic.screen],
    [text.route, diagnostic.route],
    [
      text.network,
      diagnostic.network && (text[diagnostic.network] || diagnostic.network),
    ],
    [text.phoneTime, entry.context?.at && formatDate(entry.context.at, locale)],
    [text.space, entry.tenantId],
    [text.diagnosticToken, entry.diagnosticToken],
  ].filter(([, value]) => value);
}

function crumbFields(fields) {
  return Object.entries(fields || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(" · ");
}

export function LogsLibrary({ locale = "fr" }) {
  const text = logsText(locale);
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  // The search by an e-mail address, or by the diagnostic token a person
  // handed over for the mobile sources: typed, then applied by
  // Enter or « Actualiser ».
  const [addressDraft, setAddressDraft] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const query = useMemo(
    () =>
      logsQuery({
        level,
        source,
        address,
        token: address,
      }),
    [level, source, address],
  );
  // Opened from another view on one installation (`?token=<diagnostic
  // token>`, the hosted service's « Ses journaux »): the mobile source,
  // searched by that token.
  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      if (token && /^[0-9a-f-]{36}$/i.test(token)) {
        setSource("mobile");
        setAddressDraft(token);
        setAddress(token);
      }
    } catch {
      // No address to read: the default filters.
    }
  }, []);
  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(`/api/admin/logs?${query}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || text.unavailable);
      setLogs(data.logs || []);
      setStatus("ready");
    } catch (reason) {
      setLogs([]);
      setError(reason.message || text.unavailable);
      setStatus("error");
    }
  };
  useEffect(() => {
    load();
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => {
    const next = addressDraft.trim();
    if (next !== address) setAddress(next);
    else load();
  };

  return (
    <section className="admin-library admin-logs-library">
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <p>{text.help}</p>
        </div>
        <form
          className="admin-logs-controls"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            refresh();
          }}
        >
          <label>
            <span>{text.allLevels}</span>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="">{text.allLevels}</option>
              {["debug", "info", "warning", "error"].map((value) => (
                <option value={value} key={value}>
                  {text[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.allSources}</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="">{text.allSources}</option>
              {[...SOURCES, PROBE].map((value) => (
                <option value={value} key={value}>
                  {text[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-logs-address">
            <span>
              {source === "mobile" || source === PROBE
                ? text.diagnosticToken
                : text.address}
            </span>
            <input
              type="search"
              inputMode={
                source === "mobile" || source === PROBE ? "text" : "email"
              }
              autoComplete="off"
              value={addressDraft}
              onChange={(event) => setAddressDraft(event.target.value)}
              onBlur={() => {
                const next = addressDraft.trim();
                if (next !== address) setAddress(next);
              }}
            />
          </label>
          <button type="submit" className="btn-secondary">
            {text.refresh}
          </button>
        </form>
      </header>
      {status === "loading" ? (
        <LoadingState className="admin-logs-status">
          {text.loading}
        </LoadingState>
      ) : status === "error" ? (
        <p className="admin-logs-status is-error">{error}</p>
      ) : logs.length ? (
        <ol className="admin-log-list">
          {logs.map((entry) => (
            <li key={entry.id} className={`is-${entry.level}`}>
              <div className="admin-log-entry-heading">
                <span className={`admin-log-level is-${entry.level}`}>
                  {text[entry.level] || entry.level}
                </span>
                <span className={`admin-log-source is-${entry.source}`}>
                  {text[entry.source] || entry.source}
                </span>
                {isProbeEntry(entry) && (
                  <span className="admin-log-source is-probe">
                    {text.probe}
                  </span>
                )}
                <time dateTime={entry.createdAt}>
                  {formatDate(entry.createdAt, locale)}
                </time>
              </div>
              <p>{entry.message}</p>
              <dl>
                <div>
                  <dt>{text.event}</dt>
                  <dd>{entry.event}</dd>
                </div>
                {entry.source === "mobile" &&
                  mobileRows(entry, text, locale).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
              {isProbeEntry(entry) ? (
                <ProbeLogDetails entry={entry} text={text} />
              ) : entry.source === "mobile" ? (
                <>
                  {entry.context?.stack && (
                    <details>
                      <summary>{text.stack}</summary>
                      <pre>{entry.context.stack}</pre>
                    </details>
                  )}
                  {entry.context?.breadcrumbs?.length > 0 && (
                    <details>
                      <summary>{text.breadcrumbs}</summary>
                      <ol className="admin-log-breadcrumbs">
                        {entry.context.breadcrumbs.map((crumb, index) => (
                          <li key={index}>
                            <time dateTime={crumb.at}>
                              {formatDate(crumb.at, locale)}
                            </time>{" "}
                            <span>{crumb.kind}</span> <b>{crumb.name}</b>
                            {crumbFields(crumb.fields) && (
                              <code>{crumbFields(crumb.fields)}</code>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              ) : (
                entry.context &&
                Object.keys(entry.context).length > 0 && (
                  <details>
                    <summary>{text.context}</summary>
                    <pre>{JSON.stringify(entry.context, null, 2)}</pre>
                  </details>
                )
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-logs-status">{text.empty}</p>
      )}
    </section>
  );
}
