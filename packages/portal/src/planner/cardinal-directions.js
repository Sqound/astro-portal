const labels = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/** Compass initials in the reader's language, for eight or sixteen points. */
export function cardinalDirection(azimuth, locale = "fr", points = 8) {
  const value = Number(azimuth);
  if (!Number.isFinite(value)) return "";
  const language = String(locale).split("-")[0];
  const east = language === "de" ? "O" : language === "pt" ? "L" : "E";
  let west = "W";
  switch (language) {
    case "fr":
    case "es":
    case "it":
    case "pt":
      west = "O";
      break;
  }
  const count = points === 16 ? 16 : 8;
  const index =
    Math.round((((value % 360) + 360) % 360) / (360 / count)) % count;
  return labels[index * (16 / count)]
    .replaceAll("E", east)
    .replaceAll("W", west);
}
