import { targetDistanceOf } from "./target-distance-record.js";
import { createHash } from "node:crypto";
import { isShippedLocale } from "astro-contracts/locales";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  queriedObjectType,
  taxonomyLabel,
} from "astro-core/catalog-taxonomy.js";
import {
  localizedPlannerName,
  plannerCatalogue,
} from "astro-core/planner-targets.js";
import { cataloguePlannerCoordinate } from "astro-core/planner-coordinates.js";
import { targetLookupKey, targetLookupKeys } from "portal/target-library.js";
import { targetCatalogueOptions } from "astro-core/target-catalogues.js";
import { creditedCatalogues } from "astro-core/catalogue-sources.js";
import { caldwellReferenceFor } from "astro-core/target-catalogue-crossrefs.js";
import {
  localizedTargetCommonName,
  targetCommonNameLabels,
} from "astro-core/target-common-names.js";
import {
  objectSourceLookupKey,
  rawImagesOfEntry,
  targetCatalogueRepository,
} from "./target-library-database.server.js";
import { targetCatalogueStore } from "./target-library-store.server.js";
import {
  InvalidTargetCatalogueSeedError,
  readTargetCatalogueSeedEntries,
  targetCatalogueSeedIdentity,
  targetCatalogueSeedPath,
} from "./target-library-seed.server.js";
import {
  staticDataDocument,
  staticDataRevisionStamp,
} from "./static-data.server.js";
import { yieldToEventLoop } from "./cooperative.server.js";
import {
  targetLibraryCuratedPhotoImagesDir,
  targetLibraryDir,
  targetLibraryImagesDir,
  bundledSkyCultureImagesDir,
  bundledTargetLibraryImagesDir,
  targetLibraryVisualImagesDir,
  targetLibraryVisualPreviewImagesDir,
} from "./config.server.js";
import {
  logTargetLibraryMedia,
  targetLibraryImageFilePattern,
  targetLibraryPreviewFilePattern,
} from "./target-library-media.js";
import { hemisphereVisibility } from "astro-core/target-hemispheres.js";
import { targetCatalogueNotorietyOrder } from "astro-core/target-catalogues.js";
import { targetIsInObservingSeason } from "astro-core/target-observing-seasons.js";
import {
  effectiveSelectionModes,
  selectionMode,
  selectionModeBitsOf,
  targetInSelectionList,
  targetInSelectionPool,
} from "astro-core/target-selection.js";
import { observingGuideFor } from "portal/target-observing-guide.js";
import { knowledgeTextFor, localeChoice } from "portal/locale-content.js";
import { targetPageStory } from "portal/target-page-story.js";
import { normalizeSearch } from "portal/i18n.js";
import { solarSystemCatalogueTargets } from "astro-core/solar-system-catalogue.js";
import {
  brightStarCatalogueTargets,
  brightStarType,
  constellationCatalogueTargets,
  constellationType,
  planUseOfType,
  skyTargetsRevision,
} from "astro-core/sky-targets.js";
import { skyTextChoice, skyTextKeyOf } from "astro-core/sky-texts.js";
import { skyTextTable } from "astro-core/sky-text-table.js";
import {
  canonicalConstellationKey,
  constellationByKey,
} from "astro-core/constellations.js";
import {
  isOfflinePackPagesResearch,
  isPublishedPagesResearch,
  publishedPagesProfileVersion,
} from "./target-text-pages.js";
import { spokenParagraphs } from "./target-spoken-register.js";
import { sectionsOf, sourceLinks } from "./target-page-fields.js";
import { synchronizeTargetTexts } from "./target-texts.server.js";
import { visualReferenceFileExists } from "./visual-reference.js";

// The catalogue lives in the database, never whole in this process: a parsed
// copy of the whole seed kept for the process's life, next to a second copy
// hydrated from the database, would weigh on memory. So:
//
// - the seed is read only to import it, streamed (`target-library-seed`), once
//   per revision of the files (their size and modification time), and let go;
// - every read asks the database (`target-library-database`): the compact
//   rows a page's filters and orders need, then the whole entries of the
//   page alone; what is kept between requests is small and bounded (the
//   catalogue's credit lines, the visual references that exist, a few
//   serialized pages).
//
// Without a configured database the catalogue uses a database of its own, in
// a temporary file (`target-library-store.server.js`): one code path.

const libraryPath = () => join(targetLibraryDir, "openngc.json");
const imagesManifestPath = () => join(targetLibraryDir, "images.json");
const curatedPhotoImagesManifestPath = () =>
  join(targetLibraryDir, "curated-photo-images.json");
const visualImagesManifestPath = () =>
  join(targetLibraryDir, "visual-images.json");
const visualPreviewImagesManifestPath = () =>
  join(targetLibraryDir, "visual-preview-images.json");
const maximumPageSize = 96;

async function visualReferenceDirectoryModifiedMs() {
  try {
    return (await stat(targetLibraryVisualImagesDir)).mtimeMs;
  } catch {
    return 0;
  }
}

// A missing value is `null`, never 0: `Number(null)` is 0, which made a
// curated target without a magnitude (NGC 7822) the brightest object of the
// catalogue.
function numeric(value) {
  return optionalNumber(value);
}

// Each lookup key of the curated planner catalogue, with the position of the
// first curated target carrying it. `currentCuratedTarget` used to re-derive
// every curated target's keys for every catalogue target it presented — the
// second largest cost of a 1000-target index page.
let curatedIndexByKey = null;

function curatedTargetIndexByKey() {
  if (!curatedIndexByKey) {
    curatedIndexByKey = new Map();
    plannerCatalogue.forEach((candidate, index) => {
      for (const key of targetLookupKeys(candidate))
        if (!curatedIndexByKey.has(key)) curatedIndexByKey.set(key, index);
    });
  }
  return curatedIndexByKey;
}

/** The first curated target (in `plannerCatalogue` order) sharing a lookup
 * key with [target] — exactly what `plannerCatalogue.find` returned. */
function currentCuratedTarget(target) {
  const byKey = curatedTargetIndexByKey();
  let first = -1;
  for (const key of targetLookupKeys(target)) {
    const index = byKey.get(key);
    if (index !== undefined && (first < 0 || index < first)) first = index;
  }
  return first < 0 ? undefined : plannerCatalogue[first];
}

/** Catalogue entries walked between two hand-backs while a library loads. */
const libraryEntriesPerSlice = 2000;

function fallbackTargets() {
  return plannerCatalogue.map((target) => ({
    id: `curated-${targetLookupKey(target.designation)}`,
    designation: target.designation,
    aliases: [...new Set([target.designation, ...(target.objects || [])])],
    commonNames: target.name ? [target.name] : [],
    typeKey: target.skyTarget?.type || null,
    constellationKey: target.skyTarget?.constellation || null,
    // The library's full view gives the right ascension in hours (the
    // catalogue's own unit, `targetIndexColumns`); the curated catalogue
    // keeps degrees.
    coordinate: target.coordinate
      ? { ...target.coordinate, ra: target.coordinate.ra / 15 }
      : null,
    apparentSizeArcmin: target.apparentSizeArcmin || null,
    magnitude: numeric(target.integratedMagnitude),
    surfaceBrightness: null,
    catalogues: [target.catalogue].filter(Boolean),
    catalogue: target.catalogue || "Catalogue local",
  }));
}

function mergeLibraryTargets(baseTargets, additions) {
  const targets = new Map(
    (Array.isArray(baseTargets) ? baseTargets : [])
      .filter((target) => target?.id)
      .map((target) => [target.id, target]),
  );
  for (const target of Array.isArray(additions) ? additions : []) {
    if (!target?.id) continue;
    // Published pages (the long catalogue texts) in the base are not hidden
    // by an addition that carries a generated profile, as the built-in
    // Solar System entries do when the instance has no stored document.
    const pages = targets.get(target.id)?.editorial?.catalogueResearch;
    targets.set(
      target.id,
      isPublishedPagesResearch(pages) &&
        !isPublishedPagesResearch(target.editorial?.catalogueResearch)
        ? {
            ...target,
            editorial: { ...target.editorial, catalogueResearch: pages },
          }
        : target,
    );
  }
  return [...targets.values()];
}

function orderedDesignations(target) {
  return [target.designation, ...(target.aliases || [])].filter(Boolean);
}

function localizedName(target, locale, commonNameLabels) {
  // The bright stars and the constellations carry their names in the ten
  // languages; a star with no proper name has none to give.
  const own = target.stellar
    ? target.stellar.properName
      ? target.stellar.names
      : null
    : target.constellationInfo?.names;
  if (own !== undefined) return own ? (own[locale] ?? own.en) : null;
  const curated = currentCuratedTarget(target);
  if (curated?.name) return localizedPlannerName(curated.name, locale);
  return localizedTargetCommonName(target, locale, commonNameLabels);
}

// One formatter per locale and precision: building an `Intl.NumberFormat`
// for every size label cost more than a third of a second per 1000-target
// page.
const decimalFormats = new Map();

function decimalFormat(locale, maximumFractionDigits) {
  const key = `${locale}\u0000${maximumFractionDigits}`;
  let format = decimalFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits });
    decimalFormats.set(key, format);
  }
  return format;
}

function dimensionLabel(target, locale) {
  const [major, minor] = target.apparentSizeArcmin || [];
  if (!Number.isFinite(major)) return null;
  const decimal = decimalFormat(locale, major < 10 ? 1 : 0);
  return Number.isFinite(minor) && Math.abs(major - minor) > 0.05
    ? `${decimal.format(major)} × ${decimal.format(minor)}′`
    : `${decimal.format(major)}′`;
}

