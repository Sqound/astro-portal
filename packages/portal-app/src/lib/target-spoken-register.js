import { constellationName } from "astro-core/constellations.js";
import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { shippedLocales } from "astro-contracts/locales";
import {
  distanceEstimate,
  number,
  typeLabels,
} from "./target-research-profile.js";
import { spokenHandTexts } from "./target-spoken-texts.js";

// The spoken register of the target descriptions: a second template path of
// the description generator, written to be heard rather than read — short
// sentences, no parenthesis, no catalogue shorthand, numbers and names
// written as they are said, an opening that does not read like a data sheet —
// and a third path for the children around the telescope: the object's name
// and its kind, concrete comparisons, no figure that needs a unit lesson. The
// same structured facts as the written text (`target-research-profile.js`);
// the showpieces and the solar-system bodies, whose written text is
// hand-written, have a hand-written spoken text (`target-spoken-texts.js`).
//
// The read-aloud voice reads `spokenParagraphs` (or, behind the children's
// switch, `childrenSpokenParagraphs`) when the target knowledge carries them,
// and the written text through its pronunciation lexicon otherwise.

/**
 * The registry's shipped locales the spoken templates are written in (those
 * the kind sentences have words for). A shipped locale outside them has no
 * spoken text; its reader speaks the written one through its lexicon.
 */
export function spokenTextLocales() {
  return shippedLocales().filter((locale) =>
    Object.hasOwn(kindSentences["Ciel profond"], locale),
  );
}

/** The longest sentence the register allows, in words (`en`, `fr`) or in
 * characters (`ja`): said in one breath. */
export const spokenSentenceBound = Object.freeze({
  en: { words: 25 },
  fr: { words: 25 },
  ja: { characters: 40 },
});

const smallNumberWords = {
  fr: [
    "zéro",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
    "dix-sept",
    "dix-huit",
    "dix-neuf",
    "vingt",
  ],
  en: [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ],
};

// A count as it is said: a word up to twenty in English and French, digits
// otherwise (every voice reads a whole number as a cardinal).
function said(count, locale) {
  const words = smallNumberWords[locale];
  return words && count >= 0 && count < words.length
    ? words[count]
    : String(count);
}

