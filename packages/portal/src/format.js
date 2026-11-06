import { copyFor } from "astro-contracts/locales";
import { durationText } from "./written-forms.js";

/**
 * A total in seconds written as a duration (« 1 h 30 », « 40 min »), the
 * one writing of `written-forms.js`; nothing for a missing total.
 */
export function formatDuration(seconds, locale) {
  if (!seconds) return "";
  return durationText(seconds / 60, locale);
}

export function integrationLabel(asset, locale) {
  return asset?.integration
    ? `${asset.integration}${asset.totalSeconds ? ` (${formatDuration(asset.totalSeconds, locale)})` : ""}`
    : "";
}

export function formatCaptureDate(value, locale = "fr-FR") {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!match) return "Date non renseignée";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ),
  );
}

export function formatRightAscension(degrees) {
  const total = Math.round(((degrees / 15 + 24) % 24) * 3600);
  return `${Math.floor(total / 3600) % 24}h ${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}m ${String(total % 60).padStart(2, "0")}s`;
}

export function formatDeclination(degrees) {
  const sign = degrees < 0 ? "−" : "+";
  const total = Math.round(Math.abs(degrees) * 3600);
  return `${sign}${Math.floor(total / 3600)}° ${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}′ ${String(total % 60).padStart(2, "0")}″`;
}

export const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae");

export function orderedAssets(target) {
  const maps = target.variants.filter((asset) => asset.kind === "sky-map");
  return [
    ...target.variants.filter((asset) => asset.kind !== "sky-map"),
    ...maps,
  ];
}

const optionLabels = {
  en: {
    progression: "Progression",
    natural: "Natural rendering",
    curve: "colour curve",
    skyMap: "Sky map",
    main: "Main version",
    step: "Step",
  },
  ja: {
    progression: "積分の進行",
    natural: "自然仕上げ",
    curve: "カーブ",
    skyMap: "星図",
    main: "メインバージョン",
    step: "段階",
  },
  de: {
    progression: "Verlauf",
    natural: "Natürliche Darstellung",
    curve: "Farbkurve",
    skyMap: "Sternkarte",
    main: "Hauptversion",
    step: "Schritt",
  },
  es: {
    progression: "Progresión",
    natural: "Representación natural",
    curve: "curva de color",
    skyMap: "Mapa del cielo",
    main: "Versión principal",
    step: "Etapa",
  },
  it: {
    progression: "Progressione",
    natural: "Resa naturale",
    curve: "curva di colore",
    skyMap: "Mappa del cielo",
    main: "Versione principale",
    step: "Fase",
  },
  "pt-BR": {
    progression: "Progressão",
    natural: "Renderização natural",
    curve: "curva de cor",
    skyMap: "Mapa celeste",
    main: "Versão principal",
    step: "Etapa",
  },
  "zh-Hans": {
    progression: "积分进程",
    natural: "自然渲染",
    curve: "色彩曲线",
    skyMap: "星图",
    main: "主版本",
    step: "阶段",
  },
  "zh-Hant": {
    progression: "累積進程",
    natural: "自然呈現",
    curve: "色彩曲線",
    skyMap: "星圖",
    main: "主要版本",
    step: "階段",
  },
  ru: {
    progression: "Накопление",
    natural: "Естественная обработка",
    curve: "цветовая кривая",
    skyMap: "Карта неба",
    main: "Основная версия",
    step: "Этап",
  },
  fr: {
    progression: "Progression",
    natural: "Rendu naturel",
    curve: "courbe",
    skyMap: "Carte du ciel",
    main: "Version principale",
    step: "Étape",
  },
};

export function optionGroup(asset, locale = "fr") {
  const labels = copyFor(optionLabels, locale, "format.optionLabels");
  if (asset.kind === "progression")
    return `${labels.progression} — ${asset.renderFamily || labels.natural}${asset.colorCurve ? ` · ${labels.curve} ${asset.colorCurve}` : ""}`;
  if (asset.kind === "sky-map") return labels.skyMap;
  if (asset.renderFamily)
    return `${asset.renderFamily} — ${labels.curve} ${asset.colorCurve}`;
  return labels.main;
}

export function optionLabel(asset, locale = "fr") {
  const labels = copyFor(optionLabels, locale, "format.optionLabels");
  if (asset.kind === "progression")
    return `${asset.progressionLabel || labels.step} — ${asset.renderFamily || labels.natural}${asset.colorCurve ? ` · ${labels.curve} ${asset.colorCurve}` : ""}`;
  return asset.assetLabel || asset.variant;
}
