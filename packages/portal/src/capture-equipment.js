const displayOrder = [
  ["telescope", "Télescope"],
  ["camera", "Caméra"],
  ["mount", "Monture"],
  ["filter", "Filtre"],
  ["controller", "Contrôle"],
  ["lens", "Optique"],
  ["eyepiece", "Oculaire"],
];

export function captureEquipmentRole(value) {
  return value === "guiding" ? "guiding" : "main";
}

function specificationSummary(item) {
  const specs = item?.specifications || {};
  const aperture = specs.apertureMm ? `${specs.apertureMm} mm` : null;
  const focalLength = specs.focalLengthMm ? `${specs.focalLengthMm} mm` : null;
  const focalRatio = specs.focalRatio ? `f/${specs.focalRatio}` : null;
  if (["telescope", "guide-scope"].includes(item?.type))
    return [aperture, focalLength, focalRatio].filter(Boolean).join(", ");
  return "";
}

export function publicEquipmentName(item) {
  const name = String(item?.name || "").trim();
  const summary = specificationSummary(item);
  return [name, summary].filter(Boolean).join(" — ");
}

// Public detail panels deliberately receive only this small, display-ready
// projection. Private notes, inventory identifiers and planner settings never
// leave the authenticated inventory API.
export function publicCaptureEquipment(assignments = []) {
  const grouped = new Map();
  for (const assignment of assignments) {
    const item = assignment?.equipment || assignment;
    if (!item?.name) continue;
    const role = captureEquipmentRole(assignment?.role);
    if (!grouped.has(role)) grouped.set(role, []);
    grouped.get(role).push(item);
  }

  const result = {};
  for (const [type, label] of displayOrder) {
    const values = (grouped.get("main") || [])
      .filter((item) => item.type === type)
      .map(publicEquipmentName)
      .filter(Boolean);
    if (values.length) result[label] = values.join(" + ");
  }
  const guiding = (grouped.get("guiding") || [])
    .filter((item) => ["guide-scope", "camera"].includes(item.type))
    .map(publicEquipmentName)
    .filter(Boolean);
  if (guiding.length) result.Guidage = guiding.join(" + ");
  return result;
}
