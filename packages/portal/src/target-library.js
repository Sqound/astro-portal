export function targetLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "");
}

export function targetLookupKeys(target) {
  return [
    target?.id,
    target?.source,
    target?.designation,
    target?.title,
    target?.stellarium?.source,
    ...(target?.objects || []),
    ...(target?.aliases || []),
    ...(target?.commonNames || []),
  ]
    .map(targetLookupKey)
    .filter(Boolean);
}
