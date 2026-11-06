"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { WebConfirmDialog } from "portal/components/dialog/WebDialog.js";
import { EquipmentEditor } from "portal/components/equipment/EquipmentEditor.js";
import {
  EquipmentLibrary,
  moveWithinKind,
} from "portal/components/equipment/EquipmentLibrary.js";
import { equipmentCopyFor } from "portal/components/equipment/equipment-copy.js";
import {
  configurationWithoutEquipment,
  normalizeDefaultConfiguration,
} from "portal/planner/default-configuration.js";
import {
  DefaultConfigurationCard,
  DefaultConfigurationDialog,
} from "./DefaultConfigurationCard.js";
import {
  durationOf,
  journalStatisticsHref,
} from "../sessions/journal-list-view.js";
import {
  journalInstrumentOfTube,
  journalStatisticsInstrument,
} from "portal/journal/journal-statistics.js";
import {
  archiveItem,
  changeEquipment,
  changeItem,
  createEquipment,
  loadEquipment,
  saveConfiguration,
} from "./equipment-client.js";

/**
 * « Masquer le matériel par défaut » (under the list and in the empty
 * state): a switch, its one line, and the ⓘ « Le matériel par défaut ».
 * The pickers of the web planner and of the devices then offer « Mon
 * matériel » alone.
 */
export function HideDefaultEquipmentPanel({
  locale,
  hidden,
  busy = false,
  onChange,
}) {
  const text = equipmentCopyFor(locale);
  return (
    <section
      className="account-panel equipment-hide-defaults"
      aria-label={text.platform.title}
    >
      <div className="equipment-hide-defaults-row">
        <label
          className="space-calibration-switch equipment-hide-defaults-switch"
          htmlFor="equipment-hide-defaults"
        >
          <span>
            <span className="equipment-hide-defaults-title">
              {text.hide.title}
            </span>
            <span className="account-muted equipment-hide-defaults-line">
              {text.hide.line}
            </span>
          </span>
          <input
            id="equipment-hide-defaults"
            type="checkbox"
            role="switch"
            checked={hidden}
            aria-checked={hidden}
            disabled={busy}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="space-calibration-track" aria-hidden="true">
            <span />
          </span>
        </label>
        <InfoButton
          locale={locale}
          label={text.hide.info}
          body={text.platform.proposed}
        />
      </div>
    </section>
  );
}

/** Whether « Ma configuration par défaut » of `read` names `item`. */
export function configurationNames(read, item) {
  const configuration = normalizeDefaultConfiguration(
    read?.defaultConfiguration,
  );
  if (!configuration || !item?.id) return false;
  return (
    JSON.stringify(configurationWithoutEquipment(configuration, item.id)) !==
    JSON.stringify(configuration)
  );
}

/**
 * The tab « Matériel » as drawn from its data (pure, for the tests and the
 * captures): `read` is `{ equipment, defaults, hideDefaultEquipment,
 * defaultConfiguration }`; `configuration` the state of the dialog of « Ma
 * configuration par défaut » (`{ busy, failed }`, null when closed).
 */
