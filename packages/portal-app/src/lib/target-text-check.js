// The automatic check of a catalogue text against the facts table:
// every number of a text of a target, in any of the ten languages, must
// be in the table of that target, or be flagged.
//
//   extractNumbers(text, locale)          the numbers a text states
//   checkTargetText({ text, locale, row })  each number against the row's facts
//
// What it reads: digits, with the grouping and the decimal mark of the
// language (« 1 350 », « 1.350 », « 1,350 », « 2,5 », « 2.5 », the no-break,
// narrow and thin spaces), the scale words (« millions », « milliards »,
// « Millionen », « Milliarden » for 10^9 but « Billionen » for 10^12,
// « mil millones », « bilhões », « млн », « млрд », 万, 億, 亿), the units that
// give a number its meaning (light-years, parsecs, kilometres, astronomical
// units, arcminutes, arcseconds, degrees, magnitudes, years, kilometres per
// second, solar and Earth masses, kelvins, percent) and the date forms
// (« en 1785 », « 1785年 », « XVIIIe siècle », « 18th century », « 1920s »),
// and the calendar dates, whole or partial, in each language's own form
// (« le 19 février 2027 », « 1er mars », « février 2027 », « February 19,
// 2027 », « 19. Februar 2027 », « 19 de febrero de 2027 », « 19 февраля 2027 г. »,
// « 2027年2月19日 », « 2027-02-19 »): the day of a date is never a bare number.
//
// What it does not read, on purpose: a number written in words (« deux »,
// « twelve »: the text writer is told to write every quantity in digits), a
// catalogue designation (« M31 », « NGC 224 », « Sh2-240 », « LDN 1622 »,
// « C 14 »: never a quantity), the number of a space mission (« Voyager 2 »),
// the target's own names.
//
// Tolerance, declared (`tolerance`): a number with a unit matches a value of
// the table when it is that value rounded to the digits the text writes it
// with (« 2,5 millions » for 2.54 million), or within 5 % of it
// (« environ »); a number without a unit only when it is the value written
// to the same digits (« 14 » for 14, never « 10 »); a magnitude within 0.1;
// a year exactly (a decade or a century when the text says so). A number
// whose dimension the table holds nothing of is `absent`; one whose
// dimension it holds, but with no value close enough, is `mismatch`. A
// number with neither a unit nor a word saying what it counts is also
// listed apart (`unitless`), for the reader, without failing the text.
//
// A calendar date is checked whole against the dated facts of the table (a
// record's `date` field, « 2027-02-19 », or the date its `label` states): `ok`
// when the table holds that day (for a month and a year: that month; for a
// day and a month: that day of some year), `mismatch` when it holds dated
// facts, none that one, `absent` when it holds no dated fact (a bare year is
// not one).

import { localeEntry } from "astro-contracts/locales";
import { toBase } from "./target-facts.js";

export const tolerance = Object.freeze({
  /** Relative difference accepted between a text number and a table value. */
  relative: 0.05,
  /** Difference accepted between two magnitudes. */
  magnitude: 0.1,
  /** A year is exact; a century or a decade is a range. */
  year: 0,
  /** A number without a unit: the table value written to the same digits
   * (decimal places of the text, after its scale word), no relative margin. */
  bare: "digits",
});

const spaces = "     ";
const space = `[${spaces}]`;

// The decimal mark and the script spacing are the registry's typography of
// the exact tag, never a list of locales kept here: a tag the registry does
// not hold reads « . » and Latin spacing, as before.
const usesDecimalComma = (locale) =>
  localeEntry(locale)?.typography?.decimalSeparator === ",";
const isHanLocale = (locale) =>
  localeEntry(locale)?.typography?.spacing === "han";

const scales = {
  fr: [
    ["milliards?", 1e9],
    ["millions?", 1e6],
    ["billions?", 1e12],
    ["mille", 1e3],
  ],
  en: [
    ["trillions?", 1e12],
    ["billions?", 1e9],
    ["millions?", 1e6],
    ["thousand", 1e3],
  ],
  de: [
    ["Billionen|Billion", 1e12],
    ["Milliarden|Milliarde", 1e9],
    ["Millionen|Million", 1e6],
    ["Tausend", 1e3],
  ],
  es: [
    ["mil millones", 1e9],
    ["billones|billón", 1e12],
    ["millones|millón", 1e6],
    ["mil", 1e3],
  ],
  it: [
    ["miliardi|miliardo", 1e9],
    ["bilioni|bilione", 1e12],
    ["milioni|milione", 1e6],
    ["mila|mille", 1e3],
  ],
  "pt-BR": [
    ["bilhões|bilhão", 1e9],
    ["trilhões|trilhão", 1e12],
    ["milhões|milhão", 1e6],
    ["mil", 1e3],
  ],
  ru: [
    // Every case of the noun: « в 53 миллионах световых лет ».
    ["трлн\\.?|триллион(?:ами|ах|ов|ом|а|е|у)?", 1e12],
    ["млрд\\.?|миллиард(?:ами|ах|ов|ом|а|е|у)?", 1e9],
    ["млн\\.?|миллион(?:ами|ах|ов|ом|а|е|у)?", 1e6],
    ["тыс\\.?|тысяч(?:ами|ах|ей|ам|а|и|е|у)?", 1e3],
  ],
  ja: [
    ["兆", 1e12],
    ["億", 1e8],
    ["万", 1e4],
    ["千", 1e3],
  ],
  "zh-Hans": [
    ["万亿", 1e12],
    ["亿", 1e8],
    ["万", 1e4],
    ["千", 1e3],
  ],
  "zh-Hant": [
    ["兆", 1e12],
    ["億", 1e8],
    ["萬", 1e4],
    ["千", 1e3],
  ],
};

const scaleRegexes = Object.fromEntries(
  Object.entries(scales).map(([locale, entries]) => [
    locale,
    entries.map(([pattern, factor]) => [
      new RegExp(`^(?:${pattern})(?![\\p{L}])`, "iu"),
      factor,
    ]),
  ]),
);
// CJK scale characters need no word boundary after them, except « 千 » in
// « 千米 » (kilometre) and « 千克 » (kilogram), a unit, not a thousand.
for (const locale of Object.keys(scales).filter(isHanLocale))
  scaleRegexes[locale] = scales[locale].map(([pattern, factor]) => [
    new RegExp(`^(?:${pattern})${pattern === "千" ? "(?![米克])" : ""}`, "u"),
    factor,
  ]);

