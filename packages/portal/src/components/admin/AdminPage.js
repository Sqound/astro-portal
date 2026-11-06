"use client";

import { copyFor, shippedLocales } from "astro-contracts/locales";
import { equipmentCopyFor } from "portal/components/equipment/equipment-copy.js";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  additionalAdminMetadata,
  emptyAdminRecord,
  normalizeAdminRecord,
  structuredAdminMetadataKeys,
} from "portal/admin-draft.js";
import { adminPathname } from "portal/admin-route.js";
import { AdminConfirmationDialog } from "portal/components/admin/AdminConfirmationDialog.js";
import { CaptureLibrary } from "portal/components/admin/CaptureLibrary.js";
import { DefaultEquipmentSection } from "portal/components/admin/DefaultEquipmentSection.js";
import { ReferenceLibrary } from "portal/components/admin/ReferenceLibrary.js";
import { LogsLibrary } from "portal/components/admin/LogsLibrary.js";
import { TranslationLibrary } from "portal/components/admin/TranslationLibrary.js";
import { TargetLibrary } from "portal/components/admin/TargetLibrary.js";
import { StaticDataLibrary } from "portal/components/admin/StaticDataLibrary.js";
import {
  AssetVariantSelect,
  DetailMetadataSections,
} from "portal/components/detail/DetailsPanel.js";
import { optionGroup } from "portal/format.js";
import {
  captureCategories,
  canonicalObjectType,
  constellations,
  objectTypes,
  taxonomyLabel,
} from "astro-core/catalog-taxonomy.js";
import {
  captureEquipmentRole,
  publicCaptureEquipment,
} from "portal/capture-equipment.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";

const emptyRecord = emptyAdminRecord;

const structuredMetadataSectionCopy = {
  acquisition: {
    en: {
      description:
        "Values shown in the acquisition section of the public detail panel.",
      rule: "Use label/value pairs. Per-image acquisition values take precedence, while capture date and integration are calculated from the selected image.",
    },
    fr: {
      description:
        "Valeurs affichées dans la section Acquisition de la fiche publique.",
      rule: "Saisissez des couples libellé / valeur. Les valeurs propres à une image les remplacent ; la date et l’intégration sont calculées depuis l’image sélectionnée.",
    },
    ja: {
      description: "公開詳細の「撮影」欄に表示する値です。",
      rule: "項目名と値の組で入力します。画像固有の撮影情報が優先され、日付と積分は選択画像から計算されます。",
    },
    de: {
      description:
        "Werte, die im Abschnitt „Aufnahmedaten“ des öffentlichen Eintrags angezeigt werden.",
      rule: "Gib Paare aus Bezeichnung und Wert ein. Werte, die für ein Bild gelten, ersetzen diese; Datum und Integration werden aus dem ausgewählten Bild berechnet.",
    },
    es: {
      description:
        "Valores mostrados en la sección Adquisición de la ficha pública.",
      rule: "Ingresa pares etiqueta / valor. Los valores propios de una imagen los reemplazan; la fecha y la integración se calculan a partir de la imagen seleccionada.",
    },
    it: {
      description:
        "Valori mostrati nella sezione Acquisizione della scheda pubblica.",
      rule: "Inserisci coppie etichetta / valore. I valori propri di un’immagine li sostituiscono; la data e l’integrazione sono calcolate dall’immagine selezionata.",
    },
    "pt-BR": {
      description: "Valores exibidos na seção Aquisição da ficha pública.",
      rule: "Informe pares rótulo / valor. Os valores próprios de uma imagem os substituem; a data e a integração são calculadas a partir da imagem selecionada.",
    },
    "zh-Hans": {
      description: "公开详情面板“拍摄”部分显示的值。",
      rule: "请使用标签/值对。单张图像自身的拍摄值优先；拍摄日期和积分时间则根据所选图像计算。",
    },
    "zh-Hant": {
      description: "公開詳細資訊面板「拍攝」區塊顯示的值。",
      rule: "請使用標籤／值配對。單張影像自身的拍攝值優先；拍攝日期與總曝光時間則依所選影像計算。",
    },
    ru: {
      description:
        "Значения, которые показываются в разделе «Съёмка» публичной карточки.",
      rule: "Используйте пары «подпись / значение». Значения конкретного снимка имеют приоритет, а дата съёмки и суммарная выдержка вычисляются по выбранному снимку.",
    },
  },
  processing: {
    en: {
      description:
        "Processing profile, pipeline and tools shown for the selected rendering.",
      rule: "The rendering family and colour curve can be overridden by the selected image metadata.",
    },
    fr: {
      description:
        "Profil, pipeline et outils affichés pour le rendu sélectionné.",
      rule: "La famille de rendu et la courbe de couleur peuvent être remplacées par les métadonnées de l’image sélectionnée.",
    },
    ja: {
      description:
        "選択中の仕上げに表示するプロファイル、処理工程、ツールです。",
      rule: "仕上げの種類と色カーブは、選択画像のメタデータで上書きできます。",
    },
    de: {
      description:
        "Profil, Pipeline und Werkzeuge, die für die ausgewählte Bearbeitung angezeigt werden.",
      rule: "Die Bearbeitungsfamilie und die Farbkurve können durch die Metadaten des ausgewählten Bildes ersetzt werden.",
    },
    es: {
      description:
        "Perfil, pipeline y herramientas mostrados para el procesado seleccionado.",
      rule: "La familia de procesado y la curva de color pueden ser reemplazadas por los metadatos de la imagen seleccionada.",
    },
    it: {
      description:
        "Profilo, pipeline e strumenti mostrati per l’elaborazione selezionata.",
      rule: "La famiglia di elaborazione e la curva di colore possono essere sostituite dai metadati dell’immagine selezionata.",
    },
    "pt-BR": {
      description:
        "Perfil, pipeline e ferramentas exibidos para a renderização selecionada.",
      rule: "A família de renderização e a curva de cor podem ser substituídas pelos metadados da imagem selecionada.",
    },
    "zh-Hans": {
      description: "所选成品显示的处理配置、流程和工具。",
      rule: "成品类别和色彩曲线可被所选图像的元数据覆盖。",
    },
    "zh-Hant": {
      description: "所選成品顯示的處理設定檔、流程與工具。",
      rule: "成品類別與色彩曲線可由所選影像的中繼資料覆寫。",
    },
    ru: {
      description:
        "Профиль, конвейер и инструменты обработки, которые показываются для выбранного варианта.",
      rule: "Тип обработки и цветовую кривую можно переопределить метаданными выбранного снимка.",
    },
  },
  integrations: {
    en: {
      description: "One row per filter for the integration table.",
      rule: "Use filter, frames and seconds. totalSeconds is optional; when absent, it is calculated as frames × seconds.",
    },
    fr: {
      description: "Une ligne par filtre pour le tableau d’intégration.",
      rule: "Utilisez filter, frames et seconds. totalSeconds est facultatif ; sans lui, le total est calculé par frames × seconds.",
    },
    ja: {
      description: "積分表のフィルターごとの1行です。",
      rule: "filter、frames、seconds を使用します。totalSeconds は任意で、なければ frames × seconds から計算されます。",
    },
    de: {
      description: "Eine Zeile pro Filter für die Integrationstabelle.",
      rule: "Verwende filter, frames und seconds. totalSeconds ist optional; fehlt es, wird die Summe als frames × seconds berechnet.",
    },
    es: {
      description: "Una línea por filtro para la tabla de integración.",
      rule: "Usa filter, frames y seconds. totalSeconds es opcional; si falta, el total se calcula como frames × seconds.",
    },
    it: {
      description: "Una riga per filtro per la tabella di integrazione.",
      rule: "Usa filter, frames e seconds. totalSeconds è facoltativo; senza di esso, il totale è calcolato come frames × seconds.",
    },
    "pt-BR": {
      description: "Uma linha por filtro para a tabela de integração.",
      rule: "Use filter, frames e seconds. totalSeconds é opcional; sem ele, o total é calculado por frames × seconds.",
    },
    "zh-Hans": {
      description: "积分表中每个滤光片一行。",
      rule: "请使用 filter、frames 和 seconds。totalSeconds 为可选项；缺省时按 frames × seconds 计算。",
    },
    "zh-Hant": {
      description: "總曝光時間表中每個濾鏡一列。",
      rule: "請使用 filter、frames 和 seconds。totalSeconds 為選填；未提供時以 frames × seconds 計算。",
    },
    ru: {
      description: "Одна строка на фильтр для таблицы накопления.",
      rule: "Используйте filter, frames и seconds. Поле totalSeconds необязательное; если его нет, итог вычисляется как frames × seconds.",
    },
  },
  assetMetadata: {
    en: {
      description: "Overrides and technical data for each associated image.",
      rule: "Each entry needs a baseName matching an associated file. sky uses degrees for RA, Dec, field dimensions and orientation; scale is arcsec per pixel.",
    },
    fr: {
      description: "Surcharges et données techniques de chaque image associée.",
      rule: "Chaque entrée doit avoir un baseName correspondant à un fichier associé. sky utilise des degrés pour RA, Dec, champ et orientation ; scale est en secondes d’arc par pixel.",
    },
    ja: {
      description: "関連する各画像の上書き情報と技術データです。",
      rule: "各項目の baseName は関連ファイルと一致させます。sky の RA、Dec、写野、向きは度、scale は1ピクセル当たりの秒角です。",
    },
    de: {
      description:
        "Überschreibungen und technische Daten jedes zugeordneten Bildes.",
      rule: "Jeder Eintrag benötigt einen baseName, der zu einer zugeordneten Datei passt. sky verwendet Grad für RA, Dec, Feldgröße und Ausrichtung; scale wird in Bogensekunden pro Pixel angegeben.",
    },
    es: {
      description:
        "Valores sustituidos y datos técnicos de cada imagen asociada.",
      rule: "Cada entrada debe tener un baseName que corresponda a un archivo asociado. sky usa grados para RA, Dec, campo y orientación; scale se expresa en segundos de arco por píxel.",
    },
    it: {
      description: "Sostituzioni e dati tecnici di ogni immagine associata.",
      rule: "Ogni voce deve avere un baseName corrispondente a un file associato. sky usa i gradi per RA, Dec, campo e orientamento; scale è in secondi d’arco per pixel.",
    },
    "pt-BR": {
      description: "Substituições e dados técnicos de cada imagem associada.",
      rule: "Cada entrada deve ter um baseName correspondente a um arquivo associado. sky usa graus para RA, Dec, campo e orientação; scale é em segundos de arco por pixel.",
    },
    "zh-Hans": {
      description: "每张关联图像的覆盖值和技术数据。",
      rule: "每个条目都需要一个与关联文件匹配的 baseName。sky 中的 RA、Dec、视场尺寸和方向以度为单位；scale 为每像素的角秒数。",
    },
    "zh-Hant": {
      description: "每張關聯影像的覆寫值與技術資料。",
      rule: "每個項目都需要一個與關聯檔案相符的 baseName。sky 中的 RA、Dec、視野尺寸與方向以度為單位；scale 為每像素的角秒數。",
    },
    ru: {
      description:
        "Переопределения и технические данные для каждого связанного снимка.",
      rule: "У каждой записи должно быть значение baseName, совпадающее со связанным файлом. В sky значения RA, Dec, размеры поля и ориентация задаются в градусах; scale — это угловые секунды на пиксель.",
    },
  },
  progressions: {
    en: {
      description:
        "Intermediate integration steps shown in the progression carousel.",
      rule: "Each entry needs the baseName of its image. progressionLabel, progressionPeriod and progressionFilter describe its public step.",
    },
    fr: {
      description:
        "Paliers d’intégration affichés dans le carrousel de progression.",
      rule: "Chaque entrée doit avoir le baseName de son image. progressionLabel, progressionPeriod et progressionFilter décrivent le palier public.",
    },
    ja: {
      description: "進行状況のカルーセルに表示する途中段階です。",
      rule: "各項目の baseName は画像名と一致させます。progressionLabel、progressionPeriod、progressionFilter が公開上の段階を説明します。",
    },
    de: {
      description:
        "Integrationsstufen, die im Verlaufskarussell angezeigt werden.",
      rule: "Jeder Eintrag benötigt den baseName seines Bildes. progressionLabel, progressionPeriod und progressionFilter beschreiben die öffentliche Stufe.",
    },
    es: {
      description:
        "Etapas de integración mostradas en el carrusel de progresión.",
      rule: "Cada entrada debe tener el baseName de su imagen. progressionLabel, progressionPeriod y progressionFilter describen la etapa pública.",
    },
    it: {
      description:
        "Tappe di integrazione mostrate nel carosello di progressione.",
      rule: "Ogni voce deve avere il baseName della sua immagine. progressionLabel, progressionPeriod e progressionFilter descrivono la tappa pubblica.",
    },
    "pt-BR": {
      description: "Etapas de integração exibidas no carrossel de progressão.",
      rule: "Cada entrada deve ter o baseName da sua imagem. progressionLabel, progressionPeriod e progressionFilter descrevem a etapa pública.",
    },
    "zh-Hans": {
      description: "进度轮播中显示的中间积分阶段。",
      rule: "每个条目都需要其图像的 baseName。progressionLabel、progressionPeriod 和 progressionFilter 用于描述其公开显示的阶段。",
    },
    "zh-Hant": {
      description: "進度輪播中顯示的中間曝光累計階段。",
      rule: "每個項目都需要其影像的 baseName。progressionLabel、progressionPeriod 和 progressionFilter 用於描述其公開顯示的階段。",
    },
    ru: {
      description:
        "Промежуточные этапы накопления, которые показываются в карусели хода работы.",
      rule: "У каждой записи должно быть значение baseName её снимка. Поля progressionLabel, progressionPeriod и progressionFilter описывают публичный этап.",
    },
  },
  stellarium: {
    en: {
      description: "Information used to open the object in Stellarium Web.",
      rule: "source is the Stellarium query; fov is a numeric field of view in degrees; frameNote is an explanatory note.",
    },
    fr: {
      description:
        "Informations utilisées pour ouvrir l’objet dans Stellarium Web.",
      rule: "source est la requête Stellarium ; fov est un champ numérique en degrés ; frameNote est une note explicative.",
    },
    ja: {
      description: "Stellarium Web で天体を開くための情報です。",
      rule: "source は Stellarium の検索語、fov は度で表す数値の視野、frameNote は説明メモです。",
    },
    de: {
      description: "Angaben zum Öffnen des Objekts in Stellarium Web.",
      rule: "source ist die Stellarium-Abfrage; fov ist ein numerisches Bildfeld in Grad; frameNote ist ein erläuternder Hinweis.",
    },
    es: {
      description: "Información usada para abrir el objeto en Stellarium Web.",
      rule: "source es la consulta de Stellarium; fov es un campo numérico en grados; frameNote es una nota explicativa.",
    },
    it: {
      description: "Informazioni usate per aprire l’oggetto in Stellarium Web.",
      rule: "source è la richiesta Stellarium; fov è un campo numerico in gradi; frameNote è una nota esplicativa.",
    },
    "pt-BR": {
      description: "Informações usadas para abrir o objeto no Stellarium Web.",
      rule: "source é a consulta do Stellarium; fov é um campo numérico em graus; frameNote é uma nota explicativa.",
    },
    "zh-Hans": {
      description: "用于在 Stellarium Web 中打开该天体的信息。",
      rule: "source 为 Stellarium 查询词；fov 为以度表示的数值型视场；frameNote 为说明备注。",
    },
    "zh-Hant": {
      description: "用於在 Stellarium Web 中開啟該天體的資訊。",
      rule: "source 為 Stellarium 查詢詞；fov 為以度表示的數值型視野；frameNote 為說明備註。",
    },
    ru: {
      description: "Сведения для открытия объекта в Stellarium Web.",
      rule: "source — запрос для Stellarium; fov — числовое поле зрения в градусах; frameNote — поясняющая заметка.",
    },
  },
  skyMap: {
    en: {
      description: "Optional contextual sky map associated with the capture.",
      rule: "fileName must name an available sky-map file. label is displayed to visitors.",
    },
    fr: {
      description:
        "Carte de ciel contextuelle facultative associée à la capture.",
      rule: "fileName doit désigner un fichier de carte disponible. label est affiché aux visiteurs.",
    },
    ja: {
      description: "この撮影に関連する任意のコンテキスト星図です。",
      rule: "fileName は利用可能な星図ファイル名、label は訪問者に表示する名称です。",
    },
    de: {
      description:
        "Optionale Kontext-Sternkarte, die der Aufnahme zugeordnet ist.",
      rule: "fileName muss eine verfügbare Kartendatei bezeichnen. label wird den Besuchern angezeigt.",
    },
    es: {
      description: "Mapa del cielo contextual opcional asociado a la captura.",
      rule: "fileName debe designar un archivo de mapa disponible. label se muestra a los visitantes.",
    },
    it: {
      description:
        "Mappa del cielo contestuale facoltativa associata alla ripresa.",
      rule: "fileName deve indicare un file di mappa disponibile. label viene mostrato ai visitatori.",
    },
    "pt-BR": {
      description: "Mapa celeste contextual opcional associado à captura.",
      rule: "fileName deve designar um arquivo de mapa disponível. label é exibido aos visitantes.",
    },
    "zh-Hans": {
      description: "与该拍摄关联的可选情境星图。",
      rule: "fileName 必须指向一个可用的星图文件。label 会向访客显示。",
    },
    "zh-Hant": {
      description: "與該拍攝關聯的選用情境星圖。",
      rule: "fileName 必須指向一個可用的星圖檔案。label 會向訪客顯示。",
    },
    ru: {
      description:
        "Необязательная контекстная карта неба, связанная со съёмкой.",
      rule: "fileName должно указывать на существующий файл карты неба. Значение label показывается посетителям.",
    },
  },
  plateSolveHints: {
    en: {
      description: "Optional hints for plate solving an image.",
      rule: "ra, dec and radius are in degrees. scaleLow and scaleHigh are arcsec per pixel.",
    },
    fr: {
      description:
        "Repères facultatifs pour résoudre astrométriquement une image.",
      rule: "ra, dec et radius sont en degrés. scaleLow et scaleHigh sont en secondes d’arc par pixel.",
    },
    ja: {
      description: "画像のプレートソルブ用の任意の手がかりです。",
      rule: "ra、dec、radius は度です。scaleLow と scaleHigh は1ピクセル当たりの秒角です。",
    },
    de: {
      description:
        "Optionale Hinweise zur astrometrischen Lösung eines Bildes.",
      rule: "ra, dec und radius sind in Grad. scaleLow und scaleHigh sind in Bogensekunden pro Pixel.",
    },
    es: {
      description:
        "Referencias opcionales para resolver astrométricamente una imagen.",
      rule: "ra, dec y radius están en grados. scaleLow y scaleHigh están en segundos de arco por píxel.",
    },
    it: {
      description:
        "Riferimenti facoltativi per risolvere astrometricamente un’immagine.",
      rule: "ra, dec e radius sono in gradi. scaleLow e scaleHigh sono in secondi d’arco per pixel.",
    },
    "pt-BR": {
      description:
        "Dicas opcionais para resolver uma imagem por plate solving.",
      rule: "ra, dec e radius são em graus. scaleLow e scaleHigh são em segundos de arco por pixel.",
    },
    "zh-Hans": {
      description: "为图像进行星图解算的可选提示。",
      rule: "ra、dec 和 radius 以度为单位。scaleLow 和 scaleHigh 为每像素的角秒数。",
    },
    "zh-Hant": {
      description: "為影像進行星場解析的選用提示。",
      rule: "ra、dec 和 radius 以度為單位。scaleLow 和 scaleHigh 為每像素的角秒數。",
    },
    ru: {
      description: "Необязательные подсказки для плейт-солвинга снимка.",
      rule: "ra, dec и radius задаются в градусах. scaleLow и scaleHigh — угловые секунды на пиксель.",
    },
  },
  additional: {
    en: {
      description:
        "Every remaining top-level JSON property that is not represented by the standard form.",
      rule: "This preserves rules, dates, links and compatibility fields. The localized title remains managed in Identification above.",
    },
    fr: {
      description:
        "Toutes les propriétés JSON de premier niveau qui ne sont pas représentées par le formulaire standard.",
      rule: "Cette section conserve les règles, dates, liens et champs de compatibilité. Le titre localisé reste géré dans Identification, plus haut.",
    },
    ja: {
      description:
        "標準フォームにない、残りすべての最上位 JSON プロパティです。",
      rule: "ルール、日付、リンク、互換性用の項目をここで保持します。ローカライズされたタイトルは上の基本情報で管理します。",
    },
    de: {
      description:
        "Alle JSON-Eigenschaften der obersten Ebene, die das Standardformular nicht abbildet.",
      rule: "Dieser Abschnitt bewahrt Regeln, Daten, Links und Kompatibilitätsfelder. Der lokalisierte Titel wird weiterhin oben unter Kennzeichnung verwaltet.",
    },
    es: {
      description:
        "Todas las propiedades JSON de primer nivel que no están representadas en el formulario estándar.",
      rule: "Esta sección conserva las reglas, fechas, enlaces y campos de compatibilidad. El título localizado se sigue gestionando en Identificación, más arriba.",
    },
    it: {
      description:
        "Tutte le proprietà JSON di primo livello non rappresentate dal modulo standard.",
      rule: "Questa sezione conserva le regole, le date, i link e i campi di compatibilità. Il titolo localizzato resta gestito in Identificazione, più in alto.",
    },
    "pt-BR": {
      description:
        "Todas as propriedades JSON de primeiro nível que não são representadas pelo formulário padrão.",
      rule: "Esta seção mantém as regras, datas, links e campos de compatibilidade. O título localizado continua sendo gerenciado em Identificação, mais acima.",
    },
    "zh-Hans": {
      description: "标准表单未涵盖的其余所有顶层 JSON 属性。",
      rule: "此处保留规则、日期、链接和兼容性字段。本地化标题仍在上方的“基本信息”中管理。",
    },
    "zh-Hant": {
      description: "標準表單未涵蓋的其餘所有頂層 JSON 屬性。",
      rule: "此處保留規則、日期、連結與相容性欄位。在地化標題仍在上方的「基本資訊」中管理。",
    },
    ru: {
      description:
        "Все остальные свойства JSON верхнего уровня, которых нет в стандартной форме.",
      rule: "Здесь сохраняются правила, даты, ссылки и поля совместимости. Локализованный заголовок по-прежнему редактируется выше, в разделе «Идентификация».",
    },
  },
};