const educationalContext = {
  Galaxie: {
    fr: "Une galaxie est un vaste système d’étoiles, de gaz et de poussières. Sa lumière est souvent étalée sur une grande surface, ce qui rend un ciel sombre particulièrement utile en astrophotographie.",
    en: "A galaxy is a vast system of stars, gas and dust. Its light is often spread over a broad area, so dark skies are especially valuable for astrophotography.",
    ja: "銀河は、恒星・ガス・塵からなる巨大な系です。光は広い面積に分散することが多く、天体写真では暗い空が特に役立ちます。",
    de: "Eine Galaxie ist ein riesiges System aus Sternen, Gas und Staub. Ihr Licht verteilt sich oft auf eine große Fläche, weshalb ein dunkler Himmel für die Astrofotografie besonders wertvoll ist.",
    es: "Una galaxia es un vasto sistema de estrellas, gas y polvo. Su luz suele extenderse sobre una gran superficie, por lo que un cielo oscuro es especialmente valioso para la astrofotografía.",
    it: "Una galassia è un vasto sistema di stelle, gas e polvere. La sua luce è spesso distribuita su un’ampia superficie, perciò un cielo buio è particolarmente prezioso per l’astrofotografia.",
    "pt-BR":
      "Uma galáxia é um vasto sistema de estrelas, gás e poeira. Sua luz costuma se espalhar por uma grande área, por isso um céu escuro é especialmente valioso para a astrofotografia.",
    "zh-Hans":
      "星系是由恒星、气体和尘埃构成的庞大系统。它的光往往分散在很大的面积上，因此暗夜对天文摄影格外有价值。",
    "zh-Hant":
      "星系是由恆星、氣體與塵埃構成的龐大系統。其光線往往分散在很大的範圍，因此暗空對天文攝影特別有價值。",
    ru: "Галактика — огромная система из звёзд, газа и пыли. Её свет часто растянут по большой площади, поэтому тёмное небо особенно важно в астрофотографии.",
  },
  "Amas globulaire": {
    fr: "Un amas globulaire rassemble des centaines de milliers d’étoiles anciennes, liées par leur gravité. Sa forte concentration centrale en fait une cible très différente d’une nébuleuse diffuse.",
    en: "A globular cluster gathers hundreds of thousands of old stars bound by gravity. Its strong central concentration makes it very different from a diffuse nebula.",
    ja: "球状星団は、重力で結び付いた何十万もの古い恒星の集まりです。中心部への強い集中は、拡散星雲とはまったく異なる見え方を生みます。",
    de: "Ein Kugelsternhaufen vereint Hunderttausende alter Sterne, die durch ihre Schwerkraft gebunden sind. Seine starke Konzentration zur Mitte hin unterscheidet ihn deutlich von einem diffusen Nebel.",
    es: "Un cúmulo globular reúne cientos de miles de estrellas antiguas ligadas por la gravedad. Su fuerte concentración central lo hace muy distinto de una nebulosa difusa.",
    it: "Un ammasso globulare riunisce centinaia di migliaia di stelle antiche legate dalla gravità. La forte concentrazione centrale lo rende molto diverso da una nebulosa diffusa.",
    "pt-BR":
      "Um aglomerado globular reúne centenas de milhares de estrelas antigas ligadas pela gravidade. Sua forte concentração central o torna muito diferente de uma nebulosa difusa.",
    "zh-Hans":
      "球状星团聚集了数十万颗受引力束缚的古老恒星。中心高度密集，使它与弥漫星云截然不同。",
    "zh-Hant":
      "球狀星團聚集了數十萬顆受重力束縛的古老恆星。中心高度密集，使它與瀰漫星雲截然不同。",
    ru: "Шаровое скопление объединяет сотни тысяч старых звёзд, связанных силой тяжести. Сильная концентрация к центру делает его совсем не похожим на диффузную туманность.",
  },
  "Amas ouvert": {
    fr: "Un amas ouvert est une famille d’étoiles née dans la même région de la Voie lactée. Ses membres plus espacés dessinent souvent une structure reconnaissable dans les champs larges.",
    en: "An open cluster is a family of stars born in the same region of the Milky Way. Its more widely spaced members often form a recognisable pattern in wide fields.",
    ja: "散開星団は、天の川銀河の同じ領域で生まれた恒星の家族です。より疎らに分布する星々は、広角の写野で特徴的な形を描くことがあります。",
    de: "Ein offener Sternhaufen ist eine Familie von Sternen, die in derselben Region der Milchstraße entstanden sind. Seine weiter verteilten Mitglieder bilden in Weitfeldaufnahmen oft ein erkennbares Muster.",
    es: "Un cúmulo abierto es una familia de estrellas nacidas en la misma región de la Vía Láctea. Sus miembros, más espaciados, suelen formar una figura reconocible en campos amplios.",
    it: "Un ammasso aperto è una famiglia di stelle nate nella stessa regione della Via Lattea. I suoi membri, più distanziati, formano spesso una struttura riconoscibile nei campi larghi.",
    "pt-BR":
      "Um aglomerado aberto é uma família de estrelas nascidas na mesma região da Via Láctea. Seus membros, mais espaçados, costumam formar um padrão reconhecível em campos amplos.",
    "zh-Hans":
      "疏散星团是在银河系同一区域诞生的一族恒星。成员间距较大，在广角视场中常常勾勒出易于辨认的图案。",
    "zh-Hant":
      "疏散星團是在銀河系同一區域誕生的一群恆星。成員間距較大，在廣角視野中常能勾勒出容易辨認的圖形。",
    ru: "Рассеянное скопление — семейство звёзд, родившихся в одной области Млечного Пути. Входящие в него звёзды расположены свободнее и нередко образуют узнаваемый рисунок на широких полях.",
  },
  "Nébuleuse en émission": {
    fr: "Cette région de gaz est illuminée par des étoiles énergétiques. Les filtres à bande étroite permettent souvent de distinguer sa structure malgré la pollution lumineuse ou la Lune.",
    en: "This gas region is illuminated by energetic stars. Narrowband filters can often reveal its structure despite light pollution or moonlight.",
    ja: "このガス領域は高エネルギーの恒星に照らされています。ナローバンドフィルターは、光害や月明かりの中でも構造を引き出せることがあります。",
    de: "Diese Gasregion wird von energiereichen Sternen beleuchtet. Mit Schmalbandfiltern lässt sich ihre Struktur oft trotz Lichtverschmutzung oder Mondlicht sichtbar machen.",
    es: "Esta región de gas está iluminada por estrellas muy energéticas. Los filtros de banda estrecha suelen permitir revelar su estructura a pesar de la contaminación lumínica o de la luz de la Luna.",
    it: "Questa regione di gas è illuminata da stelle energetiche. I filtri a banda stretta permettono spesso di rivelarne la struttura nonostante l’inquinamento luminoso o la luce della Luna.",
    "pt-BR":
      "Esta região de gás é iluminada por estrelas energéticas. Filtros de banda estreita costumam revelar sua estrutura mesmo com poluição luminosa ou luar.",
    "zh-Hans":
      "这片气体区域被高能恒星照亮。窄带滤光片往往能在光污染或月光下显现它的结构。",
    "zh-Hant":
      "這片氣體區域被高能量的恆星照亮。窄頻濾鏡往往能在光害或月光下顯現其結構。",
    ru: "Эта область газа освещена горячими звёздами с мощным излучением. Узкополосные фильтры часто позволяют выявить её структуру даже при световом загрязнении или лунном свете.",
  },
  "Nébuleuse en réflexion": {
    fr: "Une nébuleuse par réflexion ne brille pas par émission propre : elle diffuse la lumière d’étoiles voisines. Ses nuances bleutées et ses poussières demandent généralement un ciel transparent et du temps d’intégration.",
    en: "A reflection nebula does not shine by its own emission: it scatters the light of nearby stars. Its blue tones and dust generally reward transparent skies and longer integration.",
    ja: "反射星雲は自ら発光するのではなく、近くの恒星の光を散乱しています。青みや塵の表現には、透明度の高い空と十分な積分時間が求められます。",
    de: "Ein Reflexionsnebel leuchtet nicht aus eigener Emission: Er streut das Licht benachbarter Sterne. Seine Blautöne und sein Staub belohnen in der Regel einen transparenten Himmel und längere Gesamtbelichtungszeiten.",
    es: "Una nebulosa de reflexión no brilla por emisión propia: dispersa la luz de estrellas cercanas. Sus tonos azulados y su polvo suelen recompensar los cielos transparentes y una mayor integración.",
    it: "Una nebulosa a riflessione non brilla di luce propria: diffonde la luce delle stelle vicine. Le sue tonalità azzurre e la sua polvere richiedono in genere un cielo trasparente e tempi di integrazione più lunghi.",
    "pt-BR":
      "Uma nebulosa de reflexão não brilha por emissão própria: ela espalha a luz de estrelas próximas. Seus tons azulados e sua poeira costumam exigir céus transparentes e mais tempo de integração.",
    "zh-Hans":
      "反射星云自身并不发光，而是散射附近恒星的光。要表现它的蓝色调和尘埃，通常需要通透的天空和更长的积分时间。",
    "zh-Hant":
      "反射星雲本身並不發光，而是散射附近恆星的光線。它的藍色調與塵埃，通常需要透明度高的天空與較長的總曝光時間。",
    ru: "Отражательная туманность не светится сама: она рассеивает свет соседних звёзд. Её голубоватые оттенки и пыль, как правило, требуют прозрачного неба и большой суммарной выдержки.",
  },
  "Nébuleuse planétaire": {
    fr: "Une nébuleuse planétaire est l’enveloppe expulsée par une étoile semblable au Soleil en fin de vie. Malgré son nom, elle n’a pas de lien avec une planète.",
    en: "A planetary nebula is the envelope shed by a Sun-like star near the end of its life. Despite its name, it is unrelated to a planet.",
    ja: "惑星状星雲は、太陽に似た恒星が晩年に放出した外層です。名前とは異なり、惑星とは関係がありません。",
    de: "Ein planetarischer Nebel ist die Hülle, die ein sonnenähnlicher Stern gegen Ende seines Lebens abstößt. Trotz seines Namens hat er nichts mit einem Planeten zu tun.",
    es: "Una nebulosa planetaria es la envoltura que expulsa una estrella similar al Sol cerca del final de su vida. A pesar de su nombre, no tiene relación con ningún planeta.",
    it: "Una nebulosa planetaria è l’involucro espulso da una stella simile al Sole verso la fine della sua vita. Nonostante il nome, non ha alcun legame con un pianeta.",
    "pt-BR":
      "Uma nebulosa planetária é o envoltório expelido por uma estrela semelhante ao Sol perto do fim de sua vida. Apesar do nome, não tem relação com nenhum planeta.",
    "zh-Hans":
      "行星状星云是类太阳恒星在生命末期抛出的外壳。尽管名字如此，它与行星并无关系。",
    "zh-Hant":
      "行星狀星雲是類似太陽的恆星在生命末期拋出的外殼。儘管名稱如此，它與行星並無關係。",
    ru: "Планетарная туманность — оболочка, сброшенная звездой, похожей на Солнце, на исходе жизни. Несмотря на название, к планетам она отношения не имеет.",
  },
  "Rémanent de supernova": {
    fr: "Un rémanent de supernova est la matière projetée lors de l’explosion d’une étoile massive. Ses filaments ténus révèlent l’interaction entre cette onde de choc et le milieu interstellaire.",
    en: "A supernova remnant is material thrown out by an exploding massive star. Its delicate filaments reveal the interaction between the shock wave and the interstellar medium.",
    ja: "超新星残骸は、大質量星の爆発で放出された物質です。繊細なフィラメントは、衝撃波と星間物質の相互作用を示しています。",
    de: "Ein Supernova-Überrest ist Materie, die ein explodierender massereicher Stern ausgeschleudert hat. Seine zarten Filamente zeigen das Zusammenspiel von Stoßwelle und interstellarem Medium.",
    es: "Un remanente de supernova es el material arrojado por una estrella masiva al explotar. Sus delicados filamentos revelan la interacción entre la onda de choque y el medio interestelar.",
    it: "Un resto di supernova è la materia scagliata da una stella massiccia che esplode. I suoi delicati filamenti rivelano l’interazione tra l’onda d’urto e il mezzo interstellare.",
    "pt-BR":
      "Um remanescente de supernova é o material lançado por uma estrela massiva ao explodir. Seus delicados filamentos revelam a interação entre a onda de choque e o meio interestelar.",
    "zh-Hans":
      "超新星遗迹是大质量恒星爆炸时抛出的物质。其纤细的丝状结构显示出冲击波与星际介质之间的相互作用。",
    "zh-Hant":
      "超新星殘骸是大質量恆星爆炸時拋出的物質。其纖細的絲狀結構顯示出衝擊波與星際介質之間的交互作用。",
    ru: "Остаток сверхновой — вещество, выброшенное при взрыве массивной звезды. Тонкие волокна показывают, как ударная волна взаимодействует с межзвёздной средой.",
  },
  "Nébuleuse sombre": {
    fr: "Une nébuleuse sombre est un nuage de poussière qui masque la lumière des étoiles situées derrière elle. Elle se révèle surtout par contraste avec un fond riche en étoiles ou en hydrogène lumineux.",
    en: "A dark nebula is a dust cloud that blocks the light of stars behind it. It is seen mainly by contrast against a star-rich or glowing hydrogen background.",
    ja: "暗黒星雲は、背後の恒星の光を遮る塵の雲です。星の多い背景や明るい水素ガスとの対比で主に見えてきます。",
    de: "Ein Dunkelnebel ist eine Staubwolke, die das Licht dahinterliegender Sterne abschirmt. Er zeigt sich vor allem im Kontrast zu einem sternreichen oder leuchtenden Wasserstoffhintergrund.",
    es: "Una nebulosa oscura es una nube de polvo que bloquea la luz de las estrellas situadas detrás. Se distingue sobre todo por contraste con un fondo rico en estrellas o con hidrógeno brillante.",
    it: "Una nebulosa oscura è una nube di polvere che blocca la luce delle stelle retrostanti. Si nota soprattutto per contrasto con uno sfondo ricco di stelle o di idrogeno luminoso.",
    "pt-BR":
      "Uma nebulosa escura é uma nuvem de poeira que bloqueia a luz das estrelas atrás dela. Ela aparece principalmente por contraste com um fundo rico em estrelas ou em hidrogênio brilhante.",
    "zh-Hans":
      "暗星云是遮挡背后恒星光线的尘埃云。它主要借助与繁星密布或发光氢气背景的反差显现出来。",
    "zh-Hant":
      "暗星雲是遮擋背後恆星光線的塵埃雲。它主要藉由與繁星密布或發光氫氣背景的對比而顯現。",
    ru: "Тёмная туманность — пылевое облако, закрывающее свет звёзд за ним. Видна она главным образом на контрасте с богатым звёздами или светящимся водородным фоном.",
  },
};

// The general sentence of a target whose type has no educational context,
// and the apparent-size sentence that follows it.
const generalContext = {
  fr: "Cette cible du ciel profond se révèle différemment selon la qualité du ciel, le champ cadré et le temps d’intégration.",
  en: "This deep-sky target reveals itself differently depending on sky quality, framing and integration time.",
  ja: "この深宇宙天体は、局所的な空の条件、写野、露出時間によって見え方が大きく変わります。",
  de: "Dieses Deep-Sky-Objekt zeigt sich je nach Himmelsqualität, Bildausschnitt und Gesamtbelichtungszeit unterschiedlich.",
  es: "Este objeto del cielo profundo se muestra de forma distinta según la calidad del cielo, el encuadre y el tiempo de integración.",
  it: "Questo oggetto del profondo cielo si mostra in modo diverso a seconda della qualità del cielo, dell’inquadratura e del tempo di integrazione.",
  "pt-BR":
    "Este objeto de céu profundo se revela de maneira diferente conforme a qualidade do céu, o enquadramento e o tempo de integração.",
  "zh-Hans": "这个深空目标呈现出怎样的样貌，取决于天空质量、构图和积分时间。",
  "zh-Hant": "這個深空目標呈現出怎樣的面貌，取決於天空品質、構圖與總曝光時間。",
  ru: "Этот объект глубокого космоса выглядит по-разному в зависимости от качества неба, кадрирования и суммарной выдержки.",
};
const extentSentence = {
  fr: (size) => ` Son étendue apparente est d’environ ${size}.`,
  en: (size) => ` Its apparent extent is about ${size}.`,
  ja: (size) => ` 見かけの大きさは約 ${size} です。`,
  de: (size) => ` Seine scheinbare Ausdehnung beträgt etwa ${size}.`,
  es: (size) => ` Su extensión aparente es de unos ${size}.`,
  it: (size) => ` La sua estensione apparente è di circa ${size}.`,
  "pt-BR": (size) => ` Sua extensão aparente é de cerca de ${size}.`,
  "zh-Hans": (size) => `其视大小约为${size}。`,
  "zh-Hant": (size) => `其角大小約為 ${size}。`,
  ru: (size) => ` Угловой размер — около\u00a0${size}.`,
};

// The short story of a target without a curated knowledge text, in `locale`
// when its words exist, else in English, said (`fallback`).
function storyFor(target, locale) {
  const context = educationalContext[target.typeKey || ""] || generalContext;
  const choice = localeChoice(Object.keys(context), locale);
  const shown = choice.locale;
  const size = dimensionLabel(target, shown);
  const factual = size ? extentSentence[shown](size) : "";
  return {
    text: `${context[shown]}${factual}`,
    locale: shown,
    fallback: choice.fallback,
  };
}

function researchContentFor(target, locale) {
  const research = target.editorial?.catalogueResearch;
  const text = knowledgeTextFor(research, locale);
  // The sources and the note belong to the language the text is shown in: a
  // published page cites its sources in its own words; a generated profile
  // shares one list across languages.
  const content = text.locale ? research?.content?.[text.locale] : null;
  const ownSources = sourceLinks(content?.sources);
  return {
    paragraphs: text.paragraphs,
    sections: sectionsOf(content),
    note: content?.note ? String(content.note) : null,
    locale: text.locale,
    fallback: text.fallback,
    sources: ownSources.length ? ownSources : sourceLinks(research?.sources),
    tier: research?.tier || null,
  };
}

// The knowledge text of a target in `locale`: the curated paragraphs, else
// the short story. When it is not written in `locale`, `fallbackLocale` names
// the language it is shown in (`storyFallbackLocale` on the wire); a locale
// with text has none.
function knowledgeFor(target, locale, research) {
  if (research.paragraphs.length)
    return {
      story: research.paragraphs.join(" "),
      fallbackLocale: research.fallback ? research.locale : null,
    };
  const story = storyFor(target, locale);
  return {
    story: story.text,
    fallbackLocale: story.fallback ? story.locale : null,
  };
}

function imageUrl(entry, route) {
  return entry?.file ? `${route}/${encodeURIComponent(entry.file)}` : null;
}

export { targetDistanceOf };

function presentation(
  target,
  locale,
  images = {},
  curatedPhotoImages = {},
  visualImages = {},
  visualPreviewImages = {},
  references = null,
) {
  const name = localizedName(target, locale, references?.commonNameLabels);
  const designation = orderedDesignations(target)[0] || target.id;
  const type = target.typeKey
    ? taxonomyLabel(target.typeKey, locale, references?.taxonomy)
    : null;
  const constellation = target.constellationKey
    ? taxonomyLabel(target.constellationKey, locale, references?.taxonomy)
    : null;
  const dssImage = images[target.id];
  const curatedPhoto = curatedPhotoImages[target.id];
  const visualImage = visualImages[target.id];
  const visualPreviewImage = visualPreviewImages[target.id];
  const photo = curatedPhoto || dssImage;
  const research = researchContentFor(target, locale);
  const knowledge = knowledgeFor(target, locale, research);
  const observingGuide = observingGuideFor(target);
  const visibility =
    typeof target.visibleFromNorthernHemisphere === "boolean" &&
    typeof target.visibleFromSouthernHemisphere === "boolean"
      ? {
          visibleFromNorthernHemisphere: target.visibleFromNorthernHemisphere,
          visibleFromSouthernHemisphere: target.visibleFromSouthernHemisphere,
        }
      : hemisphereVisibility(target.coordinate?.dec);
  const photoRoute = curatedPhoto
    ? "/target-library-curated-images"
    : "/target-library-images";
  // The editorial record holds the text of every language (a published page,
  // ten of them with their sections): the answer carries the one asked for
  // (`story`, `storyParagraphs`, `storySections`, `researchSources`), never
  // the whole record.
  const { editorial: ignoredEditorial, ...publicTarget } = target;
  return {
    ...publicTarget,
    name,
    title:
      target.catalogue === "Système solaire" ||
      target.typeKey === brightStarType ||
      target.typeKey === constellationType
        ? name || designation
        : name
          ? `${designation} — ${name}`
          : designation,
    designation,
    type,
    constellation,
    story: knowledge.story,
    storyParagraphs: research.paragraphs,
    ...(knowledge.fallbackLocale
      ? { storyFallbackLocale: knowledge.fallbackLocale }
      : {}),
    ...(research.sections.length ? { storySections: research.sections } : {}),
    researchSources: research.sources,
    ...(research.note ? { researchNote: research.note } : {}),
    researchTier: research.tier,
    observingGuide,
    apparentSizeLabel: dimensionLabel(target, locale),
    distance: targetDistanceOf(target),
    caldwellReference: caldwellReferenceFor(target),
    isBest: Boolean(target.isBest),
    isExtended: Boolean(target.isExtended),
    modes: effectiveSelectionModes(target),
    ...planUseOfType(target.typeKey),
    visibleFromNorthernHemisphere: visibility.visibleFromNorthernHemisphere,
    visibleFromSouthernHemisphere: visibility.visibleFromSouthernHemisphere,
    photoThumbnailUrl: imageUrl(photo, photoRoute),
    dssThumbnailUrl: imageUrl(dssImage, "/target-library-images"),
    premiumThumbnailUrl: imageUrl(
      curatedPhoto,
      "/target-library-curated-images",
    ),
    visualThumbnailUrl: imageUrl(visualImage, "/target-library-visual-images"),
    visualPreviewThumbnailUrl: imageUrl(
      visualPreviewImage,
      "/target-library-visual-preview-images",
    ),
    photoImageCredit: photo?.credit || null,
    photoImageSourceUrl: photo?.sourceUrl || null,
    dssImageCredit: dssImage?.credit || dssImage?.source || null,
    premiumImageCredit: curatedPhoto?.credit || null,
    visualImageCredit: visualImage?.credit || null,
    visualImageSourceUrl: visualImage?.sourceUrl || null,
    visualPreviewImageCredit: visualPreviewImage?.credit || null,
    visualPreviewImageSourceUrl: visualPreviewImage?.sourceUrl || null,
    // Kept for callers that display the photographic catalogue image only.
    thumbnailUrl: imageUrl(photo, photoRoute),
  };
}