const connector =
  /^(?:d[’']\s?|d[eiu]\s+|of\s+|von\s+|da\s+|do[s]?\s+|del\s+|de\s+la\s+)/iu;

// Unit words, tried in this order at the start of what follows a number.
// The symbol is the one of `target-facts.js`'s unit table.
const unitPatterns = [
  [
    "km/s/Mpc",
    /^(?:km\s?\/\s?s\s?\/\s?Mpc|km\s?s[-−]1\s?Mpc[-−]1|км\s?\/\s?с\s?\/\s?Мпк|公里\/秒\/百万秒差距|キロメートル毎秒毎メガパーセク)/iu,
  ],
  [
    "km/s",
    // The unit written in words is read too (« 4 000 kilomètres par
    // seconde »): read as a length, it was a distance (tier B).
    /^(?:km\s?\/\s?s\b|km\s?s[-−]1\b|км\s?\/\s?с\b|公里\/秒|キロメートル毎秒|公里每秒|千米\/秒|(?:km|kilomètres?)\s+par\s+seconde|kilomet(?:re|er)s?\s+(?:per|a)\s+second|Kilometer[n]?\s+(?:pro|je|in\s+der)\s+Sekunde|kilómetros?\s+por\s+segundo|chilometri\s+(?:al|per|ogni)\s+secondo|quilômetros?\s+por\s+segundo|километр(?:а|ов)?\s+в\s+секунду)/iu,
  ],
  ["Gly", /^(?:Gly\b)/u],
  ["Mly", /^(?:Mly\b)/u],
  ["kly", /^(?:kly\b)/u],
  [
    "ly",
    /^(?:années?[\s  -]*lumière|light[\s-]*years?|Lichtjahr(?:en|e)?|años?[\s-]*luz|anni?[\s-]*luce|anos?[\s-]*luz|световых?\s+(?:лет|года)|светов(?:ой|ого)\s+год[а]?|св\.?\s?лет|光年|ly\b)/iu,
  ],
  ["Gpc", /^(?:Gpc\b)/u],
  ["Mpc", /^(?:Mpc\b|мегапарсек(?:а|ов)?)/iu],
  ["kpc", /^(?:kpc\b|килопарсек(?:а|ов)?)/iu],
  [
    "pc",
    /^(?:pc\b|parsecs?\b|parsek\b|パーセク|秒差距|парсек(?:а|ов)?|пк\b)/iu,
  ],
  // The astronomical unit is read per language (`astronomicalUnitPatterns`):
  // its abbreviations are words elsewhere (« au » in French).
  ["AU", null],
  [
    "km",
    /^(?:km\b|kilomètres?|kilometres?|kilometers?|Kilometer[n]?\b|kilómetros?|chilometri|quilômetros?|キロメートル|キロ(?![\p{L}])|公里|千米|километр(?:а|ов)?|км\b)/iu,
  ],
  [
    // The aperture or focal length of an instrument (« 100 mm »).
    "mm",
    /^(?:mm\b|millimètres?|millimetres?|millimeters?|Millimeter[n]?\b|milímetros?|millimetri|ミリメートル|ミリ(?![\p{L}])|毫米|миллиметр(?:а|ов)?|мм\b)/iu,
  ],
  [
    "arcmin",
    /^(?:′|'(?!\w)|’(?!\w)|arcmin\b|minutes?\s+d[’']arc|arcminutes?|minutes?\s+of\s+arc|Bogenminuten?|arcminutos?|minutos?\s+de\s+arco|primi\s+d[’']arco|minutos?\s+de\s+arco|分角|角分|угловы\p{L}+\s+минут\p{L}*|угл\.\s?мин)/iu,
  ],
  [
    "arcsec",
    /^(?:″|”|''|arcsec\b|secondes?\s+d[’']arc|arcseconds?|seconds?\s+of\s+arc|Bogensekunden?|arcsegundos?|segundos?\s+de\s+arco|secondi\s+d[’']arco|角秒|угловы\p{L}+\s+секунд\p{L}*)/iu,
  ],
  [
    "°C",
    /^(?:°\s?[CС]\b|℃|degrés?\s+Celsius|degrees?\s+Celsius|Grad\s+Celsius|grados?\s+Celsius|gradi\s+Celsius|graus?\s+Celsius|攝氏|摄氏|градус\p{L}*\s+Цельси\p{L}*)/iu,
  ],
  ["K", /^(?:K\b|kelvins?\b|ケルビン|開爾文|开尔文|кельвин\p{L}*)/iu],
  [
    "deg",
    /^(?:°|degrés?\b|degrees?\b|Grad\b|grados?\b|gradi\b|graus?\b|度|градус\p{L}*)/iu,
  ],
  [
    "M☉",
    /^(?:M☉|M_?sun\b|masses?\s+solaires?|solar\s+masses?|Sonnenmassen?|masas?\s+solares?|masse\s+solari|massas?\s+solares?|太陽質量|太阳质量|солнечн\p{L}+\s+масс\p{L}*)/iu,
  ],
  [
    "M⊕",
    /^(?:M⊕|masses?\s+terrestres?|Earth\s+masses?|Erdmassen?|masas?\s+terrestres?|masse\s+terrestri|massas?\s+terrestres?|地球質量|地球质量|земн\p{L}+\s+масс\p{L}*)/iu,
  ],
  [
    "kg",
    /^(?:kg\b|kilogrammes?|kilograms?|Kilogramm|kilogramos?|chilogrammi|quilogramas?|キログラム|公斤|килограмм\p{L}*)/iu,
  ],
  [
    "%",
    /^(?:%|％|pour\s+cent|percent|Prozent|por\s+ciento|per\s+cento|por\s+cento|процент\p{L}*|パーセント)/iu,
  ],
  [
    "mag",
    /^(?:mag(?:nitudes?)?\b|magnitud(?:es)?\b|magnitudin[ei]\b|Größen?\b|等級|等级|等(?![\p{L}])|звёздн\p{L}+\s+величин\p{L}*|зв\.\s?вел\.)/iu,
  ],
  [
    "yr",
    /^(?:years?\b|ans?\b|années?\b|Jahre[n]?\b|Jahr\b|años?\b|anni\b|anno\b|anos?\b|лет\b|год[а]?\b|年)/iu,
  ],
];

// The astronomical unit, language by language, case-sensitive: the symbol
// only in the case the language writes it, so that a word of the language
// is never read as the unit (« magnitude 4 au milieu » is not « 4 UA »;
// « 4 AU » is English, « 4 au » is not read). The full names keep their
// capital and small initials.
const astronomicalUnitPatterns = {
  fr: /^(?:UA\b|ua\b|[uU]nités?\s+astronomiques?\b)/u,
  en: /^(?:AU\b|[aA]stronomical\s+[uU]nits?\b)/u,
  de: /^(?:AE\b|[aA]stronomische[rn]?\s+Einheit(?:en)?\b)/u,
  es: /^(?:UA\b|ua\b|[uU]nidad(?:es)?\s+astron[oó]micas?\b)/u,
  it: /^(?:UA\b|ua\b|[uU]nit[àa]\s+astronomiche?\b)/u,
  "pt-BR": /^(?:UA\b|ua\b|[uU]nidades?\s+astron[oô]micas?\b)/u,
  ru: /^(?:а\.\s?е\.|[аА]строномическ\p{L}+\s+единиц\p{L}*)/u,
  // CJK texts write the unit in full, or the international symbol « AU »
  // (no word of these languages is written in Latin capitals).
  ja: /^(?:天文単位|AU\b)/u,
  "zh-Hans": /^(?:天文单位|AU\b)/u,
  "zh-Hant": /^(?:天文單位|AU\b)/u,
};

// `\b` knows only ASCII letters, even with the `u` flag: after « лет » or
// « Größen » it never matches. A unit word ends where no letter or digit of an
// alphabet goes on; a kana or a hanzi may follow it (« 17 km/sで »: Japanese
// and Chinese write no space after a unit, tier B).
const wordEnd =
  "(?![\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{N}])";
const withWordEnd = (regex) =>
  new RegExp(regex.source.replaceAll("\\b", wordEnd), regex.flags);
for (const entry of unitPatterns)
  if (entry[1]) entry[1] = withWordEnd(entry[1]);
for (const locale of Object.keys(astronomicalUnitPatterns))
  astronomicalUnitPatterns[locale] = withWordEnd(
    astronomicalUnitPatterns[locale],
  );

const unitPatternsByLocale = new Map();
/** The unit patterns of a language, in the order they are tried. */
function unitPatternsFor(locale) {
  const key = astronomicalUnitPatterns[locale] ? locale : "en";
  if (!unitPatternsByLocale.has(key))
    unitPatternsByLocale.set(
      key,
      unitPatterns.map(([symbol, regex]) => [
        symbol,
        symbol === "AU" ? astronomicalUnitPatterns[key] : regex,
      ]),
    );
  return unitPatternsByLocale.get(key);
}

// The small words after a number that say nothing of what it counts: a
// number followed by one of them (or by nothing) has neither unit nor
// context, and is reported apart (`unitless`).
const functionWords = new Set(
  [
    // fr
    "et ou à au aux de du des d en sur pour par dans avec sans le la les l un une que qui contre",
    // en
    "and or to of in on for at by the a an with than against",
    // de
    "und oder bis zu von vom im in auf für mit der die das als gegen",
    // es
    "y o a al de del en con por para el la los las que contra",
    // it
    "e o a al di del in con per il la le che contro",
    // pt-BR
    "e ou a ao de do da em com por para o os as que contra",
    // ru
    "и или до в на с по к от против",
  ]
    .join(" ")
    .split(" "),
);
// A range or an alternative between two numbers (« 6 à 7 étoiles »,
// « 10 ou 15 fois »): the first number counts what the second counts.
const rangeWords = new Set([
  ...["à", "ou", "to", "or", "bis", "oder", "a", "o", "al", "até", "ou"],
  ...["до", "или", "-", "–"],
]);

// « magnitude 3,4 », « magnitude de 3,4 », and with one qualifying word
// between (« magnitude totale de 1,6 », « Helligkeit insgesamt »); the sign
// of a negative magnitude (« magnitude −12,7 ») is left out of the lead.
const beforeMagnitude =
  /(?:magnitudes?|magnitud(?:es)?|magnitudin[ei]|Helligkeit|Größe|星等|視等級|视星等|等級|等级|звёздн\p{L}+\s+величин\p{L}*|величин\p{L}*|\bmag\.?)(?:\s+\p{L}+)?\s*(?:de|von|of|di|da|=|:)?\s*[−-]?$/iu;
const beforePercent = /(?:百分之)\s*$/u;

const designationPrefixes = [
  "Messier",
  "M",
  "NGC",
  "IC",
  "Caldwell",
  "C",
  "Barnard",
  "B",
  "LDN",
  "LBN",
  "Sh\\s?2",
  "Sharpless",
  "Abell",
  "Mel",
  "Melotte",
  "Cr",
  "Collinder",
  "Stock",
  "Trumpler",
  "Tr",
  "Berkeley",
  "Harvard",
  "Cl",
  "ESO",
  "UGC",
  "PGC",
  "MCG",
  "Arp",
  "Mrk",
  "HD",
  "HR",
  "HIP",
  "SAO",
  "GJ",
  "SN",
  "PSR",
  "Kepler",
  "Gliese",
  "TRAPPIST",
  "Voyager",
  "Apollo",
  "Pioneer",
  "Mariner",
  "Viking",
  "Luna",
  "Lunokhod",
  "Venera",
  "Vega",
  "Sputnik",
  "Zond",
  "Surveyor",
  "Ranger",
  "Hayabusa",
  "Chang['’]e",
  "ボイジャー",
  "アポロ",
  "パイオニア",
  "マリナー",
  "バイキング",
  "ルナ",
  "ベネラ",
  "旅行者",
  "阿波罗",
  "阿波羅",
  "先驱者",
  "先驅者",
  "水手",
  "海盗",
  "月球",
  "金星",
  "Вояджер",
  "Аполлон",
  "Пионер",
  "Маринер",
  "Викинг",
  "Луна",
  "Венера",
];
// A designation may follow a kana or a hanzi with no space (« 近くにあるM36と »):
// only a letter of an alphabet or a digit before it makes it part of a word.
const designationPattern = new RegExp(
  `(?<![\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{N}])(?:${designationPrefixes.join("|")})[${spaces}-]?\\d+(?:[.-]\\d+)*[A-Za-z]?(?![\\p{N}])`,
  "gu",
);

const fillCharacter = "\u0000";

function mask(text, names) {
  let masked = text;
  const found = [];
  const blank = (match) => {
    found.push({ index: match.index, raw: match[0] });
    masked =
      masked.slice(0, match.index) +
      fillCharacter.repeat(match[0].length) +
      masked.slice(match.index + match[0].length);
  };
  for (const match of [...text.matchAll(designationPattern)]) blank(match);
  for (const name of names) {
    if (!name || !/\d/.test(name)) continue;
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of [...masked.matchAll(new RegExp(escaped, "giu"))])
      blank(match);
  }
  return { masked, designations: found };
}

// ---------------------------------------------------------------------------
// Calendar dates, whole or partial, in the ten languages.

// Per language: the twelve month names (alternatives, abbreviations included).
// The case is read per language: « Mars » is the planet in French, « mars »
// the month, so French reads only the lowercase for it; English and German
// name the months with a capital; the others read either.
const monthNames = {
  fr: [
    "janvier|janv\\.",
    "février|fevrier|févr\\.",
    "mars",
    "avril|avr\\.",
    "mai",
    "juin",
    "juillet|juil\\.",
    "août|aout",
    "septembre|sept\\.",
    "octobre|oct\\.",
    "novembre|nov\\.",
    "décembre|decembre|déc\\.",
  ],
  en: [
    "January|Jan\\.?",
    "February|Feb\\.?",
    "March|Mar\\.?",
    "April|Apr\\.?",
    "May",
    "June|Jun\\.?",
    "July|Jul\\.?",
    "August|Aug\\.?",
    "September|Sept\\.?|Sep\\.?",
    "October|Oct\\.?",
    "November|Nov\\.?",
    "December|Dec\\.?",
  ],
  de: [
    "Januar|Jänner|Jan\\.",
    "Februar|Feb\\.",
    "März|Marz|Mär\\.",
    "April|Apr\\.",
    "Mai",
    "Juni|Jun\\.",
    "Juli|Jul\\.",
    "August|Aug\\.",
    "September|Sept\\.|Sep\\.",
    "Oktober|Okt\\.",
    "November|Nov\\.",
    "Dezember|Dez\\.",
  ],
  es: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre|setiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  it: [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
  ],
  "pt-BR": [
    "janeiro|jan\\.",
    "fevereiro|fev\\.",
    "março|marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ],
  // Genitive after a day (« 19 февраля »), prepositional after « в »
  // (« в феврале »), nominative alone: the endings of each.
  ru: [
    "январ(?:ь|я|е)",
    "феврал(?:ь|я|е)",
    "март(?:а|е)?",
    "апрел(?:ь|я|е)",
    "ма(?:й|я|е)",
    "июн(?:ь|я|е)",
    "июл(?:ь|я|е)",
    "август(?:а|е)?",
    "сентябр(?:ь|я|е)",
    "октябр(?:ь|я|е)",
    "ноябр(?:ь|я|е)",
    "декабр(?:ь|я|е)",
  ],
};
const monthCase = { en: "exact", de: "exact", fr: "initial" };

const calendarLocales = new Set(Object.keys(monthNames));

// The top-level alternatives of a pattern entry (the ru entries hold groups).
function topLevelAlternatives(entry) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of entry) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += character;
  }
  parts.push(current);
  return parts;
}

