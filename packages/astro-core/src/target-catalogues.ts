import { taxonomyLabel } from "./catalog-taxonomy.js";
import { targetCatalogueInfoMore } from "./locale-names-more.js";

type CatalogueDescriptions = Record<string, string | undefined>;
type CatalogueInfo = Record<string, CatalogueDescriptions>;
type CatalogueTarget = { catalogues?: readonly string[] };
type CatalogueOption = {
  id: string;
  name: string;
  description: string;
  count: number;
};

export const targetCatalogueInfo: CatalogueInfo = {
  "Système solaire": {
    fr: "Le Soleil, la Lune, les planètes et Pluton : des astres qui se déplacent d’une nuit à l’autre sur le fond d’étoiles. Le planificateur calcule leur position et leur visibilité en direct, pour votre lieu et votre nuit.",
    en: "The Sun, Moon, planets and Pluto: bodies that move against the background stars from one night to the next. The planner calculates their position and visibility live, for your place and your night.",
    ja: "太陽・月・惑星・冥王星です。背景の星々の中を、夜ごとに位置を変えて動いていきます。プランナーが、お使いの場所とその夜に合わせて、位置と見え方をリアルタイムに計算します。",
    de: "Die Sonne, der Mond, die Planeten und Pluto: Himmelskörper, die sich von Nacht zu Nacht vor dem Sternhintergrund bewegen. Der Planer berechnet ihre Position und Sichtbarkeit live, für deinen Ort und deine Nacht.",
    es: "El Sol, la Luna, los planetas y Plutón: astros que se desplazan de una noche a otra sobre el fondo de estrellas. El planificador calcula en directo su posición y su visibilidad, para su lugar y su noche.",
    it: "Il Sole, la Luna, i pianeti e Plutone: astri che di notte in notte si spostano sullo sfondo delle stelle. Il pianificatore calcola in tempo reale la loro posizione e visibilità, per il suo luogo e la sua notte.",
    "pt-BR":
      "O Sol, a Lua, os planetas e Plutão: astros que se deslocam de uma noite para outra sobre o fundo de estrelas. O planejador calcula ao vivo sua posição e sua visibilidade, para o seu local e a sua noite.",
  },
  Messier: {
    fr: "Les 110 objets de Charles Messier et de ses collaborateurs, recensés au XVIIIe siècle. C’est une porte d’entrée classique vers les objets brillants du ciel profond.",
    en: "The 110 objects compiled by Charles Messier and his collaborators in the eighteenth century. It is a classic entry point to bright deep-sky objects.",
    ja: "シャルル・メシエと協力者が18世紀にまとめた110天体です。明るい深宇宙天体を知るための定番の入口です。",
    de: "Die 110 Objekte, die Charles Messier und seine Mitarbeiter im 18. Jahrhundert zusammengestellt haben. Ein klassischer Einstieg in helle Deep-Sky-Objekte.",
    es: "Los 110 objetos reunidos por Charles Messier y sus colaboradores en el siglo XVIII. Es una puerta de entrada clásica a los objetos brillantes del cielo profundo.",
    it: "I 110 oggetti raccolti da Charles Messier e dai suoi collaboratori nel Settecento. È una classica porta d’ingresso agli oggetti brillanti del profondo cielo.",
    "pt-BR":
      "Os 110 objetos reunidos por Charles Messier e seus colaboradores no século XVIII. É uma porta de entrada clássica para os objetos brilhantes do céu profundo.",
  },
  NGC: {
    fr: "Le New General Catalogue de J. L. E. Dreyer, publié en 1888. Il réunit des galaxies, amas et nébuleuses issus des grandes observations visuelles de son époque.",
    en: "J. L. E. Dreyer’s New General Catalogue, published in 1888. It brings together galaxies, clusters and nebulae from the major visual observations of its era.",
    ja: "1888年にJ. L. E. ドレイヤーが刊行した New General Catalogue です。当時の主要な眼視観測から、銀河・星団・星雲を集めています。",
    de: "Der New General Catalogue von J. L. E. Dreyer, erschienen 1888. Er vereint Galaxien, Haufen und Nebel aus den großen visuellen Beobachtungen seiner Zeit.",
    es: "El New General Catalogue de J. L. E. Dreyer, publicado en 1888. Reúne galaxias, cúmulos y nebulosas procedentes de las grandes observaciones visuales de su época.",
    it: "Il New General Catalogue di J. L. E. Dreyer, pubblicato nel 1888. Riunisce galassie, ammassi e nebulose tratti dalle grandi osservazioni visuali della sua epoca.",
    "pt-BR":
      "O New General Catalogue de J. L. E. Dreyer, publicado em 1888. Reúne galáxias, aglomerados e nebulosas das grandes observações visuais de sua época.",
  },
  IC: {
    fr: "L’Index Catalogue complète le NGC avec des objets publiés par J. L. E. Dreyer en 1895 et 1908, notamment grâce aux relevés photographiques plus profonds.",
    en: "The Index Catalogue extends the NGC with objects published by J. L. E. Dreyer in 1895 and 1908, notably from deeper photographic surveys.",
    ja: "Index Catalogue は、J. L. E. ドレイヤーが1895年と1908年に発表したNGCの補遺です。より深い写真観測で見つかった天体を多く含みます。",
    de: "Der Index Catalogue ergänzt den NGC um Objekte, die J. L. E. Dreyer 1895 und 1908 veröffentlicht hat, vor allem dank tieferer fotografischer Himmelsdurchmusterungen.",
    es: "El Index Catalogue completa el NGC con objetos publicados por J. L. E. Dreyer en 1895 y 1908, sobre todo gracias a estudios fotográficos más profundos.",
    it: "L’Index Catalogue integra l’NGC con oggetti pubblicati da J. L. E. Dreyer nel 1895 e nel 1908, soprattutto grazie a rilievi fotografici più profondi.",
    "pt-BR":
      "O Index Catalogue complementa o NGC com objetos publicados por J. L. E. Dreyer em 1895 e 1908, principalmente a partir de levantamentos fotográficos mais profundos.",
  },
  Caldwell: {
    fr: "La liste Caldwell compte 109 objets choisis par Patrick Moore en 1995 pour compléter Messier, avec un classement par déclinaison plutôt que par saison.",
    en: "The Caldwell list contains 109 objects selected by Patrick Moore in 1995 to complement Messier, ordered by declination rather than season.",
    ja: "コールドウェル・カタログは、メシエを補うためにパトリック・ムーアが1995年に選んだ109天体のリストです。季節ではなく赤緯順に並びます。",
    de: "Die Caldwell-Liste umfasst 109 Objekte, die Patrick Moore 1995 als Ergänzung zu Messier ausgewählt hat, geordnet nach Deklination statt nach Jahreszeit.",
    es: "La lista Caldwell contiene 109 objetos elegidos por Patrick Moore en 1995 para complementar a Messier, ordenados por declinación y no por estación.",
    it: "L’elenco Caldwell comprende 109 oggetti scelti da Patrick Moore nel 1995 a complemento di Messier, ordinati per declinazione anziché per stagione.",
    "pt-BR":
      "A lista Caldwell contém 109 objetos escolhidos por Patrick Moore em 1995 para complementar o Messier, ordenados por declinação, e não por estação.",
  },
  Barnard: {
    fr: "Le catalogue Barnard rassemble 349 nébuleuses sombres photographiées par E. E. Barnard et publiées en 1927. Elles se révèlent par contraste avec les champs stellaires et les nébuleuses lumineuses.",
    en: "The Barnard catalogue contains 349 dark nebulae photographed by E. E. Barnard and published in 1927. They are revealed by contrast against star fields and bright nebulae.",
    ja: "バーナード・カタログは、E. E. バーナードが撮影し1927年に発表した349個の暗黒星雲を収録しています。恒星の多い背景や明るい星雲との対比で姿を現します。",
    de: "Der Barnard-Katalog enthält 349 Dunkelnebel, die E. E. Barnard fotografiert hat und die 1927 veröffentlicht wurden. Sie treten im Kontrast zu Sternfeldern und hellen Nebeln hervor.",
    es: "El catálogo Barnard contiene 349 nebulosas oscuras fotografiadas por E. E. Barnard y publicadas en 1927. Se revelan por contraste con los campos de estrellas y las nebulosas brillantes.",
    it: "Il catalogo Barnard contiene 349 nebulose oscure fotografate da E. E. Barnard e pubblicate nel 1927. Si rivelano per contrasto con i campi stellari e le nebulose luminose.",
    "pt-BR":
      "O catálogo Barnard contém 349 nebulosas escuras fotografadas por E. E. Barnard e publicadas em 1927. Elas se revelam por contraste com os campos de estrelas e as nebulosas brilhantes.",
  },
  Sharpless: {
    fr: "Le catalogue Sharpless rassemble 313 régions H II repérées par Stewart Sharpless sur les plaques du Palomar Sky Survey et publiées en 1959. Ce sont des nébuleuses en émission, souvent vastes et faibles, qui se révèlent surtout en photographie avec un filtre hydrogène alpha.",
    en: "The Sharpless catalogue lists 313 H II regions found by Stewart Sharpless on the Palomar Sky Survey plates and published in 1959. They are emission nebulae, often large and faint, that show best in photographs taken through a hydrogen-alpha filter.",
    ja: "シャープレス・カタログは、スチュワート・シャープレスがパロマー天体写真星図の乾板から見つけ、1959年に発表した313個のHII領域を収録しています。大きく淡い輝線星雲が多く、Hαフィルターを使った写真でよく姿を現します。",
    de: "Der Sharpless-Katalog verzeichnet 313 H-II-Regionen, die Stewart Sharpless auf den Platten des Palomar Sky Survey gefunden und 1959 veröffentlicht hat. Es sind Emissionsnebel, oft groß und lichtschwach, die sich vor allem auf Fotos mit einem H-Alpha-Filter zeigen.",
    es: "El catálogo Sharpless recoge 313 regiones H II halladas por Stewart Sharpless en las placas del Palomar Sky Survey y publicadas en 1959. Son nebulosas de emisión, a menudo extensas y débiles, que se revelan sobre todo en fotografías con un filtro de hidrógeno alfa.",
    it: "Il catalogo Sharpless raccoglie 313 regioni H II individuate da Stewart Sharpless sulle lastre del Palomar Sky Survey e pubblicate nel 1959. Sono nebulose a emissione, spesso estese e deboli, che si rivelano soprattutto nelle fotografie con un filtro idrogeno alfa.",
    "pt-BR":
      "O catálogo Sharpless reúne 313 regiões H II encontradas por Stewart Sharpless nas placas do Palomar Sky Survey e publicadas em 1959. São nebulosas de emissão, muitas vezes extensas e fracas, que se revelam sobretudo em fotografias com filtro de hidrogênio alfa.",
  },
  LDN: {
    fr: "Le catalogue de Lynds recense près de 1 800 nébuleuses sombres relevées par Beverly Lynds sur les plaques du Palomar Sky Survey et publiées en 1962. Ces nuages de poussière se voient par l’absence d’étoiles, en contraste avec la Voie lactée ou les nébuleuses lumineuses.",
    en: "The Lynds catalogue lists nearly 1,800 dark nebulae charted by Beverly Lynds on the Palomar Sky Survey plates and published in 1962. These dust clouds show as a lack of stars, in contrast with the Milky Way or with bright nebulae.",
    ja: "リンズ暗黒星雲カタログは、ビバリー・リンズがパロマー天体写真星図の乾板から記録し、1962年に発表した約1800個の暗黒星雲を収録しています。塵の雲は星の欠けた領域として、天の川や明るい星雲との対比で姿を現します。",
    de: "Der Lynds-Katalog verzeichnet fast 1800 Dunkelnebel, die Beverly Lynds auf den Platten des Palomar Sky Survey kartiert und 1962 veröffentlicht hat. Diese Staubwolken zeigen sich als sternarme Flecken im Kontrast zur Milchstraße oder zu hellen Nebeln.",
    es: "El catálogo de Lynds recoge cerca de 1800 nebulosas oscuras cartografiadas por Beverly Lynds en las placas del Palomar Sky Survey y publicadas en 1962. Estas nubes de polvo se ven como una ausencia de estrellas, en contraste con la Vía Láctea o con las nebulosas brillantes.",
    it: "Il catalogo di Lynds elenca quasi 1800 nebulose oscure rilevate da Beverly Lynds sulle lastre del Palomar Sky Survey e pubblicate nel 1962. Queste nubi di polvere appaiono come un’assenza di stelle, in contrasto con la Via Lattea o con le nebulose luminose.",
    "pt-BR":
      "O catálogo de Lynds reúne quase 1.800 nebulosas escuras mapeadas por Beverly Lynds nas placas do Palomar Sky Survey e publicadas em 1962. Essas nuvens de poeira aparecem como uma ausência de estrelas, em contraste com a Via Láctea ou com as nebulosas brilhantes.",
  },
  LBN: {
    fr: "Le catalogue des nébuleuses brillantes de Lynds réunit 1 125 nébuleuses relevées par Beverly Lynds sur les plaques du Palomar Sky Survey et publiées en 1965. Il mêle nébuleuses en émission et en réflexion, dont beaucoup sont faibles et se révèlent surtout en photographie.",
    en: "Lynds’ catalogue of bright nebulae gathers 1,125 nebulae charted by Beverly Lynds on the Palomar Sky Survey plates and published in 1965. It mixes emission and reflection nebulae, many of them faint and best revealed in photographs.",
    ja: "リンズ散光星雲カタログは、ビバリー・リンズがパロマー天体写真星図の乾板から記録し、1965年に発表した1125個の星雲を収録しています。輝線星雲と反射星雲が混在し、その多くは淡く、主に写真で姿を現します。",
    de: "Der Lynds-Katalog heller Nebel umfasst 1125 Nebel, die Beverly Lynds auf den Platten des Palomar Sky Survey kartiert und 1965 veröffentlicht hat. Er mischt Emissions- und Reflexionsnebel, viele davon lichtschwach und vor allem auf Fotos zu sehen.",
    es: "El catálogo de nebulosas brillantes de Lynds reúne 1125 nebulosas cartografiadas por Beverly Lynds en las placas del Palomar Sky Survey y publicadas en 1965. Mezcla nebulosas de emisión y de reflexión, muchas de ellas débiles y visibles sobre todo en fotografía.",
    it: "Il catalogo delle nebulose brillanti di Lynds riunisce 1125 nebulose rilevate da Beverly Lynds sulle lastre del Palomar Sky Survey e pubblicate nel 1965. Mescola nebulose a emissione e a riflessione, molte delle quali deboli e visibili soprattutto in fotografia.",
    "pt-BR":
      "O catálogo de nebulosas brilhantes de Lynds reúne 1.125 nebulosas mapeadas por Beverly Lynds nas placas do Palomar Sky Survey e publicadas em 1965. Ele mistura nebulosas de emissão e de reflexão, muitas delas fracas e reveladas sobretudo em fotografias.",
  },
  Abell: {
    fr: "En 1966, George Abell a publié une liste de 86 nébuleuses planétaires anciennes et étendues, repérées sur les plaques du Palomar Sky Survey. Leur faible éclat de surface les rend difficiles à l’œil ; elles se révèlent surtout en photographie, souvent avec des filtres OIII et hydrogène alpha.",
    en: "In 1966 George Abell published a list of 86 old, extended planetary nebulae found on the Palomar Sky Survey plates. Their low surface brightness makes them hard to see by eye; they show best in photographs, often through OIII and hydrogen-alpha filters.",
    ja: "ジョージ・エイベルは1966年、パロマー天体写真星図の乾板から見つけた、古く広がった惑星状星雲86個のリストを発表しました。表面輝度が低いため眼視では難しく、OIIIやHαフィルターを使った写真でよく姿を現します。",
    de: "1966 veröffentlichte George Abell eine Liste von 86 alten, ausgedehnten Planetarischen Nebeln, die er auf den Platten des Palomar Sky Survey gefunden hatte. Ihre geringe Flächenhelligkeit macht sie visuell schwierig; am besten zeigen sie sich auf Fotos, oft mit OIII- und H-Alpha-Filtern.",
    es: "En 1966, George Abell publicó una lista de 86 nebulosas planetarias antiguas y extensas halladas en las placas del Palomar Sky Survey. Su bajo brillo superficial las hace difíciles en visual; se revelan sobre todo en fotografía, a menudo con filtros OIII e hidrógeno alfa.",
    it: "Nel 1966 George Abell pubblicò un elenco di 86 nebulose planetarie antiche ed estese, individuate sulle lastre del Palomar Sky Survey. La bassa luminosità superficiale le rende difficili all’oculare; si rivelano soprattutto in fotografia, spesso con filtri OIII e idrogeno alfa.",
    "pt-BR":
      "Em 1966, George Abell publicou uma lista de 86 nebulosas planetárias antigas e extensas encontradas nas placas do Palomar Sky Survey. O baixo brilho superficial as torna difíceis no visual; elas se revelam sobretudo em fotografias, muitas vezes com filtros OIII e hidrogênio alfa.",
  },
  BrightStars: {
    fr: "Les 92 étoiles les plus brillantes du ciel, de magnitude 2,5 ou plus brillantes, avec leur nom, leur constellation et leur désignation de Bayer. Ce sont les repères pour s’orienter dans le ciel et pour viser en visuel.",
    en: "The 92 brightest stars of the sky, of magnitude 2.5 or brighter, with their name, constellation and Bayer designation. They are the landmarks for finding your way around the sky and for visual observing.",
    ja: "等級2.5以上の、空で最も明るい92個の恒星です。名前、星座、バイエル名を収録しています。空で方角を知る目印になり、眼視観測の対象にもなります。",
    de: "Die 92 hellsten Sterne des Himmels, mit einer Helligkeit von 2,5 mag oder heller, mit Name, Sternbild und Bayer-Bezeichnung. Sie sind die Orientierungspunkte am Himmel und Ziele für die visuelle Beobachtung.",
    es: "Las 92 estrellas más brillantes del cielo, de magnitud 2,5 o más brillantes, con su nombre, su constelación y su designación de Bayer. Son los puntos de referencia para orientarse en el cielo y objetivos para la observación visual.",
    it: "Le 92 stelle più brillanti del cielo, di magnitudine 2,5 o più luminose, con il loro nome, la costellazione e la designazione di Bayer. Sono i punti di riferimento per orientarsi nel cielo e bersagli per l’osservazione visuale.",
    "pt-BR":
      "As 92 estrelas mais brilhantes do céu, de magnitude 2,5 ou mais brilhantes, com seu nome, sua constelação e sua designação de Bayer. São os pontos de referência para se orientar no céu e alvos para a observação visual.",
  },
  Constellations: {
    fr: "Les 88 constellations de l’Union astronomique internationale, avec leur nom latin, leur abréviation et leur génitif. Chacune regroupe les étoiles brillantes et les cibles du ciel profond qui s’y trouvent.",
    en: "The 88 constellations of the International Astronomical Union, with their Latin name, abbreviation and genitive. Each one gathers the bright stars and deep-sky targets that lie within it.",
    ja: "国際天文学連合が定める88の星座です。ラテン名、略号、属格を収録し、それぞれの星座にある明るい恒星と深宇宙天体をまとめています。",
    de: "Die 88 Sternbilder der Internationalen Astronomischen Union mit lateinischem Namen, Abkürzung und Genitiv. Jedes fasst die hellen Sterne und Deep-Sky-Ziele zusammen, die in ihm liegen.",
    es: "Las 88 constelaciones de la Unión Astronómica Internacional, con su nombre latino, su abreviatura y su genitivo. Cada una reúne las estrellas brillantes y los objetivos del cielo profundo que contiene.",
    it: "Le 88 costellazioni dell’Unione Astronomica Internazionale, con il nome latino, l’abbreviazione e il genitivo. Ognuna raccoglie le stelle brillanti e i bersagli del profondo cielo che vi si trovano.",
    "pt-BR":
      "As 88 constelações da União Astronômica Internacional, com seu nome latino, sua abreviação e seu genitivo. Cada uma reúne as estrelas brilhantes e os alvos do céu profundo que ela contém.",
  },
};

