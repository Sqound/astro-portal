import { targetImageVariant } from "portal/target-image-variants.js";
import { targetLibrarySearch } from "./target-library.server.js";

// The picture of each target a page lists, read where the page is made, from
// the same rows as `GET /api/target-library?targetIds=…` (the catalogue's
// cards, the plan's dialog): one read for the page, the ids once each, the
// pictogram of the target's type where the catalogue has no picture. The pages
// of the Journal and of the debriefing drew the pictogram of every target
// (JOURNAL-TARGET-PICTURES-01). Nothing is thrown: a catalogue that cannot be
// read leaves the pictograms.

const CHUNK = 90;

/**
 * `{ [targetId]: { url, visualUrl, typeKey } }` for the ids the catalogue
 * holds. `url` is the photograph's thumbnail (`null` where there is none: the
 * entry still carries the type for the pictogram), `visualUrl` the visual
 * observing picture, when there is one.
 */
export async function targetPicturesOf(ids, locale = "en") {
  const wanted = [
    ...new Set(
      (ids ?? []).filter(
        (id) => typeof id === "string" && id && id.length < 200,
      ),
    ),
  ];
  const pictures = {};
  for (let start = 0; start < wanted.length; start += CHUNK) {
    const chunk = wanted.slice(start, start + CHUNK);
    try {
      const answer = await targetLibrarySearch({
        locale,
        targetIds: chunk,
        limit: chunk.length,
      });
      for (const row of answer?.targets ?? []) {
        if (!row?.id || !chunk.includes(row.id)) continue;
        const photo = targetImageVariant(row);
        const visual = targetImageVariant(row, { visualMode: true });
        pictures[row.id] = {
          url: photo.url ?? null,
          visualUrl: visual.source === "visual" ? visual.url : null,
          typeKey: row.typeKey ?? null,
        };
      }
    } catch {
      // The pictograms stay.
    }
  }
  return pictures;
}