const lines = (value) =>
  String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
const paragraphs = (value) =>
  String(value || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
const textForParagraphs = (value) => (value || []).join("\n\n");
const previewObject = (value, fallback = {}) => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
};
const previewArray = (value, fallback = []) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const previewAssetsFor = (assets, assetMetadata, progressions) => {
  const metadata = new Map(
    [...assetMetadata, ...progressions]
      .filter((item) => item?.baseName)
      .map((item) => [item.baseName, item]),
  );
  return assets.map((asset) => {
    const declared = metadata.get(asset.baseName) || {};
    const lower = `${asset.folder || ""}/${asset.baseName || ""}`.toLowerCase();
    const sourceRender =
      declared.sourceRender ||
      (lower.includes("natural") || lower.includes("naturel")
        ? "naturel"
        : lower.includes("vespera")
          ? "Vespera"
          : "principal");
    const presentation =
      declared.isPresentationContrast ||
      (asset.folder || "").split("/").includes("presentation") ||
      lower.includes("presentationcontrast");
    const kind =
      declared.kind ||
      ((asset.folder || "").split("/").includes("progression")
        ? "progression"
        : presentation
          ? "presentation"
          : "reference");
    return {
      ...asset,
      ...declared,
      assetId: asset.baseName,
      assetLabel: declared.assetLabel || asset.baseName,
      variant: declared.variant || asset.baseName,
      kind,
      sourceRender,
      renderFamily:
        declared.renderFamily ||
        (sourceRender === "naturel"
          ? "Rendu naturel"
          : sourceRender === "Vespera"
            ? "Rendu Vespera"
            : null),
      colorCurve:
        declared.colorCurve || (presentation ? "de présentation" : "brute"),
    };
  });
};
const referencePreviewBaseName = (assets, draft) =>
  draft.referenceBaseName ||
  assets.find(
    (asset) => asset.kind === "reference" && asset.sourceRender === "naturel",
  )?.baseName ||
  assets.find((asset) => asset.kind === "reference")?.baseName ||
  assets[0]?.baseName ||
  "";
const galleryPreviewBaseName = (assets, draft) =>
  draft.featuredBaseName || referencePreviewBaseName(assets, draft);
const matchesAutomaticRule = (asset, rules) => {
  const path = `${asset.folder ? `${asset.folder}/` : ""}${asset.baseName}`;
  return (rules || []).some((rule) => {
    try {
      return new RegExp(rule, "i").test(path);
    } catch {
      return false;
    }
  });
};
const csrfToken = () => csrfCookieValue();

function AdminHelpTooltip({ id, label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`admin-help-tooltip-wrap${open ? " is-open" : ""}`}>
      <button
        className="admin-help-tooltip-button"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      <span className="admin-help-tooltip" id={id} role="tooltip">
        {children}
      </span>
    </span>
  );
}

function JsonArea({ label, value, onChange, rows = 6 }) {
  return (
    <label className="admin-field admin-field-wide">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck="false"
      />
    </label>
  );
}

const readableJsonKey = (key) =>
  String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());

const blankJsonValue = (value) => {
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, blankJsonValue(child)]),
    );
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  return "";
};

const newJsonValue = (kind) => {
  if (kind === "number") return 0;
  if (kind === "boolean") return false;
  if (kind === "object") return {};
  if (kind === "array") return [];
  return "";
};

// Russian counts: 1 (21, 31…) takes the singular, 2–4 (22–24…) the paucal,
// the rest (0, 5–20, 25–30…) the genitive plural.
const russianPlural = (count, one, few, many) => {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
};

// A count followed by its noun: a string entry reads "{count} {noun}", a
// function entry (Russian) inflects the noun itself.
const countLabel = (entry, count) =>
  typeof entry === "function" ? entry(count) : `${count} ${entry}`;

const jsonEditorCopy = {
  fr: {
    add: "Ajouter",
    addField: "Ajouter un champ",
    addItem: "Ajouter un élément",
    fieldName: "Nom du champ",
    text: "Texte",
    number: "Nombre",
    boolean: "Oui / non",
    object: "Groupe",
    array: "Liste",
    fields: "champs",
    items: "éléments",
    removeField: "Retirer ce champ",
    removeItem: "Retirer cet élément",
    duplicate: "Ce nom de champ existe déjà.",
  },
  en: {
    add: "Add",
    addField: "Add field",
    addItem: "Add item",
    fieldName: "Field name",
    text: "Text",
    number: "Number",
    boolean: "Yes / no",
    object: "Group",
    array: "List",
    fields: "fields",
    items: "items",
    removeField: "Remove this field",
    removeItem: "Remove this item",
    duplicate: "This field name already exists.",
  },
  ja: {
    add: "追加",
    addField: "項目を追加",
    addItem: "要素を追加",
    fieldName: "項目名",
    text: "テキスト",
    number: "数値",
    boolean: "はい / いいえ",
    object: "グループ",
    array: "リスト",
    fields: "項目",
    items: "要素",
    removeField: "この項目を削除",
    removeItem: "この要素を削除",
    duplicate: "この項目名はすでにあります。",
  },
  de: {
    add: "Hinzufügen",
    addField: "Feld hinzufügen",
    addItem: "Element hinzufügen",
    fieldName: "Feldname",
    text: "Text",
    number: "Zahl",
    boolean: "Ja / Nein",
    object: "Gruppe",
    array: "Liste",
    fields: "Felder",
    items: "Elemente",
    removeField: "Dieses Feld entfernen",
    removeItem: "Dieses Element entfernen",
    duplicate: "Dieser Feldname existiert bereits.",
  },
  es: {
    add: "Agregar",
    addField: "Agregar un campo",
    addItem: "Agregar un elemento",
    fieldName: "Nombre del campo",
    text: "Texto",
    number: "Número",
    boolean: "Sí / no",
    object: "Grupo",
    array: "Lista",
    fields: "campos",
    items: "elementos",
    removeField: "Quitar este campo",
    removeItem: "Quitar este elemento",
    duplicate: "Este nombre de campo ya existe.",
  },
  it: {
    add: "Aggiungere",
    addField: "Aggiungere un campo",
    addItem: "Aggiungere un elemento",
    fieldName: "Nome del campo",
    text: "Testo",
    number: "Numero",
    boolean: "Sì / no",
    object: "Gruppo",
    array: "Elenco",
    fields: "campi",
    items: "elementi",
    removeField: "Rimuovere questo campo",
    removeItem: "Rimuovere questo elemento",
    duplicate: "Questo nome di campo esiste già.",
  },
  "pt-BR": {
    add: "Adicionar",
    addField: "Adicionar um campo",
    addItem: "Adicionar um item",
    fieldName: "Nome do campo",
    text: "Texto",
    number: "Número",
    boolean: "Sim / não",
    object: "Grupo",
    array: "Lista",
    fields: "campos",
    items: "itens",
    removeField: "Remover este campo",
    removeItem: "Remover este item",
    duplicate: "Este nome de campo já existe.",
  },
  "zh-Hans": {
    add: "添加",
    addField: "添加字段",
    addItem: "添加元素",
    fieldName: "字段名",
    text: "文本",
    number: "数字",
    boolean: "是 / 否",
    object: "分组",
    array: "列表",
    fields: "个字段",
    items: "个元素",
    removeField: "移除此字段",
    removeItem: "移除此元素",
    duplicate: "此字段名已存在。",
  },
  "zh-Hant": {
    add: "新增",
    addField: "新增欄位",
    addItem: "新增元素",
    fieldName: "欄位名稱",
    text: "文字",
    number: "數字",
    boolean: "是 / 否",
    object: "群組",
    array: "清單",
    fields: "個欄位",
    items: "個元素",
    removeField: "移除此欄位",
    removeItem: "移除此元素",
    duplicate: "此欄位名稱已存在。",
  },
  ru: {
    add: "Добавить",
    addField: "Добавить поле",
    addItem: "Добавить элемент",
    fieldName: "Имя поля",
    text: "Текст",
    number: "Число",
    boolean: "Да / нет",
    object: "Группа",
    array: "Список",
    fields: (count) =>
      `${count} ${russianPlural(count, "поле", "поля", "полей")}`,
    items: (count) =>
      `${count} ${russianPlural(count, "элемент", "элемента", "элементов")}`,
    removeField: "Удалить это поле",
    removeItem: "Удалить этот элемент",
    duplicate: "Поле с таким именем уже есть.",
  },
};