const monthMatchers = {};
const monthAlternation = {};
for (const [locale, names] of Object.entries(monthNames)) {
  const mode = monthCase[locale] || "any";
  const caseFlag = mode === "any" ? "iu" : "u";
  const withCase = (alternative) =>
    mode === "initial" && alternative !== "mars"
      ? `[${alternative[0].toUpperCase()}${alternative[0]}]${alternative.slice(1)}`
      : alternative;
  monthMatchers[locale] = names.map(
    (entry) =>
      new RegExp(
        `^(?:${topLevelAlternatives(entry).map(withCase).join("|")})$`,
        caseFlag,
      ),
  );
  const all = names
    .flatMap((entry) => topLevelAlternatives(entry))
    .sort((a, b) => b.length - a.length)
    .map(withCase);
  monthAlternation[locale] = {
    source: `(?<month>${all.join("|")})(?![\\p{L}])`,
    flags: caseFlag,
  };
}

const dayOrdinal = {
  fr: "(?:er|ᵉʳ|re)?",
  en: "(?:st|nd|rd|th)?",
  de: "\\.?",
  es: "(?:\\.?[º°])?",
  "pt-BR": "(?:\\.?[º°])?",
  it: "[º°]?",
  ru: "(?:-?го)?",
};
const yearNumber = "(?<year>[12]\\d{3})(?!\\d)";
const yearSuffixRu = "(?:\\s*(?:г\\.|года?|г)(?![\\p{L}]))?";
const before = "(?<![\\p{L}\\p{N}.,])";

