"use client";

import { copyFor } from "astro-contracts/locales";
import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { PencilIcon } from "portal/components/admin/AdminIcons.js";
import { observingGuideFor } from "portal/target-observing-guide.js";
import {
  facetedCounterLabel,
  hasActiveFacetFilter,
} from "portal/target-catalogue-counters.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";

const copy = {
  fr: {
    eyebrow: "CATALOGUE LOCAL",
    title: "Cibles astronomiques",
    help: "Référentiel local synchronisé depuis OpenNGC. Les photos restent des fichiers privés ; cette base conserve leurs liens, crédits et sélections éditoriales.",
    search: "Rechercher une désignation ou un nom",
    all: "Toutes les cibles",
    best: "Sélection essentielle",
    extended: "Sélection étendue",
    results: (visible, total) =>
      `${visible} affichées sur ${total.toLocaleString("fr-FR")}`,
    total: "Cibles en base",
    core: "Essentielles",
    broad: "Étendues",
    noResult: "Aucune cible ne correspond à cette recherche.",
    edit: "Éditer",
    previous: "Précédent",
    next: "Suivant",
    back: "Retour au catalogue",
    entry: "Fiche cible",
    identifier: "Identifiant interne",
    identity: "Identification",
    designation: "Désignation principale",
    aliases: "Désignations et alias",
    commonNames: "Noms communs",
    type: "Type de cible",
    constellation: "Constellation",
    coordinates: "Coordonnées J2000",
    rightAscension: "Ascension droite (heures)",
    declination: "Déclinaison (degrés)",
    hemispheres: "Visibilité par hémisphère",
    hemispheresHelp:
      "Calculée automatiquement depuis la déclinaison : la cible culmine à au moins 30° depuis une latitude de référence de 30° Nord ou Sud. La visibilité réelle dépend ensuite du lieu et de l’horizon.",
    northernHemisphere: "Visible depuis l’hémisphère Nord",
    southernHemisphere: "Visible depuis l’hémisphère Sud",
    physical: "Données astronomiques",
    majorAxis: "Dimension majeure (′)",
    minorAxis: "Dimension mineure (′)",
    magnitude: "Magnitude intégrée",
    surfaceBrightness: "Brillance de surface",
    catalogues: "Catalogues d’origine",
    primaryCatalogue: "Catalogue principal",
    curation: "Sélection éditoriale",
    isBest: "Fait partie des Essentielles",
    isExtended: "Fait partie des Étendues",
    curationHelp:
      "Une cible appartient à une seule des deux sélections : les Étendues complètent les Essentielles. Ces choix sont manuels et ne seront pas écrasés lors d’une prochaine synchronisation du catalogue source.",
    modes: "Modes proposés",
    modesHelp:
      "Une cible d’une sélection n’est suggérée que dans les modes cochés ; sans aucun mode, elle l’est dans les deux. Un catalogue coché dans les filtres de suggestion est proposé en entier, quel que soit le mode.",
    modeVisual: "Visuel",
    modePhoto: "Photo",
    images: "Images et attributions",
    dss: "DSS · secours complet",
    premium: "Photo premium",
    visual: "Référence visuelle autorisée",
    visualPreview: "Aperçu visuel généré",
    noImage: "Aucune image enregistrée pour cette version.",
    file: "Fichier local",
    source: "Source",
    sourceUrl: "Page source",
    assetUrl: "URL du dérivé",
    credit: "Crédit affiché",
    license: "Licence",
    licenseUrl: "URL de la licence",
    titleField: "Titre de l’image",
    survey: "Relevé / enquête",
    editorial: "Fiche éditoriale localisée",
    editorialHelp:
      "Saisissez un paragraphe par bloc, séparé par une ligne vide. L’anglais reste le texte de référence ; les trois langues sont enregistrées ensemble.",
    editorialEnglish: "Anglais · texte de référence",
    editorialFrench: "Français",
    editorialJapanese: "Japonais",
    editorialDescription: "Description",
    editorialRaw: "JSON éditorial brut (lecture seule)",
    observingGuide: "Repères photo et visuel",
    observingGuideHelp:
      "Calcul indicatif pour les 500 cibles étendues. La focale est un repère pour un capteur courant de ciel profond ; le planificateur calcule ensuite le champ réel du matériel choisi. L’ouverture suppose un ciel sombre.",
    focalLengthMinimum: "Focale indicative minimale (mm)",
    focalLengthMaximum: "Focale indicative maximale (mm)",
    visualMinimumAperture: "Ouverture visuelle minimale (mm)",
    visualDifficulty: "Difficulté visuelle",
    autoDerived: "Calcul automatique",
    easy: "Facile",
    moderate: "Modérée",
    difficult: "Difficile",
    challenging: "Exigeante",
    apparentSize: "Taille apparente",
    northernTag: "Nord",
    southernTag: "Sud",
    sourceRecord: "Enregistrement source OpenNGC (lecture seule)",
    save: "Enregistrer la cible",
    saving: "Enregistrement…",
    saved: "La cible a été enregistrée.",
    loadError: "Chargement impossible.",
    saveError: "Enregistrement impossible.",
    invalidJson: "Le JSON éditorial doit être un objet valide.",
    selected: "Sélection essentielle",
    extendedTag: "Sélection étendue",
    dssFallback: "DSS",
  },
  en: {
    eyebrow: "LOCAL CATALOGUE",
    title: "Astronomical targets",
    help: "Local reference catalogue synchronised from OpenNGC. Images remain private files; this database keeps their links, credits and editorial selections.",
    search: "Search a designation or common name",
    all: "All targets",
    best: "Essential selection",
    extended: "Extended selection",
    results: (visible, total) =>
      `${visible} shown of ${total.toLocaleString("en")}`,
    total: "Targets in database",
    core: "Essential",
    broad: "Extended",
    noResult: "No target matches this search.",
    edit: "Edit",
    previous: "Previous",
    next: "Next",
    back: "Back to catalogue",
    entry: "Target record",
    identifier: "Internal identifier",
    identity: "Identification",
    designation: "Primary designation",
    aliases: "Designations and aliases",
    commonNames: "Common names",
    type: "Target type",
    constellation: "Constellation",
    coordinates: "J2000 coordinates",
    rightAscension: "Right ascension (hours)",
    declination: "Declination (degrees)",
    hemispheres: "Hemisphere visibility",
    hemispheresHelp:
      "Calculated automatically from declination: the target culminates at least 30° high from a reference latitude of 30° north or south. Actual visibility still depends on the site and horizon.",
    northernHemisphere: "Visible from the Northern Hemisphere",
    southernHemisphere: "Visible from the Southern Hemisphere",
    physical: "Astronomical data",
    majorAxis: "Major axis (′)",
    minorAxis: "Minor axis (′)",
    magnitude: "Integrated magnitude",
    surfaceBrightness: "Surface brightness",
    catalogues: "Source catalogues",
    primaryCatalogue: "Primary catalogue",
    curation: "Editorial selection",
    isBest: "Part of the Essentials",
    isExtended: "Part of the Extended",
    curationHelp:
      "A target belongs to one of the two selections only: the Extended complete the Essentials. These choices are manual and are not overwritten by a later source-catalogue sync.",
    modes: "Proposed modes",
    modesHelp:
      "A target of a selection is suggested only in the modes ticked; with none, in both. A catalogue ticked in the suggestion filters is proposed whole, whatever the mode.",
    modeVisual: "Visual",
    modePhoto: "Photo",
    images: "Images and attribution",
    dss: "DSS · full fallback",
    premium: "Premium photo",
    visual: "Authorised visual reference",
    visualPreview: "Generated visual preview",
    noImage: "No image is registered for this version.",
    file: "Local file",
    source: "Source",
    sourceUrl: "Source page",
    assetUrl: "Derivative URL",
    credit: "Displayed credit",
    license: "Licence",
    licenseUrl: "Licence URL",
    titleField: "Image title",
    survey: "Survey",
    editorial: "Localised editorial profile",
    editorialHelp:
      "Enter one paragraph per block, separated by a blank line. English remains the reference text; all three languages are saved together.",
    editorialEnglish: "English · source text",
    editorialFrench: "French",
    editorialJapanese: "Japanese",
    editorialDescription: "Description",
    editorialRaw: "Raw editorial JSON (read-only)",
    observingGuide: "Photo and visual guidance",
    observingGuideHelp:
      "Indicative calculation for the 500 extended targets. The focal length is a reference for a typical deep-sky sensor; the planner then calculates the actual field of the selected equipment. The aperture assumes dark skies.",
    focalLengthMinimum: "Indicative minimum focal length (mm)",
    focalLengthMaximum: "Indicative maximum focal length (mm)",
    visualMinimumAperture: "Minimum visual aperture (mm)",
    visualDifficulty: "Visual difficulty",
    autoDerived: "Automatic calculation",
    easy: "Easy",
    moderate: "Moderate",
    difficult: "Difficult",
    challenging: "Challenging",
    apparentSize: "Apparent size",
    northernTag: "North",
    southernTag: "South",
    sourceRecord: "OpenNGC source record (read-only)",
    save: "Save target",
    saving: "Saving…",
    saved: "Target saved.",
    loadError: "Unable to load.",
    saveError: "Unable to save.",
    invalidJson: "Editorial JSON must be a valid object.",
    selected: "Essential selection",
    extendedTag: "Extended selection",
    dssFallback: "DSS",
  },
  ja: {
    eyebrow: "ローカルカタログ",
    title: "天体カタログ",
    help: "OpenNGC から同期したローカル参照カタログです。画像ファイルは非公開のまま、ここではリンク、クレジット、編集上の選定を管理します。",
    search: "名称または通称を検索",
    all: "すべての天体",
    best: "主要セレクション",
    extended: "拡張セレクション",
    results: (visible, total) =>
      `${total.toLocaleString("ja-JP")} 件中 ${visible} 件を表示`,
    total: "データベース内の天体",
    core: "主要",
    broad: "拡張",
    noResult: "検索条件に一致する天体はありません。",
    edit: "編集",
    previous: "前へ",
    next: "次へ",
    back: "カタログに戻る",
    entry: "天体レコード",
    identifier: "内部識別子",
    identity: "識別情報",
    designation: "主な名称",
    aliases: "別名・カタログ名",
    commonNames: "通称",
    type: "天体の種類",
    constellation: "星座",
    coordinates: "J2000 座標",
    rightAscension: "赤経（時）",
    declination: "赤緯（度）",
    hemispheres: "半球ごとの見え方",
    hemispheresHelp:
      "赤緯から自動算出します。基準緯度を北緯・南緯30°とし、南中高度が30°以上になるかを示します。実際の見え方は観測地と地平線に左右されます。",
    northernHemisphere: "北半球から見える",
    southernHemisphere: "南半球から見える",
    physical: "天文学データ",
    majorAxis: "長径（′）",
    minorAxis: "短径（′）",
    magnitude: "統合等級",
    surfaceBrightness: "表面輝度",
    catalogues: "出典カタログ",
    primaryCatalogue: "主カタログ",
    curation: "編集上の選定",
    isBest: "主要セレクションに含める",
    isExtended: "拡張セレクションに含める",
    curationHelp:
      "天体はどちらか一方のセレクションにのみ属します。拡張セレクションは主要セレクションを補うものです。どちらも手動で編集でき、後のソース同期では上書きされません。",
    modes: "提案するモード",
    modesHelp:
      "セレクションの天体は、チェックしたモードでのみ提案されます。どちらもチェックしない場合は両方で提案されます。提案フィルターで選んだ星表は、モードに関係なく全体が提案されます。",
    modeVisual: "眼視",
    modePhoto: "写真",
    images: "画像とクレジット",
    dss: "DSS・完全版フォールバック",
    premium: "高品質写真",
    visual: "許諾済みの眼視リファレンス",
    visualPreview: "生成した眼視プレビュー",
    noImage: "この版には画像が登録されていません。",
    file: "ローカルファイル",
    source: "出典",
    sourceUrl: "出典ページ",
    assetUrl: "派生画像 URL",
    credit: "表示クレジット",
    license: "ライセンス",
    licenseUrl: "ライセンス URL",
    titleField: "画像タイトル",
    survey: "サーベイ",
    editorial: "ローカライズ済み編集プロフィール",
    editorialHelp:
      "空行で区切って段落ごとに入力します。英語を基準テキストとし、3言語をまとめて保存します。",
    editorialEnglish: "英語・基準テキスト",
    editorialFrench: "フランス語",
    editorialJapanese: "日本語",
    editorialDescription: "説明",
    editorialRaw: "編集 JSON（読み取り専用）",
    observingGuide: "撮影と眼視の目安",
    observingGuideHelp:
      "拡張 500 天体向けの目安です。焦点距離は一般的な深宇宙用センサーの参考値で、実際の写野は選択した機材に基づいてプランナーが計算します。口径は暗い空を前提とします。",
    focalLengthMinimum: "目安の最短焦点距離（mm）",
    focalLengthMaximum: "目安の最長焦点距離（mm）",
    visualMinimumAperture: "眼視の最小口径（mm）",
    visualDifficulty: "眼視難易度",
    autoDerived: "自動計算",
    easy: "容易",
    moderate: "普通",
    difficult: "難しい",
    challenging: "挑戦的",
    apparentSize: "見かけの大きさ",
    northernTag: "北半球",
    southernTag: "南半球",
    sourceRecord: "OpenNGC 元レコード（読み取り専用）",
    save: "天体を保存",
    saving: "保存中…",
    saved: "天体を保存しました。",
    loadError: "読み込めません。",
    saveError: "保存できません。",
    invalidJson: "編集用 JSON は有効なオブジェクトである必要があります。",
    selected: "主要セレクション",
    extendedTag: "拡張セレクション",
    dssFallback: "DSS",
  },
  de: {
    eyebrow: "LOKALER KATALOG",
    title: "Astronomische Ziele",
    help: "Lokale Referenz, synchronisiert aus OpenNGC. Die Fotos bleiben private Dateien; diese Datenbank bewahrt ihre Links, Nachweise und redaktionellen Auswahlen.",
    search: "Bezeichnung oder Namen suchen",
    all: "Alle Ziele",
    best: "Kernauswahl",
    extended: "Erweiterte Auswahl",
    results: (visible, total) =>
      `${visible} von ${total.toLocaleString("de-DE")} angezeigt`,
    total: "Ziele in der Datenbank",
    core: "Kernziele",
    broad: "Erweitert",
    noResult: "Kein Ziel entspricht dieser Suche.",
    edit: "Bearbeiten",
    previous: "Zurück",
    next: "Weiter",
    back: "Zurück zum Katalog",
    entry: "Zieleintrag",
    identifier: "Interne Kennung",
    identity: "Kennzeichnung",
    designation: "Hauptbezeichnung",
    aliases: "Bezeichnungen und Aliase",
    commonNames: "Gebräuchliche Namen",
    type: "Zieltyp",
    constellation: "Sternbild",
    coordinates: "Koordinaten J2000",
    rightAscension: "Rektaszension (Stunden)",
    declination: "Deklination (Grad)",
    hemispheres: "Sichtbarkeit je Hemisphäre",
    hemispheresHelp:
      "Wird automatisch aus der Deklination berechnet: Das Ziel kulminiert von einer Referenzbreite von 30° Nord oder Süd aus mindestens 30° hoch. Die tatsächliche Sichtbarkeit hängt danach vom Standort und vom Horizont ab.",
    northernHemisphere: "Sichtbar von der Nordhalbkugel",
    southernHemisphere: "Sichtbar von der Südhalbkugel",
    physical: "Astronomische Daten",
    majorAxis: "Große Achse (′)",
    minorAxis: "Kleine Achse (′)",
    magnitude: "Integrierte Helligkeit",
    surfaceBrightness: "Flächenhelligkeit",
    catalogues: "Ursprungskataloge",
    primaryCatalogue: "Hauptkatalog",
    curation: "Redaktionelle Auswahl",
    isBest: "Gehört zur Kernauswahl",
    isExtended: "Gehört zur erweiterten Auswahl",
    curationHelp:
      "Ein Ziel gehört nur zu einer der beiden Auswahlen: Die erweiterte Auswahl ergänzt die Kernauswahl. Diese Entscheidungen sind manuell und werden bei einer späteren Synchronisierung des Quellkatalogs nicht überschrieben.",
    modes: "Vorgeschlagene Modi",
    modesHelp:
      "Ein Ziel einer Auswahl wird nur in den angekreuzten Modi vorgeschlagen; ohne Modus in beiden. Ein in den Vorschlagsfiltern angekreuzter Katalog wird vollständig vorgeschlagen, unabhängig vom Modus.",
    modeVisual: "Visuell",
    modePhoto: "Foto",
    images: "Bilder und Nachweise",
    dss: "DSS · vollständiger Ersatz",
    premium: "Premium-Foto",
    visual: "Zugelassene visuelle Referenz",
    visualPreview: "Erzeugte visuelle Vorschau",
    noImage: "Für diese Version ist kein Bild hinterlegt.",
    file: "Lokale Datei",
    source: "Quelle",
    sourceUrl: "Quellseite",
    assetUrl: "URL der abgeleiteten Datei",
    credit: "Angezeigter Nachweis",
    license: "Lizenz",
    licenseUrl: "URL der Lizenz",
    titleField: "Bildtitel",
    survey: "Durchmusterung",
    editorial: "Lokalisierter redaktioneller Eintrag",
    editorialHelp:
      "Gib einen Absatz pro Block ein, getrennt durch eine Leerzeile. Englisch bleibt der Referenztext; die drei Sprachen werden gemeinsam gespeichert.",
    editorialEnglish: "Englisch · Referenztext",
    editorialFrench: "Französisch",
    editorialJapanese: "Japanisch",
    editorialDescription: "Beschreibung",
    editorialRaw: "Redaktionelles Roh-JSON (nur Lesezugriff)",
    observingGuide: "Hinweise für Foto und visuelle Beobachtung",
    observingGuideHelp:
      "Richtwerte für die 500 erweiterten Ziele. Die Brennweite ist ein Anhaltspunkt für einen gängigen Deep-Sky-Sensor; der Planer berechnet anschließend das tatsächliche Bildfeld der gewählten Ausrüstung. Die Öffnung setzt einen dunklen Himmel voraus.",
    focalLengthMinimum: "Empfohlene Mindestbrennweite (mm)",
    focalLengthMaximum: "Empfohlene Höchstbrennweite (mm)",
    visualMinimumAperture: "Minimale visuelle Öffnung (mm)",
    visualDifficulty: "Visuelle Schwierigkeit",
    autoDerived: "Automatische Berechnung",
    easy: "Einfach",
    moderate: "Mittel",
    difficult: "Schwierig",
    challenging: "Anspruchsvoll",
    apparentSize: "Scheinbare Größe",
    northernTag: "Nord",
    southernTag: "Süd",
    sourceRecord: "OpenNGC-Quelldatensatz (nur Lesezugriff)",
    save: "Ziel speichern",
    saving: "Wird gespeichert …",
    saved: "Das Ziel wurde gespeichert.",
    loadError: "Laden nicht möglich.",
    saveError: "Speichern nicht möglich.",
    invalidJson: "Das redaktionelle JSON muss ein gültiges Objekt sein.",
    selected: "Kernauswahl",
    extendedTag: "Erweiterte Auswahl",
    dssFallback: "DSS",
  },
  es: {
    eyebrow: "CATÁLOGO LOCAL",
    title: "Objetivos astronómicos",
    help: "Catálogo de referencia local sincronizado desde OpenNGC. Las fotos siguen siendo archivos privados; esta base conserva sus enlaces, créditos y selecciones editoriales.",
    search: "Buscar una designación o un nombre",
    all: "Todos los objetivos",
    best: "Selección esencial",
    extended: "Selección ampliada",
    results: (visible, total) =>
      `Mostrando ${visible} de ${total.toLocaleString("es-ES")}`,
    total: "Objetivos en la base",
    core: "Esenciales",
    broad: "Ampliados",
    noResult: "Ningún objetivo coincide con esta búsqueda.",
    edit: "Editar",
    previous: "Anterior",
    next: "Siguiente",
    back: "Volver al catálogo",
    entry: "Ficha del objetivo",
    identifier: "Identificador interno",
    identity: "Identificación",
    designation: "Designación principal",
    aliases: "Designaciones y alias",
    commonNames: "Nombres comunes",
    type: "Tipo de objetivo",
    constellation: "Constelación",
    coordinates: "Coordenadas J2000",
    rightAscension: "Ascensión recta (horas)",
    declination: "Declinación (grados)",
    hemispheres: "Visibilidad por hemisferio",
    hemispheresHelp:
      "Se calcula automáticamente a partir de la declinación: el objetivo culmina al menos a 30° de altitud desde una latitud de referencia de 30° norte o sur. La visibilidad real depende luego del lugar y del horizonte.",
    northernHemisphere: "Visible desde el hemisferio norte",
    southernHemisphere: "Visible desde el hemisferio sur",
    physical: "Datos astronómicos",
    majorAxis: "Dimensión mayor (′)",
    minorAxis: "Dimensión menor (′)",
    magnitude: "Magnitud integrada",
    surfaceBrightness: "Brillo superficial",
    catalogues: "Catálogos de origen",
    primaryCatalogue: "Catálogo principal",
    curation: "Selección editorial",
    isBest: "Forma parte de los esenciales",
    isExtended: "Forma parte de los ampliados",
    curationHelp:
      "Un objetivo pertenece a una sola de las dos selecciones: la ampliada completa la esencial. Estas opciones son manuales y no se sobrescribirán en una próxima sincronización del catálogo de origen.",
    modes: "Modos propuestos",
    modesHelp:
      "Un objetivo de una selección solo se sugiere en los modos marcados; sin ninguno, en ambos. Un catálogo marcado en los filtros de sugerencias se propone entero, sea cual sea el modo.",
    modeVisual: "Visual",
    modePhoto: "Foto",
    images: "Imágenes y atribuciones",
    dss: "DSS · respaldo completo",
    premium: "Foto premium",
    visual: "Referencia visual autorizada",
    visualPreview: "Vista previa visual generada",
    noImage: "No hay ninguna imagen registrada para esta versión.",
    file: "Archivo local",
    source: "Fuente",
    sourceUrl: "Página de origen",
    assetUrl: "URL de la derivada",
    credit: "Crédito mostrado",
    license: "Licencia",
    licenseUrl: "URL de la licencia",
    titleField: "Título de la imagen",
    survey: "Survey / rastreo",
    editorial: "Ficha editorial localizada",
    editorialHelp:
      "Escribe un párrafo por bloque, separado por una línea en blanco. El inglés sigue siendo el texto de referencia; los tres idiomas se guardan juntos.",
    editorialEnglish: "Inglés · texto de referencia",
    editorialFrench: "Francés",
    editorialJapanese: "Japonés",
    editorialDescription: "Descripción",
    editorialRaw: "JSON editorial sin procesar (solo lectura)",
    observingGuide: "Referencias para foto y observación visual",
    observingGuideHelp:
      "Cálculo orientativo para los 500 objetivos ampliados. La longitud focal es una referencia para un sensor habitual de cielo profundo; después el planificador calcula el campo real del equipo elegido. La apertura supone un cielo oscuro.",
    focalLengthMinimum: "Longitud focal orientativa mínima (mm)",
    focalLengthMaximum: "Longitud focal orientativa máxima (mm)",
    visualMinimumAperture: "Apertura visual mínima (mm)",
    visualDifficulty: "Dificultad visual",
    autoDerived: "Cálculo automático",
    easy: "Fácil",
    moderate: "Moderada",
    difficult: "Difícil",
    challenging: "Exigente",
    apparentSize: "Tamaño aparente",
    northernTag: "Norte",
    southernTag: "Sur",
    sourceRecord: "Registro de origen de OpenNGC (solo lectura)",
    save: "Guardar el objetivo",
    saving: "Guardando…",
    saved: "Se guardó el objetivo.",
    loadError: "No se pudo cargar.",
    saveError: "No se pudo guardar.",
    invalidJson: "El JSON editorial debe ser un objeto válido.",
    selected: "Selección esencial",
    extendedTag: "Selección ampliada",
    dssFallback: "DSS",
  },
  it: {
    eyebrow: "CATALOGO LOCALE",
    title: "Target astronomici",
    help: "Dati di riferimento locali sincronizzati da OpenNGC. Le foto restano file privati; questo database conserva i loro link, crediti e selezioni editoriali.",
    search: "Cercare una designazione o un nome",
    all: "Tutti i target",
    best: "Selezione essenziale",
    extended: "Selezione estesa",
    results: (visible, total) =>
      `${visible} visualizzati su ${total.toLocaleString("it-IT")}`,
    total: "Target nel database",
    core: "Essenziali",
    broad: "Estesi",
    noResult: "Nessun target corrisponde a questa ricerca.",
    edit: "Modificare",
    previous: "Precedente",
    next: "Successivo",
    back: "Tornare al catalogo",
    entry: "Scheda del target",
    identifier: "Identificativo interno",
    identity: "Identificazione",
    designation: "Designazione principale",
    aliases: "Designazioni e alias",
    commonNames: "Nomi comuni",
    type: "Tipo di target",
    constellation: "Costellazione",
    coordinates: "Coordinate J2000",
    rightAscension: "Ascensione retta (ore)",
    declination: "Declinazione (gradi)",
    hemispheres: "Visibilità per emisfero",
    hemispheresHelp:
      "Calcolata automaticamente dalla declinazione: il target culmina ad almeno 30° da una latitudine di riferimento di 30° Nord o Sud. La visibilità reale dipende poi dal luogo e dall’orizzonte.",
    northernHemisphere: "Visibile dall’emisfero Nord",
    southernHemisphere: "Visibile dall’emisfero Sud",
    physical: "Dati astronomici",
    majorAxis: "Dimensione maggiore (′)",
    minorAxis: "Dimensione minore (′)",
    magnitude: "Magnitudine integrata",
    surfaceBrightness: "Luminosità superficiale",
    catalogues: "Cataloghi di origine",
    primaryCatalogue: "Catalogo principale",
    curation: "Selezione editoriale",
    isBest: "Fa parte degli essenziali",
    isExtended: "Fa parte degli estesi",
    curationHelp:
      "Un target appartiene a una sola delle due selezioni: quella estesa completa quella essenziale. Queste scelte sono manuali e non verranno sovrascritte alla prossima sincronizzazione del catalogo sorgente.",
    modes: "Modalità proposte",
    modesHelp:
      "Un target di una selezione viene suggerito solo nelle modalità spuntate; senza alcuna, in entrambe. Un catalogo spuntato nei filtri dei suggerimenti viene proposto per intero, qualunque sia la modalità.",
    modeVisual: "Visuale",
    modePhoto: "Foto",
    images: "Immagini e attribuzioni",
    dss: "DSS · ripiego completo",
    premium: "Foto premium",
    visual: "Riferimento visivo autorizzato",
    visualPreview: "Anteprima visiva generata",
    noImage: "Nessuna immagine registrata per questa versione.",
    file: "File locale",
    source: "Fonte",
    sourceUrl: "Pagina della fonte",
    assetUrl: "URL della versione derivata",
    credit: "Crediti mostrati",
    license: "Licenza",
    licenseUrl: "URL della licenza",
    titleField: "Titolo dell’immagine",
    survey: "Survey",
    editorial: "Scheda editoriale localizzata",
    editorialHelp:
      "Inserisci un paragrafo per blocco, separato da una riga vuota. L’inglese resta il testo di riferimento; le tre lingue vengono salvate insieme.",
    editorialEnglish: "Inglese · testo di riferimento",
    editorialFrench: "Francese",
    editorialJapanese: "Giapponese",
    editorialDescription: "Descrizione",
    editorialRaw: "JSON editoriale grezzo (sola lettura)",
    observingGuide: "Riferimenti per foto e osservazione visuale",
    observingGuideHelp:
      "Calcolo indicativo per i 500 target estesi. La focale è un riferimento per un sensore comune da cielo profondo; il pianificatore calcola poi il campo reale dell’attrezzatura scelta. L’apertura presuppone un cielo buio.",
    focalLengthMinimum: "Focale indicativa minima (mm)",
    focalLengthMaximum: "Focale indicativa massima (mm)",
    visualMinimumAperture: "Apertura visuale minima (mm)",
    visualDifficulty: "Difficoltà visuale",
    autoDerived: "Calcolo automatico",
    easy: "Facile",
    moderate: "Moderata",
    difficult: "Difficile",
    challenging: "Impegnativa",
    apparentSize: "Dimensione apparente",
    northernTag: "Nord",
    southernTag: "Sud",
    sourceRecord: "Record sorgente OpenNGC (sola lettura)",
    save: "Salvare il target",
    saving: "Salvataggio…",
    saved: "Il target è stato salvato.",
    loadError: "Impossibile caricare.",
    saveError: "Impossibile salvare.",
    invalidJson: "Il JSON editoriale deve essere un oggetto valido.",
    selected: "Selezione essenziale",
    extendedTag: "Selezione estesa",
    dssFallback: "DSS",
  },
  "pt-BR": {
    eyebrow: "CATÁLOGO LOCAL",
    title: "Alvos astronômicos",
    help: "Referencial local sincronizado a partir do OpenNGC. As fotos continuam sendo arquivos privados; este banco de dados mantém seus links, créditos e seleções editoriais.",
    search: "Pesquisar uma designação ou um nome",
    all: "Todos os alvos",
    best: "Seleção essencial",
    extended: "Seleção ampliada",
    results: (visible, total) =>
      `Exibindo ${visible} de ${total.toLocaleString("pt-BR")}`,
    total: "Alvos no banco de dados",
    core: "Essenciais",
    broad: "Ampliados",
    noResult: "Nenhum alvo corresponde a esta pesquisa.",
    edit: "Editar",
    previous: "Anterior",
    next: "Próximo",
    back: "Voltar ao catálogo",
    entry: "Ficha do alvo",
    identifier: "Identificador interno",
    identity: "Identificação",
    designation: "Designação principal",
    aliases: "Designações e apelidos",
    commonNames: "Nomes comuns",
    type: "Tipo de alvo",
    constellation: "Constelação",
    coordinates: "Coordenadas J2000",
    rightAscension: "Ascensão reta (horas)",
    declination: "Declinação (graus)",
    hemispheres: "Visibilidade por hemisfério",
    hemispheresHelp:
      "Calculada automaticamente a partir da declinação: o alvo culmina a pelo menos 30° a partir de uma latitude de referência de 30° Norte ou Sul. A visibilidade real depende então do local e do horizonte.",
    northernHemisphere: "Visível a partir do hemisfério Norte",
    southernHemisphere: "Visível a partir do hemisfério Sul",
    physical: "Dados astronômicos",
    majorAxis: "Dimensão maior (′)",
    minorAxis: "Dimensão menor (′)",
    magnitude: "Magnitude integrada",
    surfaceBrightness: "Brilho de superfície",
    catalogues: "Catálogos de origem",
    primaryCatalogue: "Catálogo principal",
    curation: "Seleção editorial",
    isBest: "Faz parte dos essenciais",
    isExtended: "Faz parte dos ampliados",
    curationHelp:
      "Um alvo pertence a apenas uma das duas seleções: a ampliada completa a essencial. Essas escolhas são manuais e não serão sobrescritas em uma próxima sincronização do catálogo de origem.",
    modes: "Modos propostos",
    modesHelp:
      "Um alvo de uma seleção só é sugerido nos modos marcados; sem nenhum, nos dois. Um catálogo marcado nos filtros de sugestões é proposto inteiro, qualquer que seja o modo.",
    modeVisual: "Visual",
    modePhoto: "Foto",
    images: "Imagens e atribuições",
    dss: "DSS · reserva completa",
    premium: "Foto premium",
    visual: "Referência visual autorizada",
    visualPreview: "Prévia visual gerada",
    noImage: "Nenhuma imagem registrada para esta versão.",
    file: "Arquivo local",
    source: "Fonte",
    sourceUrl: "Página de origem",
    assetUrl: "URL do derivado",
    credit: "Crédito exibido",
    license: "Licença",
    licenseUrl: "URL da licença",
    titleField: "Título da imagem",
    survey: "Levantamento",
    editorial: "Ficha editorial localizada",
    editorialHelp:
      "Digite um parágrafo por bloco, separado por uma linha em branco. O inglês continua sendo o texto de referência; os três idiomas são salvos juntos.",
    editorialEnglish: "Inglês · texto de referência",
    editorialFrench: "Francês",
    editorialJapanese: "Japonês",
    editorialDescription: "Descrição",
    editorialRaw: "JSON editorial bruto (somente leitura)",
    observingGuide: "Referências de foto e de observação visual",
    observingGuideHelp:
      "Cálculo indicativo para os 500 alvos ampliados. A distância focal é uma referência para um sensor comum de céu profundo; o planejador calcula depois o campo real do equipamento escolhido. A abertura pressupõe um céu escuro.",
    focalLengthMinimum: "Distância focal indicativa mínima (mm)",
    focalLengthMaximum: "Distância focal indicativa máxima (mm)",
    visualMinimumAperture: "Abertura visual mínima (mm)",
    visualDifficulty: "Dificuldade visual",
    autoDerived: "Cálculo automático",
    easy: "Fácil",
    moderate: "Moderada",
    difficult: "Difícil",
    challenging: "Exigente",
    apparentSize: "Tamanho aparente",
    northernTag: "Norte",
    southernTag: "Sul",
    sourceRecord: "Registro de origem do OpenNGC (somente leitura)",
    save: "Salvar o alvo",
    saving: "Salvando…",
    saved: "O alvo foi salvo.",
    loadError: "Não foi possível carregar.",
    saveError: "Não foi possível salvar.",
    invalidJson: "O JSON editorial deve ser um objeto válido.",
    selected: "Seleção essencial",
    extendedTag: "Seleção ampliada",
    dssFallback: "DSS",
  },
  "zh-Hans": {
    eyebrow: "本地星表",
    title: "天文目标",
    help: "与 OpenNGC 同步的本地参考星表。图片仍为私有文件；此数据库保存其链接、署名和编辑精选。",
    search: "搜索编号或常用名称",
    all: "所有目标",
    best: "核心精选",
    extended: "扩展精选",
    results: (visible, total) =>
      `共${total.toLocaleString("zh-Hans")}项，显示${visible}项`,
    total: "数据库中的目标",
    core: "核心",
    broad: "扩展",
    noResult: "没有符合此搜索的目标。",
    edit: "编辑",
    previous: "上一页",
    next: "下一页",
    back: "返回星表",
    entry: "目标记录",
    identifier: "内部标识符",
    identity: "识别信息",
    designation: "主要编号",
    aliases: "编号与别名",
    commonNames: "常用名称",
    type: "目标类型",
    constellation: "星座",
    coordinates: "J2000 坐标",
    rightAscension: "赤经（小时）",
    declination: "赤纬（度）",
    hemispheres: "各半球可见性",
    hemispheresHelp:
      "根据赤纬自动计算：以南纬或北纬30°为参考纬度，目标中天时高度角至少达到30°。实际可见性还取决于观测地点和地平线。",
    northernHemisphere: "北半球可见",
    southernHemisphere: "南半球可见",
    physical: "天文数据",
    majorAxis: "长轴（′）",
    minorAxis: "短轴（′）",
    magnitude: "综合星等",
    surfaceBrightness: "面亮度",
    catalogues: "来源星表",
    primaryCatalogue: "主星表",
    curation: "编辑精选",
    isBest: "属于核心精选",
    isExtended: "属于扩展精选",
    curationHelp:
      "一个目标只属于两个精选之一：扩展精选是对核心精选的补充。这些均为手动设置，下次同步源星表时不会被覆盖。",
    modes: "推荐模式",
    modesHelp:
      "精选中的目标只在勾选的模式下推荐；都不勾选时，两种模式都推荐。在推荐筛选中勾选的星表会完整推荐，与模式无关。",
    modeVisual: "目视",
    modePhoto: "摄影",
    images: "图片与署名",
    dss: "DSS · 完整备用",
    premium: "精品照片",
    visual: "已授权的目视参考",
    visualPreview: "生成的目视预览",
    noImage: "此版本没有登记图片。",
    file: "本地文件",
    source: "来源",
    sourceUrl: "来源页面",
    assetUrl: "衍生图 URL",
    credit: "显示的署名",
    license: "许可证",
    licenseUrl: "许可证 URL",
    titleField: "图片标题",
    survey: "巡天",
    editorial: "本地化编辑简介",
    editorialHelp:
      "每个段落占一块，以空行分隔。英文为基准文本；三种语言一并保存。",
    editorialEnglish: "英文 · 基准文本",
    editorialFrench: "法文",
    editorialJapanese: "日文",
    editorialDescription: "描述",
    editorialRaw: "原始编辑 JSON（只读）",
    observingGuide: "摄影与目视参考",
    observingGuideHelp:
      "为500个扩展目标提供的参考估算。焦距是常见深空传感器的参考值；规划器随后会根据所选设备计算实际视场。口径以暗夜为前提。",
    focalLengthMinimum: "参考最小焦距（mm）",
    focalLengthMaximum: "参考最大焦距（mm）",
    visualMinimumAperture: "目视最小口径（mm）",
    visualDifficulty: "目视难度",
    autoDerived: "自动计算",
    easy: "容易",
    moderate: "中等",
    difficult: "困难",
    challenging: "极具挑战",
    apparentSize: "视大小",
    northernTag: "北",
    southernTag: "南",
    sourceRecord: "OpenNGC 源记录（只读）",
    save: "保存目标",
    saving: "正在保存…",
    saved: "目标已保存。",
    loadError: "无法加载。",
    saveError: "无法保存。",
    invalidJson: "编辑 JSON 必须是有效的对象。",
    selected: "核心精选",
    extendedTag: "扩展精选",
    dssFallback: "DSS",
  },
  "zh-Hant": {
    eyebrow: "本機星表",
    title: "天文目標",
    help: "與 OpenNGC 同步的本機參考星表。圖片仍為私人檔案；此資料庫保存其連結、署名與編輯精選。",
    search: "搜尋編號或常用名稱",
    all: "所有目標",
    best: "核心精選",
    extended: "擴充精選",
    results: (visible, total) =>
      `共 ${total.toLocaleString("zh-Hant")} 筆，顯示 ${visible} 筆`,
    total: "資料庫中的目標",
    core: "核心",
    broad: "擴充",
    noResult: "沒有符合此搜尋的目標。",
    edit: "編輯",
    previous: "上一頁",
    next: "下一頁",
    back: "返回星表",
    entry: "目標記錄",
    identifier: "內部識別碼",
    identity: "識別資訊",
    designation: "主要目錄編號",
    aliases: "目錄編號與別名",
    commonNames: "常用名稱",
    type: "目標類型",
    constellation: "星座",
    coordinates: "J2000 座標",
    rightAscension: "赤經（小時）",
    declination: "赤緯（度）",
    hemispheres: "各半球可見性",
    hemispheresHelp:
      "依赤緯自動計算：以北緯或南緯 30° 為參考緯度，目標中天時高度角至少達 30°。實際可見性仍取決於地點與地平線。",
    northernHemisphere: "北半球可見",
    southernHemisphere: "南半球可見",
    physical: "天文資料",
    majorAxis: "長軸（′）",
    minorAxis: "短軸（′）",
    magnitude: "整體星等",
    surfaceBrightness: "表面亮度",
    catalogues: "來源星表",
    primaryCatalogue: "主要星表",
    curation: "編輯精選",
    isBest: "屬於核心精選",
    isExtended: "屬於擴充精選",
    curationHelp:
      "一個目標只屬於兩個精選之一：擴充精選是對核心精選的補充。這些皆為手動設定，日後同步來源星表時不會被覆寫。",
    modes: "推薦模式",
    modesHelp:
      "精選中的目標只在勾選的模式下推薦；都不勾選時，兩種模式都推薦。在推薦篩選中勾選的星表會完整推薦，與模式無關。",
    modeVisual: "目視",
    modePhoto: "攝影",
    images: "圖片與署名",
    dss: "DSS · 完整備援",
    premium: "精選照片",
    visual: "已授權的目視參考",
    visualPreview: "產生的目視預覽",
    noImage: "此版本未登錄圖片。",
    file: "本機檔案",
    source: "來源",
    sourceUrl: "來源頁面",
    assetUrl: "衍生檔 URL",
    credit: "顯示的署名",
    license: "授權",
    licenseUrl: "授權 URL",
    titleField: "圖片標題",
    survey: "巡天",
    editorial: "在地化編輯簡介",
    editorialHelp:
      "每個段落為一區塊，以空白行分隔。英文為基準文字；三種語言會一併儲存。",
    editorialEnglish: "英文 · 基準文字",
    editorialFrench: "法文",
    editorialJapanese: "日文",
    editorialDescription: "說明",
    editorialRaw: "原始編輯 JSON（唯讀）",
    observingGuide: "攝影與目視參考",
    observingGuideHelp:
      "針對 500 個擴充目標的參考估算。焦距是常見深空感光元件的參考值；規劃工具隨後會依所選器材計算實際視野。口徑以暗空為前提。",
    focalLengthMinimum: "參考最小焦距（mm）",
    focalLengthMaximum: "參考最大焦距（mm）",
    visualMinimumAperture: "目視最小口徑（mm）",
    visualDifficulty: "目視難度",
    autoDerived: "自動計算",
    easy: "容易",
    moderate: "中等",
    difficult: "困難",
    challenging: "高難度",
    apparentSize: "角大小",
    northernTag: "北",
    southernTag: "南",
    sourceRecord: "OpenNGC 來源記錄（唯讀）",
    save: "儲存目標",
    saving: "正在儲存…",
    saved: "目標已儲存。",
    loadError: "無法載入。",
    saveError: "無法儲存。",
    invalidJson: "編輯 JSON 必須是有效的物件。",
    selected: "核心精選",
    extendedTag: "擴充精選",
    dssFallback: "DSS",
  },
  ru: {
    eyebrow: "ЛОКАЛЬНЫЙ КАТАЛОГ",
    title: "Астрономические цели",
    help: "Локальный справочный каталог, синхронизированный с OpenNGC. Изображения остаются закрытыми файлами; эта база хранит ссылки на них, указания авторства и редакторские подборки.",
    search: "Поиск по обозначению или названию",
    all: "Все цели",
    best: "Основная подборка",
    extended: "Расширенная подборка",
    results: (visible, total) =>
      `Показано ${visible} из ${total.toLocaleString("ru-RU")}`,
    total: "Целей в базе",
    core: "Основные",
    broad: "Расширенные",
    noResult: "Ни одна цель не соответствует запросу.",
    edit: "Редактировать",
    previous: "Назад",
    next: "Далее",
    back: "К каталогу",
    entry: "Карточка цели",
    identifier: "Внутренний идентификатор",
    identity: "Идентификация",
    designation: "Основное обозначение",
    aliases: "Обозначения и псевдонимы",
    commonNames: "Распространённые названия",
    type: "Тип цели",
    constellation: "Созвездие",
    coordinates: "Координаты J2000",
    rightAscension: "Прямое восхождение (часы)",
    declination: "Склонение (градусы)",
    hemispheres: "Видимость по полушариям",
    hemispheresHelp:
      "Рассчитывается автоматически по склонению: цель кульминирует на высоте не менее 30° при опорной широте 30° северной или южной. Реальная видимость зависит от места и горизонта.",
    northernHemisphere: "Видна из Северного полушария",
    southernHemisphere: "Видна из Южного полушария",
    physical: "Астрономические данные",
    majorAxis: "Большая ось (′)",
    minorAxis: "Малая ось (′)",
    magnitude: "Интегральная звёздная величина",
    surfaceBrightness: "Поверхностная яркость",
    catalogues: "Исходные каталоги",
    primaryCatalogue: "Основной каталог",
    curation: "Редакторская подборка",
    isBest: "Входит в основную подборку",
    isExtended: "Входит в расширенную подборку",
    curationHelp:
      "Цель входит только в одну из двух подборок: расширенная дополняет основную. Этот выбор задаётся вручную и не будет перезаписан при следующей синхронизации исходного каталога.",
    modes: "Предлагаемые режимы",
    modesHelp:
      "Цель подборки предлагается только в отмеченных режимах; если не отмечен ни один — в обоих. Каталог, отмеченный в фильтрах предложений, предлагается целиком, независимо от режима.",
    modeVisual: "Визуально",
    modePhoto: "Фото",
    images: "Изображения и авторство",
    dss: "DSS · полный резерв",
    premium: "Премиум-снимок",
    visual: "Разрешённый визуальный ориентир",
    visualPreview: "Сгенерированный визуальный предпросмотр",
    noImage: "Для этой версии изображение не зарегистрировано.",
    file: "Локальный файл",
    source: "Источник",
    sourceUrl: "Страница источника",
    assetUrl: "URL производного файла",
    credit: "Отображаемое авторство",
    license: "Лицензия",
    licenseUrl: "URL лицензии",
    titleField: "Название изображения",
    survey: "Обзор неба",
    editorial: "Локализованная редакторская карточка",
    editorialHelp:
      "Вводите по одному абзацу в блоке, разделяя блоки пустой строкой. Английский остаётся эталонным текстом; все три языка сохраняются вместе.",
    editorialEnglish: "Английский · эталонный текст",
    editorialFrench: "Французский",
    editorialJapanese: "Японский",
    editorialDescription: "Описание",
    editorialRaw: "Исходный редакторский JSON (только чтение)",
    observingGuide: "Ориентиры для съёмки и наблюдений",
    observingGuideHelp:
      "Расчётная оценка для 500 расширенных целей. Фокусное расстояние — ориентир для типичной матрицы для глубокого космоса; затем планировщик рассчитывает реальное поле выбранного оборудования. Апертура предполагает тёмное небо.",
    focalLengthMinimum: "Ориентировочное минимальное фокусное расстояние (мм)",
    focalLengthMaximum: "Ориентировочное максимальное фокусное расстояние (мм)",
    visualMinimumAperture: "Минимальная апертура для визуала (мм)",
    visualDifficulty: "Сложность визуального наблюдения",
    autoDerived: "Автоматический расчёт",
    easy: "Легко",
    moderate: "Средне",
    difficult: "Сложно",
    challenging: "Очень сложно",
    apparentSize: "Угловой размер",
    northernTag: "Север",
    southernTag: "Юг",
    sourceRecord: "Исходная запись OpenNGC (только чтение)",
    save: "Сохранить цель",
    saving: "Сохранение…",
    saved: "Цель сохранена.",
    loadError: "Не удалось загрузить.",
    saveError: "Не удалось сохранить.",
    invalidJson: "Редакторский JSON должен быть корректным объектом.",
    selected: "Основная подборка",
    extendedTag: "Расширенная подборка",
    dssFallback: "DSS",
  },
};