// The administration's own sentences outside the inline `t` calls: the invalid JSON notice, the live preview's name and the archive confirmation of a capture.
const adminDialogCopy = {
  fr: {
    invalid:
      "Le contenu est invalide : corrigez-le dans l’édition JSON complète.",
    livePreview: "Aperçu en direct",
    archiveTitle: "Supprimer cette capture ?",
    archiveMessage:
      "« {title} » sera retirée du catalogue et archivée pendant 30 jours.",
    archiveConfirm: "Archiver la capture",
  },
  en: {
    invalid: "The content is invalid: fix it in the full JSON editor.",
    livePreview: "Live preview",
    archiveTitle: "Delete this capture?",
    archiveMessage:
      "“{title}” will be removed from the catalogue and archived for 30 days.",
    archiveConfirm: "Archive the capture",
  },
  ja: {
    invalid: "内容が正しくありません。JSON 全体の編集画面で修正してください。",
    livePreview: "ライブプレビュー",
    archiveTitle: "この撮影を削除しますか？",
    archiveMessage:
      "「{title}」はカタログから外され、30日間アーカイブされます。",
    archiveConfirm: "撮影をアーカイブ",
  },
  de: {
    invalid:
      "Der Inhalt ist ungültig: Korrigiere ihn in der vollständigen JSON-Bearbeitung.",
    livePreview: "Live-Vorschau",
    archiveTitle: "Diese Aufnahme löschen?",
    archiveMessage:
      "„{title}“ wird aus dem Katalog entfernt und 30 Tage lang archiviert.",
    archiveConfirm: "Aufnahme archivieren",
  },
  es: {
    invalid:
      "El contenido no es válido: corríjalo en la edición JSON completa.",
    livePreview: "Vista previa en directo",
    archiveTitle: "¿Eliminar esta captura?",
    archiveMessage:
      "«{title}» se retirará del catálogo y se archivará durante 30 días.",
    archiveConfirm: "Archivar la captura",
  },
  it: {
    invalid:
      "Il contenuto non è valido: correggilo nella modifica JSON completa.",
    livePreview: "Anteprima in tempo reale",
    archiveTitle: "Eliminare questa ripresa?",
    archiveMessage:
      "«{title}» sarà rimossa dal catalogo e archiviata per 30 giorni.",
    archiveConfirm: "Archiviare la ripresa",
  },
  "pt-BR": {
    invalid: "O conteúdo é inválido: corrija-o na edição JSON completa.",
    livePreview: "Pré-visualização ao vivo",
    archiveTitle: "Excluir esta captura?",
    archiveMessage:
      "“{title}” será removida do catálogo e arquivada por 30 dias.",
    archiveConfirm: "Arquivar a captura",
  },
  "zh-Hans": {
    invalid: "内容无效：请在完整 JSON 编辑中修正。",
    livePreview: "实时预览",
    archiveTitle: "删除此拍摄？",
    archiveMessage: "“{title}”将从目录中移除，并归档 30 天。",
    archiveConfirm: "归档拍摄",
  },
  "zh-Hant": {
    invalid: "內容無效：請在完整 JSON 編輯中修正。",
    livePreview: "即時預覽",
    archiveTitle: "刪除此拍攝？",
    archiveMessage: "「{title}」將從目錄中移除，並封存 30 天。",
    archiveConfirm: "封存拍攝",
  },
  ru: {
    invalid: "Содержимое недопустимо: исправьте его в полном JSON-редакторе.",
    livePreview: "Предпросмотр в реальном времени",
    archiveTitle: "Удалить эту съёмку?",
    archiveMessage:
      "«{title}» будет удалена из каталога и архивирована на 30 дней.",
    archiveConfirm: "Архивировать съёмку",
  },
};

function JsonKindSelect({ value, onChange, text }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="text">{text.text}</option>
      <option value="number">{text.number}</option>
      <option value="boolean">{text.boolean}</option>
      <option value="object">{text.object}</option>
      <option value="array">{text.array}</option>
    </select>
  );
}

function JsonObjectEditor({ value, onChange, compact, text }) {
  const [open, setOpen] = useState(true);
  const [fieldName, setFieldName] = useState("");
  const [fieldKind, setFieldKind] = useState("text");
  const [error, setError] = useState("");
  const entries = Object.entries(value);
  const addField = () => {
    const key = fieldName.trim();
    if (!key || Object.hasOwn(value, key)) {
      setError(key ? text.duplicate : "");
      return;
    }
    onChange({ ...value, [key]: newJsonValue(fieldKind) });
    setFieldName("");
    setError("");
  };
  return (
    <details className="admin-json-node admin-json-object" open={open}>
      <summary onClick={() => setOpen((current) => !current)}>
        <span>{countLabel(text.fields, entries.length)}</span>
      </summary>
      <div className="admin-json-node-content">
        {entries.map(([key, child]) => (
          <div className="admin-json-property" key={key}>
            <div className="admin-json-property-heading">
              <span>{readableJsonKey(key)}</span>
              <button
                type="button"
                className="admin-json-remove"
                aria-label={`${text.removeField}: ${key}`}
                title={text.removeField}
                onClick={() => {
                  const next = { ...value };
                  delete next[key];
                  onChange(next);
                }}
              >
                −
              </button>
            </div>
            <JsonValueEditor
              compact
              value={child}
              text={text}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          </div>
        ))}
        <div className="admin-json-add-field">
          <input
            aria-label={text.fieldName}
            placeholder={text.fieldName}
            value={fieldName}
            onChange={(event) => {
              setFieldName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addField();
              }
            }}
          />
          <JsonKindSelect
            value={fieldKind}
            onChange={setFieldKind}
            text={text}
          />
          <button
            type="button"
            className="btn-tertiary admin-json-add"
            onClick={addField}
          >
            + {text.addField}
          </button>
        </div>
        {error && <p className="admin-json-inline-error">{error}</p>}
      </div>
    </details>
  );
}

function JsonArrayEditor({ value, onChange, compact, text }) {
  const [kind, setKind] = useState("text");
  const [open, setOpen] = useState(true);
  const addItem = () =>
    onChange([
      ...value,
      value.length ? blankJsonValue(value[0]) : newJsonValue(kind),
    ]);
  return (
    <details className="admin-json-node admin-json-array" open={open}>
      <summary onClick={() => setOpen((current) => !current)}>
        <span>{countLabel(text.items, value.length)}</span>
      </summary>
      <div className="admin-json-node-content">
        {value.map((item, index) => (
          <div className="admin-json-array-item" key={index}>
            <JsonValueEditor
              compact
              value={item}
              text={text}
              onChange={(next) =>
                onChange(
                  value.map((current, position) =>
                    position === index ? next : current,
                  ),
                )
              }
            />
            <button
              type="button"
              className="admin-json-remove"
              aria-label={text.removeItem}
              title={text.removeItem}
              onClick={() =>
                onChange(value.filter((_, position) => position !== index))
              }
            >
              −
            </button>
          </div>
        ))}
        <div className="admin-json-add-item">
          {!value.length && (
            <JsonKindSelect value={kind} onChange={setKind} text={text} />
          )}
          <button
            type="button"
            className="btn-tertiary admin-json-add"
            onClick={addItem}
          >
            + {text.addItem}
          </button>
        </div>
      </div>
    </details>
  );
}

function JsonValueEditor({ value, onChange, compact = false, text }) {
  if (Array.isArray(value))
    return (
      <JsonArrayEditor
        value={value}
        onChange={onChange}
        compact={compact}
        text={text}
      />
    );
  if (value && typeof value === "object")
    return (
      <JsonObjectEditor
        value={value}
        onChange={onChange}
        compact={compact}
        text={text}
      />
    );
  if (typeof value === "boolean")
    return (
      <input
        className="admin-json-boolean"
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  const number = typeof value === "number";
  const multiline = !compact && String(value ?? "").length > 100;
  const inputProps = {
    value: value ?? "",
    onChange: (event) =>
      onChange(number ? Number(event.target.value || 0) : event.target.value),
  };
  return multiline ? (
    <textarea rows={3} {...inputProps} />
  ) : (
    <input
      type={number ? "number" : "text"}
      step={number ? "any" : undefined}
      {...inputProps}
    />
  );
}

function StructuredJsonEditor({ label, value, onChange, locale, sectionKey }) {
  const text = copyFor(jsonEditorCopy, locale, "AdminPage.jsonEditorCopy");
  const section = structuredMetadataSectionCopy[sectionKey]
    ? copyFor(
        structuredMetadataSectionCopy[sectionKey],
        locale,
        "AdminPage.structuredMetadataSectionCopy",
      )
    : undefined;
  let parsed;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    return (
      <p className="admin-json-error">
        {copyFor(adminDialogCopy, locale, "AdminPage.adminDialogCopy").invalid}
      </p>
    );
  }
  return (
    <section className="admin-structured-json-editor">
      <header className="admin-structured-json-editor-header">
        <h3>{label}</h3>
        {section && (
          <>
            <p>{section.description}</p>
            <p className="admin-structured-json-rule">{section.rule}</p>
          </>
        )}
      </header>
      <JsonValueEditor
        value={parsed}
        text={text}
        onChange={(next) => onChange(JSON.stringify(next, null, 2))}
      />
    </section>
  );
}

const equipmentSummary = (item) => {
  const specs = item.specifications || {};
  return [
    specs.apertureMm && `${specs.apertureMm} mm`,
    specs.focalLengthMm && `${specs.focalLengthMm} mm`,
    specs.sensorWidthMm &&
      `${specs.sensorWidthMm} × ${specs.sensorHeightMm || "?"} mm`,
    specs.apparentFieldDegrees && `${specs.apparentFieldDegrees}°`,
    specs.bandpass,
  ]
    .filter(Boolean)
    .join(" · ");
};

function AdminLivePreview({
  draft,
  assets,
  selectedBaseName,
  onSelectAsset,
  acquisition,
  processing,
  captureEquipment,
  locale,
  t,
}) {
  const galleryBaseName = galleryPreviewBaseName(assets, draft);
  const referenceBaseName = referencePreviewBaseName(assets, draft);
  const preferredBaseName = selectedBaseName || galleryBaseName;
  const asset =
    assets.find((item) => item.baseName === preferredBaseName) || assets[0];
  const fileName = (item) =>
    (item.png || item.tiff || item.baseName || "").split("/").at(-1);
  const target = {
    ...draft,
    title:
      draft.title ||
      t({
        fr: "Nouvelle capture",
        ja: "新しい撮影",
        en: "New capture",
        de: "Neue Aufnahme",
        es: "Nueva captura",
        it: "Nuova ripresa",
        "pt-BR": "Nova captura",
        "zh-Hans": "新建拍摄",
        "zh-Hant": "新增拍攝",
        ru: "Новая съёмка",
      }),
    acquisition,
    processing,
    equipment: captureEquipment,
  };

  return (
    <aside
      className="admin-live-preview"
      aria-label={
        copyFor(adminDialogCopy, locale, "AdminPage.adminDialogCopy")
          .livePreview
      }
    >
      <p className="eyebrow">
        {t({
          fr: "APERÇU RAPIDE",
          ja: "クイックプレビュー",
          en: "QUICK PREVIEW",
          de: "SCHNELLVORSCHAU",
          es: "VISTA PREVIA RÁPIDA",
          it: "ANTEPRIMA RAPIDA",
          "pt-BR": "PRÉVIA RÁPIDA",
          "zh-Hans": "快速预览",
          "zh-Hant": "快速預覽",
          ru: "БЫСТРЫЙ ПРОСМОТР",
        })}
      </p>
      <div className="admin-live-preview-gallery">
        <div className="admin-live-preview-image">
          {asset?.imageUrl ? (
            <img src={asset.imageUrl} alt="" />
          ) : (
            <span>
              {t({
                fr: "Choisissez une image",
                ja: "画像を選択",
                en: "Choose an image",
                de: "Wähle ein Bild",
                es: "Elija una imagen",
                it: "Scegliere un’immagine",
                "pt-BR": "Escolha uma imagem",
                "zh-Hans": "选择图像",
                "zh-Hant": "選擇影像",
                ru: "Выберите изображение",
              })}
            </span>
          )}
        </div>
        {assets.length > 1 && (
          <div
            className="admin-live-preview-pagination"
            aria-label={t({
              fr: "Versions de l’image",
              ja: "画像バージョン",
              en: "Image versions",
              de: "Bildversionen",
              es: "Versiones de la imagen",
              it: "Versioni dell’immagine",
              "pt-BR": "Versões da imagem",
              "zh-Hans": "图像版本",
              "zh-Hant": "影像版本",
              ru: "Версии изображения",
            })}
          >
            {assets.map((item) => {
              const featured = item.baseName === galleryBaseName;
              const reference = item.baseName === referenceBaseName;
              const roles = [
                ...(featured
                  ? [
                      t({
                        fr: "présentée dans la galerie",
                        ja: "ギャラリーに表示",
                        en: "featured in the gallery",
                        de: "in der Galerie hervorgehoben",
                        es: "mostrada en la galería",
                        it: "in evidenza nella galleria",
                        "pt-BR": "em destaque na galeria",
                        "zh-Hans": "在图库中展示",
                        "zh-Hant": "於圖庫中呈現",
                        ru: "показано в галерее",
                      }),
                    ]
                  : []),
                ...(reference
                  ? [
                      t({
                        fr: "image de référence",
                        ja: "基準画像",
                        en: "reference image",
                        de: "Referenzbild",
                        es: "imagen de referencia",
                        it: "immagine di riferimento",
                        "pt-BR": "imagem de referência",
                        "zh-Hans": "参考图像",
                        "zh-Hant": "參考影像",
                        ru: "эталонное изображение",
                      }),
                    ]
                  : []),
              ];
              const name = [fileName(item), ...roles].join(" — ");
              return (
                <button
                  type="button"
                  className={`${item.baseName === asset?.baseName ? "is-active" : ""}${featured ? " is-featured" : ""}${reference ? " is-reference" : ""}`}
                  key={`${item.folder}/${item.baseName}`}
                  onClick={() => onSelectAsset(item.baseName)}
                  title={name}
                  aria-label={name}
                />
              );
            })}
          </div>
        )}
      </div>
      <div className="admin-live-preview-panel">
        <h2>{target.title}</h2>
        <p className="subtitle">
          {asset?.kind === "sky-map"
            ? "Stellarium"
            : [asset?.variant, asset?.integration, asset?.progressionFilter]
                .filter(Boolean)
                .join(" · ") ||
              draft.category ||
              t({
                fr: "Catégorie à préciser",
                ja: "カテゴリー未設定",
                en: "Category not set",
                de: "Kategorie festlegen",
                es: "Categoría por precisar",
                it: "Categoria da precisare",
                "pt-BR": "Categoria a definir",
                "zh-Hans": "未设置类别",
                "zh-Hant": "尚未設定類別",
                ru: "Категория не задана",
              })}
        </p>
        <AssetVariantSelect
          asset={asset}
          assets={assets}
          onSelect={onSelectAsset}
          locale={locale}
          id="admin-variant-select"
          className="admin-live-preview-render"
        />
        {asset && (
          <DetailMetadataSections
            target={target}
            asset={asset}
            locale={locale}
          />
        )}
      </div>
    </aside>
  );
}

