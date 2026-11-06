"use client";

import { copyFor } from "astro-contracts/locales";
import {
  formatCaptureDate,
  formatDeclination,
  formatDuration,
  formatRightAscension,
  integrationLabel,
  optionGroup,
  optionLabel,
} from "portal/format.js";
import { message } from "portal/i18n.js";
import { CaptureQuality } from "portal/components/quality/CaptureQuality.js";
import { KnowledgeStory } from "./KnowledgeStory.js";
import { ProgressionHistory } from "./ProgressionPlayer.js";

const labels = {
  Objet: {
    en: "Object",
    ja: "天体",
    de: "Objekt",
    es: "Objeto",
    it: "Oggetto",
    "pt-BR": "Objeto",
    "zh-Hans": "天体",
    "zh-Hant": "天體",
    ru: "Объект",
  },
  Type: {
    en: "Type",
    ja: "種類",
    de: "Typ",
    es: "Tipo",
    it: "Tipo",
    "pt-BR": "Tipo",
    "zh-Hans": "类型",
    "zh-Hant": "類型",
    ru: "Тип",
  },
  Constellation: {
    en: "Constellation",
    ja: "星座",
    de: "Sternbild",
    es: "Constelación",
    it: "Costellazione",
    "pt-BR": "Constelação",
    "zh-Hans": "星座",
    "zh-Hant": "星座",
    ru: "Созвездие",
  },
  "Coordonnées (J2000)": {
    en: "Coordinates (J2000)",
    ja: "座標 (J2000)",
    de: "Koordinaten (J2000)",
    es: "Coordenadas (J2000)",
    it: "Coordinate (J2000)",
    "pt-BR": "Coordenadas (J2000)",
    "zh-Hans": "坐标（J2000）",
    "zh-Hant": "座標（J2000）",
    ru: "Координаты (J2000)",
  },
  Champ: {
    en: "Field",
    ja: "視野",
    de: "Bildfeld",
    es: "Campo",
    it: "Campo",
    "pt-BR": "Campo",
    "zh-Hans": "视场",
    "zh-Hant": "視野",
    ru: "Поле",
  },
  Échelle: {
    en: "Scale",
    ja: "スケール",
    de: "Bildmaßstab",
    es: "Escala",
    it: "Scala",
    "pt-BR": "Escala",
    "zh-Hans": "比例尺",
    "zh-Hant": "比例尺",
    ru: "Масштаб",
  },
  "Orientation du nord": {
    en: "North orientation",
    ja: "北の向き",
    de: "Nordausrichtung",
    es: "Orientación del norte",
    it: "Orientamento del nord",
    "pt-BR": "Orientação do norte",
    "zh-Hans": "北向",
    "zh-Hant": "北向",
    ru: "Ориентация севера",
  },
  Filtre: {
    en: "Filter",
    ja: "フィルター",
    de: "Filter",
    es: "Filtro",
    it: "Filtro",
    "pt-BR": "Filtro",
    "zh-Hans": "滤光片",
    "zh-Hant": "濾鏡",
    ru: "Фильтр",
  },
  Optique: {
    en: "Optics",
    ja: "光学系",
    de: "Optik",
    es: "Óptica",
    it: "Ottica",
    "pt-BR": "Óptica",
    "zh-Hans": "光学系统",
    "zh-Hant": "光學系統",
    ru: "Оптика",
  },
  Oculaire: {
    en: "Eyepiece",
    ja: "アイピース",
    de: "Okular",
    es: "Ocular",
    it: "Oculare",
    "pt-BR": "Ocular",
    "zh-Hans": "目镜",
    "zh-Hant": "目鏡",
    ru: "Окуляр",
  },
  "Date de prise de vue": {
    en: "Capture date",
    ja: "撮影日",
    de: "Aufnahmedatum",
    es: "Fecha de captura",
    it: "Data di ripresa",
    "pt-BR": "Data da captura",
    "zh-Hans": "拍摄日期",
    "zh-Hant": "拍攝日期",
    ru: "Дата съёмки",
  },
  Nuits: {
    en: "Nights",
    ja: "観測夜",
    de: "Nächte",
    es: "Noches",
    it: "Notti",
    "pt-BR": "Noites",
    "zh-Hans": "夜数",
    "zh-Hant": "夜數",
    ru: "Ночи",
  },
  Lieu: {
    en: "Location",
    ja: "撮影地",
    de: "Standort",
    es: "Lugar",
    it: "Luogo",
    "pt-BR": "Local",
    "zh-Hans": "拍摄地点",
    "zh-Hant": "拍攝地點",
    ru: "Место съёмки",
  },
  // The rows of a public capture's « Acquisition » that replace
  // « Lieu » and the day.
  "Qualité du ciel": {
    en: "Sky quality",
    ja: "空の暗さ",
    de: "Himmelsqualität",
    es: "Calidad del cielo",
    it: "Qualità del cielo",
    "pt-BR": "Qualidade do céu",
    "zh-Hans": "天空质量",
    "zh-Hant": "天空品質",
    ru: "Качество неба",
  },
  "Mois de la nuit": {
    en: "Month of the night",
    ja: "撮影月",
    de: "Monat der Nacht",
    es: "Mes de la noche",
    it: "Mese della notte",
    "pt-BR": "Mês da noite",
    "zh-Hans": "拍摄月份",
    "zh-Hant": "拍攝月份",
    ru: "Месяц ночи",
  },
  // The same row for the image of a multi-night plan, whose nights span
  // several months.
  "Mois des nuits": {
    en: "Months of the nights",
    ja: "撮影月",
    de: "Monate der Nächte",
    es: "Meses de las noches",
    it: "Mesi delle notti",
    "pt-BR": "Meses das noites",
    "zh-Hans": "拍摄月份",
    "zh-Hant": "拍攝月份",
    ru: "Месяцы ночей",
  },
  "Classe de Bortle estimée": {
    en: "Estimated Bortle class",
    ja: "推定ボートル指数",
    de: "Geschätzte Bortle-Klasse",
    es: "Clase Bortle estimada",
    it: "Classe Bortle stimata",
    "pt-BR": "Classe Bortle estimada",
    "zh-Hans": "估算波特尔等级",
    "zh-Hant": "估算波特爾等級",
    ru: "Расчётный класс по шкале Бортля",
  },
  "SQM modélisé": {
    en: "Modelled SQM",
    ja: "モデル推定 SQM",
    de: "Modellierter SQM-Wert",
    es: "SQM modelado",
    it: "SQM modellato",
    "pt-BR": "SQM modelado",
    "zh-Hans": "估算SQM",
    "zh-Hant": "估算 SQM",
    ru: "Расчётный SQM",
  },
  "Source du modèle": {
    en: "Model source",
    ja: "モデルの出典",
    de: "Quelle des Modells",
    es: "Fuente del modelo",
    it: "Fonte del modello",
    "pt-BR": "Fonte do modelo",
    "zh-Hans": "模型来源",
    "zh-Hant": "模型來源",
    ru: "Источник модели",
  },
  Caméra: {
    en: "Camera",
    ja: "カメラ",
    de: "Kamera",
    es: "Cámara",
    it: "Camera",
    "pt-BR": "Câmera",
    "zh-Hans": "相机",
    "zh-Hant": "相機",
    ru: "Камера",
  },
  Calibration: {
    en: "Calibration",
    ja: "較正",
    de: "Kalibrierung",
    es: "Calibración",
    it: "Calibrazione",
    "pt-BR": "Calibração",
    "zh-Hans": "校准",
    "zh-Hant": "校正",
    ru: "Калибровка",
  },
  "Intégration finale": {
    en: "Final integration",
    ja: "最終積分",
    de: "Endgültige Gesamtbelichtungszeit",
    es: "Integración final",
    it: "Integrazione finale",
    "pt-BR": "Integração final",
    "zh-Hans": "最终积分时间",
    "zh-Hant": "最終總曝光時間",
    ru: "Итоговая суммарная выдержка",
  },
  "Intégration affichée": {
    en: "Displayed integration",
    ja: "表示積分",
    de: "Angezeigte Gesamtbelichtungszeit",
    es: "Integración mostrada",
    it: "Integrazione mostrata",
    "pt-BR": "Integração exibida",
    "zh-Hans": "所示积分时间",
    "zh-Hant": "顯示的總曝光時間",
    ru: "Показанная суммарная выдержка",
  },
  "Temps de pose": {
    en: "Exposure time",
    ja: "露出時間",
    de: "Belichtungszeit",
    es: "Tiempo de exposición",
    it: "Tempo di posa",
    "pt-BR": "Tempo de exposição",
    "zh-Hans": "曝光时间",
    "zh-Hant": "曝光時間",
    ru: "Выдержка",
  },
  Gain: {
    en: "Gain",
    ja: "ゲイン",
    de: "Gain",
    es: "Ganancia",
    it: "Gain",
    "pt-BR": "Ganho",
    "zh-Hans": "增益",
    "zh-Hant": "增益",
    ru: "Усиление",
  },
  "Ascension droite": {
    en: "Right ascension",
    ja: "赤経",
    de: "Rektaszension",
    es: "Ascensión recta",
    it: "Ascensione retta",
    "pt-BR": "Ascensão reta",
    "zh-Hans": "赤经",
    "zh-Hant": "赤經",
    ru: "Прямое восхождение",
  },
  Déclinaison: {
    en: "Declination",
    ja: "赤緯",
    de: "Deklination",
    es: "Declinación",
    it: "Declinazione",
    "pt-BR": "Declinação",
    "zh-Hans": "赤纬",
    "zh-Hant": "赤緯",
    ru: "Склонение",
  },
  Lune: {
    en: "Moon",
    ja: "月",
    de: "Mond",
    es: "Luna",
    it: "Luna",
    "pt-BR": "Lua",
    "zh-Hans": "月球",
    "zh-Hant": "月亮",
    ru: "Луна",
  },
  "Lune (illumination calculée)": {
    en: "Moon (calculated illumination)",
    ja: "月（計算した照度）",
    de: "Mond (berechneter beleuchteter Anteil)",
    es: "Luna (iluminación calculada)",
    it: "Luna (illuminazione calcolata)",
    "pt-BR": "Lua (iluminação calculada)",
    "zh-Hans": "月球（计算的照亮比例）",
    "zh-Hant": "月亮（計算所得的照亮比例）",
    ru: "Луна (расчётная освещённость)",
  },
  Élévation: {
    en: "Altitude",
    ja: "高度",
    de: "Höhe",
    es: "Altitud",
    it: "Altezza",
    "pt-BR": "Altitude",
    "zh-Hans": "高度角",
    "zh-Hant": "高度角",
    ru: "Высота над горизонтом",
  },
  "Type de rendu": {
    en: "Rendering type",
    ja: "仕上げの種類",
    de: "Art der Darstellung",
    es: "Tipo de representación",
    it: "Tipo di resa",
    "pt-BR": "Tipo de renderização",
    "zh-Hans": "渲染类型",
    "zh-Hant": "呈現類型",
    ru: "Тип обработки",
  },
  "Courbe de couleur": {
    en: "Colour curve",
    ja: "色カーブ",
    de: "Farbkurve",
    es: "Curva de color",
    it: "Curva di colore",
    "pt-BR": "Curva de cor",
    "zh-Hans": "色彩曲线",
    "zh-Hant": "色彩曲線",
    ru: "Цветовая кривая",
  },
  "Profil de rendu": {
    en: "Rendering profile",
    ja: "仕上げプロファイル",
    de: "Darstellungsprofil",
    es: "Perfil de representación",
    it: "Profilo di resa",
    "pt-BR": "Perfil de renderização",
    "zh-Hans": "渲染配置",
    "zh-Hant": "呈現設定檔",
    ru: "Профиль обработки",
  },
  Outils: {
    en: "Tools",
    ja: "ツール",
    de: "Werkzeuge",
    es: "Herramientas",
    it: "Strumenti",
    "pt-BR": "Ferramentas",
    "zh-Hans": "工具",
    "zh-Hant": "工具",
    ru: "Инструменты",
  },
  Télescope: {
    en: "Telescope",
    ja: "望遠鏡",
    de: "Teleskop",
    es: "Telescopio",
    it: "Telescopio",
    "pt-BR": "Telescópio",
    "zh-Hans": "望远镜",
    "zh-Hant": "望遠鏡",
    ru: "Телескоп",
  },
  Monture: {
    en: "Mount",
    ja: "架台",
    de: "Montierung",
    es: "Montura",
    it: "Montatura",
    "pt-BR": "Montagem",
    "zh-Hans": "赤道仪",
    "zh-Hant": "赤道儀",
    ru: "Монтировка",
  },
  Contrôle: {
    en: "Control",
    ja: "制御",
    de: "Steuerung",
    es: "Control",
    it: "Controllo",
    "pt-BR": "Controle",
    "zh-Hans": "控制",
    "zh-Hant": "控制",
    ru: "Управление",
  },
  Guidage: {
    en: "Guiding",
    ja: "ガイド",
    de: "Guiding",
    es: "Guiado",
    it: "Guida",
    "pt-BR": "Guiagem",
    "zh-Hans": "导星",
    "zh-Hant": "導星",
    ru: "Гидирование",
  },
};

