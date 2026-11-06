/**
 * One line per place the person can tell apart. The geocoder answers the same
 * hamlet once for its node, once for its polygon, once for its relation --
 * three results that read the same. The first of each label (the geocoder
 * ranks the best first) is kept, in order.
 */
export function distinctPlaceResults(results) {
  const seen = new Set();
  return (Array.isArray(results) ? results : []).filter((result) => {
    const label = String(result?.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!label) return true;
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/**
 * The two lines of one result of the address search: the place's own name and,
 * under it, where it is -- what the full name says after the name already
 * shown ("Saint-Véran" over "Provence-Alpes-Côte d'Azur, France"), never the
 * name said twice. `detail` is `""` when the full name adds nothing.
 */
export function placeResultLines(result) {
  const full = String(result?.name ?? "").trim();
  const short = String(result?.shortName ?? "").trim() || full;
  if (!full || full === short) return { title: short, detail: "" };
  const rest = full.startsWith(short)
    ? full.slice(short.length).replace(/^[\s,;–-]+/, "")
    : full;
  return { title: short, detail: rest };
}
