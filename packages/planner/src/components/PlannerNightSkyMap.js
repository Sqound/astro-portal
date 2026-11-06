"use client";

import { copyFor } from "portal/locales.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { message } from "portal/i18n.js";
import { targetImageVariant } from "portal/target-image-variants.js";
import {
  EyepieceViewImage,
  eyepieceViewLabel,
  useEyepieceSetting,
  useEyepieceView,
} from "./EyepieceViewImage.js";
import { ObjectPictogram } from "portal/components/ObjectPictogram.js";
import { DefineEquipmentLink, EquipmentPicker } from "./EquipmentPicker.js";
import { toggledTargetId } from "../selection.js";
import {
  detailedSurveyVisibleAtZoom,
  framingPreviewUrl,
  plannerSurveyUrl,
} from "../surveys.js";
import { framingDraft } from "../framings.js";
import {
  mapDisplayedTargets,
  mapMarkerPresentation,
  mapMoveSeconds,
  uniqueMapTargets,
} from "../framing-editor.js";
import { framingSearchLabel } from "../framing-target-search.js";
import {
  bortleClasses,
  bortleLimitingMagnitude,
  engineSkyBrightness,
  mapBortleClass,
} from "../bortle.js";
import { layOutMapLabels, mapLabelPriority } from "../map-labels.js";
import {
  createMapTapCycle,
  mapMarkerCandidatesAtPoint,
} from "../map-tap-cycle.js";
import { framingTargetsUnderFrame } from "../framing-targets.js";
import {
  framingAngleAfterWheel,
  framingCaptionWithAngle,
  framingTurnStyle,
  turnedFrameHalfHeight,
} from "../framing-rotation.js";
import {
  clampMapFov,
  formatMapFov,
  pinchedMapFov,
  roundedMapFov,
  zoomedMapFov,
} from "../sky-projection.js";
import {
  equipmentFieldProjection,
  formatEquipmentField,
  framingCentre,
  offsetCoordinate,
  projectPoint,
} from "../sky-map-geometry.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import {
  loadStellariumTranslations,
  translateStellariumLabel,
} from "portal/stellarium-translations.js";

const engineUrl = "/vendor/stellarium/stellarium-web-engine.js";
const engineWasmUrl = "/vendor/stellarium/stellarium-web-engine.wasm";
const skyDataUrl = "/vendor/stellarium/skydata/";
const milkyWaySurveyUrl = "/api/stellarium/milkyway";
const defaultMapFovDegrees = 120;

// How long the bar stays open with nothing touching it before it folds away
// again -- four seconds. A bar that covers the sky permanently is the wrong
// default on either platform: it announces itself when the map scrolls into
// view, then folds into the field-of-view readout, which is also the handle a
// click reopens it on. The fold itself is a CSS transition, and its duration is
// 280 ms.
const mapControlsIdleDelayMs = 4000;

// How long after the last projected frame the label arrangement is
// recomputed. Laying out the names means measuring every visible `<span>`,
// which forces a layout: doing that inside the 30-60 Hz projection loop would
// make a drag of the sky stutter, so it waits for the gesture to settle
// instead -- the arrangement only has to be right where the observer stops.
const mapLabelLayoutDelayMs = 140;

// … but never wait longer than this for a pause that may not come.
const mapLabelLayoutMaximumWaitMs = 600;

let engineLoader;