const csrfToken = () => csrfCookieValue();

const lines = (value) =>
  String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const readableList = (value) => (Array.isArray(value) ? value.join("\n") : "");
const numberValue = (value) =>
  value === null || value === undefined ? "" : value;
const prettyJson = (value) => JSON.stringify(value || {}, null, 2);
const paragraphs = (value) =>
  String(value || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
const paragraphText = (editorial, locale) =>
  (editorial?.catalogueResearch?.content?.[locale]?.paragraphs || []).join(
    "\n\n",
  );
const finiteNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

function EditorialProfileFields({ editorial, onChange, text }) {
  const updateParagraphs = (locale, value) => {
    const current = editorial && typeof editorial === "object" ? editorial : {};
    const research = current.catalogueResearch || {};
    // The text typed here is the language's text: the sections of a
    // published page (intertitles) no longer describe it.
    // eslint-disable-next-line no-unused-vars
    const { sections: ignoredSections, ...ownContent } =
      research.content?.[locale] || {};
    onChange({
      ...current,
      catalogueResearch: {
        ...research,
        schemaVersion: research.schemaVersion || 1,
        sourceLocale: research.sourceLocale || "en",
        content: {
          ...(research.content || {}),
          [locale]: { ...ownContent, paragraphs: paragraphs(value) },
        },
      },
    });
  };
  const languages = [
    ["en", text.editorialEnglish],
    ["fr", text.editorialFrench],
    ["ja", text.editorialJapanese],
  ];
  return (
    <section className="admin-target-editorial">
      <h2>{text.editorial}</h2>
      <p className="admin-help">{text.editorialHelp}</p>
      <div className="admin-target-editorial-languages">
        {languages.map(([locale, label]) => (
          <label className="admin-target-editorial-language" key={locale}>
            <span>{label}</span>
            <textarea
              rows={10}
              value={paragraphText(editorial, locale)}
              onChange={(event) => updateParagraphs(locale, event.target.value)}
              aria-label={`${text.editorialDescription} — ${label}`}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function ObservingGuideFields({ target, editorial, onChange, text }) {
  const guide = observingGuideFor({ ...target, editorial });
  if (!guide) return null;
  const manual = editorial?.observingGuide || {};
  const update = (key, value) => {
    const current = editorial && typeof editorial === "object" ? editorial : {};
    const nextGuide = { ...(current.observingGuide || {}) };
    if (value === "") delete nextGuide[key];
    else nextGuide[key] = value;
    onChange({ ...current, observingGuide: nextGuide });
  };
  return (
    <section className="admin-target-observing-guide">
      <h2>{text.observingGuide}</h2>
      <p className="admin-help">{text.observingGuideHelp}</p>
      <div className="admin-grid">
        <label className="admin-field">
          <span>{text.focalLengthMinimum}</span>
          <input
            type="number"
            min="100"
            max="5000"
            step="50"
            value={numberValue(manual.focalLengthMinimumMm)}
            placeholder={String(guide.focalLengthMinimumMm)}
            onChange={(event) =>
              update("focalLengthMinimumMm", event.target.value)
            }
          />
        </label>
        <label className="admin-field">
          <span>{text.focalLengthMaximum}</span>
          <input
            type="number"
            min="100"
            max="5000"
            step="50"
            value={numberValue(manual.focalLengthMaximumMm)}
            placeholder={String(guide.focalLengthMaximumMm)}
            onChange={(event) =>
              update("focalLengthMaximumMm", event.target.value)
            }
          />
        </label>
        <label className="admin-field">
          <span>{text.visualMinimumAperture}</span>
          <input
            type="number"
            min="50"
            max="400"
            step="10"
            value={numberValue(manual.visualMinimumApertureMm)}
            placeholder={String(guide.visualMinimumApertureMm)}
            onChange={(event) =>
              update("visualMinimumApertureMm", event.target.value)
            }
          />
        </label>
        <label className="admin-field">
          <span>{text.visualDifficulty}</span>
          <select
            value={manual.visualDifficulty || ""}
            onChange={(event) => update("visualDifficulty", event.target.value)}
          >
            <option value="">{text.autoDerived}</option>
            {["easy", "moderate", "difficult", "challenging"].map(
              (difficulty) => (
                <option value={difficulty} key={difficulty}>
                  {text[difficulty]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
    </section>
  );
}

function TargetImageEditor({ kind, title, entry, imageUrl, onChange, text }) {
  const image = entry || {};
  const update = (key, value) => onChange({ ...image, [key]: value });
  return (
    <section className="admin-target-image-editor">
      <header>
        <h3>{title}</h3>
        {imageUrl ? <img src={imageUrl} alt="" /> : <p>{text.noImage}</p>}
      </header>
      <div className="admin-grid">
        <label className="admin-field">
          <span>{text.file}</span>
          <input
            value={image.file || ""}
            onChange={(event) => update("file", event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>{text.source}</span>
          <input
            value={image.source || ""}
            onChange={(event) => update("source", event.target.value)}
          />
        </label>
        <label className="admin-field admin-field-wide">
          <span>{text.sourceUrl}</span>
          <input
            type="url"
            value={image.sourceUrl || ""}
            onChange={(event) => update("sourceUrl", event.target.value)}
          />
        </label>
        {kind === "premium" && (
          <label className="admin-field admin-field-wide">
            <span>{text.assetUrl}</span>
            <input
              type="url"
              value={image.assetUrl || ""}
              onChange={(event) => update("assetUrl", event.target.value)}
            />
          </label>
        )}
        <label className="admin-field admin-field-wide">
          <span>{text.credit}</span>
          <input
            value={image.credit || ""}
            onChange={(event) => update("credit", event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>{text.license}</span>
          <input
            value={image.license || ""}
            onChange={(event) => update("license", event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>{text.licenseUrl}</span>
          <input
            type="url"
            value={image.licenseUrl || ""}
            onChange={(event) => update("licenseUrl", event.target.value)}
          />
        </label>
        {kind === "premium" && (
          <label className="admin-field">
            <span>{text.titleField}</span>
            <input
              value={image.title || ""}
              onChange={(event) => update("title", event.target.value)}
            />
          </label>
        )}
        {kind === "dss" && (
          <label className="admin-field">
            <span>{text.survey}</span>
            <input
              value={image.survey || ""}
              onChange={(event) => update("survey", event.target.value)}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function TargetEditor({ locale, id, onClose }) {
  const text = copyFor(copy, locale, "TargetLibrary.copy");
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setStatus("");
    fetch(
      `/api/admin/target-library?id=${encodeURIComponent(id)}&locale=${encodeURIComponent(locale)}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || text.loadError);
        return data.entry;
      })
      .then((entry) => {
        if (cancelled) return;
        setDraft(entry);
      })
      .catch((error) => !cancelled && setStatus(error.message));
    return () => {
      cancelled = true;
    };
  }, [id, locale, text.loadError]);

  if (!draft)
    return (
      <p className="admin-target-status" role="status">
        {status || text.loadError.replace("impossible", "en cours")}
      </p>
    );

  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updateCoordinate = (key, value) =>
    setDraft((current) => ({
      ...current,
      coordinate: { ...(current.coordinate || {}), [key]: value },
    }));
  const updateSize = (index, value) =>
    setDraft((current) => {
      const next = [...(current.apparentSizeArcmin || [])];
      next[index] = value;
      return { ...current, apparentSizeArcmin: next };
    });
  const save = async (event) => {
    event.preventDefault();
    setStatus(text.saving);
    try {
      const response = await fetch(
        `/api/admin/target-library?locale=${encodeURIComponent(locale)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-astro-csrf": csrfToken() || "",
          },
          body: JSON.stringify({
            entry: { ...draft, editorial: draft.editorial || {} },
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || data.error || text.saveError);
      setDraft(data.entry);
      setStatus(text.saved);
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <form
      className="admin-form admin-editor-form admin-target-editor"
      onSubmit={save}
    >
      <section>
        <button
          type="button"
          className="btn-link admin-back-link"
          onClick={onClose}
        >
          ← {text.back}
        </button>
        <p className="eyebrow">{text.eyebrow}</p>
        <h2>{text.entry}</h2>
        <p className="admin-target-id">
          <span>{text.identifier}</span> {draft.id}
        </p>
        <div className="admin-grid">
          <label className="admin-field admin-field-wide">
            <span>{text.designation}</span>
            <input
              required
              value={draft.designation || ""}
              onChange={(event) => update("designation", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.type}</span>
            <input
              value={draft.typeKey || ""}
              onChange={(event) => update("typeKey", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.constellation}</span>
            <input
              value={draft.constellationKey || ""}
              onChange={(event) =>
                update("constellationKey", event.target.value)
              }
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{text.aliases}</span>
            <textarea
              rows={3}
              value={readableList(draft.aliases)}
              onChange={(event) => update("aliases", lines(event.target.value))}
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{text.commonNames}</span>
            <textarea
              rows={3}
              value={readableList(draft.commonNames)}
              onChange={(event) =>
                update("commonNames", lines(event.target.value))
              }
            />
          </label>
        </div>
      </section>

      <section>
        <h2>{text.coordinates}</h2>
        <div className="admin-grid">
          <label className="admin-field">
            <span>{text.rightAscension}</span>
            <input
              type="number"
              min="0"
              max="24"
              step="any"
              value={numberValue(draft.coordinate?.ra)}
              onChange={(event) => updateCoordinate("ra", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.declination}</span>
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              value={numberValue(draft.coordinate?.dec)}
              onChange={(event) => updateCoordinate("dec", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.majorAxis}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={numberValue(draft.apparentSizeArcmin?.[0])}
              onChange={(event) => updateSize(0, event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.minorAxis}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={numberValue(draft.apparentSizeArcmin?.[1])}
              onChange={(event) => updateSize(1, event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.magnitude}</span>
            <input
              type="number"
              step="any"
              value={numberValue(draft.magnitude)}
              onChange={(event) => update("magnitude", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.surfaceBrightness}</span>
            <input
              type="number"
              step="any"
              value={numberValue(draft.surfaceBrightness)}
              onChange={(event) =>
                update("surfaceBrightness", event.target.value)
              }
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{text.catalogues}</span>
            <textarea
              rows={2}
              value={readableList(draft.catalogues)}
              onChange={(event) =>
                update("catalogues", lines(event.target.value))
              }
            />
          </label>
          <label className="admin-field">
            <span>{text.primaryCatalogue}</span>
            <input
              value={draft.catalogue || ""}
              onChange={(event) => update("catalogue", event.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <h2>{text.curation}</h2>
        <p className="admin-help">{text.curationHelp}</p>
        <div className="admin-target-curation-options">
          <label className="admin-binary-field">
            <input
              type="checkbox"
              checked={Boolean(draft.isBest)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isBest: event.target.checked,
                  // The two selections are disjoint.
                  isExtended: event.target.checked ? false : current.isExtended,
                }))
              }
            />
            <span>{text.isBest}</span>
          </label>
          <label className="admin-binary-field">
            <input
              type="checkbox"
              checked={Boolean(draft.isExtended)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isExtended: event.target.checked,
                  isBest: event.target.checked ? false : current.isBest,
                }))
              }
            />
            <span>{text.isExtended}</span>
          </label>
        </div>
        <h3>{text.modes}</h3>
        <p className="admin-help">{text.modesHelp}</p>
        <div className="admin-target-curation-options">
          {[
            ["visual", text.modeVisual],
            ["photo", text.modePhoto],
          ].map(([mode, label]) => (
            <label className="admin-binary-field" key={mode}>
              <input
                type="checkbox"
                checked={(draft.modes || []).includes(mode)}
                onChange={(event) =>
                  update(
                    "modes",
                    ["visual", "photo"].filter((known) =>
                      known === mode
                        ? event.target.checked
                        : (draft.modes || []).includes(known),
                    ),
                  )
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2>{text.hemispheres}</h2>
        <p className="admin-help">{text.hemispheresHelp}</p>
        <div className="admin-target-curation-options">
          <label className="admin-binary-field">
            <input
              type="checkbox"
              checked={Boolean(draft.visibleFromNorthernHemisphere)}
              disabled
            />
            <span>{text.northernHemisphere}</span>
          </label>
          <label className="admin-binary-field">
            <input
              type="checkbox"
              checked={Boolean(draft.visibleFromSouthernHemisphere)}
              disabled
            />
            <span>{text.southernHemisphere}</span>
          </label>
        </div>
      </section>

      <ObservingGuideFields
        target={draft}
        editorial={draft.editorial}
        onChange={(editorial) => update("editorial", editorial)}
        text={text}
      />

      <section>
        <h2>{text.images}</h2>
        <div className="admin-target-image-grid">
          <TargetImageEditor
            kind="dss"
            title={text.dss}
            entry={draft.dssImage}
            imageUrl={draft.dssThumbnailUrl}
            onChange={(dssImage) => update("dssImage", dssImage)}
            text={text}
          />
          <TargetImageEditor
            kind="premium"
            title={text.premium}
            entry={draft.premiumImage}
            imageUrl={draft.premiumThumbnailUrl}
            onChange={(premiumImage) => update("premiumImage", premiumImage)}
            text={text}
          />
          <TargetImageEditor
            kind="visual"
            title={text.visual}
            entry={draft.visualImage}
            imageUrl={draft.visualThumbnailUrl}
            onChange={(visualImage) => update("visualImage", visualImage)}
            text={text}
          />
          <TargetImageEditor
            kind="visualPreview"
            title={text.visualPreview}
            entry={draft.visualPreviewImage}
            imageUrl={draft.visualPreviewThumbnailUrl}
            onChange={(visualPreviewImage) =>
              update("visualPreviewImage", visualPreviewImage)
            }
            text={text}
          />
        </div>
      </section>

      <EditorialProfileFields
        editorial={draft.editorial}
        onChange={(editorial) => update("editorial", editorial)}
        text={text}
      />

      <section>
        <details className="admin-target-source-record">
          <summary>{text.editorialRaw}</summary>
          <pre>{prettyJson(draft.editorial)}</pre>
        </details>
        <details className="admin-target-source-record">
          <summary>{text.sourceRecord}</summary>
          <pre>{prettyJson(draft.source)}</pre>
        </details>
      </section>

      <footer className="admin-actions">
        <p role="status">{status}</p>
        <button className="btn-primary" type="submit">
          {text.save}
        </button>
      </footer>
    </form>
  );
}

function TargetList({ locale, onEdit }) {
  const text = copyFor(copy, locale, "TargetLibrary.copy");
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState("");
  const [type, setType] = useState("");
  const [selection, setSelection] = useState("");
  const [hemisphere, setHemisphere] = useState("");
  const [season, setSeason] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const parameters = new URLSearchParams({
      locale,
      limit: "48",
      offset: String(offset),
    });
    if (query.trim()) parameters.set("q", query.trim());
    if (catalogue) parameters.set("catalogue", catalogue);
    if (type) parameters.set("type", type);
    if (selection) parameters.set("selection", selection);
    if (hemisphere) parameters.set("hemisphere", hemisphere);
    if (season) parameters.set("season", season);
    fetch(`/api/admin/target-library?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || text.loadError);
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setResult(data);
          setError("");
        }
      })
      .catch((reason) => !cancelled && setError(reason.message));
    return () => {
      cancelled = true;
    };
  }, [
    catalogue,
    hemisphere,
    locale,
    offset,
    query,
    season,
    selection,
    text.loadError,
    type,
  ]);

  const changeQuery = (value) => {
    setQuery(value);
    setOffset(0);
  };
  const changeSelection = (value) => {
    setSelection(value);
    setOffset(0);
  };
  const changeCatalogue = (value) => {
    setCatalogue(value);
    setOffset(0);
  };
  const changeType = (value) => {
    setType(value);
    setOffset(0);
  };
  const changeHemisphere = (value) => {
    setHemisphere(value);
    if (!value) setSeason("");
    setOffset(0);
  };
  const changeSeason = (value) => {
    setSeason(value);
    setOffset(0);
  };
  const counts = result?.counts || { total: 0, best: 0, extended: 0 };
  const countsUnfiltered = result?.countsUnfiltered || null;
  const entries = result?.entries || [];
  const catalogueOptions = result?.catalogueOptions || [];
  const typeOptions = result?.typeOptions || [];
  // Whether any of the catalogue's optional facetable filters is active
  // (the trigger for an "x/n" display) — the same dimensions the server's
  // facets read, minus `favorites`, which this admin screen has no equivalent
  // of.
  const hasActiveFilter = hasActiveFacetFilter([
    query.trim(),
    catalogue,
    type,
    selection,
    hemisphere,
    season,
  ]);
  const numberFormat = new Intl.NumberFormat(locale);
  // `count`/`total` faceted counters: a plain, formatted number while no
  // filter is active, `count/total` once one is. `total` missing (an admin
  // screen talking to a portal predating the fix) falls back to the plain
  // count. Shared
  // with the planner's own Catalogue view through
  // `portal/target-catalogue-counters.js` so the two never read the same
  // server contract two slightly different ways.
  const counterLabel = (count, total) =>
    facetedCounterLabel(count, total, hasActiveFilter, (value) =>
      numberFormat.format(value),
    );

  return (
    <section className="admin-library admin-target-library">
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <p>{text.help}</p>
        </div>
      </header>
      <div className="admin-target-summary" aria-label={text.title}>
        <article>
          <strong>{counterLabel(counts.total, countsUnfiltered?.total)}</strong>
          <span>{text.total}</span>
        </article>
        <article>
          <strong>{counterLabel(counts.best, countsUnfiltered?.best)}</strong>
          <span>{text.core}</span>
        </article>
        <article>
          <strong>
            {counterLabel(counts.extended, countsUnfiltered?.extended)}
          </strong>
          <span>{text.broad}</span>
        </article>
      </div>
      <div className="admin-library-controls admin-target-controls">
        <label className="admin-reference-search">
          <span>{text.search}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={text.search}
          />
        </label>
        <label className="admin-field">
          <span>{message(locale, "plannerTargetCatalogueFilter")}</span>
          <select
            value={catalogue}
            onChange={(event) => changeCatalogue(event.target.value)}
          >
            <option value="">
              {message(locale, "plannerTargetCatalogueAll")}
            </option>
            {catalogueOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.name} ({counterLabel(option.count, option.total)})
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{message(locale, "plannerTargetCatalogueType")}</span>
          <select
            value={type}
            onChange={(event) => changeType(event.target.value)}
          >
            <option value="">
              {message(locale, "plannerTargetCatalogueAllTypes")}
            </option>
            {typeOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.name} ({counterLabel(option.count, option.total)})
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{text.curation}</span>
          <select
            value={selection}
            onChange={(event) => changeSelection(event.target.value)}
          >
            <option value="">{text.all}</option>
            <option value="best">{text.best}</option>
            <option value="extended">{text.extended}</option>
          </select>
        </label>
        <label className="admin-field">
          <span>{message(locale, "plannerTargetCatalogueHemisphere")}</span>
          <select
            value={hemisphere}
            onChange={(event) => changeHemisphere(event.target.value)}
          >
            <option value="">
              {message(locale, "plannerTargetCatalogueAllHemispheres")}
            </option>
            <option value="north">
              {message(locale, "plannerTargetCatalogueNorthernHemisphere")}
            </option>
            <option value="south">
              {message(locale, "plannerTargetCatalogueSouthernHemisphere")}
            </option>
          </select>
        </label>
        <label className="admin-field">
          <span>{message(locale, "plannerTargetCatalogueSeason")}</span>
          <select
            value={season}
            disabled={!hemisphere}
            onChange={(event) => changeSeason(event.target.value)}
          >
            <option value="">
              {message(locale, "plannerTargetCatalogueAllSeasons")}
            </option>
            {[
              ["winter", "seasonWinter"],
              ["spring", "seasonSpring"],
              ["summer", "seasonSummer"],
              ["autumn", "seasonAutumn"],
            ].map(([value, label]) => (
              <option value={value} key={value}>
                {message(locale, label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="admin-target-results">
        {error || text.results(entries.length, result?.total || 0)}
      </p>
      {entries.length ? (
        <div className="admin-target-list" role="list">
          {entries.map((entry) => {
            const magnitude = finiteNumber(entry.magnitude);
            const descriptions = Array.isArray(entry.storyParagraphs)
              ? entry.storyParagraphs.filter(Boolean)
              : [];
            return (
              <article key={entry.id} role="listitem">
                <div className="admin-target-list-image">
                  {entry.photoThumbnailUrl ? (
                    <img src={entry.photoThumbnailUrl} alt="" />
                  ) : (
                    <span>{text.dssFallback}</span>
                  )}
                </div>
                <div className="admin-target-list-copy">
                  <h3>{entry.title}</h3>
                  <p>
                    {[entry.type, entry.constellation]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <small>{entry.id}</small>
                  {descriptions.length > 0 && (
                    <div className="admin-target-list-description">
                      {descriptions.map((paragraph, index) => (
                        <p key={`${entry.id}-${index}`}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="admin-target-list-details">
                  <div className="admin-target-list-properties">
                    {magnitude !== null && (
                      <span>
                        {text.magnitude}{" "}
                        {new Intl.NumberFormat(locale, {
                          maximumFractionDigits: 2,
                        }).format(magnitude)}
                      </span>
                    )}
                    {entry.apparentSizeLabel && (
                      <span>
                        {text.apparentSize} {entry.apparentSizeLabel}
                      </span>
                    )}
                  </div>
                  <div className="admin-target-tags">
                    {entry.isBest && (
                      <span className="is-best">{text.selected}</span>
                    )}
                    {entry.isExtended && <span>{text.extendedTag}</span>}
                    {entry.visibleFromNorthernHemisphere && (
                      <span className="is-hemisphere">{text.northernTag}</span>
                    )}
                    {entry.visibleFromSouthernHemisphere && (
                      <span className="is-hemisphere">{text.southernTag}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-icon-action"
                  aria-label={`${text.edit} ${entry.title}`}
                  title={text.edit}
                  onClick={() => onEdit(entry.id)}
                >
                  <PencilIcon />
                </button>
              </article>
            );
          })}
        </div>
      ) : !error ? (
        <p className="admin-target-empty">{text.noResult}</p>
      ) : null}
      <footer className="admin-target-pagination">
        <button
          type="button"
          className="btn-tertiary"
          disabled={!offset}
          onClick={() => setOffset((current) => Math.max(0, current - 48))}
        >
          {text.previous}
        </button>
        <button
          type="button"
          className="btn-tertiary"
          disabled={!result || offset + entries.length >= result.total}
          onClick={() => setOffset((current) => current + 48)}
        >
          {text.next}
        </button>
      </footer>
    </section>
  );
}

export function TargetLibrary({ locale = "fr", itemId = null, onNavigate }) {
  return itemId ? (
    <TargetEditor
      locale={locale}
      id={itemId}
      onClose={() => onNavigate(null)}
    />
  ) : (
    <TargetList locale={locale} onEdit={(id) => onNavigate(id)} />
  );
}
