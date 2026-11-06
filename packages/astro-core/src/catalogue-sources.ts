// The credit line of each nebula catalogue: source, author, year and reference,
// shown where the app credits its catalogue data. No explicit licence is
// published for these versions: the project accepted that for catalogues that
// stay free, and the line says so plainly instead of naming a licence nobody
// granted.

/** One catalogue's provenance, as the credit line writes it. */
export type CatalogueSource = {
  author: string;
  title: string;
  /** Years in which the positions and designations used were published. */
  years: readonly number[];
  publication: string;
  reference: string;
};

export const catalogueSources: Readonly<Record<string, CatalogueSource>> = {
  Sharpless: {
    author: "S. Sharpless",
    title: "Catalogue of H II Regions",
    years: [1959],
    publication: "ApJS 4, 257",
    reference: "CDS/VizieR VII/20",
  },
  LDN: {
    author: "B. T. Lynds",
    title: "Catalogue of Dark Nebulae",
    years: [1962],
    publication: "ApJS 7, 1",
    reference: "CDS/VizieR VII/7A",
  },
  LBN: {
    author: "B. T. Lynds",
    title: "Catalogue of Bright Nebulae",
    years: [1965],
    publication: "ApJS 12, 163",
    reference: "CDS/VizieR VII/9",
  },
  Abell: {
    author: "G. O. Abell",
    title: "Properties of Some Old Planetary Nebulae",
    years: [1966, 1992, 2003],
    publication:
      "ApJ 144, 259; Acker et al. 1992, Strasbourg-ESO Catalogue; Kerber et al. 2003, A&A 408, 1029",
    reference: "CDS/VizieR V/84, J/A+A/408/1029",
  },
};

// « no explicit licence is published for this version; positions and
// designations published in {years} », in the ten languages of the app.
const noLicence: Readonly<Record<string, string>> = {
  fr: "aucune licence explicite n’est publiée pour cette version ; positions et désignations publiées en {years}",
  en: "no explicit licence is published for this version; positions and designations published in {years}",
  ja: "この版には明示的なライセンスが公開されていません。位置と名称は{years}年に公表されたものです",
  de: "für diese Version ist keine ausdrückliche Lizenz veröffentlicht; Positionen und Bezeichnungen veröffentlicht {years}",
  es: "no se ha publicado ninguna licencia explícita para esta versión; posiciones y designaciones publicadas en {years}",
  it: "nessuna licenza esplicita è pubblicata per questa versione; posizioni e designazioni pubblicate nel {years}",
  "pt-BR":
    "nenhuma licença explícita foi publicada para esta versão; posições e designações publicadas em {years}",
  ru: "для этой версии явная лицензия не опубликована; годы публикации координат и обозначений: {years}",
  "zh-Hans": "此版本未发布明确的许可；位置和名称发表于{years}年",
  "zh-Hant": "此版本未發布明確的授權；位置與名稱發表於{years}年",
};

// The word joining the last two years (« 1966, 1992 et 2003 »).
const lastJoin: Readonly<Record<string, string>> = {
  fr: " et ",
  en: " and ",
  ja: "、",
  de: " und ",
  es: " y ",
  it: " e ",
  "pt-BR": " e ",
  ru: " и ",
  "zh-Hans": "、",
  "zh-Hant": "、",
};

function shippedLocale(locale: string): string {
  if (noLicence[locale]) return locale;
  const language = String(locale || "").split(/[-_]/)[0] || "";
  if (language === "pt") return "pt-BR";
  if (language === "zh")
    return /hant|tw|hk|mo/i.test(String(locale)) ? "zh-Hant" : "zh-Hans";
  return noLicence[language] ? language : "en";
}

/**
 * The credit line of `catalogue` in `locale`, or `null` for a catalogue
 * without an entry here (its credit is the catalogue file's own).
 */