export function EquipmentView({
  locale = "en",
  status = "ready",
  read = null,
  failure = null,
  showArchives = false,
  busy = false,
  dialog = null,
  editor = null,
  configuration = null,
  actions = {},
  // What a tube has seen of the nights (`EquipmentLibrary`'s `usageOf`).
  usageOf = null,
}) {
  const text = equipmentCopyFor(locale);
  if (editor)
    return (
      <div className="manage-equipment" data-view="editor">
        <EquipmentEditor
          locale={locale}
          selected={editor.selected}
          initialType={editor.type}
          equipment={read?.equipment || []}
          onOpenItem={(item) =>
            actions.openEditor({ selected: item, type: item.type })
          }
          onAddFilter={(owner) =>
            actions.openEditor({
              selected: { planner: { equipmentIds: [owner.id] } },
              type: "filter",
            })
          }
          onSave={actions.save}
          onSaved={actions.saved}
          onClose={actions.closeEditor}
        />
      </div>
    );
  if (status === "loading")
    return (
      <div className="manage-equipment" data-view="loading">
        <LoadingState>{text.loading}</LoadingState>
      </div>
    );
  if (status === "failed")
    return (
      <div className="manage-equipment" data-view="failed">
        <p className="account-muted">{text.loadFailed}</p>
        <div className="space-actions">
          <button type="button" className="btn-link" onClick={actions.reload}>
            {text.retry}
          </button>
        </div>
      </div>
    );
  return (
    <div className="manage-equipment" data-view="list">
      {failure ? (
        <p className="equipment-failure" role="alert">
          {text.changeFailed}
        </p>
      ) : null}
      {showArchives ? null : (
        // What fills every new plan, at the head of the tab.
        <DefaultConfigurationCard
          locale={locale}
          read={read}
          onEdit={actions.openConfiguration}
        />
      )}
      <EquipmentLibrary
        locale={locale}
        variant="own"
        equipment={read?.equipment || []}
        showArchives={showArchives}
        onShowArchives={actions.showArchives}
        onCreate={() => actions.openEditor({ selected: {}, type: "telescope" })}
        onAdd={(type) => actions.openEditor({ selected: {}, type })}
        onEdit={(item) =>
          actions.openEditor({ selected: item, type: item.type })
        }
        onArchive={actions.askArchive}
        onRestore={actions.restore}
        onMove={actions.move}
        onReorder={actions.reorder}
        usageOf={usageOf}
      />
      {showArchives ? null : (
        // Under the list and in the empty state; the archives are a view of
        // their own.
        <HideDefaultEquipmentPanel
          locale={locale}
          hidden={Boolean(read?.hideDefaultEquipment)}
          busy={busy}
          onChange={actions.hide}
        />
      )}
      {dialog ? (
        <WebConfirmDialog
          title={text.archiveTitle}
          cancelLabel={text.cancel}
          confirmLabel={text.archive}
          busy={busy}
          tone="neutral"
          onCancel={actions.closeDialog}
          onConfirm={() => actions.archive(dialog.item)}
        >
          <p>{text.archiveBody(dialog.item.name)}</p>
          {configurationNames(read, dialog.item) ? (
            // The item's place in « Ma configuration par défaut » reads « à
            // choisir », and this says so.
            <p data-r70="archive">
              {text.configuration.archive(dialog.item.name)}
            </p>
          ) : null}
        </WebConfirmDialog>
      ) : null}
      {configuration ? (
        <DefaultConfigurationDialog
          locale={locale}
          read={read}
          busy={configuration.busy}
          failed={configuration.failed}
          onCancel={actions.closeConfiguration}
          onSave={actions.saveConfiguration}
        />
      ) : null}
    </div>
  );
}

/**
 * « Mon espace » → « Matériel »: the space's own equipment, its
 * archives, the form of an item, the option « Masquer le matériel par
 * défaut ». `fetcher`, `csrf` and `leaves` are the space page's (a
 * session that ended leaves the page).
 */