// Day-first and month-first forms of a day, a month and an optional year.
function dayMonthSources(locale) {
  const month = monthAlternation[locale]?.source;
  const day = `(?<day>[0-3]?\\d)${dayOrdinal[locale] ?? ""}(?!\\d)`;
  switch (locale) {
    case "fr":
      return [`${before}${day}\\s+${month}(?:\\s+${yearNumber})?`];
    case "de":
      return [`${before}${day}\\s*${month}(?:\\s+${yearNumber})?`];
    case "es":
    case "pt-BR":
      return [
        `${before}${day}(?:\\s+de)?\\s+${month}(?:\\s+(?:de\\s+)?${yearNumber})?`,
      ];
    case "it":
      return [`${before}${day}(?:\\s+di)?\\s+${month}(?:\\s+${yearNumber})?`];
    case "ru":
      return [
        `${before}${day}\\s+${month}(?:\\s+${yearNumber}${yearSuffixRu})?`,
      ];
    case "en":
      return [
        // February 19, 2027; February 19–21, 2027
        `${before}${month}\\s+(?<day>[0-3]?\\d)${dayOrdinal.en}(?:\\s*[-–—]\\s*(?<day2>[0-3]?\\d)${dayOrdinal.en})?(?!\\d)(?:,?\\s+${yearNumber})?`,
        // 19 February 2027; the 19th of February
        `${before}${day}(?:\\s+of)?\\s+${month}(?:,?\\s+${yearNumber})?`,
      ];
    default:
      return [];
  }
}

function monthYearSource(locale) {
  const month = monthAlternation[locale]?.source;
  if (!month) return null;
  switch (locale) {
    case "es":
    case "pt-BR":
      return `${before}${month}(?:\\s+de)?\\s+${yearNumber}`;
    case "ru":
      return `${before}${month}\\s+${yearNumber}${yearSuffixRu}`;
    default:
      return `${before}${month}\\s+${yearNumber}`;
  }
}

// Forms shared by every language: ISO, and the numeric day/month/year.
const isoDate =
  /(?<![\d.,/-])(?<year>[12]\d{3})(?<sep>[-/.])(?<month>0[1-9]|1[0-2])\k<sep>(?<day>0[1-9]|[12]\d|3[01])(?!\d)/gu;
const isoMonth =
  /(?<![\d.,/-])(?<year>[12]\d{3})-(?<month>0[1-9]|1[0-2])(?![\d-])/gu;
const numericDate =
  /(?<![\d.,/-])(?<first>\d{1,2})(?<sep>[./-])(?<second>\d{1,2})\k<sep>(?<year>[12]\d{3})(?!\d)/gu;

const cjkDates = [
  /(?<![\d])(?<year>[12]\d{3})\s?年\s?(?<month>\d{1,2})\s?月(?:\s?(?<day>\d{1,2})\s?[日号號])?/gu,
  /(?<![\d])(?<month>\d{1,2})\s?月\s?(?<day>\d{1,2})\s?[日号號]/gu,
  // A month alone (« 2月 »): read as a month, nothing to check.
  /(?<![\d])(?<month>\d{1,2})\s?月/gu,
];

const compiledCalendar = new Map();
function calendarRegexes(locale) {
  if (!compiledCalendar.has(locale)) {
    const flags = `g${monthAlternation[locale].flags}`;
    const monthYear = monthYearSource(locale);
    compiledCalendar.set(locale, {
      dayMonth: dayMonthSources(locale).map(
        (source) => new RegExp(source, flags),
      ),
      monthYear: monthYear ? new RegExp(monthYear, flags) : null,
    });
  }
  return compiledCalendar.get(locale);
}

function monthOf(name, locale) {
  const at = monthMatchers[locale]?.findIndex((regex) => regex.test(name));
  return at >= 0 ? at + 1 : null;
}

// « 19 au 21 février »: the day before the range word is a date of the same
// month and year.
const rangeBefore =
  /(?<![\d.,])(?<day>[0-3]?\d)(?:er|ᵉʳ|re|º|°|\.º|\.|st|nd|rd|th)?\s*(?:au|et|ou|à|a|al|y|e|bis|und|oder|to|and|or|until|по|и|или|до|[-–—])\s*$/u;

// A day that does not exist (« 31 février ») is still read as a date: the
// table holds no such day, so it comes out as a mismatch.
const validDay = (month, day) =>
  month >= 1 && month <= 12 && day >= 1 && day <= 31;

/**
 * The calendar dates of a text: `[{ raw, index, end, year, month, day,
 * silent }]`, where `year`, `month` and `day` are numbers or `null` (a
 * month is always there). A `silent` entry is only read to keep its digits
 * from being counted as a quantity.
 */
