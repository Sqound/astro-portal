"use client";

import { copyFor } from "astro-contracts/locales";
import { useMemo, useState } from "react";
import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { normalizeSearch } from "portal/i18n.js";
import { GENERIC_TAG_WORDS } from "../../captures/generic-tags.js";
import { localizedTag as sharedLocalizedTag } from "../gallery/gallery-tags.js";
import { PencilIcon, TrashIcon } from "portal/components/admin/AdminIcons.js";

const DATE_LOCALES = {
  ja: "ja-JP",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  "pt-BR": "pt-BR",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  ru: "ru-RU",
};
const russianPlural = (count, [one, few, many]) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const imageLabel = (text, count, locale) => {
  const singular = text.image;
  if (locale === "ru") {
    return russianPlural(count, ["изображение", "изображения", "изображений"]);
  }
  if (locale === "ja" || locale === "zh-Hans" || locale === "zh-Hant") {
    return singular;
  }
  return count > 1 ? text.imagePlural : singular;
};
const previewFor = (record, assets) => {
  const requested = record.featuredBaseName || record.assetBaseNames?.[0];
  return (
    assets.find((asset) => asset.baseName === requested)?.imageUrl ||
    assets.find((asset) => asset.ownerId === record.id)?.imageUrl ||
    null
  );
};
const titleFor = (record, locale) =>
  record.content?.[locale]?.title || record.title;
const assetCountFor = (record, assets) =>
  assets.filter(
    (asset) =>
      asset.ownerId === record.id ||
      record.assetBaseNames?.includes(asset.baseName),
  ).length;
const latestAssetDateFor = (record, assets) =>
  assets
    .filter(
      (asset) =>
        asset.ownerId === record.id ||
        record.assetBaseNames?.includes(asset.baseName),
    )
    .map((asset) => asset.baseName.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || "")
    .sort()
    .at(-1) || "";
// The generic words read through the one vocabulary
// (`gallery/gallery-tags.js`); any other word is a taxonomy key.
const localizedTag = (tag, locale) =>
  GENERIC_TAG_WORDS.includes(tag)
    ? sharedLocalizedTag(tag, locale)
    : taxonomyLabel(tag, locale);
const searchableCaptureText = (record) =>
  [
    record.id,
    record.title,
    ...Object.values(record.content || {}).map((content) => content?.title),
    ...(record.objects || []),
    ...(record.tags || []),
    record.category,
    record.skyTarget?.type,
    record.skyTarget?.constellation,
  ]
    .filter(Boolean)
    .join(" ");

