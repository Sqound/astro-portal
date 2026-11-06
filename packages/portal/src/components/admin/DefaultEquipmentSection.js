"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import { EquipmentEditor } from "portal/components/equipment/EquipmentEditor.js";
import {
  EquipmentLibrary,
  moveWithinKind,
} from "portal/components/equipment/EquipmentLibrary.js";
import { copyFor } from "astro-contracts/locales";
import { equipmentCopyFor } from "portal/components/equipment/equipment-copy.js";

const endpoint = "/api/admin/default-equipment";

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-astro-csrf": csrfCookieValue() || "" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok)
    throw new Error(
      data?.error?.message || data?.error || `${response.status}`,
    );
  return data;
}

// The confirmation of archiving a default equipment row.
const archiveCopy = {
  fr: {
    title: "Archiver ce matériel ?",
    message:
      "« {name} » ne sera plus proposé, mais ses anciennes associations resteront intactes.",
  },
  en: {
    title: "Archive this equipment?",
    message:
      "“{name}” will no longer be offered, but its existing associations will stay intact.",
  },
  ja: {
    title: "この機材をアーカイブしますか？",
    message:
      "「{name}」は今後提案されなくなりますが、既存の関連付けはそのまま残ります。",
  },
  de: {
    title: "Diese Ausrüstung archivieren?",
    message:
      "„{name}“ wird nicht mehr angeboten, die bisherigen Zuordnungen bleiben jedoch erhalten.",
  },
  es: {
    title: "¿Archivar este equipo?",
    message:
      "«{name}» dejará de ofrecerse, pero sus asociaciones anteriores se conservarán.",
  },
  it: {
    title: "Archiviare questa attrezzatura?",
    message:
      "«{name}» non sarà più proposta, ma le sue associazioni precedenti resteranno invariate.",
  },
  "pt-BR": {
    title: "Arquivar este equipamento?",
    message:
      "“{name}” não será mais oferecido, mas as associações anteriores permanecerão intactas.",
  },
  "zh-Hans": {
    title: "归档此器材？",
    message: "“{name}”将不再被推荐，但其原有关联保持不变。",
  },
  "zh-Hant": {
    title: "封存此器材？",
    message: "「{name}」將不再被提供，但既有關聯仍會保留。",
  },
  ru: {
    title: "Архивировать это оборудование?",
    message:
      "«{name}» больше не будет предлагаться, но прежние связи сохранятся.",
  },
};

/**
 * The administration's « Matériel par défaut »: the default rows, proposed
 * in the group « Matériel par défaut », for every kind. The
 * list and the form are those of « Mon espace » → « Matériel »; the form of
 * an item has an address of its own
 * (`/{locale}/admin/default-equipment/{id|new}`), as the administration's
 * « Matériel » had.
 */
export function DefaultEquipmentSection({
  locale,
  itemId = null,
  navigate,
  confirm,
  message,
}) {
  const text = equipmentCopyFor(locale);
  const archiveText = copyFor(
    archiveCopy,
    locale,
    "DefaultEquipmentSection.archiveCopy",
  );
  const [equipment, setEquipment] = useState([]);
  const [showArchives, setShowArchives] = useState(false);
  const newSelection = useMemo(() => ({}), []);
  const reload = useCallback(async () => {
    const data = await call(endpoint);
    setEquipment(data.equipment || []);
  }, []);
  useEffect(() => {
    reload().catch((error) => message(error.message));
  }, [reload, message]);
  const go = (next, options) =>
    navigate({ section: "default-equipment", ...next }, options);
  const act = async (run) => {
    try {
      await run();
      await reload();
    } catch (error) {
      message(error.message);
    }
  };
  const reorder = (type, ids) =>
    act(() =>
      call(endpoint, {
        method: "PATCH",
        body: { action: "reorder", type, ids },
      }),
    );
  const selected = itemId
    ? itemId === "new"
      ? newSelection
      : equipment.find((item) => item.id === itemId)
    : null;
  if (selected)
    return (
      <EquipmentEditor
        locale={locale}
        selected={selected}
        onClose={() => go({})}
        onSave={async (draft) =>
          (await call(endpoint, { method: "POST", body: { equipment: draft } }))
            .equipment
        }
        onSaved={async () => {
          await reload();
          go({}, { replace: true });
        }}
      />
    );
  return (
    <EquipmentLibrary
      locale={locale}
      variant="platform"
      equipment={equipment}
      showArchives={showArchives}
      onShowArchives={setShowArchives}
      onCreate={() => go({ itemId: "new" })}
      onEdit={(item) => go({ itemId: item.id })}
      onArchive={(item) =>
        confirm({
          title: archiveText.title,
          message: archiveText.message.replace("{name}", item.name),
          confirmLabel: text.archive,
          onConfirm: () =>
            act(() =>
              call(`${endpoint}?id=${encodeURIComponent(item.id)}`, {
                method: "DELETE",
              }),
            ),
        })
      }
      onRestore={(id) =>
        act(async () => {
          await call(endpoint, {
            method: "PATCH",
            body: { action: "restore", id },
          });
          setShowArchives(false);
        })
      }
      onMove={(type, index, direction) => {
        const ids = moveWithinKind(equipment, type, index, direction);
        if (ids) reorder(type, ids);
      }}
      onReorder={reorder}
    />
  );
}