export function EquipmentTab({
  locale = "en",
  fetcher = (...args) => fetch(...args),
  csrf = () => "",
  leaves = () => false,
}) {
  const text = equipmentCopyFor(locale);
  const [state, setState] = useState(() => ({
    status: "loading",
    read: null,
    failure: null,
    showArchives: false,
    busy: false,
    dialog: null,
    editor: null,
    configuration: null,
  }));
  const patch = useCallback(
    (changes) => setState((current) => ({ ...current, ...changes })),
    [],
  );

  // The lines of the Journal, read once when the tab opens, to say how many
  // nights a tube has seen. Only where the service says the statistics by
  // instrument are open (`X-Astro-Gallery-Statistics`): a free space draws
  // none of them; a Journal that cannot be read, nothing.
  const [nights, setNights] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lines = [];
        let cursor = null;
        for (let page = 0; page < 10; page += 1) {
          const query = new URLSearchParams({ limit: "100" });
          if (cursor) query.set("cursor", cursor);
          const response = await fetcher(`/api/v1/journal?${query}`, {
            credentials: "same-origin",
          });
          if (!response.ok) return;
          if (response.headers.get("X-Astro-Gallery-Statistics") !== "open")
            return;
          const body = await response.json();
          lines.push(...(body.sessions ?? []));
          cursor = body.nextCursor ?? null;
          if (!cursor) break;
        }
        if (!cancelled) setNights(lines);
      } catch {
        // Nothing is drawn.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once, at the opening of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const usageOf = useMemo(() => {
    if (!nights?.length) return null;
    return (item) => {
      if (item.type !== "telescope") return null;
      const row = journalInstrumentOfTube(nights, item.name);
      if (!row) return null;
      const stats = journalStatisticsInstrument(nights, row.label);
      return {
        nights: stats.nights,
        duration: durationOf(stats.acquiredSeconds, locale),
        href: journalStatisticsHref(locale, { instrument: row.label }),
      };
    };
  }, [nights, locale]);

  const reload = useCallback(async () => {
    const outcome = await loadEquipment(fetcher);
    if (leaves(outcome)) return;
    setState((current) =>
      outcome.kind === "ok"
        ? { ...current, status: "ready", read: outcome.read }
        : { ...current, status: current.read ? "ready" : "failed" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  useEffect(() => {
    void reload();
    // Once, at the opening of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change answered by the service: the list read again, or the words of
  // a failure above the list.
  const settle = async (outcome, { read = false } = {}) => {
    if (leaves(outcome)) return false;
    if (outcome.kind !== "ok") {
      patch({ busy: false, dialog: null, failure: outcome });
      return false;
    }
    if (read) patch({ busy: false, failure: null, read: outcome.read });
    else {
      patch({ busy: false, failure: null, dialog: null });
      await reload();
    }
    return true;
  };

  const reorder = async (type, ids) => {
    patch({ busy: true });
    await settle(
      await changeEquipment(fetcher, {
        body: { action: "reorder", type, ids },
        csrf: csrf(),
      }),
      { read: true },
    );
  };

  const actions = {
    reload,
    showArchives: (showArchives) => patch({ showArchives }),
    openEditor: (editor) => patch({ editor, failure: null }),
    closeEditor: () => patch({ editor: null }),
    save: async (draft) => {
      const outcome = draft.id
        ? await changeItem(fetcher, {
            id: draft.id,
            body: { equipment: draft },
            csrf: csrf(),
          })
        : await createEquipment(fetcher, { equipment: draft, csrf: csrf() });
      if (leaves(outcome)) return draft;
      if (outcome.kind !== "ok") throw new Error(text.editor.failed);
      return outcome.equipment;
    },
    saved: async () => {
      await reload();
      patch({ editor: null });
    },
    openConfiguration: () =>
      patch({ configuration: { busy: false, failed: false } }),
    closeConfiguration: () => patch({ configuration: null }),
    saveConfiguration: async (configuration) => {
      patch({ configuration: { busy: true, failed: false } });
      const outcome = await saveConfiguration(fetcher, {
        configuration,
        csrf: csrf(),
      });
      if (leaves(outcome)) return;
      if (outcome.kind !== "ok") {
        patch({ configuration: { busy: false, failed: true } });
        return;
      }
      setState((current) => ({
        ...current,
        configuration: null,
        read: {
          ...current.read,
          defaultConfiguration: outcome.configuration,
        },
      }));
    },
    askArchive: (item) => patch({ dialog: { item } }),
    closeDialog: () => patch({ dialog: null }),
    archive: async (item) => {
      patch({ busy: true });
      await settle(await archiveItem(fetcher, { id: item.id, csrf: csrf() }));
    },
    restore: async (id) => {
      patch({ busy: true });
      if (
        await settle(
          await changeItem(fetcher, {
            id,
            body: { action: "restore" },
            csrf: csrf(),
          }),
        )
      )
        patch({ showArchives: false });
    },
    move: (type, index, direction) => {
      const ids = moveWithinKind(
        state.read?.equipment || [],
        type,
        index,
        direction,
      );
      if (ids) void reorder(type, ids);
    },
    reorder,
    hide: async (hidden) => {
      patch({
        busy: true,
        read: { ...state.read, hideDefaultEquipment: hidden },
      });
      const saved = await settle(
        await changeEquipment(fetcher, {
          body: { hideDefaultEquipment: hidden },
          csrf: csrf(),
        }),
        { read: true },
      );
      // The switch shows what the service holds.
      if (!saved) await reload();
    },
  };

  return (
    <EquipmentView
      locale={locale}
      status={state.status}
      read={state.read}
      failure={state.failure}
      showArchives={state.showArchives}
      busy={state.busy}
      dialog={state.dialog}
      editor={state.editor}
      configuration={state.configuration}
      actions={actions}
      usageOf={usageOf}
    />
  );
}