const copy = {
  fr: {
    eyebrow: "CATALOGUE",
    archivesTitle: "Archives des captures",
    title: "Captures",
    archivedHelp:
      "Les fiches retirées du catalogue restent récupérables pendant 30 jours.",
    help: "Préparez les fiches et images présentées dans la galerie.",
    view: "Voir les captures",
    archives: "Archives",
    create: "Nouvelle capture",
    preview: "Aperçu",
    capture: "Capture",
    object: "Objet / type",
    images: "Images",
    actions: "Actions",
    archivedOn: "Archivée le",
    uncategorized: "Sans catégorie",
    image: "image",
    imagePlural: "images",
    restore: "Restaurer",
    edit: "Éditer",
    delete: "Supprimer (archive 30 jours)",
    emptyArchives: "Aucune capture archivée.",
    empty: "Aucune capture ne correspond à cette vue.",
    all: "Toutes",
    search: "Rechercher",
    searchCaptures: "Rechercher une capture",
    sort: "Trier",
    sortDateNewest: "Date : récentes d’abord",
    sortDateOldest: "Date : anciennes d’abord",
    sortImagesFewest: "Images : croissant",
    sortImagesMost: "Images : décroissant",
    results: (visible, total) => `${visible} / ${total} captures`,
  },
  en: {
    eyebrow: "CATALOGUE",
    archivesTitle: "Archived captures",
    title: "Captures",
    archivedHelp: "Removed catalogue entries remain recoverable for 30 days.",
    help: "Prepare the records and images shown in the gallery.",
    view: "View captures",
    archives: "Archives",
    create: "New capture",
    preview: "Preview",
    capture: "Capture",
    object: "Object / type",
    images: "Images",
    actions: "Actions",
    archivedOn: "Archived on",
    uncategorized: "Uncategorized",
    image: "image",
    imagePlural: "images",
    restore: "Restore",
    edit: "Edit",
    delete: "Delete (archive for 30 days)",
    emptyArchives: "No archived captures.",
    empty: "No captures match this view.",
    all: "All",
    search: "Search",
    searchCaptures: "Search captures",
    sort: "Sort",
    sortDateNewest: "Date: newest first",
    sortDateOldest: "Date: oldest first",
    sortImagesFewest: "Images: fewest first",
    sortImagesMost: "Images: most first",
    results: (visible, total) => `${visible} / ${total} captures`,
  },
  ja: {
    eyebrow: "カタログ",
    archivesTitle: "撮影のアーカイブ",
    title: "撮影",
    archivedHelp: "カタログから外した項目は30日間復元できます。",
    help: "ギャラリーに表示する撮影記録と画像を準備します。",
    view: "撮影一覧",
    archives: "アーカイブ",
    create: "新しい撮影",
    preview: "プレビュー",
    capture: "撮影",
    object: "天体 / 種類",
    images: "画像",
    actions: "操作",
    archivedOn: "アーカイブ日",
    uncategorized: "カテゴリなし",
    image: "画像",
    imagePlural: "画像",
    restore: "復元",
    edit: "編集",
    delete: "削除（30日間アーカイブ）",
    emptyArchives: "アーカイブされた撮影はありません。",
    empty: "この表示に一致する撮影はありません。",
    all: "すべて",
    search: "検索",
    searchCaptures: "撮影を検索",
    sort: "並べ替え",
    sortDateNewest: "日付：新しい順",
    sortDateOldest: "日付：古い順",
    sortImagesFewest: "画像：少ない順",
    sortImagesMost: "画像：多い順",
    results: (visible, total) => `${visible} / ${total} 件`,
  },
  de: {
    eyebrow: "KATALOG",
    archivesTitle: "Archivierte Aufnahmen",
    title: "Aufnahmen",
    archivedHelp:
      "Aus dem Katalog entfernte Einträge lassen sich 30 Tage lang wiederherstellen.",
    help: "Bereite die Einträge und Bilder vor, die in der Galerie gezeigt werden.",
    view: "Aufnahmen ansehen",
    archives: "Archiv",
    create: "Neue Aufnahme",
    preview: "Vorschau",
    capture: "Aufnahme",
    object: "Objekt / Typ",
    images: "Bilder",
    actions: "Aktionen",
    archivedOn: "Archiviert am",
    uncategorized: "Ohne Kategorie",
    image: "Bild",
    imagePlural: "Bilder",
    restore: "Wiederherstellen",
    edit: "Bearbeiten",
    delete: "Löschen (30 Tage archiviert)",
    emptyArchives: "Keine archivierte Aufnahme.",
    empty: "Keine Aufnahme entspricht dieser Ansicht.",
    all: "Alle",
    search: "Suchen",
    searchCaptures: "Aufnahme suchen",
    sort: "Sortieren",
    sortDateNewest: "Datum: neueste zuerst",
    sortDateOldest: "Datum: älteste zuerst",
    sortImagesFewest: "Bilder: aufsteigend",
    sortImagesMost: "Bilder: absteigend",
    results: (visible, total) => `${visible} / ${total} Aufnahmen`,
  },
  es: {
    eyebrow: "CATÁLOGO",
    archivesTitle: "Capturas archivadas",
    title: "Capturas",
    archivedHelp:
      "Las fichas retiradas del catálogo se pueden recuperar durante 30 días.",
    help: "Prepare las fichas y las imágenes mostradas en la galería.",
    view: "Ver las capturas",
    archives: "Archivadas",
    create: "Nueva captura",
    preview: "Vista previa",
    capture: "Captura",
    object: "Objeto / tipo",
    images: "Imágenes",
    actions: "Acciones",
    archivedOn: "Archivada el",
    uncategorized: "Sin categoría",
    image: "imagen",
    imagePlural: "imágenes",
    restore: "Restaurar",
    edit: "Editar",
    delete: "Eliminar (archivada 30 días)",
    emptyArchives: "Ninguna captura archivada.",
    empty: "Ninguna captura coincide con esta vista.",
    all: "Todas",
    search: "Buscar",
    searchCaptures: "Buscar una captura",
    sort: "Ordenar",
    sortDateNewest: "Fecha: más recientes primero",
    sortDateOldest: "Fecha: más antiguas primero",
    sortImagesFewest: "Imágenes: de menos a más",
    sortImagesMost: "Imágenes: de más a menos",
    results: (visible, total) => `${visible} / ${total} capturas`,
  },
  it: {
    eyebrow: "CATALOGO",
    archivesTitle: "Archivio delle riprese",
    title: "Riprese",
    archivedHelp:
      "Le schede tolte dal catalogo restano recuperabili per 30 giorni.",
    help: "Prepara le schede e le immagini mostrate nella galleria.",
    view: "Vedere le riprese",
    archives: "Archivio",
    create: "Nuova ripresa",
    preview: "Anteprima",
    capture: "Ripresa",
    object: "Oggetto / tipo",
    images: "Immagini",
    actions: "Azioni",
    archivedOn: "Archiviata il",
    uncategorized: "Senza categoria",
    image: "immagine",
    imagePlural: "immagini",
    restore: "Ripristinare",
    edit: "Modificare",
    delete: "Eliminare (archivio di 30 giorni)",
    emptyArchives: "Nessuna ripresa archiviata.",
    empty: "Nessuna ripresa corrisponde a questa vista.",
    all: "Tutte",
    search: "Cercare",
    searchCaptures: "Cercare una ripresa",
    sort: "Ordinare",
    sortDateNewest: "Data: prima le più recenti",
    sortDateOldest: "Data: prima le meno recenti",
    sortImagesFewest: "Immagini: crescente",
    sortImagesMost: "Immagini: decrescente",
    results: (visible, total) => `${visible} / ${total} riprese`,
  },
  "pt-BR": {
    eyebrow: "CATÁLOGO",
    archivesTitle: "Capturas arquivadas",
    title: "Capturas",
    archivedHelp:
      "As fichas retiradas do catálogo podem ser recuperadas por 30 dias.",
    help: "Prepare as fichas e as imagens exibidas na galeria.",
    view: "Ver as capturas",
    archives: "Arquivo",
    create: "Nova captura",
    preview: "Prévia",
    capture: "Captura",
    object: "Objeto / tipo",
    images: "Imagens",
    actions: "Ações",
    archivedOn: "Arquivada em",
    uncategorized: "Sem categoria",
    image: "imagem",
    imagePlural: "imagens",
    restore: "Restaurar",
    edit: "Editar",
    delete: "Excluir (arquivada por 30 dias)",
    emptyArchives: "Nenhuma captura arquivada.",
    empty: "Nenhuma captura corresponde a esta visualização.",
    all: "Todas",
    search: "Pesquisar",
    searchCaptures: "Pesquisar uma captura",
    sort: "Ordenar",
    sortDateNewest: "Data: mais recentes primeiro",
    sortDateOldest: "Data: mais antigas primeiro",
    sortImagesFewest: "Imagens: crescente",
    sortImagesMost: "Imagens: decrescente",
    results: (visible, total) => `${visible} / ${total} capturas`,
  },
  "zh-Hans": {
    eyebrow: "星表",
    archivesTitle: "已归档的拍摄",
    title: "拍摄",
    archivedHelp: "从星表中移除的条目可在30天内恢复。",
    help: "准备图库中展示的记录和图片。",
    view: "查看拍摄",
    archives: "归档",
    create: "新建拍摄",
    preview: "预览",
    capture: "拍摄",
    object: "天体 / 类型",
    images: "图片",
    actions: "操作",
    archivedOn: "归档于",
    uncategorized: "未分类",
    image: "图片",
    imagePlural: "图片",
    restore: "恢复",
    edit: "编辑",
    delete: "删除（归档30天）",
    emptyArchives: "没有已归档的拍摄。",
    empty: "没有符合当前视图的拍摄。",
    all: "全部",
    search: "搜索",
    searchCaptures: "搜索拍摄",
    sort: "排序",
    sortDateNewest: "日期：由新到旧",
    sortDateOldest: "日期：由旧到新",
    sortImagesFewest: "图片：由少到多",
    sortImagesMost: "图片：由多到少",
    results: (visible, total) => `${visible} / ${total} 条拍摄`,
  },
  "zh-Hant": {
    eyebrow: "星表",
    archivesTitle: "已封存的拍攝",
    title: "拍攝",
    archivedHelp: "從星表移除的項目可在 30 天內還原。",
    help: "準備圖庫中顯示的記錄與圖片。",
    view: "檢視拍攝",
    archives: "封存",
    create: "新增拍攝",
    preview: "預覽",
    capture: "拍攝",
    object: "天體／類型",
    images: "圖片",
    actions: "操作",
    archivedOn: "封存於",
    uncategorized: "未分類",
    image: "圖片",
    imagePlural: "圖片",
    restore: "還原",
    edit: "編輯",
    delete: "刪除（封存 30 天）",
    emptyArchives: "沒有已封存的拍攝。",
    empty: "沒有符合此檢視的拍攝。",
    all: "全部",
    search: "搜尋",
    searchCaptures: "搜尋拍攝",
    sort: "排序",
    sortDateNewest: "日期：由新到舊",
    sortDateOldest: "日期：由舊到新",
    sortImagesFewest: "圖片：由少到多",
    sortImagesMost: "圖片：由多到少",
    results: (visible, total) => `${visible} / ${total} 筆拍攝`,
  },
  ru: {
    eyebrow: "КАТАЛОГ",
    archivesTitle: "Архив съёмок",
    title: "Съёмки",
    archivedHelp:
      "Удалённые из каталога записи можно восстановить в течение 30 дней.",
    help: "Подготовьте записи и изображения, которые показываются в галерее.",
    view: "Показать съёмки",
    archives: "Архив",
    create: "Новая съёмка",
    preview: "Предпросмотр",
    capture: "Съёмка",
    object: "Объект / тип",
    images: "Изображения",
    actions: "Действия",
    archivedOn: "Архивирована",
    uncategorized: "Без категории",
    image: "изображение",
    imagePlural: "изображений",
    restore: "Восстановить",
    edit: "Редактировать",
    delete: "Удалить (архив на 30 дней)",
    emptyArchives: "В архиве нет съёмок.",
    empty: "В этом представлении съёмок нет.",
    all: "Все",
    search: "Поиск",
    searchCaptures: "Поиск съёмок",
    sort: "Сортировка",
    sortDateNewest: "Дата: сначала новые",
    sortDateOldest: "Дата: сначала старые",
    sortImagesFewest: "Изображения: сначала меньше",
    sortImagesMost: "Изображения: сначала больше",
    results: (visible, total) =>
      `${visible} / ${total} ${russianPlural(total, ["съёмка", "съёмки", "съёмок"])}`,
  },
};

