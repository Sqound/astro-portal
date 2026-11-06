"use client";

import { copyFor } from "astro-contracts/locales";
import { useMemo, useState } from "react";
import {
  captureCategories,
  constellations,
  objectTypes,
  taxonomyLabel,
} from "astro-core/catalog-taxonomy.js";
import { normalizeSearch } from "portal/i18n.js";

const copy = {
  fr: {
    eyebrow: "RÉFÉRENTIELS",
    title: "Données fixes",
    help: "Valeurs contrôlées utilisées par les fiches de capture, les filtres et la carte du ciel.",
    readOnly:
      "Lecture seule — ces valeurs sont versionnées avec l’application pour préserver la cohérence du catalogue.",
    stableValue: "Valeur stable",
    english: "Anglais",
    japanese: "Japonais",
    categories: "Catégories de capture",
    categoriesHelp:
      "Elles structurent la présentation publique d’une prise de vue.",
    types: "Types d’objet",
    typesHelp: "Ils décrivent la nature astronomique de la cible.",
    constellations: "Constellations",
    constellationsHelp:
      "La valeur française est conservée dans le catalogue ; les autres colonnes sont les libellés affichés.",
    search: "Rechercher une constellation",
    results: (visible, total) => `${visible} / ${total} constellations`,
    noResult: "Aucune constellation ne correspond à cette recherche.",
  },
  en: {
    eyebrow: "REFERENCE DATA",
    title: "Fixed data",
    help: "Controlled values used by capture records, filters and the sky map.",
    readOnly:
      "Read-only — these values are versioned with the application to keep the catalogue consistent.",
    stableValue: "Stable value",
    english: "English",
    japanese: "Japanese",
    categories: "Capture categories",
    categoriesHelp: "They structure the public presentation of a capture.",
    types: "Object types",
    typesHelp: "They describe the astronomical nature of a target.",
    constellations: "Constellations",
    constellationsHelp:
      "The French value is retained in the catalogue; the other columns are display labels.",
    search: "Search constellations",
    results: (visible, total) => `${visible} / ${total} constellations`,
    noResult: "No constellation matches this search.",
  },
  ja: {
    eyebrow: "固定データ",
    title: "固定データ",
    help: "撮影記録、フィルター、星図で使用する管理済みの値です。",
    readOnly:
      "読み取り専用 — カタログの一貫性を保つため、これらの値はアプリケーションとともにバージョン管理されます。",
    stableValue: "固定値",
    english: "英語",
    japanese: "日本語",
    categories: "撮影カテゴリー",
    categoriesHelp: "公開ページでの撮影の見せ方を整理します。",
    types: "天体の種類",
    typesHelp: "対象の天文学上の性質を示します。",
    constellations: "星座",
    constellationsHelp:
      "フランス語の値はカタログに保存され、他の列は表示名です。",
    search: "星座を検索",
    results: (visible, total) => `${visible} / ${total} 星座`,
    noResult: "該当する星座はありません。",
  },
  de: {
    eyebrow: "REFERENZDATEN",
    title: "Feste Daten",
    help: "Kontrollierte Werte, die von den Aufnahmeeinträgen, den Filtern und der Sternkarte verwendet werden.",
    readOnly:
      "Nur Lesezugriff – diese Werte sind mit der Anwendung versioniert, damit der Katalog konsistent bleibt.",
    stableValue: "Stabiler Wert",
    english: "Englisch",
    japanese: "Japanisch",
    categories: "Aufnahmekategorien",
    categoriesHelp: "Sie gliedern die öffentliche Darstellung einer Aufnahme.",
    types: "Objekttypen",
    typesHelp: "Sie beschreiben die astronomische Natur des Ziels.",
    constellations: "Sternbilder",
    constellationsHelp:
      "Der französische Wert wird im Katalog gespeichert; die übrigen Spalten sind die angezeigten Bezeichnungen.",
    search: "Sternbild suchen",
    results: (visible, total) => `${visible} / ${total} Sternbilder`,
    noResult: "Kein Sternbild entspricht dieser Suche.",
  },
  es: {
    eyebrow: "DATOS DE REFERENCIA",
    title: "Datos fijos",
    help: "Valores controlados que usan las fichas de captura, los filtros y el mapa del cielo.",
    readOnly:
      "Solo lectura — estos valores se versionan con la aplicación para preservar la coherencia del catálogo.",
    stableValue: "Valor estable",
    english: "Inglés",
    japanese: "Japonés",
    categories: "Categorías de captura",
    categoriesHelp: "Estructuran la presentación pública de una toma.",
    types: "Tipos de objeto",
    typesHelp: "Describen la naturaleza astronómica del objetivo.",
    constellations: "Constelaciones",
    constellationsHelp:
      "El valor en francés se conserva en el catálogo; las demás columnas son las etiquetas mostradas.",
    search: "Buscar una constelación",
    results: (visible, total) => `${visible} / ${total} constelaciones`,
    noResult: "Ninguna constelación coincide con esta búsqueda.",
  },
  it: {
    eyebrow: "DATI DI RIFERIMENTO",
    title: "Dati fissi",
    help: "Valori controllati usati dalle schede di ripresa, dai filtri e dalla mappa del cielo.",
    readOnly:
      "Sola lettura — questi valori sono versionati con l’applicazione per preservare la coerenza del catalogo.",
    stableValue: "Valore stabile",
    english: "Inglese",
    japanese: "Giapponese",
    categories: "Categorie di ripresa",
    categoriesHelp: "Strutturano la presentazione pubblica di una ripresa.",
    types: "Tipi di oggetto",
    typesHelp: "Descrivono la natura astronomica del target.",
    constellations: "Costellazioni",
    constellationsHelp:
      "Il valore francese è conservato nel catalogo; le altre colonne sono le etichette mostrate.",
    search: "Cercare una costellazione",
    results: (visible, total) => `${visible} / ${total} costellazioni`,
    noResult: "Nessuna costellazione corrisponde a questa ricerca.",
  },
  "pt-BR": {
    eyebrow: "REFERENCIAIS",
    title: "Dados fixos",
    help: "Valores controlados usados pelas fichas de captura, pelos filtros e pelo mapa celeste.",
    readOnly:
      "Somente leitura — esses valores são versionados com o aplicativo para preservar a coerência do catálogo.",
    stableValue: "Valor estável",
    english: "Inglês",
    japanese: "Japonês",
    categories: "Categorias de captura",
    categoriesHelp: "Elas estruturam a apresentação pública de uma captura.",
    types: "Tipos de objeto",
    typesHelp: "Descrevem a natureza astronômica do alvo.",
    constellations: "Constelações",
    constellationsHelp:
      "O valor em francês é mantido no catálogo; as outras colunas são os rótulos exibidos.",
    search: "Pesquisar uma constelação",
    results: (visible, total) => `${visible} / ${total} constelações`,
    noResult: "Nenhuma constelação corresponde a esta pesquisa.",
  },
  "zh-Hans": {
    eyebrow: "参考数据",
    title: "固定数据",
    help: "拍摄记录、筛选和星图所使用的受控取值。",
    readOnly: "只读 — 这些取值随应用一同进行版本管理，以保证星表的一致性。",
    stableValue: "固定值",
    english: "英语",
    japanese: "日语",
    categories: "拍摄类别",
    categoriesHelp: "用于组织一次拍摄的公开展示方式。",
    types: "天体类型",
    typesHelp: "描述目标的天文学属性。",
    constellations: "星座",
    constellationsHelp: "星表中保留的是法语取值；其余各列为显示用名称。",
    search: "搜索星座",
    results: (visible, total) => `${visible} / ${total} 个星座`,
    noResult: "没有与此搜索匹配的星座。",
  },
  "zh-Hant": {
    eyebrow: "參考資料",
    title: "固定資料",
    help: "拍攝記錄、篩選與星圖所使用的受控數值。",
    readOnly: "唯讀 — 這些數值隨應用程式一同進行版本管理，以確保星表的一致性。",
    stableValue: "固定值",
    english: "英語",
    japanese: "日語",
    categories: "拍攝類別",
    categoriesHelp: "用於組織一次拍攝的公開呈現方式。",
    types: "天體類型",
    typesHelp: "描述目標的天文學屬性。",
    constellations: "星座",
    constellationsHelp: "星表中保留的是法語數值；其餘各欄為顯示用名稱。",
    search: "搜尋星座",
    results: (visible, total) => `${visible} / ${total} 個星座`,
    noResult: "沒有符合此搜尋的星座。",
  },
  ru: {
    eyebrow: "СПРАВОЧНЫЕ ДАННЫЕ",
    title: "Фиксированные данные",
    help: "Контролируемые значения, которые используются в записях съёмки, фильтрах и карте неба.",
    readOnly:
      "Только чтение — эти значения версионируются вместе с приложением, чтобы каталог оставался согласованным.",
    stableValue: "Постоянное значение",
    english: "Английский",
    japanese: "Японский",
    categories: "Категории съёмки",
    categoriesHelp: "Определяют, как снимок представлен публично.",
    types: "Типы объектов",
    typesHelp: "Описывают астрономическую природу цели.",
    constellations: "Созвездия",
    constellationsHelp:
      "В каталоге хранится французское значение; остальные столбцы — отображаемые названия.",
    search: "Найти созвездие",
    results: (visible, total) => `${visible} / ${total} созвездий`,
    noResult: "Нет созвездий, подходящих под этот запрос.",
  },
};

