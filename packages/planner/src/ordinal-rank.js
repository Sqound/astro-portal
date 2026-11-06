// The rank of a suggestion written as an ordinal in the page's language:
// French « 1ᵉʳ », « 2ᵉ »; English « 1st », « 2nd »,
// « 3rd », « 11th », « 21st »; German « 1. »; Spanish « 1.º »; Italian and
// Portuguese « 1º »; Japanese « 1位 »; Chinese « 第1名 »; Russian « № 1 ».
// The same rule as the mobile application's. The catalogues'
// `suggestRank` then holds `{rank}` alone.
const englishSuffix = { one: "st", two: "nd", few: "rd", other: "th" };

export function ordinalRank(locale, rank) {
  const n = Number(rank);
  if (!Number.isInteger(n) || n < 1) return String(rank ?? "");
  const language = String(locale || "en")
    .toLowerCase()
    .split(/[-_]/)[0];
  const tag = String(locale || "").toLowerCase();
  switch (language) {
    case "fr":
      return n === 1 ? "1ᵉʳ" : `${n}ᵉ`;
    case "en":
      return `${n}${englishSuffix[new Intl.PluralRules("en", { type: "ordinal" }).select(n)] || "th"}`;
    case "de":
      return `${n}.`;
    case "es":
      return `${n}.º`;
    case "it":
    case "pt":
      return `${n}º`;
    case "ja":
      return `${n}位`;
    case "ru":
      return `№ ${n}`;
    case "zh":
      return tag.includes("hant") || tag.includes("tw") || tag.includes("hk")
        ? `第 ${n} 名`
        : `第${n}名`;
    default:
      return String(n);
  }
}