const skyTerms = {
  "Région H II / nébuleuse en émission": {
    en: "H II region / emission nebula",
    ja: "H II 領域／散光星雲",
    de: "H-II-Region / Emissionsnebel",
    es: "Región H II / nebulosa de emisión",
    it: "Regione H II / nebulosa a emissione",
    "pt-BR": "Região H II / nebulosa de emissão",
    "zh-Hans": "H II 区／发射星云",
    "zh-Hant": "H II 區／發射星雲",
    ru: "Область H II / эмиссионная туманность",
  },
  "Nébuleuse en émission": {
    en: "Emission nebula",
    ja: "散光星雲",
    de: "Emissionsnebel",
    es: "Nebulosa de emisión",
    it: "Nebulosa a emissione",
    "pt-BR": "Nebulosa de emissão",
    "zh-Hans": "发射星云",
    "zh-Hant": "發射星雲",
    ru: "Эмиссионная туманность",
  },
  "Complexe de nébuleuses en émission": {
    en: "Emission-nebula complex",
    ja: "散光星雲複合体",
    de: "Emissionsnebel-Komplex",
    es: "Complejo de nebulosas de emisión",
    it: "Complesso di nebulose a emissione",
    "pt-BR": "Complexo de nebulosas de emissão",
    "zh-Hans": "发射星云复合体",
    "zh-Hant": "發射星雲複合體",
    ru: "Комплекс эмиссионных туманностей",
  },
  "Rémanent de supernova": {
    en: "Supernova remnant",
    ja: "超新星残骸",
    de: "Supernova-Überrest",
    es: "Remanente de supernova",
    it: "Resto di supernova",
    "pt-BR": "Remanescente de supernova",
    "zh-Hans": "超新星遗迹",
    "zh-Hant": "超新星殘骸",
    ru: "Остаток сверхновой",
  },
  Céphée: {
    en: "Cepheus",
    ja: "ケフェウス座",
    de: "Kepheus",
    es: "Cefeo",
    it: "Cefeo",
    "pt-BR": "Cefeu",
    "zh-Hans": "仙王座",
    "zh-Hant": "仙王座",
    ru: "Цефей",
  },
  Cassiopée: {
    en: "Cassiopeia",
    ja: "カシオペヤ座",
    de: "Kassiopeia",
    es: "Casiopea",
    it: "Cassiopea",
    "pt-BR": "Cassiopeia",
    "zh-Hans": "仙后座",
    "zh-Hant": "仙后座",
    ru: "Кассиопея",
  },
  Cygne: {
    en: "Cygnus",
    ja: "はくちょう座",
    de: "Schwan",
    es: "Cisne",
    it: "Cigno",
    "pt-BR": "Cisne",
    "zh-Hans": "天鹅座",
    "zh-Hant": "天鵝座",
    ru: "Лебедь",
  },
};