// ── The source files ──────────────────────────────────────────────────────

/**
 * What the catalogue keeps of an image manifest of the runtime folder
 * (`images.json`, `curated-photo-images.json`, …): its modification time and
 * its attribution, read again only when the file changes. The images it
 * lists are read by the import alone (`manifestImages`), never kept.
 */
const manifestMetadataCache = new Map();

function manifestImagesOf(parsed, { visual = false } = {}) {
  const images =
    parsed?.images && typeof parsed.images === "object" ? parsed.images : {};
  return visual
    ? Object.fromEntries(
        Object.entries(images).filter(([, image]) => image?.kind !== "demo"),
      )
    : images;
}

async function manifestMetadata(path, { visual = false } = {}) {
  try {
    const metadata = await stat(path);
    const cached = manifestMetadataCache.get(path);
    if (cached?.modifiedMs === metadata.mtimeMs) return cached;
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const images = manifestImagesOf(parsed, { visual });
    const result = {
      modifiedMs: metadata.mtimeMs,
      // A visual manifest without a single reference credits nobody.
      attribution:
        visual && !Object.keys(images).length
          ? null
          : parsed.attribution || null,
    };
    manifestMetadataCache.set(path, result);
    return result;
  } catch {
    return { modifiedMs: 0, attribution: null };
  }
}

/** The images a manifest lists (`{ [targetId]: image }`), for an import. */
async function manifestImages(path, { visual = false } = {}) {
  try {
    return manifestImagesOf(JSON.parse(await readFile(path, "utf8")), {
      visual,
    });
  } catch {
    return {};
  }
}

const manifests = () => ({
  images: { path: imagesManifestPath() },
  curatedPhotoImages: { path: curatedPhotoImagesManifestPath() },
  visualImages: { path: visualImagesManifestPath(), visual: true },
  visualPreviewImages: { path: visualPreviewImagesManifestPath() },
});

async function manifestsMetadata() {
  const entries = Object.entries(manifests());
  const values = await Promise.all(
    entries.map(([, manifest]) => manifestMetadata(manifest.path, manifest)),
  );
  return Object.fromEntries(
    entries.map(([name], index) => [name, values[index]]),
  );
}

async function readRuntimeLibrary() {
  const path = libraryPath();
  try {
    const [metadata, content] = await Promise.all([
      stat(path),
      readFile(path, "utf8"),
    ]);
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.targets)) throw new Error("targets missing");
    return { ...parsed, modifiedMs: metadata.mtimeMs };
  } catch {
    throw new Error("The runtime OpenNGC target library is unavailable.");
  }
}

/**
 * Explicitly synchronizes the private runtime catalogue into persistence. This is
 * intentionally separate from normal reads, which prefer the versioned static
 * package so a running instance never changes its source implicitly.
 */
export async function synchronizeRuntimeTargetLibrary() {
  const repository = await targetCatalogueRepository();
  if (!repository)
    throw new Error(
      "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required to synchronize the runtime target library.",
    );
  const [
    sourceLibrary,
    metadata,
    visualReferenceDirectoryModified,
    solarSystemDocument,
  ] = await Promise.all([
    readRuntimeLibrary(),
    manifestsMetadata(),
    visualReferenceDirectoryModifiedMs(),
    staticDataDocument("solar-system-targets"),
  ]);
  const library = {
    ...sourceLibrary,
    targets: mergeLibraryTargets(
      sourceLibrary.targets,
      solarSystemDocument?.payload?.targets || solarSystemCatalogueTargets,
    ),
  };
  const sourceRevision = [
    "runtime",
    sourceLibrary.modifiedMs,
    metadata.images.modifiedMs,
    metadata.curatedPhotoImages.modifiedMs,
    metadata.visualImages.modifiedMs,
    metadata.visualPreviewImages.modifiedMs,
    visualReferenceDirectoryModified,
    solarSystemDocument?.sourceRevision || "default",
  ].join(":");
  const result = await repository.synchronize({
    library,
    ...(await importImages({ seed: false })),
    sourceRevision,
  });
  forgetLoadedCatalogue();
  return { ...result, sourceRevision, targets: library.targets.length };
}

async function statIdentity(path) {
  try {
    const metadata = await stat(path);
    return [metadata.size, metadata.mtimeMs];
  } catch {
    return null;
  }
}

/**
 * What the loaded catalogue — and therefore every `GET /v1/target-index`
 * page — is built from, cheaply: the identity (size and modification time)
 * of each source file, the static-data documents' stamp, and the catalogue
 * database's own state row. Unchanged, the catalogue is unchanged: the very
 * files, the very rows (an edit, an import or a synchronization moves the
 * state's revision).
 *
 * Nothing here loads the catalogue: that is the point. The offline-pack
 * manifest keys the component it walked every page for on this, so a new
 * process — a wake-up, a restart — can tell that component still describes
 * the data without reading every target from a slow network file system first.
 * Nothing in it depends on the application's own build either (paths,
 * dates of the image's files): a new build over the same data keeps it.
 */
export async function catalogueFingerprint() {
  const [files, visualReferences, staticData, repository] = await Promise.all([
    Promise.all(
      [
        targetCatalogueSeedPath(),
        libraryPath(),
        imagesManifestPath(),
        curatedPhotoImagesManifestPath(),
        visualImagesManifestPath(),
        visualPreviewImagesManifestPath(),
      ].map(statIdentity),
    ),
    visualReferenceDirectoryModifiedMs(),
    staticDataRevisionStamp(),
    targetCatalogueRepository(),
  ]);
  const state = repository ? await repository.state() : null;
  const texts = repository ? await repository.textsStamp() : null;
  return JSON.stringify([
    "catalogue-fingerprint-1",
    files,
    visualReferences,
    staticData,
    state ? [state.source_revision, state.revision] : null,
    texts,
    skyTextRevision(),
  ]);
}

// ── The import ────────────────────────────────────────────────────────────

/** The identity of a source file this process found invalid, so that it is
 * not read again until it changes. */
const invalidSources = new Set();
const identityKey = (identity) =>
  identity
    ? [identity.path, identity.size, identity.mtimeMs, identity.ino].join(":")
    : null;

async function openngcIdentity() {
  try {
    const path = libraryPath();
    const metadata = await stat(path);
    return {
      path,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ino: metadata.ino,
    };
  } catch {
    return null;
  }
}

/**
 * Which source the catalogue is to be imported from, and its revision: the
 * static package's seed, else the runtime OpenNGC library, else the curated
 * fallback — the Solar System bodies merged in, from their static document —
 * with the identity of every file the import reads. Reads no file whole: a
 * `stat` each, and the small solar document. The revision string is the one
 * the catalogue has always recorded, so that an instance whose database
 * already holds the package does not import it again.
 */
async function catalogueSource() {
  const [
    seedIdentity,
    libraryIdentity,
    solarSystemDocument,
    metadata,
    visualReferenceDirectoryModified,
  ] = await Promise.all([
    targetCatalogueSeedIdentity(),
    openngcIdentity(),
    staticDataDocument("solar-system-targets"),
    manifestsMetadata(),
    visualReferenceDirectoryModifiedMs(),
  ]);
  const solarSystemTargets = Array.isArray(
    solarSystemDocument?.payload?.targets,
  )
    ? solarSystemDocument.payload.targets
    : solarSystemCatalogueTargets;
  const solarSystemRevision = [
    solarSystemDocument?.sourceRevision || "default",
    solarSystemDocument?.updatedAt || "",
  ].join(":");
  let kind = "fallback";
  let identity = null;
  let modifiedMs = `fallback:solar:${solarSystemRevision}`;
  if (seedIdentity && !invalidSources.has(identityKey(seedIdentity))) {
    kind = "seed";
    identity = seedIdentity;
    modifiedMs = `seed:${seedIdentity.mtimeMs}:solar:${solarSystemRevision}`;
  } else if (
    libraryIdentity &&
    !invalidSources.has(identityKey(libraryIdentity))
  ) {
    kind = "library";
    identity = libraryIdentity;
    modifiedMs = `file:${libraryIdentity.mtimeMs}:solar:${solarSystemRevision}`;
  }
  return {
    kind,
    identity,
    // The targets the application writes itself, merged into every source:
    // the Solar System's bodies, the bright stars and the constellations.
    builtInTargets: [
      ...solarSystemTargets,
      ...brightStarCatalogueTargets,
      ...constellationCatalogueTargets,
    ],
    revision: [
      "visual-preview-v2",
      `sky-${skyTargetsRevision}`,
      modifiedMs,
      metadata.images.modifiedMs,
      metadata.curatedPhotoImages.modifiedMs,
      metadata.visualImages.modifiedMs,
      metadata.visualPreviewImages.modifiedMs,
      visualReferenceDirectoryModified,
    ].join(":"),
  };
}

/** A source that turned out not to be one (an invalid seed or library). */
class InvalidCatalogueSourceError extends Error {}

/**
 * The seed's targets, one at a time (`readTargetCatalogueSeedEntries`), the
 * built-in targets (the Solar System's bodies, the bright stars, the
 * constellations) merged in as `mergeLibraryTargets` merges them: a built-in
 * target replaces the seed's entry of the same identifier in its place,
 * keeping the seed's published pages when it has none, and the others follow.
 */
/** The seed's own record of each target `seedTargets` hands over. */
const seedRecords = new WeakMap();

async function* seedTargets(source, header) {
  const solarById = new Map();
  for (const target of source.builtInTargets)
    if (target?.id) solarById.set(target.id, target);
  const merged = new Set();
  try {
    for await (const entry of readTargetCatalogueSeedEntries(undefined, {
      path: source.identity.path,
      onHeader: (key, value) => {
        header[key] = value;
      },
    })) {
      const body = solarById.get(entry.id);
      if (!body) {
        seedRecords.set(entry, entry);
        yield entry;
        continue;
      }
      merged.add(entry.id);
      const target = mergeLibraryTargets([entry], [body])[0];
      seedRecords.set(target, entry);
      yield target;
    }
  } catch (error) {
    if (error instanceof InvalidTargetCatalogueSeedError)
      throw new InvalidCatalogueSourceError(error.message);
    throw error;
  }
  for (const [id, body] of solarById) if (!merged.has(id)) yield body;
}

/**
 * The images an import takes from the runtime manifests: all four for the
 * runtime library and the fallback; for a seed, whose entries carry their own
 * survey and premium images, only the visual layers, which the runtime may
 * hold in addition (the seed's own records still take precedence).
 */
async function importImages({ seed }) {
  const all = manifests();
  const [images, premiumImages, visualImages, visualPreviewImages] =
    await Promise.all([
      seed ? {} : manifestImages(all.images.path),
      seed ? {} : manifestImages(all.curatedPhotoImages.path),
      manifestImages(all.visualImages.path, { visual: true }),
      manifestImages(all.visualPreviewImages.path),
    ]);
  return { images, premiumImages, visualImages, visualPreviewImages };
}

/** The library `synchronize` imports for [source]. */
async function importedLibrary(source) {
  if (source.kind === "seed") {
    const header = {};
    return {
      targets: seedTargets(source, header),
      // The version of the selections its flags were exported under (read
      // with the header, before the first entry).
      selectionVersion: () => header.selectionVersion ?? null,
      metadata: () => ({
        source: header.source || "PlanAstro exported target catalogue",
        license: null,
        importedAt: header.exportedAt || null,
        url: null,
      }),
    };
  }
  if (source.kind === "library") {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(source.identity.path, "utf8"));
      if (!Array.isArray(parsed?.targets)) throw new Error("targets missing");
    } catch (error) {
      throw new InvalidCatalogueSourceError(error.message);
    }
    return {
      targets: mergeLibraryTargets(parsed.targets, source.builtInTargets),
      metadata: () => ({
        source: parsed.source ?? null,
        license: parsed.license ?? null,
        importedAt: parsed.importedAt ?? null,
        url: parsed.url ?? null,
      }),
    };
  }
  return {
    targets: mergeLibraryTargets(fallbackTargets(), source.builtInTargets),
    metadata: () => ({
      source: "PlanAstro curated fallback",
      license: null,
      importedAt: null,
      url: null,
    }),
  };
}

/**
 * Text import options for the private store (`restrictCatalogueTextTiers`):
 * the offline-pack builder needs tiers A and B only.
 */
let textTiers = null;

/** Limits the tiers of stored texts this process imports (a tool's choice,
 * before its first catalogue read; the service imports every tier). */
export function restrictCatalogueTextTiers(tiers) {
  textTiers = tiers ? [...tiers] : null;
}

/** The import of the texts' shards into the catalogue's database, in the
 * background; returns the import in progress, or null. */
function synchronizedTexts(store) {
  return synchronizeTargetTexts({
    repository: store,
    ...(textTiers ? { tiers: textTiers } : {}),
  });
}

/**
 * The catalogue's database made to describe its source files: the import
 * when a source file changed (or on a new database), then the derived data
 * (`ensureDerived`). One at a time: the database has one driver, and a second
 * `synchronize` started while the first is in its transaction fails with
 * « Nested database transactions are not supported ». On a new database the
 * service's fill at start and the first catalogue read (the offline-pack
 * warm-up it sends itself) arrive together.
 */
let sourcesSynchronizing = null;
function synchronizedCatalogueSources() {
  sourcesSynchronizing ??= readAndSynchronizeCatalogueSources().finally(() => {
    sourcesSynchronizing = null;
  });
  return sourcesSynchronizing;
}

async function readAndSynchronizeCatalogueSources() {
  const store = await targetCatalogueStore();
  // The pages in shards (`target_texts`): imported in the background when
  // the package's shards changed; a read does not wait for them.
  synchronizedTexts(store);
  for (;;) {
    const source = await catalogueSource();
    const state = await store.state();
    if (state?.source_revision === source.revision) break;
    try {
      await store.synchronize({
        library: await importedLibrary(source),
        ...(await importImages({ seed: source.kind === "seed" })),
        sourceRevision: source.revision,
        // The raw mode's images (a process without a database): those of
        // the seed's own record of each target.
        ownImages: (target) => seedRecords.get(target) ?? null,
      });
      break;
    } catch (error) {
      if (!(error instanceof InvalidCatalogueSourceError) || !source.identity)
        throw error;
      // Not read again until it changes: the next source is tried.
      invalidSources.add(identityKey(source.identity));
    }
  }
  let state = await store.ensureDerived();
  if (state && !state.metadata) {
    // A catalogue imported before credit lines were stored has its
    // source's credit line in no row: read once from the source (a seed's
    // header: its first bytes), without importing anything again.
    try {
      await store.recordMetadata(await sourceMetadata(await catalogueSource()));
      state = await store.catalogueState();
    } catch {
      // Without its credit line the catalogue still answers; the next read
      // tries again.
    }
  }
  return { store, state };
}

/** The credit line of [source] (`metadata` of `importedLibrary`), reading
 * no more of a seed than its header. */
async function sourceMetadata(source) {
  const library = await importedLibrary(source);
  if (source.kind === "seed")
    // The header comes before the entries in a seed the service writes:
    // the first entry is as far as this reads.
    for await (const ignored of library.targets) break;
  return library.metadata();
}

