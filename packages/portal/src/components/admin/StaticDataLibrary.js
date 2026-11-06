"use client";

import { copyFor } from "astro-contracts/locales";
import { useEffect, useState } from "react";
import { PencilIcon } from "portal/components/admin/AdminIcons.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";

const copy = {
  fr: {
    eyebrow: "INITIALISATION",
    title: "Données de démarrage",
    help: "Référentiels versionnables de l’application. L’instance les stocke en base ; exportez-les après une modification pour initialiser une autre instance avec le même état.",
    export: "Exporter le paquet d’initialisation",
    exporting: "Export…",
    exported: "Paquet d’initialisation exporté.",
    customized: "Modifié dans cette instance",
    source: "Identique au paquet source",
    edit: "Éditer",
    back: "Retour aux données de démarrage",
    save: "Enregistrer la donnée",
    saving: "Enregistrement…",
    saved: "Donnée enregistrée dans cette instance.",
    payload: "Contenu JSON",
    schema: "Version du schéma",
    key: "Clé stable",
    sourcePreview: "Version source actuellement importée",
    invalid: "Le contenu doit être du JSON valide.",
    loadError: "Chargement impossible.",
    saveError: "Enregistrement impossible.",
    settings: {
      eyebrow: "PARAMÈTRES DE L’INSTANCE",
      help: "Réglages généraux appliqués aux nouvelles sessions de planification. Les plans existants conservent leurs propres choix.",
      plannerDefaultSelection: "Sélection catalogue par défaut",
      all: "Toutes les cibles",
      best: "Essentielles",
      extended: "Étendues",
    },
  },
  en: {
    eyebrow: "INITIALIZATION",
    title: "Startup data",
    help: "Versionable application reference data. The instance stores it in its database; export after an edit to initialize another instance with the same state.",
    export: "Export initialization package",
    exporting: "Exporting…",
    exported: "Initialization package exported.",
    customized: "Changed in this instance",
    source: "Matches source package",
    edit: "Edit",
    back: "Back to startup data",
    save: "Save data",
    saving: "Saving…",
    saved: "Data saved in this instance.",
    payload: "JSON payload",
    schema: "Schema version",
    key: "Stable key",
    sourcePreview: "Currently imported source version",
    invalid: "The payload must be valid JSON.",
    loadError: "Unable to load.",
    saveError: "Unable to save.",
    settings: {
      eyebrow: "INSTANCE SETTINGS",
      help: "General settings applied to new planning sessions. Existing plans retain their own choices.",
      plannerDefaultSelection: "Default catalogue selection",
      all: "All targets",
      best: "Essential",
      extended: "Extended",
    },
  },
  ja: {
    eyebrow: "初期化",
    title: "起動データ",
    help: "バージョン管理可能なアプリケーション参照データです。インスタンスはデータベースに保持し、編集後に書き出すことで別のインスタンスを同じ状態で初期化できます。",
    export: "初期化パッケージを書き出す",
    exporting: "書き出し中…",
    exported: "初期化パッケージを書き出しました。",
    customized: "このインスタンスで変更済み",
    source: "ソースパッケージと同一",
    edit: "編集",
    back: "起動データに戻る",
    save: "データを保存",
    saving: "保存中…",
    saved: "このインスタンスにデータを保存しました。",
    payload: "JSON 内容",
    schema: "スキーマ版",
    key: "固定キー",
    sourcePreview: "現在取り込まれているソース版",
    invalid: "内容は有効な JSON である必要があります。",
    loadError: "読み込めません。",
    saveError: "保存できません。",
    settings: {
      eyebrow: "インスタンス設定",
      help: "新しい観測プランに適用する共通設定です。既存のプランにはそれぞれの選択が保持されます。",
      plannerDefaultSelection: "既定のカタログ選択",
      all: "すべての対象",
      best: "主要",
      extended: "拡張",
    },
  },
  de: {
    eyebrow: "INITIALISIERUNG",
    title: "Startdaten",
    help: "Versionierbare Referenzdaten der Anwendung. Die Instanz speichert sie in der Datenbank; exportiere sie nach einer Änderung, um eine andere Instanz mit demselben Stand zu initialisieren.",
    export: "Initialisierungspaket exportieren",
    exporting: "Export …",
    exported: "Initialisierungspaket exportiert.",
    customized: "In dieser Instanz geändert",
    source: "Identisch mit dem Quellpaket",
    edit: "Bearbeiten",
    back: "Zurück zu den Startdaten",
    save: "Daten speichern",
    saving: "Wird gespeichert …",
    saved: "Daten in dieser Instanz gespeichert.",
    payload: "JSON-Inhalt",
    schema: "Schemaversion",
    key: "Stabiler Schlüssel",
    sourcePreview: "Aktuell importierte Quellversion",
    invalid: "Der Inhalt muss gültiges JSON sein.",
    loadError: "Laden nicht möglich.",
    saveError: "Speichern nicht möglich.",
    settings: {
      eyebrow: "INSTANZEINSTELLUNGEN",
      help: "Allgemeine Einstellungen, die auf neue Planungssitzungen angewendet werden. Bestehende Pläne behalten ihre eigene Auswahl.",
      plannerDefaultSelection: "Standardauswahl aus dem Katalog",
      all: "Alle Ziele",
      best: "Kernziele",
      extended: "Erweitert",
    },
  },
  es: {
    eyebrow: "INICIALIZACIÓN",
    title: "Datos de inicio",
    help: "Datos de referencia versionables de la aplicación. La instancia los almacena en su base de datos; expórtalos tras una modificación para inicializar otra instancia con el mismo estado.",
    export: "Exportar el paquete de inicialización",
    exporting: "Exportando…",
    exported: "Paquete de inicialización exportado.",
    customized: "Modificado en esta instancia",
    source: "Idéntico al paquete de origen",
    edit: "Editar",
    back: "Volver a los datos de inicio",
    save: "Guardar el dato",
    saving: "Guardando…",
    saved: "Dato guardado en esta instancia.",
    payload: "Contenido JSON",
    schema: "Versión del esquema",
    key: "Clave estable",
    sourcePreview: "Versión de origen importada actualmente",
    invalid: "El contenido debe ser un JSON válido.",
    loadError: "No se pudo cargar.",
    saveError: "No se pudo guardar.",
    settings: {
      eyebrow: "AJUSTES DE LA INSTANCIA",
      help: "Ajustes generales aplicados a las nuevas sesiones de planificación. Los planes existentes conservan sus propias opciones.",
      plannerDefaultSelection: "Selección de catálogo por defecto",
      all: "Todos los objetivos",
      best: "Esenciales",
      extended: "Ampliados",
    },
  },
  it: {
    eyebrow: "INIZIALIZZAZIONE",
    title: "Dati di avvio",
    help: "Dati di riferimento versionabili dell’applicazione. L’istanza li conserva nel database; esportali dopo una modifica per inizializzare un’altra istanza con lo stesso stato.",
    export: "Esportare il pacchetto di inizializzazione",
    exporting: "Esportazione…",
    exported: "Pacchetto di inizializzazione esportato.",
    customized: "Modificato in questa istanza",
    source: "Identico al pacchetto sorgente",
    edit: "Modificare",
    back: "Tornare ai dati di avvio",
    save: "Salvare il dato",
    saving: "Salvataggio…",
    saved: "Dato salvato in questa istanza.",
    payload: "Contenuto JSON",
    schema: "Versione dello schema",
    key: "Chiave stabile",
    sourcePreview: "Versione sorgente attualmente importata",
    invalid: "Il contenuto deve essere un JSON valido.",
    loadError: "Impossibile caricare.",
    saveError: "Impossibile salvare.",
    settings: {
      eyebrow: "IMPOSTAZIONI DELL’ISTANZA",
      help: "Impostazioni generali applicate alle nuove sessioni di pianificazione. I piani esistenti conservano le proprie scelte.",
      plannerDefaultSelection: "Selezione del catalogo predefinita",
      all: "Tutti i target",
      best: "Essenziali",
      extended: "Estesi",
    },
  },
  "pt-BR": {
    eyebrow: "INICIALIZAÇÃO",
    title: "Dados de inicialização",
    help: "Referenciais versionáveis do aplicativo. A instância os armazena no banco de dados; exporte-os após uma alteração para inicializar outra instância com o mesmo estado.",
    export: "Exportar o pacote de inicialização",
    exporting: "Exportando…",
    exported: "Pacote de inicialização exportado.",
    customized: "Alterado nesta instância",
    source: "Idêntico ao pacote de origem",
    edit: "Editar",
    back: "Voltar aos dados de inicialização",
    save: "Salvar o dado",
    saving: "Salvando…",
    saved: "Dado salvo nesta instância.",
    payload: "Conteúdo JSON",
    schema: "Versão do esquema",
    key: "Chave estável",
    sourcePreview: "Versão de origem atualmente importada",
    invalid: "O conteúdo deve ser um JSON válido.",
    loadError: "Não foi possível carregar.",
    saveError: "Não foi possível salvar.",
    settings: {
      eyebrow: "CONFIGURAÇÕES DA INSTÂNCIA",
      help: "Configurações gerais aplicadas às novas sessões de planejamento. Os planos existentes mantêm suas próprias escolhas.",
      plannerDefaultSelection: "Seleção padrão do catálogo",
      all: "Todos os alvos",
      best: "Essenciais",
      extended: "Ampliados",
    },
  },
  "zh-Hans": {
    eyebrow: "初始化",
    title: "启动数据",
    help: "应用的可版本化参考数据。实例将其存储在数据库中；修改后导出，即可用相同状态初始化另一个实例。",
    export: "导出初始化包",
    exporting: "正在导出…",
    exported: "初始化包已导出。",
    customized: "已在此实例中修改",
    source: "与源数据包一致",
    edit: "编辑",
    back: "返回启动数据",
    save: "保存数据",
    saving: "正在保存…",
    saved: "数据已保存到此实例。",
    payload: "JSON 内容",
    schema: "架构版本",
    key: "固定键",
    sourcePreview: "当前已导入的源版本",
    invalid: "内容必须是有效的 JSON。",
    loadError: "无法加载。",
    saveError: "无法保存。",
    settings: {
      eyebrow: "实例设置",
      help: "应用于新规划场次的通用设置。现有计划保留各自的选择。",
      plannerDefaultSelection: "默认星表选择",
      all: "所有目标",
      best: "核心",
      extended: "扩展",
    },
  },
  "zh-Hant": {
    eyebrow: "初始化",
    title: "啟動資料",
    help: "應用程式的可版本化參考資料。執行個體將其儲存在資料庫中；修改後匯出，即可以相同狀態初始化另一個執行個體。",
    export: "匯出初始化資料包",
    exporting: "正在匯出…",
    exported: "初始化資料包已匯出。",
    customized: "已在此執行個體中修改",
    source: "與來源資料包相同",
    edit: "編輯",
    back: "返回啟動資料",
    save: "儲存資料",
    saving: "正在儲存…",
    saved: "資料已儲存至此執行個體。",
    payload: "JSON 內容",
    schema: "結構描述版本",
    key: "固定鍵值",
    sourcePreview: "目前已匯入的來源版本",
    invalid: "內容必須是有效的 JSON。",
    loadError: "無法載入。",
    saveError: "無法儲存。",
    settings: {
      eyebrow: "執行個體設定",
      help: "套用於新規劃場次的一般設定。既有計畫保留各自的選擇。",
      plannerDefaultSelection: "預設星表選擇",
      all: "所有目標",
      best: "核心",
      extended: "擴充",
    },
  },
  ru: {
    eyebrow: "ИНИЦИАЛИЗАЦИЯ",
    title: "Стартовые данные",
    help: "Версионируемые справочные данные приложения. Экземпляр хранит их в своей базе данных; после изменения экспортируйте их, чтобы инициализировать другой экземпляр тем же состоянием.",
    export: "Экспортировать пакет инициализации",
    exporting: "Экспорт…",
    exported: "Пакет инициализации экспортирован.",
    customized: "Изменено в этом экземпляре",
    source: "Совпадает с исходным пакетом",
    edit: "Редактировать",
    back: "К стартовым данным",
    save: "Сохранить данные",
    saving: "Сохранение…",
    saved: "Данные сохранены в этом экземпляре.",
    payload: "Содержимое JSON",
    schema: "Версия схемы",
    key: "Постоянный ключ",
    sourcePreview: "Исходная версия, импортированная сейчас",
    invalid: "Содержимое должно быть корректным JSON.",
    loadError: "Не удалось загрузить.",
    saveError: "Не удалось сохранить.",
    settings: {
      eyebrow: "НАСТРОЙКИ ЭКЗЕМПЛЯРА",
      help: "Общие настройки для новых сеансов планирования. Существующие планы сохраняют собственный выбор.",
      plannerDefaultSelection: "Выбор каталога по умолчанию",
      all: "Все цели",
      best: "Основные",
      extended: "Расширенные",
    },
  },
};