/**
 * The French words of the acquisition data (« 3 h de poses », « juin et
 * août », « 2 pouces ») in German, Spanish, Italian and Brazilian
 * Portuguese: [from, to] pairs, read in this order. A rule per language
 * (conjunction, months, the calibration frames written as that language's
 * glossary does), not a table of texts; `null` for a language that has no
 * such rule here (the Japanese branch below is not theirs).
 */
function dataWordRewrites(locale) {
  switch (locale) {
    case "de":
      return [
        [" et ", " und "],
        ["juin", "Juni"],
        ["juillet", "Juli"],
        ["août", "August"],
        ["poses", "Einzelbilder"],
        ["2 pouces", "2 Zoll"],
        ["gain", "Gain"],
        ["dark-flats", "Dark-Flats"],
        ["darks", "Darks"],
        ["flats", "Flats"],
      ];
    case "es":
      return [
        [" et ", " y "],
        ["juin", "junio"],
        ["juillet", "julio"],
        ["août", "agosto"],
        ["poses", "tomas"],
        ["2 pouces", "2 pulgadas"],
        ["gain", "ganancia"],
      ];
    case "it":
      return [
        [" et ", " e "],
        ["juin", "giugno"],
        ["juillet", "luglio"],
        ["août", "agosto"],
        ["poses", "pose"],
        ["2 pouces", "2 pollici"],
        ["dark-flats", "dark-flat"],
        ["darks", "dark"],
        ["flats", "flat"],
      ];
    case "pt-BR":
      return [
        [" et ", " e "],
        ["juin", "junho"],
        ["juillet", "julho"],
        ["août", "agosto"],
        ["poses", "frames"],
        ["2 pouces", "2 polegadas"],
        ["gain", "ganho"],
      ];
    default:
      return null;
  }
}