/**
 * The catalogue the database holds must exist before anything asks the
 * database about a target. `target_catalogue_entries` was filled only by the
 * first catalogue read (`loadedLibrary`), so on a new database a night's
 * target was refused `422 target_not_found` until somebody had read the
 * catalogue. The service now fills it at start, and every route that checks
 * a target against it calls this first. A database that already holds a
 * catalogue is left alone (a changed source is synchronized by the next
 * catalogue read, as before); without a database there is nothing to fill.
 */
let catalogueEnsuring = null;
let catalogueEnsured = false;
export function ensureTargetCatalogue() {
  if (catalogueEnsured) return Promise.resolve();
  catalogueEnsuring ??= (async () => {
    const repository = await targetCatalogueRepository();
    if (!repository) return;
    if (!(await repository.state()) && !(await repository.hasEntries()))
      await synchronizedCatalogueSources();
    synchronizedTexts(repository);
    catalogueEnsured = true;
  })().finally(() => {
    catalogueEnsuring = null;
  });
  return catalogueEnsuring;
}

/**
 * What the service does with the catalogue before it says it is ready
 * (`portal-app/server/start.js`): the database made to describe its source
 * files — the import when the source's revision moved since the last start
 * (a new data package, new sky targets: some 17,000 targets), or the first
 * one on a new database — then the loaded catalogue the reads share. Each
 * step is told to [log] (`log(event, message, context)`) with its duration,
 * so that a slow start shows which step was slow.
 *
 * The media check of that revision (the folders of the images read once: 80 s
 * on the production share) starts with the load, as ever, but is not waited
 * for: it only counts the files the library names and the folders lack, and
 * never delays or fails a read. `mediaChecked` resolves, once it is over, to
 * its `{ name, durationMs }` and never rejects; its start and end are told to
 * [log] like the others'.
 *
 * Returns `{ resynchronized, steps, mediaChecked }` (`steps`: `[{ name,
 * durationMs }]` of the steps waited for), or null without a database.
 * Throws what the steps throw: the caller decides whether the service starts
 * without it.
 */
export async function warmTargetCatalogue({ log = () => {} } = {}) {
  const repository = await targetCatalogueRepository();
  if (!repository) return null;
  const steps = [];
  const step = async (name, event, begin, work, end) => {
    if (begin) log(`${event}.start`, begin, { step: name });
    const started = performance.now();
    const result = await work();
    const durationMs = Math.round(performance.now() - started);
    steps.push({ name, durationMs });
    log(`${event}.done`, end(result, durationMs), { step: name, durationMs });
    return result;
  };
  const before = await repository.state();
  const { state } = await step(
    "resync",
    "catalogue.sync",
    before
      ? `Checking the catalogue against its source (stored revision ${before.source_revision}).`
      : "New database: writing the catalogue for the first time.",
    () => synchronizedCatalogueSources(),
    ({ state: after }, durationMs) =>
      before?.source_revision === after?.source_revision
        ? `The catalogue already matches its source (${durationMs} ms).`
        : `The catalogue was resynchronized with its source in ${durationMs} ms.`,
  );
  await step(
    "load",
    "catalogue.load",
    "Loading the catalogue the reads share.",
    () => loadedCatalogue(),
    (ignored, durationMs) => `The catalogue was loaded in ${durationMs} ms.`,
  );
  // Started by the load; told now, ended whenever it ends.
  log("catalogue.media.start", "Checking the media files of the catalogue.", {
    step: "media",
  });
  const mediaStarted = performance.now();
  const mediaChecked = mediaChecking.then(() => {
    const durationMs = Math.round(performance.now() - mediaStarted);
    log("catalogue.media.done", `The media check took ${durationMs} ms.`, {
      step: "media",
      durationMs,
    });
    return { name: "media", durationMs };
  });
  // The texts' shards come in the background, as ever: a read does not wait
  // for them.
  synchronizedTexts(repository);
  catalogueEnsured = true;
  return {
    resynchronized: before?.source_revision !== state?.source_revision,
    steps,
    mediaChecked,
  };
}

/**
 * The import of the texts' shards, awaited (the offline-pack builder, which
 * must not build the pack's pages before they are in; tests).
 */
export async function targetTextsImported() {
  const store = await targetCatalogueStore();
  for (;;) {
    const importing = synchronizedTexts(store);
    if (!importing) return;
    const result = await importing;
    if (!result) return;
  }
}

// ── The loaded catalogue ──────────────────────────────────────────────────

/**
 * What the reads keep of the catalogue between two requests, per revision:
 * its credit lines, the visual references whose file exists, the credited
 * catalogues — nothing that grows with the number of targets but the set of
 * visual references (a few hundred identifiers).
 */
let loadedSnapshot = null;
let snapshotLoad = null;

/** Forgets what the reads keep of the catalogue (an edit; a test seam). */
export function forgetLoadedCatalogue() {
  loadedSnapshot = null;
}

async function loadedCatalogue() {
  const { store, state } = await synchronizedCatalogueSources();
  const modifiedMs = `${state?.source_revision}:${state?.revision || 0}`;
  if (loadedSnapshot?.modifiedMs === modifiedMs) return loadedSnapshot;
  // Several requests arriving together after a restart share one load.
  if (snapshotLoad?.modifiedMs !== modifiedMs) {
    const promise = assembledCatalogue({ modifiedMs, store, state });
    snapshotLoad = { modifiedMs, promise };
    promise.then(
      (snapshot) => {
        if (snapshotLoad?.promise === promise) {
          loadedSnapshot = snapshot;
          snapshotLoad = null;
        }
      },
      () => {
        if (snapshotLoad?.promise === promise) snapshotLoad = null;
      },
    );
  }
  return snapshotLoad.promise;
}

async function assembledCatalogue({ modifiedMs, store, state }) {
  const [metadata, visualRecords, names, distances] = await Promise.all([
    manifestsMetadata(),
    store.mediaOf("visual"),
    store.catalogueNames(),
    store.hasDistances(),
  ]);
  // Prepared reference records may already be in the database while their
  // asset has deliberately not been copied into the private runtime yet.
  // They remain editable in admin, but must never win the visual-mode
  // fallback or yield a broken image in the public catalogue until the
  // named file exists.
  const available = await Promise.all(
    visualRecords.map(async ({ id, image }) =>
      (await visualReferenceFileExists(image, targetLibraryVisualImagesDir))
        ? id
        : null,
    ),
  );
  const snapshot = {
    modifiedMs,
    store,
    metadata: state?.metadata || {},
    visualAvailable: new Set(available.filter(Boolean)),
    creditedCatalogues: creditedCatalogues(new Set(names)),
    distances,
    imageAttribution: metadata.images.attribution,
    curatedPhotoImageAttribution: metadata.curatedPhotoImages.attribution,
    visualImageAttribution: metadata.visualImages.attribution,
    visualPreviewImageAttribution: metadata.visualPreviewImages.attribution,
  };
  logMediaOnce(snapshot);
  return snapshot;
}

/** [entry] presented, its images those of its own record (a visual
 * reference only when its file exists). */
function presentedEntry(entry, locale, snapshot, references, record = entry) {
  // The raw mode's images are the source's and the manifests' (see
  // `rawImagesOf`), kept beside the source's record (`record`: the entry as
  // read, when `entry` is a copy of it with its stored texts).
  const raw = rawImagesOfEntry(record);
  const images = raw
    ? {
        dssImage: raw.dss,
        premiumImage: raw.premium,
        visualImage: raw.visual,
        visualPreviewImage: raw.preview,
      }
    : entry;
  return presentation(
    entry,
    locale,
    images.dssImage ? { [entry.id]: images.dssImage } : {},
    images.premiumImage ? { [entry.id]: images.premiumImage } : {},
    images.visualImage && snapshot.visualAvailable.has(entry.id)
      ? { [entry.id]: images.visualImage }
      : {},
    images.visualPreviewImage ? { [entry.id]: images.visualPreviewImage } : {},
    references,
  );
}

/**
 * A listing's row carries the page of its target or no text at all: when the
 * page is not in hand (the pages kept for the online reading, tier C, are not
 * read for a listing) the short generated text that stands in for it is not
 * served, nor its language flag; the reader asks `GET /v1/targets/{id}` for
 * the page (never the old template).
 */
function withoutTemplateStory(presented) {
  if (presented.storyParagraphs?.length) return presented;
  const { storyFallbackLocale: ignored, ...rest } = presented;
  return { ...rest, story: "" };
}

/**
 * The whole entries of [targets] (compact rows of `poolRows`, or targets
 * that are not in the database: the curated fallback), in that order.
 */
async function wholeEntries(snapshot, targets, { lean = false } = {}) {
  const stored = new Map(
    (
      await snapshot.store.entriesByIds(
        targets
          .filter((target) => target.designationRank !== undefined)
          .map((target) => target.id),
        { lean },
      )
    ).map((entry) => [entry.id, entry]),
  );
  return targets
    .map((target) =>
      target.designationRank === undefined ? target : stored.get(target.id),
    )
    .filter(Boolean);
}

// The library names images the file system may not hold (a missing one
// would answer 404 without a word). One line per loaded
// revision says how many are missing; the check reads each folder once, runs
// after the load and never delays or fails it. The records are read from the
// database for it, then let go.
let mediaLoggedFor = null;
let mediaChecking = Promise.resolve();
/** The media check of the loaded revision, to wait for (the warm-up tells
 * its end in the background, `warmTargetCatalogue`); never rejects. */
export const targetLibraryMediaChecked = () => mediaChecking;
function logMediaOnce(snapshot) {
  if (mediaLoggedFor === snapshot.modifiedMs) return;
  mediaLoggedFor = snapshot.modifiedMs;
  mediaChecking = (async () => {
    const store = snapshot.store;
    const catalogueById = new Map();
    const layer = async (variant, name, directory, pattern, alsoIn) => {
      const entries = {};
      for (const { id, catalogue, image } of await store.mediaOf(variant)) {
        if (variant === "visual" && !snapshot.visualAvailable.has(id)) continue;
        entries[id] = {
          file: image.file,
          ...(image.kind ? { kind: image.kind } : {}),
        };
        catalogueById.set(id, catalogue);
      }
      return {
        name,
        entries,
        directory,
        ...(pattern ? { pattern } : {}),
        ...(alsoIn ? { alsoIn } : {}),
      };
    };
    const layers = [
      await layer(
        "dss",
        "images",
        targetLibraryImagesDir,
        targetLibraryImageFilePattern,
        [bundledTargetLibraryImagesDir, bundledSkyCultureImagesDir],
      ),
      await layer(
        "visual-preview",
        "visual-preview-images",
        targetLibraryVisualPreviewImagesDir,
        targetLibraryPreviewFilePattern,
      ),
      await layer(
        "premium",
        "curated-photo-images",
        targetLibraryCuratedPhotoImagesDir,
      ),
      await layer("visual", "visual-images", targetLibraryVisualImagesDir),
    ];
    await logTargetLibraryMedia({
      catalogueOf: (id) => catalogueById.get(id),
      layers,
    });
  })().catch(() => {});
}

// The catalogue's credit: its source line, and the catalogues among its
// targets that carry their own credit line
// (`astro-core/catalogue-sources.js`: Sharpless, LDN, LBN, Abell), which the
// catalogue screens write under it, in the reader's language.
function catalogueAttribution(snapshot) {
  const metadata = snapshot.metadata || {};
  if (!metadata.source) return null;
  return {
    source: metadata.source,
    license: metadata.license || null,
    importedAt: metadata.importedAt || null,
    url: metadata.url || null,
    catalogues: snapshot.creditedCatalogues,
    // True when some target carries a distance, so the catalogue
    // screens write the distance credit lines (`distanceSourceCredits`,
    // `astro-core/catalogue-sources.js`) under the catalogue's own.
    distances: snapshot.distances,
  };
}

/** The catalogue's and the image sets' credits, as every answer carries them. */
const catalogueCredits = (snapshot) => ({
  attribution: catalogueAttribution(snapshot),
  imageAttribution: snapshot.imageAttribution || null,
  curatedPhotoImageAttribution: snapshot.curatedPhotoImageAttribution || null,
  visualImageAttribution: snapshot.visualImageAttribution || null,
  visualPreviewImageAttribution: snapshot.visualPreviewImageAttribution || null,
});

// A search such as cœur or heart must find the target. The catalogue is searched by its reference (M, NGC, IC, Sh2…, with or
// without the space), by its common name in English and by its common name in
// the language of the request -- not only by the English names OpenNGC gives a
// hundred and fifty of its targets. Folding is the web's own `normalizeSearch`
// (case, accents, ligatures « œ » → « oe », full-width forms), on the query and
// on the text searched alike, so « cœur », « coeur » and « Cœur » are one word.
//
// The text searched is built once per target and language: a page of the
// catalogue asks it of every target, and the name lookups behind it cost more
// than the comparison does.
const searchableTexts = new WeakMap();

function searchableText(target, locale) {
  let byLocale = searchableTexts.get(target);
  if (!byLocale) {
    byLocale = new Map();
    searchableTexts.set(target, byLocale);
  }
  let text = byLocale.get(locale);
  if (text === undefined) {
    // The Solar System's bodies carry their English designation only, so
    // « Saturne » or « Giove » must also search the name `localizedName`
    // presents in the request's language. Every other target is searched by
    // that name too, and by the English one, whatever the language.
    text = normalizeSearch(
      [
        target.designation,
        ...(target.aliases || []),
        ...(target.commonNames || []),
        localizedName(target, locale),
        locale === "en" ? null : localizedName(target, "en"),
        target.typeKey,
        target.constellationKey,
        // The constellation by its name, in the language and in Latin:
        // « Lyre » finds what is in the Lyre.
        target.constellationKey
          ? taxonomyLabel(target.constellationKey, locale)
          : null,
        constellationByKey(target.constellationKey)?.latinName,
      ]
        .filter(Boolean)
        .join(" "),
      locale,
    );
    byLocale.set(locale, text);
  }
  return text;
}

// The last query folded: a page folds it once per target otherwise.
let lastFoldedQuery = null;

function foldedQuery(query, locale) {
  if (lastFoldedQuery?.query === query && lastFoldedQuery.locale === locale)
    return lastFoldedQuery.folded;
  const folded = normalizeSearch(String(query).trim(), locale);
  lastFoldedQuery = { query, locale, folded };
  return folded;
}

export function matchesQuery(target, query, locale = "en") {
  if (!query) return true;
  const needle = foldedQuery(query, locale);
  if (!needle) return true;
  if (searchableText(target, locale).includes(needle)) return true;
  // A designation is also found with a space in place of its hyphen or
  // without its space (« sh2 155 », « ldn1622 »).
  if (!/\d/.test(needle)) return false;
  const compactQuery = compactDesignationText(needle);
  return [target.designation, ...(target.aliases || [])].some((value) =>
    compactDesignationText(value).includes(compactQuery),
  );
}

function compactDesignationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\-_.]+/g, "");
}

/**
 * The row `target_catalogue_search` keeps of [target] in [locale]: the very
 * text `matchesQuery` searches (`searchableText`), and the compact forms of
 * its designation and aliases, separated by a character no query holds.
 */
function searchRowOf(target, locale) {
  return {
    folded: searchableText(target, locale),
    compact: [target.designation, ...(target.aliases || [])]
      .map(compactDesignationText)
      .join("\u0001"),
  };
}

// What the folded text depends on besides the catalogue: the curated names,
// the built-in common names and the language's folding. A new build that
// changes any of them makes the search text be built again.
const searchProbe =
  "Œuvre Cœur Æther Straße İ ＡＢＣ１２３ ｶﾀｶﾅ かたかな カタカナ 漢字 汉字 Ёлка é è ñ ç ü ø å";
let searchRulesDigest = null;

function searchStamp(snapshot, locale) {
  searchRulesDigest ??= createHash("sha256")
    .update(
      JSON.stringify([
        2,
        plannerCatalogue.map((target) => [
          target.id,
          target.source,
          target.designation,
          target.name,
          target.title,
          target.objects,
        ]),
        targetCommonNameLabels,
      ]),
    )
    .digest("base64url")
    .slice(0, 16);
  return [
    snapshot.modifiedMs,
    searchRulesDigest,
    normalizeSearch(searchProbe, locale),
  ].join("|");
}