const csrfToken = () => csrfCookieValue();

const prettyJson = (value) => JSON.stringify(value, null, 2);

function StaticDataEditor({ locale, dataKey, onClose }) {
  const text = copyFor(copy, locale, "StaticDataLibrary.copy");
  const [document, setDocument] = useState(null);
  const [payloadText, setPayloadText] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/static-data?id=${encodeURIComponent(dataKey)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || text.loadError);
        return data.document;
      })
      .then((result) => {
        if (cancelled) return;
        setDocument(result);
        setPayloadText(prettyJson(result.payload));
      })
      .catch((error) => !cancelled && setStatus(error.message));
    return () => {
      cancelled = true;
    };
  }, [dataKey, text.loadError]);

  const save = async (event) => {
    event.preventDefault();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setStatus(text.invalid);
      return;
    }
    setStatus(text.saving);
    try {
      const response = await fetch("/api/admin/static-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({
          document: {
            key: document.key,
            title: document.title,
            schemaVersion: document.schemaVersion,
            payload,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || data.error || text.saveError);
      setDocument(data.document);
      setPayloadText(prettyJson(data.document.payload));
      setStatus(text.saved);
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!document) return <p className="admin-target-status">{status || "…"}</p>;

  return (
    <form
      className="admin-form admin-editor-form admin-static-data-editor"
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
        <h2>{document.title}</h2>
        <div className="admin-grid">
          <label className="admin-field">
            <span>{text.key}</span>
            <input value={document.key} readOnly />
          </label>
          <label className="admin-field">
            <span>{text.schema}</span>
            <input value={document.schemaVersion} readOnly />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{text.payload}</span>
            <textarea
              className="admin-static-data-json"
              rows={28}
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              spellCheck="false"
            />
          </label>
        </div>
        <details className="admin-target-source-record">
          <summary>{text.sourcePreview}</summary>
          <pre>{prettyJson(document.sourcePayload)}</pre>
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

function InstanceSettingsEditor({ locale, onClose }) {
  const text = copyFor(copy, locale, "StaticDataLibrary.copy");
  const [document, setDocument] = useState(null);
  const [selection, setSelection] = useState("best");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/static-data?id=instance-settings", {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || text.loadError);
        return data.document;
      })
      .then((result) => {
        if (cancelled) return;
        setDocument(result);
        setSelection(
          ["all", "best", "extended"].includes(
            result.payload?.planner?.defaultCatalogueSelection,
          )
            ? result.payload.planner.defaultCatalogueSelection
            : "best",
        );
      })
      .catch((error) => !cancelled && setStatus(error.message));
    return () => {
      cancelled = true;
    };
  }, [text.loadError]);

  const save = async (event) => {
    event.preventDefault();
    if (!document) return;
    setStatus(text.saving);
    try {
      const response = await fetch("/api/admin/static-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-astro-csrf": csrfToken() || "",
        },
        body: JSON.stringify({
          document: {
            key: document.key,
            title: document.title,
            schemaVersion: document.schemaVersion,
            payload: {
              ...document.payload,
              planner: {
                ...document.payload.planner,
                defaultCatalogueSelection: selection,
              },
            },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || data.error || text.saveError);
      setDocument(data.document);
      setStatus(text.saved);
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!document) return <p className="admin-target-status">{status || "…"}</p>;

  return (
    <form className="admin-form admin-editor-form" onSubmit={save}>
      <section>
        <button
          type="button"
          className="btn-link admin-back-link"
          onClick={onClose}
        >
          ← {text.back}
        </button>
        <p className="eyebrow">{text.settings.eyebrow}</p>
        <h2>{document.title}</h2>
        <p className="admin-editor-help">{text.settings.help}</p>
        <div className="admin-grid">
          <label className="admin-field admin-field-wide">
            <span>{text.settings.plannerDefaultSelection}</span>
            <select
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="all">{text.settings.all}</option>
              <option value="best">{text.settings.best}</option>
              <option value="extended">{text.settings.extended}</option>
            </select>
          </label>
        </div>
        <details className="admin-target-source-record">
          <summary>{text.sourcePreview}</summary>
          <pre>{prettyJson(document.sourcePayload)}</pre>
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

function StaticDataList({ locale, onEdit }) {
  const text = copyFor(copy, locale, "StaticDataLibrary.copy");
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  const reload = async () => {
    const response = await fetch("/api/admin/static-data", {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || text.loadError);
    setDocuments(data.documents || []);
  };

  useEffect(() => {
    reload().catch((error) => setStatus(error.message));
  }, []);

  const exportPackage = async () => {
    setExporting(true);
    setStatus(text.exporting);
    try {
      const response = await fetch("/api/admin/static-data", {
        method: "POST",
        headers: { "x-astro-csrf": csrfToken() || "" },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || data.error || text.saveError);
      await reload();
      setStatus(text.exported);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="admin-library admin-static-data-library">
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <p>{text.help}</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={exportPackage}
          disabled={exporting}
        >
          {text.export}
        </button>
      </header>
      <p className="admin-static-data-status" role="status">
        {status}
      </p>
      <div className="admin-static-data-list" role="list">
        {documents.map((document) => (
          <article key={document.key} role="listitem">
            <div>
              <h3>{document.title}</h3>
              <code>{document.key}</code>
            </div>
            <span className={document.isCustomized ? "is-customized" : ""}>
              {document.isCustomized ? text.customized : text.source}
            </span>
            <button
              type="button"
              className="admin-icon-action"
              aria-label={`${text.edit} ${document.title}`}
              title={text.edit}
              onClick={() => onEdit(document.key)}
            >
              <PencilIcon />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StaticDataLibrary({
  locale = "fr",
  itemId = null,
  onNavigate,
}) {
  return itemId ? (
    itemId === "instance-settings" ? (
      <InstanceSettingsEditor
        locale={locale}
        onClose={() => onNavigate(null)}
      />
    ) : (
      <StaticDataEditor
        locale={locale}
        dataKey={itemId}
        onClose={() => onNavigate(null)}
      />
    )
  ) : (
    <StaticDataList locale={locale} onEdit={(dataKey) => onNavigate(dataKey)} />
  );
}
