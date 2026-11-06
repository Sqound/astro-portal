const sections = new Set([
  "captures",
  "catalogue",
  "initialization",
  // « Matériel par défaut » replaces « Matériel » (a person's own
  // equipment is in « Mon espace » → « Matériel »).
  "default-equipment",
  "translations",
  "references",
  "logs",
]);

/**
 * The route of the administration at `segments`, or `null`. `fileGallery:
 * false` takes away the editor of the operator's file gallery (section
 * `captures`, « Galerie de fichiers »): it exists only on a server whose
 * home gallery is that file gallery (`ASTRO_PORTAL_GALLERY_SOURCE=files`).
 */
export const parseAdminRoute = (segments = [], { fileGallery = true } = {}) => {
  if (!Array.isArray(segments) || !segments.length) return null;
  const [section, itemId] = segments;
  if (section === "captures" && !fileGallery) return null;
  if (!sections.has(section)) return null;
  if (
    section === "translations" ||
    section === "references" ||
    section === "logs"
  )
    return segments.length === 1 ? { section, itemId: null } : null;
  if (segments.length > 2 || (itemId !== undefined && !itemId)) return null;
  return { section, itemId: itemId || null };
};

export const adminPathname = (locale, { section, itemId = null }) => {
  const base = `/${encodeURIComponent(locale)}/admin/${section}`;
  return itemId ? `${base}/${encodeURIComponent(itemId)}` : base;
};
