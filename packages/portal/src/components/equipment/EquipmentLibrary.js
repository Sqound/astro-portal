"use client";

import { Fragment, useState } from "react";
import {
  DragHandleIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "portal/components/admin/AdminIcons.js";
import { EQUIPMENT_KINDS } from "portal/equipment/manage-equipment.js";
import { message } from "portal/i18n.js";
import { counted } from "../sessions/journal-list-view.js";
import { equipmentCopyFor } from "./equipment-copy.js";
import { builtInRowsOf, filterOfferedForAll } from "./filter-attachment.js";
import { instrumentKindOf } from "portal/equipment/instrument-kind.js";

/**
 * The line of an item's specifications, in the order of the form: aperture,
 * focal length, sensor, apparent field, then what a lens or a filter is
 * (its optical factor, its band, its diameter) — without which a Barlow or a
 * filter showed « Aucune spécification ». The text an administrator or a
 * person typed (the band) is shown as typed.
 */
export const equipmentSummary = (item, noSpecifications) => {
  const specs = item.specifications || {};
  // EQUIPMENT-INSTRUMENTS-01: binoculars say « 10× · 50 mm · 6,5° », a
  // smartphone its field and its f-number.
  const kind = item.type === "telescope" ? instrumentKindOf(item) : null;
  if (kind === "binoculars") {
    const line = [
      specs.magnification && `${specs.magnification}×`,
      specs.apertureMm && `${specs.apertureMm} mm`,
      specs.trueFieldDegrees && `${specs.trueFieldDegrees}°`,
    ].filter(Boolean);
    if (line.length) return line.join(" · ");
  }
  if (kind === "smartphone") {
    const phone = item.planner?.phone || {};
    const line = [
      phone.fieldWidthDegrees &&
        phone.fieldHeightDegrees &&
        `${Math.round(phone.fieldWidthDegrees)}° × ${Math.round(phone.fieldHeightDegrees)}°`,
      phone.fNumber && `f/${phone.fNumber}`,
    ].filter(Boolean);
    if (line.length) return line.join(" · ");
  }
  const values = [
    specs.apertureMm && `${specs.apertureMm} mm`,
    specs.focalLengthMm && `${specs.focalLengthMm} mm`,
    specs.sensorWidthMm &&
      `${specs.sensorWidthMm} × ${specs.sensorHeightMm || "?"} mm`,
    specs.apparentFieldDegrees && `${specs.apparentFieldDegrees}°`,
    specs.multiplier && `${specs.multiplier}×`,
    typeof specs.bandpass === "string" && specs.bandpass.trim(),
    specs.diameterMm && `${specs.diameterMm} mm`,
  ].filter(Boolean);
  return values.join(" · ") || item.manufacturer || noSpecifications;
};

/**
 * A list of equipment by kind, once the administration's
 * « Matériel »:
 *
 * - `variant="own"` — « Mon espace » → « Matériel » (board
 *   `GestionEquipment`): « INVENTAIRE PRIVÉ », « Mon matériel »; once the
 *   space holds an item, every kind is shown in its order (Télescopes,
 *   Caméras, Oculaires, Optiques, Montures, Lunettes guides, Filtres,
 *   Contrôleurs), each with « Ajouter » (the form opens on that kind) and
 *   « Aucun élément. » when it is empty; before the first item, the sentence
 *   of the empty list alone.
 * - `variant="platform"` — the administration's « Matériel par défaut »
 *  : « PLATEFORME », the line « Proposé à
 *   tous les espaces… », the kinds that hold an item, as today.
 *
 * Per item: its name, its maker and model, the line of its
 * specifications, the drag handle, ↑ ↓, « Éditer » and « Archiver »
 * (nothing is deleted; « Archives » shows the archived items and
 * « Réactiver » brings one back).
 */
export function EquipmentLibrary({
  equipment,
  showArchives,
  onShowArchives,
  onCreate,
  onAdd = null,
  onEdit,
  onArchive,
  onRestore,
  onMove,
  onReorder,
  locale = "fr",
  variant = "own",
  // `(Item) => { nights, acquiredSeconds, href } | null`, what a tube has seen of the
  // nights, and the way to its statistics.
  usageOf = null,
}) {
  const text = equipmentCopyFor(locale);
  const words = variant === "platform" ? text.platform : text.own;
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const items = equipment.filter((item) =>
    showArchives ? item.archivedAt : !item.archivedAt,
  );
  const byKind = items.reduce(
    (all, item) => ({
      ...all,
      [item.type]: [...(all[item.type] || []), item],
    }),
    {},
  );
  // The own list shows every kind once it holds an item (the empty kinds say
  // so); the archives, and the default list, show the kinds that hold one.
  // The built-in filters of the smart telescopes of the space, in the list of
  // filters, read-only (the « Filtres » group is shown even when the space
  // typed no filter of its own).
  const builtInRows =
    variant === "own" && !showArchives ? builtInRowsOf(equipment) : [];
  const groups =
    variant === "own" && !showArchives && items.length
      ? EQUIPMENT_KINDS.map((type) => [type, byKind[type] || []])
      : Object.entries(byKind);
  const startDrag = (event, item, type) => {
    if (showArchives || event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    const card = event.currentTarget;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const bounds = card.getBoundingClientRect();
    const preview = card.cloneNode(true);
    preview.classList.remove("is-dragging");
    preview.setAttribute("aria-hidden", "true");
    preview.style.cssText = [
      "position: fixed",
      "left: -10000px",
      "top: -10000px",
      `width: ${bounds.width}px`,
      "pointer-events: none",
      "cursor: grabbing",
      "opacity: 1",
    ].join(";");
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 28, 28);
    requestAnimationFrame(() => preview.remove());
    setDragged({ id: item.id, type });
  };
  const setDropPosition = (event, item, type) => {
    if (showArchives || dragged?.type !== type || dragged.id === item.id) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const isBefore =
      event.clientY < bounds.top + bounds.height / 2 ||
      (Math.abs(event.clientY - (bounds.top + bounds.height / 2)) < 12 &&
        event.clientX < bounds.left + bounds.width / 2);
    setDropTarget({ id: item.id, position: isBefore ? "before" : "after" });
  };
  const finishDrop = (event, item, type, group) => {
    event.preventDefault();
    if (dragged?.type === type && dragged.id !== item.id) {
      const moved = group.find((candidate) => candidate.id === dragged.id);
      const next = group.filter((candidate) => candidate.id !== dragged.id);
      const targetIndex = next.findIndex(
        (candidate) => candidate.id === item.id,
      );
      const insertAt =
        targetIndex +
        (dropTarget?.id === item.id && dropTarget.position === "after" ? 1 : 0);
      next.splice(Math.max(0, insertAt), 0, moved);
      onReorder(
        type,
        next.map((candidate) => candidate.id),
      );
    }
    setDragged(null);
    setDropTarget(null);
  };
  return (
    <section
      className={`admin-library admin-equipment-library equipment-library-${variant}`}
      aria-label={showArchives ? text.archivesTitle : words.title}
    >
      <header className="admin-library-header">
        <div>
          <p className="eyebrow">{words.eyebrow}</p>
          <h2>{showArchives ? text.archivesTitle : words.title}</h2>
          {variant === "platform" && !showArchives ? (
            <p className="equipment-library-proposed">{words.proposed}</p>
          ) : null}
          <p>{showArchives ? text.archivedHelp : text.help}</p>
        </div>
        <div className="admin-library-controls">
          <button
            type="button"
            className="btn-link"
            onClick={() => onShowArchives(!showArchives)}
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
      {groups.map(([type, group]) => (
        <section
          className="admin-equipment-group"
          key={type}
          data-kind={type}
          aria-label={text.kinds[type] || type}
        >
          <div className="admin-equipment-group-head">
            <h3>{text.kinds[type] || type}</h3>
            {variant === "own" && !showArchives && onAdd ? (
              <button
                type="button"
                className="btn-tertiary equipment-add"
                onClick={() => onAdd(type)}
              >
                <PlusIcon />
                {text.add}
              </button>
            ) : null}
          </div>
          {group.length || (type === "filter" && builtInRows.length) ? null : (
            <p className="admin-equipment-none">{text.noItem}</p>
          )}
          {type === "filter" && builtInRows.length ? (
            <div className="admin-equipment-cards equipment-built-in-cards">
              {builtInRows.map((row) => (
                <article
                  className="admin-equipment-card equipment-built-in-card"
                  key={row.key}
                  data-built-in-filter={row.id}
                  data-owner={row.owner.id}
                >
                  <div>
                    <strong title={row.label}>{row.label}</strong>
                    <small className="admin-equipment-badge">
                      {message(locale, "filterTagBuiltIn")}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <div className="admin-equipment-cards">
            {group.map((item, index) => {
              return (
                <Fragment key={item.id}>
                  {dragged?.type === type &&
                    dragged.id !== item.id &&
                    dropTarget?.id === item.id &&
                    dropTarget.position === "before" && (
                      <div
                        className="admin-equipment-drop-placeholder"
                        aria-hidden="true"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => finishDrop(event, item, type, group)}
                      />
                    )}
                  <article
                    className={`admin-equipment-card${
                      dragged?.id === item.id ? " is-dragging" : ""
                    }`}
                    draggable={!showArchives}
                    onDragStart={(event) => startDrag(event, item, type)}
                    onDragOver={(event) => setDropPosition(event, item, type)}
                    onDrop={(event) => finishDrop(event, item, type, group)}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                  >
                    <div>
                      <strong title={item.name}>{item.name}</strong>
                      {item.manufacturer || item.model ? (
                        <small
                          title={`${item.manufacturer || ""} ${item.model || ""}`.trim()}
                        >
                          {item.manufacturer} {item.model}
                        </small>
                      ) : null}
                      <p>{equipmentSummary(item, text.none)}</p>
                      {usageOf && !showArchives
                        ? (() => {
                            const usage = usageOf(item);
                            return usage ? (
                              <a
                                className="btn-link equipment-usage"
                                href={usage.href}
                                data-testid={`equipment-usage-${item.id}`}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4.5 21V10M10 21V4M15.5 21V14M21 21H3" />
                                </svg>
                                {counted(
                                  locale,
                                  "journalStatisticsNightsCount",
                                  usage.nights,
                                )}
                                {" · "}
                                {usage.duration}
                              </a>
                            ) : null;
                          })()
                        : null}
                      {item.type === "filter" && !filterOfferedForAll(item) ? (
                        <small className="admin-equipment-badge">
                          {message(locale, "filterTagHereOnly")}
                        </small>
                      ) : null}
                      {item.type === "telescope" &&
                        instrumentKindOf(item) === "binoculars" && (
                          <small className="admin-equipment-badge">
                            {text.binoculars}
                          </small>
                        )}
                      {item.type === "telescope" &&
                        instrumentKindOf(item) === "smartphone" && (
                          <small
                            className="admin-equipment-badge"
                            data-testid={`equipment-smartphone-${item.id}`}
                          >
                            {text.smartphone}
                          </small>
                        )}
                    </div>
                    <div className="admin-inline-actions">
                      {showArchives ? (
                        <button
                          type="button"
                          className="btn-tertiary"
                          onClick={() => onRestore(item.id)}
                        >
                          {text.restore}
                        </button>
                      ) : (
                        <>
                          <span
                            className="admin-drag-handle"
                            aria-hidden="true"
                            title={text.drag}
                          >
                            <DragHandleIcon />
                          </span>
                          <div className="admin-order-actions">
                            <button
                              type="button"
                              aria-label={text.up}
                              title={text.up}
                              disabled={!index}
                              onClick={() => onMove(type, index, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={text.down}
                              title={text.down}
                              disabled={index === group.length - 1}
                              onClick={() => onMove(type, index, 1)}
                            >
                              ↓
                            </button>
                          </div>
                          <button
                            type="button"
                            className="admin-icon-action"
                            aria-label={`${text.edit} ${item.name}`}
                            title={text.edit}
                            onClick={() => onEdit(item)}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-action admin-delete-action"
                            aria-label={`${text.archive} ${item.name}`}
                            title={text.archive}
                            onClick={() => onArchive(item)}
                          >
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                  {dragged?.type === type &&
                    dragged.id !== item.id &&
                    dropTarget?.id === item.id &&
                    dropTarget.position === "after" && (
                      <div
                        className="admin-equipment-drop-placeholder"
                        aria-hidden="true"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => finishDrop(event, item, type, group)}
                      />
                    )}
                </Fragment>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && (
        <p className="admin-empty">
          {showArchives ? text.emptyArchives : words.empty}
        </p>
      )}
    </section>
  );
}

/** The index of `item` in its kind's active list, for ↑ and ↓. */
export function moveWithinKind(equipment, type, index, direction) {
  const group = equipment.filter(
    (item) => !item.archivedAt && item.type === type,
  );
  const next = [...group];
  if (!next[index] || !next[index + direction]) return null;
  [next[index], next[index + direction]] = [
    next[index + direction],
    next[index],
  ];
  return next.map((item) => item.id);
}