export function catalogueSourceCredit(
  catalogue: string,
  locale = "en",
): string | null {
  const source = catalogueSources[catalogue];
  if (!source) return null;
  const language = shippedLocale(locale);
  const ideographic = /^(ja|zh)/.test(language);
  const separator = ideographic ? "、" : ", ";
  const years = source.years.map(String);
  const written =
    years.length > 1
      ? `${years.slice(0, -1).join(separator)}${lastJoin[language]}${years.at(-1)}`
      : years[0]!;
  return `${catalogue} — ${source.author}, ${source.title} (${source.years[0]}), ${source.publication} · ${source.reference} · ${noLicence[language]!.replace("{years}", written)}`;
}

/** The catalogues among `catalogues` that have a credit line, in order. */
export function creditedCatalogues(catalogues: Iterable<string>): string[] {
  const present = new Set(catalogues);
  return Object.keys(catalogueSources).filter((catalogue) =>
    present.has(catalogue),
  );
}

// The credit of the target distances, in the ten languages of the app: two
// lines, written under the catalogue's own credit when some target carries a
// distance. The first says what comes from OpenNGC (CC BY-SA 4.0: the
// parallaxes and radial velocities, and the distances derived from them, an
// adaptation shared under the same licence); the second says that the
// published values are facts cited with their reference and carries the
// acknowledgements NED and SIMBAD ask for. The references themselves are
// listed in `docs/STATIC_DATA.md` (« Target distances »).
const distanceCredit: Readonly<Record<string, readonly [string, string]>> = {
  fr: [
    "Distances : parallaxes et vitesses radiales d’OpenNGC (CC BY-SA 4.0) ; les distances qui en sont tirées en sont une adaptation, partagée sous la même licence.",
    "Distances : valeurs publiées, citées chacune avec sa référence (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt et Vasiliev 2021, Dias et al. 2021, entre autres ; la liste figure dans la documentation des sources de données). Cette recherche a utilisé la NASA/IPAC Extragalactic Database (NED), exploitée par le California Institute of Technology sous contrat avec la NASA, et la base SIMBAD, exploitée au CDS, Strasbourg.",
  ],
  en: [
    "Distances: parallaxes and radial velocities from OpenNGC (CC BY-SA 4.0); the distances derived from them are an adaptation, shared under the same licence.",
    "Distances: published values, each cited with its reference (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt & Vasiliev 2021, Dias et al. 2021, among others; the list is in the data-sources documentation). This research has made use of the NASA/IPAC Extragalactic Database (NED), operated by the California Institute of Technology under contract with NASA, and of the SIMBAD database, operated at CDS, Strasbourg.",
  ],
  ja: [
    "距離：OpenNGCの視差と視線速度（CC BY-SA 4.0）に基づきます。そこから導いた距離は翻案であり、同じライセンスで共有されます。",
    "距離：公表値で、それぞれ参照文献を明記しています（NED-D、Cosmicflows-4（Tully ほか 2023）、Baumgardt & Vasiliev 2021、Dias ほか 2021 など。一覧はデータソースの文書にあります）。本研究は、カリフォルニア工科大学がNASAとの契約で運用するNASA/IPAC Extragalactic Database (NED)と、ストラスブールのCDSが運用するSIMBADデータベースを利用しました。",
  ],
  de: [
    "Entfernungen: Parallaxen und Radialgeschwindigkeiten aus OpenNGC (CC BY-SA 4.0); die daraus abgeleiteten Entfernungen sind eine Bearbeitung und werden unter derselben Lizenz geteilt.",
    "Entfernungen: veröffentlichte Werte, jeweils mit ihrer Quelle zitiert (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt & Vasiliev 2021, Dias et al. 2021 u. a.; die Liste steht in der Dokumentation der Datenquellen). Diese Arbeit nutzte die NASA/IPAC Extragalactic Database (NED), betrieben vom California Institute of Technology im Auftrag der NASA, und die Datenbank SIMBAD, betrieben am CDS in Straßburg.",
  ],
  es: [
    "Distancias: paralajes y velocidades radiales de OpenNGC (CC BY-SA 4.0); las distancias que se derivan de ellos son una adaptación, compartida bajo la misma licencia.",
    "Distancias: valores publicados, cada uno citado con su referencia (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt y Vasiliev 2021, Dias et al. 2021, entre otros; la lista figura en la documentación de las fuentes de datos). Esta investigación ha utilizado la NASA/IPAC Extragalactic Database (NED), operada por el California Institute of Technology bajo contrato con la NASA, y la base de datos SIMBAD, operada en el CDS de Estrasburgo.",
  ],
  it: [
    "Distanze: parallassi e velocità radiali di OpenNGC (CC BY-SA 4.0); le distanze che ne derivano sono un adattamento, condiviso con la stessa licenza.",
    "Distanze: valori pubblicati, ciascuno citato con il proprio riferimento (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt e Vasiliev 2021, Dias et al. 2021, tra gli altri; l’elenco è nella documentazione delle fonti di dati). Questa ricerca ha utilizzato la NASA/IPAC Extragalactic Database (NED), gestita dal California Institute of Technology su contratto con la NASA, e il database SIMBAD, gestito al CDS di Strasburgo.",
  ],
  "pt-BR": [
    "Distâncias: paralaxes e velocidades radiais do OpenNGC (CC BY-SA 4.0); as distâncias derivadas delas são uma adaptação, compartilhada sob a mesma licença.",
    "Distâncias: valores publicados, cada um citado com a sua referência (NED-D, Cosmicflows-4 (Tully et al. 2023), Baumgardt e Vasiliev 2021, Dias et al. 2021, entre outros; a lista está na documentação das fontes de dados). Esta pesquisa utilizou a NASA/IPAC Extragalactic Database (NED), operada pelo California Institute of Technology sob contrato com a NASA, e a base de dados SIMBAD, operada no CDS, em Estrasburgo.",
  ],
  ru: [
    "Расстояния: параллаксы и лучевые скорости из OpenNGC (CC BY-SA 4.0); полученные из них расстояния являются производным произведением и распространяются на тех же условиях лицензии.",
    "Расстояния: опубликованные значения, каждое со ссылкой на источник (NED-D, Cosmicflows-4 (Tully и др. 2023), Baumgardt и Vasiliev 2021, Dias и др. 2021 и другие; список приведён в документации источников данных). В этом исследовании использованы NASA/IPAC Extragalactic Database (NED), которую по контракту с NASA ведёт Калифорнийский технологический институт, и база данных SIMBAD, которую ведёт CDS в Страсбурге.",
  ],
  "zh-Hans": [
    "距离：视差和视向速度来自OpenNGC（CC BY-SA 4.0）；由此推算的距离属于改编，以相同许可共享。",
    "距离：已发表的数值，均附参考文献（NED-D、Cosmicflows-4（Tully等人2023）、Baumgardt和Vasiliev 2021、Dias等人2021等；清单见数据来源文档）。本研究使用了由加州理工学院根据与NASA的合同运营的NASA/IPAC Extragalactic Database（NED），以及由斯特拉斯堡CDS运营的SIMBAD数据库。",
  ],
  "zh-Hant": [
    "距離：視差與視向速度來自OpenNGC（CC BY-SA 4.0）；由此推算的距離屬於改作，以相同授權分享。",
    "距離：已發表的數值，均附參考文獻（NED-D、Cosmicflows-4（Tully等人2023）、Baumgardt和Vasiliev 2021、Dias等人2021等；清單見資料來源文件）。本研究使用了由加州理工學院依與NASA的合約營運的NASA/IPAC Extragalactic Database（NED），以及由史特拉斯堡CDS營運的SIMBAD資料庫。",
  ],
};

/**
 * The two credit lines of the target distances in `locale`: the OpenNGC line
 * (parallaxes and radial velocities, CC BY-SA 4.0, derived distances shared
 * alike) then the line of the published values (cited with their reference,
 * NED and SIMBAD acknowledged). The catalogue screens write them when the
 * catalogue's attribution says `distances`.
 */
export function distanceSourceCredits(locale = "en"): [string, string] {
  const [openNgc, published] = distanceCredit[shippedLocale(locale)]!;
  return [openNgc, published];
}