export function extractCalendarDates(text, locale = "en") {
  const source = String(text || "");
  const found = [];
  const taken = (start, end) =>
    found.some((entry) => start < entry.end && end > entry.index);
  const add = (start, end, parts, silent = false) => {
    if (taken(start, end)) return false;
    const { year = null, month = null, day = null } = parts;
    if (month === null || month < 1 || month > 12) return false;
    if (day !== null && (day < 1 || day > 31)) return false;
    found.push({
      raw: source.slice(start, end).trim(),
      index: start,
      end,
      year,
      month,
      day,
      silent,
    });
    return true;
  };
  const read = (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    year: match.groups.year ? Number(match.groups.year) : null,
    day: match.groups.day ? Number(match.groups.day) : null,
  });

  for (const regex of [isoDate, isoMonth])
    for (const match of source.matchAll(regex)) {
      const { start, end, year, day } = read(match);
      add(start, end, { year, month: Number(match.groups.month), day });
    }
  if (locale === "ja" || locale.startsWith("zh")) {
    for (const regex of cjkDates)
      for (const match of source.matchAll(regex)) {
        const { start, end, year, day } = read(match);
        const month = Number(match.groups.month);
        add(start, end, { year, month, day }, !year && day === null);
      }
  } else if (calendarLocales.has(locale)) {
    const regexes = calendarRegexes(locale);
    for (const regex of regexes.dayMonth)
      for (const match of source.matchAll(regex)) {
        const { start, end, year, day } = read(match);
        const month = monthOf(match.groups.month, locale);
        if (!validDay(month, day)) continue;
        if (!add(start, end, { year, month, day })) continue;
        const raw = match[0].trim();
        const day2 = match.groups.day2 ? Number(match.groups.day2) : null;
        if (day2 !== null && validDay(month, day2))
          found.push({
            raw,
            index: start,
            end,
            year,
            month,
            day: day2,
            silent: false,
          });
        // « du 19 au 21 février »: the first day of the range.
        const lead = rangeBefore.exec(source.slice(0, start));
        if (lead && validDay(month, Number(lead.groups.day)))
          found.push({
            raw: lead.groups.day,
            index: lead.index,
            end: lead.index + lead.groups.day.length,
            year,
            month,
            day: Number(lead.groups.day),
            silent: false,
          });
      }
    if (regexes.monthYear)
      for (const match of source.matchAll(regexes.monthYear)) {
        const { start, end, year } = read(match);
        add(start, end, { year, month: monthOf(match.groups.month, locale) });
      }
  }
  // Numeric forms: day first, except English (month first, unless the first
  // number cannot be a month).
  for (const match of source.matchAll(numericDate)) {
    const { start, end, year } = read(match);
    const first = Number(match.groups.first);
    const second = Number(match.groups.second);
    const monthFirst = locale === "en" && first <= 12;
    const [month, day] = monthFirst ? [first, second] : [second, first];
    if (validDay(month, day)) add(start, end, { year, month, day });
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

const numberPattern = new RegExp(
  `(?<![\\d.,])(?:\\d{1,3}(?:${space}\\d{3})+(?!\\d)(?:[.,]\\d+)?|\\d{1,3}(?:[.,']\\d{3})+(?:[.,]\\d+)?(?!\\d)|\\d+(?:[.,]\\d+)?)`,
  "gu",
);

function decimalMarkOf(locale) {
  return usesDecimalComma(locale) ? "," : ".";
}

/** `{ value, decimals, grouped }` of a numeric token read in `locale`. */
export function parseNumberToken(token, locale = "en") {
  const separators = token.match(/[     .,']/g) || [];
  if (!separators.length)
    return { value: Number(token), decimals: 0, grouped: false };
  if (separators.every((mark) => spaces.includes(mark)))
    return {
      value: Number(token.replace(/\D/g, "")),
      decimals: 0,
      grouped: true,
    };
  const spacedGrouping = separators.some((mark) => spaces.includes(mark));
  const marks = separators.filter((mark) => !spaces.includes(mark));
  const kinds = new Set(marks);
  let decimal = null;
  if (spacedGrouping || kinds.size > 1) decimal = marks[marks.length - 1];
  else {
    const mark = marks[0];
    if (marks.length > 1) decimal = null;
    else {
      const at = token.lastIndexOf(mark);
      const after = token.length - at - 1;
      const before = token.slice(0, at).replace(/\D/g, "").length;
      if (mark === decimalMarkOf(locale)) decimal = mark;
      else if (after === 3 && before <= 3 && mark !== "'") decimal = null;
      else if (mark === "'") decimal = null;
      else decimal = mark;
    }
  }
  if (decimal === null)
    return {
      value: Number(token.replace(/\D/g, "")),
      decimals: 0,
      grouped: true,
    };
  const at = token.lastIndexOf(decimal);
  const integer = token.slice(0, at).replace(/\D/g, "");
  const fraction = token.slice(at + 1);
  return {
    value: Number(`${integer}.${fraction}`),
    decimals: fraction.length,
    grouped: spacedGrouping || marks.length > 1,
  };
}

function significantDigitsOf(mantissa, decimals) {
  const digits = String(Math.abs(mantissa)).replace(".", "").replace(/^0+/, "");
  const stripped = decimals ? digits : digits.replace(/0+$/, "");
  return Math.max(1, stripped.length);
}

/** Rounds `value` to `digits` significant digits. */
/** A value at a number of decimal places, rounded half up as a reader does
 * (`toFixed` gives 14.4 for 14.45, whose binary form is 14.4499…). */
export function roundDecimals(value, places) {
  const scale = 10 ** places;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
}

/** Whether `written`, given to `places` decimals, is a rounding of `value`:
 * at most half a unit of its last digit away, so that 5.55 may be written
 * 5.5 or 5.6 (a half rounds either way in print). */
export function isRoundingOf(value, written, places) {
  const half = 0.5 * 10 ** -places;
  return Math.abs(value - written) <= half * (1 + 1e-9) + 1e-12;
}

export function roundSignificant(value, digits) {
  if (!Number.isFinite(value) || value === 0) return value;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(value))));
  // 12.45 × 10 is 124.49999… in binary: the product is read back to twelve
  // digits first, so that 12.45 rounds to 12.5 as a reader rounds it.
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
}

const romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function romanToNumber(text) {
  const letters = String(text).toUpperCase();
  if (!/^[IVXLC]+$/.test(letters)) return null;
  let total = 0;
  for (let at = 0; at < letters.length; at += 1) {
    const value = romanValues[letters[at]];
    const next = romanValues[letters[at + 1]] || 0;
    total += value < next ? -value : value;
  }
  return total;
}

const centuryPatterns = [
  // fr « XVIIIe siècle », « 18e siècle »; pt « século XVIII »; es « siglo XVIII »
  /(?<![\p{L}\p{N}])(\d{1,2}|[IVXLC]{1,6})\s?(?:e|ᵉ|er|ème|th|st|nd|rd|\.)?[\s-]+(?:siècle|century|Jahrhundert|siglo|secolo|século|век|в\.)/giu,
  /(?:siglo|século|secolo|XVIII?)\s+([IVXLC]{1,6})(?![\p{L}])/giu,
  /(\d{1,2})\s?世紀/gu,
  /(\d{1,2})\s?世纪/gu,
  /([IVXLC]{1,6})\s?(?:век|в\.)/gu,
];

