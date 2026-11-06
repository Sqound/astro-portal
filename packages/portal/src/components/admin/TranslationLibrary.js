"use client";

import { localeEntry, shippedLocales } from "astro-contracts/locales";
import { copyFor } from "astro-contracts/locales";
import { useMemo, useState } from "react";
import { messages } from "portal/i18n.js";
import { PencilIcon } from "portal/components/admin/AdminIcons.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";

// A BCP 47 tag of a language, with an optional script and region
// (`en`, `pt-BR`, `zh-Hans`): the shape of the registry's tags.
const localePattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/;
const keyPattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const copy = {
  fr: {
    eyebrow: "DICTIONNAIRE",
    title: "Traductions",
    help: "Gérez les langues de l’interface et adaptez chaque texte sans modifier le code.",
    active: "Langues actives",
    default: "Langue par défaut",
    save: "Enregistrer",
    saving: "Enregistrement…",
    saved: "Les langues et les traductions ont été enregistrées.",
    failed: "Enregistrement impossible.",
    tableHelp:
      "Double-cliquez une cellule pour la modifier. Les changements restent locaux jusqu’à l’enregistrement.",
    key: "Clé",
    addLanguage: "Ajouter une langue",
    languageCode: "Code",
    languageName: "Nom affiché",
    add: "Ajouter",
    cancel: "Annuler",
    rename: "Renommer",
    addKey: "Ajouter une clé",
    keyName: "Nom de la clé",
    newKeyPlaceholder: "nouveauTexteInterface",
    editCell: "Modifier cette traduction",
    invalidLanguage:
      "Utilisez un code de langue valide, par exemple es ou pt-BR.",
    duplicateLanguage: "Cette langue est déjà présente.",
    invalidKey:
      "Utilisez une clé en camelCase, commençant par une lettre, sans espace.",
    duplicateKey: "Cette clé existe déjà.",
    missing: "Traduction absente",
  },
  en: {
    eyebrow: "DICTIONARY",
    title: "Translations",
    help: "Manage interface languages and adapt every text without changing code.",
    active: "Enabled languages",
    default: "Default language",
    save: "Save",
    saving: "Saving…",
    saved: "Languages and translations were saved.",
    failed: "Unable to save changes.",
    tableHelp:
      "Double-click a cell to edit it. Changes remain local until you save them.",
    key: "Key",
    addLanguage: "Add language",
    languageCode: "Code",
    languageName: "Display name",
    add: "Add",
    cancel: "Cancel",
    rename: "Rename",
    addKey: "Add key",
    keyName: "Key name",
    newKeyPlaceholder: "newInterfaceText",
    editCell: "Edit this translation",
    invalidLanguage: "Use a valid language code, for example es or pt-BR.",
    duplicateLanguage: "This language already exists.",
    invalidKey:
      "Use a camelCase key beginning with a letter and without spaces.",
    duplicateKey: "This key already exists.",
    missing: "Missing translation",
  },
  ja: {
    eyebrow: "辞書",
    title: "翻訳",
    help: "コードを変更せず、画面の言語と各テキストを管理します。",
    active: "有効な言語",
    default: "既定の言語",
    save: "保存",
    saving: "保存中…",
    saved: "言語と翻訳を保存しました。",
    failed: "変更を保存できません。",
    tableHelp:
      "セルをダブルクリックして編集します。変更は保存するまでローカルに保持されます。",
    key: "キー",
    addLanguage: "言語を追加",
    languageCode: "コード",
    languageName: "表示名",
    add: "追加",
    cancel: "キャンセル",
    rename: "名前を変更",
    addKey: "キーを追加",
    keyName: "キー名",
    newKeyPlaceholder: "新しい画面テキスト",
    editCell: "この翻訳を編集",
    invalidLanguage:
      "es または pt-BR のような有効な言語コードを入力してください。",
    duplicateLanguage: "この言語はすでに存在します。",
    invalidKey:
      "先頭を英字にした、空白を含まない camelCase のキーを入力してください。",
    duplicateKey: "このキーはすでに存在します。",
    missing: "翻訳なし",
  },
  de: {
    eyebrow: "WÖRTERBUCH",
    title: "Übersetzungen",
    help: "Verwalte die Sprachen der Oberfläche und passe jeden Text an, ohne den Code zu ändern.",
    active: "Aktive Sprachen",
    default: "Standardsprache",
    save: "Speichern",
    saving: "Wird gespeichert …",
    saved: "Die Sprachen und Übersetzungen wurden gespeichert.",
    failed: "Speichern nicht möglich.",
    tableHelp:
      "Doppelklicke auf eine Zelle, um sie zu bearbeiten. Die Änderungen bleiben lokal, bis du speicherst.",
    key: "Schlüssel",
    addLanguage: "Sprache hinzufügen",
    languageCode: "Code",
    languageName: "Angezeigter Name",
    add: "Hinzufügen",
    cancel: "Abbrechen",
    rename: "Umbenennen",
    addKey: "Schlüssel hinzufügen",
    keyName: "Name des Schlüssels",
    newKeyPlaceholder: "neuerOberflaechenText",
    editCell: "Diese Übersetzung bearbeiten",
    invalidLanguage:
      "Verwende einen gültigen Sprachcode, zum Beispiel es oder pt-BR.",
    duplicateLanguage: "Diese Sprache ist bereits vorhanden.",
    invalidKey:
      "Verwende einen Schlüssel in camelCase, der mit einem Buchstaben beginnt und keine Leerzeichen enthält.",
    duplicateKey: "Dieser Schlüssel existiert bereits.",
    missing: "Übersetzung fehlt",
  },
  es: {
    eyebrow: "DICCIONARIO",
    title: "Traducciones",
    help: "Gestione los idiomas de la interfaz y adapte cada texto sin modificar el código.",
    active: "Idiomas activos",
    default: "Idioma predeterminado",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Se guardaron los idiomas y las traducciones.",
    failed: "No se pudo guardar.",
    tableHelp:
      "Haga doble clic en una celda para modificarla. Los cambios siguen siendo locales hasta que guarde.",
    key: "Clave",
    addLanguage: "Agregar un idioma",
    languageCode: "Código",
    languageName: "Nombre mostrado",
    add: "Agregar",
    cancel: "Cancelar",
    rename: "Renombrar",
    addKey: "Agregar una clave",
    keyName: "Nombre de la clave",
    newKeyPlaceholder: "nuevoTextoInterfaz",
    editCell: "Modificar esta traducción",
    invalidLanguage: "Usa un código de idioma válido, por ejemplo es o pt-BR.",
    duplicateLanguage: "Este idioma ya está presente.",
    invalidKey:
      "Usa una clave en camelCase, que empiece por una letra y sin espacios.",
    duplicateKey: "Esta clave ya existe.",
    missing: "Traducción ausente",
  },
  it: {
    eyebrow: "DIZIONARIO",
    title: "Traduzioni",
    help: "Gestisci le lingue dell’interfaccia e adatta ogni testo senza modificare il codice.",
    active: "Lingue attive",
    default: "Lingua predefinita",
    save: "Salvare",
    saving: "Salvataggio…",
    saved: "Le lingue e le traduzioni sono state salvate.",
    failed: "Impossibile salvare.",
    tableHelp:
      "Fai doppio clic su una cella per modificarla. Le modifiche restano locali fino al salvataggio.",
    key: "Chiave",
    addLanguage: "Aggiungere una lingua",
    languageCode: "Codice",
    languageName: "Nome visualizzato",
    add: "Aggiungere",
    cancel: "Annullare",
    rename: "Rinominare",
    addKey: "Aggiungere una chiave",
    keyName: "Nome della chiave",
    newKeyPlaceholder: "nuovoTestoInterfaccia",
    editCell: "Modificare questa traduzione",
    invalidLanguage: "Usa un codice di lingua valido, ad esempio es o pt-BR.",
    duplicateLanguage: "Questa lingua è già presente.",
    invalidKey:
      "Usa una chiave in camelCase, che inizi con una lettera e non contenga spazi.",
    duplicateKey: "Questa chiave esiste già.",
    missing: "Traduzione assente",
  },
  "pt-BR": {
    eyebrow: "DICIONÁRIO",
    title: "Traduções",
    help: "Gerencie os idiomas da interface e adapte cada texto sem alterar o código.",
    active: "Idiomas ativos",
    default: "Idioma padrão",
    save: "Salvar",
    saving: "Salvando…",
    saved: "Os idiomas e as traduções foram salvos.",
    failed: "Não foi possível salvar.",
    tableHelp:
      "Clique duas vezes em uma célula para editá-la. As alterações ficam locais até você salvar.",
    key: "Chave",
    addLanguage: "Adicionar um idioma",
    languageCode: "Código",
    languageName: "Nome exibido",
    add: "Adicionar",
    cancel: "Cancelar",
    rename: "Renomear",
    addKey: "Adicionar uma chave",
    keyName: "Nome da chave",
    newKeyPlaceholder: "novoTextoDaInterface",
    editCell: "Editar esta tradução",
    invalidLanguage: "Use um código de idioma válido, por exemplo es ou pt-BR.",
    duplicateLanguage: "Este idioma já existe.",
    invalidKey:
      "Use uma chave em camelCase, começando por uma letra, sem espaços.",
    duplicateKey: "Esta chave já existe.",
    missing: "Tradução ausente",
  },
  "zh-Hans": {
    eyebrow: "词典",
    title: "翻译",
    help: "无需修改代码，即可管理界面语言并调整每一条文本。",
    active: "已启用的语言",
    default: "默认语言",
    save: "保存",
    saving: "正在保存…",
    saved: "语言和翻译已保存。",
    failed: "无法保存更改。",
    tableHelp: "双击单元格即可编辑。在保存之前，更改仅保留在本地。",
    key: "键",
    addLanguage: "添加语言",
    languageCode: "代码",
    languageName: "显示名称",
    add: "添加",
    cancel: "取消",
    rename: "重命名",
    addKey: "添加键",
    keyName: "键名",
    newKeyPlaceholder: "newInterfaceText",
    editCell: "编辑此翻译",
    invalidLanguage: "请使用有效的语言代码，例如 es 或 pt-BR。",
    duplicateLanguage: "此语言已存在。",
    invalidKey: "请使用以字母开头、不含空格的 camelCase 键。",
    duplicateKey: "此键已存在。",
    missing: "缺少翻译",
  },
  "zh-Hant": {
    eyebrow: "辭典",
    title: "翻譯",
    help: "無需修改程式碼，即可管理介面語言並調整每一則文字。",
    active: "已啟用的語言",
    default: "預設語言",
    save: "儲存",
    saving: "正在儲存……",
    saved: "語言與翻譯已儲存。",
    failed: "無法儲存變更。",
    tableHelp: "按兩下儲存格即可編輯。在儲存之前，變更僅保留在本機。",
    key: "鍵",
    addLanguage: "新增語言",
    languageCode: "代碼",
    languageName: "顯示名稱",
    add: "新增",
    cancel: "取消",
    rename: "重新命名",
    addKey: "新增鍵",
    keyName: "鍵名",
    newKeyPlaceholder: "newInterfaceText",
    editCell: "編輯此翻譯",
    invalidLanguage: "請使用有效的語言代碼，例如 es 或 pt-BR。",
    duplicateLanguage: "此語言已存在。",
    invalidKey: "請使用以字母開頭、不含空格的 camelCase 鍵。",
    duplicateKey: "此鍵已存在。",
    missing: "缺少翻譯",
  },
  ru: {
    eyebrow: "СЛОВАРЬ",
    title: "Переводы",
    help: "Управляйте языками интерфейса и редактируйте любой текст без изменения кода.",
    active: "Включённые языки",
    default: "Язык по умолчанию",
    save: "Сохранить",
    saving: "Сохранение…",
    saved: "Языки и переводы сохранены.",
    failed: "Не удалось сохранить изменения.",
    tableHelp:
      "Дважды щёлкните ячейку, чтобы изменить её. Пока вы не сохраните, изменения остаются локальными.",
    key: "Ключ",
    addLanguage: "Добавить язык",
    languageCode: "Код",
    languageName: "Отображаемое название",
    add: "Добавить",
    cancel: "Отмена",
    rename: "Переименовать",
    addKey: "Добавить ключ",
    keyName: "Имя ключа",
    newKeyPlaceholder: "newInterfaceText",
    editCell: "Изменить этот перевод",
    invalidLanguage: "Укажите допустимый код языка, например es или pt-BR.",
    duplicateLanguage: "Этот язык уже есть.",
    invalidKey:
      "Используйте ключ в camelCase, начинающийся с буквы и без пробелов.",
    duplicateKey: "Такой ключ уже есть.",
    missing: "Перевод отсутствует",
  },
};