/** Applies `pairs` whole word by whole word, a capital initial kept. */
function rewriteWords(value, pairs, locale) {
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return pairs.reduce((text, [from, to]) => {
    const before = /^\p{L}/u.test(from) ? "(?<![\\p{L}-])" : "";
    const after = /\p{L}$/u.test(from) ? "(?![\\p{L}-])" : "";
    return text.replace(
      new RegExp(`${before}${escaped(from)}${after}`, "giu"),
      (found) =>
        /^\p{Lu}/u.test(found)
          ? to.charAt(0).toLocaleUpperCase(locale) + to.slice(1)
          : to,
    );
  }, value);
}

function localizedValue(value, locale) {
  if (locale === "fr" || typeof value !== "string") return value;
  if (skyTerms[value]?.[locale]) return skyTerms[value][locale];
  const rewrites = dataWordRewrites(locale);
  if (rewrites) return rewriteWords(value, rewrites, locale);
  if (locale === "en")
    if (locale !== "ja")
      return value
        .replaceAll(" et ", " and ")
        .replaceAll("août", "August")
        .replaceAll("juin", "June")
        .replaceAll("juillet", "July")
        .replaceAll("poses", "frames")
        .replaceAll("darks", "dark frames")
        .replaceAll("flats", "flats")
        .replaceAll("dark-flats", "dark-flats")
        .replaceAll("gain", "gain")
        .replaceAll("2 pouces", "2-inch");
  return value
    .replaceAll(" et ", "・")
    .replaceAll("août", "8月")
    .replaceAll("juillet", "7月")
    .replaceAll("juin", "6月")
    .replaceAll("poses", "枚")
    .replaceAll("2 pouces", "2インチ")
    .replaceAll("gain", "ゲイン")
    .replaceAll("dark-flats", "ダークフラット")
    .replaceAll("darks", "ダーク")
    .replaceAll("flats", "フラット")
    .replaceAll("de ", "")
    .replaceAll(",", "、");
}