const copy = {
  en: {
    mapSection: "Map",
    title: "Tonight’s sky",
    intro:
      "See the recommended targets where they sit in the sky for this plan.",
    suitable: "Suitable targets",
    suggestions: "Suggestions",
    plans: "Plans",
    toggleAllSuggestions: "Show or hide all suggestions",
    toggleAllPlans: "Show or hide all plans",
    plan: "My plan",
    noPlans: "No plan for this night yet.",
    print: "Print sky map",
    loading: "Loading the interactive sky…",
    unavailable: "The interactive sky map is unavailable.",
    nebula: "Nebulae",
    galaxy: "Galaxies",
    cluster: "Star clusters",
    other: "Other targets",
    selected: "Selected in plans",
    emissionNebula: "Emission nebulae",
    reflectionNebula: "Reflection nebulae",
    planetaryNebula: "Planetary nebulae",
    globularCluster: "Globular clusters",
    openCluster: "Open clusters",
    supernovaRemnant: "Supernova remnants",
    planet: "Planets",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    constellationOff: "Constellations hidden — show constellation lines",
    constellationLines:
      "Constellation lines shown — show constellation drawings",
    constellationArt: "Constellation drawings shown — hide constellations",
    targetMarkersLabeled:
      "Target markers and labels shown — hide target labels",
    targetMarkersOnly: "Target labels hidden — hide target markers",
    targetMarkersOff: "Target markers hidden — show target markers and labels",
    showControls: "Show the map controls",
    hideControls: "Hide the map controls",
    resetZoom: "Reset the zoom",
    bortleClass: "Bortle {class}",
    bortlePicker: "Sky brightness — Bortle class",
    bortleFromPlace: "This location's own class",
    bortleFromPlaceUnknown: "This location's own class — not estimated yet",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Show celestial coordinates",
    hideCelestialCoordinates: "Hide celestial coordinates",
    zoomLevel: "Current field of view",
    equipmentField: "Selected equipment field of view",
    controls: "Sky map controls",
    useFraming: "Use this framing",
    centerTarget: "Center on this target",
    wideSurveyCredit: "CTA-FRAM colour · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS colour · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 red monochrome · STScI / POSS-II",
  },
  fr: {
    mapSection: "Carte",
    title: "Le ciel de cette nuit",
    intro:
      "Retrouvez les cibles proposées à leur place dans le ciel pour ce plan.",
    suitable: "Cibles adaptées",
    suggestions: "Suggestions",
    plans: "Plans",
    toggleAllSuggestions: "Afficher ou masquer toutes les suggestions",
    toggleAllPlans: "Afficher ou masquer tous les plans",
    plan: "Mon plan",
    noPlans: "Aucun plan pour cette nuit.",
    print: "Imprimer la carte du ciel",
    loading: "Chargement du ciel interactif…",
    unavailable: "La carte du ciel interactive est indisponible.",
    nebula: "Nébuleuses",
    galaxy: "Galaxies",
    cluster: "Amas d’étoiles",
    other: "Autres cibles",
    selected: "Sélectionnées dans les plans",
    emissionNebula: "Nébuleuses en émission",
    reflectionNebula: "Nébuleuses en réflexion",
    planetaryNebula: "Nébuleuses planétaires",
    globularCluster: "Amas globulaires",
    openCluster: "Amas ouverts",
    supernovaRemnant: "Rémanents de supernova",
    planet: "Planètes",
    zoomIn: "Agrandir la carte",
    zoomOut: "Réduire la carte",
    constellationOff: "Constellations masquées — afficher les traits",
    constellationLines: "Traits affichés — afficher les dessins",
    constellationArt: "Dessins affichés — masquer les constellations",
    targetMarkersLabeled:
      "Marqueurs et étiquettes affichés — masquer les étiquettes",
    targetMarkersOnly: "Étiquettes masquées — masquer les marqueurs",
    targetMarkersOff: "Marqueurs masqués — afficher marqueurs et étiquettes",
    showControls: "Afficher les commandes de la carte",
    hideControls: "Masquer les commandes de la carte",
    resetZoom: "Revenir au zoom par défaut",
    bortleClass: "Bortle {class}",
    bortlePicker: "Luminosité du ciel — classe de Bortle",
    bortleFromPlace: "Classe du lieu",
    bortleFromPlaceUnknown: "Classe du lieu — pas encore estimée",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Afficher les coordonnées célestes",
    hideCelestialCoordinates: "Masquer les coordonnées célestes",
    zoomLevel: "Niveau de zoom actuel",
    equipmentField: "Champ du matériel sélectionné",
    controls: "Contrôles de la carte du ciel",
    useFraming: "Utiliser ce cadrage",
    centerTarget: "Centrer sur cette cible",
    wideSurveyCredit: "CTA-FRAM couleur · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS couleur · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 rouge monochrome · STScI / POSS-II",
  },
  ja: {
    mapSection: "星図",
    title: "今夜の空",
    intro: "このプランに合う空の位置で、おすすめの天体を確認できます。",
    suitable: "適した天体",
    suggestions: "候補",
    plans: "プラン",
    toggleAllSuggestions: "すべての候補を表示または非表示",
    toggleAllPlans: "すべてのプランを表示または非表示",
    plan: "このプラン",
    noPlans: "この夜のプランはまだありません。",
    print: "星図を印刷",
    loading: "インタラクティブ星図を読み込んでいます…",
    unavailable: "インタラクティブ星図を表示できません。",
    nebula: "星雲",
    galaxy: "銀河",
    cluster: "星団",
    other: "その他の天体",
    selected: "プランで選択済み",
    emissionNebula: "散光星雲",
    reflectionNebula: "反射星雲",
    planetaryNebula: "惑星状星雲",
    globularCluster: "球状星団",
    openCluster: "散開星団",
    supernovaRemnant: "超新星残骸",
    planet: "惑星",
    zoomIn: "拡大",
    zoomOut: "縮小",
    constellationOff: "星座を非表示 — 星座線を表示",
    constellationLines: "星座線を表示中 — 星座絵を表示",
    constellationArt: "星座絵を表示中 — 星座を非表示",
    targetMarkersLabeled: "マーカーとラベルを表示中 — ラベルを隠す",
    targetMarkersOnly: "ラベルを非表示 — マーカーを隠す",
    targetMarkersOff: "マーカーを非表示 — マーカーとラベルを表示",
    showControls: "地図の操作パネルを表示",
    hideControls: "地図の操作パネルを隠す",
    resetZoom: "標準の拡大率に戻す",
    bortleClass: "ボートル {class}",
    bortlePicker: "空の明るさ — ボートルクラス",
    bortleFromPlace: "この場所のクラス",
    bortleFromPlaceUnknown: "この場所のクラス — まだ推定されていません",
    bortleLimitingMagnitude: "{magnitude} 等級",
    showCelestialCoordinates: "天球座標を表示",
    hideCelestialCoordinates: "天球座標を隠す",
    zoomLevel: "現在の視野角",
    equipmentField: "選択中の機材の写野",
    controls: "星図の操作",
    useFraming: "この構図を使う",
    centerTarget: "この天体を中央に表示",
    wideSurveyCredit: "CTA-FRAM カラー · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS カラー · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 赤色モノクロ · STScI / POSS-II",
  },
  de: {
    mapSection: "Karte",
    title: "Der Himmel heute Nacht",
    intro:
      "Sieh dir die empfohlenen Ziele an ihrer Position am Himmel für diesen Plan an.",
    suitable: "Passende Ziele",
    suggestions: "Vorschläge",
    plans: "Pläne",
    toggleAllSuggestions: "Alle Vorschläge anzeigen oder ausblenden",
    toggleAllPlans: "Alle Pläne anzeigen oder ausblenden",
    plan: "Mein Plan",
    noPlans: "Noch kein Plan für diese Nacht.",
    print: "Sternkarte drucken",
    loading: "Der interaktive Himmel wird geladen …",
    unavailable: "Die interaktive Sternkarte ist nicht verfügbar.",
    nebula: "Nebel",
    galaxy: "Galaxien",
    cluster: "Sternhaufen",
    other: "Weitere Ziele",
    selected: "In Plänen ausgewählt",
    emissionNebula: "Emissionsnebel",
    reflectionNebula: "Reflexionsnebel",
    planetaryNebula: "Planetarische Nebel",
    globularCluster: "Kugelsternhaufen",
    openCluster: "Offene Sternhaufen",
    supernovaRemnant: "Supernova-Überreste",
    planet: "Planeten",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    constellationOff: "Sternbilder ausgeblendet – Sternbildlinien anzeigen",
    constellationLines:
      "Sternbildlinien angezeigt – Sternbildzeichnungen anzeigen",
    constellationArt: "Sternbildzeichnungen angezeigt – Sternbilder ausblenden",
    targetMarkersLabeled:
      "Zielmarkierungen und Beschriftungen angezeigt – Zielbeschriftungen ausblenden",
    targetMarkersOnly:
      "Zielbeschriftungen ausgeblendet – Zielmarkierungen ausblenden",
    targetMarkersOff:
      "Zielmarkierungen ausgeblendet – Zielmarkierungen und Beschriftungen anzeigen",
    showControls: "Kartensteuerung anzeigen",
    hideControls: "Kartensteuerung ausblenden",
    resetZoom: "Zoom zurücksetzen",
    bortleClass: "Bortle {class}",
    bortlePicker: "Himmelshelligkeit – Bortle-Klasse",
    bortleFromPlace: "Klasse dieses Ortes",
    bortleFromPlaceUnknown: "Klasse dieses Ortes – noch nicht geschätzt",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Himmelskoordinaten anzeigen",
    hideCelestialCoordinates: "Himmelskoordinaten ausblenden",
    zoomLevel: "Aktuelles Bildfeld",
    equipmentField: "Bildfeld der gewählten Ausrüstung",
    controls: "Steuerung der Sternkarte",
    useFraming: "Diesen Bildausschnitt verwenden",
    centerTarget: "Auf dieses Ziel zentrieren",
    wideSurveyCredit: "CTA-FRAM Farbe · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS Farbe · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 rot monochrom · STScI / POSS-II",
  },
  es: {
    mapSection: "Mapa",
    title: "El cielo de esta noche",
    intro:
      "Mira los objetivos recomendados en su posición en el cielo para este plan.",
    suitable: "Objetivos adecuados",
    suggestions: "Sugerencias",
    plans: "Planes",
    toggleAllSuggestions: "Mostrar u ocultar todas las sugerencias",
    toggleAllPlans: "Mostrar u ocultar todos los planes",
    plan: "Mi plan",
    noPlans: "Todavía no hay ningún plan para esta noche.",
    print: "Imprimir el mapa del cielo",
    loading: "Cargando el cielo interactivo…",
    unavailable: "El mapa del cielo interactivo no está disponible.",
    nebula: "Nebulosas",
    galaxy: "Galaxias",
    cluster: "Cúmulos estelares",
    other: "Otros objetivos",
    selected: "Seleccionados en los planes",
    emissionNebula: "Nebulosas de emisión",
    reflectionNebula: "Nebulosas de reflexión",
    planetaryNebula: "Nebulosas planetarias",
    globularCluster: "Cúmulos globulares",
    openCluster: "Cúmulos abiertos",
    supernovaRemnant: "Remanentes de supernova",
    planet: "Planetas",
    zoomIn: "Acercar",
    zoomOut: "Alejar",
    constellationOff:
      "Constelaciones ocultas — mostrar las líneas de las constelaciones",
    constellationLines:
      "Líneas de las constelaciones visibles — mostrar los dibujos de las constelaciones",
    constellationArt:
      "Dibujos de las constelaciones visibles — ocultar las constelaciones",
    targetMarkersLabeled:
      "Marcadores y etiquetas de objetivos visibles — ocultar las etiquetas",
    targetMarkersOnly:
      "Etiquetas de objetivos ocultas — ocultar los marcadores",
    targetMarkersOff:
      "Marcadores de objetivos ocultos — mostrar marcadores y etiquetas",
    showControls: "Mostrar los controles del mapa",
    hideControls: "Ocultar los controles del mapa",
    resetZoom: "Restablecer el zoom",
    bortleClass: "Bortle {class}",
    bortlePicker: "Brillo del cielo — clase Bortle",
    bortleFromPlace: "Clase del lugar",
    bortleFromPlaceUnknown: "Clase del lugar — aún sin estimar",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Mostrar las coordenadas celestes",
    hideCelestialCoordinates: "Ocultar las coordenadas celestes",
    zoomLevel: "Campo de visión actual",
    equipmentField: "Campo de visión del equipo seleccionado",
    controls: "Controles del mapa del cielo",
    useFraming: "Usar este encuadre",
    centerTarget: "Centrar en este objetivo",
    wideSurveyCredit: "CTA-FRAM en color · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS en color · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 monocromo rojo · STScI / POSS-II",
  },
  it: {
    mapSection: "Mappa",
    title: "Il cielo di questa notte",
    intro:
      "Vedi i target consigliati nella posizione che occupano in cielo per questo piano.",
    suitable: "Target adatti",
    suggestions: "Suggerimenti",
    plans: "Piani",
    toggleAllSuggestions: "Mostrare o nascondere tutti i suggerimenti",
    toggleAllPlans: "Mostrare o nascondere tutti i piani",
    plan: "Il mio piano",
    noPlans: "Ancora nessun piano per questa notte.",
    print: "Stampare la mappa del cielo",
    loading: "Caricamento del cielo interattivo…",
    unavailable: "La mappa del cielo interattiva non è disponibile.",
    nebula: "Nebulose",
    galaxy: "Galassie",
    cluster: "Ammassi stellari",
    other: "Altri target",
    selected: "Selezionati nei piani",
    emissionNebula: "Nebulose a emissione",
    reflectionNebula: "Nebulose a riflessione",
    planetaryNebula: "Nebulose planetarie",
    globularCluster: "Ammassi globulari",
    openCluster: "Ammassi aperti",
    supernovaRemnant: "Resti di supernova",
    planet: "Pianeti",
    zoomIn: "Ingrandire",
    zoomOut: "Rimpicciolire",
    constellationOff:
      "Costellazioni nascoste — mostrare le linee delle costellazioni",
    constellationLines:
      "Linee delle costellazioni mostrate — mostrare i disegni delle costellazioni",
    constellationArt:
      "Disegni delle costellazioni mostrati — nascondere le costellazioni",
    targetMarkersLabeled:
      "Marcatori ed etichette dei target mostrati — nascondere le etichette dei target",
    targetMarkersOnly:
      "Etichette dei target nascoste — nascondere i marcatori dei target",
    targetMarkersOff:
      "Marcatori dei target nascosti — mostrare marcatori ed etichette dei target",
    showControls: "Mostrare i comandi della mappa",
    hideControls: "Nascondere i comandi della mappa",
    resetZoom: "Ripristinare lo zoom predefinito",
    bortleClass: "Bortle {class}",
    bortlePicker: "Luminosità del cielo — classe Bortle",
    bortleFromPlace: "Classe del luogo",
    bortleFromPlaceUnknown: "Classe del luogo — non ancora stimata",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Mostrare le coordinate celesti",
    hideCelestialCoordinates: "Nascondere le coordinate celesti",
    zoomLevel: "Campo di vista attuale",
    equipmentField: "Campo di vista dell’attrezzatura selezionata",
    controls: "Comandi della mappa del cielo",
    useFraming: "Usare questa inquadratura",
    centerTarget: "Centrare su questo target",
    wideSurveyCredit: "CTA-FRAM a colori · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS a colori · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 rosso monocromatico · STScI / POSS-II",
  },
  "pt-BR": {
    mapSection: "Mapa",
    title: "O céu desta noite",
    intro:
      "Veja os alvos recomendados na posição em que estão no céu para este plano.",
    suitable: "Alvos adequados",
    suggestions: "Sugestões",
    plans: "Planos",
    toggleAllSuggestions: "Mostrar ou ocultar todas as sugestões",
    toggleAllPlans: "Mostrar ou ocultar todos os planos",
    plan: "Meu plano",
    noPlans: "Ainda não há plano para esta noite.",
    print: "Imprimir mapa celeste",
    loading: "Carregando o céu interativo…",
    unavailable: "O mapa celeste interativo não está disponível.",
    nebula: "Nebulosas",
    galaxy: "Galáxias",
    cluster: "Aglomerados estelares",
    other: "Outros alvos",
    selected: "Selecionados nos planos",
    emissionNebula: "Nebulosas de emissão",
    reflectionNebula: "Nebulosas de reflexão",
    planetaryNebula: "Nebulosas planetárias",
    globularCluster: "Aglomerados globulares",
    openCluster: "Aglomerados abertos",
    supernovaRemnant: "Remanescentes de supernova",
    planet: "Planetas",
    zoomIn: "Ampliar",
    zoomOut: "Reduzir",
    constellationOff:
      "Constelações ocultas — mostrar as linhas das constelações",
    constellationLines:
      "Linhas das constelações exibidas — mostrar os desenhos das constelações",
    constellationArt:
      "Desenhos das constelações exibidos — ocultar as constelações",
    targetMarkersLabeled:
      "Marcadores e rótulos dos alvos exibidos — ocultar os rótulos dos alvos",
    targetMarkersOnly:
      "Rótulos dos alvos ocultos — ocultar os marcadores dos alvos",
    targetMarkersOff:
      "Marcadores dos alvos ocultos — mostrar marcadores e rótulos dos alvos",
    showControls: "Mostrar os controles do mapa",
    hideControls: "Ocultar os controles do mapa",
    resetZoom: "Restaurar o zoom",
    bortleClass: "Bortle {class}",
    bortlePicker: "Brilho do céu — classe Bortle",
    bortleFromPlace: "Classe do local",
    bortleFromPlaceUnknown: "Classe do local — ainda não estimada",
    bortleLimitingMagnitude: "mag {magnitude}",
    showCelestialCoordinates: "Mostrar as coordenadas celestes",
    hideCelestialCoordinates: "Ocultar as coordenadas celestes",
    zoomLevel: "Campo de visão atual",
    equipmentField: "Campo de visão do equipamento selecionado",
    controls: "Controles do mapa celeste",
    useFraming: "Usar este enquadramento",
    centerTarget: "Centralizar neste alvo",
    wideSurveyCredit: "CTA-FRAM em cores · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS em cores · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 monocromático vermelho · STScI / POSS-II",
  },
  "zh-Hans": {
    mapSection: "星图",
    title: "今晚的星空",
    intro: "在此计划对应的天空位置查看推荐目标。",
    suitable: "适合的目标",
    suggestions: "推荐",
    plans: "计划",
    toggleAllSuggestions: "显示或隐藏全部推荐",
    toggleAllPlans: "显示或隐藏全部计划",
    plan: "我的计划",
    noPlans: "这一夜还没有计划。",
    print: "打印星图",
    loading: "正在加载交互式星空…",
    unavailable: "交互式星图不可用。",
    nebula: "星云",
    galaxy: "星系",
    cluster: "星团",
    other: "其他目标",
    selected: "已选入计划",
    emissionNebula: "发射星云",
    reflectionNebula: "反射星云",
    planetaryNebula: "行星状星云",
    globularCluster: "球状星团",
    openCluster: "疏散星团",
    supernovaRemnant: "超新星遗迹",
    planet: "行星",
    zoomIn: "放大",
    zoomOut: "缩小",
    constellationOff: "星座已隐藏——显示星座连线",
    constellationLines: "星座连线已显示——显示星座图案",
    constellationArt: "星座图案已显示——隐藏星座",
    targetMarkersLabeled: "目标标记和标签已显示——隐藏目标标签",
    targetMarkersOnly: "目标标签已隐藏——隐藏目标标记",
    targetMarkersOff: "目标标记已隐藏——显示目标标记和标签",
    showControls: "显示地图控件",
    hideControls: "隐藏地图控件",
    resetZoom: "重置缩放",
    bortleClass: "波特尔{class}级",
    bortlePicker: "天空亮度——波特尔等级",
    bortleFromPlace: "该地点的等级",
    bortleFromPlaceUnknown: "该地点的等级——尚未估算",
    bortleLimitingMagnitude: "{magnitude}等",
    showCelestialCoordinates: "显示天球坐标",
    hideCelestialCoordinates: "隐藏天球坐标",
    zoomLevel: "当前视场",
    equipmentField: "所选设备的视场",
    controls: "星图控件",
    useFraming: "使用此构图",
    centerTarget: "以此目标为中心",
    wideSurveyCredit: "CTA-FRAM彩色 · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS彩色 · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2红色单色 · STScI / POSS-II",
  },
  "zh-Hant": {
    mapSection: "星圖",
    title: "今晚的星空",
    intro: "在此計畫對應的天空位置查看推薦目標。",
    suitable: "適合的目標",
    suggestions: "推薦",
    plans: "計畫",
    toggleAllSuggestions: "顯示或隱藏所有推薦",
    toggleAllPlans: "顯示或隱藏所有計畫",
    plan: "我的計畫",
    noPlans: "這一夜尚無計畫。",
    print: "列印星圖",
    loading: "正在載入互動式星空…",
    unavailable: "無法使用互動式星圖。",
    nebula: "星雲",
    galaxy: "星系",
    cluster: "星團",
    other: "其他目標",
    selected: "已選入計畫",
    emissionNebula: "發射星雲",
    reflectionNebula: "反射星雲",
    planetaryNebula: "行星狀星雲",
    globularCluster: "球狀星團",
    openCluster: "疏散星團",
    supernovaRemnant: "超新星殘骸",
    planet: "行星",
    zoomIn: "放大",
    zoomOut: "縮小",
    constellationOff: "星座已隱藏——顯示星座連線",
    constellationLines: "星座連線已顯示——顯示星座圖案",
    constellationArt: "星座圖案已顯示——隱藏星座",
    targetMarkersLabeled: "目標標記與標籤已顯示——隱藏目標標籤",
    targetMarkersOnly: "目標標籤已隱藏——隱藏目標標記",
    targetMarkersOff: "目標標記已隱藏——顯示目標標記與標籤",
    showControls: "顯示地圖控制項",
    hideControls: "隱藏地圖控制項",
    resetZoom: "重設縮放",
    bortleClass: "波特爾 {class} 級",
    bortlePicker: "天空亮度——波特爾等級",
    bortleFromPlace: "地點本身的等級",
    bortleFromPlaceUnknown: "地點本身的等級——尚未估算",
    bortleLimitingMagnitude: "{magnitude} 等",
    showCelestialCoordinates: "顯示天球座標",
    hideCelestialCoordinates: "隱藏天球座標",
    zoomLevel: "目前視野",
    equipmentField: "所選器材的視野",
    controls: "星圖控制項",
    useFraming: "使用此構圖",
    centerTarget: "以此目標為中心",
    wideSurveyCredit: "CTA-FRAM 彩色 · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS 彩色 · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 紅光單色 · STScI / POSS-II",
  },
  ru: {
    mapSection: "Карта",
    title: "Небо этой ночи",
    intro: "Рекомендуемые цели там, где они находятся на небе в этом плане.",
    suitable: "Подходящие цели",
    suggestions: "Предложения",
    plans: "Планы",
    toggleAllSuggestions: "Показать или скрыть все предложения",
    toggleAllPlans: "Показать или скрыть все планы",
    plan: "Мой план",
    noPlans: "На эту ночь планов пока нет.",
    print: "Печать карты неба",
    loading: "Загрузка интерактивного неба…",
    unavailable: "Интерактивная карта неба недоступна.",
    nebula: "Туманности",
    galaxy: "Галактики",
    cluster: "Звёздные скопления",
    other: "Другие цели",
    selected: "Выбраны в планах",
    emissionNebula: "Эмиссионные туманности",
    reflectionNebula: "Отражательные туманности",
    planetaryNebula: "Планетарные туманности",
    globularCluster: "Шаровые скопления",
    openCluster: "Рассеянные скопления",
    supernovaRemnant: "Остатки сверхновых",
    planet: "Планеты",
    zoomIn: "Приблизить",
    zoomOut: "Отдалить",
    constellationOff: "Созвездия скрыты — показать линии созвездий",
    constellationLines: "Линии созвездий показаны — показать рисунки созвездий",
    constellationArt: "Рисунки созвездий показаны — скрыть созвездия",
    targetMarkersLabeled: "Маркеры и подписи целей показаны — скрыть подписи",
    targetMarkersOnly: "Подписи целей скрыты — скрыть маркеры",
    targetMarkersOff: "Маркеры целей скрыты — показать маркеры и подписи",
    showControls: "Показать элементы управления картой",
    hideControls: "Скрыть элементы управления картой",
    resetZoom: "Сбросить масштаб",
    bortleClass: "Бортль {class}",
    bortlePicker: "Яркость неба — класс по шкале Бортля",
    bortleFromPlace: "Класс этого места",
    bortleFromPlaceUnknown: "Класс этого места — пока не рассчитан",
    bortleLimitingMagnitude: "{magnitude}m",
    showCelestialCoordinates: "Показать небесные координаты",
    hideCelestialCoordinates: "Скрыть небесные координаты",
    zoomLevel: "Текущее поле зрения",
    equipmentField: "Поле зрения выбранного оборудования",
    controls: "Управление картой неба",
    useFraming: "Использовать это кадрирование",
    centerTarget: "Центрировать на цели",
    wideSurveyCredit: "CTA-FRAM цветной · FZU / S. Karpov",
    detailedPhotographicSurveyCredit: "DSS цветной · STScI / POSS-II",
    detailedVisualSurveyCredit: "DSS2 красный монохром · STScI / POSS-II",
  },
};