export function CaptureLibrary({
  records,
  assets,
  archives,
  showArchives,
  onShowArchives,
  onCreate,
  onEdit,
  onArchive,
  onRestore,
  locale = "fr",
}) {
  const text = copyFor(copy, locale, "CaptureLibrary.copy");
  const items = showArchives ? archives : records;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("date-desc");
  const tags = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => {
            const record = showArchives ? item.record : item;
            return record.tags || [];
          }),
        ),
      ].sort((left, right) => left.localeCompare(right, locale)),
    [items, locale, showArchives],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeSearch(query, locale);
    return [...items]
      .filter((item) => {
        const record = showArchives ? item.record : item;
        return (
          (!tag || record.tags?.includes(tag)) &&
          (!normalizedQuery ||
            normalizeSearch(searchableCaptureText(record), locale).includes(
              normalizedQuery,
            ))
        );
      })
      .sort((left, right) => {
        const leftRecord = showArchives ? left.record : left;
        const rightRecord = showArchives ? right.record : right;
        if (sort.startsWith("images")) {
          const byImages =
            assetCountFor(leftRecord, assets) -
            assetCountFor(rightRecord, assets);
          if (byImages) return sort === "images-asc" ? byImages : -byImages;
        }
        const byDate = latestAssetDateFor(rightRecord, assets).localeCompare(
          latestAssetDateFor(leftRecord, assets),
        );
        if (byDate) return sort === "date-asc" ? -byDate : byDate;
        return titleFor(leftRecord, locale).localeCompare(
          titleFor(rightRecord, locale),
          locale,
        );
      });
  }, [assets, items, locale, query, showArchives, sort, tag]);
  return (
    <section className="admin-library" aria-label={text.title}>
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{showArchives ? text.archivesTitle : text.title}</h2>
          <p>{showArchives ? text.archivedHelp : text.help}</p>
        </div>
        <div className="admin-library-controls">
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setQuery("");
              setTag("");
              setSearchOpen(false);
              onShowArchives(!showArchives);
            }}
          >
            {showArchives ? text.view : text.archives}
          </button>
          {!showArchives && (
            <button type="button" className="btn-primary" onClick={onCreate}>
              {text.create}
            </button>
          )}
        </div>
      </header>
      <div className="admin-capture-filters">
        <div className="filters">
          {["", ...tags].map((candidate) => (
            <button
              className={`filter-tag${candidate === tag ? " is-active" : ""}`}
              key={candidate || "all"}
              type="button"
              onClick={() => setTag(candidate)}
            >
              {candidate ? localizedTag(candidate, locale) : text.all}
            </button>
          ))}
        </div>
        <div className={`search-control${searchOpen ? " is-open" : ""}`}>
          <button
            className="search-toggle"
            type="button"
            aria-label={text.search}
            title={text.search}
            onClick={() => setSearchOpen((value) => !value)}
          >
            ⌕
          </button>
          <input
            aria-label={text.searchCaptures}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.search}
          />
        </div>
        <div className="admin-capture-sort">
          <select
            aria-label={text.sort}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="date-desc">{text.sortDateNewest}</option>
            <option value="date-asc">{text.sortDateOldest}</option>
            <option value="images-asc">{text.sortImagesFewest}</option>
            <option value="images-desc">{text.sortImagesMost}</option>
          </select>
          <span aria-hidden="true">⌄</span>
        </div>
        <output className="admin-capture-filter-count" aria-live="polite">
          {text.results(filteredItems.length, items.length)}
        </output>
      </div>
      <div className="admin-capture-table" role="table">
        <div className="admin-capture-table-head" role="row">
          <span>{text.preview}</span>
          <span>{text.capture}</span>
          <span>{text.object}</span>
          <span>{text.images}</span>
          <span>{text.actions}</span>
        </div>
        {filteredItems.map((item) => {
          const record = showArchives ? item.record : item;
          const imageUrl = previewFor(record, assets);
          const title = titleFor(record, locale);
          const assetCount = assetCountFor(record, assets);
          return (
            <article
              className="admin-capture-row"
              role="row"
              key={showArchives ? item.record.id : record.id}
            >
              <div className="admin-capture-thumb">
                {imageUrl ? <img src={imageUrl} alt="" /> : <span>—</span>}
              </div>
              <div>
                <strong title={title}>{title}</strong>
                <small title={record.id}>{record.id}</small>
                {showArchives && (
                  <small>
                    {text.archivedOn}{" "}
                    {new Date(item.archivedAt).toLocaleDateString(
                      DATE_LOCALES[locale] || "fr-FR",
                    )}
                  </small>
                )}
              </div>
              <div>
                <strong title={(record.objects || []).join(", ") || "—"}>
                  {(record.objects || []).join(", ") || "—"}
                </strong>
                <small>
                  {record.category
                    ? taxonomyLabel(record.category, locale)
                    : record.skyTarget?.type
                      ? taxonomyLabel(record.skyTarget.type, locale)
                      : text.uncategorized}
                </small>
              </div>
              <div>
                <strong>{assetCount}</strong>
                <small>{imageLabel(text, assetCount, locale)}</small>
              </div>
              <div className="admin-inline-actions">
                {showArchives ? (
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() => onRestore(item.record.id)}
                  >
                    {text.restore}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="admin-icon-action"
                      aria-label={`${text.edit} ${title}`}
                      title={text.edit}
                      onClick={() => onEdit(record)}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-action admin-delete-action"
                      aria-label={`${text.delete} ${title}`}
                      title={text.delete}
                      onClick={() => onArchive(record)}
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {!filteredItems.length && (
          <p className="admin-empty">
            {showArchives ? text.emptyArchives : text.empty}
          </p>
        )}
      </div>
    </section>
  );
}