/** The label of a row of the panel (« Objet », « Qualité du ciel »…) in `locale`. */
export function detailLabel(label, locale = "en") {
  return labels[label]
    ? copyFor({ fr: label, ...labels[label] }, locale, "DetailsPanel.labels")
    : label;
}

function DefinitionList({ values, locale }) {
  return (
    <dl>
      {Object.entries(values)
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <span className="definition-row" key={label}>
            <dt>
              {labels[label]
                ? copyFor(
                    { fr: label, ...labels[label] },
                    locale,
                    "DetailsPanel.labels",
                  )
                : label}
            </dt>
            <dd>{localizedValue(value, locale)}</dd>
          </span>
        ))}
    </dl>
  );
}

function skyQualityValues(skyQuality, locale) {
  if (!Number.isInteger(skyQuality?.bortleClass)) return {};
  const sqm = Number.isFinite(skyQuality.sqm)
    ? `${new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
      }).format(skyQuality.sqm)} mag/arcsec²`
    : null;
  // Capture records written before the self-hosted raster carry the old
  // provider name and method spelling; both still have to read correctly.
  const source = /^viirs-vnl-\d{4}$/.test(skyQuality.source || "")
    ? message(locale, "eogVnlCredit")
    : skyQuality.source === "lightpollutionmap"
      ? "LightPollutionMap.info"
      : skyQuality.source;
  const method = [
    "viirs-propagated-radiance-zenith-sky-brightness",
    "viirs-pixel-radiance-zenith-sky-brightness",
    "viirs-modeled-zenith-sky-brightness",
  ].includes(skyQuality.method)
    ? message(locale, "viirsZenithSkyBrightnessModel")
    : skyQuality.method;
  return {
    "Classe de Bortle estimée": `${message(locale, "bortle")} ${skyQuality.bortleClass} — ${message(locale, "modelled")}`,
    ...(sqm ? { "SQM modélisé": sqm } : {}),
    ...(source
      ? {
          "Source du modèle": [source, method].filter(Boolean).join(" · "),
        }
      : {}),
  };
}