function TaxonomyList({ values }) {
  return (
    <div className="admin-reference-taxonomy-list" role="list">
      {values.map((value) => (
        <article key={value} role="listitem">
          <strong>{value}</strong>
          <span>{taxonomyLabel(value, "en")}</span>
          <span lang="ja">{taxonomyLabel(value, "ja")}</span>
        </article>
      ))}
    </div>
  );
}

export function ReferenceLibrary({ locale = "fr" }) {
  const text = copyFor(copy, locale, "ReferenceLibrary.copy");
  const [query, setQuery] = useState("");
  const visibleConstellations = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return constellations;
    return constellations.filter((value) =>
      normalizeSearch(
        [value, taxonomyLabel(value, "en"), taxonomyLabel(value, "ja")].join(
          " ",
        ),
      ).includes(normalized),
    );
  }, [query]);

  return (
    <section className="admin-library admin-reference-library">
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <p>{text.help}</p>
        </div>
      </header>

      <p className="admin-reference-readonly">{text.readOnly}</p>

      <div className="admin-reference-summary" aria-label={text.title}>
        <article>
          <strong>{captureCategories.length}</strong>
          <span>{text.categories}</span>
        </article>
        <article>
          <strong>{objectTypes.length}</strong>
          <span>{text.types}</span>
        </article>
        <article>
          <strong>{constellations.length}</strong>
          <span>{text.constellations}</span>
        </article>
      </div>

      <div className="admin-reference-overview">
        <section className="admin-reference-section">
          <header>
            <div>
              <h3>{text.categories}</h3>
              <p>{text.categoriesHelp}</p>
            </div>
          </header>
          <TaxonomyList values={captureCategories} />
        </section>
        <section className="admin-reference-section">
          <header>
            <div>
              <h3>{text.types}</h3>
              <p>{text.typesHelp}</p>
            </div>
          </header>
          <TaxonomyList values={objectTypes} />
        </section>
      </div>

      <section className="admin-reference-section admin-reference-constellations">
        <header>
          <div>
            <h3>{text.constellations}</h3>
            <p>{text.constellationsHelp}</p>
          </div>
          <label className="admin-reference-search">
            <span>{text.search}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.search}
            />
          </label>
        </header>
        <p className="admin-reference-results">
          {text.results(visibleConstellations.length, constellations.length)}
        </p>
        {visibleConstellations.length ? (
          <div className="admin-reference-table" role="table">
            <div className="admin-reference-table-head" role="row">
              <span role="columnheader">{text.stableValue}</span>
              <span role="columnheader">{text.english}</span>
              <span role="columnheader">{text.japanese}</span>
            </div>
            {visibleConstellations.map((value) => (
              <div role="row" key={value}>
                <strong role="cell" data-label={text.stableValue}>
                  {value}
                </strong>
                <span role="cell" data-label={text.english}>
                  {taxonomyLabel(value, "en")}
                </span>
                <span role="cell" data-label={text.japanese} lang="ja">
                  {taxonomyLabel(value, "ja")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-reference-empty">{text.noResult}</p>
        )}
      </section>
    </section>
  );
}