// A decimal as it is said: the locale's decimal sign, never a thousands
// separator (a voice can read a grouped number as two numbers).
function decimal(value, locale, fractionDigits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

// A designation as it is said: `M31` is « Messier 31 », `B33` « Barnard
// 33 », `C14` « Caldwell 14 », and a Japanese voice reads the Latin
// acronyms in katakana.
// The words for the catalogues it names (French, English, Japanese; English
// for the other languages), with the space a Japanese voice does not take.
const lyndsDarkWords = {
  fr: "nébuleuse sombre de Lynds",
  en: "Lynds dark nebula",
  ja: "リンズ暗黒星雲",
};
const lyndsBrightWords = {
  fr: "nébuleuse brillante de Lynds",
  en: "Lynds bright nebula",
  ja: "リンズ散光星雲",
};
const abellWords = { fr: "Abell", en: "Abell", ja: "アベル" };

function spokenCatalogueWord(words, locale) {
  return locale === "ja" ? words.ja : `${words[locale] || words.en} `;
}

export function spokenDesignation(designation, locale) {
  // A double designation (« C14 / NGC 869 »): each part as it is said.
  const parts = String(designation || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1)
    return parts
      .map((part) => spokenDesignation(part, locale))
      .join({ fr: " ou ", ja: "または" }[locale] || " or ");
  const text = parts[0] || "";
  const ja = locale === "ja";
  const rules = [
    [/^M\s*0*(\d+)$/i, ja ? "メシエ" : "Messier "],
    [/^NGC\s*0*(\d+\s*[A-Za-z]?)$/i, ja ? "エヌジーシー" : "NGC "],
    [/^IC\s*0*(\d+\s*[A-Za-z]?)$/i, ja ? "アイシー" : "IC "],
    [/^B\s*0*(\d+[a-z]?)$/i, ja ? "バーナード" : "Barnard "],
    [/^C\s*0*(\d+)$/i, ja ? "コールドウェル" : "Caldwell "],
    [/^Sh\s*2-0*(\d+)$/i, ja ? "シャープレス" : "Sharpless "],
    [/^LDN\s*0*(\d+)$/i, spokenCatalogueWord(lyndsDarkWords, locale)],
    [/^LBN\s*0*(\d+)$/i, spokenCatalogueWord(lyndsBrightWords, locale)],
    [/^Abell\s*0*(\d+)$/i, spokenCatalogueWord(abellWords, locale)],
  ];
  for (const [pattern, word] of rules) {
    const match = text.match(pattern);
    if (match) return `${word}${match[1].replaceAll(/\s+/g, "")}`;
  }
  return text;
}

// French: « dans la constellation du Cygne », « d’Andromède »: the article
// of each constellation, keyed by its French name (the catalogue's constellation
// key, an IAU abbreviation, gives the name: `constellationName`).
const frenchConstellationOf = {
  Andromède: "d’Andromède",
  "Machine pneumatique": "de la Machine pneumatique",
  "Oiseau de paradis": "de l’Oiseau de paradis",
  Carène: "de la Carène",
  Verseau: "du Verseau",
  Aigle: "de l’Aigle",
  Autel: "de l’Autel",
  Bélier: "du Bélier",
  Cocher: "du Cocher",
  Bouvier: "du Bouvier",
  Burins: "des Burins",
  Girafe: "de la Girafe",
  Cancer: "du Cancer",
  "Chiens de chasse": "des Chiens de chasse",
  "Grand Chien": "du Grand Chien",
  "Petit Chien": "du Petit Chien",
  Capricorne: "du Capricorne",
  Cassiopée: "de Cassiopée",
  Centaure: "du Centaure",
  Céphée: "de Céphée",
  Baleine: "de la Baleine",
  Caméléon: "du Caméléon",
  Compas: "du Compas",
  Colombe: "de la Colombe",
  "Chevelure de Bérénice": "de la Chevelure de Bérénice",
  "Couronne australe": "de la Couronne australe",
  "Couronne boréale": "de la Couronne boréale",
  Corbeau: "du Corbeau",
  Coupe: "de la Coupe",
  "Croix du Sud": "de la Croix du Sud",
  Cygne: "du Cygne",
  Dauphin: "du Dauphin",
  Dorade: "de la Dorade",
  Dragon: "du Dragon",
  "Petit Cheval": "du Petit Cheval",
  Éridan: "de l’Éridan",
  Fourneau: "du Fourneau",
  Gémeaux: "des Gémeaux",
  Grue: "de la Grue",
  Hercule: "d’Hercule",
  Horloge: "de l’Horloge",
  Hydre: "de l’Hydre",
  "Hydre mâle": "de l’Hydre mâle",
  Indien: "de l’Indien",
  Lézard: "du Lézard",
  Lion: "du Lion",
  "Petit Lion": "du Petit Lion",
  Lièvre: "du Lièvre",
  Balance: "de la Balance",
  Loup: "du Loup",
  Lynx: "du Lynx",
  Lyre: "de la Lyre",
  Table: "de la Table",
  Microscope: "du Microscope",
  Licorne: "de la Licorne",
  Mouche: "de la Mouche",
  Règle: "de la Règle",
  Octant: "de l’Octant",
  Ophiuchus: "d’Ophiuchus",
  Orion: "d’Orion",
  Paon: "du Paon",
  Pégase: "de Pégase",
  Persée: "de Persée",
  Phénix: "du Phénix",
  Peintre: "du Peintre",
  Poissons: "des Poissons",
  "Poisson austral": "du Poisson austral",
  Poupe: "de la Poupe",
  Boussole: "de la Boussole",
  Réticule: "du Réticule",
  Flèche: "de la Flèche",
  Sagittaire: "du Sagittaire",
  Scorpion: "du Scorpion",
  Sculpteur: "du Sculpteur",
  "Écu de Sobieski": "de l’Écu de Sobieski",
  Serpent: "du Serpent",
  Sextant: "du Sextant",
  Taureau: "du Taureau",
  Télescope: "du Télescope",
  Triangle: "du Triangle",
  "Triangle austral": "du Triangle austral",
  Toucan: "du Toucan",
  "Grande Ourse": "de la Grande Ourse",
  "Petite Ourse": "de la Petite Ourse",
  Voiles: "des Voiles",
  Vierge: "de la Vierge",
  "Poisson volant": "du Poisson volant",
  Renard: "du Petit Renard",
};

function frenchOf(constellationKey, label) {
  return (
    frenchConstellationOf[constellationName(constellationKey, "fr")] ||
    (/^[AEIOUÉÈÊHaeiouéèêh]/.test(label) ? `d’${label}` : `de ${label}`)
  );
}

// The adult science sentence of each kind of object, and the children's
// concrete comparison (`Ciel profond` for a kind without its own).
const kindSentences = {
  Galaxie: {
    fr: {
      adult:
        "C’est un immense ensemble d’étoiles, de gaz et de poussière, comme notre Voie lactée. Sa forme raconte son histoire et celle de ses voisines.",
      children:
        "Une galaxie, c’est une immense famille de milliards d’étoiles. Notre Soleil vit dans une galaxie comme celle-ci, la Voie lactée.",
    },
    en: {
      adult:
        "It is a vast system of stars, gas and dust, like our Milky Way. Its shape tells its own story and that of its neighbours.",
      children:
        "A galaxy is a huge family of billions of stars. Our Sun lives in one too, the Milky Way.",
    },
    ja: {
      adult:
        "天の川銀河のような、星とガスとちりの大きな集まりです。その形は、銀河とその隣人たちの歴史を語ります。",
      children:
        "銀河は、何千億もの星が集まった大きな星の町です。わたしたちの太陽も、天の川銀河の中にあります。",
    },
  },
  "Amas globulaire": {
    fr: {
      adult:
        "Ses étoiles comptent parmi les plus vieilles de notre galaxie. Elles racontent la jeunesse de la Voie lactée.",
      children:
        "C’est une énorme boule d’étoiles, serrées comme un essaim d’abeilles. Ces étoiles sont très, très vieilles.",
    },
    en: {
      adult:
        "Its stars are among the oldest in our galaxy. They tell the story of the young Milky Way.",
      children:
        "It is a giant ball of stars, packed together like a swarm of bees. These stars are very, very old.",
    },
    ja: {
      adult:
        "その星は、天の川銀河で最も古い星の仲間です。若いころの天の川銀河のことを教えてくれます。",
      children:
        "星がぎっしり集まった、大きなボールのような集まりです。とても古い星ばかりです。",
    },
  },
  "Amas ouvert": {
    fr: {
      adult:
        "Ses étoiles sont nées ensemble, dans le même nuage. Les comparer permet de suivre la vie des étoiles.",
      children:
        "C’est une famille d’étoiles nées ensemble, comme des frères et sœurs. Avec le temps, elles vont se séparer.",
    },
    en: {
      adult:
        "Its stars were born together, in the same cloud. Comparing them shows how stars live and age.",
      children:
        "It is a family of stars born together, like brothers and sisters. Over time, they will drift apart.",
    },
    ja: {
      adult:
        "その星たちは、同じ雲からいっしょに生まれました。比べると、星の一生が分かります。",
      children:
        "同じ場所で生まれた、星のきょうだいです。時間がたつと、ばらばらになっていきます。",
    },
  },
  "Nébuleuse planétaire": {
    fr: {
      adult:
        "C’est l’enveloppe de gaz rejetée par une étoile comme le Soleil, en fin de vie. Elle montre l’avenir lointain de notre propre étoile.",
      children:
        "C’est la dernière bulle de gaz soufflée par une étoile comme le Soleil, à la fin de sa vie.",
    },
    en: {
      adult:
        "It is the shell of gas cast off by a star like the Sun, late in its life. It shows the distant future of our own star.",
      children:
        "It is the last bubble of gas blown out by a star like our Sun, at the end of its life.",
    },
    ja: {
      adult:
        "太陽のような星が、晩年に放ったガスの殻です。遠い未来の太陽の姿を見せてくれます。",
      children: "太陽のような星が、最後にふきだしたガスの泡です。",
    },
  },
  "Nébuleuse en émission": {
    fr: {
      adult:
        "De jeunes étoiles très chaudes y font briller le gaz. C’est un lieu où naissent des étoiles.",
      children:
        "C’est un immense nuage de gaz qui brille. Des étoiles toutes neuves y naissent, comme dans une pouponnière.",
    },
    en: {
      adult:
        "Young, very hot stars make its gas glow. It is a place where stars are born.",
      children:
        "It is a huge cloud of glowing gas. Brand-new stars are being born inside, like in a nursery.",
    },
    ja: {
      adult:
        "若くてとても熱い星が、ガスを光らせています。星が生まれている場所です。",
      children: "光るガスの大きな雲です。ここで新しい星が生まれています。",
    },
  },
  "Nébuleuse en réflexion": {
    fr: {
      adult:
        "Sa poussière renvoie la lumière d’étoiles voisines. C’est pour cela qu’elle paraît souvent bleue.",
      children:
        "C’est un nuage de poussière éclairé par des étoiles voisines, comme le brouillard autour d’un lampadaire.",
    },
    en: {
      adult:
        "Its dust reflects the light of nearby stars. That is why it often looks blue.",
      children:
        "It is a cloud of dust lit up by nearby stars, like fog around a street lamp.",
    },
    ja: {
      adult:
        "ちりが近くの星の光を反射しています。そのため、青っぽく見えることが多いのです。",
      children:
        "近くの星の光で照らされた、ちりの雲です。街灯のまわりの霧のように光っています。",
    },
  },
  "Nébuleuse sombre": {
    fr: {
      adult:
        "C’est un nuage de poussière froide, vu en ombre sur un fond plus clair. Des étoiles s’y forment parfois, cachées à nos yeux.",
      children:
        "C’est un nuage de poussière si épais qu’il cache les étoiles derrière lui. On le voit comme une ombre.",
    },
    en: {
      adult:
        "It is a cloud of cold dust, seen as a shadow against a brighter background. Stars sometimes form inside, hidden from our eyes.",
      children:
        "It is a cloud of dust so thick that it hides the stars behind it. We see it as a shadow.",
    },
    ja: {
      adult:
        "明るい背景の前に、影として見える冷たいちりの雲です。中では星が生まれていることもあります。",
      children:
        "とても濃いちりの雲で、後ろの星をかくしています。影のように黒く見えます。",
    },
  },
  "Rémanent de supernova": {
    fr: {
      adult:
        "Ce sont les restes d’une étoile qui a explosé. Ses filaments s’étendent encore aujourd’hui dans l’espace.",
      children:
        "Ce sont les morceaux d’une étoile qui a explosé, il y a très longtemps. Ils s’envolent encore dans l’espace.",
    },
    en: {
      adult:
        "It is what remains of a star that exploded. Its filaments are still spreading through space today.",
      children:
        "These are the pieces of a star that exploded long ago. They are still flying out into space.",
    },
    ja: {
      adult: "爆発した星の残りです。そのガスの筋は、今も宇宙に広がっています。",
      children:
        "大昔に爆発した星の、かけらです。今も宇宙に広がり続けています。",
    },
  },
  Étoile: {
    fr: {
      adult: "Sa couleur et sa lumière disent sa température et son âge.",
      children: "C’est un soleil, très loin de nous.",
    },
    en: {
      adult: "Its colour and its light tell its temperature and its age.",
      children: "It is a sun, very far away from us.",
    },
    ja: {
      adult: "その色と光から、温度や年齢が分かります。",
      children: "遠くにある、もうひとつの太陽です。",
    },
  },
  "Ciel profond": {
    fr: {
      adult: "Sa nature exacte reste discutée par les astronomes.",
      children:
        "Même les astronomes se demandent encore ce que c’est exactement.",
    },
    en: {
      adult: "Astronomers still discuss its exact nature.",
      children: "Even astronomers are still working out exactly what it is.",
    },
    ja: {
      adult: "その正体は、天文学者の間でまだ議論されています。",
      children: "それが何なのか、天文学者もまだ調べています。",
    },
  },
};

const kindOf = (typeKey) =>
  Object.hasOwn(kindSentences, typeKey) ? typeKey : "Ciel profond";

// English names that take « the » (« the Andromeda Galaxy », « the
// Pleiades »); a proper name alone does not (« Omega Centauri »).
function withEnglishArticle(name) {
  if (/^the\s/i.test(name)) return name;
  return /\b(Nebula|Galaxy|Cluster|Pleiades|Hyades|Loop|Veil|Pillars|Clouds?|Wheel|Eye|Hat)\b/i.test(
    name,
  )
    ? `the ${name}`
    : name;
}

// The gendered words of a French sentence, from the article of the type
// label (« une galaxie », « un amas »).
function frenchGender(typeLabel) {
  const feminine = /^une\s/.test(typeLabel);
  return {
    pronoun: feminine ? "Elle" : "Il",
    object: feminine ? "la" : "le",
    agreement: feminine ? "e" : "",
  };
}

function apparentMajor(target) {
  const major = number(
    Array.isArray(target.apparentSizeArcmin)
      ? target.apparentSizeArcmin[0]
      : null,
  );
  return Number.isFinite(major) && major > 0 ? major : null;
}

// « deux degrés », « un degré et demi » (adult, French and English);
// « 2度 » in Japanese.
function spokenDegrees(arcmin, locale) {
  const halves = Math.round(arcmin / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (locale === "ja") return `${half ? decimal(halves / 2, "ja") : whole}度`;
  if (locale === "fr") {
    if (whole <= 1)
      return half
        ? whole === 0
          ? "un demi-degré"
          : "un degré et demi"
        : "un degré";
    return `${said(whole, "fr")} degrés${half ? " et demi" : ""}`;
  }
  if (whole <= 1)
    return half
      ? whole === 0
        ? "half a degree"
        : "one and a half degrees"
      : "one degree";
  return `${said(whole, "en")}${half ? " and a half" : ""} degrees`;
}

function adultSizeSentence(target, locale, gender) {
  const major = apparentMajor(target);
  if (major === null) return null;
  const moons = Math.round(major / 30);
  if (locale === "fr") {
    if (major >= 45)
      return `Dans le ciel, ${gender.pronoun.toLowerCase()} s’étend sur environ ${spokenDegrees(major, "fr")}, soit ${said(moons, "fr")} fois la largeur de la pleine Lune.`;
    if (major >= 22)
      return `${gender.pronoun} paraît à peu près aussi large que la pleine Lune.`;
    if (major >= 10)
      return `${gender.pronoun} paraît environ moitié moins large que la pleine Lune.`;
    const minutes = Math.max(1, Math.round(major));
    return `${gender.pronoun} mesure environ ${minutes === 1 ? "une minute" : `${said(minutes, "fr")} minutes`} d’arc : bien plus petit${gender.agreement} que la pleine Lune.`;
  }
  if (locale === "ja") {
    if (major >= 45)
      return `空では約${spokenDegrees(major, "ja")}に広がり、満月の約${moons}倍の大きさです。`;
    if (major >= 22) return "満月とほぼ同じくらいの大きさです。";
    if (major >= 10) return "満月の半分ほどの大きさです。";
    return `見かけの大きさは約${Math.max(1, Math.round(major))}分角で、満月よりずっと小さく見えます。`;
  }
  if (major >= 45)
    return `In the sky it spans about ${spokenDegrees(major, "en")}, ${said(moons, "en")} times the width of the full Moon.`;
  if (major >= 22) return "It looks about as wide as the full Moon.";
  if (major >= 10) return "It looks about half as wide as the full Moon.";
  const minutes = Math.max(1, Math.round(major));
  return `It measures about ${minutes === 1 ? "one arcminute" : `${said(minutes, "en")} arcminutes`} across, far smaller than the full Moon.`;
}

function childrenSizeSentence(target, locale, gender) {
  const major = apparentMajor(target);
  if (major === null) return null;
  const moons = Math.round(major / 30);
  if (locale === "fr") {
    if (major >= 45)
      return `Dans le ciel, ${gender.pronoun.toLowerCase()} paraît aussi large que ${said(moons, "fr")} pleines lunes côte à côte.`;
    if (major >= 22)
      return `Dans le ciel, ${gender.pronoun.toLowerCase()} paraît aussi large que la pleine Lune.`;
    if (major >= 10)
      return `Dans le ciel, ${gender.pronoun.toLowerCase()} paraît deux fois plus petit${gender.agreement} que la pleine Lune.`;
    return `${gender.pronoun} paraît tout${gender.agreement === "e" ? "e" : ""} petit${gender.agreement} : il faut un télescope pour bien ${gender.object} voir.`;
  }
  if (locale === "ja") {
    if (major >= 45)
      return `空では、満月${moons}個分くらいの大きさに見えます。`;
    if (major >= 22) return "空では、満月と同じくらいの大きさに見えます。";
    if (major >= 10) return "空では、満月の半分くらいの大きさに見えます。";
    return "とても小さく見えるので、望遠鏡で見ましょう。";
  }
  if (major >= 45)
    return `In the sky, it looks as wide as ${said(moons, "en")} full Moons side by side.`;
  if (major >= 22) return "In the sky, it looks as wide as the full Moon.";
  if (major >= 10) return "In the sky, it looks half as wide as the full Moon.";
  return "It looks tiny: you need a telescope to see it well.";
}

function magnitudeSentence(target, locale) {
  const magnitude = number(target.magnitude);
  if (!Number.isFinite(magnitude)) return null;
  const value = decimal(magnitude, locale);
  if (locale === "fr") return `Sa magnitude totale est d’environ ${value}.`;
  if (locale === "ja") return `全体の明るさは約${value}等級です。`;
  return `Its total magnitude is about ${value}.`;
}

const englishYears = {
  1888: "eighteen eighty-eight",
  1895: "eighteen ninety-five",
  1908: "nineteen oh-eight",
  1927: "nineteen twenty-seven",
  1995: "nineteen ninety-five",
};

// One catalogue sentence, the oldest catalogue first; the written text
// keeps the others.
function historySentence(target, locale, gender) {
  const catalogues = new Set(target.catalogues || []);
  const icNumber = Number(
    String(target.designation).match(/^IC\s*(\d+)/i)?.[1],
  );
  const icYear = Number.isFinite(icNumber) && icNumber <= 1520 ? 1895 : 1908;
  const year = (value) =>
    locale === "en" ? englishYears[value] || String(value) : String(value);
  const p = gender.object;
  const a = gender.agreement;
  const pronoun = gender.pronoun;
  if (catalogues.has("Messier"))
    return {
      fr: `Charles Messier l’a noté${a} au dix-huitième siècle, pour ne pas ${p} confondre avec une comète.`,
      en: "Charles Messier recorded it in the eighteenth century, so as not to mistake it for a comet.",
      ja: "18世紀にシャルル・メシエが、彗星と区別するために記録しました。",
    }[locale];
  if (catalogues.has("NGC"))
    return {
      fr: `${pronoun} figure dans le New General Catalogue, publié par Dreyer en 1888.`,
      en: `It is listed in Dreyer’s New General Catalogue, published in ${year(1888)}.`,
      ja: "1888年にドレイヤーが出版した星表に載っています。",
    }[locale];
  if (catalogues.has("IC"))
    return {
      fr: `${pronoun} figure dans l’Index Catalogue de Dreyer, publié en ${icYear}.`,
      en: `It is listed in Dreyer’s Index Catalogue, published in ${year(icYear)}.`,
      ja: `${icYear}年にドレイヤーが出版した補遺の星表に載っています。`,
    }[locale];
  if (catalogues.has("Barnard"))
    return {
      fr: `Edward Emerson Barnard l’a noté${a} en 1927, parmi trois cent quarante-neuf objets sombres.`,
      en: `Edward Emerson Barnard listed it in ${year(1927)}, among three hundred and forty-nine dark objects.`,
      ja: "1927年にバーナードが、暗黒星雲の星表に載せました。",
    }[locale];
  if (catalogues.has("Caldwell"))
    return {
      fr: `Patrick Moore l’a ajouté${a} à sa liste d’observation en 1995.`,
      en: `Patrick Moore added it to his observing list in ${year(1995)}.`,
      ja: "1995年にパトリック・ムーアが観測リストに加えました。",
    }[locale];
  return null;
}

// The distance of a galaxy estimated from its recession, as said: « trente
// millions d’années-lumière », « 3000万光年 ».
function millionsOfYears(lightYears, locale) {
  const millions = lightYears / 1_000_000;
  const rounded =
    millions < 10 ? Math.round(millions * 2) / 2 : Math.round(millions);
  if (locale === "ja") {
    const tenThousands = Math.round(rounded * 100);
    return tenThousands >= 10_000
      ? `${decimal(tenThousands / 10_000, "ja")}億`
      : `${tenThousands}万`;
  }
  const whole = Math.floor(rounded);
  const half = rounded - whole >= 0.5;
  if (rounded >= 1000) {
    const billions = decimal(rounded / 1000, locale);
    return locale === "fr" ? `${billions} milliards` : `${billions} billion`;
  }
  if (locale === "fr")
    return `${said(whole, "fr")} millions${half ? " et demi" : ""}`;
  return `${said(whole, "en")}${half ? " and a half" : ""} million`;
}

function distanceSentence(target, locale, children) {
  const estimate = distanceEstimate(target);
  if (!estimate) return null;
  const amount = millionsOfYears(estimate.distanceLightYears, locale);
  if (children)
    return {
      fr: `Sa lumière a voyagé environ ${amount} d’années pour arriver jusqu’à nous.`,
      en: `Its light has travelled for about ${amount} years to reach us.`,
      ja: `その光は、約${amount}年かけてここまで届きました。`,
    }[locale];
  return {
    fr: `D’après la vitesse à laquelle elle s’éloigne, elle se trouve à environ ${amount} d’années-lumière.`,
    en: `From the speed at which it moves away, it lies about ${amount} light-years from us.`,
    ja: `遠ざかる速さから、距離は約${amount}光年と見積もられます。`,
  }[locale];
}

const handKey = (value) =>
  String(value || "")
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "")
    .replace(/^([A-Z]+)0+(\d)/, "$1$2");

function handTextFor(target) {
  for (const key of [target.id, handKey(target.designation)])
    if (key && Object.hasOwn(spokenHandTexts, key)) return spokenHandTexts[key];
  return null;
}

// Japanese runs its sentences together; the other languages put a space.
const joined = (sentences, locale) =>
  sentences.filter(Boolean).join(locale === "ja" ? "" : " ");

/**
 * The spoken text of `target` in `locale`, as paragraphs: the adult text, or
 * with `children: true` the children's variant. `name` is the object's name
 * as the knowledge text shows it in `locale` (the presentation's own); an
 * name the same as `englishName` (an English catalogue alias the locale has
 * no word for) is left out of a French or Japanese text. Empty for
 * a locale without spoken templates — the reader then speaks the written
 * text through its pronunciation lexicon.
 */
export function spokenParagraphs(
  target,
  locale,
  { name = null, englishName = null, children = false } = {},
) {
  if (!target || !spokenTextLocales().includes(locale)) return [];
  const hand = handTextFor(target);
  const variant = children ? "children" : "adult";
  if (hand?.whole) return [...(hand[locale]?.[variant] || [])];
  if (target.catalogue === "Système solaire") return [];

  const designation = spokenDesignation(
    target.designation || target.id,
    locale,
  );
  const kind = kindOf(target.typeKey);
  const type =
    typeLabels[target.typeKey]?.[locale] || typeLabels["Ciel profond"][locale];
  const gender = frenchGender(typeLabels[kind]?.fr || type);
  const constellationKey =
    target.constellationKey && target.constellationKey !== "Système solaire"
      ? target.constellationKey
      : null;
  const constellation = constellationKey
    ? taxonomyLabel(constellationKey, locale)
    : null;
  // A name that repeats the designation (« M78 Nebula ») says nothing more.
  const compact = (value) =>
    String(value || "")
      .replaceAll(/\s+/g, "")
      .toUpperCase();
  // A name that only repeats the kind (« Galaxie ») says nothing either.
  const shownName =
    name &&
    !compact(name).includes(compact(target.designation)) &&
    // A language with no common name shows the designation itself (« NGC 2392 »
    // for « C39 / NGC 2392 »): saying « also called NGC 2392 » adds nothing.
    !String(target.designation || "")
      .split("/")
      .some((part) => compact(part) && compact(part) === compact(name)) &&
    !compact(type).toLowerCase().endsWith(compact(name).toLowerCase()) &&
    (locale === "en" || name !== englishName)
      ? String(name).trim()
      : null;

  const opening = {
    fr: [
      `${designation} est ${type}${constellation ? ` dans la constellation ${frenchOf(constellationKey, constellation)}` : ""}.`,
      shownName ? `On l’appelle aussi ${shownName}.` : null,
    ],
    en: [
      `${designation} is ${type}${constellation ? ` in the constellation ${constellation}` : ""}.`,
      shownName
        ? `It is also known as ${withEnglishArticle(shownName)}.`
        : null,
    ],
    ja: [
      `${designation}は、${constellation ? `${constellation}にある` : ""}${type}です。`,
      shownName ? `${shownName}とも呼ばれます。` : null,
    ],
  }[locale];
  const where = constellation
    ? {
        fr: `On ${gender.object === "la" ? "la" : "le"} trouve parmi les étoiles ${frenchOf(constellationKey, constellation)}.`,
        en: `You can find it among the stars of ${constellation}.`,
        ja: `${constellation}の星たちのあいだにあります。`,
      }[locale]
    : null;

  if (children) {
    const childOpening = {
      fr: [
        `${designation} est ${type}.`,
        shownName ? `On l’appelle aussi ${shownName}.` : null,
      ],
      en: [
        `${designation} is ${type}.`,
        shownName
          ? `It is also called ${withEnglishArticle(shownName)}.`
          : null,
      ],
      ja: [
        `${designation}は${type}です。`,
        shownName ? `${shownName}とも呼ばれます。` : null,
      ],
    }[locale];
    const story = hand?.[locale]?.children || [
      kindSentences[kind][locale].children,
      childrenSizeSentence(target, locale, gender),
      distanceSentence(target, locale, true),
    ];
    return [joined(childOpening, locale), joined(story, locale), where].filter(
      Boolean,
    );
  }

  return [
    joined(
      [
        ...opening,
        adultSizeSentence(target, locale, gender),
        magnitudeSentence(target, locale),
      ],
      locale,
    ),
    joined(
      [
        ...(hand?.[locale]?.adult || []),
        historySentence(target, locale, gender),
      ],
      locale,
    ),
    joined(
      [
        kindSentences[kind][locale].adult,
        hand ? null : distanceSentence(target, locale, false),
      ],
      locale,
    ),
  ].filter(Boolean);
}