function skyValues(target, asset, locale) {
  const declared = target.skyTarget || {},
    sky = asset.sky || {},
    acquisition = {
      ...(target.acquisition || {}),
      ...(asset.acquisition || {}),
    };
  const orientation = Number.isFinite(sky.orientation)
    ? ((sky.orientation % 360) + 360) % 360
    : null;
  return {
    Objet:
      locale === "fr"
        ? target.objects?.join(" · ")
        : target.localizedAliases?.join(" · ") || target.objects?.join(" · "),
    Type: declared.type,
    Constellation: declared.constellation,
    "Coordonnées (J2000)":
      Number.isFinite(sky.ra) && Number.isFinite(sky.dec)
        ? `${formatRightAscension(sky.ra)} · ${formatDeclination(sky.dec)}`
        : acquisition["Ascension droite"] && acquisition["Déclinaison"]
          ? `${acquisition["Ascension droite"]} · ${acquisition["Déclinaison"]}`
          : null,
    Champ: Number.isFinite(sky.fieldWidth)
      ? `${sky.fieldWidth.toFixed(2)}° × ${sky.fieldHeight.toFixed(2)}°`
      : null,
    Échelle: Number.isFinite(sky.scale)
      ? `${sky.scale.toFixed(2)}″ / px`
      : null,
    "Orientation du nord":
      orientation === null ? null : `${orientation.toFixed(0)}°`,
  };
}