/**
 * The query of a page, folded as `matchesQuery` folds it, and the search it
 * asks of the database: null when it matches everything, `{ inMemory }` for
 * a language the database keeps no search text for (an internal caller's:
 * the routes accept shipped languages only), which `matchesQuery` then
 * answers target by target.
 */
async function querySearch(snapshot, normalizedQuery, locale) {
  if (!normalizedQuery) return null;
  const needle = foldedQuery(normalizedQuery, locale);
  if (!needle) return null;
  if (!isShippedLocale(locale)) return { inMemory: true };
  await snapshot.store.ensureSearch(
    locale,
    searchStamp(snapshot, locale),
    (target) => searchRowOf(target, locale),
  );
  return {
    locale,
    needle,
    compact: /\d/.test(needle) ? compactDesignationText(needle) : null,
  };
}

// Exported so that a caller can use it directly, the same way
// `plannerCandidateScore` below is: neither export changes this module's own
// behavior, which only ever calls them locally.
// `localeCompare(other, "en", { numeric: true })` builds this very collator
// on every call; sorting the catalogue for each page did that about 200 000
// times (the largest cost of a page, ≈130 ms of its ≈300 ms).
const designationCollator = new Intl.Collator("en", { numeric: true });

export function stableTargetOrder(left, right) {
  return designationCollator.compare(
    String(left.designation || left.id),
    String(right.designation || right.id),
  );
}

const notorietyCatalogueRanks = new Map(
  targetCatalogueNotorietyOrder.map((catalogue, index) => [catalogue, index]),
);
const notorietyRanks = new WeakMap();

/**
 * A target's place in the `notoriety` order, as one number: the selection
 * rank first (Essentielles, then Étendues, then the rest), then the rank of
 * the best-placed catalogue it belongs to (`catalogues` is the list the
 * catalogue filter reads, so a Caldwell object that is also an NGC sorts
 * among the Caldwell ones). A catalogue that is not in
 * `targetCatalogueNotorietyOrder` ranks after every listed one.
 */
function notorietyRank(target) {
  let rank = notorietyRanks.get(target);
  if (rank === undefined) {
    const selection = target.isBest ? 0 : target.isExtended ? 1 : 2;
    const names = target.catalogues?.length
      ? target.catalogues
      : [target.catalogue];
    let catalogue = notorietyCatalogueRanks.size;
    for (const name of names)
      catalogue = Math.min(
        catalogue,
        notorietyCatalogueRanks.get(name) ?? notorietyCatalogueRanks.size,
      );
    rank = selection * (notorietyCatalogueRanks.size + 1) + catalogue;
    notorietyRanks.set(target, rank);
  }
  return rank;
}

/**
 * `stableTargetOrder` as a stable sort of the catalogue applies it: two rows
 * of the database compare by their place in the designation order
 * (`designation_rank`, that very sort, stored), which costs a subtraction
 * instead of a collation; a target the database does not hold (the curated
 * fallback) by its designation.
 */
function designationCompare(left, right) {
  return left.designationRank !== undefined &&
    right.designationRank !== undefined
    ? left.designationRank - right.designationRank
    : stableTargetOrder(left, right);
}

/** Total and stable: rank, then the designation (`stableTargetOrder`). */
function compareNotoriety(left, right) {
  return (
    notorietyRank(left) - notorietyRank(right) || stableTargetOrder(left, right)
  );
}

/**
 * The orderings `targetLibrarySearch` can apply.
 *
 * `designation` is the historical one and stays the default: the catalogue
 * browser is an alphabetical index and every existing client depends on it.
 * `notoriety` is the order of the planner's catalogue screens: the editorial
 * selection first, then the catalogue's rank, then the designation —
 * independent of the observer and of the night, so it needs neither `latitude`
 * nor `minimumAltitude` and drops nothing. `planner` is the opt-in relevance
 * ordering the web planner already gets from `plannerTargetCandidates` — the
 * same `plannerCandidateScore`, the same `stableTargetOrder` tiebreak, and the
 * same exclusion of targets the score cannot rank (no declination, or never
 * reaching `minimumAltitude` at the observer's latitude). Without it an
 * unfiltered page is whichever designations sort first, which a large
 * alphabetically-early family such as Barnard's dark nebulae fills entirely.
 */
export const targetLibrarySortOrders = ["designation", "planner", "notoriety"];

/**
 * The one filter-and-order pass every catalogue reader shares.
 *
 * `targetLibrarySearch` (the full presentation envelope) and
 * `targetIndexSearch` (the compact columnar index) must select and order the
 * same targets for the same parameters, or the two views of one catalogue
 * would disagree. They therefore differ only in what they project and in how
 * large a page they will cut — never in which targets match, nor in what
 * `total` counts.
 */
function isSolarSystemTarget(target) {
  return target.catalogue === "Système solaire";
}

/**
 * `sort=planner` ranks by a declination the Solar System's bodies do not
 * have (their place is the ephemeris's), so it leaves them out of the
 * recommendation pool — decided, and kept. A typed search is not a
 * recommendation: a body the visitor names is kept, and answered first (the
 * client puts the exact match first anyway), under any ordering.
 */
const solarSystemSearchScore = Number.MAX_SAFE_INTEGER;

function solarSystemSearched(target, normalizedQuery) {
  return Boolean(normalizedQuery) && isSolarSystemTarget(target);
}

/**
 * The filter dimensions a catalogue page can facet by: each is a dropdown
 * or search box with its own counter. `featured` and a favorites
 * `targetIds` restriction are deliberately not here — neither is a dropdown
 * with a per-option counter, so neither is ever excepted from a facet the
 * way `type`/`catalogue`/`selection` are; they narrow the pool every facet
 * (and the page itself) is measured against instead.
 */
const facetDimensions = [
  "query",
  "type",
  "constellation",
  "catalogue",
  "selection",
  "hemisphere",
  "season",
];

/**
 * Evaluates every facetable dimension for one target exactly once. Shared by
 * the page filter, the faceted option counts and their unfiltered totals, so
 * a query normalization or a seasonal lookup never runs twice for the same
 * target in the same request.
 */

function evaluateFilterDimensions(target, params) {
  const {
    normalizedQuery,
    locale,
    type,
    constellation,
    catalogue,
    safeSelection,
    safeMode,
    safeHemisphere,
    safeSeason,
  } = params;
  const solar = isSolarSystemTarget(target);
  return {
    // The database's answer when it searched (`querySearch`), else the
    // rule itself (a target the catalogue does not hold, a language without
    // stored search text).
    query: target.queryMatch ?? matchesQuery(target, normalizedQuery, locale),
    type: !type || target.typeKey === type,
    constellation: !constellation || target.constellationKey === constellation,
    catalogue: !catalogue || Boolean(target.catalogues?.includes(catalogue)),
    // The two lists are disjoint; `mode` keeps a list's targets of that mode
    // and leaves a page without a selection whole.
    selection: targetInSelectionList(target, safeSelection, safeMode),
    hemisphere:
      !safeHemisphere ||
      solar ||
      (safeHemisphere === "north"
        ? Boolean(target.visibleFromNorthernHemisphere)
        : Boolean(target.visibleFromSouthernHemisphere)),
    season:
      solar ||
      targetIsInObservingSeason({
        rightAscensionHours: target.coordinate?.ra,
        season: safeSeason,
        hemisphere: safeHemisphere,
      }),
  };
}

/**
 * True when every dimension but `except` matches (`except: null` — used for
 * the page's own result set — requires all of them). This is the facet rule
 * of `R8`: an option group's counter is computed with every *other* active
 * filter applied, never with its own.
 */
function matchesExcept(matches, except) {
  for (const dimension of facetDimensions) {
    if (dimension !== except && !matches[dimension]) return false;
  }
  return true;
}

/**
 * The centre of [season]'s right ascensions for [hemisphere], probed from
 * `targetIsInObservingSeason` itself (hours within three of it), or null.
 */
const seasonCentres = new Map();
function seasonCentre(season, hemisphere) {
  const key = `${season}:${hemisphere}`;
  if (!seasonCentres.has(key)) {
    const inSeason = (hours) =>
      targetIsInObservingSeason({
        rightAscensionHours: ((hours % 24) + 24) % 24,
        season,
        hemisphere,
      });
    seasonCentres.set(
      key,
      [0, 6, 12, 18].find(
        (centre) =>
          inSeason(centre) &&
          inSeason(centre + 2.99) &&
          inSeason(centre - 2.99) &&
          !inSeason(centre + 3.01) &&
          !inSeason(centre - 3.01),
      ) ?? null,
    );
  }
  return seasonCentres.get(key);
}

async function libraryQueryPlan({
  locale = "en",
  query = "",
  type = "",
  constellation = "",
  catalogue = "",
  selection = "",
  mode = "",
  hemisphere = "",
  season = "",
  offset = 0,
  limit = 48,
  maximumLimit = maximumPageSize,
  featured = false,
  targetIds = null,
  sort = "",
  latitude = null,
  minimumAltitude = null,
  computeFacets = false,
} = {}) {
  const snapshot = await loadedCatalogue();
  const store = snapshot.store;
  // `type=stellar` and `type=constellation` name the two types the application
  // writes itself; a constellation is asked by its abbreviation or by any
  // name that names it (`Lyr`, `Lyre`, `Lyra`).
  type = type ? queriedObjectType(String(type)) : "";
  constellation = constellation
    ? (canonicalConstellationKey(constellation) ?? String(constellation).trim())
    : "";
  const normalizedQuery = normalizeSearch(String(query).trim(), locale);
  const curatedKeys = curatedTargetIndexByKey();
  const safeSelection = ["best", "extended"].includes(selection)
    ? selection
    : "";
  const safeMode = selectionMode(mode);
  const safeHemisphere = ["north", "south"].includes(hemisphere)
    ? hemisphere
    : "";
  const safeSeason = ["winter", "spring", "summer", "autumn"].includes(season)
    ? season
    : "";
  const requestedTargetIds =
    targetIds instanceof Set
      ? targetIds
      : Array.isArray(targetIds)
        ? new Set(targetIds.map(String))
        : null;
  const safeSort = targetLibrarySortOrders.includes(sort)
    ? sort
    : "designation";
  const observerLatitude = optionalNumber(latitude);
  const plannerMinimumAltitude = Math.max(
    0,
    Math.min(89, optionalNumber(minimumAltitude) ?? 30),
  );

  // What the database is asked for: every condition selects at least the
  // targets the rules below keep (`poolQuery`), and the rules are applied
  // to what comes back, exactly as they were to the catalogue in memory.
  // `featured`, a favorites restriction and — under `sort=planner` — the
  // observer's own visibility are hard restrictions of the pool, not
  // facetable dropdowns: they narrow the pool every counter describes.
  const filter = {};
  if (requestedTargetIds) filter.ids = [...requestedTargetIds];
  if (featured && !curatedKeys.has(objectSourceLookupKey)) {
    const ids = await store.idsWithLookupKeys([...curatedKeys.keys()]);
    filter.ids = filter.ids ? filter.ids.filter((id) => ids.has(id)) : [...ids];
  }
  if (safeSort === "planner") {
    // Rankable: a declination (and a right ascension: a coordinate), and,
    // at a latitude, a culmination at `minimumAltitude` or above — a band
    // of declinations, widened a little; or a Solar System body named by a
    // typed search.
    const reach = 90 - plannerMinimumAltitude + 1e-6;
    filter.declination = {
      minimum: observerLatitude === null ? -90 : observerLatitude - reach,
      maximum: observerLatitude === null ? 90 : observerLatitude + reach,
      orSolarSystem: Boolean(normalizedQuery),
    };
  }
  const search = await querySearch(snapshot, normalizedQuery, locale);
  // Without counters the dimensions select the rows too; with them, every
  // row of the pool is needed (each counter ignores its own dimension, and
  // the unfiltered counts ignore them all), and the search is a column.
  if (search && !search.inMemory)
    filter.search = { ...search, asColumn: computeFacets };
  if (!computeFacets) {
    if (type) filter.typeKey = type;
    if (constellation) filter.constellationKey = constellation;
    if (catalogue) filter.catalogue = catalogue;
    if (safeSelection) filter.selection = safeSelection;
    if (safeHemisphere) filter.hemisphere = safeHemisphere;
    const centre =
      safeSeason && safeHemisphere
        ? seasonCentre(safeSeason, safeHemisphere)
        : null;
    if (centre !== null)
      filter.rightAscension = { centre, halfWidth: 3 + 1e-6 };
  }
  // In the catalogue's designation order (`designation_rank`): the filters
  // below keep it, and the final stable sort meets an ordered pool — targets
  // comparing equal keep the catalogue's own order, as before.
  const candidates = await store.poolRows(filter);
  if (filter.search && !filter.search.asColumn)
    for (const target of candidates) target.queryMatch = true;
  if (featured) {
    // The curated targets the catalogue does not hold (no key in common with
    // any of its targets, nor with one already added) come after its own.
    const added = new Set();
    for (const target of fallbackTargets()) {
      const keys = targetLookupKeys(target);
      if (keys.some((key) => added.has(key))) continue;
      if ((await store.idsWithLookupKeys(keys)).size) continue;
      for (const key of keys) added.add(key);
      candidates.push(target);
    }
  }
  const basePool = candidates.filter(
    (target) =>
      (!featured ||
        target.designationRank !== undefined ||
        targetLookupKeys(target).some((key) => curatedKeys.has(key))) &&
      (!requestedTargetIds || requestedTargetIds.has(target.id)) &&
      (safeSort !== "planner" ||
        solarSystemSearched(target, normalizedQuery) ||
        plannerCandidateScore(
          target,
          observerLatitude,
          plannerMinimumAltitude,
        ) !== null),
  );
  const dimensionParams = {
    normalizedQuery,
    locale,
    type,
    constellation,
    catalogue,
    safeSelection,
    safeMode,
    safeHemisphere,
    safeSeason,
  };
  // Every candidate's seven filter dimensions are evaluated exactly once
  // here — the single pass the faceted counters below and the page filter
  // itself both read from, rather than each re-deriving them.
  const evaluated = basePool.map((target) => ({
    target,
    matches: evaluateFilterDimensions(target, dimensionParams),
  }));
  const selected = evaluated
    .filter(({ matches }) => matchesExcept(matches, null))
    .map(({ target }) => target);
  let facets = null;
  if (computeFacets) {
    const selectionFacet = { total: 0, best: 0, extended: 0 };
    const selectionUnfiltered = { total: 0, best: 0, extended: 0 };
    const catalogueFacetCounts = new Map();
    const catalogueUnfilteredCounts = new Map();
    const typeFacetCounts = new Map();
    const typeUnfilteredCounts = new Map();
    // Each list's count in the mode asked (`mode`), as its filter reads it.
    const inBest = (target) => targetInSelectionList(target, "best", safeMode);
    const inExtended = (target) =>
      targetInSelectionList(target, "extended", safeMode);
    for (const { target, matches } of evaluated) {
      selectionUnfiltered.total += 1;
      if (inBest(target)) selectionUnfiltered.best += 1;
      if (inExtended(target)) selectionUnfiltered.extended += 1;
      for (const entryCatalogue of target.catalogues || [])
        catalogueUnfilteredCounts.set(
          entryCatalogue,
          (catalogueUnfilteredCounts.get(entryCatalogue) || 0) + 1,
        );
      if (target.typeKey)
        typeUnfilteredCounts.set(
          target.typeKey,
          (typeUnfilteredCounts.get(target.typeKey) || 0) + 1,
        );
      if (matchesExcept(matches, "selection")) {
        selectionFacet.total += 1;
        if (inBest(target)) selectionFacet.best += 1;
        if (inExtended(target)) selectionFacet.extended += 1;
      }
      if (matchesExcept(matches, "catalogue")) {
        for (const entryCatalogue of target.catalogues || [])
          catalogueFacetCounts.set(
            entryCatalogue,
            (catalogueFacetCounts.get(entryCatalogue) || 0) + 1,
          );
      }
      if (target.typeKey && matchesExcept(matches, "type")) {
        typeFacetCounts.set(
          target.typeKey,
          (typeFacetCounts.get(target.typeKey) || 0) + 1,
        );
      }
    }
    facets = {
      selectionFacet,
      selectionUnfiltered,
      catalogueFacetCounts,
      catalogueUnfilteredCounts,
      typeFacetCounts,
      typeUnfilteredCounts,
      basePool,
    };
  }
  // `planner` ranks the whole filtered set before the page is cut, so the
  // page a caller receives is the most relevant one for its observing place
  // rather than the alphabetically first one. A target the score cannot rank
  // is dropped entirely, exactly as `plannerTargetCandidates` drops it — from
  // `basePool` already, so `total` and every faceted counter above describe
  // the same ranked set the page itself is drawn from. The `.filter` on
  // `entry.score !== null` below is therefore never false under `planner`;
  // it stays as the explicit, self-documenting statement of that invariant.
  const matching =
    safeSort === "planner"
      ? selected
          .map((target) => ({
            target,
            score: solarSystemSearched(target, normalizedQuery)
              ? solarSystemSearchScore
              : plannerCandidateScore(
                  target,
                  observerLatitude,
                  plannerMinimumAltitude,
                ),
          }))
          .filter((entry) => entry.score !== null)
          .sort(
            (left, right) =>
              right.score - left.score ||
              designationCompare(left.target, right.target),
          )
          .map((entry) => entry.target)
      : selected.sort(
          safeSort === "notoriety"
            ? (left, right) =>
                notorietyRank(left) - notorietyRank(right) ||
                designationCompare(left, right)
            : designationCompare,
        );
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const safeLimit = Math.max(
    1,
    Math.min(maximumLimit, Math.floor(Number(limit) || 48)),
  );
  return {
    snapshot,
    matching,
    safeSort,
    safeMode,
    safeOffset,
    safeLimit,
    facets,
  };
}