/**
 * The catalogues in the order of their notoriety, the second key of the
 * service's `notoriety` order after the editorial selection: the solar
 * system, then the catalogues an observer meets first, then the long tails.
 * The one place this order is written.
 */
export const targetCatalogueNotorietyOrder: readonly string[] = [
  "Système solaire",
  "Messier",
  "Caldwell",
  "NGC",
  "IC",
  "Sharpless",
  "Barnard",
  "LBN",
  "Abell",
  "LDN",
  "BrightStars",
  "Constellations",
];

/**
 * One catalogue's description, in [locale]. The chain goes per catalogue and
 * per language, never per document: the stored document (Administration) in
 * the language, then the code's text in the language (`targetCatalogueInfo`,
 * then `targetCatalogueInfoMore` for zh-Hans, zh-Hant and ru), then the
 * stored document's English, then the code's English. A catalogue with no
 * text anywhere has an empty description: the screens show no subtitle for
 * it. There is no generic sentence.
 */
export function targetCatalogueDescription(
  id: string,
  locale = "en",
  storedInfo: CatalogueInfo | null = {},
): string {
  return (
    storedInfo?.[id]?.[locale] ||
    targetCatalogueInfo[id]?.[locale] ||
    targetCatalogueInfoMore[id]?.[locale] ||
    storedInfo?.[id]?.en ||
    targetCatalogueInfo[id]?.en ||
    ""
  );
}