function integrationRows(target, asset, locale) {
  if (asset.kind === "progression") {
    const match = String(asset.integration || "").match(
      /(\d+)\s*[×x]\s*(\d+)\s*s/i,
    );
    return match
      ? [
          {
            filter: asset.progressionFilter || message(locale, "filter"),
            frames: +match[1],
            seconds: +match[2],
            totalSeconds: +match[1] * +match[2],
          },
        ]
      : [];
  }
  return (target.integrations || []).map((row) => ({
    ...row,
    totalSeconds: row.totalSeconds || row.frames * row.seconds,
  }));
}

function processing(target, asset, locale) {
  if (asset.kind === "sky-map")
    return {
      "Type de vue": message(locale, "contextMap"),
      Source: "Stellarium",
      Annotation: message(locale, "stellariumAnnotation"),
      Cadrage: message(locale, "stellariumFraming"),
    };
  const declared = target.processing || {};
  return {
    "Type de rendu":
      asset.renderFamily || declared.renderType || "Rendu spécifique",
    "Courbe de couleur": asset.renderFamily
      ? `Courbe ${asset.colorCurve}`
      : declared.colorCurve || "Non renseignée",
    "Profil de rendu": asset.kind !== "progression" ? declared.profile : null,
    Pipeline: asset.pipelineName || declared.pipeline,
    Outils: declared.tools,
  };
}