/**
 * The last answers of the catalogue's searches and planner pools, serialized
 * (at most `answerCacheLimit`, `answerCacheCharacters` characters in all), per
 * catalogue revision: the catalogue's first page in each language and the
 * planner's pool at a rounded latitude are asked for over and over, and each
 * reads every row of its pool. A favorites search belongs to one person and
 * is never kept. Each caller gets its own copy.
 */
const answerCacheLimit = 32;
const answerCacheCharacters = 16 * 1024 * 1024;
const answerCache = new Map();

async function rememberedAnswer(kind, options, compute) {
  if (options?.targetIds) return await compute();
  const snapshot = await loadedCatalogue();
  const key = JSON.stringify([kind, snapshot.modifiedMs, options ?? {}]);
  let json = answerCache.get(key);
  if (json !== undefined) answerCache.delete(key);
  else json = JSON.stringify(await compute());
  answerCache.set(key, json);
  let characters = 0;
  for (const held of answerCache.values()) characters += held.length;
  for (const oldest of answerCache.keys()) {
    if (
      answerCache.size <= 1 ||
      (answerCache.size <= answerCacheLimit &&
        characters <= answerCacheCharacters)
    )
      break;
    characters -= answerCache.get(oldest).length;
    answerCache.delete(oldest);
  }
  return JSON.parse(json);
}

export function targetLibrarySearch(options = {}) {
  return rememberedAnswer("search", options, () =>
    searchedTargetLibrary(options),
  );
}

// How many targets of the catalogue a constellation holds besides its bright
// stars (its card says « 1 étoile brillante · 43 cibles »): every row of its
// key but its bright stars and its own row. Counted once per catalogue
// revision and constellation.
const constellationTargetCounts = new Map();
async function withConstellationTargetCount(snapshot, presented) {
  const info = presented?.constellationInfo;
  if (presented?.typeKey !== constellationType || !info) return presented;
  const key = presented.constellationKey;
  const cacheKey = `${snapshot.modifiedMs}\u0000${key}`;
  let count = constellationTargetCounts.get(cacheKey);
  if (count === undefined) {
    const total = await snapshot.store.poolCount({ constellationKey: key });
    count = Math.max(0, total - (Number(info.brightStarCount) || 0) - 1);
    if (constellationTargetCounts.size > 400) constellationTargetCounts.clear();
    constellationTargetCounts.set(cacheKey, count);
  }
  return { ...presented, constellationInfo: { ...info, targetCount: count } };
}