/**
 * The names of the two catalogues the application writes itself, in the ten
 * languages (their ids are `BrightStars` and `Constellations`).
 */
const ownCatalogueNames: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  BrightStars: {
    en: "Bright stars",
    fr: "Étoiles brillantes",
    ja: "明るい恒星",
    de: "Helle Sterne",
    es: "Estrellas brillantes",
    it: "Stelle brillanti",
    "pt-BR": "Estrelas brilhantes",
    ru: "Яркие звёзды",
    "zh-Hans": "亮星",
    "zh-Hant": "亮星",
  },
  Constellations: {
    en: "Constellations",
    fr: "Constellations",
    ja: "星座",
    de: "Sternbilder",
    es: "Constelaciones",
    it: "Costellazioni",
    "pt-BR": "Constelações",
    ru: "Созвездия",
    "zh-Hans": "星座",
    "zh-Hant": "星座",
  },
};

/**
 * The catalogue [id] as a person reads it in [locale]. Most catalogues are
 * proper names that read the same everywhere (« Messier », « NGC »,
 * « Sharpless »); the exceptions are the ones named after what they hold:
 * « Système solaire », whose word is the taxonomy's own in the other
 * languages, and the application's own « Étoiles brillantes » (`BrightStars`)
 * and « Constellations ». [id] stays the key (filters, counts, storage), this
 * is for display only. Held by the phone's `targetCatalogueLabel`.
 */
export function targetCatalogueLabel(id: string, locale = "fr"): string {
  if (id === "Système solaire") return taxonomyLabel(id, locale);
  const own = ownCatalogueNames[id];
  return own ? (own[locale] ?? own.en ?? id) : id;
}

/**
 * The catalogue dropdown's options. [storedInfo] is the stored document of
 * descriptions (`target-catalogue-descriptions`), when the caller has one: it
 * wins over the code's texts for the catalogues and languages it holds, and
 * the code fills the rest.
 */
export function targetCatalogueOptions(
  targets: readonly CatalogueTarget[],
  locale = "en",
  storedInfo: CatalogueInfo | null = {},
): CatalogueOption[] {
  const counts = new Map<string, number>();
  for (const target of targets) {
    for (const catalogue of target.catalogues || [])
      counts.set(catalogue, (counts.get(catalogue) || 0) + 1);
  }
  return [...counts]
    .map(([id, count]) => ({
      id,
      name: ownCatalogueNames[id] ? targetCatalogueLabel(id, locale) : id,
      description: targetCatalogueDescription(id, locale, storedInfo),
      count,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}