/** « Rendu ou étape »: a label, a native menu, its groups, one option per image. */
export function AssetVariantSelect({
  asset,
  assets,
  onSelect,
  locale = "en",
  id = "variant-select",
  className = "",
}) {
  const groups = new Map();
  for (const item of assets) {
    const group = optionGroup(item, locale);
    groups.set(group, [...(groups.get(group) || []), item]);
  }
  const order = [
    ...[...groups.keys()].filter((name) => name !== "Carte du ciel").sort(),
    ...(groups.has("Carte du ciel") ? ["Carte du ciel"] : []),
  ];
  if (!asset || !assets.length) return null;
  return (
    <label className={className} htmlFor={id}>
      {message(locale, "rendering")}
      <select
        id={id}
        value={asset.assetId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {order.map((name) => (
          <optgroup label={name} key={name}>
            {groups.get(name).map((item) => (
              <option value={item.assetId} key={item.assetId}>
                {optionLabel(item, locale)}
                {item.integration ? ` — ${integrationLabel(item, locale)}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function DetailMetadataSections({ target, asset, locale = "en" }) {
  const rows = integrationRows(target, asset, locale);
  const total = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  const acquisition = {
    ...(target.acquisition || {}),
    ...(asset.acquisition || {}),
  };
  if (rows.length)
    for (const key of Object.keys(acquisition))
      if (key.toLowerCase().includes("intégration")) delete acquisition[key];
  if (asset.date) {
    for (const key of Object.keys(acquisition))
      if (key.toLowerCase().includes("date")) delete acquisition[key];
    acquisition["Date de prise de vue"] = formatCaptureDate(asset.date, locale);
  }
  if (asset.progressionFilter) acquisition.Filtre = asset.progressionFilter;
  Object.assign(
    acquisition,
    skyQualityValues(asset.skyQuality || target.skyQuality, locale),
  );
  return (
    <>
      <section>
        <h3>{message(locale, "target")}</h3>
        <DefinitionList
          values={skyValues(target, asset, locale)}
          locale={locale}
        />
      </section>
      <section>
        <h3>{message(locale, "acquisition")}</h3>
        {rows.length > 0 && (
          <div className="integration-table">
            <table>
              <thead>
                <tr>
                  <th>{message(locale, "filter")}</th>
                  <th>{message(locale, "frames")}</th>
                  <th>{message(locale, "integration")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.filter}-${index}`}>
                    <th>{localizedValue(row.filter, locale)}</th>
                    <td>
                      {row.frames} × {row.seconds} s
                    </td>
                    <td>{formatDuration(row.totalSeconds, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="2">{message(locale, "total")}</th>
                  <td>{formatDuration(total, locale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <DefinitionList values={acquisition} locale={locale} />
      </section>
      <section>
        <h3>{message(locale, "processing")}</h3>
        <DefinitionList
          values={processing(target, asset, locale)}
          locale={locale}
        />
      </section>
      {asset.captureQuality && (
        <CaptureQuality quality={asset.captureQuality} locale={locale} />
      )}
      <section>
        <h3>{message(locale, "equipment")}</h3>
        <DefinitionList values={target.equipment || {}} locale={locale} />
      </section>
      {target.targetKnowledge?.story && (
        <section>
          <h3>{message(locale, "aboutTarget")}</h3>
          <KnowledgeStory
            knowledge={target.targetKnowledge}
            paragraphs={(Array.isArray(target.targetKnowledge.storyParagraphs)
              ? target.targetKnowledge.storyParagraphs
              : [target.targetKnowledge.story]
            ).filter(Boolean)}
            locale={locale}
          />
        </section>
      )}
      {(target.description || []).length > 0 && (
        <section>
          <h3>
            {target.targetKnowledge
              ? message(locale, "imageNote")
              : message(locale, "about")}
          </h3>
          {target.description.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </section>
      )}
      <section>
        <h3>{message(locale, "technical")}</h3>
        {(target.technicalDescription || []).map((text, index) => (
          <p key={index}>{text}</p>
        ))}
      </section>
      {(target.relatedLinks?.length || target.stellarium) && (
        <section>
          <h3>{message(locale, "relatedLinks")}</h3>
          <div className="related-links">
            {(target.relatedLinks || []).map((link) => (
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                key={link.url}
              >
                <strong>{link.label}</strong>
                <span>{link.note}</span>
              </a>
            ))}
            {target.stellarium && (
              <a
                href={`https://stellarium-web.org/skysource/${encodeURIComponent(target.stellarium.source || target.objects?.[0])}?fov=${target.stellarium.fov || 3.34}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{message(locale, "openStellarium")}</strong>
                <span>{target.stellarium.frameNote}</span>
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export function DetailsPanel({
  target,
  asset,
  assets,
  onSelect,
  playing,
  onTogglePlay,
  interval,
  onInterval,
  collapsed,
  onToggleDetails,
  toggleChevron,
  locale = "en",
}) {
  return (
    <aside className="details">
      {!collapsed && (
        <button
          className="details-toggle details-panel-toggle"
          onClick={onToggleDetails}
          aria-label={message(locale, "hideDetails")}
        >
          <svg viewBox="0 0 24 24">
            <path d={toggleChevron} />
          </svg>
        </button>
      )}
      <h2>{target.title}</h2>
      <p className="subtitle">
        {asset.kind === "sky-map"
          ? `${message(locale, "contextMap")} · Stellarium`
          : [
              asset.progressionLabel || optionLabel(asset, locale),
              integrationLabel(asset, locale),
              asset.progressionFilter,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      <AssetVariantSelect
        asset={asset}
        assets={assets}
        onSelect={onSelect}
        locale={locale}
      />
      {asset.downloadUrl && (
        <div className="download-row">
          <a
            className="btn-secondary download"
            href={asset.downloadUrl}
            download
          >
            {message(locale, "download")}
          </a>
        </div>
      )}
      <DetailMetadataSections target={target} asset={asset} locale={locale} />
      <ProgressionHistory
        title={message(locale, "integrationProgression")}
        steps={(target.history || []).map((item) => ({
          id: item.assetId,
          primary: item.integration || integrationLabel(item, locale),
          secondary: item.progressionLabel,
          title: [item.progressionPeriod, item.progressionFilter]
            .filter(Boolean)
            .join(" · "),
        }))}
        activeId={asset.assetId}
        onSelect={onSelect}
        playing={playing}
        onTogglePlay={onTogglePlay}
        interval={interval}
        onInterval={onInterval}
        locale={locale}
      />
    </aside>
  );
}