/**
 * The equipment picker of a control of the map's footer (`control.picker`, the
 * props of `EquipmentPicker` but `onChange`): the search, « Marque » and
 * « Type », the field's select, and « Définir mon matériel » at its foot
 * unless the picker shows its own (nothing matches).
 */
function QuickEquipmentPicker({ control, onChosen }) {
  const [noMatch, setNoMatch] = useState(false);
  const { define, ...picker } = control.picker;
  return (
    <div
      aria-label={control.label}
      className="planner-map-equipment-quick-menu is-picker"
      role="group"
    >
      <EquipmentPicker
        {...picker}
        define={define}
        label={control.label}
        onNoMatchChange={setNoMatch}
        onChange={(id) => {
          control.onChange(id);
          onChosen();
        }}
      />
      {define?.href && !noMatch && !picker.hiddenEmpty ? (
        <DefineEquipmentLink locale={picker.locale} {...define} />
      ) : null}
    </div>
  );
}

function EquipmentControlIcon({ kind }) {
  if (kind === "telescope") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="m4 7 11-3 2 5-11 3zM10 11l-2 8M15 10l4 7M5 19h14" />
      </svg>
    );
  }
  if (kind === "camera") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 8h4l1.4-2h5.2L16 8h4v11H4z" />
        <circle cx="12" cy="13.5" r="3.2" />
      </svg>
    );
  }
  if (kind === "eyepiece") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M8 4h8l2 5-2 7H8l-2-7zM7 20h10" />
        <path d="M8 9h8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="m5 8 4-3h6l4 3-4 3H9zM9 11v8h6v-8" />
    </svg>
  );
}

function loadEngine() {
  if (!engineLoader)
    engineLoader = import(/* webpackIgnore: true */ engineUrl).then(
      (module) => module.default,
    );
  return engineLoader;
}

// Stellarium-Web's compact font lacks some accented Latin letters. Any
// language whose names carry one (French, German, Spanish, Italian,
// Portuguese…) loads the bundled faces below; the dictionary of the language
// says so, so no list of languages is kept here.
const accentedLatin = /[\u00c0-\u024f]/u;

function loadAccentedLatinMapFont(stel, translations) {
  const names = Object.values(translations || {});
  if (
    !names.some((name) => typeof name === "string" && accentedLatin.test(name))
  )
    return;
  // Stellarium-Web's compact fallback font omits some accented Latin glyphs.
  // Load the bundled OFL-licensed Noto Sans faces so names such as "Céphée",
  // "Pégase", "Löwe" or "Águila" render intact on the WebGL canvas.
  void Promise.all([
    stel.setFont("regular", "/vendor/stellarium/fonts/NotoSans-Regular.ttf"),
    stel.setFont("bold", "/vendor/stellarium/fonts/NotoSans-Bold.ttf"),
  ]).catch(() => {
    // Keep the interactive map usable even if a local font cannot be loaded.
  });
}

function configureConstellationLayers(core, constellationMode) {
  // Loading a sky culture restores its own defaults.  Keep this in one place
  // so that lines, labels and art always use the same explicit display mode.
  const constellationsVisible = constellationMode !== "off";
  core.constellations.lines_visible = constellationsVisible;
  core.constellations.labels_visible = constellationsVisible;
  core.constellations.images_visible = constellationMode === "art";
  // Stellarium defaults to rendering only the constellation exactly under the
  // centre of the view.  A framing map needs every constellation segment in
  // the visible field, including when the centre is a deep-sky object.
  core.constellations.show_only_pointed = false;
  // AUTO delegates each label to translateFn instead of retaining the
  // culture's native-name preference.
  core.skycultures.name_format_style = 0;
}