export function AdminPage({
  locale = "fr",
  supportedLocales = shippedLocales(),
  defaultLocale = "fr",
  localeNames = {},
  translationOverrides = {},
  customTranslationKeys = [],
  // The editor of the operator's file gallery, on a server whose home
  // gallery is that file gallery (`ASTRO_PORTAL_GALLERY_SOURCE=files`)
  // and nowhere else.
  fileGallery = false,
  route,
}) {
  const router = useRouter();
  // Inline copy keyed by locale (`t({ fr, ja, "zh-Hans", … })`), read through
  // the registry's one named fallback like every other table; English
  // defaults to the French text when a call gives none.
  const t = (entries) =>
    copyFor({ en: entries.fr, ...entries }, locale, "AdminPage.t");
  const archiveText = copyFor(
    adminDialogCopy,
    locale,
    "AdminPage.adminDialogCopy",
  );
  const jsonLabel = (key) =>
    ({
      acquisition: t({
        fr: "Acquisition",
        ja: "撮影",
        en: "Acquisition",
        de: "Aufnahmedaten",
        es: "Adquisición",
        it: "Acquisizione",
        "pt-BR": "Aquisição",
        "zh-Hans": "拍摄",
        "zh-Hant": "拍攝",
        ru: "Съёмка",
      }),
      processing: t({
        fr: "Traitement",
        ja: "処理",
        en: "Processing",
        de: "Bearbeitung",
        es: "Procesado",
        it: "Elaborazione",
        "pt-BR": "Processamento",
        "zh-Hans": "处理",
        "zh-Hant": "處理",
        ru: "Обработка",
      }),
      integrations: t({
        fr: "Intégrations",
        ja: "統合",
        en: "Integrations",
        de: "Integrationen",
        es: "Integraciones",
        it: "Integrazioni",
        "pt-BR": "Integrações",
        "zh-Hans": "积分",
        "zh-Hant": "總曝光時間",
        ru: "Накопление",
      }),
      assetMetadata: t({
        fr: "Métadonnées des fichiers",
        ja: "ファイルメタデータ",
        en: "Image metadata",
        de: "Dateimetadaten",
        es: "Metadatos de los archivos",
        it: "Metadati dei file",
        "pt-BR": "Metadados dos arquivos",
        "zh-Hans": "文件元数据",
        "zh-Hant": "檔案中繼資料",
        ru: "Метаданные файлов",
      }),
      progressions: t({
        fr: "Progressions",
        ja: "進行状況",
        en: "Progression",
        de: "Verläufe",
        es: "Progresiones",
        it: "Progressioni",
        "pt-BR": "Progressões",
        "zh-Hans": "进度",
        "zh-Hant": "進度",
        ru: "Ход работы",
      }),
      stellarium: "Stellarium",
      skyMap: t({
        fr: "Carte du ciel",
        ja: "星図",
        en: "Sky map",
        de: "Sternkarte",
        es: "Mapa del cielo",
        it: "Mappa del cielo",
        "pt-BR": "Mapa celeste",
        "zh-Hans": "星图",
        "zh-Hant": "星圖",
        ru: "Карта неба",
      }),
      plateSolveHints: t({
        fr: "Repères de résolution",
        ja: "プレートソルブのヒント",
        en: "Plate-solving hints",
        de: "Hinweise zum Plate Solving",
        es: "Referencias de resolución astrométrica",
        it: "Riferimenti di risoluzione",
        "pt-BR": "Referências de plate solving",
        "zh-Hans": "星图解算提示",
        "zh-Hant": "星場解析提示",
        ru: "Подсказки плейт-солвинга",
      }),
      additional: t({
        fr: "Métadonnées complémentaires",
        ja: "追加メタデータ",
        en: "Additional metadata",
        de: "Zusätzliche Metadaten",
        es: "Metadatos complementarios",
        it: "Metadati complementari",
        "pt-BR": "Metadados complementares",
        "zh-Hans": "附加元数据",
        "zh-Hant": "附加中繼資料",
        ru: "Дополнительные метаданные",
      }),
    })[key] || key;
  const [records, setRecords] = useState([]);
  const [assets, setAssets] = useState([]);
  const [archives, setArchives] = useState([]);
  const [draft, setDraft] = useState(emptyRecord);
  const [originalId, setOriginalId] = useState(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetBrowserOpen, setAssetBrowserOpen] = useState(false);
  const [jsonFields, setJsonFields] = useState({});
  const [additionalMetadataKeys, setAdditionalMetadataKeys] = useState([]);
  const [rawJson, setRawJson] = useState("");
  const [message, setMessage] = useState(
    t({
      fr: "Chargement…",
      ja: "読み込み中…",
      en: "Loading…",
      de: "Wird geladen …",
      es: "Cargando…",
      it: "Caricamento…",
      "pt-BR": "Carregando…",
      "zh-Hans": "正在加载…",
      "zh-Hant": "正在載入……",
      ru: "Загрузка…",
    }),
  );
  const [activeLocales, setActiveLocales] = useState(supportedLocales);
  const [activeDefaultLocale, setActiveDefaultLocale] = useState(defaultLocale);
  const [equipment, setEquipment] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [showCaptureArchives, setShowCaptureArchives] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [previewAssetBaseName, setPreviewAssetBaseName] = useState("");
  const tab = route.section;
  const captureView = tab === "captures" && route.itemId ? "editor" : "list";
  const navigate = (next, { replace = false } = {}) => {
    router[replace ? "replace" : "push"](adminPathname(locale, next));
  };

  const selectRecord = (record, sourceId = record?.id || null) => {
    const next = normalizeAdminRecord(record);
    const additional = additionalAdminMetadata(next);
    setDraft(next);
    setOriginalId(sourceId);
    setJsonFields({
      acquisition: JSON.stringify(next.acquisition || {}, null, 2),
      processing: JSON.stringify(next.processing || {}, null, 2),
      integrations: JSON.stringify(next.integrations || [], null, 2),
      assetMetadata: JSON.stringify(next.assetMetadata || [], null, 2),
      progressions: JSON.stringify(next.progressions || [], null, 2),
      stellarium: JSON.stringify(next.stellarium || {}, null, 2),
      skyMap: JSON.stringify(next.skyMap || {}, null, 2),
      plateSolveHints: JSON.stringify(next.plateSolveHints || {}, null, 2),
      additional: JSON.stringify(additional, null, 2),
    });
    setAdditionalMetadataKeys(Object.keys(additional));
    setRawJson(JSON.stringify(next, null, 2));
    setAssetBrowserOpen(false);
    setAssetSearch("");
    setPreviewAssetBaseName("");
    setMessage("");
  };

  const reload = async (preferredId = null) => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error ||
          t({
            fr: "Chargement impossible.",
            ja: "読み込めません。",
            en: "Unable to load.",
            de: "Laden nicht möglich.",
            es: "No se pudo cargar.",
            it: "Impossibile caricare.",
            "pt-BR": "Não foi possível carregar.",
            "zh-Hans": "无法加载。",
            "zh-Hant": "無法載入。",
            ru: "Не удалось загрузить.",
          }),
      );
    setRecords(data.records || []);
    setAssets(data.assets || []);
    setArchives(data.archives || []);
    const requestedId =
      preferredId ||
      (route.section === "captures" && route.itemId !== "new"
        ? route.itemId
        : null);
    const selected =
      data.records.find((record) => record.id === requestedId) ||
      (route.itemId === "new" ? null : data.records[0]);
    selectRecord(selected || emptyRecord, selected?.id || null);
  };

  const reloadEquipment = async () => {
    const response = await fetch("/api/admin/equipment", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error ||
          t({
            fr: "Chargement du matériel impossible.",
            ja: "機材を読み込めません。",
            en: "Unable to load the equipment.",
            de: "Die Ausrüstung konnte nicht geladen werden.",
            es: "No se pudo cargar el equipo.",
            it: "Impossibile caricare l’attrezzatura.",
            "pt-BR": "Não foi possível carregar o equipamento.",
            "zh-Hans": "无法加载设备。",
            "zh-Hant": "無法載入器材。",
            ru: "Не удалось загрузить оборудование.",
          }),
      );
    setEquipment(data.equipment || []);
    setAssignments(data.assignments || {});
  };

  useEffect(() => {
    Promise.all([reload(), reloadEquipment()]).catch((error) =>
      setMessage(error.message),
    );
  }, []);

  useEffect(() => {
    if (route.section !== "captures" || !route.itemId) return;
    if (route.itemId === "new") {
      selectRecord(emptyRecord, null);
      return;
    }
    const selected = records.find((record) => record.id === route.itemId);
    if (selected) selectRecord(selected);
  }, [records, route.itemId, route.section]);

  const available = useMemo(
    () =>
      assets.filter((asset) =>
        `${asset.folder || ""}/${asset.baseName || ""}`
          .toLowerCase()
          .includes(assetSearch.toLowerCase()),
      ),
    [assets, assetSearch],
  );
  const selectedAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          (originalId && asset.ownerId === originalId) ||
          (draft.assetBaseNames || []).includes(asset.baseName),
      ),
    [assets, draft.assetBaseNames, originalId],
  );
  const automaticRules = draft.matchPatterns || [];
  const automaticallyLinkedAssets = useMemo(
    () =>
      selectedAssets.filter((asset) =>
        matchesAutomaticRule(asset, automaticRules),
      ),
    [automaticRules, selectedAssets],
  );
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const localizedTitle = (language) =>
    draft.content?.[language]?.title ||
    (language === activeDefaultLocale ? draft.title || "" : "");
  const updateLocalizedTitle = (language, value) =>
    setDraft((current) => ({
      ...current,
      title: language === activeDefaultLocale ? value : current.title,
      content: {
        ...(current.content || {}),
        [language]: { ...(current.content?.[language] || {}), title: value },
      },
    }));
  const updateSky = (key, value) =>
    setDraft((current) => ({
      ...current,
      skyTarget: { ...(current.skyTarget || {}), [key]: value },
    }));
  const toggleAsset = (baseName) =>
    update(
      "assetBaseNames",
      (draft.assetBaseNames || []).includes(baseName)
        ? draft.assetBaseNames.filter((name) => name !== baseName)
        : [...(draft.assetBaseNames || []), baseName],
    );
  const captureEquipmentAssignments = (assignments[originalId] || []).map(
    (assignment) =>
      typeof assignment === "string"
        ? { equipmentId: assignment, role: "main" }
        : assignment,
  );
  const captureEquipmentGroups = useMemo(() => {
    const active = equipment.filter((item) => !item.archivedAt);
    const groupsFor = (items) =>
      Object.entries(
        items.reduce(
          (groups, item) => ({
            ...groups,
            [item.type]: [...(groups[item.type] || []), item],
          }),
          {},
        ),
      );
    return {
      main: groupsFor(active.filter((item) => item.type !== "guide-scope")),
      guiding: groupsFor(
        active.filter((item) => ["guide-scope", "camera"].includes(item.type)),
      ),
    };
  }, [equipment]);
  const selectedCaptureEquipment = useMemo(
    () =>
      captureEquipmentAssignments
        .map((assignment) => ({
          ...assignment,
          equipment: equipment.find(
            (item) => item.id === assignment.equipmentId,
          ),
        }))
        .filter((assignment) => assignment.equipment),
    [captureEquipmentAssignments, equipment],
  );
  const toggleCaptureEquipment = (equipmentId, role) => {
    if (!originalId) return;
    setAssignments((current) => {
      const selected = (current[originalId] || []).map((assignment) =>
        typeof assignment === "string"
          ? { equipmentId: assignment, role: "main" }
          : assignment,
      );
      const existing = selected.find(
        (assignment) => assignment.equipmentId === equipmentId,
      );
      return {
        ...current,
        [originalId]:
          existing && captureEquipmentRole(existing.role) === role
            ? selected.filter(
                (assignment) => assignment.equipmentId !== equipmentId,
              )
            : [
                ...selected.filter(
                  (assignment) => assignment.equipmentId !== equipmentId,
                ),
                { equipmentId, role },
              ],
      };
    });
  };
  const saveCaptureEquipment = async () => {
    if (!originalId) return;
    setMessage(
      t({
        fr: "Association du matériel…",
        ja: "機材を関連付け中…",
        en: "Linking equipment…",
        de: "Ausrüstung wird zugeordnet …",
        es: "Asociando el equipo…",
        it: "Associazione dell’attrezzatura…",
        "pt-BR": "Associando o equipamento…",
        "zh-Hans": "正在关联设备…",
        "zh-Hant": "正在關聯器材……",
        ru: "Привязка оборудования…",
      }),
    );
    try {
      const response = await fetch("/api/admin/equipment", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({
          captureId: originalId,
          assignments: captureEquipmentAssignments,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            data.error ||
            t({
              fr: "Association impossible.",
              ja: "関連付けできません。",
              en: "Unable to link.",
              de: "Zuordnung nicht möglich.",
              es: "No se pudo asociar.",
              it: "Impossibile associare.",
              "pt-BR": "Não foi possível associar.",
              "zh-Hans": "无法关联。",
              "zh-Hant": "無法關聯。",
              ru: "Не удалось привязать.",
            }),
        );
      setAssignments((current) => ({
        ...current,
        [originalId]: data.assignments,
      }));
      setMessage(
        t({
          fr: "Matériel associé à cette capture.",
          ja: "この撮影記録に機材を関連付けました。",
          en: "Equipment linked to this capture.",
          de: "Ausrüstung dieser Aufnahme zugeordnet.",
          es: "Equipo asociado a esta captura.",
          it: "Attrezzatura associata a questa ripresa.",
          "pt-BR": "Equipamento associado a esta captura.",
          "zh-Hans": "设备已关联到此拍摄记录。",
          "zh-Hant": "器材已關聯至此拍攝記錄。",
          ru: "Оборудование привязано к этой съёмке.",
        }),
      );
    } catch (error) {
      setMessage(error.message);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setMessage(
      t({
        fr: "Validation…",
        ja: "検証中…",
        en: "Validating…",
        de: "Wird geprüft …",
        es: "Validando…",
        it: "Convalida…",
        "pt-BR": "Validando…",
        "zh-Hans": "正在验证…",
        "zh-Hant": "正在驗證……",
        ru: "Проверка…",
      }),
    );
    try {
      const parsed = Object.fromEntries(
        Object.entries(jsonFields).map(([key, value]) => [
          key,
          JSON.parse(
            value ||
              (["integrations", "assetMetadata", "progressions"].includes(key)
                ? "[]"
                : "{}"),
          ),
        ]),
      );
      const { additional = {}, ...structured } = parsed;
      if (
        !additional ||
        typeof additional !== "object" ||
        Array.isArray(additional)
      )
        throw new Error(
          t({
            fr: "Les métadonnées complémentaires doivent former un objet.",
            ja: "追加メタデータはオブジェクトである必要があります。",
            en: "Additional metadata must be an object.",
            de: "Die zusätzlichen Metadaten müssen ein Objekt bilden.",
            es: "Los metadatos complementarios deben formar un objeto.",
            it: "I metadati complementari devono formare un oggetto.",
            "pt-BR": "Os metadados complementares devem formar um objeto.",
            "zh-Hans": "附加元数据必须是一个对象。",
            "zh-Hant": "附加中繼資料必須是一個物件。",
            ru: "Дополнительные метаданные должны быть объектом.",
          }),
        );
      const record = {
        ...draft,
        ...structured,
        skyTarget: {
          ...(draft.skyTarget || {}),
          type: canonicalObjectType(draft.skyTarget?.type),
        },
      };
      delete record.equipment;
      for (const key of additionalMetadataKeys) delete record[key];
      Object.assign(record, additional);
      const response = await fetch("/api/admin/catalog", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({ originalId, record }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            data.error ||
            t({
              fr: "Enregistrement impossible.",
              ja: "保存できません。",
              en: "Unable to save.",
              de: "Speichern nicht möglich.",
              es: "No se pudo guardar.",
              it: "Impossibile salvare.",
              "pt-BR": "Não foi possível salvar.",
              "zh-Hans": "无法保存。",
              "zh-Hant": "無法儲存。",
              ru: "Не удалось сохранить.",
            }),
        );
      navigate(
        { section: "captures", itemId: data.record.id },
        { replace: true },
      );
      await reload(data.record.id);
      setMessage(
        t({
          fr: "Fiche enregistrée. Le catalogue public est déjà à jour.",
          ja: "記録を保存しました。公開カタログはすでに更新されています。",
          en: "Record saved. The public catalogue is already up to date.",
          de: "Eintrag gespeichert. Der öffentliche Katalog ist bereits aktuell.",
          es: "Ficha guardada. El catálogo público ya está actualizado.",
          it: "Scheda salvata. Il catalogo pubblico è già aggiornato.",
          "pt-BR": "Ficha salva. O catálogo público já está atualizado.",
          "zh-Hans": "记录已保存。公开星表已是最新。",
          "zh-Hant": "記錄已儲存。公開星表已是最新狀態。",
          ru: "Карточка сохранена. Публичный каталог уже обновлён.",
        }),
      );
    } catch (error) {
      setMessage(error.message);
    }
  };

  const applyRawJson = () => {
    try {
      selectRecord(JSON.parse(rawJson), originalId);
      setMessage(
        t({
          fr: "JSON appliqué au formulaire ; enregistrez pour écrire le fichier.",
          ja: "JSON をフォームに適用しました。ファイルへ書き込むには保存してください。",
          en: "JSON applied to the form; save to write the file.",
          de: "JSON in das Formular übernommen; speichere, um die Datei zu schreiben.",
          es: "JSON aplicado al formulario; guarde para escribir el archivo.",
          it: "JSON applicato al modulo; salva per scrivere il file.",
          "pt-BR": "JSON aplicado ao formulário; salve para gravar o arquivo.",
          "zh-Hans": "已将 JSON 应用到表单；保存后才会写入文件。",
          "zh-Hant": "已將 JSON 套用至表單；儲存後才會寫入檔案。",
          ru: "JSON применён к форме; сохраните, чтобы записать файл.",
        }),
      );
    } catch (error) {
      setMessage(
        `${t({
          fr: "JSON invalide",
          ja: "JSON が無効です",
          en: "Invalid JSON",
          de: "Ungültiges JSON",
          es: "JSON no válido",
          it: "JSON non valido",
          "pt-BR": "JSON inválido",
          "zh-Hans": "JSON 无效",
          "zh-Hant": "JSON 無效",
          ru: "Недопустимый JSON",
        })} : ${error.message}`,
      );
    }
  };

  const archiveCapture = async (record) => {
    try {
      const response = await fetch(
        `/api/admin/catalog?id=${encodeURIComponent(record.id)}`,
        { method: "DELETE", headers: { "x-astro-csrf": csrfToken() || "" } },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message || data.error || "Archivage impossible.",
        );
      navigate({ section: "captures" }, { replace: true });
      await reload();
      setMessage(
        "La capture est archivée. Elle peut être restaurée depuis les archives.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  const restoreCapture = async (id) => {
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message || data.error || "Restauration impossible.",
        );
      await reload(data.record.id);
      setShowCaptureArchives(false);
      setMessage("La capture est de nouveau visible dans le catalogue.");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const previewAcquisition = previewObject(
    jsonFields.acquisition,
    draft.acquisition || {},
  );
  const previewProcessing = previewObject(
    jsonFields.processing,
    draft.processing || {},
  );
  const previewAssetMetadata = previewArray(
    jsonFields.assetMetadata,
    draft.assetMetadata || [],
  );
  const previewProgressions = previewArray(
    jsonFields.progressions,
    draft.progressions || [],
  );
  const selectedPreviewAssets = useMemo(
    () =>
      previewAssetsFor(
        selectedAssets,
        previewAssetMetadata,
        previewProgressions,
      ),
    [selectedAssets, previewAssetMetadata, previewProgressions],
  );
  const previewGalleryBaseName = galleryPreviewBaseName(
    selectedPreviewAssets,
    draft,
  );
  const previewReferenceBaseName = referencePreviewBaseName(
    selectedPreviewAssets,
    draft,
  );

  return (
    <main className="admin-page">
      <div className="admin-workspace">
        <nav
          className="admin-tabs admin-sidebar"
          aria-label={t({
            fr: "Administration",
            ja: "管理",
            en: "Administration",
            de: "Administration",
            es: "Administración",
            it: "Amministrazione",
            "pt-BR": "Administração",
            "zh-Hans": "管理",
            "zh-Hant": "管理",
            ru: "Администрирование",
          })}
        >
          {/* « Captures » (the operator's file gallery) left the bar; the
              captures are in « Mon espace ». That gallery is kept
              for the server that chooses it
              (`ASTRO_PORTAL_GALLERY_SOURCE=files`): its editor is then the
              first section, « Galerie de fichiers », at its address of
              today; with the public captures, it is absent. */}
          {fileGallery && (
            <button
              type="button"
              className={tab === "captures" ? "is-active" : ""}
              onClick={() => navigate({ section: "captures" })}
            >
              {t({
                fr: "Galerie de fichiers",
                en: "File gallery",
                ja: "ファイルギャラリー",
                de: "Dateigalerie",
                es: "Galería de archivos",
                it: "Galleria di file",
                "pt-BR": "Galeria de arquivos",
                "zh-Hans": "文件图库",
                "zh-Hant": "檔案圖庫",
                ru: "Галерея файлов",
              })}
            </button>
          )}
          <button
            type="button"
            className={tab === "catalogue" ? "is-active" : ""}
            onClick={() => navigate({ section: "catalogue" })}
          >
            {t({
              fr: "Catalogue",
              ja: "カタログ",
              en: "Catalogue",
              de: "Katalog",
              es: "Catálogo",
              it: "Catalogo",
              "pt-BR": "Catálogo",
              "zh-Hans": "星表",
              "zh-Hant": "星表",
              ru: "Каталог",
            })}
          </button>
          <button
            type="button"
            className={tab === "initialization" ? "is-active" : ""}
            onClick={() => navigate({ section: "initialization" })}
          >
            {t({
              fr: "Initialisation",
              ja: "初期化",
              en: "Initialization",
              de: "Initialisierung",
              es: "Inicialización",
              it: "Inizializzazione",
              "pt-BR": "Inicialização",
              "zh-Hans": "初始化",
              "zh-Hant": "初始化",
              ru: "Инициализация",
            })}
          </button>
          <button
            type="button"
            className={tab === "default-equipment" ? "is-active" : ""}
            onClick={() => navigate({ section: "default-equipment" })}
          >
            {t({
              fr: "Matériel par défaut",
              ja: "既定の機材",
              en: "Default equipment",
              de: "Standardausrüstung",
              es: "Equipo predeterminado",
              it: "Attrezzatura predefinita",
              "pt-BR": "Equipamento padrão",
              "zh-Hans": "默认设备",
              "zh-Hant": "預設器材",
              ru: "Оборудование по умолчанию",
            })}
          </button>
          <button
            type="button"
            className={tab === "translations" ? "is-active" : ""}
            onClick={() => navigate({ section: "translations" })}
          >
            {t({
              fr: "Traductions",
              ja: "翻訳",
              en: "Translations",
              de: "Übersetzungen",
              es: "Traducciones",
              it: "Traduzioni",
              "pt-BR": "Traduções",
              "zh-Hans": "翻译",
              "zh-Hant": "翻譯",
              ru: "Переводы",
            })}
          </button>
          <button
            type="button"
            className={tab === "references" ? "is-active" : ""}
            onClick={() => navigate({ section: "references" })}
          >
            {t({
              fr: "Référentiels",
              ja: "固定データ",
              en: "Reference data",
              de: "Referenzdaten",
              es: "Datos de referencia",
              it: "Dati di riferimento",
              "pt-BR": "Referenciais",
              "zh-Hans": "固定数据",
              "zh-Hant": "固定資料",
              ru: "Справочные данные",
            })}
          </button>
          <button
            type="button"
            className={tab === "logs" ? "is-active" : ""}
            onClick={() => navigate({ section: "logs" })}
          >
            {t({
              fr: "Journaux",
              ja: "ログ",
              en: "Logs",
              de: "Protokolle",
              es: "Registros",
              it: "Registri",
              "pt-BR": "Registros",
              "zh-Hans": "日志",
              "zh-Hant": "日誌",
              ru: "Журналы",
            })}
          </button>
        </nav>
        <div className="admin-content">
          {tab === "initialization" ? (
            <StaticDataLibrary
              locale={locale}
              itemId={route.itemId}
              onNavigate={(itemId) =>
                navigate({ section: "initialization", itemId })
              }
            />
          ) : tab === "catalogue" ? (
            <TargetLibrary
              locale={locale}
              itemId={route.itemId}
              onNavigate={(itemId) =>
                navigate({ section: "catalogue", itemId })
              }
            />
          ) : tab === "logs" ? (
            <LogsLibrary locale={locale} />
          ) : tab === "references" ? (
            <ReferenceLibrary locale={locale} />
          ) : tab === "translations" ? (
            <TranslationLibrary
              locale={locale}
              locales={activeLocales}
              defaultLocale={activeDefaultLocale}
              localeNames={localeNames}
              translationOverrides={translationOverrides}
              customTranslationKeys={customTranslationKeys}
              onSaved={(configuration) => {
                setActiveLocales(configuration.supportedLocales);
                setActiveDefaultLocale(configuration.defaultLocale);
                setDraft((current) => ({
                  ...current,
                  title:
                    current.content?.[configuration.defaultLocale]?.title ||
                    current.title,
                }));
              }}
            />
          ) : tab === "default-equipment" ? (
            <DefaultEquipmentSection
              locale={locale}
              itemId={route.itemId}
              navigate={navigate}
              confirm={setConfirmation}
              message={setMessage}
            />
          ) : captureView === "list" ? (
            <CaptureLibrary
              locale={locale}
              records={records}
              assets={assets}
              archives={archives}
              showArchives={showCaptureArchives}
              onShowArchives={setShowCaptureArchives}
              onCreate={() => {
                selectRecord(emptyRecord, null);
                navigate({ section: "captures", itemId: "new" });
              }}
              onEdit={(record) => {
                selectRecord(record);
                navigate({ section: "captures", itemId: record.id });
              }}
              onArchive={(record) =>
                setConfirmation({
                  title: archiveText.archiveTitle,
                  message: archiveText.archiveMessage.replace(
                    "{title}",
                    record.title,
                  ),
                  confirmLabel: archiveText.archiveConfirm,
                  onConfirm: () => archiveCapture(record),
                })
              }
              onRestore={restoreCapture}
            />
          ) : (
            <div className="admin-editor-layout">
              <form className="admin-form" onSubmit={save}>
                <button
                  type="button"
                  className="btn-link admin-back-link"
                  onClick={() => navigate({ section: "captures" })}
                >
                  ←{" "}
                  {t({
                    fr: "Retour aux captures",
                    ja: "撮影一覧に戻る",
                    en: "Back to captures",
                    de: "Zurück zu den Aufnahmen",
                    es: "Volver a las capturas",
                    it: "Tornare alle riprese",
                    "pt-BR": "Voltar às capturas",
                    "zh-Hans": "返回拍摄列表",
                    "zh-Hant": "返回拍攝列表",
                    ru: "Назад к съёмкам",
                  })}
                </button>
                <p className="admin-editor-intro">
                  {t({
                    fr: "Les champs libres servent à la présentation publique. Les métadonnées structurées conservent les détails techniques sans imposer de format unique.",
                    ja: "公開表示用の自由入力と、技術情報用の構造化データを分けて編集できます。",
                    en: "Free-text fields are used for the public presentation. Structured metadata keeps the technical details without imposing a single format.",
                    de: "Die freien Felder dienen der öffentlichen Darstellung. Die strukturierten Metadaten bewahren die technischen Details, ohne ein einheitliches Format vorzugeben.",
                    es: "Los campos libres sirven para la presentación pública. Los metadatos estructurados conservan los detalles técnicos sin imponer un formato único.",
                    it: "I campi liberi servono alla presentazione pubblica. I metadati strutturati conservano i dettagli tecnici senza imporre un formato unico.",
                    "pt-BR":
                      "Os campos livres servem à apresentação pública. Os metadados estruturados mantêm os detalhes técnicos sem impor um formato único.",
                    "zh-Hans":
                      "自由文本字段用于公开展示。结构化元数据保存技术细节，而不强制使用单一格式。",
                    "zh-Hant":
                      "自由文字欄位用於公開呈現。結構化中繼資料保存技術細節，而不強制使用單一格式。",
                    ru: "Свободные поля нужны для публичного показа. Структурированные метаданные хранят технические подробности и не навязывают единый формат.",
                  })}
                </p>
                <section>
                  <h2>
                    {t({
                      fr: "Identification",
                      ja: "基本情報",
                      en: "Identification",
                      de: "Kennzeichnung",
                      es: "Identificación",
                      it: "Identificazione",
                      "pt-BR": "Identificação",
                      "zh-Hans": "基本信息",
                      "zh-Hant": "基本資訊",
                      ru: "Идентификация",
                    })}
                  </h2>
                  <div className="admin-grid">
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Identifiant",
                          ja: "識別子",
                          en: "Identifier",
                          de: "Kennung",
                          es: "Identificador",
                          it: "Identificativo",
                          "pt-BR": "Identificador",
                          "zh-Hans": "标识符",
                          "zh-Hant": "識別碼",
                          ru: "Идентификатор",
                        })}
                      </span>
                      <input
                        required
                        pattern="[a-z0-9][a-z0-9-]{1,79}"
                        value={draft.id}
                        onChange={(event) => update("id", event.target.value)}
                      />
                    </label>
                    <fieldset className="admin-localized-title-field admin-field-wide">
                      <legend>
                        {t({
                          fr: "Titre affiché",
                          ja: "表示タイトル",
                          en: "Displayed title",
                          de: "Angezeigter Titel",
                          es: "Título mostrado",
                          it: "Titolo visualizzato",
                          "pt-BR": "Título exibido",
                          "zh-Hans": "显示标题",
                          "zh-Hant": "顯示標題",
                          ru: "Отображаемый заголовок",
                        })}
                      </legend>
                      <p>
                        {t({
                          fr: "Un titre est requis pour chaque langue active. Chaque version est affichée dans la langue correspondante sans écraser les autres.",
                          ja: "有効な各言語のタイトルを入力します。各翻訳は他の言語を上書きせず、その言語で表示されます。",
                          en: "A title is required for each enabled language. Each version is shown in its own language without overwriting the others.",
                          de: "Für jede aktive Sprache ist ein Titel erforderlich. Jede Version wird in der entsprechenden Sprache angezeigt, ohne die anderen zu überschreiben.",
                          es: "Se requiere un título para cada idioma activo. Cada versión se muestra en el idioma correspondiente sin sobrescribir las demás.",
                          it: "È richiesto un titolo per ogni lingua attiva. Ogni versione viene mostrata nella lingua corrispondente senza sovrascrivere le altre.",
                          "pt-BR":
                            "Um título é obrigatório em cada idioma ativo. Cada versão é exibida no idioma correspondente sem sobrescrever as outras.",
                          "zh-Hans":
                            "每种已启用的语言都需要一个标题。每个版本以对应的语言显示，不会覆盖其他版本。",
                          "zh-Hant":
                            "每種已啟用的語言都需要一個標題。每個版本以對應的語言顯示，不會覆寫其他版本。",
                          ru: "Для каждого включённого языка нужен заголовок. Каждая версия показывается на своём языке и не заменяет остальные.",
                        })}
                      </p>
                      <div>
                        {activeLocales.map((language) => (
                          <label key={language}>
                            <span>{language.toUpperCase()}</span>
                            <input
                              required
                              value={localizedTitle(language)}
                              placeholder={
                                language === activeDefaultLocale
                                  ? ""
                                  : t({
                                      fr: "Traduction à renseigner",
                                      ja: "翻訳を入力",
                                      en: "Translation needed",
                                      de: "Übersetzung fehlt",
                                      es: "Traducción por completar",
                                      it: "Traduzione da inserire",
                                      "pt-BR": "Tradução a preencher",
                                      "zh-Hans": "需填写翻译",
                                      "zh-Hant": "需填寫翻譯",
                                      ru: "Нужен перевод",
                                    })
                              }
                              onChange={(event) =>
                                updateLocalizedTitle(
                                  language,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Catégorie",
                          ja: "カテゴリー",
                          en: "Category",
                          de: "Kategorie",
                          es: "Categoría",
                          it: "Categoria",
                          "pt-BR": "Categoria",
                          "zh-Hans": "类别",
                          "zh-Hant": "類別",
                          ru: "Категория",
                        })}
                      </span>
                      <select
                        value={draft.category || ""}
                        onChange={(event) =>
                          update("category", event.target.value)
                        }
                      >
                        {captureCategories.map((value) => (
                          <option value={value} key={value}>
                            {taxonomyLabel(value, locale)}
                          </option>
                        ))}
                        {!captureCategories.includes(draft.category) &&
                          draft.category && (
                            <option value={draft.category}>
                              {draft.category}
                            </option>
                          )}
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Objets, séparés par des virgules",
                          ja: "天体（カンマ区切り）",
                          en: "Objects, separated by commas",
                          de: "Objekte, durch Kommas getrennt",
                          es: "Objetos, separados por comas",
                          it: "Oggetti, separati da virgole",
                          "pt-BR": "Objetos, separados por vírgulas",
                          "zh-Hans": "天体，以逗号分隔",
                          "zh-Hant": "天體，以逗號分隔",
                          ru: "Объекты через запятую",
                        })}
                      </span>
                      <input
                        value={(draft.objects || []).join(", ")}
                        onChange={(event) =>
                          update("objects", lines(event.target.value))
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Tags",
                          ja: "タグ",
                          en: "Tags",
                          de: "Tags",
                          es: "Etiquetas",
                          it: "Tag",
                          "pt-BR": "Tags",
                          "zh-Hans": "标签",
                          "zh-Hant": "標籤",
                          ru: "Теги",
                        })}
                      </span>
                      <input
                        value={(draft.tags || []).join(", ")}
                        onChange={(event) =>
                          update("tags", lines(event.target.value))
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Type d’objet",
                          ja: "天体の種類",
                          en: "Object type",
                          de: "Objekttyp",
                          es: "Tipo de objeto",
                          it: "Tipo di oggetto",
                          "pt-BR": "Tipo de objeto",
                          "zh-Hans": "天体类型",
                          "zh-Hant": "天體類型",
                          ru: "Тип объекта",
                        })}
                      </span>
                      <select
                        value={canonicalObjectType(draft.skyTarget?.type) || ""}
                        onChange={(event) =>
                          updateSky("type", event.target.value)
                        }
                      >
                        <option value="">
                          {t({
                            fr: "Non renseigné",
                            ja: "未入力",
                            en: "Not set",
                            de: "Nicht angegeben",
                            es: "Sin especificar",
                            it: "Non indicato",
                            "pt-BR": "Não informado",
                            "zh-Hans": "未填写",
                            "zh-Hant": "未填寫",
                            ru: "Не указан",
                          })}
                        </option>
                        {objectTypes.map((value) => (
                          <option value={value} key={value}>
                            {taxonomyLabel(value, locale)}
                          </option>
                        ))}
                        {!objectTypes.includes(
                          canonicalObjectType(draft.skyTarget?.type),
                        ) &&
                          draft.skyTarget?.type && (
                            <option value={draft.skyTarget.type}>
                              {draft.skyTarget.type}
                            </option>
                          )}
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>
                        {t({
                          fr: "Constellation",
                          ja: "星座",
                          en: "Constellation",
                          de: "Sternbild",
                          es: "Constelación",
                          it: "Costellazione",
                          "pt-BR": "Constelação",
                          "zh-Hans": "星座",
                          "zh-Hant": "星座",
                          ru: "Созвездие",
                        })}
                      </span>
                      <select
                        value={draft.skyTarget?.constellation || ""}
                        onChange={(event) =>
                          updateSky("constellation", event.target.value)
                        }
                      >
                        <option value="">
                          {t({
                            fr: "Non renseignée",
                            ja: "未入力",
                            en: "Not set",
                            de: "Nicht angegeben",
                            es: "Sin especificar",
                            it: "Non indicata",
                            "pt-BR": "Não informada",
                            "zh-Hans": "未填写",
                            "zh-Hant": "未填寫",
                            ru: "Не указано",
                          })}
                        </option>
                        {constellations.map((value) => (
                          <option value={value} key={value}>
                            {value}
                          </option>
                        ))}
                        {!constellations.includes(
                          draft.skyTarget?.constellation,
                        ) &&
                          draft.skyTarget?.constellation && (
                            <option value={draft.skyTarget.constellation}>
                              {draft.skyTarget.constellation}
                            </option>
                          )}
                      </select>
                    </label>
                  </div>
                </section>
                <section>
                  <div className="admin-section-heading">
                    <h2>
                      {t({
                        fr: "Images de cette capture",
                        ja: "この撮影の画像",
                        en: "Images of this capture",
                        de: "Bilder dieser Aufnahme",
                        es: "Imágenes de esta captura",
                        it: "Immagini di questa ripresa",
                        "pt-BR": "Imagens desta captura",
                        "zh-Hans": "此拍摄的图像",
                        "zh-Hant": "此拍攝的影像",
                        ru: "Изображения этой съёмки",
                      })}
                    </h2>
                    <AdminHelpTooltip
                      id="capture-images-help"
                      label={t({
                        fr: "Aide sur les images de cette capture",
                        ja: "この撮影の画像についてのヘルプ",
                        en: "Help on this capture’s images",
                        de: "Hilfe zu den Bildern dieser Aufnahme",
                        es: "Ayuda sobre las imágenes de esta captura",
                        it: "Aiuto sulle immagini di questa ripresa",
                        "pt-BR": "Ajuda sobre as imagens desta captura",
                        "zh-Hans": "关于此拍摄图像的帮助",
                        "zh-Hant": "關於此拍攝影像的說明",
                        ru: "Справка об изображениях этой съёмки",
                      })}
                    >
                      {t({
                        fr: "Le mode automatique teste chaque règle sur « dossier/nom-de-fichier » sans extension. Les fichiers sélectionnés manuellement et ceux déclarés dans les métadonnées restent associés en plus de ce résultat.",
                        ja: "自動モードでは、拡張子を除いた「フォルダ名/ファイル名」に各ルールを適用します。手動で選んだ画像とメタデータで指定した画像は、この結果に加えて関連付けられます。",
                        en: "Automatic mode tests each rule against “folder/file-name” without the extension. Manually selected files and those declared in the metadata stay associated in addition to this result.",
                        de: "Im automatischen Modus wird jede Regel auf „Ordner/Dateiname“ ohne Erweiterung angewendet. Manuell ausgewählte Dateien und in den Metadaten angegebene Dateien bleiben zusätzlich zu diesem Ergebnis zugeordnet.",
                        es: "El modo automático prueba cada regla sobre «carpeta/nombre-de-archivo» sin extensión. Los archivos seleccionados manualmente y los declarados en los metadatos siguen asociados además de este resultado.",
                        it: "La modalità automatica verifica ogni regola su «cartella/nome-del-file» senza estensione. I file selezionati manualmente e quelli dichiarati nei metadati restano associati in aggiunta a questo risultato.",
                        "pt-BR":
                          "O modo automático testa cada regra em “pasta/nome-do-arquivo” sem extensão. Os arquivos selecionados manualmente e os declarados nos metadados continuam associados além desse resultado.",
                        "zh-Hans":
                          "自动模式会在不含扩展名的“文件夹/文件名”上测试每条规则。手动选择的文件以及元数据中声明的文件，会在此结果之外继续保持关联。",
                        "zh-Hant":
                          "自動模式會對不含副檔名的「資料夾/檔案名稱」逐條測試規則。手動選取的檔案以及中繼資料中宣告的檔案，會在此結果之外繼續保持關聯。",
                        ru: "Автоматический режим проверяет каждое правило по строке «папка/имя-файла» без расширения. Файлы, выбранные вручную, и файлы, указанные в метаданных, остаются связанными в дополнение к этому результату.",
                      })}
                    </AdminHelpTooltip>
                  </div>
                  <p className="admin-help admin-asset-explainer">
                    {t({
                      fr: "Les fichiers ci-dessous sont associés manuellement ou par les règles automatiques de cette capture. Vous pouvez ensuite définir l’image mise en avant dans la galerie et l’image de référence.",
                      ja: "下のファイルは手動またはこの撮影の自動ルールで関連付けられています。次に、ギャラリーで前面に表示する画像と基準画像を指定できます。",
                      en: "The files below are associated manually or by this capture’s automatic rules. You can then set the image featured in the gallery and the reference image.",
                      de: "Die folgenden Dateien sind dieser Aufnahme manuell oder durch die automatischen Regeln zugeordnet. Anschließend kannst du das in der Galerie hervorgehobene Bild und das Referenzbild festlegen.",
                      es: "Los archivos siguientes están asociados manualmente o por las reglas automáticas de esta captura. Después puede definir la imagen destacada en la galería y la imagen de referencia.",
                      it: "I file qui sotto sono associati manualmente o dalle regole automatiche di questa ripresa. Puoi poi definire l’immagine in evidenza nella galleria e l’immagine di riferimento.",
                      "pt-BR":
                        "Os arquivos abaixo estão associados manualmente ou pelas regras automáticas desta captura. Você pode então definir a imagem em destaque na galeria e a imagem de referência.",
                      "zh-Hans":
                        "下方的文件通过手动选择或此拍摄的自动规则关联。随后可以设定在图库中展示的图像和参考图像。",
                      "zh-Hant":
                        "下方的檔案是透過手動選取或此拍攝的自動規則關聯。接著可以指定在圖庫中呈現的影像與參考影像。",
                      ru: "Файлы ниже связаны вручную или автоматическими правилами этой съёмки. Затем можно указать изображение для показа в галерее и эталонное изображение.",
                    })}
                  </p>
                  {automaticRules.length ? (
                    <div className="admin-automatic-rules">
                      <strong>
                        {t({
                          fr: "Règles automatiques actives",
                          ja: "有効な自動ルール",
                          en: "Active automatic rules",
                          de: "Aktive automatische Regeln",
                          es: "Reglas automáticas activas",
                          it: "Regole automatiche attive",
                          "pt-BR": "Regras automáticas ativas",
                          "zh-Hans": "已启用的自动规则",
                          "zh-Hant": "已啟用的自動規則",
                          ru: "Действующие автоматические правила",
                        })}
                      </strong>
                      <ul>
                        {automaticRules.map((rule) => (
                          <li key={rule}>
                            <code>{rule}</code>
                          </li>
                        ))}
                      </ul>
                      <p>
                        {t({
                          fr: `${automaticallyLinkedAssets.length} fichier(s) sélectionné(s) correspondent actuellement à ces règles.`,
                          ja: `現在、選択された ${automaticallyLinkedAssets.length} 個のファイルがこれらのルールに一致しています。`,
                          en: `${automaticallyLinkedAssets.length} selected file(s) currently match these rules.`,
                          de: `${automaticallyLinkedAssets.length} ausgewählte Datei(en) entsprechen derzeit diesen Regeln.`,
                          es: `${automaticallyLinkedAssets.length} archivo(s) seleccionado(s) coinciden actualmente con estas reglas.`,
                          it: `Corrispondono attualmente a queste regole: ${automaticallyLinkedAssets.length} file selezionati.`,
                          "pt-BR": `${automaticallyLinkedAssets.length} arquivo(s) selecionado(s) correspondem atualmente a essas regras.`,
                          "zh-Hans": `当前有${automaticallyLinkedAssets.length}个所选文件符合这些规则。`,
                          "zh-Hant": `目前有 ${automaticallyLinkedAssets.length} 個所選檔案符合這些規則。`,
                          ru: `Выбранных файлов, соответствующих этим правилам: ${automaticallyLinkedAssets.length}.`,
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="admin-help admin-asset-origin">
                      {t({
                        fr: "Aucune règle automatique n’est définie : seuls les fichiers sélectionnés explicitement ou déclarés dans les métadonnées sont associés.",
                        ja: "自動ルールは設定されていません。明示的に選択した画像またはメタデータで指定した画像だけが関連付けられます。",
                        en: "No automatic rule is defined: only files selected explicitly or declared in the metadata are associated.",
                        de: "Es ist keine automatische Regel definiert: Zugeordnet werden nur ausdrücklich ausgewählte oder in den Metadaten angegebene Dateien.",
                        es: "No hay ninguna regla automática definida: solo se asocian los archivos seleccionados explícitamente o declarados en los metadatos.",
                        it: "Nessuna regola automatica definita: sono associati solo i file selezionati esplicitamente o dichiarati nei metadati.",
                        "pt-BR":
                          "Nenhuma regra automática definida: somente os arquivos selecionados explicitamente ou declarados nos metadados são associados.",
                        "zh-Hans":
                          "尚未定义自动规则：只有明确选择的文件或元数据中声明的文件才会被关联。",
                        "zh-Hant":
                          "尚未定義自動規則：只有明確選取的檔案或中繼資料中宣告的檔案才會被關聯。",
                        ru: "Автоматические правила не заданы: связываются только файлы, выбранные явно или указанные в метаданных.",
                      })}
                    </p>
                  )}
                  <div className="admin-selected-assets">
                    {selectedAssets.length ? (
                      <table>
                        <colgroup>
                          <col className="admin-selected-asset-preview-column" />
                          <col />
                          <col className="admin-selected-asset-category-column" />
                          <col className="admin-selected-asset-gallery-column" />
                          <col className="admin-selected-asset-reference-column" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">
                              {t({
                                fr: "Aperçu",
                                ja: "プレビュー",
                                en: "Preview",
                                de: "Vorschau",
                                es: "Vista previa",
                                it: "Anteprima",
                                "pt-BR": "Prévia",
                                "zh-Hans": "预览",
                                "zh-Hant": "預覽",
                                ru: "Предпросмотр",
                              })}
                            </th>
                            <th scope="col">
                              {t({
                                fr: "Fichiers sélectionnés",
                                ja: "選択ファイル",
                                en: "Selected files",
                                de: "Ausgewählte Dateien",
                                es: "Archivos seleccionados",
                                it: "File selezionati",
                                "pt-BR": "Arquivos selecionados",
                                "zh-Hans": "所选文件",
                                "zh-Hant": "所選檔案",
                                ru: "Выбранные файлы",
                              })}
                            </th>
                            <th scope="col">
                              {t({
                                fr: "Catégorie",
                                ja: "カテゴリー",
                                en: "Category",
                                de: "Kategorie",
                                es: "Categoría",
                                it: "Categoria",
                                "pt-BR": "Categoria",
                                "zh-Hans": "类别",
                                "zh-Hant": "類別",
                                ru: "Категория",
                              })}
                            </th>
                            <th scope="col">
                              <span className="admin-asset-role-label is-featured">
                                <i aria-hidden="true" />
                                {t({
                                  fr: "Galerie",
                                  ja: "ギャラリー",
                                  en: "Gallery",
                                  de: "Galerie",
                                  es: "Galería",
                                  it: "Galleria",
                                  "pt-BR": "Galeria",
                                  "zh-Hans": "图库",
                                  "zh-Hant": "圖庫",
                                  ru: "Галерея",
                                })}
                              </span>
                            </th>
                            <th scope="col">
                              <span className="admin-asset-role-label is-reference">
                                <i aria-hidden="true" />
                                {t({
                                  fr: "Référence",
                                  ja: "基準",
                                  en: "Reference",
                                  de: "Referenz",
                                  es: "Referencia",
                                  it: "Riferimento",
                                  "pt-BR": "Referência",
                                  "zh-Hans": "参考",
                                  "zh-Hant": "參考",
                                  ru: "Эталон",
                                })}
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPreviewAssets.map((asset) => {
                            const files = [asset.png, asset.tiff].filter(
                              Boolean,
                            );
                            return (
                              <tr key={`${asset.folder}/${asset.baseName}`}>
                                <td className="admin-selected-asset-thumbnail">
                                  {asset.imageUrl ? (
                                    <img
                                      src={asset.imageUrl}
                                      alt={`${t({
                                        fr: "Aperçu de",
                                        ja: "プレビュー",
                                        en: "Preview of",
                                        de: "Vorschau von",
                                        es: "Vista previa de",
                                        it: "Anteprima di",
                                        "pt-BR": "Prévia de",
                                        "zh-Hans": "预览",
                                        "zh-Hant": "預覽",
                                        ru: "Предпросмотр файла",
                                      })} ${asset.baseName}`}
                                    />
                                  ) : (
                                    <span aria-hidden="true">—</span>
                                  )}
                                </td>
                                <td
                                  data-label={t({
                                    fr: "Fichiers sélectionnés",
                                    ja: "選択ファイル",
                                    en: "Selected files",
                                    de: "Ausgewählte Dateien",
                                    es: "Archivos seleccionados",
                                    it: "File selezionati",
                                    "pt-BR": "Arquivos selecionados",
                                    "zh-Hans": "所选文件",
                                    "zh-Hant": "所選檔案",
                                    ru: "Выбранные файлы",
                                  })}
                                >
                                  <ul className="admin-selected-asset-files">
                                    {files.map((file) => {
                                      return (
                                        <li key={file} title={file}>
                                          {file}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </td>
                                <td
                                  data-label={t({
                                    fr: "Catégorie",
                                    ja: "カテゴリー",
                                    en: "Category",
                                    de: "Kategorie",
                                    es: "Categoría",
                                    it: "Categoria",
                                    "pt-BR": "Categoria",
                                    "zh-Hans": "类别",
                                    "zh-Hant": "類別",
                                    ru: "Категория",
                                  })}
                                >
                                  <span className="admin-selected-asset-category">
                                    {optionGroup(asset, locale)}
                                  </span>
                                </td>
                                <td
                                  data-label={t({
                                    fr: "Galerie",
                                    ja: "ギャラリー",
                                    en: "Gallery",
                                    de: "Galerie",
                                    es: "Galería",
                                    it: "Galleria",
                                    "pt-BR": "Galeria",
                                    "zh-Hans": "图库",
                                    "zh-Hant": "圖庫",
                                    ru: "Галерея",
                                  })}
                                >
                                  {asset.baseName === previewGalleryBaseName ? (
                                    <span className="admin-asset-role-indicator is-featured">
                                      <i aria-hidden="true" />
                                      {t({
                                        fr: "Présentée",
                                        ja: "表示中",
                                        en: "Featured",
                                        de: "Hervorgehoben",
                                        es: "Mostrada",
                                        it: "In evidenza",
                                        "pt-BR": "Em destaque",
                                        "zh-Hans": "展示中",
                                        "zh-Hant": "呈現中",
                                        ru: "Показано",
                                      })}
                                    </span>
                                  ) : (
                                    <span className="admin-gallery-asset-muted">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td
                                  data-label={t({
                                    fr: "Référence",
                                    ja: "基準画像",
                                    en: "Reference",
                                    de: "Referenz",
                                    es: "Referencia",
                                    it: "Riferimento",
                                    "pt-BR": "Referência",
                                    "zh-Hans": "参考图像",
                                    "zh-Hant": "參考影像",
                                    ru: "Эталонное изображение",
                                  })}
                                >
                                  {asset.baseName ===
                                  previewReferenceBaseName ? (
                                    <span className="admin-asset-role-indicator is-reference">
                                      <i aria-hidden="true" />
                                      {t({
                                        fr: "Référence",
                                        ja: "基準",
                                        en: "Reference",
                                        de: "Referenz",
                                        es: "Referencia",
                                        it: "Riferimento",
                                        "pt-BR": "Referência",
                                        "zh-Hans": "参考",
                                        "zh-Hant": "參考",
                                        ru: "Эталон",
                                      })}
                                    </span>
                                  ) : (
                                    <span className="admin-gallery-asset-muted">
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p>
                        {t({
                          fr: "Aucun fichier associé pour le moment.",
                          ja: "まだ画像が関連付けられていません。",
                          en: "No file associated yet.",
                          de: "Noch keine Datei zugeordnet.",
                          es: "Todavía no hay ningún archivo asociado.",
                          it: "Nessun file associato per ora.",
                          "pt-BR": "Nenhum arquivo associado por enquanto.",
                          "zh-Hans": "暂无关联的文件。",
                          "zh-Hant": "目前沒有關聯的檔案。",
                          ru: "Пока нет связанных файлов.",
                        })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-tertiary admin-assets-toggle"
                    onClick={() => setAssetBrowserOpen((open) => !open)}
                  >
                    {assetBrowserOpen
                      ? t({
                          fr: "Fermer la sélection de fichiers",
                          ja: "ファイル選択を閉じる",
                          en: "Close file selection",
                          de: "Dateiauswahl schließen",
                          es: "Cerrar la selección de archivos",
                          it: "Chiudere la selezione dei file",
                          "pt-BR": "Fechar a seleção de arquivos",
                          "zh-Hans": "关闭文件选择",
                          "zh-Hant": "關閉檔案選取",
                          ru: "Закрыть выбор файлов",
                        })
                      : t({
                          fr: "Gérer les fichiers manuellement",
                          ja: "ファイルを手動で管理",
                          en: "Manage files manually",
                          de: "Dateien manuell verwalten",
                          es: "Gestionar los archivos manualmente",
                          it: "Gestire i file manualmente",
                          "pt-BR": "Gerenciar os arquivos manualmente",
                          "zh-Hans": "手动管理文件",
                          "zh-Hant": "手動管理檔案",
                          ru: "Выбрать файлы вручную",
                        })}
                  </button>
                  {assetBrowserOpen && (
                    <div className="admin-asset-browser">
                      <input
                        className="asset-search"
                        placeholder={t({
                          fr: "Filtrer les fichiers détectés…",
                          ja: "検出されたファイルを絞り込む…",
                          en: "Filter detected files…",
                          de: "Erkannte Dateien filtern …",
                          es: "Filtrar los archivos detectados…",
                          it: "Filtrare i file rilevati…",
                          "pt-BR": "Filtrar os arquivos detectados…",
                          "zh-Hans": "筛选检测到的文件…",
                          "zh-Hant": "篩選偵測到的檔案……",
                          ru: "Фильтр по найденным файлам…",
                        })}
                        value={assetSearch}
                        onChange={(event) => setAssetSearch(event.target.value)}
                      />
                      <div className="asset-picker">
                        {available.map((asset) => (
                          <button
                            type="button"
                            className={
                              (draft.assetBaseNames || []).includes(
                                asset.baseName,
                              )
                                ? "is-selected"
                                : ""
                            }
                            key={`${asset.folder}/${asset.baseName}`}
                            onClick={() => toggleAsset(asset.baseName)}
                          >
                            <strong>{asset.baseName}</strong>
                            <span>
                              {asset.folder ||
                                t({
                                  fr: "racine",
                                  ja: "ルート",
                                  en: "root",
                                  de: "Stammverzeichnis",
                                  es: "raíz",
                                  it: "radice",
                                  "pt-BR": "raiz",
                                  "zh-Hans": "根目录",
                                  "zh-Hant": "根目錄",
                                  ru: "корень",
                                })}{" "}
                              ·{" "}
                              {asset.png
                                ? t({
                                    fr: "image",
                                    ja: "画像",
                                    en: "image",
                                    de: "Bild",
                                    es: "imagen",
                                    it: "immagine",
                                    "pt-BR": "imagem",
                                    "zh-Hans": "图像",
                                    "zh-Hant": "影像",
                                    ru: "изображение",
                                  })
                                : ""}
                              {asset.tiff ? " + TIFF" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="admin-grid">
                    <div className="admin-field">
                      <div className="admin-field-heading">
                        <label
                          className="admin-asset-role-label is-featured"
                          htmlFor="featured-base-name"
                        >
                          <i aria-hidden="true" />
                          {t({
                            fr: "Image présentée dans la galerie",
                            ja: "ギャラリーに表示する画像",
                            en: "Image featured in the gallery",
                            de: "In der Galerie hervorgehobenes Bild",
                            es: "Imagen mostrada en la galería",
                            it: "Immagine in evidenza nella galleria",
                            "pt-BR": "Imagem em destaque na galeria",
                            "zh-Hans": "在图库中展示的图像",
                            "zh-Hant": "於圖庫中呈現的影像",
                            ru: "Изображение для показа в галерее",
                          })}
                        </label>
                        <AdminHelpTooltip
                          id="featured-image-help"
                          label={t({
                            fr: "Aide sur l’image présentée dans la galerie",
                            ja: "ギャラリーに表示する画像についてのヘルプ",
                            en: "Help on the image featured in the gallery",
                            de: "Hilfe zum in der Galerie hervorgehobenen Bild",
                            es: "Ayuda sobre la imagen mostrada en la galería",
                            it: "Aiuto sull’immagine in evidenza nella galleria",
                            "pt-BR":
                              "Ajuda sobre a imagem em destaque na galeria",
                            "zh-Hans": "关于图库展示图像的帮助",
                            "zh-Hant": "關於圖庫呈現影像的說明",
                            ru: "Справка об изображении для галереи",
                          })}
                        >
                          {t({
                            fr: "C’est l’image utilisée sur la carte de la galerie. En mode automatique, la galerie utilise l’image de référence ; si elle n’est pas définie, elle choisit une image de référence naturelle puis la première image disponible.",
                            ja: "これはギャラリーのカードに使われる画像です。自動では基準画像を使い、基準画像が未設定なら自然な基準画像、次に最初の利用可能な画像を選びます。",
                            en: "This is the image used on the gallery card. In automatic mode, the gallery uses the reference image; if none is set, it picks a natural reference image, then the first available image.",
                            de: "Dieses Bild wird auf der Karte der Galerie verwendet. Im automatischen Modus verwendet die Galerie das Referenzbild; ist keines festgelegt, wählt sie ein naheliegendes Referenzbild und danach das erste verfügbare Bild.",
                            es: "Es la imagen que se usa en la tarjeta de la galería. En modo automático, la galería usa la imagen de referencia; si no está definida, elige una imagen de referencia natural y después la primera imagen disponible.",
                            it: "È l’immagine usata sulla scheda della galleria. In modalità automatica, la galleria usa l’immagine di riferimento; se non è definita, sceglie un’immagine di riferimento naturale, poi la prima immagine disponibile.",
                            "pt-BR":
                              "É a imagem usada no cartão da galeria. No modo automático, a galeria usa a imagem de referência; se ela não estiver definida, escolhe uma imagem de referência natural e depois a primeira imagem disponível.",
                            "zh-Hans":
                              "这是图库卡片所使用的图像。在自动模式下，图库使用参考图像；若未设置参考图像，则选择自然风格的参考图像，再退而选择第一张可用的图像。",
                            "zh-Hant":
                              "這是圖庫卡片所使用的影像。在自動模式下，圖庫使用參考影像；若未設定參考影像，則選擇自然風格的參考影像，再退而選擇第一張可用的影像。",
                            ru: "Это изображение используется на карточке галереи. В автоматическом режиме галерея берёт эталонное изображение; если оно не задано, выбирается естественное эталонное изображение, а затем первое доступное.",
                          })}
                        </AdminHelpTooltip>
                      </div>
                      <select
                        id="featured-base-name"
                        value={draft.featuredBaseName || ""}
                        onChange={(event) =>
                          update("featuredBaseName", event.target.value)
                        }
                      >
                        <option value="">
                          {t({
                            fr: "Automatique",
                            ja: "自動",
                            en: "Automatic",
                            de: "Automatisch",
                            es: "Automática",
                            it: "Automatica",
                            "pt-BR": "Automática",
                            "zh-Hans": "自动",
                            "zh-Hant": "自動",
                            ru: "Автоматически",
                          })}
                        </option>
                        {selectedAssets.map((asset) => (
                          <option key={`${asset.folder}/${asset.baseName}`}>
                            {asset.baseName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-field">
                      <div className="admin-field-heading">
                        <label
                          className="admin-asset-role-label is-reference"
                          htmlFor="reference-base-name"
                        >
                          <i aria-hidden="true" />
                          {t({
                            fr: "Image de référence",
                            ja: "基準画像",
                            en: "Reference image",
                            de: "Referenzbild",
                            es: "Imagen de referencia",
                            it: "Immagine di riferimento",
                            "pt-BR": "Imagem de referência",
                            "zh-Hans": "参考图像",
                            "zh-Hant": "參考影像",
                            ru: "Эталонное изображение",
                          })}
                        </label>
                        <AdminHelpTooltip
                          id="reference-image-help"
                          label={t({
                            fr: "Aide sur l’image de référence",
                            ja: "基準画像についてのヘルプ",
                            en: "Help on the reference image",
                            de: "Hilfe zum Referenzbild",
                            es: "Ayuda sobre la imagen de referencia",
                            it: "Aiuto sull’immagine di riferimento",
                            "pt-BR": "Ajuda sobre a imagem de referência",
                            "zh-Hans": "关于参考图像的帮助",
                            "zh-Hant": "關於參考影像的說明",
                            ru: "Справка об эталонном изображении",
                          })}
                        >
                          {t({
                            fr: "L’image de référence est l’image de repli de la fiche. Elle sert quand aucune image présentée n’est choisie, et devient alors aussi l’image de la carte de galerie. Elle peut donc être différente de l’image présentée choisie explicitement.",
                            ja: "基準画像はこの撮影記録のフォールバック画像です。表示画像を選んでいない場合に使われ、そのときはギャラリーのカードにも表示されます。明示的に選んだ表示画像とは別にできます。",
                            en: "The reference image is the record’s fallback image. It is used when no featured image is chosen, and then also becomes the gallery card image. It can therefore differ from the explicitly chosen featured image.",
                            de: "Das Referenzbild ist das Ersatzbild des Eintrags. Es wird verwendet, wenn kein hervorgehobenes Bild gewählt ist, und wird dann auch zum Bild der Galeriekarte. Es kann sich also vom ausdrücklich gewählten hervorgehobenen Bild unterscheiden.",
                            es: "La imagen de referencia es la imagen de reserva de la ficha. Se usa cuando no se ha elegido ninguna imagen mostrada y entonces pasa a ser también la imagen de la tarjeta de la galería. Por tanto, puede ser distinta de la imagen mostrada elegida explícitamente.",
                            it: "L’immagine di riferimento è l’immagine di ripiego della scheda. Serve quando non è scelta alcuna immagine in evidenza e diventa allora anche l’immagine della scheda della galleria. Può quindi essere diversa dall’immagine in evidenza scelta esplicitamente.",
                            "pt-BR":
                              "A imagem de referência é a imagem de reserva da ficha. Ela é usada quando nenhuma imagem em destaque é escolhida e, nesse caso, passa a ser também a imagem do cartão da galeria. Portanto, pode ser diferente da imagem em destaque escolhida explicitamente.",
                            "zh-Hans":
                              "参考图像是此记录的回退图像。未选择展示图像时使用它，此时它同时也是图库卡片的图像。因此它可以与明确选择的展示图像不同。",
                            "zh-Hant":
                              "參考影像是此記錄的備援影像。未選擇呈現影像時會使用它，此時它也是圖庫卡片的影像。因此它可以與明確選擇的呈現影像不同。",
                            ru: "Эталонное изображение — запасное изображение карточки. Оно используется, когда изображение для показа не выбрано, и тогда становится также изображением карточки галереи. Поэтому оно может отличаться от явно выбранного изображения для показа.",
                          })}
                        </AdminHelpTooltip>
                      </div>
                      <select
                        id="reference-base-name"
                        value={draft.referenceBaseName || ""}
                        onChange={(event) =>
                          update("referenceBaseName", event.target.value)
                        }
                      >
                        <option value="">
                          {t({
                            fr: "Automatique",
                            ja: "自動",
                            en: "Automatic",
                            de: "Automatisch",
                            es: "Automática",
                            it: "Automatica",
                            "pt-BR": "Automática",
                            "zh-Hans": "自动",
                            "zh-Hant": "自動",
                            ru: "Автоматически",
                          })}
                        </option>
                        {selectedAssets.map((asset) => (
                          <option key={`${asset.folder}/${asset.baseName}`}>
                            {asset.baseName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
                <section>
                  <h2>
                    {t({
                      fr: "Matériel de cette capture",
                      ja: "この撮影の機材",
                      en: "Equipment of this capture",
                      de: "Ausrüstung dieser Aufnahme",
                      es: "Equipo de esta captura",
                      it: "Attrezzatura di questa ripresa",
                      "pt-BR": "Equipamento desta captura",
                      "zh-Hans": "此拍摄的设备",
                      "zh-Hant": "此拍攝的器材",
                      ru: "Оборудование этой съёмки",
                    })}
                  </h2>
                  <p className="admin-help">
                    {originalId
                      ? t({
                          fr: "Sélectionnez le matériel réellement utilisé. Ces associations alimentent la fiche publique ; les notes privées de l’inventaire ne sont jamais publiées.",
                          ja: "実際に使った機材を選びます。これらの関連付けが公開詳細に表示され、機材の非公開メモは公開されません。",
                          en: "Select the equipment actually used. These associations feed the public record; the private notes of the inventory are never published.",
                          de: "Wähle die tatsächlich verwendete Ausrüstung aus. Diese Zuordnungen fließen in den öffentlichen Eintrag ein; die privaten Notizen des Inventars werden nie veröffentlicht.",
                          es: "Seleccione el equipo realmente utilizado. Estas asociaciones alimentan la ficha pública; las notas privadas del inventario nunca se publican.",
                          it: "Seleziona l’attrezzatura realmente usata. Queste associazioni alimentano la scheda pubblica; le note private dell’inventario non vengono mai pubblicate.",
                          "pt-BR":
                            "Selecione o equipamento realmente usado. Essas associações alimentam a ficha pública; as notas privadas do inventário nunca são publicadas.",
                          "zh-Hans":
                            "请选择实际使用的设备。这些关联会用于公开详情；设备清单中的私有备注绝不会公开。",
                          "zh-Hant":
                            "請選擇實際使用的器材。這些關聯會用於公開詳細資訊；器材清單中的私人備註絕不會公開。",
                          ru: "Выберите оборудование, которое действительно использовалось. Эти связи попадают в публичную карточку; личные заметки из списка оборудования никогда не публикуются.",
                        })
                      : t({
                          fr: "Enregistrez d’abord cette nouvelle capture, puis associez son matériel.",
                          ja: "まずこの新しい撮影記録を保存してから、機材を関連付けてください。",
                          en: "Save this new capture first, then link its equipment.",
                          de: "Speichere zuerst diese neue Aufnahme und ordne dann ihre Ausrüstung zu.",
                          es: "Guarde primero esta nueva captura y después asocie su equipo.",
                          it: "Salva prima questa nuova ripresa, poi associa la sua attrezzatura.",
                          "pt-BR":
                            "Salve primeiro esta nova captura e depois associe o equipamento.",
                          "zh-Hans": "请先保存这次新建的拍摄，再关联其设备。",
                          "zh-Hant": "請先儲存這筆新增的拍攝，再關聯其器材。",
                          ru: "Сначала сохраните эту новую съёмку, затем привяжите оборудование.",
                        })}
                  </p>
                  <div className="admin-capture-equipment-groups">
                    {[
                      {
                        role: "main",
                        title: t({
                          fr: "Matériel principal",
                          ja: "主機材",
                          en: "Main equipment",
                          de: "Hauptausrüstung",
                          es: "Equipo principal",
                          it: "Attrezzatura principale",
                          "pt-BR": "Equipamento principal",
                          "zh-Hans": "主要设备",
                          "zh-Hant": "主要器材",
                          ru: "Основное оборудование",
                        }),
                        help: t({
                          fr: "Instrument, caméra principale, monture, filtres et contrôle.",
                          ja: "主鏡、主カメラ、架台、フィルター、コントローラー。",
                          en: "Instrument, main camera, mount, filters and control.",
                          de: "Instrument, Hauptkamera, Montierung, Filter und Steuerung.",
                          es: "Instrumento, cámara principal, montura, filtros y control.",
                          it: "Strumento, camera principale, montatura, filtri e controllo.",
                          "pt-BR":
                            "Instrumento, câmera principal, montagem, filtros e controle.",
                          "zh-Hans": "望远镜、主相机、赤道仪、滤光片和控制器。",
                          "zh-Hant": "望遠鏡、主相機、赤道儀、濾鏡與控制器。",
                          ru: "Телескоп, основная камера, монтировка, фильтры и управление.",
                        }),
                        groups: captureEquipmentGroups.main,
                      },
                      {
                        role: "guiding",
                        title: t({
                          fr: "Guidage",
                          ja: "ガイド",
                          en: "Guiding",
                          de: "Guiding",
                          es: "Guiado",
                          it: "Guida",
                          "pt-BR": "Guiagem",
                          "zh-Hans": "导星",
                          "zh-Hant": "導星",
                          ru: "Гидирование",
                        }),
                        help: t({
                          fr: "Lunette guide et caméra de guidage uniquement.",
                          ja: "ガイドスコープとガイドカメラのみ。",
                          en: "Guide scope and guide camera only.",
                          de: "Nur Leitrohr und Guiding-Kamera.",
                          es: "Solo telescopio guía y cámara de guiado.",
                          it: "Solo cannocchiale di guida e camera di guida.",
                          "pt-BR":
                            "Apenas luneta de guiagem e câmera de guiagem.",
                          "zh-Hans": "仅限导星镜和导星相机。",
                          "zh-Hant": "僅限導星鏡與導星相機。",
                          ru: "Только гидирующий телескоп и камера гидирования.",
                        }),
                        groups: captureEquipmentGroups.guiding,
                      },
                    ].map(({ role, title, help, groups }) => (
                      <div className="admin-capture-equipment-role" key={role}>
                        <div className="admin-capture-equipment-role-heading">
                          <h3>{title}</h3>
                          <p>{help}</p>
                        </div>
                        <div className="admin-capture-equipment-groups">
                          {groups.map(([type, items]) => (
                            <fieldset
                              className="admin-capture-equipment-group"
                              key={`${role}-${type}`}
                            >
                              <legend>
                                {equipmentCopyFor(locale).kinds[type] || type}
                                <span>{items.length}</span>
                              </legend>
                              <div>
                                {items.map((item) => (
                                  <label key={item.id}>
                                    <input
                                      type="checkbox"
                                      disabled={!originalId}
                                      checked={captureEquipmentAssignments.some(
                                        (assignment) =>
                                          assignment.equipmentId === item.id &&
                                          captureEquipmentRole(
                                            assignment.role,
                                          ) === role,
                                      )}
                                      onChange={() =>
                                        toggleCaptureEquipment(item.id, role)
                                      }
                                    />
                                    <span className="admin-capture-equipment-check">
                                      <strong title={item.name}>
                                        {item.name}
                                      </strong>
                                      <small
                                        title={[
                                          item.manufacturer,
                                          item.model,
                                          equipmentSummary(item),
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      >
                                        {[
                                          item.manufacturer,
                                          item.model,
                                          equipmentSummary(item),
                                        ]
                                          .filter(Boolean)
                                          .join(" · ") ||
                                          t({
                                            fr: "À préciser",
                                            ja: "未入力",
                                            en: "Not set",
                                            de: "Zu präzisieren",
                                            es: "Por precisar",
                                            it: "Da precisare",
                                            "pt-BR": "A definir",
                                            "zh-Hans": "未填写",
                                            "zh-Hant": "未填寫",
                                            ru: "Не указано",
                                          })}
                                      </small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!captureEquipmentGroups.main.length &&
                      !captureEquipmentGroups.guiding.length && (
                        <p>
                          {t({
                            fr: "Ajoutez d’abord une fiche dans l’onglet Matériel.",
                            ja: "まず「機材」タブで機材を追加してください。",
                            en: "First add an item in the Equipment tab.",
                            de: "Füge zuerst einen Eintrag im Reiter Ausrüstung hinzu.",
                            es: "Agregue primero una ficha en la pestaña Equipo.",
                            it: "Aggiungi prima una scheda nella sezione Attrezzatura.",
                            "pt-BR":
                              "Adicione primeiro uma ficha na aba Equipamento.",
                            "zh-Hans": "请先在“设备”选项卡中添加一条设备记录。",
                            "zh-Hant": "請先在「器材」分頁中新增一筆器材記錄。",
                            ru: "Сначала добавьте оборудование на вкладке «Оборудование».",
                          })}
                        </p>
                      )}
                  </div>
                  {originalId && (
                    <button
                      type="button"
                      className="btn-secondary admin-assignment-save"
                      onClick={saveCaptureEquipment}
                    >
                      {t({
                        fr: "Enregistrer le matériel associé",
                        ja: "関連機材を保存",
                        en: "Save linked equipment",
                        de: "Zugeordnete Ausrüstung speichern",
                        es: "Guardar el equipo asociado",
                        it: "Salvare l’attrezzatura associata",
                        "pt-BR": "Salvar o equipamento associado",
                        "zh-Hans": "保存关联设备",
                        "zh-Hant": "儲存關聯器材",
                        ru: "Сохранить привязанное оборудование",
                      })}
                    </button>
                  )}
                </section>
                <section>
                  <h2>
                    {t({
                      fr: "Descriptions",
                      ja: "説明",
                      en: "Descriptions",
                      de: "Beschreibungen",
                      es: "Descripciones",
                      it: "Descrizioni",
                      "pt-BR": "Descrições",
                      "zh-Hans": "说明",
                      "zh-Hant": "說明",
                      ru: "Описания",
                    })}
                  </h2>
                  <JsonArea
                    label={t({
                      fr: "À propos de l’image — un paragraphe par bloc",
                      ja: "画像について — 段落ごとに入力",
                      en: "About the image — one paragraph per block",
                      de: "Über das Bild – ein Absatz pro Block",
                      es: "Acerca de la imagen — un párrafo por bloque",
                      it: "Informazioni sull’immagine — un paragrafo per blocco",
                      "pt-BR": "Sobre a imagem — um parágrafo por bloco",
                      "zh-Hans": "关于图像——每个区块一个段落",
                      "zh-Hant": "關於影像——每個區塊一個段落",
                      ru: "Об изображении — один абзац в каждом блоке",
                    })}
                    rows={7}
                    value={textForParagraphs(draft.description)}
                    onChange={(value) =>
                      update("description", paragraphs(value))
                    }
                  />
                  <JsonArea
                    label={t({
                      fr: "Description technique — un paragraphe par bloc",
                      ja: "技術説明 — 段落ごとに入力",
                      en: "Technical description — one paragraph per block",
                      de: "Technische Beschreibung – ein Absatz pro Block",
                      es: "Descripción técnica — un párrafo por bloque",
                      it: "Descrizione tecnica — un paragrafo per blocco",
                      "pt-BR": "Descrição técnica — um parágrafo por bloco",
                      "zh-Hans": "技术说明——每个区块一个段落",
                      "zh-Hant": "技術說明——每個區塊一個段落",
                      ru: "Техническое описание — один абзац в каждом блоке",
                    })}
                    rows={6}
                    value={textForParagraphs(draft.technicalDescription)}
                    onChange={(value) =>
                      update("technicalDescription", paragraphs(value))
                    }
                  />
                </section>
                <section>
                  <h2>
                    {t({
                      fr: "Métadonnées structurées",
                      ja: "構造化メタデータ",
                      en: "Structured metadata",
                      de: "Strukturierte Metadaten",
                      es: "Metadatos estructurados",
                      it: "Metadati strutturati",
                      "pt-BR": "Metadados estruturados",
                      "zh-Hans": "结构化元数据",
                      "zh-Hant": "結構化中繼資料",
                      ru: "Структурированные метаданные",
                    })}
                  </h2>
                  <p className="admin-help">
                    {t({
                      fr: "Chaque valeur est éditable ici avec des contrôles adaptés. Les groupes et les types de données sont conservés automatiquement ; l’édition JSON complète reste disponible uniquement pour les cas particuliers.",
                      ja: "ここでは値を操作しやすい入力欄で編集できます。グループとデータ型は自動的に保持され、特殊な場合だけ完全な JSON 編集を使えます。",
                      en: "Each value can be edited here with suitable controls. Groups and data types are kept automatically; full JSON editing remains available only for special cases.",
                      de: "Jeder Wert ist hier mit passenden Steuerelementen bearbeitbar. Gruppen und Datentypen bleiben automatisch erhalten; die vollständige JSON-Bearbeitung steht nur für Sonderfälle zur Verfügung.",
                      es: "Cada valor se puede editar aquí con controles adecuados. Los grupos y los tipos de datos se conservan automáticamente; la edición JSON completa solo sigue disponible para casos particulares.",
                      it: "Ogni valore è modificabile qui con controlli adatti. I gruppi e i tipi di dati vengono conservati automaticamente; la modifica JSON completa resta disponibile solo per i casi particolari.",
                      "pt-BR":
                        "Cada valor é editável aqui com controles adequados. Os grupos e os tipos de dados são mantidos automaticamente; a edição JSON completa fica disponível apenas para casos particulares.",
                      "zh-Hans":
                        "每个值都可以在此用合适的控件编辑。分组和数据类型会被自动保留；完整的 JSON 编辑仅在特殊情况下使用。",
                      "zh-Hant":
                        "每個值都可以在此以合適的控制項編輯。群組與資料類型會自動保留；完整的 JSON 編輯僅供特殊情況使用。",
                      ru: "Каждое значение можно изменить здесь с помощью подходящих элементов управления. Группы и типы данных сохраняются автоматически; полное редактирование JSON остаётся только для особых случаев.",
                    })}
                  </p>
                  <div className="admin-structured-json-grid">
                    {[...structuredAdminMetadataKeys, "additional"].map(
                      (key) => (
                        <StructuredJsonEditor
                          key={key}
                          label={jsonLabel(key)}
                          sectionKey={key}
                          value={jsonFields[key] || "{}"}
                          locale={locale}
                          onChange={(next) =>
                            setJsonFields((current) => ({
                              ...current,
                              [key]: next,
                            }))
                          }
                        />
                      ),
                    )}
                  </div>
                </section>
                <details className="advanced-json">
                  <summary>
                    {t({
                      fr: "Édition JSON complète",
                      ja: "JSON 全体を編集",
                      en: "Full JSON editing",
                      de: "Vollständige JSON-Bearbeitung",
                      es: "Edición JSON completa",
                      it: "Modifica JSON completa",
                      "pt-BR": "Edição JSON completa",
                      "zh-Hans": "完整 JSON 编辑",
                      "zh-Hant": "完整 JSON 編輯",
                      ru: "Полное редактирование JSON",
                    })}
                  </summary>
                  <JsonArea
                    label={t({
                      fr: "Fiche complète",
                      ja: "完全な記録",
                      en: "Full record",
                      de: "Vollständiger Eintrag",
                      es: "Ficha completa",
                      it: "Scheda completa",
                      "pt-BR": "Ficha completa",
                      "zh-Hans": "完整记录",
                      "zh-Hant": "完整記錄",
                      ru: "Полная карточка",
                    })}
                    rows={18}
                    value={rawJson}
                    onChange={setRawJson}
                  />
                  <button
                    className="btn-tertiary"
                    type="button"
                    onClick={applyRawJson}
                  >
                    {t({
                      fr: "Appliquer ce JSON au formulaire",
                      ja: "この JSON をフォームに適用",
                      en: "Apply this JSON to the form",
                      de: "Dieses JSON auf das Formular anwenden",
                      es: "Aplicar este JSON al formulario",
                      it: "Applicare questo JSON al modulo",
                      "pt-BR": "Aplicar este JSON ao formulário",
                      "zh-Hans": "将此 JSON 应用到表单",
                      "zh-Hant": "將此 JSON 套用至表單",
                      ru: "Применить этот JSON к форме",
                    })}
                  </button>
                </details>
                <footer className="admin-actions">
                  <p role="status">{message}</p>
                  <button className="btn-primary" type="submit">
                    {t({
                      fr: "Enregistrer la fiche",
                      ja: "記録を保存",
                      en: "Save the record",
                      de: "Eintrag speichern",
                      es: "Guardar la ficha",
                      it: "Salvare la scheda",
                      "pt-BR": "Salvar a ficha",
                      "zh-Hans": "保存记录",
                      "zh-Hant": "儲存記錄",
                      ru: "Сохранить карточку",
                    })}
                  </button>
                </footer>
              </form>
              <AdminLivePreview
                draft={draft}
                assets={selectedPreviewAssets}
                selectedBaseName={previewAssetBaseName}
                onSelectAsset={setPreviewAssetBaseName}
                acquisition={previewAcquisition}
                processing={previewProcessing}
                captureEquipment={publicCaptureEquipment(
                  selectedCaptureEquipment,
                )}
                locale={locale}
                t={t}
              />
            </div>
          )}
        </div>
      </div>
      {confirmation && (
        <AdminConfirmationDialog
          {...confirmation}
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            const action = confirmation.onConfirm;
            setConfirmation(null);
            await action();
          }}
        />
      )}
    </main>
  );
}