// A word that introduces a year: « en 964 », « in 964 », « в 964 », « im
// Jahre 964 », « el año de 964 », « l’an 964 ».
const dateMarker =
  /(?<![\p{L}])(?:en(?:\s+el\s+año)?|in|im|nel|nell[’']anno|em|no\s+ano\s+de|в|vers|around|circa|ab|seit|um|since|depuis|desde|dal|dall[’']anno|año(?:\s+de)?|Jahr(?:es|e)?|anno(?:\s+di)?|ano(?:\s+de)?|year|année|(?:l[’'])?an)\s*$/iu;
// A word that makes the number after it a decade (« les années 1920 », « in
// den Jahren 1920 »). A singular is a single year: « l’année 1938 », « im
// Jahre 1938 », « el año 1938 ».
const decadeBefore =
  /(?:années|decade|década|decennio|(?<!(?:im|am|vom|zum|dem)\s+)Jahre[n]?|anni|anos|dos anos)\s+(?:de\s+|der\s+|del\s+|do\s+|dos\s+)?$/iu;

// What a Han-script year word may be followed by when the number before it
// counts years instead of naming one: « 2000年前 » (2000 years ago), « 1000年
// 間 », « 1000年以上 », « 500年来 ». « 1938年以来 », « 1938年前後 » and
// « 1938年頃 » name a year and are not listed.
const hanDurationAfter = {
  ja: /^(?:前(?!後)|間|以上|以内|おき|ごと|毎|にわたる|にわたって|にわたり)/u,
  "zh-Hans": /^(?:以上|之久|来|來|多年|余年)/u,
  "zh-Hant": /^(?:以上|之久|来|來|多年|余年|餘年)/u,
};

// Russian counts years with « лет » (and « год », « года » after 1, 2-4); the
// same words name a calendar year after a four-digit number (« летом 1938
// года », « 1941 год »). A duration is announced by the word before it.
const ruYearWord = /^(?:год|года)(?![\p{L}])/iu;
const ruDurationBefore =
  /(?:через|спустя|течение|более|свыше|менее|почти|ровно|порядка)\s*$/iu;
const ruThreeDigitYearBefore =
  /(?:до|с|со|около|после|к|от|в|на|перед|начиная\s+с)\s*$/iu;

function lengthOfMatch(text, regex) {
  const match = regex.exec(text);
  return match ? match[0].length : 0;
}

/**
 * Every number a text states: `[{ raw, index, end, value, mantissa, scale,
 * decimals, significant, unit, dimension, role }]`, in text order, and the
 * designations it left out. `role` is `quantity` (a value with a unit),
 * `date` (a year), `decade`, `century`, or `number` (a number whose unit
 * the reader does not know).
 */
/**
 * Japanese and Chinese write a large number in groups of four digits:
 * « 1億3000万 » is 130 000 000, « 5万3500 » is 53 500. Each group is joined
 * into one number before reading (« 13000万 », « 53500 »), so that no group
 * is read as a quantity of its own.
 */
export function joinCjkNumberGroups(text) {
  return String(text)
    .replace(
      /(\d+)\s?[億亿]\s?(\d{1,4})\s?([万萬])/gu,
      (_, high, low, man) => `${Number(high) * 10000 + Number(low)}${man}`,
    )
    .replace(
      /(\d+)\s?[万萬]\s?(\d{1,4})(?![\d万萬億亿.,])/gu,
      (_, high, low) => `${Number(high) * 10000 + Number(low)}`,
    );
}

export function extractNumbers(text, locale = "en", { names = [] } = {}) {
  const source = joinCjkNumberGroups(String(text || ""));
  const { masked, designations } = mask(source, names);
  const scaleList = scaleRegexes[locale] || scaleRegexes.en;
  const unitList = unitPatternsFor(locale);
  const numbers = [];
  const consumed = [];

  // Centuries first: « XVIIIe siècle » is not a quantity of 18.
  for (const regex of centuryPatterns) {
    for (const match of [...masked.matchAll(regex)]) {
      const raw = match[1];
      const value = /^\d+$/.test(raw) ? Number(raw) : romanToNumber(raw);
      if (!Number.isFinite(value) || value < 1 || value > 30) continue;
      if (
        consumed.some(
          ([a, b]) => match.index < b && match.index + match[0].length > a,
        )
      )
        continue;
      consumed.push([match.index, match.index + match[0].length]);
      numbers.push({
        raw: match[0],
        index: match.index,
        end: match.index + match[0].length,
        value,
        mantissa: value,
        scale: 1,
        decimals: 0,
        significant: 2,
        unit: null,
        dimension: "date",
        role: "century",
      });
    }
  }

  // Calendar dates next: « 19 » in « le 19 février 2027 » is a day.
  const centuries = [...consumed];
  for (const date of extractCalendarDates(masked, locale)) {
    if (centuries.some(([a, b]) => date.index < b && date.end > a)) continue;
    consumed.push([date.index, date.end]);
    if (date.silent) continue;
    numbers.push({
      raw: date.raw,
      index: date.index,
      end: date.end,
      value: date.year,
      mantissa: date.year,
      scale: 1,
      decimals: 0,
      significant: 0,
      unit: null,
      dimension: "calendar",
      role: "calendar",
      calendar: { year: date.year, month: date.month, day: date.day },
    });
  }

  for (const match of [...masked.matchAll(numberPattern)]) {
    const start = match.index;
    let end = start + match[0].length;
    if (consumed.some(([a, b]) => start < b && end > a)) continue;
    const parsed = parseNumberToken(match[0], locale);
    if (!Number.isFinite(parsed.value)) continue;
    let sign = 1;
    const previous = masked[start - 1];
    if (
      (previous === "−" || previous === "-") &&
      (start < 2 || /[\s(:=  ]/.test(masked[start - 2]))
    ) {
      sign = -1;
    }
    const rest = masked.slice(end);
    // A decade: « 1920s », « 1920年代 », « 1920-х ».
    const decadeSuffix = (
      locale === "de"
        ? /^(?:er(?![\p{L}\p{N}])|s(?![\p{L}\p{N}])|年代|-х|-ых)/u
        : /^(?:s(?![\p{L}\p{N}])|年代|-х|-ых)/u
    ).exec(rest);
    let cursor = 0;
    const skipSpaces = () => {
      while (cursor < rest.length && spaces.includes(rest[cursor])) cursor += 1;
    };
    let scale = 1;
    let scaled = false;
    let unit = null;
    let unitFound = false;
    if (!decadeSuffix) {
      skipSpaces();
      for (const [regex, factor] of scaleList) {
        const hit = regex.exec(rest.slice(cursor));
        if (hit) {
          scale = factor;
          scaled = true;
          cursor += hit[0].length;
          break;
        }
      }
      const scaleEnd = cursor;
      if (scaled) skipSpaces();
      cursor += lengthOfMatch(rest.slice(cursor), connector);
      const tail = rest.slice(cursor);
      for (const [symbol, regex] of unitList) {
        const hit = regex.exec(tail);
        if (hit) {
          unit = symbol;
          unitFound = true;
          cursor += hit[0].length;
          break;
        }
      }
      // What follows the number belongs to it only when it is a scale word
      // or a unit; the spaces and the connector after a bare number do not.
      if (!unitFound) cursor = scaled ? scaleEnd : 0;
      // Japanese and Chinese say a speed before the number: « 毎秒約300km »,
      // « 秒速17 km », « 每秒约300公里 » are kilometres per second.
      if (
        unit === "km" &&
        /(?:秒速|毎秒|每秒)\s?(?:約|约|およそ|おおよそ|大约|大約)?\s?$/u.test(
          masked.slice(Math.max(0, start - 8), start),
        )
      )
        unit = "km/s";
    }
    end += decadeSuffix ? decadeSuffix[0].length : cursor;
    // The unit before the number: « magnitude 3,4 », « 百分之20 ».
    const lead = masked.slice(Math.max(0, start - 40), start);
    if (!unit && beforeMagnitude.test(lead)) unit = "mag";
    if (!unit && beforePercent.test(lead)) unit = "%";
    const mantissa = sign * parsed.value;
    const value = mantissa * scale;
    const significant = significantDigitsOf(parsed.value, parsed.decimals);

    let role = "quantity";
    let dimension = null;
    const integer = Number.isInteger(value);
    if (decadeSuffix) {
      role = "decade";
      dimension = "date";
      unit = "date";
    } else if (unit === "yr") {
      // « 1785年 » is a year, « 46億年 » a duration.
      const cjkYear = rest.slice(0, cursor).endsWith("年");
      const unitWord = rest.slice(0, cursor).trimStart();
      const plainInteger = !parsed.grouped && !scaled && integer && sign === 1;
      const afterYear = rest.slice(cursor);
      if (
        cjkYear &&
        plainInteger &&
        value >= 100 &&
        value <= 2100 &&
        !hanDurationAfter[locale]?.test(afterYear)
      ) {
        role = "date";
        dimension = "date";
        unit = "date";
      } else if (
        locale === "ru" &&
        plainInteger &&
        ruYearWord.test(unitWord) &&
        ((value >= 1000 && value <= 2100 && !ruDurationBefore.test(lead)) ||
          (value >= 100 && value < 1000 && ruThreeDigitYearBefore.test(lead)))
      ) {
        // « 1938 года » is a calendar year, « 3 года » a duration.
        role = "date";
        dimension = "date";
        unit = "date";
        end = start + match[0].length;
      } else dimension = "duration";
    } else if (unit) {
      dimension = toBase(1, unit)?.dimension ?? null;
    } else {
      const bare = !parsed.grouped && !scaled && integer;
      const marked = dateMarker.test(lead);
      if (
        bare &&
        ((value >= 1000 && value <= 2100) ||
          (marked && value >= 100 && value < 1000))
      ) {
        role = decadeBefore.test(lead) ? "decade" : "date";
        dimension = "date";
        unit = "date";
      } else {
        role = "number";
      }
    }
    const context =
      role === "number" ? contextAfter(masked.slice(end), locale) : null;
    numbers.push({
      raw: source.slice(start, end).trim(),
      index: start,
      end,
      value,
      mantissa,
      scale,
      decimals: parsed.decimals,
      significant,
      unit,
      dimension,
      role,
      ...(role === "number"
        ? context
          ? { context }
          : { unitless: true }
        : {}),
    });
  }
  numbers.sort((a, b) => a.index - b.index);
  return { numbers, designations };
}

/**
 * What a number without a unit counts, read in the word right after it
 * (« 6 fois », « 2 000 étoiles », « 4 astronauts », « 274颗 »), or `null`
 * when nothing says it: end of sentence, punctuation, or a small word of
 * the language (« et », « and »). A range (« 6 à 7 étoiles ») takes the
 * word after its second number.
 */
function contextAfter(rest, locale, depth = 0) {
  let at = 0;
  while (at < rest.length && /\s/u.test(rest[at])) at += 1;
  const tail = rest.slice(at);
  if (isHanLocale(locale)) {
    // A counter or a noun written right after the number.
    const hit = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.exec(
      tail,
    );
    return hit ? hit[0] : null;
  }
  // A symbol right after (« 20 % » at the end of « de 10 à 20 % »).
  const symbol = /^[%％°′″]/u.exec(tail);
  if (symbol) return symbol[0];
  const range = /^([-–]|\p{L}+)\s*(?=\d)/u.exec(tail);
  if (
    depth === 0 &&
    range &&
    rangeWords.has(range[1].toLowerCase()) &&
    /^\d/.test(tail.slice(range[0].length))
  ) {
    const next = tail.slice(range[0].length).replace(/^[\d\s.,]+/u, "");
    return contextAfter(next, locale, 1);
  }
  let word = /^[\p{L}][\p{L}\p{M}’'-]*/u.exec(tail)?.[0];
  if (!word) return null;
  // An elided article or preposition (« d’étoiles », « l’amas »): the word
  // after it says what is counted.
  const elided = /^\p{L}{1,2}[’'](\p{L}.*)$/u.exec(word);
  if (elided) word = elided[1];
  return functionWords.has(word.toLowerCase()) ? null : word;
}

// ---------------------------------------------------------------------------
// The check.

const recordsOf = (row) =>
  Object.entries(row?.facts || {}).flatMap(([key, records]) =>
    (records || [])
      .filter(
        (record) => record.retained !== false && Number.isFinite(record.value),
      )
      .map((record) => ({ key, record })),
  );

function rangeOfDate(record) {
  const year = record.value;
  if (record.precision === "decade") return [year, year + 9];
  if (record.precision === "century") return [year - 100, year + 100];
  if (record.precision === "millennium") return [year - 1000, year + 1000];
  return [year, year];
}

function matchValue(number, record) {
  // Returns `{ ok, difference }`: `difference` is the relative (or absolute,
  // for magnitudes and dates) distance used to name the nearest value.
  if (number.dimension === "date") {
    const [low, high] = rangeOfDate(record);
    if (number.role === "century") {
      const first = (number.value - 1) * 100;
      const last = number.value * 100;
      const hit = high >= first && low <= last;
      return {
        ok: hit,
        difference: Math.min(Math.abs(low - first), Math.abs(high - last)),
      };
    }
    if (number.role === "decade") {
      const hit = high >= number.value && low <= number.value + 9;
      return { ok: hit, difference: Math.abs(low - number.value) };
    }
    const hit =
      number.value >= low - tolerance.year &&
      number.value <= high + tolerance.year;
    return { ok: hit, difference: Math.abs(low - number.value) };
  }
  if (number.dimension === "magnitude") {
    const rounded = Number(
      roundSignificant(record.value, number.significant).toFixed(6),
    );
    const places = number.decimals;
    const atPlaces = roundDecimals(record.value, places);
    const difference = Math.abs(number.value - record.value);
    return {
      ok:
        difference <= tolerance.magnitude + 1e-9 ||
        atPlaces === number.value ||
        isRoundingOf(record.value, number.value, places) ||
        rounded === number.value,
      difference,
    };
  }
  const exact = number.exact === true;
  const withinTolerance = (wanted, written) => {
    const relative =
      wanted === 0
        ? Math.abs(written)
        : Math.abs(written - wanted) / Math.abs(wanted);
    if (exact) return { ok: relative < 1e-9, difference: relative };
    let ok = relative <= tolerance.relative;
    if (!ok && wanted !== 0) {
      const rounded = roundSignificant(wanted, number.significant);
      ok = Math.abs(rounded - written) <= Math.abs(written) * 1e-9;
    }
    return { ok, difference: relative };
  };
  if (number.dimension && number.dimension !== "none" && number.unit) {
    // The text's unit: both sides go to the base unit of the dimension
    // (kelvin for a temperature), the rounding is read in the text's unit.
    const here = toBase(record.value, record.unit);
    const mine = toBase(1, number.unit);
    if (!here || !mine || here.dimension !== number.dimension)
      return { ok: false, difference: Infinity };
    const textBase = toBase(number.value, number.unit).base;
    const inTextUnits =
      number.unit === "°C" ? here.base - 273.15 : here.base / mine.base;
    let outcome = withinTolerance(here.base, textBase);
    if (!outcome.ok && !exact) {
      const rounded = roundSignificant(inTextUnits, number.significant);
      if (Math.abs(rounded - number.value) <= Math.abs(number.value) * 1e-9)
        outcome = { ok: true, difference: outcome.difference };
    }
    if (
      !outcome.ok &&
      Number.isFinite(record.lower) &&
      Number.isFinite(record.upper)
    ) {
      const low = toBase(record.lower, record.unit)?.base;
      const high = toBase(record.upper, record.unit)?.base;
      if (
        low !== undefined &&
        high !== undefined &&
        textBase >= low &&
        textBase <= high
      )
        outcome = { ok: true, difference: outcome.difference };
    }
    return outcome;
  }
  // Unit unknown to the reader: the raw number against the value as the
  // table publishes it, and against it in the units a text commonly uses.
  // Without a unit nothing tells how loosely the number is meant, so it must
  // be the value written to the digits the text gives (`tolerance.bare`):
  // « 14 » or « 14,0 » for 14, « 2,5 millions » for 2 537 000, never « 10 »
  // for 14 nor « 41 » for 40.
  const candidates = [record.value];
  const base = toBase(record.value, record.unit);
  if (base?.dimension === "length")
    candidates.push(base.base / 9.4607304725808e15);
  if (base?.dimension === "angle") candidates.push(base.base / 60, base.base);
  const toDigitsWritten = (wanted, written) => {
    const relative =
      wanted === 0
        ? Math.abs(written)
        : Math.abs(written - wanted) / Math.abs(wanted);
    if (exact) return { ok: relative < 1e-9, difference: relative };
    const scale = number.scale || 1;
    const atDigits = roundDecimals(wanted / scale, number.decimals || 0);
    const mantissa = written / scale;
    return {
      ok:
        Math.abs(atDigits - mantissa) <= Math.abs(mantissa) * 1e-9 ||
        isRoundingOf(wanted / scale, mantissa, number.decimals || 0),
      difference: relative,
    };
  };
  let best = { ok: false, difference: Infinity };
  for (const wanted of candidates) {
    const outcome = toDigitsWritten(wanted, number.value);
    if (outcome.ok || outcome.difference < best.difference) best = outcome;
    if (outcome.ok) break;
  }
  return best;
}

const isoOf = ({ year, month, day }) =>
  [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    ...(day ? [String(day).padStart(2, "0")] : []),
  ].join("-");

/**
 * The dated facts of a row: `[{ year, month, day, key, record }]`, one per
 * date a retained record states to the month or the day: its `date` field
 * (« 2027-02-19 », « 2027-02 »), or the date written in the label of a
 * record of unit `date` (« … le 14 juillet 1965 », in French or English).
 * A bare year is no dated fact.
 */
function datedFactsOf(records) {
  const facts = [];
  for (const { key, record } of records) {
    const fromField =
      typeof record.date === "string"
        ? extractCalendarDates(record.date, "en")
        : [];
    const fromLabel =
      record.unit === "date" && typeof record.label === "string"
        ? [
            // The labels of the table are written in French or English.
            ...extractCalendarDates(record.label, "fr"),
            ...extractCalendarDates(record.label, "en"),
          ]
        : [];
    for (const date of [...fromField, ...fromLabel])
      if (date.year)
        facts.push({
          year: date.year,
          month: date.month,
          day: date.day,
          key,
          record,
        });
  }
  return facts;
}

const dayNumberOf = ({ year, month, day }) =>
  Date.UTC(year, month - 1, day || 1) / 86400000;

/** A calendar date of a text against the dated facts: ok, mismatch, absent. */
function checkCalendarDate(number, dated) {
  const { year, month, day } = number.calendar;
  const same = (fact) =>
    fact.month === month &&
    (year === null || fact.year === year) &&
    // A month and a year alone is read to the month; a day needs the day.
    (day === null || fact.day === day);
  const hit = dated.find(same);
  if (hit)
    return {
      ...number,
      status: "ok",
      matched: {
        fact: hit.key,
        value: isoOf(hit),
        unit: "date",
        source: hit.record.source?.qid
          ? `${hit.record.source.qid} ${hit.record.source.property}`
          : hit.record.source?.origin,
      },
    };
  if (!dated.length)
    return {
      ...number,
      status: "absent",
      note: "the table has no dated fact for this target",
    };
  // The nearest date of the table, in days (the year of a date written
  // without one is the table fact's own).
  let nearest = null;
  for (const fact of dated) {
    const written = { year: year ?? fact.year, month, day };
    const difference = Math.abs(dayNumberOf(written) - dayNumberOf(fact));
    if (!nearest || difference < nearest.difference)
      nearest = { fact, difference };
  }
  return {
    ...number,
    status: "mismatch",
    nearest: {
      fact: nearest.fact.key,
      value: isoOf(nearest.fact),
      unit: "date",
      source: nearest.fact.record.source?.qid
        ? `${nearest.fact.record.source.qid} ${nearest.fact.record.source.property}`
        : nearest.fact.record.source?.origin,
    },
    difference: nearest.difference,
    note: "date not in the table (to the day)",
  };
}

function describe(record, key) {
  return {
    fact: key,
    value: record.value,
    unit: record.unit ?? null,
    source: record.source?.qid
      ? `${record.source.qid} ${record.source.property}`
      : record.source?.origin,
  };
}

/**
 * Checks the numbers of one text against the facts of a row.
 *
 * `row` is a row of the table (`facts`: see `target-facts.js`); `names` are
 * the target's own names (their digits are not quantities); `allowed` is a
 * list of extra numbers the caller vouches for (`{ value, unit? }`, for
 * instance the size of a catalogue the text mentions).
 *
 * Returns `{ ok, numbers, issues, designations }`; each number carries
 * `status` (`ok`, `mismatch`, `absent`), the fact it matched, or the nearest
 * one with the difference.
 */
export function checkTargetText({
  text,
  locale = "en",
  row,
  names = [],
  allowed = [],
}) {
  const { numbers, designations } = extractNumbers(text, locale, {
    names: [row?.designation, ...(row?.aliases || []), ...names].filter(
      Boolean,
    ),
  });
  const all = recordsOf(row);
  const dated = datedFactsOf(all);
  const results = numbers.map((number) => {
    if (number.role === "calendar") return checkCalendarDate(number, dated);
    const sameDimension = all.filter(({ record }) => {
      if (number.dimension === "date") return record.unit === "date";
      if (number.dimension && number.dimension !== "none")
        return (
          toBase(record.value, record.unit)?.dimension === number.dimension
        );
      return Number.isFinite(record.value);
    });
    const pool =
      number.dimension && number.dimension !== "none" ? sameDimension : all;
    let best = null;
    for (const entry of pool) {
      const outcome = matchValue(number, entry.record);
      if (outcome.ok)
        return {
          ...number,
          status: "ok",
          matched: describe(entry.record, entry.key),
        };
      if (!best || outcome.difference < best.difference)
        best = { ...outcome, entry };
    }
    for (const extra of allowed) {
      const outcome = matchValue(number, {
        value: extra.value,
        unit: extra.unit ?? number.unit ?? "1",
      });
      if (outcome.ok)
        return {
          ...number,
          status: "ok",
          matched: {
            fact: "allowed",
            value: extra.value,
            unit: extra.unit ?? null,
          },
        };
    }
    // A bare 4-digit number read as a year may be a plain quantity.
    if (number.role === "date" && number.dimension === "date") {
      const asNumber = {
        ...number,
        dimension: "none",
        unit: null,
        role: "number",
        exact: true,
      };
      for (const entry of all) {
        if (matchValue(asNumber, entry.record).ok)
          return {
            ...number,
            status: "ok",
            matched: describe(entry.record, entry.key),
            note: "read as a year, matches a quantity",
          };
      }
    }
    if (!pool.length)
      return {
        ...number,
        status: "absent",
        note: `the table has no ${number.dimension && number.dimension !== "none" ? number.dimension : "number"} for this target`,
      };
    return {
      ...number,
      status: "mismatch",
      nearest:
        best && best.entry ? describe(best.entry.record, best.entry.key) : null,
      difference: best ? Number(best.difference.toFixed(4)) : null,
    };
  });
  const issues = results.filter((entry) => entry.status !== "ok");
  // Reported apart, never an issue by itself: a number that matched a value
  // of the table but that nothing in the text qualifies (no unit, no word
  // saying what it counts). The reader of the sample looks at them.
  const unitless = results.filter((entry) => entry.unitless);
  return {
    ok: issues.length === 0,
    numbers: results,
    issues,
    unitless,
    designations,
  };
}
