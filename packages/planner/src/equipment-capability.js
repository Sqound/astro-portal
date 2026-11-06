import { message } from "portal/i18n.js";

function decimal(value, locale, digits) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The line under the suggestion button that says what the chosen equipment
 * does ("Lunette 72 mm cadre un champ de 3,1° × 2,07°."), or null when a
 * number of it is not known -- a custom set-up whose fields are still empty
 * said "cadre un champ de NaN° × NaN°". `field` is the field of view of the
 * equipment (`fieldOfView`), null when it has none.
 */
export function equipmentCapabilityLine({
  equipment,
  field,
  visualMode,
  locale,
}) {
  const name = String(equipment?.name ?? "").trim();
  if (!name) return null;
  const known = (value) =>
    value !== null &&
    value !== "" &&
    value !== undefined &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0;
  if (visualMode) {
    if (
      !known(equipment.magnification) ||
      !known(equipment.visualFieldDiameterDegrees)
    )
      return null;
    return message(locale, "plannerEquipmentCapabilityVisual")
      .replace("{equipment}", name)
      .replace("{magnification}", decimal(equipment.magnification, locale, 0))
      .replace(
        "{field}",
        decimal(equipment.visualFieldDiameterDegrees, locale, 2),
      );
  }
  if (!known(field?.width) || !known(field?.height)) return null;
  return message(locale, "plannerEquipmentCapabilityImaging")
    .replace("{equipment}", name)
    .replace("{width}", decimal(field.width, locale, 2))
    .replace("{height}", decimal(field.height, locale, 2));
}