async function searchedTargetLibrary({
  locale = "en",
  offset = 0,
  limit = 48,
  ...filters
} = {}) {
  const { snapshot, matching, safeSort, safeOffset, safeLimit, facets } =
    await libraryQueryPlan({
      ...filters,
      locale,
      offset,
      limit,
      maximumLimit: maximumPageSize,
      computeFacets: true,
    });
  const [catalogueDescriptions, taxonomy, commonNames] = await Promise.all([
    staticDataDocument("target-catalogue-descriptions"),
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("target-common-names"),
  ]);
  const references = {
    taxonomy: taxonomy?.payload,
    commonNameLabels: commonNames?.payload?.labels,
  };
  const page = await wholeEntries(
    snapshot,
    matching.slice(safeOffset, safeOffset + safeLimit),
  );
  return {
    total: matching.length,
    offset: safeOffset,
    limit: safeLimit,
    // Echoing the ordering that was actually applied is what lets a client
    // tell a portal that honoured `sort=planner` from an older one that
    // silently ignored the parameter and answered by designation.
    sort: safeSort,
    targets: await Promise.all(
      page.map((target) =>
        withConstellationTargetCount(
          snapshot,
          withoutTemplateStory(
            presentedEntry(target, locale, snapshot, references),
          ),
        ),
      ),
    ),
    ...catalogueCredits(snapshot),
    // `counts` is the selection dropdown's own facet: each of
    // `best`/`extended` is computed with every *other* active filter
    // applied but the selection filter itself ignored, so picking
    // "Essentielles" no longer collapses "Étendues" onto the same number.
    // `total` is the same facet with no editorial predicate at all — the
    // count the "All" option represents. `countsUnfiltered` is the same
    // three counts with *no* filter applied at all (not even the other
    // dimensions): the `n` of `R7`'s `x/n`, constant for a given catalogue
    // revision and independent of the query string.
    counts: {
      total: facets.selectionFacet.total,
      best: facets.selectionFacet.best,
      extended: facets.selectionFacet.extended,
    },
    countsUnfiltered: {
      total: facets.selectionUnfiltered.total,
      best: facets.selectionUnfiltered.best,
      extended: facets.selectionUnfiltered.extended,
    },
    // `catalogueOptions[].count` is the catalogue dropdown's own facet: how
    // many targets carry that catalogue among those matching every *other*
    // active filter (query/type/constellation/selection/hemisphere/season/
    // favorites), the catalogue filter itself ignored. `.total` is the same
    // count with no filter applied at all — `R7`'s `n`. The option list
    // itself (which catalogues exist, their name and description) is drawn
    // from the unfiltered pool, so it never shrinks or reorders as filters
    // are applied — only the two numbers next to each entry change.
    catalogueOptions: targetCatalogueOptions(
      facets.basePool,
      locale,
      catalogueDescriptions?.payload?.catalogues,
    ).map((option) => ({
      ...option,
      total: option.count,
      count: facets.catalogueFacetCounts.get(option.id) || 0,
    })),
    // `typeOptions[].count`/`.total` follow the same rule as
    // `catalogueOptions` above, for the type dropdown.
    typeOptions: [...facets.typeUnfilteredCounts.keys()]
      .map((id) => ({
        id,
        name: taxonomyLabel(id, locale, taxonomy?.payload),
        count: facets.typeFacetCounts.get(id) || 0,
        total: facets.typeUnfilteredCounts.get(id) || 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, locale)),
  };
}

/**
 * The compact catalogue index (`GET /v1/target-index`).
 *
 * `targetLibrarySearch` answers with the portal's whole presentation of a
 * target — the knowledge article, the observing guide's prose, every image
 * credit — which is right for a catalogue page of 48 entries and wrong for
 * the mobile planner, which needs several hundred *candidates* and reads
 * almost none of that: about 7 kB per target, against a 96-entry page cap,
 * is what limits a client's recommendation pool to 48 targets while the web
 * planner ranks 720 plus every extended one.
 *
 * This index is the same catalogue, same filters, same ordering, projected
 * down to what a candidate actually needs: the planner's own astronomy, the
 * two maps' markers and labels, one list row and the preview card under the
 * map. The knowledge article, the observing guide's prose and the per-target
 * image credits are not here; a client that needs them fetches the one
 * target it is showing through `GET /v1/targets/{id}`, which it already did.
 *
 * The notation is columnar: the column names are stated once in `fields` and
 * every target is a positional array in `rows`. Nothing repeats a key name
 * several hundred times, the reader looks columns up by name so an unknown
 * column is ignorable and an absent one is tolerable, and the whole thing
 * stays self-describing — which a one-letter-key object is not. `v` is the
 * notation's own version, so a later revision can be told from this one
 * without negotiating anything.
 */
export const targetIndexNotation = 1;

/**
 * The compact index's page cap. Far above the full view's 96 because a row
 * here is a fraction of a presented target, and because the web planner's own
 * pool is `plannerCandidateMaximum` (720) plus every extended target: a
 * client that cannot ask for that in one page has no way to match it.
 */
export const targetIndexMaximumPageSize = 1000;

/**
 * The columns, in row order. Names are stable; a new column is appended
 * rather than inserted, and a reader addresses them by name through `fields`.
 *
 * `ra` and `dec` are the catalogue's own units — right ascension in **hours**
 * — exactly as `coordinate` carries them in the full view, so one client-side
 * conversion (`cataloguePlannerCoordinate`) serves both views.
 *
 * `type` and `constellation` are indices into the envelope's `types` and
 * `constellations` dictionaries rather than repeated labels, because a
 * catalogue of several hundred targets draws on a few dozen of each. The
 * dictionaries carry both the key and its localized label: the key is what
 * the planner's rules match on, the label is what the cards print, and the
 * mobile client localizes neither on its own.
 *
 * `focalMinMm`, `focalMaxMm` and `apertureMinMm` are the three numbers of
 * the observing guide the equipment restriction reads
 * (`targetMatchesEquipmentGuide`); the guide's prose and its provenance
 * fields belong to the target's own knowledge document.
 *
 * `distanceLy` (light-years, a whole number) and `distanceSource`
 * (`published` | `parallax` | `redshift`) are the target's distance when one
 * is known and both null otherwise. The `redshift` layer is a model, not a
 * measurement: every screen that shows it writes « estimation ». The
 * reference of a `published` value belongs to the full view's `distance`.
 */
export const targetIndexFields = [
  "id",
  "designation",
  "name",
  "title",
  "aliases",
  "catalogue",
  "catalogues",
  "ra",
  "dec",
  "sizeArcmin",
  "magnitude",
  "type",
  "constellation",
  "best",
  "extended",
  "premium",
  "sizeLabel",
  "photoUrl",
  "visualUrl",
  "visualPreviewUrl",
  "focalMinMm",
  "focalMaxMm",
  "apertureMinMm",
  "distanceLy",
  "distanceSource",
  "planVisualOnly",
  "planExcluded",
  "modes",
];

/** The supplements `include` can add to a page. */
export const targetIndexIncludes = ["extended"];

/** Rows built between two hand-backs of the event loop. */
const targetIndexRowsPerSlice = 200;

/**
 * Rounds to [places] decimals and drops a non-finite value to null. The
 * precisions are the ones the values are useful at, not the ones the source
 * happens to carry: 1e-4° of declination is 0.36 arcsecond, well under any
 * catalogue's own accuracy, and a tenth of a magnitude or of an arcminute is
 * past what a label prints.
 */
/**
 * A short, opaque identifier for the loaded catalogue. `library.modifiedMs`
 * is already the revision every cache in this module keys on, but it carries
 * filesystem timestamps and a database revision, which are the portal's own
 * business; a digest of it says "same catalogue" or "different catalogue"
 * and nothing else.
 */
export function catalogueRevision(library) {
  return createHash("sha256")
    .update(String(library.modifiedMs))
    .update(skyTextRevision())
    .digest("base64url")
    .slice(0, 16);
}

let skyTextDigest = null;

/** Forgets the digest of the short texts (a test seam). */
export function forgetSkyTextRevision() {
  skyTextDigest = null;
}

/**
 * A digest of the short texts of the bright stars and the constellations
 * (`astro-core`'s generated table). They ride in the offline pack's knowledge
 * file and are part of the catalogue a phone compares by revision: a text
 * rewritten, or written in one more language, moves the revision so that the
 * phones download the pack again, though no catalogue source moved.
 */
export function skyTextRevision() {
  skyTextDigest ??= createHash("sha256")
    .update(JSON.stringify(skyTextTable))
    .digest("base64url")
    .slice(0, 16);
  return skyTextDigest;
}

function rounded(value, places) {
  const numeric = optionalNumber(value);
  if (numeric === null) return null;
  const factor = 10 ** places;
  return Math.round(numeric * factor) / factor;
}

function targetIndexRow(target, presented, typeIndex, constellationIndex) {
  const designation = presented.designation;
  const guide = presented.observingGuide || null;
  const sizes = Array.isArray(target.apparentSizeArcmin)
    ? target.apparentSizeArcmin
        .map((value) => rounded(value, 1))
        .filter((value) => value !== null)
    : [];
  return [
    target.id,
    designation,
    // `name` is the localized common name; it is null far more often than
    // not, and `title` is what a row prints, so both travel rather than one
    // being rebuilt from the other under a rule the client would have to
    // keep in step with the portal's.
    presented.name || null,
    presented.title,
    // The designation is already column 1; repeating it inside the alias
    // list — which `objects` is built from — would repeat it on every row.
    (target.aliases || []).filter((alias) => alias !== designation),
    target.catalogue || null,
    target.catalogues || [],
    rounded(target.coordinate?.ra, 4),
    rounded(target.coordinate?.dec, 4),
    sizes.length ? sizes : null,
    // A bright star's magnitude keeps its hundredths: Vega (0.03) and
    // Capella (0.08) are two different ranks.
    rounded(target.magnitude, target.typeKey === brightStarType ? 2 : 1),
    target.typeKey ? (typeIndex.get(target.typeKey) ?? null) : null,
    target.constellationKey
      ? (constellationIndex.get(target.constellationKey) ?? null)
      : null,
    target.isBest ? 1 : 0,
    target.isExtended ? 1 : 0,
    // `plannerCandidateScore`'s last term. It is not a presentation flag: it
    // is here so a client holding the whole index can reproduce the portal's
    // own ranking offline, for an observing place it has never asked about.
    target.premiumImage ? 1 : 0,
    presented.apparentSizeLabel || null,
    presented.photoThumbnailUrl,
    presented.visualThumbnailUrl,
    presented.visualPreviewThumbnailUrl,
    guide ? (rounded(guide.focalLengthMinimumMm, 0) ?? null) : null,
    guide ? (rounded(guide.focalLengthMaximumMm, 0) ?? null) : null,
    guide ? (rounded(guide.visualMinimumApertureMm, 0) ?? null) : null,
    presented.distance?.lightYears ?? null,
    presented.distance?.source ?? null,
    presented.planVisualOnly ? 1 : 0,
    presented.planExcluded ? 1 : 0,
    // The modes of a target of a selection (1 visual, 2 photo, 3 both; a
    // target of a selection without any: 3), 0 for any other target.
    selectionModeBitsOf(effectiveSelectionModes(target)),
  ];
}

export async function targetIndexSearch({
  locale = "en",
  offset = 0,
  limit = 96,
  include = "",
  ...filters
} = {}) {
  const { snapshot, matching, safeSort, safeMode, safeOffset, safeLimit } =
    await libraryQueryPlan({
      ...filters,
      locale,
      offset,
      limit,
      maximumLimit: targetIndexMaximumPageSize,
    });
  const [taxonomy, commonNames] = await Promise.all([
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("target-common-names"),
  ]);
  const references = {
    taxonomy: taxonomy?.payload,
    commonNameLabels: commonNames?.payload?.labels,
  };
  const page = matching.slice(safeOffset, safeOffset + safeLimit);
  // The web planner's pool is not a page: it is the highest-ranking
  // `plannerCandidateMaximum` targets *plus* every target of the two
  // editorial selections (in `mode`, when one is asked), so that the
  // planner's « Étendues » is complete rather than truncated at the page
  // boundary (`plannerTargetCandidates`). `include=extended` is how a client
  // asks for that same set in one request instead of merging two. The
  // supplement is drawn from the already-filtered, already-ranked set, so it
  // never widens what the query selected — only what the page cut off.
  const onPage = new Set(page);
  const supplement =
    include === "extended"
      ? matching.filter(
          (target) =>
            targetInSelectionPool(target, "extended", safeMode) &&
            !onPage.has(target),
        )
      : [];
  // A row prints no text of the target's page: the entries are read lean.
  const projected = await wholeEntries(snapshot, [...page, ...supplement], {
    lean: true,
  });
  const typeIndex = new Map();
  const constellationIndex = new Map();
  const types = [];
  const constellations = [];
  for (const target of projected) {
    if (target.typeKey && !typeIndex.has(target.typeKey)) {
      typeIndex.set(target.typeKey, types.length);
      types.push([
        target.typeKey,
        taxonomyLabel(target.typeKey, locale, references.taxonomy),
      ]);
    }
    if (
      target.constellationKey &&
      !constellationIndex.has(target.constellationKey)
    ) {
      constellationIndex.set(target.constellationKey, constellations.length);
      constellations.push([
        target.constellationKey,
        taxonomyLabel(target.constellationKey, locale, references.taxonomy),
      ]);
    }
  }
  // Built in slices, handing the event loop back in between: a 1000-row
  // page as one synchronous block could outlast a platform's health probe.
  const rows = [];
  for (let index = 0; index < projected.length; index += 1) {
    if (index > 0 && index % targetIndexRowsPerSlice === 0)
      await yieldToEventLoop();
    const target = projected[index];
    rows.push(
      targetIndexRow(
        target,
        presentedEntry(target, locale, snapshot, references),
        typeIndex,
        constellationIndex,
      ),
    );
  }
  const credits = catalogueCredits(snapshot);
  return {
    v: targetIndexNotation,
    // Which catalogue these rows came from. A reader walking the whole index
    // page by page — the offline pack's eventual job — compares it between
    // pages: an import landing mid-walk changes it, and `total` and the
    // designation order with it, so the pages must not be stitched together.
    revision: catalogueRevision(snapshot),
    total: matching.length,
    offset: safeOffset,
    limit: safeLimit,
    sort: safeSort,
    ...(include === "extended" ? { include } : {}),
    types,
    constellations,
    fields: targetIndexFields,
    rows,
    // The per-target image credits are gone from the rows; the catalogue's
    // and the image sets' own attributions are not optional and stay.
    ...credits,
  };
}

/**
 * The serialized index, memoized, with the strong `ETag` that identifies it.
 *
 * A compact index is a pure function of the loaded catalogue revision and the
 * request's own parameters, and the mobile planner asks for the same few
 * parameter sets over and over — one per editorial tier, for one rounded
 * latitude. Building 720 rows and serializing them each time is the portal's
 * largest avoidable cost on this route, so the serialized text is kept and
 * the `ETag` is its digest: a client that revalidates gets a `304` and
 * decodes nothing at all.
 *
 * `modifiedMs` is the whole catalogue's revision, so re-importing or
 * re-synchronizing the library retires every entry at once. A favorites-
 * restricted index belongs to one device and is deliberately never memoized.
 * At most `targetIndexCacheLimit` pages are kept (a 1000-row page is about
 * 0.3 MB of text).
 */
const targetIndexCacheLimit = 24;
const targetIndexCache = new Map();

export async function targetIndexDocument(options = {}) {
  const memoizable = !options.targetIds;
  const snapshot = await loadedCatalogue();
  const key = memoizable
    ? JSON.stringify([snapshot.modifiedMs, options])
    : null;
  if (key !== null && targetIndexCache.has(key)) {
    const hit = targetIndexCache.get(key);
    // Least-recently-used: re-inserting moves it to the end of the Map's
    // insertion order, which is what the eviction below reads.
    targetIndexCache.delete(key);
    targetIndexCache.set(key, hit);
    return hit;
  }
  const json = JSON.stringify(await targetIndexSearch(options));
  const document = {
    json,
    etag: `"${createHash("sha256").update(json).digest("base64url").slice(0, 27)}"`,
  };
  if (key !== null) {
    targetIndexCache.set(key, document);
    while (targetIndexCache.size > targetIndexCacheLimit)
      targetIndexCache.delete(targetIndexCache.keys().next().value);
  }
  return document;
}

const plannerCandidateMaximum = 720;

function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

// Exported so that a caller can use the exact same function this module uses
// internally, rather than a reimplementation of the formula below.
export function plannerCandidateScore(target, latitude, minimumAltitude) {
  // The suggestions and the planner's ranking leave out the bright stars (added
  // by hand, in visual mode) and the constellations (never in a plan).
  const { planVisualOnly, planExcluded } = planUseOfType(target.typeKey);
  if (planVisualOnly || planExcluded) return null;
  const declination = optionalNumber(target.coordinate?.dec);
  if (!Number.isFinite(declination)) return null;
  const culmination = Number.isFinite(latitude)
    ? 90 - Math.abs(latitude - declination)
    : null;
  if (Number.isFinite(culmination) && culmination < minimumAltitude)
    return null;
  const typeWeight =
    {
      "Nébuleuse en émission": 30,
      "Nébuleuse en réflexion": 28,
      "Nébuleuse planétaire": 26,
      "Rémanent de supernova": 26,
      "Nébuleuse sombre": 24,
      Galaxie: 22,
      "Amas globulaire": 20,
      "Amas ouvert": 18,
    }[target.typeKey] || 8;
  const magnitude = optionalNumber(target.magnitude);
  const brightness = Number.isFinite(magnitude)
    ? Math.max(-16, Math.min(20, 20 - magnitude * 1.75))
    : 0;
  const apparentSize = Math.max(
    ...(Array.isArray(target.apparentSizeArcmin)
      ? [
          ...target.apparentSizeArcmin
            .map(optionalNumber)
            .filter(Number.isFinite),
          0,
        ]
      : [0]),
  );
  const size =
    apparentSize > 0 ? Math.min(18, Math.log10(apparentSize + 1) * 9) : 0;
  return (
    typeWeight +
    brightness +
    size +
    (target.isBest ? 60 : target.isExtended ? 28 : 0) +
    (target.premiumImage ? 8 : 0) +
    (Number.isFinite(culmination)
      ? Math.max(0, culmination - minimumAltitude) * 0.35
      : 0)
  );
}

function plannerCandidatePresentation(target, presented) {
  const knowledge = {
    id: presented.id,
    designation: presented.designation,
    title: presented.title,
    type: presented.type,
    constellation: presented.constellation,
    apparentSizeLabel: presented.apparentSizeLabel,
    magnitude: presented.magnitude,
    distanceLy: presented.distance?.lightYears ?? null,
    distanceSource: presented.distance?.source ?? null,
    photoThumbnailUrl: presented.photoThumbnailUrl,
    visualThumbnailUrl: presented.visualThumbnailUrl,
    visualPreviewThumbnailUrl: presented.visualPreviewThumbnailUrl,
    photoImageCredit: presented.photoImageCredit,
    photoImageSourceUrl: presented.photoImageSourceUrl,
    visualImageCredit: presented.visualImageCredit,
    visualImageSourceUrl: presented.visualImageSourceUrl,
    visualPreviewImageCredit: presented.visualPreviewImageCredit,
    visualPreviewImageSourceUrl: presented.visualPreviewImageSourceUrl,
    observingGuide: presented.observingGuide,
  };
  return {
    id: target.id,
    source: target.designation,
    designation: target.designation,
    name: presented.name,
    title: presented.title,
    objects: [...new Set([target.designation, ...(target.aliases || [])])],
    catalogue: target.catalogue,
    coordinate: cataloguePlannerCoordinate(target.coordinate),
    catalogues: target.catalogues,
    coordinateUnit: "degrees",
    coordinateOrigin: "catalogue-hours",
    apparentSizeArcmin: target.apparentSizeArcmin,
    integratedMagnitude: target.magnitude,
    distanceLy: presented.distance?.lightYears ?? null,
    distanceSource: presented.distance?.source ?? null,
    skyTarget: {
      typeKey: target.typeKey,
      constellationKey: target.constellationKey,
      type: presented.type,
      constellation: presented.constellation,
    },
    tags: (target.catalogues || []).map((catalogue) =>
      String(catalogue).toLowerCase(),
    ),
    isBest: Boolean(target.isBest),
    isExtended: Boolean(target.isExtended),
    modes: effectiveSelectionModes(target),
    knowledge,
  };
}

/**
 * Provides a bounded, astronomy-ready projection of the whole local target
 * library. Every entry participates in the ranking; the browser receives a
 * bounded high-ranking set plus every extended editorial target visible at the
 * requested latitude. This keeps the planner responsive without making the
 * Essentielles/Étendues selection incomplete. The ranking reads the compact
 * rows of the targets the observer can see (a band of declinations); only
 * the targets sent are read whole.
 */
export function plannerTargetCandidates(options = {}) {
  return rememberedAnswer("planner", options, () =>
    rankedPlannerCandidates(options),
  );
}

async function rankedPlannerCandidates({
  locale = "en",
  latitude = null,
  minimumAltitude = 30,
  selection = "",
  mode = "",
  limit = plannerCandidateMaximum,
  catalogues = "",
} = {}) {
  const snapshot = await loadedCatalogue();
  // SUGGEST-FILTERS-01: the catalogues ticked in the suggestions' filters
  // (`Messier,NGC`): their targets only, ranked like every pool, before the
  // cut — a whole catalogue, not what the top of the ranking holds of it.
  const wantedCatalogues = new Set(
    String(catalogues || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const [taxonomy, commonNames] = await Promise.all([
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("target-common-names"),
  ]);
  const observerLatitude = optionalNumber(latitude);
  const minimum = Math.max(
    0,
    Math.min(89, optionalNumber(minimumAltitude) ?? 30),
  );
  const maximum = Math.max(
    1,
    Math.min(
      plannerCandidateMaximum,
      Math.floor(optionalNumber(limit) ?? plannerCandidateMaximum),
    ),
  );
  const safeSelection = ["best", "extended"].includes(selection)
    ? selection
    : "";
  // TARGET-SELECTIONS-TAGS-01: the planner's `extended` is the two
  // selections together (they are disjoint), and a selection keeps the
  // targets of the profile's `mode`; a catalogue ticked, or no selection,
  // is not filtered by the mode.
  const safeMode = selectionMode(mode);
  const reach = 90 - minimum + 1e-6;
  const pool = await snapshot.store.poolRows({
    declination: {
      minimum: observerLatitude === null ? -90 : observerLatitude - reach,
      maximum: observerLatitude === null ? 90 : observerLatitude + reach,
      orSolarSystem: false,
    },
    ...(safeSelection
      ? { selection: safeSelection === "best" ? "best" : "either" }
      : {}),
  });
  const ranked = pool
    .map((target) => ({
      target,
      score: plannerCandidateScore(target, observerLatitude, minimum),
    }))
    .filter(
      (entry) =>
        entry.score !== null &&
        targetInSelectionPool(entry.target, safeSelection, safeMode) &&
        (!wantedCatalogues.size ||
          [entry.target.catalogue, ...(entry.target.catalogues || [])].some(
            (name) => wantedCatalogues.has(name),
          )),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        designationCompare(left.target, right.target),
    );
  const references = {
    taxonomy: taxonomy?.payload,
    commonNameLabels: commonNames?.payload?.labels,
  };
  const projected = new Map(
    [
      ...ranked.slice(0, maximum),
      ...ranked.filter(({ target }) =>
        targetInSelectionPool(target, "extended", safeMode),
      ),
    ].map((entry) => [entry.target.id, entry]),
  );
  const entries = await wholeEntries(
    snapshot,
    [...projected.values()].map(({ target }) => target),
    { lean: true },
  );
  return {
    total: ranked.length,
    limit: maximum,
    targets: entries.map((target) =>
      plannerCandidatePresentation(
        target,
        presentedEntry(target, locale, snapshot, references),
      ),
    ),
  };
}

// The spoken texts of one target, added to its knowledge beside the written
// story: `spokenParagraphs` for the read-aloud voice and
// `childrenSpokenParagraphs` for the children's version. Both optional: a
// locale without spoken templates, or a written text shown in another
// language (`storyFallbackLocale`), carries no `spokenParagraphs`, and the
// reader speaks the written text through its pronunciation lexicon.
//
// `childrenSpokenParagraphs` is the children's text written from the target's
// published page (`childrenParagraphs` of its language), in every language
// that has one, and nothing else: the three-sentence template this field
// once carried is no longer served, so a target without a written children's
// version answers none and the apps say so.
export function withSpokenText(presented, target, locale) {
  if (!presented || presented.storyFallbackLocale) return presented;
  const research = target?.editorial?.catalogueResearch;
  const written = isPublishedPagesResearch(research)
    ? (research.content?.[locale]?.childrenParagraphs || []).filter(
        (paragraph) => typeof paragraph === "string" && paragraph.length > 0,
      )
    : [];
  const adult = spokenParagraphs(target, locale, {
    name: presented.name,
    englishName: localizedName(target, "en"),
  });
  if (!adult.length && !written.length) return presented;
  return {
    ...presented,
    ...(adult.length ? { spokenParagraphs: adult } : {}),
    ...(written.length ? { childrenSpokenParagraphs: written } : {}),
  };
}

/**
 * What the memoized bundles may hold, in characters of JSON: 48 Mi by
 * default (`ASTRO_PORTAL_KNOWLEDGE_CACHE_BYTES` sets another). A full bundle
 * is tens of megabytes, so a count bound alone would let several languages
 * asked for by a client downloading its pack fill a capped V8 heap. The most
 * recently used bundles stay, at least one, and the oldest are dropped when
 * the total is over the bound.
 */
const targetKnowledgeBundleCacheDefaultBytes = 48 * 1024 * 1024;
const targetKnowledgeBundleCache = new Map();
// One bundle is built at a time: the builds hand the event loop back as they
// go, and several languages asked for together would otherwise all hold
// their half-built bundle in memory at once.
let targetKnowledgeBundleBuilds = Promise.resolve();

function targetKnowledgeBundleCacheBound() {
  const configured = Number(process.env.ASTRO_PORTAL_KNOWLEDGE_CACHE_BYTES);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : targetKnowledgeBundleCacheDefaultBytes;
}

/** What the memoized bundles hold now (test seam, and a diagnostic). */
export function targetKnowledgeBundleCacheStatistics() {
  let characters = 0;
  for (const document of targetKnowledgeBundleCache.values())
    characters += document.json.length;
  return {
    bundles: targetKnowledgeBundleCache.size,
    characters,
    bound: targetKnowledgeBundleCacheBound(),
  };
}

function rememberKnowledgeBundle(key, document) {
  targetKnowledgeBundleCache.delete(key);
  targetKnowledgeBundleCache.set(key, document);
  const bound = targetKnowledgeBundleCacheBound();
  let characters = 0;
  for (const held of targetKnowledgeBundleCache.values())
    characters += held.json.length;
  for (const oldest of targetKnowledgeBundleCache.keys()) {
    if (characters <= bound || targetKnowledgeBundleCache.size <= 1) break;
    characters -= targetKnowledgeBundleCache.get(oldest).json.length;
    targetKnowledgeBundleCache.delete(oldest);
  }
}

/**
 * The targets that may have pages in the pack, in the catalogue's designation
 * order: those with a stored text of tier A or B in [locale] (`target_texts`)
 * and those whose stored editorial carries published pages (an older
 * package, whose tier A pages are in the seed). A few hundred.
 */
async function packCandidateIds(store, stored) {
  const pages = await store.publishedPagesIds();
  const ranks = await store.designationRanks([...stored.keys(), ...pages]);
  return [...ranks.keys()].sort(
    (left, right) => ranks.get(left) - ranks.get(right),
  );
}

async function buildTargetKnowledgeBundle(snapshot, locale) {
  const [taxonomy, commonNames] = await Promise.all([
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("target-common-names"),
  ]);
  const references = {
    taxonomy: taxonomy?.payload,
    commonNameLabels: commonNames?.payload?.labels,
  };
  const targets = {};
  let count = 0;
  // The stored texts the pack carries: tiers A and B; `packTexts` never
  // returns tier C, which stays online only.
  const stored = await snapshot.store.packTexts(locale);
  const ids = await packCandidateIds(snapshot.store, stored);
  for (let start = 0; start < ids.length; start += libraryEntriesPerSlice) {
    await yieldToEventLoop();
    for (const target of await snapshot.store.entriesByIds(
      ids.slice(start, start + libraryEntriesPerSlice),
    )) {
      const entry = stored.get(target.id);
      const packed = entry
        ? withStoredEntry(target, locale, new Map([[locale, entry]]))
        : target;
      // The pack's pages: tiers A and B; tier C stays online only.
      if (!isOfflinePackPagesResearch(packed.editorial?.catalogueResearch))
        continue;
      targets[target.id] = withSpokenText(
        presentedEntry(packed, locale, snapshot, references, target),
        packed,
        locale,
      );
      count += 1;
    }
  }
  // The bright stars and the constellations: their short text is their page.
  const sky = skyKnowledgeBundleEntries(locale);
  Object.assign(targets, sky);
  count += Object.keys(sky).length;
  const json = JSON.stringify({ v: 1, locale, count, targets });
  return {
    json,
    count,
    etag: `"${createHash("sha256").update(json).digest("base64url").slice(0, 27)}"`,
  };
}

/**
 * The published pages' knowledge of every target that has them, in [locale],
 * for the offline pack: `{ v, locale, count, targets: { [id]: knowledge } }`,
 * each knowledge exactly what `GET /v1/targets/{targetId}` answers for that
 * target, so that the phone reads the pack's file as it reads the route.
 * Serialized, memoized per catalogue revision and locale, with its strong
 * `ETag`, like `targetIndexDocument`. `count` is 0 when no target has a
 * page, which the manifest does not announce.
 */
export async function targetKnowledgeBundleDocument(locale = "en") {
  const snapshot = await loadedCatalogue();
  // The stored texts (tiers A and B, `target_texts`) are part of the pack:
  // the bundle is rebuilt when their import moves.
  const stamp = await snapshot.store.textsStamp();
  const key = JSON.stringify([
    snapshot.modifiedMs,
    locale,
    stamp,
    skyTextRevision(),
  ]);
  const held = targetKnowledgeBundleCache.get(key);
  if (held) {
    // Most recently used last.
    rememberKnowledgeBundle(key, held);
    return held;
  }
  const build = targetKnowledgeBundleBuilds.then(async () => {
    // Another request may have built it while this one waited its turn.
    const built = targetKnowledgeBundleCache.get(key);
    if (built) return built;
    const document = await buildTargetKnowledgeBundle(snapshot, locale);
    rememberKnowledgeBundle(key, document);
    return document;
  });
  targetKnowledgeBundleBuilds = build.catch(() => {});
  return build;
}

/**
 * The target as a published page presents it, from its stored entry
 * (`target_texts`, `target-text-shards.js`) in `locale`:
 *
 * - a target whose catalogue entry carries published pages (tier A) keeps
 *   them, and takes the entry's children's text, when it has one, as the
 *   children's text of its page;
 * - any other target (tiers B and C, which the seed does not carry) takes the
 *   entry's page as a published pages record the presentation reads like a
 *   seeded one, in the language the entry is in. `entries` are the target's
 *   entries by language: that of `locale`, else (`localeChoice`, as for every
 *   published page) the language that stands in for it, said by
 *   `storyFallbackLocale`.
 *
 * The shard stores the sections, the sources and the note; `story` and
 * `storyParagraphs` are derived from the sections (`targetPageStory`), so the
 * record is rebuilt from the shard alone, never from a second source.
 */
function withStoredEntry(target, locale, entries) {
  const published = target.editorial?.catalogueResearch;
  if (isPublishedPagesResearch(published)) {
    const children = entries.get(locale)?.entry?.children?.paragraphs;
    const content = published.content?.[locale];
    if (!children?.length || !content) return target;
    return {
      ...target,
      editorial: {
        ...target.editorial,
        catalogueResearch: {
          ...published,
          content: {
            ...published.content,
            [locale]: { ...content, childrenParagraphs: children },
          },
        },
      },
    };
  }
  const withPage = [...entries].filter(([, stored]) => stored.entry?.page);
  const choice = localeChoice(
    withPage.map(([tag]) => tag),
    locale,
  );
  const stored = choice.locale ? entries.get(choice.locale) : null;
  if (!stored) return target;
  const { page, children } = stored.entry;
  return {
    ...target,
    editorial: {
      ...target.editorial,
      catalogueResearch: {
        schemaVersion: 1,
        profileVersion: publishedPagesProfileVersion,
        pagesRevision: stored.revision,
        sourceLocale: choice.locale,
        tier: stored.tier,
        content: {
          [choice.locale]: {
            paragraphs: targetPageStory(page.storySections).storyParagraphs,
            sections: page.storySections,
            sources: page.researchSources,
            note: page.researchNote || "",
            ...(children?.paragraphs?.length
              ? { childrenParagraphs: children.paragraphs }
              : {}),
          },
        },
        sources: page.researchSources,
      },
    },
  };
}

/** The stored entries of one target the presentation needs for `locale`: the
 * one of `locale` when the target has pages of its own in its editorial (a
 * package that kept tier A in the seed), else the one of the language that
 * stands in for `locale` among those it has text in (every tier, since tier A
 * moved to the shards). Never the whole table: a primary-key lookup per
 * language that is read. */
async function storedEntriesOf(store, target, locale) {
  const entries = new Map();
  const seeded = isPublishedPagesResearch(target.editorial?.catalogueResearch);
  const available = await store.textLocales(target.id);
  const wanted = seeded
    ? [locale]
    : [
        localeChoice(
          available.map((row) => row.locale),
          locale,
        ).locale,
      ];
  const read = async (tag) => {
    if (!tag || entries.has(tag)) return;
    if (!available.some((row) => row.locale === tag)) return;
    const stored = await store.text(target.id, tag);
    if (stored?.entry) entries.set(tag, stored);
  };
  for (const tag of wanted) await read(tag);
  if (seeded || [...entries.values()].some((stored) => stored.entry?.page))
    return entries;
  // The language chosen holds no page — a children's text alone, written
  // when tier A kept its pages in the seed: the languages that hold one, for
  // `withStoredEntry` to choose among.
  for (const row of available) await read(row.locale);
  return entries;
}

/**
 * The most items a constellation's two lists hold; the default is a dozen.
 */
export const constellationListMaximum = 24;

/** A target as a line of one of a constellation's lists. */
function skyListItem(presented) {
  return {
    id: presented.id,
    designation: presented.designation,
    title: presented.title,
    name: presented.name || null,
    type: presented.type,
    typeKey: presented.typeKey,
    catalogue: presented.catalogue,
    constellationKey: presented.constellationKey,
    magnitude: presented.magnitude ?? null,
    coordinate: presented.coordinate ?? null,
    isBest: presented.isBest,
    isExtended: presented.isExtended,
    ...(presented.stellar ? { bayer: presented.stellar.bayer } : {}),
  };
}

const magnitudeOrder = (left, right) =>
  (left.magnitude ?? Infinity) - (right.magnitude ?? Infinity);

/**
 * The two lists of a constellation's page, read by the constellation key:
 * its bright stars (every star of the catalogue the IAU boundaries place in
 * it, the brightest first) and its targets (the catalogue's objects in it,
 * the editorial selection first, then by brightness), each as
 * `{ total, items }` with at most [limit] items.
 */
async function constellationLists(
  snapshot,
  key,
  locale,
  references,
  limit = 12,
) {
  const pool = (
    await snapshot.store.poolRows({ constellationKey: key })
  ).filter((target) => target.constellationKey === key);
  const stars = pool
    .filter((target) => target.typeKey === brightStarType)
    .sort(
      (left, right) =>
        magnitudeOrder(left, right) || stableTargetOrder(left, right),
    );
  const targets = pool
    .filter(
      (target) =>
        target.typeKey !== brightStarType &&
        target.typeKey !== constellationType &&
        target.catalogue !== "Système solaire",
    )
    .sort(
      (left, right) =>
        Number(right.isBest) - Number(left.isBest) ||
        Number(right.isExtended) - Number(left.isExtended) ||
        magnitudeOrder(left, right) ||
        stableTargetOrder(left, right),
    );
  const list = async (members) => ({
    total: members.length,
    items: (
      await wholeEntries(snapshot, members.slice(0, limit), { lean: true })
    ).map((entry) =>
      skyListItem(presentedEntry(entry, locale, snapshot, references)),
    ),
  });
  return { brightStars: await list(stars), targets: await list(targets) };
}

/**
 * A bright star and a constellation carry their short text (`description`) in
 * the asked language, else in English (`null` when neither is written), and
 * it is also their knowledge text, in the place and the shape of a published
 * page of any other target: `story`, `storyParagraphs`, and `storySections`
 * (one opening, no intertitle), so that every reader of the knowledge text
 * shows it, keeps it for offline use and reads it aloud like the others;
 * `storyFallbackLocale` says it is shown in English when it is. The
 * generated profile of a deep-sky object (`story`, `spokenParagraphs`) says
 * nothing true of a star, and gives way to it.
 */
export function withSkyText(presented, locale) {
  const textKey = skyTextKeyOf(presented);
  if (!textKey) return presented;
  const fields = skyKnowledgeFields(textKey, locale);
  if (!fields) return { ...presented, description: null };
  const {
    spokenParagraphs: ignoredSpoken,
    storyFallbackLocale: ignoredFallback,
    ...rest
  } = presented;
  return { ...rest, ...fields };
}

/**
 * The knowledge fields of a bright star or a constellation's short text in
 * `locale` (see `withSkyText`), `null` when no language has it.
 */
function skyKnowledgeFields(textKey, locale) {
  const choice = skyTextChoice(textKey, locale);
  if (!choice) return null;
  return {
    description: choice.text,
    story: choice.text,
    storyParagraphs: [choice.text],
    storySections: [{ heading: null, paragraphs: [choice.text] }],
    ...(choice.fallback ? { storyFallbackLocale: choice.locale } : {}),
  };
}

/**
 * The entries of the 92 bright stars and the 88 constellations in the offline
 * pack's knowledge file (`buildTargetKnowledgeBundle`) for `locale`: what the
 * phone stores of them, the page of one opening (`storySections`, no source)
 * and the `description`, not the whole sheet — `story` and `storyParagraphs`
 * repeat the section and the phone derives them.
 */
function skyKnowledgeBundleEntries(locale) {
  const entries = {};
  for (const target of [
    ...brightStarCatalogueTargets,
    ...constellationCatalogueTargets,
  ]) {
    const fields = skyKnowledgeFields(skyTextKeyOf(target), locale);
    if (!fields) continue;
    entries[target.id] = {
      id: target.id,
      description: fields.description,
      storySections: fields.storySections,
      researchSources: [],
      ...(fields.storyFallbackLocale
        ? { storyFallbackLocale: fields.storyFallbackLocale }
        : {}),
    };
  }
  return entries;
}

export async function targetKnowledgeFor(
  target,
  locale = "en",
  { listLimit = 12 } = {},
) {
  const snapshot = await loadedCatalogue();
  const [taxonomy, commonNames] = await Promise.all([
    staticDataDocument("reference-taxonomy"),
    staticDataDocument("target-common-names"),
  ]);
  const references = {
    taxonomy: taxonomy?.payload,
    commonNameLabels: commonNames?.payload?.labels,
  };
  for (const key of targetLookupKeys(target)) {
    const found = await snapshot.store.firstByLookupKey(key);
    if (found) {
      const matched = withStoredEntry(
        found,
        locale,
        await storedEntriesOf(snapshot.store, found, locale),
      );
      const spoken = withSpokenText(
        presentedEntry(matched, locale, snapshot, references, found),
        matched,
        locale,
      );
      const presented = withSkyText(spoken, locale);
      return presented.typeKey === constellationType &&
        presented.constellationInfo
        ? {
            ...presented,
            constellationInfo: {
              ...presented.constellationInfo,
              ...(await constellationLists(
                snapshot,
                presented.constellationKey,
                locale,
                references,
                Math.max(1, Math.min(constellationListMaximum, listLimit)),
              )),
            },
          }
        : presented;
    }
  }
  const fallback = currentCuratedTarget(target);
  const fallbackEntry = fallbackTargets().find((entry) =>
    targetLookupKeys(entry).some((key) =>
      targetLookupKeys(fallback).includes(key),
    ),
  );
  return fallbackEntry
    ? withSpokenText(
        presentedEntry(fallbackEntry, locale, snapshot, references),
        fallbackEntry,
        locale,
      )
    : null;
}

async function administrationRepository() {
  const repository = await targetCatalogueRepository();
  if (!repository)
    throw new Error(
      "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required for target catalogue administration.",
    );
  return repository;
}

async function administrationPresentation(entry, locale) {
  const visualImage = (await visualReferenceFileExists(
    entry.visualImage,
    targetLibraryVisualImagesDir,
  ))
    ? { [entry.id]: entry.visualImage }
    : {};
  const presented = presentation(
    entry,
    locale,
    entry.dssImage ? { [entry.id]: entry.dssImage } : {},
    entry.premiumImage ? { [entry.id]: entry.premiumImage } : {},
    visualImage,
    entry.visualPreviewImage ? { [entry.id]: entry.visualPreviewImage } : {},
  );
  return {
    ...presented,
    dssImage: entry.dssImage,
    premiumImage: entry.premiumImage,
    visualImage: entry.visualImage,
    visualPreviewImage: entry.visualPreviewImage,
    editorial: entry.editorial,
    source: entry.source,
    sourceRevision: entry.sourceRevision,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function targetLibraryAdministrationSearch({
  locale = "fr",
  query = "",
  type = "",
  catalogue = "",
  selection = "",
  hemisphere = "",
  season = "",
  offset = 0,
  limit = 48,
} = {}) {
  // Reuse the public catalogue matcher so editorial, catalogue, type,
  // hemisphere, and season filters cannot drift apart in administration.
  const result = await targetLibrarySearch({
    locale,
    query,
    type,
    catalogue,
    selection,
    hemisphere,
    season,
    offset,
    limit,
  });
  const repository = await administrationRepository();
  return {
    ...result,
    entries: await Promise.all(
      result.targets.map(async (target) =>
        administrationPresentation(await repository.get(target.id), locale),
      ),
    ),
  };
}

export async function targetLibraryAdministrationEntry(id, locale = "fr") {
  await loadedCatalogue();
  const entry = await (await administrationRepository()).get(id);
  return entry ? await administrationPresentation(entry, locale) : null;
}

export async function saveTargetLibraryAdministrationEntry(
  entry,
  locale = "fr",
) {
  await loadedCatalogue();
  const saved = await (await administrationRepository()).save(entry);
  forgetLoadedCatalogue();
  return administrationPresentation(saved, locale);
}
