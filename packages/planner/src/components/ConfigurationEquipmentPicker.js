"use client";

import { useMemo } from "react";
import { equipmentHiddenAndEmpty } from "../equipment-groups.js";
import {
  defaultEquipmentProfiles,
  equipmentProfilesFromInventory,
} from "../planner.js";
import { telescopeOptionLabel } from "../telescope-picker.js";
import { EquipmentPicker } from "./EquipmentPicker.js";

// The picker of one place of « Ma configuration par défaut » (« Mon espace »
// → « Matériel »): the planner's `EquipmentPicker` over the rows of
// `GET /api/equipment` — the space's own items of that kind (`mine`) and the
// default rows (`defaults`, not listed while the space hides them; a chosen
// one stays named).

const categoryOfKind = Object.freeze({
  telescope: "telescope",
  camera: "camera",
  eyepiece: "eyepiece",
  lens: "modifier",
  mount: "mount",
});

const listOfCategory = Object.freeze({
  telescope: "telescopes",
  camera: "cameras",
  eyepiece: "eyepieces",
  modifier: "modifiers",
  mount: "mounts",
});

/**
 * `kind` is the item's type (`telescope`, `camera`, `eyepiece`, `lens`,
 * `mount`); `leading` the options before the lists (« Aucun »); `define` the
 * props of « Définir mon matériel », drawn here when nothing matches.
 */
export function ConfigurationEquipmentPicker({
  locale,
  kind,
  mine = [],
  defaults = [],
  hidden = false,
  value = null,
  onChange,
  leading = [],
  label,
  define = null,
  onNoMatchChange,
}) {
  const category = categoryOfKind[kind] ?? kind;
  const list = listOfCategory[category];
  const lists = useMemo(() => {
    const ownProfiles = (
      equipmentProfilesFromInventory(mine)[list] || []
    ).filter((profile) => profile.id !== "none");
    const defaultProfiles = (
      defaultEquipmentProfiles(defaults)[list] || []
    ).filter((profile) => profile.id !== "none");
    // An item the planner cannot draw (a telescope without its optics) is
    // still offered by its name, as the configuration may hold it.
    const listed = new Set(
      [...ownProfiles, ...defaultProfiles].map((profile) => profile.id),
    );
    const bare = (items) =>
      items
        .filter((item) => item?.id && !listed.has(String(item.id)))
        .map((item) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          ...(typeof item.planner?.maker === "string"
            ? { maker: item.planner.maker }
            : {}),
          ...(typeof item.planner?.kind === "string"
            ? { kind: item.planner.kind }
            : {}),
        }));
    const own = [...ownProfiles, ...bare(mine)];
    const offered = [...defaultProfiles, ...bare(defaults)];
    return { mine: own, defaults: offered, known: [...own, ...offered] };
  }, [mine, defaults, list]);
  const hiddenEmpty =
    category !== "modifier" &&
    category !== "mount" &&
    !value &&
    equipmentHiddenAndEmpty({ hidden, mine: lists.mine });
  return (
    <EquipmentPicker
      locale={locale}
      category={category}
      value={value || null}
      mine={lists.mine}
      defaults={hidden ? [] : lists.defaults}
      known={lists.known}
      defaultsLabelled
      leading={leading}
      // A telescope without its optics is named alone.
      optionLabel={
        category === "telescope"
          ? (profile) =>
              profile.apertureMm
                ? telescopeOptionLabel(locale, profile)
                : profile.name
          : undefined
      }
      label={label}
      hiddenEmpty={hiddenEmpty}
      define={hiddenEmpty ? null : define}
      onNoMatchChange={onNoMatchChange}
      onChange={onChange}
    />
  );
}
