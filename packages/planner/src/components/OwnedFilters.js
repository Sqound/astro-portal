"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import {
  WebConfirmDialog,
  WebDialog,
} from "portal/components/dialog/WebDialog.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import {
  filterFamilyDefaultName,
  ownedFilterFamilyChoices,
  ownedFilterLine,
} from "../filters-section.js";
import { fill } from "../wind-section.js";
import { ownedFilterNameMaxLength } from "../owned-filters.js";

// "Filtres possédés": the zone of the filters. The filters the observer owns —
// the inventory's, which the planner only reads ("Managed in the portal
// inventory"), and the ones added in this browser, renamed or removed from the
// options menu of their row — and "Add a filter", which opens a dialog. Nothing
// is written to the inventory: a filter added here stays in this browser.

function FilterGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function AddFilterDialog({ locale, onCancel, onConfirm }) {
  const [family, setFamily] = useState(ownedFilterFamilyChoices[0]);
  const [name, setName] = useState(filterFamilyDefaultName(locale, family));
  // The name follows the family until the person types one of their own.
  const [proposed, setProposed] = useState(name);
  const chooseFamily = (next) => {
    const nextProposed = filterFamilyDefaultName(locale, next);
    if (name === proposed) setName(nextProposed);
    setProposed(nextProposed);
    setFamily(next);
  };
  const save = () => {
    if (name.trim()) onConfirm({ name: name.trim(), family });
  };
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog planner-owned-filter-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onCancel}
      title={message(locale, "plannerOwnedFilterAddTitle")}
      titleAs="h3"
      footer={
        <>
          <button className="btn-link" onClick={onCancel} type="button">
            {message(locale, "plannerCancel")}
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={save}
            type="button"
          >
            {message(locale, "plannerOwnedFilterAddAction")}
          </button>
        </>
      }
    >
      <p className="planner-owned-filter-note">
        {message(locale, "plannerOwnedFilterAddNote")}
      </p>
      <label className="planner-framing-name">
        <span>{message(locale, "plannerOwnedFilterFamilyLabel")}</span>
        <select
          value={family}
          onChange={(event) => chooseFamily(event.target.value)}
        >
          {ownedFilterFamilyChoices.map((choice) => (
            <option key={choice} value={choice}>
              {filterFamilyDefaultName(locale, choice)}
            </option>
          ))}
        </select>
      </label>
      <label className="planner-framing-name">
        <span>{message(locale, "plannerOwnedFilterNameLabel")}</span>
        <input
          data-autofocus=""
          maxLength={ownedFilterNameMaxLength}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          value={name}
        />
      </label>
    </WebDialog>
  );
}

function RenameFilterDialog({ locale, initialName, onCancel, onConfirm }) {
  const [name, setName] = useState(initialName);
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog planner-owned-filter-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onCancel}
      title={message(locale, "plannerOwnedFilterRenameTitle")}
      titleAs="h3"
      footer={
        <>
          <button className="btn-link" onClick={onCancel} type="button">
            {message(locale, "plannerCancel")}
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
            type="button"
          >
            {message(locale, "plannerOwnedFilterRenameAction")}
          </button>
        </>
      }
    >
      <label className="planner-framing-name">
        <span>{message(locale, "plannerOwnedFilterNameLabel")}</span>
        <input
          data-autofocus=""
          maxLength={ownedFilterNameMaxLength}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              event.preventDefault();
              onConfirm(name.trim());
            }
          }}
          value={name}
        />
      </label>
    </WebDialog>
  );
}

function FilterRow({ locale, filter, menuOpen, onMenu, onRename, onRemove }) {
  const managed = filter.source === "inventory";
  const options = fill(message(locale, "plannerOwnedFilterOptions"), {
    name: filter.name,
  });
  return (
    <li className="planner-owned-filter">
      <span className="planner-owned-filter-icon">
        <FilterGlyph />
      </span>
      <span className="planner-owned-filter-text">
        <strong>{filter.name}</strong>
        <span>{ownedFilterLine(locale, filter.family)}</span>
      </span>
      <div
        className="planner-owned-filter-menu"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            event.stopPropagation();
            onMenu(false);
          }
        }}
      >
        <button
          type="button"
          aria-label={options}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => onMenu(!menuOpen)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
        {menuOpen && (
          <div className="planner-owned-filter-popup" role="menu">
            {managed ? (
              <p role="presentation">
                {message(locale, "plannerOwnedFilterManaged")}
              </p>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={onRename}>
                  {message(locale, "plannerOwnedFilterRename")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-destructive-item"
                  onClick={onRemove}
                >
                  {message(locale, "plannerOwnedFilterRemove")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function OwnedFilters({ locale, filters, onAdd, onRename, onRemove }) {
  const [dialog, setDialog] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const close = () => setDialog(null);
  return (
    <section
      className="planner-setting-group planner-owned-filters"
      aria-labelledby="planner-owned-filters-title"
    >
      <h3 id="planner-owned-filters-title">
        {message(locale, "plannerOwnedFiltersTitle")}
      </h3>
      {filters.length ? (
        <ul className="planner-owned-filter-list">
          {filters.map((filter) => (
            <FilterRow
              key={filter.id}
              locale={locale}
              filter={filter}
              menuOpen={menuId === filter.id}
              onMenu={(open) => setMenuId(open ? filter.id : null)}
              onRename={() => {
                setMenuId(null);
                setDialog({ kind: "rename", filter });
              }}
              onRemove={() => {
                setMenuId(null);
                setDialog({ kind: "remove", filter });
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="planner-owned-filter-empty" role="status">
          {message(locale, "plannerOwnedFiltersEmpty")}
        </p>
      )}
      <button
        className="btn-tertiary planner-owned-filter-add"
        type="button"
        onClick={() => setDialog({ kind: "add" })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {message(locale, "plannerOwnedFiltersAdd")}
      </button>
      {dialog?.kind === "add" && (
        <AddFilterDialog
          locale={locale}
          onCancel={close}
          onConfirm={(filter) => {
            onAdd(filter);
            close();
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameFilterDialog
          locale={locale}
          initialName={dialog.filter.name}
          onCancel={close}
          onConfirm={(name) => {
            onRename(dialog.filter.id, name);
            close();
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <WebConfirmDialog
          cancelLabel={message(locale, "plannerCancel")}
          className="planner-confirmation-dialog"
          closeLabel={flow(locale, "close")}
          confirmLabel={message(locale, "plannerOwnedFilterRemoveConfirm")}
          description={fill(
            message(locale, "plannerOwnedFilterRemoveMessage"),
            { name: dialog.filter.name },
          )}
          onCancel={close}
          onConfirm={() => {
            onRemove(dialog.filter.id);
            close();
          }}
          title={message(locale, "plannerOwnedFilterRemoveTitle")}
          titleAs="h3"
          tone="danger"
        />
      )}
    </section>
  );
}