function keepConstellationLayersEnabled(
  stel,
  constellationModeRef,
  celestialCoordinatesVisibleRef,
) {
  // `addDataSource` streams a sky culture after the engine has become ready.
  // That stream can overwrite the initial module settings well after the
  // synchronous call returns.  Reapply the desired state through the short
  // loading window so constellation lines are never lost to those defaults.
  const delays = [0, 120, 360, 900, 2200, 5000, 9000];
  const timers = delays.map((delay) =>
    window.setTimeout(() => {
      configureConstellationLayers(stel.core, constellationModeRef.current);
      stel.core.lines.equatorial.visible =
        celestialCoordinatesVisibleRef.current;
      // `current_id` is initially selected before the culture JSON is fully
      // parsed.  Re-selecting it once the streamed data has settled makes the
      // engine rebuild its constellation objects from the 88 parsed entries.
      // Without this second activation, the map can keep the empty initial
      // selection: the layer is technically enabled but has no lines to draw.
      if (delay >= 2200 && stel.core.skycultures.current_id === "western") {
        stel.core.skycultures.current_id = "western";
      }
    }, delay),
  );
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

// A Bortle class reaches the engine as two properties, never as
// `bortle_index` alone -- writing the class there alone switches the survey
// backdrop off under a city sky. `engineSkyBrightness` (`bortle.js`) holds
// the reason and the arithmetic.
function applySkyBrightness(core, bortleClass) {
  const { bortleIndex, starLinearScale } = engineSkyBrightness(bortleClass);
  core.bortle_index = bortleIndex;
  core.star_linear_scale = starLinearScale;
}

function configureSky(
  stel,
  location,
  time,
  constellationMode,
  celestialCoordinatesVisible,
  bortleClass,
) {
  const { core } = stel;
  core.observer.longitude = Number(location.longitude) * stel.D2R;
  core.observer.latitude = Number(location.latitude) * stel.D2R;
  core.observer.utc = stel.date2MJD(time);
  core.observer.yaw = 0;
  core.observer.pitch = 30 * stel.D2R;
  core.fov = defaultMapFovDegrees * stel.D2R;
  // The sky the observer is actually standing under, not a fixed class 4 for
  // everyone -- the place's own modelled class, or whichever one they picked
  // from the control bar.
  applySkyBrightness(core, bortleClass);
  core.atmosphere.visible = false;
  configureConstellationLayers(core, constellationMode);
  core.lines.equatorial.visible = celestialCoordinatesVisible;
  core.stars.hints_visible = true;
  // Planner targets use the same DSO catalogue for their canonical anchors,
  // but render one permanent, filterable portal marker rather than stacking a
  // second Stellarium symbol on top when its zoom heuristic decides to show.
  core.dsos.hints_visible = false;
  core.milkyway.visible = true;
}

function addSkyData(stel, surveyUrl, locale) {
  const { core } = stel;
  core.stars.addDataSource({ url: `${skyDataUrl}stars` });
  core.skycultures.addDataSource({
    url:
      locale === "en"
        ? `${skyDataUrl}skycultures/western`
        : // Stellarium activates its default western culture from the source
          // URL, not its data-source key.  Keep the localized proxy URL ending
          // in `western` so it creates the constellation objects as well.
          `/api/stellarium/skyculture/${locale}/western`,
    key: "western",
  });
  core.dsos.addDataSource({ url: `${skyDataUrl}dso` });
  core.milkyway.addDataSource({ url: milkyWaySurveyUrl });
  // The DSS module is recreated with the map when its source changes between
  // the colour photographic composition and the monochrome visual layer.
  core.dss.addDataSource({ url: surveyUrl });
  core.dss.visible = true;
}

function categoryFor(target) {
  const type = `${target.skyTarget?.typeKey || target.skyTarget?.type || ""} ${(target.tags || []).join(" ")}`;
  if (/galax/i.test(type)) return "galaxy";
  if (/nébuleuse|nebula|supernova/i.test(type)) return "nebula";
  if (/amas|cluster/i.test(type)) return "cluster";
  return "other";
}

function framingMatch(target) {
  return {
    id: target.id,
    source: target.source,
    designation: target.designation,
    title: target.title,
    coordinate: target.coordinate
      ? { ra: Number(target.coordinate.ra), dec: Number(target.coordinate.dec) }
      : null,
    catalogue: target.catalogue,
    apparentSizeArcmin: Array.isArray(target.apparentSizeArcmin)
      ? [...target.apparentSizeArcmin]
      : [],
    integratedMagnitude: target.integratedMagnitude,
    skyTarget: target.skyTarget ? { ...target.skyTarget } : null,
    tags: Array.isArray(target.tags) ? [...target.tags] : [],
  };
}

function markerProjection(stel, target, width, height) {
  const center = projectPoint(stel, target.coordinate, width, height);
  if (!center) return null;
  // A target the catalogue gives no size is a point source: it stays at the 10
  // px minimum below rather than wearing a ring of an invented 12 arcminutes.
  const [major = 0, minor = major] = target.apparentSizeArcmin || [];
  const majorArcmin = Math.max(0, Number(major) || 0);
  const minorArcmin = Math.max(0, Number(minor) || 0);
  const east = projectPoint(
    stel,
    offsetCoordinate(target.coordinate, majorArcmin / 2),
    width,
    height,
  );
  const west = projectPoint(
    stel,
    offsetCoordinate(target.coordinate, -majorArcmin / 2),
    width,
    height,
  );
  const north = projectPoint(
    stel,
    offsetCoordinate(target.coordinate, 0, minorArcmin / 2),
    width,
    height,
  );
  const south = projectPoint(
    stel,
    offsetCoordinate(target.coordinate, 0, -minorArcmin / 2),
    width,
    height,
  );
  const projectedWidth =
    east && west ? Math.abs(east.x - west.x) * (width / 2) : 1;
  const projectedHeight =
    north && south ? Math.abs(north.y - south.y) * (height / 2) : 1;
  return {
    left: `${(center.x + 1) * 50}%`,
    top: `${(1 - center.y) * 50}%`,
    // The ring remains discoverable at a wide field, then grows from its
    // actual angular size as the field narrows.  This matches Stellarium's
    // native marker behaviour without hiding a tiny target completely.
    width: `${Math.max(10, projectedWidth)}px`,
    height: `${Math.max(10, projectedHeight)}px`,
  };
}

export function designation(target) {
  return target.designation || target.objects?.[0] || target.title;
}

function plannerPreviewUrl(target) {
  if (target.tags?.includes("planet")) return null;
  const coordinate = target.coordinate;
  if (
    !coordinate ||
    !Number.isFinite(coordinate.ra) ||
    !Number.isFinite(coordinate.dec)
  )
    return null;
  const size = Math.max(...(target.apparentSizeArcmin || [18, 18]));
  const fov = Math.min(2.5, Math.max(0.16, (size / 60) * 1.35));
  const parameters = new URLSearchParams({
    hips: "CDS/P/DSS2/color",
    ra: coordinate.ra.toFixed(6),
    dec: coordinate.dec.toFixed(6),
    fov: fov.toFixed(3),
    width: "320",
    height: "320",
    projection: "TAN",
    format: "jpg",
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${parameters}`;
}

export function MapTargetPreview({ target, visualMode = false }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { url: image, source } = targetImageVariant(target, {
    visualMode,
    fallback: plannerPreviewUrl(target),
  });
  // The eyepiece view in visual mode, in the same box.
  const eyepiece = useEyepieceView(target, { visualMode, imageSource: source });
  const { locale } = useEyepieceSetting();
  if (image && !failed && eyepiece)
    return (
      <div className="planner-night-map-target-preview-media is-eyepiece">
        <EyepieceViewImage
          src={image}
          view={eyepiece}
          className="planner-night-map-target-preview-image is-loaded"
          label={
            eyepiece.kind === "default"
              ? target.title || target.designation
              : eyepieceViewLabel(locale, target.title || target.designation)
          }
          onDrawn={() => setLoaded(true)}
          onError={() => setFailed(true)}
          fallback={
            <img
              className="planner-night-map-target-preview-image is-loaded"
              src={image}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          }
        />
        {!loaded && (
          <span
            className="planner-night-map-target-preview-loader"
            role="status"
            aria-label="Loading image"
          />
        )}
      </div>
    );
  if (image && !failed)
    return (
      <div className="planner-night-map-target-preview-media">
        <img
          className={`planner-night-map-target-preview-image${loaded ? " is-loaded" : ""}`}
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        {!loaded && (
          <span
            className="planner-night-map-target-preview-loader"
            role="status"
            aria-label="Loading image"
          />
        )}
      </div>
    );
  // Where the image is missing or failed: the pictogram of the object's
  // type; the preview's text writes the type itself.
  return (
    <div className="planner-target-visual planner-night-map-target-preview-image">
      <ObjectPictogram target={target} size="73%" />
    </div>
  );
}

export function previewTime(value, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function previewAltitudePath(series) {
  if (!series?.length) return "";
  return series
    .map((point, index) => {
      const x = (index / Math.max(1, series.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(90, point.altitude)) / 0.9;
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MapTargetAvailability({ card }) {
  const path = previewAltitudePath(card?.series);
  if (!path) return null;
  return (
    <svg
      className="planner-night-map-target-preview-availability"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${path} L100 100 L0 100 Z`} />
      <path d={path} />
    </svg>
  );
}

export function MapTargetSummary({
  action = null,
  card,
  centerAction = null,
  locale,
  target,
  timeZone,
}) {
  const targetTitle = target.title || designation(target);
  return (
    <div className="planner-night-map-target-preview-content">
      <MapTargetAvailability card={card} />
      {centerAction}
      <strong>{targetTitle}</strong>
      <p>
        {[target.skyTarget?.type, target.skyTarget?.constellation]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {card && (
        <div className="planner-night-map-target-preview-facts">
          <span
            aria-label={`${message(locale, "plannerMaximum")} ${Math.round(card.maxAltitude)}°`}
            title={message(locale, "plannerMaximum")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 18 9 9l3.2 4.2L15.3 8 21 18" />
              <path d="M15.3 8h4.2v4.2" />
            </svg>
            <strong>{Math.round(card.maxAltitude)}°</strong>
          </span>
          <span
            aria-label={`${message(locale, "plannerWindow")} ${previewTime(card.usableStart, locale, timeZone)}–${previewTime(card.usableEnd, locale, timeZone)}`}
            title={message(locale, "plannerWindow")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7v5l3.5 2" />
            </svg>
            <strong>
              {previewTime(card.usableStart, locale, timeZone)}–
              {previewTime(card.usableEnd, locale, timeZone)}
            </strong>
          </span>
        </div>
      )}
      {action}
    </div>
  );
}

export function MapTargetActionIcon({ added = false }) {
  return (
    <svg
      className="planner-target-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6 12h12" />
      {!added && <path d="M12 6v12" />}
    </svg>
  );
}

function stellariumTargetData(stel, target) {
  // The bundled DSO catalogue has more accurate centres and extents than a
  // hand-maintained planner list.  It is loaded asynchronously, so falling
  // back to the planner value here is intentional while a tile is pending.
  const names = [...new Set([designation(target), ...(target.objects || [])])]
    .filter(Boolean)
    .map(String);
  for (const name of names) {
    try {
      const object = stel.getObj(name);
      if (!object || String(object.id || "").startsWith("planner:")) continue;
      const radec = object.getInfo("radec");
      if (!Array.isArray(radec) || radec.length < 2) continue;
      const [ra, dec] = stel.c2s(radec);
      const model = object.jsonData?.model_data || {};
      const major = Number(model.dimx);
      const minor = Number(model.dimy);
      if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
      const catalogueSize = target.apparentSizeArcmin;
      const hasNativeSize = major > 0 && minor > 0;
      const hasCatalogueSize =
        Array.isArray(catalogueSize) &&
        catalogueSize.every((size) => Number(size) > 0);
      // Stellarium catalogues are not uniform about the unit used for dimx
      // and dimy.  Their position is more precise, but a unit mismatch can
      // shrink a portal ring below the photographed object at a close zoom.
      // Keep our curated angular extent whenever the two sources diverge by a
      // clearly implausible factor.
      const nativeSizeMatchesCatalogue =
        hasNativeSize &&
        hasCatalogueSize &&
        major / catalogueSize[0] >= 0.4 &&
        major / catalogueSize[0] <= 2.5 &&
        minor / catalogueSize[1] >= 0.4 &&
        minor / catalogueSize[1] <= 2.5;
      return {
        object,
        target: {
          ...target,
          coordinate: {
            ra: (((ra * stel.R2D) % 360) + 360) % 360,
            dec: dec * stel.R2D,
          },
          apparentSizeArcmin:
            hasNativeSize && (!hasCatalogueSize || nativeSizeMatchesCatalogue)
              ? [major, minor]
              : catalogueSize,
        },
      };
    } catch {
      // A catalogue tile may not be available yet.  The planner coordinate is
      // still a safe temporary anchor and is replaced on the next refresh.
    }
  }
  return null;
}

export const PlannerNightSkyMap = forwardRef(function PlannerNightSkyMap(
  {
    addDisabledReason,
    cards,
    framingTargets = [],
    savedFramingTargets = [],
    locale,
    location,
    night,
    field,
    // The observing place's own modelled Bortle class, when the planner
    // has one for it. `null` (no estimate yet, or none available) falls
    // back to class 4 exactly as before.
    placeBortleClass = null,
    equipmentLabel,
    equipmentControls,
    selectedIds,
    canAdd,
    editable = true,
    onAdd,
    onRemove,
    onUseFraming,
    // What extends the frame into a larger surface, when a shell registered
    // one at `planner.framing.surface` and the person set it (the page owns
    // it; the map only hands it to what is registered at the
    // `planner.map.*` points, and asks the surface what a framing made with
    // it stores). `onConfigureFrameSurface` opens the framing settings (the
    // "Paramètres" tool, beside "Utiliser ce cadrage").
    frameSurface = null,
    onConfigureFrameSurface,
    selectedTargetId,
    onTargetSelect,
    showSectionHeading = true,
    visualMode = false,
    // Editing an existing framing repoints the live view at its stored J2000
    // centre, the same way selecting any other target and pressing "Centre"
    // already does (`centerSelectedTarget` below) — reused rather than
    // duplicated. `selectedTargetId` must name a target present in
    // `framingTargets`/`savedFramingTargets` for this to resolve.
    autoCenterOnSelected = false,
    // The view the framing editor left for « Définir mon matériel »
    // (`{ center: { ra, dec }, fovDegrees }`): the map opens back on it, the
    // frame where it was.
    initialView = null,
    // The fullscreen framing editor (6c.9) replaces this in-toolbar button
    // with its own overlaid ✓, a small,
    // superimposed control rather than a labelled button in the map's own
    // tool row.
    hideUseFramingAction = false,
    // The framing editor's search. `onSearch` puts a
    // magnifier at the head of the control bar (`searchOpen` is its
    // `aria-expanded`); `highlightedTarget` is the one target the visitor
    // asked to see -- drawn under its own name with the selection reticle,
    // whatever the markers' display is set to (`framing-editor.js`).
    highlightedTarget = null,
    onSearch = null,
    searchOpen = false,
    // The frame's position angle in
    // the framing editor, north towards east -- the frame (and a mosaic's
    // grid) turns counter-clockwise by it and its caption ends with it
    // (`frameAngleShown`, even at 0°); `onTurnFrame` is told the angle Alt +
    // the wheel over the map asks for. The map itself never turns on the web.
    frameAngleDegrees = 0,
    frameAngleShown = false,
    onTurnFrame = null,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const shellRef = useRef(null);
  const engineRef = useRef(null);
  const nativeTargetRef = useRef(new Map());
  const focusTargetRef = useRef(new Map());
  const nativeLookupRef = useRef(new Map());
  const markerElementRef = useRef(new Map());
  const equipmentFieldRef = useRef(null);
  const refreshRef = useRef(null);
  const targetsRef = useRef([]);
  const fieldRef = useRef(field);
  const frameAngleRef = useRef(frameAngleDegrees);
  const onTurnFrameRef = useRef(onTurnFrame);
  // What is drawn at `planner.map.overlay` is told of every projected frame
  // (`subscribeFrame` below), after the map has placed its own frame.
  const frameListenersRef = useRef(new Set());
  const viewStateRef = useRef(null);
  const zoomDegreesRef = useRef(defaultMapFovDegrees);
  const surveySwitchTimerRef = useRef(null);
  const touchSurfaceRef = useRef(null);
  const touchGestureRef = useRef(null);
  const equipmentControlsRef = useRef(null);
  const searchButtonRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [constellationMode, setConstellationMode] = useState("lines");
  const [celestialCoordinatesVisible, setCelestialCoordinatesVisible] =
    useState(false);
  const constellationModeRef = useRef(constellationMode);
  const celestialCoordinatesVisibleRef = useRef(celestialCoordinatesVisible);
  // The three-state cycle -- labelled markers, markers without their labels,
  // then nothing. The labels are what goes first, because they are what crowds
  // a busy field.
  const [targetMarkers, setTargetMarkers] = useState("labeled");
  const targetMarkersVisible = targetMarkers !== "off";
  const targetLabelsVisible = targetMarkers === "labeled";
  // The state what is registered at the `planner.map.*` points shares
  // between its parts (a control that changes what an overlay draws): the
  // map keeps it, and never reads it.
  const [extensionState, setExtensionState] = useState({});
  const [zoomDegrees, setZoomDegrees] = useState(defaultMapFovDegrees);
  const [detailedSurveyVisible, setDetailedSurveyVisible] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  // Declared here, ahead of every hook that reads it during render (the
  // label layout keeps it in a ref): a `const` read before its declaration
  // throws, which took the whole planner page down.
  const selectedId = selectedTargetId ?? internalSelectedId;
  // Declared here for the same reason: the label layout below reads it.
  const highlightedId = highlightedTarget?.id ?? null;
  const [openEquipmentControl, setOpenEquipmentControl] = useState(null);
  // `null` is the picker's own "the place's own class" entry -- an
  // explicit deference to the place, not an absent choice.
  const [manualBortleClass, setManualBortleClass] = useState(null);
  const [bortleMenuOpen, setBortleMenuOpen] = useState(false);
  const bortleControlRef = useRef(null);
  const bortleMenuOpenRef = useRef(bortleMenuOpen);
  bortleMenuOpenRef.current = bortleMenuOpen;
  // The bar starts folded and opens when the map scrolls into view.
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const controlsIdleTimerRef = useRef(null);
  const controlsExpandedRef = useRef(controlsExpanded);
  controlsExpandedRef.current = controlsExpanded;
  const bortleClass = mapBortleClass({
    manual: manualBortleClass,
    place: placeBortleClass,
  });
  const bortleClassRef = useRef(bortleClass);
  bortleClassRef.current = bortleClass;
  const [addBlockedHintVisible, setAddBlockedHintVisible] = useState(false);
  const text = copyFor(copy, locale, "PlannerNightSkyMap.copy");
  constellationModeRef.current = constellationMode;
  celestialCoordinatesVisibleRef.current = celestialCoordinatesVisible;

  useEffect(() => {
    if (!openEquipmentControl) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!equipmentControlsRef.current?.contains(event.target)) {
        setOpenEquipmentControl(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpenEquipmentControl(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openEquipmentControl]);

  // The bar's fold state changes in exactly four places (the map entering or
  // leaving the viewport, the inactivity timeout, a click on the readout, and
  // any control the observer touches). These two are the only routes to it, so
  // the legend below can follow `controlsExpanded` as the single source of
  // truth. The arrangement the marker names are written in. The requests are
  // built from what is actually on screen -- every ring's measured box and
  // every name's measured chip -- and handed to the shared rule
  // (`map-labels.js`). A name with nowhere free to go loses its chip; its ring
  // is untouched.
  const labelStateRef = useRef(null);
  labelStateRef.current = {
    labelsVisible: targetLabelsVisible,
    selectedId,
    selectedIds,
    highlightedId,
  };
  const labelLayoutTimerRef = useRef(null);
  const labelLayoutRunRef = useRef(0);

  const layOutMarkerLabels = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!(bounds.width > 0 && bounds.height > 0)) return;
    const {
      labelsVisible,
      selectedId: current,
      selectedIds: planned,
      highlightedId: highlighted,
    } = labelStateRef.current;
    const entries = [];
    for (const target of targetsRef.current) {
      const element = markerElementRef.current.get(target.id);
      if (!element) continue;
      // The name chip -- not `firstElementChild`, which is the reticle when
      // the name is not written.
      const chip = element.querySelector(".planner-night-map-target-label");
      // The highlighted target's name is written whatever the labels' display
      // is set to (`mapMarkerPresentation`).
      const labelVisible = mapMarkerPresentation({
        targetId: target.id,
        highlightedId: highlighted,
        labelsVisible,
      }).labelVisible;
      // Nothing to place: the cycle is in one of its label-less states, the
      // ring is off screen, or a media query has taken this chip out of the
      // layout entirely (a narrow screen only ever shows the selected one).
      if (
        !labelVisible ||
        !chip ||
        !element.hasAttribute("data-visible") ||
        !(chip.offsetWidth > 0 && chip.offsetHeight > 0)
      ) {
        element.removeAttribute("data-label-placed");
        if (chip) {
          chip.style.left = "";
          chip.style.top = "";
        }
        continue;
      }
      entries.push({
        element,
        chip,
        target,
        box: element.getBoundingClientRect(),
        width: chip.offsetWidth,
        height: chip.offsetHeight,
      });
    }
    const placements = new Map(
      layOutMapLabels({
        canvas: { width: bounds.width, height: bounds.height },
        requests: entries.map(({ target, box, width, height }) => ({
          key: target.id,
          text:
            target.id === highlighted
              ? framingSearchLabel(target)
              : designation(target) || "",
          origin: {
            x: box.left - bounds.left + box.width / 2,
            y: box.top - bounds.top + box.height / 2,
          },
          size: { width, height },
          priority: mapLabelPriority({
            // The highlighted target is what the visitor asked to see: its
            // name is never displaced by another.
            selected: current === target.id || highlighted === target.id,
            inPlan: Boolean(planned?.has(target.id)),
          }),
          // The web's own look is the preferred position: a chip centred
          // just below the ring. The fallbacks are the shared rule's.
          offset: { x: -width / 2, y: box.height / 2 + 3 },
          gap: Math.max(box.width, box.height) / 2 + 3,
        })),
      }).map((placement) => [placement.key, placement]),
    );
    for (const { element, chip, target, box } of entries) {
      const placement = placements.get(target.id);
      if (!placement) {
        element.removeAttribute("data-label-placed");
        continue;
      }
      // The chip's containing block is its own button's padding box, so the
      // canvas-space rectangle is rewritten relative to that.
      chip.style.left = `${
        placement.rect.x - (box.left - bounds.left) - element.clientLeft
      }px`;
      chip.style.top = `${
        placement.rect.y - (box.top - bounds.top) - element.clientTop
      }px`;
      element.setAttribute("data-label-placed", "");
    }
  };

  const scheduleLabelLayout = () => {
    // A trailing debounce alone would starve if the engine ever notified
    // without pause, and the names would never be written at all. Past this
    // ceiling the arrangement is refreshed on the spot, then goes back to
    // waiting for the gesture to settle.
    const now = performance.now();
    if (now - labelLayoutRunRef.current > mapLabelLayoutMaximumWaitMs) {
      window.clearTimeout(labelLayoutTimerRef.current);
      labelLayoutRunRef.current = now;
      layOutMarkerLabels();
      return;
    }
    window.clearTimeout(labelLayoutTimerRef.current);
    labelLayoutTimerRef.current = window.setTimeout(() => {
      labelLayoutRunRef.current = performance.now();
      layOutMarkerLabels();
    }, mapLabelLayoutDelayMs);
  };
  const scheduleLabelLayoutRef = useRef(scheduleLabelLayout);
  scheduleLabelLayoutRef.current = scheduleLabelLayout;

  const scheduleControlsFold = () => {
    window.clearTimeout(controlsIdleTimerRef.current);
    // A menu open inside the bar suspends the countdown rather than folding the
    // bar out from under it.
    if (bortleMenuOpenRef.current) return;
    controlsIdleTimerRef.current = window.setTimeout(
      () => setControlsExpanded(false),
      mapControlsIdleDelayMs,
    );
  };

  const revealControls = () => {
    setControlsExpanded(true);
    scheduleControlsFold();
  };

  const collapseControls = () => {
    window.clearTimeout(controlsIdleTimerRef.current);
    setBortleMenuOpen(false);
    setControlsExpanded(false);
  };

  const toggleControls = () => {
    if (controlsExpandedRef.current) collapseControls();
    else revealControls();
  };

  // A real pointer click fires `pointerdown` before `click`. Capturing every
  // `pointerdown` inside the bar to call `revealControls` (below) is right
  // for every OTHER cell -- it restarts the idle countdown before that
  // cell's own `onClick` runs -- but the handle's own `onClick` is
  // `toggleControls`, which reads `controlsExpandedRef.current` to decide
  // which way to flip. If the capture has already forced that ref to `true`
  // by the time `toggleControls` reads it, a click that should OPEN a folded
  // bar instead reveals it for a single frame and immediately closes it
  // again -- the handle could fold the bar but never unfold it by clicking.
  // Skipping the reveal for a pointerdown/keydown that targets the handle
  // itself leaves `toggleControls` reading the state as it was before this
  // interaction, exactly as a plain click handler would expect.
  const revealControlsUnlessHandle = (event) => {
    if (event.target.closest(".planner-night-map-controls-handle")) return;
    revealControls();
  };

  // The observer below is installed once, so it reaches the current render's
  // handlers through these rather than being torn down and re-created on
  // every fold -- re-observing fires the callback again, which would make
  // each timeout immediately undo itself.
  const revealControlsRef = useRef(revealControls);
  const collapseControlsRef = useRef(collapseControls);
  revealControlsRef.current = revealControls;
  collapseControlsRef.current = collapseControls;

  useEffect(() => {
    // The map is the last stage of a long page, so it is usually off screen
    // when it mounts. Appearing shows the bar for a few seconds; leaving folds
    // it at once, so it is never found half-open on the way back.
    const shell = shellRef.current;
    if (!shell || typeof IntersectionObserver !== "function") return undefined;
    let onScreen = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === onScreen) return;
        onScreen = entry.isIntersecting;
        if (onScreen) revealControlsRef.current();
        else collapseControlsRef.current();
      },
      { threshold: 0 },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(controlsIdleTimerRef.current), []);

  useEffect(() => {
    // Closing the picker hands the bar back to its own countdown.
    if (!bortleMenuOpen && controlsExpandedRef.current) scheduleControlsFold();
    else if (bortleMenuOpen) window.clearTimeout(controlsIdleTimerRef.current);
  }, [bortleMenuOpen]);

  useEffect(() => {
    if (!bortleMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!bortleControlRef.current?.contains(event.target))
        setBortleMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setBortleMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [bortleMenuOpen]);

  useEffect(() => {
    // The class can change without the engine being recreated -- the place's
    // estimate arrives asynchronously, and the control bar's own picker
    // changes it at any time. Stellarium recomputes the star field from
    // these properties on its own change notification, so this is the whole
    // update.
    const stel = engineRef.current;
    if (!stel) return;
    applySkyBrightness(stel.core, bortleClass);
    refreshRef.current?.();
  }, [bortleClass]);
  const cardsKey = cards
    .map(
      (card) =>
        `${card.target.id}:${card.target.coordinate?.ra}:${card.target.coordinate?.dec}`,
    )
    .join("|");
  const savedFramingTargetsKey = savedFramingTargets
    .map(
      (target) =>
        `${target.id}:${target.coordinate?.ra}:${target.coordinate?.dec}`,
    )
    .join("|");
  const highlightedKey = highlightedTarget
    ? `${highlightedTarget.id}:${highlightedTarget.coordinate?.ra}:${highlightedTarget.coordinate?.dec}`
    : "";
  // A saved framing remains a usable map reference even when it is not a
  // current recommendation (for example when a temporary horizon or source
  // filter leaves it without a visible recommendation card).  Keep these
  // markers separate from `framingTargets`, which is the broader catalogue
  // used only to propose a name for a newly created framing.  The target a
  // visitor asked to see through the editor's search is the last one drawn
  // (`framing-editor.js` holds the rule, and its test).
  const targets = useMemo(
    () =>
      mapDisplayedTargets({ cards, savedFramingTargets, highlightedTarget }),
    [cardsKey, savedFramingTargetsKey, highlightedKey],
  );
  const framingTargetsKey = framingTargets
    .map(
      (target) =>
        `${target.id}:${target.coordinate?.ra}:${target.coordinate?.dec}`,
    )
    .join("|");
  // The name a new framing is proposed comes from every known object under the
  // frame, including the one the visitor searched for: it is the object they
  // are about to frame.
  const knownFramingTargets = useMemo(
    () => uniqueMapTargets([...targets, ...framingTargets]),
    [targets, framingTargetsKey],
  );
  const cardsByTargetId = useMemo(
    () => new Map(cards.map((card) => [card.target.id, card])),
    [cards],
  );
  // Runs after `targets` exists: its dependency array is evaluated during
  // render, so it cannot sit above the `useMemo` that declares `targets`.
  const plannedIdsKey = selectedIds ? [...selectedIds].sort().join("|") : "";
  useEffect(() => {
    scheduleLabelLayoutRef.current();
    return () => window.clearTimeout(labelLayoutTimerRef.current);
  }, [targets, targetLabelsVisible, selectedId, plannedIdsKey]);

  const selectedTarget = selectedId
    ? targets.find((target) => target.id === selectedId) || null
    : null;
  const selectedCard = selectedTarget
    ? cardsByTargetId.get(selectedTarget.id)
    : null;

  // What a shell registered at the `planner.map.*` points, and what the map
  // hands each of them. The open core registers nothing: the map is complete
  // without them.
  const overlayExtensions = getPlannerExtensions("planner.map.overlay");
  const controlExtensions = getPlannerExtensions("planner.map.controls");
  const [surfaceModel = null] = getPlannerExtensions("planner.framing.surface");
  const subscribeFrame = useCallback((listener) => {
    frameListenersRef.current.add(listener);
    refreshRef.current?.();
    return () => frameListenersRef.current.delete(listener);
  }, []);
  const extensionProps = {
    locale,
    field,
    surface: frameSurface,
    equipmentLabel,
    selectedTarget,
    mapState: extensionState,
    setMapState: setExtensionState,
    // What a frame drawn around this one turns by, and whether its caption
    // says the angle.
    frameAngleDegrees,
    frameAngleShown,
  };
  const overlayClassNames = overlayExtensions
    .map((Overlay) => Overlay.overlayClassName?.(extensionProps))
    .filter(Boolean);
  const selectedInPlan = Boolean(
    selectedTarget && selectedIds?.has(selectedTarget.id),
  );
  const referenceTime = useMemo(
    () =>
      night?.start
        ? (new Date(night.start).getTime() + new Date(night.end).getTime()) / 2
        : Date.now(),
    [night?.end, night?.start],
  );
  const skyContextKey = `${location.latitude}:${location.longitude}:${referenceTime}`;
  const activeSurveyUrl = plannerSurveyUrl({
    detailed: detailedSurveyVisible,
    visualMode,
  });
  const surveyCredit = detailedSurveyVisible
    ? visualMode
      ? text.detailedVisualSurveyCredit
      : text.detailedPhotographicSurveyCredit
    : text.wideSurveyCredit;
  targetsRef.current = targets;
  fieldRef.current = field;
  frameAngleRef.current = frameAngleDegrees;
  onTurnFrameRef.current = onTurnFrame;

  const selectTarget = (targetId) => {
    const nextSelectedId = toggledTargetId(selectedId, targetId);
    setInternalSelectedId(nextSelectedId);
    onTargetSelect?.(nextSelectedId);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let dispose = () => {};
    const loadingTimeout = window.setTimeout(() => {
      if (active) setStatus("error");
    }, 15000);
    setStatus("loading");
    Promise.all([loadEngine(), loadStellariumTranslations(locale)])
      .then(([StelWebEngine, translations]) =>
        StelWebEngine({
          wasmFile: engineWasmUrl,
          canvasElement: canvas,
          translateFn(domain, label) {
            return translateStellariumLabel(translations, domain, label);
          },
          onReady(stel) {
            if (!active) return;
            try {
              window.clearTimeout(loadingTimeout);
              loadAccentedLatinMapFont(stel, translations);
              configureSky(
                stel,
                location,
                new Date(referenceTime),
                constellationMode,
                celestialCoordinatesVisible,
                bortleClassRef.current,
              );
              const previousView = viewStateRef.current;
              if (previousView?.context === skyContextKey) {
                stel.core.observer.yaw = previousView.yaw;
                stel.core.observer.pitch = previousView.pitch;
                stel.core.fov = previousView.fov;
              }
              addSkyData(stel, activeSurveyUrl, locale);
              // Loading a culture applies its own defaults.  Reapply these
              // layers through the asynchronous data window so constellation
              // lines remain visible and the optional art stays independent
              // from them.
              const stopConstellationLayerSync = keepConstellationLayersEnabled(
                stel,
                constellationModeRef,
                celestialCoordinatesVisibleRef,
              );
              let refreshFrame = 0;
              let lastOverlayRefresh = 0;
              const coarsePointer =
                window.matchMedia("(pointer: coarse)").matches;
              const refresh = (timestamp) => {
                refreshFrame = 0;
                // `change` listeners are kept internally by Stellarium-Web.
                // A layer change recreates the engine, so an old listener can
                // still be invoked afterwards.  It must become a no-op rather
                // than continuing to project every marker on a dead map.
                if (!active) return;
                // Stellarium-web's own click handling still runs on the bare
                // canvas underneath our overlay rings, independently of
                // anything this component does. Left alone, it picks
                // whatever native star or DSO the pointer landed nearest and
                // shows its own breathing selection reticle for it -- a
                // second, competing "selected" indicator the observer never
                // asked for, drawn over ours. Clearing it back on every
                // notified frame is cheap (a single attribute write when it
                // is not already null) and keeps the native reticle from
                // ever painting: the change that sets it and the change that
                // clears it are both handled inside this same `stel.change`
                // callback, so the clear lands before the engine's own next
                // `_core_render`.
                if (stel.core.selection) stel.core.selection = null;
                // The sky itself keeps rendering at native speed.  Updating
                // dozens of DOM rings at every touch frame makes a phone drag
                // feel sticky, so the overlay is intentionally capped at 30fps.
                // The canvas itself remains at the engine's native speed.
                if (coarsePointer && timestamp - lastOverlayRefresh < 32) {
                  refreshFrame = window.requestAnimationFrame(refresh);
                  return;
                }
                lastOverlayRefresh = timestamp;
                const { width, height } = canvas.getBoundingClientRect();
                const nextZoom = roundedMapFov(stel.core.fov * stel.R2D);
                if (zoomDegreesRef.current !== nextZoom) {
                  zoomDegreesRef.current = nextZoom;
                  setZoomDegrees(nextZoom);
                  // Swapping the tiled survey recreates the engine.  Wait for
                  // the zoom animation or wheel gesture to settle first, so
                  // a layer hand-off never cuts a navigation short.
                  window.clearTimeout(surveySwitchTimerRef.current);
                  surveySwitchTimerRef.current = window.setTimeout(() => {
                    if (!active) return;
                    setDetailedSurveyVisible(
                      detailedSurveyVisibleAtZoom(nextZoom),
                    );
                  }, 420);
                }
                for (const target of targetsRef.current) {
                  const element = markerElementRef.current.get(target.id);
                  if (!element) continue;
                  let native = nativeTargetRef.current.get(target.id);
                  const now = performance.now();
                  const lastLookup =
                    nativeLookupRef.current.get(target.id) || 0;
                  // Querying a catalogue object on every render frame was the
                  // source of the delayed rings while panning.  A successful
                  // native anchor is permanent; a missing catalogue tile is
                  // retried gently while it streams in.
                  // The bundled DSO catalogue gives desktop markers a more
                  // precise centre.  Looking up every streamed DSO while a
                  // phone is dragged is expensive and unnecessary there: the
                  // planner's canonical coordinates remain accurate enough.
                  if (!coarsePointer && !native && now - lastLookup > 1500) {
                    nativeLookupRef.current.set(target.id, now);
                    native = stellariumTargetData(stel, target);
                    if (native) nativeTargetRef.current.set(target.id, native);
                  }
                  const projection = markerProjection(
                    stel,
                    native?.target || target,
                    width,
                    height,
                  );
                  element.toggleAttribute("data-visible", Boolean(projection));
                  if (projection) {
                    element.style.left = projection.left;
                    element.style.top = projection.top;
                    element.style.width = projection.width;
                    element.style.height = projection.height;
                  }
                }
                const equipmentProjection = equipmentFieldProjection(
                  stel,
                  fieldRef.current,
                  width,
                  height,
                );
                const equipmentElement = equipmentFieldRef.current;
                if (equipmentElement) {
                  equipmentElement.toggleAttribute(
                    "data-visible",
                    Boolean(equipmentProjection),
                  );
                  equipmentElement.toggleAttribute(
                    "data-centre-visible",
                    Boolean(equipmentProjection) && nextZoom <= 5,
                  );
                  if (equipmentProjection) {
                    equipmentElement.style.left = equipmentProjection.left;
                    equipmentElement.style.top = equipmentProjection.top;
                    equipmentElement.style.width = equipmentProjection.width;
                    equipmentElement.style.height = equipmentProjection.height;
                    equipmentElement.classList.toggle(
                      "is-circular",
                      equipmentProjection.shape === "circle",
                    );
                    // Below this threshold, the two labels would compete with
                    // the sky labels rather than identify the camera field.
                    // The threshold is based on rendered pixels, not a media
                    // query, so it behaves identically after a wheel zoom,
                    // pinch gesture, resize, or rotation.
                    equipmentElement.toggleAttribute(
                      "data-metadata-visible",
                      equipmentProjection.pixelWidth >= 150 &&
                        equipmentProjection.pixelHeight >= 84,
                    );
                    // The captions of a turned frame sit above and
                    // below the box it fills.
                    equipmentElement.style.setProperty(
                      "--planner-frame-box-half",
                      `${turnedFrameHalfHeight(
                        equipmentProjection.pixelWidth,
                        equipmentProjection.pixelHeight,
                        frameAngleRef.current,
                      )}px`,
                    );
                  }
                }
                // What is drawn at `planner.map.overlay` places itself on the
                // same frame, after the map's own frame (it may take over the
                // frame's centre mark, as a surface drawn around it does).
                if (frameListenersRef.current.size) {
                  const frame = {
                    stel,
                    width,
                    height,
                    zoom: nextZoom,
                    field: fieldRef.current,
                    frameAngleDegrees: frameAngleRef.current,
                    equipmentElement,
                    equipmentProjection,
                  };
                  for (const listener of frameListenersRef.current)
                    listener(frame);
                }
                // The rings follow the sky at frame rate; their names are
                // rearranged once the view stops moving.
                scheduleLabelLayoutRef.current();
              };
              // Stellarium can notify several attributes during one rendered
              // frame.  Coalescing those notifications prevents duplicate
              // WASM projections and DOM writes while the user drags the sky.
              const scheduleRefresh = () => {
                if (!active || refreshFrame) return;
                refreshFrame = window.requestAnimationFrame(refresh);
              };
              const observer = new ResizeObserver(scheduleRefresh);
              observer.observe(canvas);
              refreshRef.current = scheduleRefresh;
              stel.change(scheduleRefresh);
              engineRef.current = stel;
              scheduleRefresh();
              setStatus("ready");
              dispose = () => {
                stopConstellationLayerSync();
                observer.disconnect();
                if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
              };
            } catch {
              setStatus("error");
            }
          },
        }),
      )
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
      window.clearTimeout(surveySwitchTimerRef.current);
      dispose();
      if (engineRef.current) {
        viewStateRef.current = {
          context: skyContextKey,
          fov: engineRef.current.core.fov,
          yaw: engineRef.current.core.observer.yaw,
          pitch: engineRef.current.core.observer.pitch,
        };
      }
      engineRef.current = null;
      nativeTargetRef.current = new Map();
      for (const target of focusTargetRef.current.values()) target.destroy?.();
      focusTargetRef.current = new Map();
      nativeLookupRef.current = new Map();
      markerElementRef.current = new Map();
      refreshRef.current = null;
    };
  }, [
    activeSurveyUrl,
    locale,
    location.latitude,
    location.longitude,
    referenceTime,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => refreshRef.current?.());
    return () => window.cancelAnimationFrame(frame);
  }, [field?.height, field?.width, frameSurface, extensionState, targets]);

  // Which target a click at a given point resolves to.
  //
  // The rings are plain absolutely-positioned buttons with no `z-index`, so
  // the browser's own hit test answers with whichever one is painted last --
  // measured on the running planner, that is 376 overlapping pairs all
  // decided by DOM order, and a second click at the same place could never
  // reach the one underneath. The click still enters through the button the
  // browser picked, but what it selects is decided from the point itself:
  // every ring containing it, smallest first, walked one step per repeated
  // click.
  const pointOnCanvas = (point) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: point.clientX - bounds.left, y: point.clientY - bounds.top };
  };

  const markerCandidatesAt = (point) => {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    const bounds = canvas.getBoundingClientRect();
    const markers = [];
    for (const target of targetsRef.current) {
      // The highlighted target is a mark on the sky, not something to tap: it
      // never joins the ranking, so it cannot take a tap from a target under it.
      if (target.id === highlightedId) continue;
      const element = markerElementRef.current.get(target.id);
      if (!element || !element.hasAttribute("data-visible")) continue;
      const box = element.getBoundingClientRect();
      markers.push({
        id: target.id,
        centre: {
          x: box.left - bounds.left + box.width / 2,
          y: box.top - bounds.top + box.height / 2,
        },
        radius: { x: box.width / 2, y: box.height / 2 },
      });
    }
    return mapMarkerCandidatesAtPoint({
      point: { x: point.clientX - bounds.left, y: point.clientY - bounds.top },
      markers,
    });
  };

  // "The camera has not moved": any pan or zoom restarts the cycle rather
  // than letting a click at the same screen pixel resume a stale one.
  const mapViewSignature = () => {
    const core = engineRef.current?.core;
    if (!core) return "";
    return [core.fov, core.observer.yaw, core.observer.pitch]
      .map((value) => Number(value).toFixed(6))
      .join(":");
  };

  const tapCycleRef = useRef(null);
  if (!tapCycleRef.current) tapCycleRef.current = createMapTapCycle();

  const selectAtPoint = (point, fallbackTargetId) => {
    const found = markerCandidatesAt(point);
    // The button the browser itself picked is the fallback: a ring can be
    // clicked on a pixel the ranking does not count as inside it (its own
    // dashed edge, at a wide field), and that click must still select it.
    const candidates = found.length
      ? found
      : fallbackTargetId != null
        ? [fallbackTargetId]
        : [];
    const next = tapCycleRef.current.resolve({
      // Measured against the canvas, not the viewport: two clicks on the same
      // patch of sky are the same spot even if the page scrolled between
      // them.
      position: pointOnCanvas(point) ?? { x: point.clientX, y: point.clientY },
      candidates,
      currentSelection: selectedId,
      viewSignature: mapViewSignature(),
    });
    // Selecting a target should only reveal its compact information card.
    // Automatic point-and-lock/zoom was disorienting and, at 8°, caused a
    // burst of photographic survey tiles that can make an iPhone renderer
    // terminate.  The user can deliberately zoom with the map controls.
    // `selectTarget`'s own toggle still turns a repeated identical selection
    // into a deselect, exactly as it did before the cycle existed.
    if (next != null) selectTarget(next);
  };

  // The touch surface's own listeners are installed once, so they reach the
  // current render's handler through this rather than a stale closure.
  const selectAtPointRef = useRef(selectAtPoint);
  selectAtPointRef.current = selectAtPoint;

  // A mouse click only ever reached `selectAtPoint` through a ring's own
  // `onClick`, so a click that landed on the object itself but outside its
  // (often small) ring fell straight through to the bare canvas underneath
  // -- and, with nothing of ours listening there, to Stellarium's own
  // native picking. The touch surface already covers this for a finger
  // (`selectNearestTarget` below runs for any tap on it, ring or not); the
  // canvas gets the equivalent for a mouse by resolving the same candidate
  // search directly against the click point, not only against whichever
  // ring the browser's own hit test happened to pick. `pointerDownPointRef`
  // distinguishes a click from the drag that pans the sky, the same 8px
  // settle the touch gesture already uses below.
  const pointerDownPointRef = useRef(null);
  const handleCanvasPointerDown = (event) => {
    pointerDownPointRef.current = { x: event.clientX, y: event.clientY };
  };
  const handleCanvasClick = (event) => {
    const down = pointerDownPointRef.current;
    const moved = down
      ? Math.hypot(event.clientX - down.x, event.clientY - down.y)
      : 0;
    if (moved > 8) return;
    selectAtPoint(event, null);
  };

  // Points the view at `target` -- any target with a J2000 coordinate, drawn
  // on the map or not -- and, when `fovDegrees` is given, animates the field
  // to it (inside the map's own bounds). Returns whether the engine took it.
  const centerOnTarget = (target, fovDegrees = null) => {
    const stel = engineRef.current;
    if (!stel || !target?.coordinate) return false;

    // Prefer the catalogue object whenever it has streamed in.  Saved custom
    // framings have no catalogue entry, so create one lightweight local DSO
    // solely as a pointing anchor; it is never added to the visible map layer.
    let targetObject = nativeTargetRef.current.get(target.id)?.object;
    if (!targetObject) {
      targetObject = focusTargetRef.current.get(target.id);
    }
    if (!targetObject) {
      try {
        targetObject = stel.createObj("dso", {
          id: `planner:center:${target.id}`,
          model_data: {
            ra: target.coordinate.ra,
            de: target.coordinate.dec,
            vmag: -2.5,
            dimx: 1,
            dimy: 1,
          },
          names: [`NAME ${designation(target)}`],
          types: ["dso"],
        });
        targetObject.update();
        focusTargetRef.current.set(target.id, targetObject);
      } catch {
        return false;
      }
    }
    // A visitor who asked for less motion is taken there at once rather than
    // carried across the sky.
    const seconds = mapMoveSeconds({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    });
    stel.pointAndLock(targetObject, seconds);
    if (Number.isFinite(fovDegrees))
      stel.zoomTo(clampMapFov(fovDegrees) * stel.D2R, seconds);
    refreshRef.current?.();
    return true;
  };

  const centerSelectedTarget = () => {
    if (selectedTarget) centerOnTarget(selectedTarget);
  };

  useEffect(() => {
    const surface = touchSurfaceRef.current;
    const canvas = canvasRef.current;
    const acceptsTouch =
      window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;
    if (!surface || !canvas || !acceptsTouch) return undefined;
    const positionFor = (touch) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: touch.clientX - bounds.left, y: touch.clientY - bounds.top };
    };
    const touchFor = (event, identifier) =>
      [...event.changedTouches].find(
        (candidate) => candidate.identifier === identifier,
      );
    const sendToEngine = (state, position, identifier) => {
      engineRef.current?._core_on_mouse?.(
        identifier,
        state,
        position.x,
        position.y,
        1,
      );
    };
    const touchDistance = (left, right) =>
      Math.hypot(left.clientX - right.clientX, left.clientY - right.clientY);
    const selectNearestTarget = (touch) => {
      // The touch surface sits over the rings, so a tap never reaches one of
      // the buttons and this is the map's whole hit test on a phone. It now
      // resolves through the same ranking and the same cycle a click does,
      // rather than taking the nearest centre -- which could never reach a
      // wide target the observer tapped inside.
      selectAtPointRef.current?.(touch);
    };
    const start = (event) => {
      if (event.touches.length === 2) {
        const [left, right] = [...event.touches];
        const startDistance = touchDistance(left, right);
        const startFov = engineRef.current?.core.fov;
        if (startDistance > 0 && Number.isFinite(startFov)) {
          touchGestureRef.current = { kind: "pinch", startDistance, startFov };
          event.preventDefault();
        }
        return;
      }
      if (event.touches.length !== 1 || event.changedTouches.length !== 1)
        return;
      const touch = event.changedTouches[0];
      touchGestureRef.current = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        engineStarted: false,
        lastPosition: positionFor(touch),
      };
      event.preventDefault();
    };
    const move = (event) => {
      const gesture = touchGestureRef.current;
      if (!gesture) return;
      if (gesture.kind === "pinch") {
        const [left, right] = [...event.touches];
        if (!left || !right) return;
        const distance = touchDistance(left, right);
        const stel = engineRef.current;
        if (distance > 0 && stel) {
          // Spreading fingers narrows the field (zooms in); bringing them
          // together widens it. Direct FOV updates keep the gesture smooth.
          // The bounds are the zoom buttons' own (`sky-projection.js`), not a
          // copy of them: the gesture and the buttons cannot disagree on how
          // far the map goes.
          stel.core.fov =
            pinchedMapFov(
              gesture.startFov * stel.R2D,
              gesture.startDistance,
              distance,
            ) * stel.D2R;
          refreshRef.current?.();
        }
        event.preventDefault();
        return;
      }
      const touch = touchFor(event, gesture.id);
      if (!touch) return;
      const position = positionFor(touch);
      if (
        !gesture.engineStarted &&
        Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 8
      ) {
        sendToEngine(
          1,
          positionFor({ clientX: gesture.x, clientY: gesture.y }),
          gesture.id,
        );
        gesture.engineStarted = true;
      }
      if (gesture.engineStarted) sendToEngine(-1, position, gesture.id);
      gesture.lastPosition = position;
      event.preventDefault();
    };
    const end = (event) => {
      const gesture = touchGestureRef.current;
      touchGestureRef.current = null;
      if (!gesture) return;
      if (gesture.kind === "pinch") {
        event.preventDefault();
        return;
      }
      const touch = touchFor(event, gesture.id);
      if (gesture.engineStarted) {
        sendToEngine(
          0,
          touch ? positionFor(touch) : gesture.lastPosition,
          gesture.id,
        );
      } else if (touch) {
        selectNearestTarget(touch);
      }
      event.preventDefault();
    };
    const cancel = (event) => end(event);
    // The surface keeps a stationary touch out of Stellarium entirely (so it
    // becomes a portal target tap). Once a gesture moves, it forwards the
    // same three input states Stellarium normally receives for a pan.
    surface.addEventListener("touchstart", start, { passive: false });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end, { passive: false });
    surface.addEventListener("touchcancel", cancel, { passive: false });
    return () => {
      surface.removeEventListener("touchstart", start);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
    };
  }, []);

  const zoom = (factor, duration = 0.14) => {
    const stel = engineRef.current;
    if (!stel) return;
    stel.zoomTo(
      zoomedMapFov(stel.core.fov * stel.R2D, factor) * stel.D2R,
      duration,
    );
  };

  const resetZoom = () => {
    const stel = engineRef.current;
    if (!stel) return;
    stel.zoomTo(defaultMapFovDegrees * stel.D2R, 0.22);
  };

  const cycleConstellationMode = () => {
    const stel = engineRef.current;
    setConstellationMode((current) => {
      const next =
        current === "off" ? "lines" : current === "lines" ? "art" : "off";
      if (stel) configureConstellationLayers(stel.core, next);
      return next;
    });
  };

  const markerModeLabel = {
    labeled: text.targetMarkersLabeled,
    markersOnly: text.targetMarkersOnly,
    off: text.targetMarkersOff,
  }[targetMarkers];

  const cycleTargetMarkers = () =>
    setTargetMarkers((current) =>
      current === "labeled"
        ? "markersOnly"
        : current === "markersOnly"
          ? "off"
          : "labeled",
    );

  const bortleLabel = (value) =>
    text.bortleClass.replace("{class}", String(value));

  const selectBortleClass = (value) => {
    setManualBortleClass(value);
    setBortleMenuOpen(false);
  };

  const toggleCelestialCoordinates = () => {
    const stel = engineRef.current;
    setCelestialCoordinatesVisible((current) => {
      const next = !current;
      if (stel) stel.core.lines.equatorial.visible = next;
      return next;
    });
  };

  const zoomMapOnWheel = (event) => {
    // The target rings sit above the canvas, so they need to consume wheel
    // events themselves instead of letting the page scroll underneath them.
    event.preventDefault();
    const factor = Math.max(
      0.78,
      Math.min(1.28, Math.exp(event.deltaY * 0.0015)),
    );
    zoom(factor, 0.08);
  };

  const useFraming = () => {
    const stel = engineRef.current;
    const center = stel ? framingCentre(stel) : null;
    if (!center) return;
    const fieldWidth = Number(field?.width);
    const fieldHeight = Number(field?.height);
    // A surface registered at `planner.framing.surface` and set by the person
    // (a mosaic) says what the framing stores and the area it covers; without
    // one, the frame is the field.
    const angleDegrees = frameAngleRef.current;
    const surfaceDefinition =
      frameSurface && surfaceModel
        ? surfaceModel.frameDefinition({
            center,
            field,
            surface: frameSurface,
            angleDegrees,
          })
        : null;
    const previewField = surfaceDefinition?.field || field;
    // What lies under the frame (`framing-targets.js`): the targets whose
    // centre is inside it or whose extent reaches into it -- M31, 190' across,
    // is under a 0.4 degree frame laid on its arm -- over the frame's own
    // footprint (the whole surface for a surface), ranked: the target the
    // search put forward first, then by nearness and fame, five at most.
    // Candidates include the full calculated night, so a UI filter cannot make
    // a known object disappear from the naming proposal.
    const matches = framingTargetsUnderFrame({
      center,
      field: {
        width: Number(previewField?.width),
        height: Number(previewField?.height),
        shape: previewField?.shape || field?.shape,
      },
      angleDegrees,
      candidates: knownFramingTargets,
      featured: highlightedTarget,
    }).map(framingMatch);
    const draft = framingDraft({
      center,
      field: { width: fieldWidth, height: fieldHeight, shape: field?.shape },
      matches,
      mosaic: surfaceDefinition?.stored || null,
      previewImageUrl: framingPreviewUrl(center, previewField, visualMode),
      angleDegrees,
    });
    if (draft) onUseFraming?.(draft);
  };

  // The fullscreen framing editor's ✓ and its "Modifier" re-centring both
  // act on internals private to this component (the engine instance, the
  // live view) — exposed rather than duplicated.
  useImperativeHandle(
    ref,
    () => ({
      triggerFraming: useFraming,
      // The view under the frame (its centre, the field across), noted by
      // the framing editor before « Définir mon matériel » leaves the page.
      viewState: () => {
        const stel = engineRef.current;
        const center = stel ? framingCentre(stel) : null;
        return center ? { center, fovDegrees: stel.core.fov * stel.R2D } : null;
      },
      centerOnSelected: centerSelectedTarget,
      // The editor's search points the view at the target it chose, in the
      // field its size asks for.
      focusOnTarget: centerOnTarget,
      // …and hands the keyboard back to the magnifier that opened it. The
      // bar may have folded meanwhile, so it is opened first.
      focusSearchControl: () => {
        revealControlsRef.current();
        window.requestAnimationFrame(() => searchButtonRef.current?.focus());
      },
      // "Choisir le matériel" opens the first
      // of the equipment choices (the telescope's list) under the map.
      focusEquipmentControl: () =>
        setOpenEquipmentControl(equipmentControls?.[0]?.key ?? null),
    }),
    [
      field,
      frameSurface,
      surfaceModel,
      knownFramingTargets,
      selectedTarget,
      highlightedTarget,
      equipmentControls,
    ],
  );

  // The view brought back once the engine is ready, then never again.
  const initialViewRef = useRef(initialView);
  useEffect(() => {
    const view = initialViewRef.current;
    if (!view?.center || status !== "ready") return;
    initialViewRef.current = null;
    centerOnTarget(
      {
        id: `framing-editor-view-${Date.now()}`,
        designation: "J2000",
        coordinate: view.center,
      },
      view.fovDegrees,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!autoCenterOnSelected || !selectedTarget) return;
    centerSelectedTarget();
    // Runs once the target the caller asked to centre on resolves (the
    // engine needs a tick to be ready on first mount) — not on every
    // subsequent render, or a manual pan would keep snapping back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCenterOnSelected, selectedTarget?.id, status]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const handleWheel = (event) => {
      // Alt + the wheel anywhere over the map turns the frame (1°, 15° with
      // Shift) instead of zooming.
      const turned = onTurnFrameRef.current
        ? framingAngleAfterWheel(frameAngleRef.current, event)
        : null;
      if (turned != null) {
        event.preventDefault();
        event.stopPropagation();
        onTurnFrameRef.current(turned);
        return;
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          ".planner-night-map-target, .planner-night-map-controls",
        )
      )
        return;
      event.preventDefault();
      const stel = engineRef.current;
      if (!stel) return;
      const factor = Math.max(
        0.78,
        Math.min(1.28, Math.exp(event.deltaY * 0.0015)),
      );
      stel.zoomTo(
        zoomedMapFov(stel.core.fov * stel.R2D, factor) * stel.D2R,
        0.08,
      );
    };
    shell.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () => shell.removeEventListener("wheel", handleWheel, true);
  }, []);

  return (
    <section className="planner-night-map">
      {showSectionHeading && (
        <p className="eyebrow planner-recommendation-subsection">
          {text.mapSection}
        </p>
      )}
      <div className="planner-night-map-layout">
        <div className="planner-night-map-shell" ref={shellRef}>
          <canvas
            className="planner-night-map-canvas"
            ref={canvasRef}
            role="application"
            aria-label={text.title}
            onPointerDown={handleCanvasPointerDown}
            onClick={handleCanvasClick}
          />
          <div
            className="planner-night-map-touch-surface"
            ref={touchSurfaceRef}
          />
          <div
            className={`planner-night-map-controls${controlsExpanded ? " is-expanded" : ""}`}
            aria-label={text.controls}
            onWheel={zoomMapOnWheel}
            // Anything the observer actually touches inside the bar restarts
            // its countdown, Capturing here covers the cells without threading
            // the call through each of their handlers, and focus covers a
            // keyboard walk through them.
            onPointerDownCapture={revealControlsUnlessHandle}
            onFocusCapture={revealControls}
            onKeyDownCapture={revealControlsUnlessHandle}
          >
            <div
              className="planner-night-map-controls-group"
              id="planner-night-map-controls-group"
            >
              {/* The search is the bar's first control. Only the framing
                  editor gives the map something to search for. */}
              {onSearch && (
                <button
                  className={`is-search${searchOpen ? " is-active" : ""}`}
                  type="button"
                  ref={searchButtonRef}
                  aria-label={message(locale, "plannerFramingSearchTitle")}
                  aria-haspopup="dialog"
                  aria-expanded={searchOpen}
                  title={message(locale, "plannerFramingSearchTitle")}
                  disabled={status !== "ready"}
                  onClick={onSearch}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="6" />
                    <path d="m15 15 5.5 5.5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                aria-label={text.zoomIn}
                title={text.zoomIn}
                onClick={() => zoom(0.68)}
              >
                +
              </button>
              <button
                type="button"
                aria-label={text.zoomOut}
                title={text.zoomOut}
                onClick={() => zoom(1.46)}
              >
                −
              </button>
              <button
                className={`is-constellation-toggle is-${constellationMode}`}
                type="button"
                aria-label={
                  text[
                    `constellation${constellationMode[0].toUpperCase()}${constellationMode.slice(1)}`
                  ]
                }
                title={
                  text[
                    `constellation${constellationMode[0].toUpperCase()}${constellationMode.slice(1)}`
                  ]
                }
                onClick={cycleConstellationMode}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m4 16 5-7 5 3 6-6" />
                  <circle cx="4" cy="16" r="1.6" />
                  <circle cx="9" cy="9" r="1.6" />
                  <circle cx="14" cy="12" r="1.6" />
                  <circle cx="20" cy="6" r="1.6" />
                  {constellationMode === "off" && <path d="M4 4l16 16" />}
                </svg>
              </button>
              <button
                className={`is-marker-toggle is-${targetMarkers}${
                  targetLabelsVisible ? " is-active" : ""
                }`}
                type="button"
                aria-label={markerModeLabel}
                aria-pressed={targetMarkersVisible}
                title={markerModeLabel}
                onClick={cycleTargetMarkers}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12s3.1-5.5 9-5.5S21 12 21 12s-3.1 5.5-9 5.5S3 12 3 12Z" />
                  {/* The label is what the middle state drops, so the pupil
                      goes with it and the eye -- the marker -- stays. */}
                  {targetMarkers !== "markersOnly" && (
                    <circle cx="12" cy="12" r="2.3" />
                  )}
                  {targetMarkers === "off" && <path d="m4 4 16 16" />}
                </svg>
              </button>
              {controlExtensions.map((Control, index) => (
                <Control key={index} {...extensionProps} />
              ))}
              <div
                className={`planner-night-map-bortle${bortleMenuOpen ? " is-open" : ""}`}
                ref={bortleControlRef}
              >
                <button
                  className="is-bortle"
                  type="button"
                  aria-expanded={bortleMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={`${text.bortlePicker} — ${bortleLabel(bortleClass)}`}
                  title={`${text.bortlePicker} — ${bortleLabel(bortleClass)}`}
                  onClick={() => setBortleMenuOpen((open) => !open)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />
                    <path d="M17.5 4.2v2.6M16.2 5.5h2.6" />
                  </svg>
                  <small aria-hidden="true">{bortleClass}</small>
                </button>
                {bortleMenuOpen && (
                  <div
                    className="planner-night-map-bortle-menu"
                    role="listbox"
                    aria-label={text.bortlePicker}
                  >
                    <button
                      aria-selected={manualBortleClass === null}
                      className={
                        manualBortleClass === null ? "is-selected" : ""
                      }
                      onClick={() => selectBortleClass(null)}
                      role="option"
                      type="button"
                    >
                      {placeBortleClass === null
                        ? text.bortleFromPlaceUnknown
                        : `${text.bortleFromPlace} · ${bortleLabel(placeBortleClass)}`}
                    </button>
                    {bortleClasses().map((value) => (
                      <button
                        aria-selected={manualBortleClass === value}
                        className={
                          manualBortleClass === value ? "is-selected" : ""
                        }
                        key={value}
                        onClick={() => selectBortleClass(value)}
                        role="option"
                        type="button"
                      >
                        {bortleLabel(value)}
                        <small>
                          {text.bortleLimitingMagnitude.replace(
                            "{magnitude}",
                            new Intl.NumberFormat(locale, {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            }).format(bortleLimitingMagnitude(value)),
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={
                  celestialCoordinatesVisible
                    ? "is-active is-coordinates"
                    : "is-coordinates"
                }
                type="button"
                aria-label={
                  celestialCoordinatesVisible
                    ? text.hideCelestialCoordinates
                    : text.showCelestialCoordinates
                }
                aria-pressed={celestialCoordinatesVisible}
                title={
                  celestialCoordinatesVisible
                    ? text.hideCelestialCoordinates
                    : text.showCelestialCoordinates
                }
                onClick={toggleCelestialCoordinates}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M4 12h16M12 4c2.3 2.1 3.5 4.8 3.5 8S14.3 17.9 12 20M12 4C9.7 6.1 8.5 8.8 8.5 12s1.2 5.9 3.5 8" />
                </svg>
              </button>
              {/* The reset is the bar's last button -- it undoes the layer
                  toggles and the coordinates rather than belonging among them,
                  so it comes after both. */}
              <button
                className="is-reset"
                type="button"
                aria-label={text.resetZoom}
                title={text.resetZoom}
                onClick={resetZoom}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 8V4h4" />
                  <path d="M5 4a8 8 0 1 1-1 10" />
                </svg>
              </button>
            </div>
            {/* The field-of-view readout is also the bar's own handle -- the
                one cell that survives the fold, and the target a click
                reopens it on. The chevron points at where the controls unfold
                from. */}
            <button
              className="planner-night-map-controls-handle"
              type="button"
              aria-controls="planner-night-map-controls-group"
              aria-expanded={controlsExpanded}
              aria-label={`${text.zoomLevel} · ${
                controlsExpanded ? text.hideControls : text.showControls
              }`}
              title={controlsExpanded ? text.hideControls : text.showControls}
              onClick={toggleControls}
            >
              <output title={text.zoomLevel}>
                {formatMapFov(zoomDegrees, locale)}
              </output>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 7 5 5-5 5" />
              </svg>
            </button>
          </div>
          <div
            className={[
              "planner-night-map-overlays",
              ...overlayClassNames,
            ].join(" ")}
            data-turned={framingTurnStyle(frameAngleDegrees) ? "" : undefined}
            style={framingTurnStyle(frameAngleDegrees)}
          >
            <div
              className="planner-night-map-equipment-field planner-night-map-frame"
              ref={equipmentFieldRef}
              title={text.equipmentField}
              aria-label={
                frameAngleShown
                  ? `${text.equipmentField} · ${message(
                      locale,
                      "plannerFramingPositionAngle",
                    ).replace(
                      "{angle}",
                      String(Math.round(frameAngleDegrees) % 360),
                    )}`
                  : text.equipmentField
              }
            >
              <span
                className="planner-night-map-equipment-centre"
                aria-hidden="true"
              />
              <span
                className="planner-night-map-equipment-fov"
                aria-hidden="true"
              >
                {frameAngleShown
                  ? framingCaptionWithAngle(
                      formatEquipmentField(field, locale),
                      frameAngleDegrees,
                    )
                  : formatEquipmentField(field, locale)}
              </span>
              <span
                className="planner-night-map-equipment-label"
                aria-hidden="true"
                title={equipmentLabel}
              >
                {equipmentLabel}
              </span>
            </div>
            {overlayExtensions.map((Overlay, index) => (
              <Overlay
                key={index}
                {...extensionProps}
                subscribeFrame={subscribeFrame}
              />
            ))}
            {targets.map((target) => {
              const category = categoryFor(target);
              const planned = selectedIds?.has(target.id);
              // The highlighted target ignores the markers' and the labels'
              // display, and takes no click (`framing-editor.js`).
              const presentation = mapMarkerPresentation({
                targetId: target.id,
                highlightedId,
                selectedId,
                markersVisible: targetMarkersVisible,
                labelsVisible: targetLabelsVisible,
              });
              return (
                <button
                  className={`planner-night-map-target is-${category}${planned ? " is-in-plan" : ""}${presentation.reticle ? " is-selected" : ""}${presentation.highlighted ? " is-highlighted" : ""}`}
                  key={target.id}
                  type="button"
                  hidden={presentation.hidden}
                  // A mark that cannot be tapped is not a control: it leaves
                  // the tab order and the accessibility tree, and the
                  // highlight chip names it instead.
                  tabIndex={presentation.interactive ? undefined : -1}
                  aria-hidden={presentation.interactive ? undefined : true}
                  ref={(element) => {
                    if (element)
                      markerElementRef.current.set(target.id, element);
                    else markerElementRef.current.delete(target.id);
                  }}
                  onClick={
                    presentation.interactive
                      ? (event) =>
                          // `detail` is 0 for a keyboard activation, which has
                          // no click point of its own: that selects the ring
                          // whose button was focused, with no cycling.
                          event.detail === 0
                            ? selectTarget(target.id)
                            : selectAtPoint(event, target.id)
                      : undefined
                  }
                  onWheel={zoomMapOnWheel}
                  title={`${designation(target)} — ${target.skyTarget?.type || text.other}`}
                >
                  {/* The middle state of the cycle keeps the ring and drops
                      the name. It stays in the accessibility tree through
                      the button's own `title`. The highlighted target is
                      written "M31 · Galaxie d’Andromède" -- its designation
                      and its name -- whatever the cycle says. */}
                  {presentation.labelVisible && (
                    <span className="planner-night-map-target-label">
                      {presentation.highlighted
                        ? framingSearchLabel(target)
                        : designation(target)}
                    </span>
                  )}
                  {/* The selected target's own reticle -- four short ticks
                      just outside the ring, still, in place of Stellarium's
                      own (now suppressed, see the `refresh` loop's
                      `core.selection` guard). Four plain ticks rather than a
                      brightened ring so the object underneath is never
                      covered. */}
                  {presentation.reticle && (
                    <span
                      className="planner-night-map-reticle"
                      aria-hidden="true"
                    >
                      <span className="planner-night-map-reticle-tick is-n" />
                      <span className="planner-night-map-reticle-tick is-e" />
                      <span className="planner-night-map-reticle-tick is-s" />
                      <span className="planner-night-map-reticle-tick is-w" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {targetMarkersVisible && selectedTarget && (
            <aside
              className="planner-night-map-target-preview"
              aria-label={selectedTarget.title || designation(selectedTarget)}
            >
              <MapTargetPreview
                key={selectedTarget.id}
                target={selectedTarget}
                visualMode={visualMode}
              />
              <MapTargetSummary
                action={
                  selectedInPlan ? (
                    <button
                      className="btn-tertiary is-destructive planner-target-action"
                      type="button"
                      aria-label={message(locale, "plannerRemove")}
                      disabled={!editable}
                      onClick={(event) =>
                        // The preview is the element the observer is looking
                        // at: it is what the page keeps still while the
                        // schedule stage above loses a row -- the addition
                        // below already did this.
                        onRemove?.(selectedTarget.id, event.currentTarget)
                      }
                    >
                      <span className="planner-target-action-label">
                        {message(locale, "plannerRemove")}
                      </span>
                      <MapTargetActionIcon added />
                    </button>
                  ) : selectedCard ? (
                    <span
                      className={`planner-target-action-wrap${addBlockedHintVisible ? " is-hint-visible" : ""}`}
                    >
                      <button
                        className={`btn-primary planner-target-action${addDisabledReason ? " is-disabled" : ""}`}
                        type="button"
                        aria-disabled={addDisabledReason ? true : undefined}
                        aria-label={
                          addDisabledReason
                            ? `${message(locale, "plannerAdd")}. ${message(locale, addDisabledReason)}`
                            : message(locale, "plannerAdd")
                        }
                        disabled={!editable && !addDisabledReason}
                        onBlur={() => setAddBlockedHintVisible(false)}
                        onClick={(event) => {
                          if (addDisabledReason) {
                            setAddBlockedHintVisible((visible) => !visible);
                            return;
                          }
                          if (!editable || !canAdd) return;
                          onAdd?.(selectedCard, event.currentTarget);
                        }}
                      >
                        <span className="planner-target-action-label">
                          {message(locale, "plannerAdd")}
                        </span>
                        <MapTargetActionIcon />
                      </button>
                      {addDisabledReason && (
                        <span
                          className="planner-target-action-tooltip"
                          role="tooltip"
                        >
                          {message(locale, addDisabledReason)}
                        </span>
                      )}
                    </span>
                  ) : null
                }
                card={selectedCard}
                centerAction={
                  <button
                    className="planner-night-map-target-center"
                    type="button"
                    disabled={status !== "ready"}
                    aria-label={text.centerTarget}
                    title={text.centerTarget}
                    onClick={centerSelectedTarget}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="5" />
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    </svg>
                  </button>
                }
                locale={locale}
                target={selectedTarget}
                timeZone={location.timeZone}
              />
            </aside>
          )}
          {status !== "ready" && (
            <p className="planner-night-map-status" role="status">
              {status === "error" ? text.unavailable : text.loading}
            </p>
          )}
          {/* The legend has nothing to explain once the bar it belongs to has
              folded away, so it fades with the bar rather than floating over
              the sky on its own -- `controlsExpanded` stays the single source
              of truth for both. */}
          <div
            className={`planner-night-map-legend${controlsExpanded ? " is-visible" : ""}`}
            aria-hidden={!controlsExpanded}
          >
            {["nebula", "galaxy", "cluster", "other"].map((category) => (
              <span className={`is-${category}`} key={category}>
                {text[category]}
              </span>
            ))}
            <span className="is-in-plan">{text.selected}</span>
          </div>
          <a
            className="planner-night-map-survey-credit"
            href={activeSurveyUrl}
            target="_blank"
            rel="noreferrer"
          >
            {surveyCredit}
          </a>
        </div>
      </div>
      <div className="planner-night-map-footer">
        {equipmentControls && (
          <div
            className="planner-map-equipment-quick-controls"
            aria-label={message(locale, "plannerEquipment")}
            ref={equipmentControlsRef}
          >
            {equipmentControls.map((control) => {
              // A control with a placeholder shows it while nothing of its
              // list is chosen, never the first of the list.
              const selectedOption =
                control.options.find((option) => option.id === control.value) ||
                (control.placeholder ? null : control.options[0]);
              const shownName = selectedOption?.name ?? control.placeholder;
              const isOpen = openEquipmentControl === control.key;
              return (
                <div
                  className={`planner-map-equipment-quick-control${
                    isOpen ? " is-open" : ""
                  }`}
                  key={control.key}
                >
                  <button
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                    aria-label={control.label}
                    className="planner-map-equipment-quick-trigger"
                    disabled={!editable}
                    onClick={() =>
                      setOpenEquipmentControl((current) =>
                        current === control.key ? null : control.key,
                      )
                    }
                    type="button"
                  >
                    <span className={`is-${control.icon}`} aria-hidden="true">
                      <EquipmentControlIcon kind={control.icon} />
                    </span>
                    <strong title={shownName}>{shownName}</strong>
                    <svg
                      aria-hidden="true"
                      className="planner-map-equipment-quick-chevron"
                      viewBox="0 0 24 24"
                    >
                      <path d="m7 9 5 5 5-5" />
                    </svg>
                  </button>
                  {isOpen && control.picker ? (
                    <QuickEquipmentPicker
                      control={control}
                      onChosen={() => setOpenEquipmentControl(null)}
                    />
                  ) : null}
                  {isOpen && !control.picker && (
                    <div
                      aria-label={control.label}
                      className="planner-map-equipment-quick-menu"
                      role="listbox"
                    >
                      {control.options.map((option) => (
                        <button
                          aria-selected={option.id === control.value}
                          className={
                            option.id === control.value ? "is-selected" : ""
                          }
                          key={option.id}
                          onClick={() => {
                            control.onChange(option.id);
                            setOpenEquipmentControl(null);
                          }}
                          role="option"
                          type="button"
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="planner-night-map-tools planner-plan-tools">
          {!hideUseFramingAction && (
            <button
              className="btn-primary planner-plan-tool"
              type="button"
              disabled={status !== "ready" || !editable || !canAdd}
              onClick={useFraming}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" />
                <path d="M8 8h8v8H8z" />
              </svg>
              <span>{text.useFraming}</span>
            </button>
          )}
          {onConfigureFrameSurface && (
            <FrameSettingsTool
              active={Boolean(frameSurface)}
              disabled={status !== "ready" || !editable || !canAdd}
              locale={locale}
              onConfigure={onConfigureFrameSurface}
            />
          )}
        </div>
      </div>
    </section>
  );
});

// "Paramètres": the settings of the frame "Utiliser ce cadrage" lays --
// a single field, and the "Mosaïque" section, live or greyed
// (`FrameSettingsSheet`). While a mosaic is set it takes the secondary look
// (the one of a chosen segment) and says so to a screen reader; off, it is the
// plain tertiary (so that the state is visible).
export function FrameSettingsTool({ active, disabled, locale, onConfigure }) {
  return (
    <button
      aria-pressed={active ? true : undefined}
      className={`${active ? "btn-secondary is-active" : "btn-tertiary"} planner-plan-tool`}
      type="button"
      disabled={disabled}
      onClick={onConfigure}
    >
      <span className="planner-mosaic-settings-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" />
          <path d="M8 8h8v8H8z" />
        </svg>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      </span>
      <span>{message(locale, "plannerMosaicSettings")}</span>
    </button>
  );
}

export function PrintableNightSkyMap({ cards, locale, subtitle }) {
  const text = copyFor(copy, locale, "PlannerNightSkyMap.copy");
  const targets = cards
    .map((card) => card.target)
    .filter((target) => target.coordinate);
  const point = (target) => ({
    x: 24 + (target.coordinate.ra / 360) * 752,
    y: 22 + ((90 - target.coordinate.dec) / 180) * 336,
  });
  return (
    <section className="planner-print-sky-map">
      <div className="planner-print-section-heading">
        <h2>{text.title}</h2>
        <p>{subtitle || text.plan}</p>
      </div>
      <svg viewBox="0 0 800 380" role="img" aria-label={text.title}>
        <rect width="800" height="380" rx="14" />
        {[0, 90, 180, 270, 360].map((ra) => (
          <line
            key={ra}
            x1={24 + (ra / 360) * 752}
            x2={24 + (ra / 360) * 752}
            y1="22"
            y2="358"
          />
        ))}
        {[-60, -30, 0, 30, 60].map((dec) => (
          <line
            key={dec}
            x1="24"
            x2="776"
            y1={22 + ((90 - dec) / 180) * 336}
            y2={22 + ((90 - dec) / 180) * 336}
          />
        ))}
        {targets.map((target) => {
          const pos = point(target);
          return (
            <g className={`is-${categoryFor(target)}`} key={target.id}>
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx={Math.max(
                  5,
                  Math.min(35, (target.apparentSizeArcmin?.[0] || 12) / 4),
                )}
                ry={Math.max(
                  5,
                  Math.min(35, (target.apparentSizeArcmin?.[1] || 12) / 4),
                )}
              />
              <text x={pos.x + 8} y={pos.y - 7}>
                {designation(target)}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
