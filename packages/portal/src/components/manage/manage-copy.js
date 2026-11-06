import { copyFor } from "astro-contracts/locales";

/**
 * The words of the page « Mon espace » itself (`GestionCaptures` and the
 * other boards of row 1): the name of the identity card and of the list of
 * tabs, and the seven tabs. The sections moved into the tabs keep their own
 * words (`space/space-copy.js` and their components); the tab « Captures »
 * has its own table (`captures-copy.js`). The page never says « Gestion ».
 */
const fr = {
  identityLabel: "Identité",
  tabsLabel: "Parties de l’espace",
  tabs: {
    captures: "Captures",
    plans: "Plans",
    sessions: "Sessions",
    equipment: "Matériel",
    portal: "Galerie privée",
    devices: "Appareils",
    exports: "Exports",
    settings: "Réglages",
  },
};

const en = {
  identityLabel: "Identity",
  tabsLabel: "Parts of the space",
  tabs: {
    captures: "Captures",
    plans: "Plans",
    sessions: "Sessions",
    equipment: "Equipment",
    portal: "Private gallery",
    devices: "Devices",
    exports: "Exports",
    settings: "Settings",
  },
};

const ja = {
  identityLabel: "スペースの情報",
  tabsLabel: "スペースの項目",
  tabs: {
    captures: "キャプチャ",
    plans: "プラン",
    sessions: "セッション",
    equipment: "機材",
    portal: "プライベートギャラリー",
    devices: "デバイス",
    exports: "書き出し",
    settings: "設定",
  },
};

const de = {
  identityLabel: "Identität",
  tabsLabel: "Teile des Bereichs",
  tabs: {
    captures: "Aufnahmen",
    plans: "Pläne",
    sessions: "Sitzungen",
    equipment: "Ausrüstung",
    portal: "Private Galerie",
    devices: "Geräte",
    exports: "Exporte",
    settings: "Einstellungen",
  },
};

const es = {
  identityLabel: "Identidad",
  tabsLabel: "Partes del espacio",
  tabs: {
    captures: "Capturas",
    plans: "Planes",
    sessions: "Sesiones",
    equipment: "Equipo",
    portal: "Galería privada",
    devices: "Dispositivos",
    exports: "Exportaciones",
    settings: "Configuración",
  },
};

const it = {
  identityLabel: "Identità",
  tabsLabel: "Sezioni dello spazio",
  tabs: {
    captures: "Riprese",
    plans: "Piani",
    sessions: "Sessioni",
    equipment: "Attrezzatura",
    portal: "Galleria privata",
    devices: "Dispositivi",
    exports: "Esportazioni",
    settings: "Impostazioni",
  },
};

const ptBR = {
  identityLabel: "Identidade",
  tabsLabel: "Partes do espaço",
  tabs: {
    captures: "Capturas",
    plans: "Planos",
    sessions: "Sessões",
    equipment: "Equipamento",
    portal: "Galeria privada",
    devices: "Dispositivos",
    exports: "Exportações",
    settings: "Configurações",
  },
};

const zhHans = {
  identityLabel: "空间信息",
  tabsLabel: "空间的各部分",
  tabs: {
    captures: "作品",
    plans: "计划",
    sessions: "观测记录",
    equipment: "器材",
    portal: "私人图库",
    devices: "设备",
    exports: "导出",
    settings: "设置",
  },
};

const zhHant = {
  identityLabel: "空間資訊",
  tabsLabel: "空間的各部分",
  tabs: {
    captures: "影像",
    plans: "計畫",
    sessions: "觀測記錄",
    equipment: "器材",
    portal: "私人圖庫",
    devices: "裝置",
    exports: "匯出",
    settings: "設定",
  },
};

const ru = {
  identityLabel: "Данные пространства",
  tabsLabel: "Разделы пространства",
  tabs: {
    captures: "Снимки",
    plans: "Планы",
    sessions: "Сеансы",
    equipment: "Оборудование",
    portal: "Закрытая галерея",
    devices: "Устройства",
    exports: "Экспорт",
    settings: "Настройки",
  },
};

export const manageCopy = {
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

/** The page's words in `locale` (English where a language lacks them). */
export const manageCopyFor = (locale) =>
  copyFor(manageCopy, locale, "manage-copy");

/**
 * The eight tabs of « Mon espace », in their order (aria « Parties de
 * l’espace »), each with the segment of its address under
 * `/{locale}/manage/`. A host application adds its own
 * (`portal/manage/extensions.js`: « Abonnement » is the hosted service's).
 */
export const MANAGE_TABS = Object.freeze([
  "captures",
  "plans",
  "sessions",
  "equipment",
  "portal",
  "devices",
  "exports",
  "settings",
]);

/** The address of a tab of « Mon espace ». */
export const managePath = (locale, tab = "captures", ...rest) =>
  [`/${locale}/manage/${tab}`, ...rest.map(encodeURIComponent)].join("/");
