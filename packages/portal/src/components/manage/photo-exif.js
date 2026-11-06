/**
 * The date and the position a photo carries in its EXIF, read in the browser
 * for the form « Nouvelle cible » of the add box (« D'après la photo. », « Lieu
 * enregistré le plus proche de la photo. »).
 * JPEG (APP1 « Exif ») and TIFF are read from their first bytes; anything
 * else answers nothing. Nothing leaves the browser: the values only prefill
 * the form, where the person changes them.
 *
 * `{ date: "YYYY-MM-DD" | null, time: "HH:MM" | null, latitude, longitude }`
 * (degrees or `null`).
 */

const HEAD_BYTES = 256 * 1024;
const TAG = {
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
  dateTime: 0x0132,
  latitudeRef: 0x0001,
  latitude: 0x0002,
  longitudeRef: 0x0003,
  longitude: 0x0004,
};
const NOTHING = Object.freeze({
  date: null,
  time: null,
  latitude: null,
  longitude: null,
});

/** The tags of one IFD: `Map<tag, { type, count, offset }>`. */
function readIfd(view, base, offset, little) {
  const tags = new Map();
  if (offset + 2 > view.byteLength) return tags;
  const count = Math.min(view.getUint16(offset, little), 512);
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const values = view.getUint32(entry + 4, little);
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[type] ?? 1;
    const inline = size * values <= 4;
    tags.set(tag, {
      type,
      count: values,
      offset: inline ? entry + 8 : base + view.getUint32(entry + 8, little),
    });
  }
  return tags;
}

const ascii = (view, { offset, count }) => {
  let text = "";
  for (
    let index = 0;
    index < count && offset + index < view.byteLength;
    index += 1
  ) {
    const code = view.getUint8(offset + index);
    if (!code) break;
    text += String.fromCharCode(code);
  }
  return text;
};

function degrees(view, entry, little) {
  if (!entry || entry.type !== 5 || entry.count < 3) return null;
  const rational = (index) => {
    const at = entry.offset + index * 8;
    if (at + 8 > view.byteLength) return NaN;
    const denominator = view.getUint32(at + 4, little);
    return denominator ? view.getUint32(at, little) / denominator : NaN;
  };
  const value = rational(0) + rational(1) / 60 + rational(2) / 3600;
  return Number.isFinite(value) ? value : null;
}

/** The EXIF of the TIFF structure at `base` of `view`. */
function readTiff(view, base) {
  if (base + 8 > view.byteLength) return NOTHING;
  const order = view.getUint16(base, false);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return NOTHING;
  if (view.getUint16(base + 2, little) !== 42) return NOTHING;
  const first = readIfd(
    view,
    base,
    base + view.getUint32(base + 4, little),
    little,
  );
  const exifAt = first.get(TAG.exifIfd);
  const exif = exifAt
    ? readIfd(view, base, base + view.getUint32(exifAt.offset, little), little)
    : new Map();
  const stamp =
    (exif.get(TAG.dateTimeOriginal) &&
      ascii(view, exif.get(TAG.dateTimeOriginal))) ||
    (first.get(TAG.dateTime) && ascii(view, first.get(TAG.dateTime))) ||
    "";
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(stamp);
  const gpsAt = first.get(TAG.gpsIfd);
  const gps = gpsAt
    ? readIfd(view, base, base + view.getUint32(gpsAt.offset, little), little)
    : new Map();
  let latitude = degrees(view, gps.get(TAG.latitude), little);
  let longitude = degrees(view, gps.get(TAG.longitude), little);
  if (latitude !== null && gps.get(TAG.latitudeRef))
    if (ascii(view, gps.get(TAG.latitudeRef)) === "S") latitude = -latitude;
  if (longitude !== null && gps.get(TAG.longitudeRef))
    if (ascii(view, gps.get(TAG.longitudeRef)) === "W") longitude = -longitude;
  return {
    date: match ? `${match[1]}-${match[2]}-${match[3]}` : null,
    time: match ? `${match[4]}:${match[5]}` : null,
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
  };
}

/** What the EXIF of the bytes `buffer` (an `ArrayBuffer`) says. */
export function exifOf(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return NOTHING;
    if (view.getUint16(0, false) === 0xffd8) {
      let offset = 2;
      while (offset + 4 <= view.byteLength) {
        const marker = view.getUint16(offset, false);
        const length = view.getUint16(offset + 2, false);
        if (marker === 0xffe1 && offset + 10 <= view.byteLength) {
          const header = ascii(view, { offset: offset + 4, count: 4 });
          if (header === "Exif") return readTiff(view, offset + 10);
        }
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
        offset += 2 + length;
      }
      return NOTHING;
    }
    return readTiff(view, 0);
  } catch {
    return NOTHING;
  }
}

/** The EXIF of a file the person chose (its first 256 KB are read). */
export async function photoExif(file) {
  try {
    return exifOf(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    return NOTHING;
  }
}

/** The distance in kilometres between two points (haversine). */
export function distanceKm(from, to) {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The saved place nearest to a photo's position, or `null`. */
export function nearestPlace(places, position) {
  if (
    !Number.isFinite(position?.latitude) ||
    !Number.isFinite(position?.longitude)
  )
    return null;
  let best = null;
  for (const place of places ?? []) {
    if (!Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude))
      continue;
    const distance = distanceKm(position, place);
    if (!best || distance < best.distance) best = { place, distance };
  }
  return best?.place ?? null;
}

/**
 * The name a file proposes for a new target (« Cygne_grand_champ.jpg » →
 * « Cygne grand champ »): its base name, separators made spaces.
 */
export function nameFromFile(name) {
  return String(name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