const csrfToken = () => csrfCookieValue();

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key);

export function TranslationLibrary({
  locale = "fr",
  locales,
  defaultLocale,
  localeNames = {},
  translationOverrides = {},
  customTranslationKeys = [],
  onSaved,
}) {
  const text = copyFor(copy, locale, "TranslationLibrary.copy");
  const [active, setActive] = useState(locales);
  const [fallback, setFallback] = useState(defaultLocale);
  const [configuredNames, setConfiguredNames] = useState(localeNames);
  const [overrides, setOverrides] = useState(translationOverrides);
  const [customKeys, setCustomKeys] = useState(customTranslationKeys);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [addLanguageOpen, setAddLanguageOpen] = useState(false);
  const [newLanguageCode, setNewLanguageCode] = useState("");
  const [newLanguageName, setNewLanguageName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [editingLocale, setEditingLocale] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const languageOptions = useMemo(
    () =>
      [
        ...new Set([
          ...shippedLocales(),
          ...Object.keys(configuredNames),
          ...active,
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    [active, configuredNames],
  );
  const keys = useMemo(
    () =>
      [
        ...new Set([
          ...Object.keys(messages.en),
          ...customKeys,
          ...Object.values(overrides).flatMap((entries) =>
            Object.keys(entries || {}),
          ),
        ]),
      ].sort(),
    [customKeys, overrides],
  );
  const languageName = (language) =>
    configuredNames[language] ||
    localeEntry(language)?.name ||
    language.toUpperCase();
  const cellValue = (language, key) => {
    if (hasOwn(overrides[language], key)) return overrides[language][key];
    return messages[language]?.[key] || "";
  };
  const markDirty = () => {
    setDirty(true);
    setStatus("");
  };
  const updateActive = (language) => {
    const next = active.includes(language)
      ? active.filter((entry) => entry !== language)
      : [...active, language];
    setActive(next);
    if (fallback === language && !next.includes(language))
      setFallback(next[0] || "");
    markDirty();
  };
  const addLanguage = () => {
    const code = newLanguageCode.trim();
    const name = newLanguageName.trim();
    if (!localePattern.test(code)) return setStatus(text.invalidLanguage);
    if (languageOptions.includes(code))
      return setStatus(text.duplicateLanguage);
    setActive((current) => [...current, code]);
    setConfiguredNames((current) => ({ ...current, [code]: name || code }));
    setNewLanguageCode("");
    setNewLanguageName("");
    setAddLanguageOpen(false);
    markDirty();
  };
  const addKey = () => {
    const key = newKey.trim();
    if (!keyPattern.test(key)) return setStatus(text.invalidKey);
    if (keys.includes(key)) return setStatus(text.duplicateKey);
    setCustomKeys((current) => [...current, key]);
    setNewKey("");
    markDirty();
  };
  const startCellEdit = (language, key) =>
    setEditingCell({ language, key, value: cellValue(language, key) });
  const commitCellEdit = () => {
    if (!editingCell) return;
    const { language, key, value } = editingCell;
    setOverrides((current) => ({
      ...current,
      [language]: { ...(current[language] || {}), [key]: value },
    }));
    setEditingCell(null);
    markDirty();
  };
  const save = async () => {
    setStatus(text.saving);
    try {
      const response = await fetch("/api/admin/locales", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({
          supportedLocales: active,
          defaultLocale: fallback,
          localeNames: configuredNames,
          translationOverrides: overrides,
          customTranslationKeys: customKeys,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || data.error || text.failed);
      setStatus(text.saved);
      setDirty(false);
      onSaved(data);
    } catch (error) {
      setStatus(error.message);
    }
  };
  return (
    <section className="admin-library admin-translation-library">
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <p>{text.help}</p>
        </div>
      </header>
      <section className="admin-locale-settings">
        <div className="admin-locale-settings-heading">
          <h3>{text.active}</h3>
          <button
            type="button"
            className="btn-primary admin-locale-save"
            disabled={!active.length || !active.includes(fallback) || !dirty}
            onClick={save}
          >
            {text.save}
          </button>
        </div>
        <div className="admin-locale-controls">
          <div className="admin-locale-options">
            {languageOptions.map((language) => (
              <div className="admin-locale-choice" key={language}>
                <label>
                  <input
                    type="checkbox"
                    checked={active.includes(language)}
                    onChange={() => updateActive(language)}
                  />
                  {editingLocale === language ? (
                    <input
                      aria-label={`${text.rename} ${languageName(language)}`}
                      autoFocus
                      value={configuredNames[language] || ""}
                      onBlur={() => setEditingLocale(null)}
                      onChange={(event) => {
                        setConfiguredNames((current) => ({
                          ...current,
                          [language]: event.target.value,
                        }));
                        markDirty();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape")
                          setEditingLocale(null);
                      }}
                    />
                  ) : (
                    <span>{languageName(language)}</span>
                  )}
                </label>
                <button
                  type="button"
                  className="admin-icon-action"
                  title={`${text.rename} ${languageName(language)}`}
                  aria-label={`${text.rename} ${languageName(language)}`}
                  onClick={() => setEditingLocale(language)}
                >
                  <PencilIcon />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-tertiary admin-add-locale-button"
              onClick={() => setAddLanguageOpen((current) => !current)}
            >
              + {text.addLanguage}
            </button>
          </div>
          <label className="admin-default-locale">
            <span>{text.default}</span>
            <select
              value={fallback}
              onChange={(event) => {
                setFallback(event.target.value);
                markDirty();
              }}
            >
              {active.map((language) => (
                <option value={language} key={language}>
                  {languageName(language)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {addLanguageOpen && (
          <div className="admin-add-locale-form">
            <label>
              <span>{text.languageCode}</span>
              <input
                placeholder="es"
                value={newLanguageCode}
                onChange={(event) => setNewLanguageCode(event.target.value)}
              />
            </label>
            <label>
              <span>{text.languageName}</span>
              <input
                placeholder="Español"
                value={newLanguageName}
                onChange={(event) => setNewLanguageName(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-tertiary"
              onClick={addLanguage}
            >
              {text.add}
            </button>
            <button
              type="button"
              className="admin-icon-action"
              title={text.cancel}
              aria-label={text.cancel}
              onClick={() => setAddLanguageOpen(false)}
            >
              ×
            </button>
          </div>
        )}
        <output aria-live="polite">{status}</output>
      </section>
      <div className="admin-translation-toolbar">
        <p className="admin-translation-help">{text.tableHelp}</p>
        <label className="admin-add-key">
          <span>{text.keyName}</span>
          <input
            placeholder={text.newKeyPlaceholder}
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addKey();
            }}
          />
          <button type="button" className="btn-tertiary" onClick={addKey}>
            + {text.addKey}
          </button>
        </label>
      </div>
      <div
        className="admin-translation-table"
        style={{
          "--translation-columns": active.length,
          "--translation-min-width": `${15 + active.length * 16}rem`,
        }}
      >
        <div className="admin-translation-row admin-translation-head">
          <strong>{text.key}</strong>
          {active.map((language) => (
            <strong key={language}>{languageName(language)}</strong>
          ))}
        </div>
        {keys.map((key) => (
          <div className="admin-translation-row" key={key}>
            <code>{key}</code>
            {active.map((language) => {
              const editing =
                editingCell?.language === language && editingCell.key === key;
              const value = cellValue(language, key);
              return editing ? (
                <input
                  aria-label={`${text.editCell} — ${languageName(language)} — ${key}`}
                  autoFocus
                  className="admin-translation-cell-input"
                  key={language}
                  value={editingCell.value}
                  onBlur={commitCellEdit}
                  onChange={(event) =>
                    setEditingCell((current) => ({
                      ...current,
                      value: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingCell(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`admin-translation-cell${value ? "" : " is-missing"}`}
                  key={language}
                  title={value || text.missing}
                  onDoubleClick={() => startCellEdit(language, key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      startCellEdit(language, key);
                    }
                  }}
                >
                  {value || "—"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
