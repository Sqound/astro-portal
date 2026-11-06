import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { localizedTargetCommonName } from "astro-core/target-common-names.js";
import { shippedLocales } from "astro-contracts/locales";

const lightYearsPerMegaparsec = 3_261_560;
const hubbleConstantKmPerSecondPerMegaparsec = 70;
export const targetResearchProfileVersion = "2026-09-catalogue-v1";

export const typeLabels = {
  Galaxie: {
    fr: "une galaxie",
    en: "a galaxy",
    ja: "銀河",
    de: "eine Galaxie",
    es: "una galaxia",
    it: "una galassia",
    "pt-BR": "uma galáxia",
    "zh-Hans": "一个星系",
    "zh-Hant": "一個星系",
    ru: "галактика",
  },
  "Amas globulaire": {
    fr: "un amas globulaire",
    en: "a globular cluster",
    ja: "球状星団",
    de: "ein Kugelsternhaufen",
    es: "un cúmulo globular",
    it: "un ammasso globulare",
    "pt-BR": "um aglomerado globular",
    "zh-Hans": "一个球状星团",
    "zh-Hant": "一個球狀星團",
    ru: "шаровое скопление",
  },
  "Amas ouvert": {
    fr: "un amas ouvert",
    en: "an open cluster",
    ja: "散開星団",
    de: "ein offener Sternhaufen",
    es: "un cúmulo abierto",
    it: "un ammasso aperto",
    "pt-BR": "um aglomerado aberto",
    "zh-Hans": "一个疏散星团",
    "zh-Hant": "一個疏散星團",
    ru: "рассеянное скопление",
  },
  "Nébuleuse planétaire": {
    fr: "une nébuleuse planétaire",
    en: "a planetary nebula",
    ja: "惑星状星雲",
    de: "ein planetarischer Nebel",
    es: "una nebulosa planetaria",
    it: "una nebulosa planetaria",
    "pt-BR": "uma nebulosa planetária",
    "zh-Hans": "一个行星状星云",
    "zh-Hant": "一個行星狀星雲",
    ru: "планетарная туманность",
  },
  "Nébuleuse en émission": {
    fr: "une nébuleuse en émission",
    en: "an emission nebula",
    ja: "散光星雲",
    de: "ein Emissionsnebel",
    es: "una nebulosa de emisión",
    it: "una nebulosa a emissione",
    "pt-BR": "uma nebulosa de emissão",
    "zh-Hans": "一个发射星云",
    "zh-Hant": "一個發射星雲",
    ru: "эмиссионная туманность",
  },
  "Nébuleuse en réflexion": {
    fr: "une nébuleuse en réflexion",
    en: "a reflection nebula",
    ja: "反射星雲",
    de: "ein Reflexionsnebel",
    es: "una nebulosa de reflexión",
    it: "una nebulosa a riflessione",
    "pt-BR": "uma nebulosa de reflexão",
    "zh-Hans": "一个反射星云",
    "zh-Hant": "一個反射星雲",
    ru: "отражательная туманность",
  },
  "Nébuleuse sombre": {
    fr: "une nébuleuse sombre",
    en: "a dark nebula",
    ja: "暗黒星雲",
    de: "ein Dunkelnebel",
    es: "una nebulosa oscura",
    it: "una nebulosa oscura",
    "pt-BR": "uma nebulosa escura",
    "zh-Hans": "一个暗星云",
    "zh-Hant": "一個暗星雲",
    ru: "тёмная туманность",
  },
  "Rémanent de supernova": {
    fr: "un rémanent de supernova",
    en: "a supernova remnant",
    ja: "超新星残骸",
    de: "ein Supernova-Überrest",
    es: "un remanente de supernova",
    it: "un resto di supernova",
    "pt-BR": "um remanescente de supernova",
    "zh-Hans": "一个超新星遗迹",
    "zh-Hant": "一個超新星殘骸",
    ru: "остаток сверхновой",
  },
  "Ciel profond": {
    fr: "un objet du ciel profond",
    en: "a deep-sky object",
    ja: "深宇宙天体",
    de: "ein Deep-Sky-Objekt",
    es: "un objeto del cielo profundo",
    it: "un oggetto del profondo cielo",
    "pt-BR": "um objeto de céu profundo",
    "zh-Hans": "一个深空天体",
    "zh-Hant": "一個深空天體",
    ru: "объект глубокого космоса",
  },
  Étoile: {
    fr: "une étoile",
    en: "a star",
    ja: "恒星",
    de: "ein Stern",
    es: "una estrella",
    it: "una stella",
    "pt-BR": "uma estrela",
    "zh-Hans": "一颗恒星",
    "zh-Hant": "一顆恆星",
    ru: "звезда",
  },
};

const scienceContext = {
  Galaxie: {
    fr: "Son étagement de lumière, sa morphologie et, lorsqu’il est mesuré, son décalage spectral servent à étudier les populations stellaires, la formation d’étoiles et la dynamique des galaxies.",
    en: "Its light distribution, morphology and, where measured, spectral redshift help study stellar populations, star formation and galactic dynamics.",
    ja: "光の分布、形態、そして測定されている場合は分光赤方偏移から、恒星種族、星形成、銀河の力学を調べることができます。",
    de: "Ihre Helligkeitsverteilung, ihre Morphologie und, wo gemessen, ihre spektrale Rotverschiebung helfen dabei, Sternpopulationen, Sternentstehung und die Dynamik von Galaxien zu untersuchen.",
    es: "Su distribución de luz, su morfología y, cuando se ha medido, su desplazamiento al rojo espectral ayudan a estudiar las poblaciones estelares, la formación de estrellas y la dinámica galáctica.",
    it: "La distribuzione della luce, la morfologia e, dove misurato, lo spostamento verso il rosso spettrale aiutano a studiare le popolazioni stellari, la formazione stellare e la dinamica delle galassie.",
    "pt-BR":
      "Sua distribuição de luz, sua morfologia e, quando medido, seu desvio para o vermelho espectral ajudam a estudar populações estelares, formação de estrelas e a dinâmica das galáxias.",
    "zh-Hans":
      "星系的光分布、形态，以及在有测量时的分光红移，可用来研究恒星星族、恒星形成和星系动力学。",
    "zh-Hant":
      "其光的分布、形態，以及在有測量時的光譜紅移，可用來研究恆星星族、恆星形成與星系動力學。",
    ru: "Распределение света, морфология и, если оно измерено, спектральное красное смещение помогают изучать звёздное население, звездообразование и динамику галактик.",
  },
  "Amas globulaire": {
    fr: "Les amas globulaires rassemblent des populations stellaires très anciennes : leurs âges, abondances chimiques et orbites éclairent l’assemblage précoce de la Voie lactée.",
    en: "Globular clusters contain very old stellar populations; their ages, chemical abundances and orbits illuminate the Milky Way’s early assembly.",
    ja: "球状星団には非常に古い恒星種族が含まれます。年齢、化学組成、軌道は天の川銀河の初期形成を知る手掛かりになります。",
    de: "Kugelsternhaufen enthalten sehr alte Sternpopulationen; ihr Alter, ihre chemische Zusammensetzung und ihre Bahnen geben Aufschluss über die frühe Entstehung der Milchstraße.",
    es: "Los cúmulos globulares contienen poblaciones estelares muy antiguas; sus edades, abundancias químicas y órbitas iluminan el ensamblaje temprano de la Vía Láctea.",
    it: "Gli ammassi globulari contengono popolazioni stellari molto antiche: età, abbondanze chimiche e orbite fanno luce sulla formazione primordiale della Via Lattea.",
    "pt-BR":
      "Os aglomerados globulares reúnem populações estelares muito antigas; suas idades, abundâncias químicas e órbitas esclarecem a formação inicial da Via Láctea.",
    "zh-Hans":
      "球状星团含有非常古老的恒星星族，其年龄、化学丰度和轨道有助于了解银河系的早期形成。",
    "zh-Hant":
      "球狀星團含有非常古老的恆星星族，其年齡、化學豐度與軌道有助於了解銀河系的早期形成過程。",
    ru: "Шаровые скопления содержат очень старое звёздное население: их возраст, химический состав и орбиты помогают понять, как на раннем этапе формировался Млечный Путь.",
  },
  "Amas ouvert": {
    fr: "Les étoiles d’un amas ouvert partagent généralement une origine commune. Comparer leur âge et leur composition permet de tester l’évolution stellaire dans un environnement bien daté.",
    en: "Stars in an open cluster generally share a common origin. Comparing their ages and composition tests stellar evolution in a well-dated environment.",
    ja: "散開星団の恒星は通常、共通の起源を持ちます。年齢と組成を比較することで、年代を定めやすい環境で恒星進化を検証できます。",
    de: "Die Sterne eines offenen Sternhaufens haben in der Regel einen gemeinsamen Ursprung. Der Vergleich von Alter und Zusammensetzung erlaubt es, die Sternentwicklung in einer gut datierbaren Umgebung zu prüfen.",
    es: "Las estrellas de un cúmulo abierto suelen compartir un origen común. Comparar sus edades y su composición permite poner a prueba la evolución estelar en un entorno bien datado.",
    it: "Le stelle di un ammasso aperto di norma condividono un’origine comune. Confrontarne età e composizione permette di mettere alla prova l’evoluzione stellare in un ambiente ben datato.",
    "pt-BR":
      "As estrelas de um aglomerado aberto geralmente compartilham uma origem comum. Comparar suas idades e composição permite testar a evolução estelar em um ambiente bem datado.",
    "zh-Hans":
      "疏散星团中的恒星通常有共同的起源。比较它们的年龄和成分，可以在年代明确的环境中检验恒星演化理论。",
    "zh-Hant":
      "疏散星團中的恆星通常有共同的起源。比較它們的年齡與成分，可以在年代明確的環境中檢驗恆星演化理論。",
    ru: "Звёзды рассеянного скопления, как правило, имеют общее происхождение. Сравнение их возраста и состава позволяет проверять теорию звёздной эволюции в среде с хорошо известным возрастом.",
  },
  "Nébuleuse planétaire": {
    fr: "Cette enveloppe de gaz éjectée en fin de vie par une étoile semblable au Soleil renseigne sur la perte de masse, l’enrichissement chimique du milieu interstellaire et le destin du Soleil lointain.",
    en: "This shell of gas shed late in the life of a Sun-like star informs studies of mass loss, chemical enrichment of the interstellar medium and the distant fate of the Sun.",
    ja: "太陽に似た恒星が晩年に放出したガス殻は、質量放出、星間物質の化学的濃縮、そして遠い未来の太陽の姿を知る材料になります。",
    de: "Diese Gashülle, die ein sonnenähnlicher Stern am Ende seines Lebens abgestoßen hat, liefert Hinweise auf Massenverlust, auf die chemische Anreicherung des interstellaren Mediums und auf das ferne Schicksal der Sonne.",
    es: "Esta envoltura de gas expulsada al final de la vida de una estrella similar al Sol aporta información sobre la pérdida de masa, el enriquecimiento químico del medio interestelar y el lejano destino del Sol.",
    it: "Questo guscio di gas espulso a fine vita da una stella simile al Sole offre informazioni sulla perdita di massa, sull’arricchimento chimico del mezzo interstellare e sul lontano destino del Sole.",
    "pt-BR":
      "Este envoltório de gás, expelido no fim da vida de uma estrela semelhante ao Sol, traz informações sobre a perda de massa, o enriquecimento químico do meio interestelar e o futuro distante do Sol.",
    "zh-Hans":
      "这层气体外壳是类太阳恒星在晚年抛出的，可用于研究质量损失、星际介质的化学增丰，以及遥远未来太阳的命运。",
    "zh-Hant":
      "這層氣體外殼是類太陽恆星在晚年拋出的，可用於研究質量損失、星際介質的化學增豐，以及遙遠未來太陽的命運。",
    ru: "Эта газовая оболочка, сброшенная в конце жизни звездой, подобной Солнцу, помогает изучать потерю массы, химическое обогащение межзвёздной среды и далёкое будущее самого Солнца.",
  },
  "Nébuleuse en émission": {
    fr: "Le rayonnement de jeunes étoiles massives ionise ce gaz. Les raies d’émission cartographient la formation stellaire et l’action du rayonnement, des vents et des supernovæ sur leur nuage natal.",
    en: "Radiation from young massive stars ionises this gas. Emission lines map star formation and the action of radiation, winds and supernovae on their natal cloud.",
    ja: "若い大質量星の放射がこのガスを電離させます。輝線は、星形成と、放射・恒星風・超新星が母雲へ及ぼす作用を地図化します。",
    de: "Die Strahlung junger, massereicher Sterne ionisiert dieses Gas. Emissionslinien machen sichtbar, wo Sterne entstehen und wie Strahlung, Winde und Supernovae auf ihre Geburtswolke wirken.",
    es: "La radiación de estrellas jóvenes y masivas ioniza este gas. Las líneas de emisión permiten cartografiar la formación estelar y la acción de la radiación, los vientos y las supernovas sobre su nube natal.",
    it: "La radiazione di giovani stelle massicce ionizza questo gas. Le righe di emissione mappano la formazione stellare e l’azione di radiazione, venti e supernove sulla nube madre.",
    "pt-BR":
      "A radiação de estrelas jovens e massivas ioniza este gás. As linhas de emissão mapeiam a formação estelar e a ação da radiação, dos ventos e das supernovas sobre a nuvem natal.",
    "zh-Hans":
      "年轻大质量恒星的辐射使这些气体电离。发射线可以描绘恒星形成的分布，以及辐射、恒星风和超新星对其母云的作用。",
    "zh-Hant":
      "年輕大質量恆星的輻射使這些氣體游離。發射線可以描繪恆星形成的分布，以及輻射、恆星風與超新星對其母雲的作用。",
    ru: "Излучение молодых массивных звёзд ионизует этот газ. Эмиссионные линии позволяют проследить звездообразование и действие излучения, звёздного ветра и сверхновых на родительское облако.",
  },
  "Nébuleuse en réflexion": {
    fr: "La poussière y diffuse la lumière d’étoiles voisines. Sa couleur et sa polarisation renseignent sur les grains de poussière et sur la géométrie du nuage éclairé.",
    en: "Dust scatters the light of nearby stars. Its colour and polarisation inform studies of dust grains and the geometry of the illuminated cloud.",
    ja: "塵が近くの恒星の光を散乱しています。色と偏光は、塵粒子と照らされた雲の幾何学的構造を調べる手掛かりになります。",
    de: "Staub streut hier das Licht benachbarter Sterne. Farbe und Polarisation geben Aufschluss über die Staubkörner und die Geometrie der beleuchteten Wolke.",
    es: "El polvo dispersa aquí la luz de estrellas cercanas. Su color y su polarización informan sobre los granos de polvo y sobre la geometría de la nube iluminada.",
    it: "La polvere diffonde qui la luce delle stelle vicine. Il suo colore e la sua polarizzazione offrono informazioni sui grani di polvere e sulla geometria della nube illuminata.",
    "pt-BR":
      "A poeira espalha a luz de estrelas próximas. Sua cor e sua polarização informam sobre os grãos de poeira e sobre a geometria da nuvem iluminada.",
    "zh-Hans":
      "尘埃散射了附近恒星的光。它的颜色和偏振可用来研究尘埃颗粒，以及被照亮的尘埃云的几何结构。",
    "zh-Hant":
      "塵埃散射了附近恆星的光。它的顏色與偏振可用來研究塵埃顆粒，以及被照亮的塵埃雲的幾何結構。",
    ru: "Пыль рассеивает свет соседних звёзд. По её цвету и поляризации можно судить о пылевых частицах и о геометрии освещённого облака.",
  },
  "Nébuleuse sombre": {
    fr: "Cette poussière froide se détache par silhouette devant un fond lumineux. Les observations infrarouges et radio y tracent le gaz moléculaire et les premières étapes de la formation d’étoiles.",
    en: "This cold dust stands out in silhouette against a brighter background. Infrared and radio observations trace molecular gas and the earliest stages of star formation there.",
    ja: "冷たい塵が明るい背景に対してシルエットとして見えます。赤外線と電波の観測は、分子ガスと星形成の最初期段階をたどります。",
    de: "Dieser kalte Staub zeichnet sich als Silhouette vor einem helleren Hintergrund ab. Infrarot- und Radiobeobachtungen verfolgen dort das molekulare Gas und die frühesten Phasen der Sternentstehung.",
    es: "Este polvo frío se recorta en silueta contra un fondo más brillante. Las observaciones en infrarrojo y radio permiten trazar allí el gas molecular y las primeras etapas de la formación estelar.",
    it: "Questa polvere fredda si staglia in silhouette contro uno sfondo più luminoso. Le osservazioni a infrarossi e in radio vi tracciano il gas molecolare e le primissime fasi della formazione stellare.",
    "pt-BR":
      "Esta poeira fria se destaca em silhueta contra um fundo mais brilhante. Observações em infravermelho e em rádio mapeiam ali o gás molecular e as primeiras etapas da formação de estrelas.",
    "zh-Hans":
      "冷尘埃在较亮的背景上呈现为剪影。红外和射电观测可以在这里追踪分子气体，以及恒星形成的最早阶段。",
    "zh-Hant":
      "冷塵埃在較亮的背景上呈現為剪影。紅外線與電波觀測可以在這裡追蹤分子氣體，以及恆星形成的最早階段。",
    ru: "Холодная пыль выделяется силуэтом на более ярком фоне. Инфракрасные и радионаблюдения прослеживают в ней молекулярный газ и самые ранние стадии звездообразования.",
  },
  "Rémanent de supernova": {
    fr: "Les filaments et fronts de choc conservent la trace d’une explosion stellaire. Ils permettent d’étudier l’accélération de particules, la nucléosynthèse et l’interaction entre l’onde de choc et le milieu interstellaire.",
    en: "Its filaments and shock fronts retain the imprint of a stellar explosion. They support studies of particle acceleration, nucleosynthesis and shock interaction with the interstellar medium.",
    ja: "フィラメントと衝撃波面には恒星爆発の痕跡が残ります。粒子加速、元素合成、衝撃波と星間物質の相互作用を研究できます。",
    de: "Filamente und Stoßfronten bewahren die Spuren einer Sternexplosion. Sie erlauben es, Teilchenbeschleunigung, Nukleosynthese und das Zusammenwirken der Stoßwelle mit dem interstellaren Medium zu untersuchen.",
    es: "Sus filamentos y frentes de choque conservan la huella de una explosión estelar. Permiten estudiar la aceleración de partículas, la nucleosíntesis y la interacción de la onda de choque con el medio interestelar.",
    it: "I suoi filamenti e fronti d’urto conservano l’impronta di un’esplosione stellare. Permettono di studiare l’accelerazione delle particelle, la nucleosintesi e l’interazione dell’onda d’urto con il mezzo interstellare.",
    "pt-BR":
      "Seus filamentos e frentes de choque guardam a marca de uma explosão estelar. Permitem estudar a aceleração de partículas, a nucleossíntese e a interação da onda de choque com o meio interestelar.",
    "zh-Hans":
      "其纤维状结构和激波前沿保留着一次恒星爆发的印记，可用于研究粒子加速、核合成，以及激波与星际介质的相互作用。",
    "zh-Hant":
      "其纖維狀結構與震波前緣保留著一次恆星爆發的印記，可用於研究粒子加速、核合成，以及震波與星際介質的交互作用。",
    ru: "Волокна и ударные фронты хранят след взрыва звезды. По ним изучают ускорение частиц, нуклеосинтез и взаимодействие ударной волны с межзвёздной средой.",
  },
  "Ciel profond": {
    fr: "Sa nature et ses paramètres restent à préciser selon les études disponibles ; la fiche distingue donc les mesures de catalogue des interprétations plus spécifiques.",
    en: "Its nature and parameters still depend on the available studies, so this profile separates catalogue measurements from more specific interpretations.",
    ja: "性質と各パラメータは利用できる研究によって異なります。このプロフィールでは、カタログの測定値とより個別的な解釈を分けて示します。",
    de: "Seine Natur und seine Parameter hängen noch von den verfügbaren Studien ab; dieses Profil trennt daher Katalogmessungen von spezifischeren Deutungen.",
    es: "Su naturaleza y sus parámetros aún dependen de los estudios disponibles, por lo que esta ficha distingue las mediciones del catálogo de las interpretaciones más específicas.",
    it: "La sua natura e i suoi parametri dipendono ancora dagli studi disponibili: questa scheda distingue perciò le misure di catalogo dalle interpretazioni più specifiche.",
    "pt-BR":
      "Sua natureza e seus parâmetros ainda dependem dos estudos disponíveis; por isso esta ficha separa as medições de catálogo das interpretações mais específicas.",
    "zh-Hans":
      "其性质和参数仍取决于现有研究，因此此条目把星表中的测量值与更具体的解释区分开来。",
    "zh-Hant":
      "其性質與參數仍取決於現有研究，因此此條目把星表中的測量值與更具體的詮釋區分開來。",
    ru: "Природа объекта и его параметры зависят от имеющихся исследований, поэтому в карточке каталожные измерения отделены от более специальных интерпретаций.",
  },
  Étoile: {
    fr: "Les mesures de luminosité, de couleur et de spectre situent une étoile dans son évolution et renseignent sur sa température, sa masse et son environnement.",
    en: "Measurements of luminosity, colour and spectrum place a star in its evolution and inform its temperature, mass and environment.",
    ja: "光度、色、スペクトルの測定から、恒星進化における位置、温度、質量、周辺環境を調べることができます。",
    de: "Messungen von Leuchtkraft, Farbe und Spektrum ordnen einen Stern in seine Entwicklung ein und geben Aufschluss über Temperatur, Masse und Umgebung.",
    es: "Las mediciones de luminosidad, color y espectro sitúan a una estrella en su evolución y aportan información sobre su temperatura, su masa y su entorno.",
    it: "Le misure di luminosità, colore e spettro collocano una stella nella sua evoluzione e danno informazioni su temperatura, massa e ambiente.",
    "pt-BR":
      "Medições de luminosidade, cor e espectro situam uma estrela em sua evolução e informam sua temperatura, sua massa e seu entorno.",
    "zh-Hans":
      "对光度、颜色和光谱的测量，可以确定恒星在演化中所处的位置，并了解它的温度、质量和周围环境。",
    "zh-Hant":
      "對光度、顏色與光譜的測量，可以確定恆星在演化中所處的位置，並了解它的溫度、質量與周遭環境。",
    ru: "Измерения светимости, цвета и спектра позволяют определить место звезды на эволюционном пути и узнать её температуру, массу и окружение.",
  },
};

const catalogueSources = {
  Barnard: {
    label: "VizieR VII/220A — Barnard (1927)",
    url: "https://cdsarc.cds.unistra.fr/viz-bin/VizieR?-source=VII%2F220A",
  },
  Messier: {
    label: "SEDS Messier Database",
    url: "https://messier.lamost.org/seds/seds.org/messier/",
  },
  NGC: {
    label: "OpenNGC",
    url: "https://github.com/mattiaverga/OpenNGC",
  },
  IC: {
    label: "OpenNGC",
    url: "https://github.com/mattiaverga/OpenNGC",
  },
  Caldwell: {
    label: "Caldwell observing list",
    url: "https://en.wikipedia.org/wiki/Caldwell_catalogue",
  },
};

// A small high-confidence layer for the best-known showpieces supplements the
// catalogue-wide profiles. Every other selected target keeps the same sourced
// baseline rather than receiving guessed object-specific facts.
const notableContext = {
  M31: {
    fr: "À environ 2,5 millions d’années-lumière, M31 est la grande galaxie la plus proche de la Voie lactée. Sa vitesse radiale négative montre qu’elle s’en approche ; la résolution de céphéides dans les années 1920 a établi qu’elle était une galaxie externe, et non un nuage de notre propre Galaxie.",
    en: "At about 2.5 million light-years, M31 is the nearest major galaxy to the Milky Way. Its negative radial velocity shows that it is approaching; resolving Cepheids there in the 1920s established that it was an external galaxy rather than a cloud inside our own.",
    ja: "約250万光年先にあるM31は、天の川銀河に最も近い大銀河です。負の視線速度は接近を示しています。1920年代にセファイド変光星が分解観測されたことで、天の川の内部にある雲ではなく外部銀河であることが示されました。",
    de: "In rund 2,5 Millionen Lichtjahren Entfernung ist M31 die der Milchstraße nächstgelegene große Galaxie. Ihre negative Radialgeschwindigkeit zeigt, dass sie sich nähert; die Auflösung von Cepheiden in den 1920er-Jahren bewies, dass es sich um eine externe Galaxie und nicht um eine Wolke innerhalb der unseren handelt.",
    es: "A unos 2,5 millones de años luz, M31 es la gran galaxia más cercana a la Vía Láctea. Su velocidad radial negativa indica que se aproxima; la resolución de cefeidas en ella en la década de 1920 demostró que era una galaxia externa y no una nube dentro de la nuestra.",
    it: "A circa 2,5 milioni di anni luce, M31 è la grande galassia più vicina alla Via Lattea. La sua velocità radiale negativa mostra che si sta avvicinando; la risoluzione di alcune cefeidi negli anni Venti del Novecento stabilì che era una galassia esterna e non una nube all’interno della nostra.",
    "pt-BR":
      "A cerca de 2,5 milhões de anos-luz, M31 é a grande galáxia mais próxima da Via Láctea. Sua velocidade radial negativa mostra que ela está se aproximando; a resolução de cefeidas nela, na década de 1920, estabeleceu que se tratava de uma galáxia externa, e não de uma nuvem dentro da nossa.",
    "zh-Hans":
      "M31距离我们约250万光年，是距离银河系最近的大型星系。它的视向速度为负值，表明它正在靠近银河系；20世纪20年代人们在其中分辨出造父变星，由此确认它是一个河外星系，而不是银河系内部的云气。",
    "zh-Hant":
      "M31 距離我們約 250 萬光年，是離銀河系最近的大型星系。它的視向速度為負值，顯示它正在接近銀河系；1920 年代人們在其中分辨出造父變星，從而確認它是一個河外星系，而不是銀河系內部的雲氣。",
    ru: "На расстоянии около 2,5\u00a0млн\u00a0световых\u00a0лет M31 — ближайшая к Млечному Пути крупная галактика. Её отрицательная лучевая скорость показывает, что она приближается; в 1920-х годах в ней разглядели цефеиды, и это доказало, что перед нами отдельная галактика, а не облако внутри нашей.",
  },
  M42: {
    fr: "Située à environ 1 350 années-lumière, M42 est l’un des laboratoires de formation stellaire massive les plus proches. Les étoiles chaudes du Trapèze ionisent le gaz ; leurs vents, les disques protoplanétaires et les jeunes étoiles permettent d’observer plusieurs étapes de la naissance d’un système stellaire.",
    en: "At roughly 1,350 light-years, M42 is one of the nearest laboratories for massive star formation. The hot Trapezium stars ionise the gas; their winds, protoplanetary disks and young stars reveal several stages in the birth of a stellar system.",
    ja: "約1,350光年先のM42は、大質量星形成を調べる最も近い実験場の一つです。トラペジウムの高温星がガスを電離させ、恒星風、原始惑星系円盤、若い恒星から恒星系誕生の複数の段階を観察できます。",
    de: "In rund 1350 Lichtjahren Entfernung ist M42 eines der nächstgelegenen Labore für die Entstehung massereicher Sterne. Die heißen Sterne des Trapezes ionisieren das Gas; ihre Winde, die protoplanetaren Scheiben und die jungen Sterne zeigen mehrere Phasen der Geburt eines Sternsystems.",
    es: "A unos 1350 años luz, M42 es uno de los laboratorios más cercanos de formación de estrellas masivas. Las estrellas calientes del Trapecio ionizan el gas; sus vientos, los discos protoplanetarios y las estrellas jóvenes muestran varias etapas del nacimiento de un sistema estelar.",
    it: "A circa 1350 anni luce, M42 è uno dei laboratori più vicini per lo studio della formazione di stelle massicce. Le calde stelle del Trapezio ionizzano il gas; i loro venti, i dischi protoplanetari e le giovani stelle mostrano diverse fasi della nascita di un sistema stellare.",
    "pt-BR":
      "A cerca de 1350 anos-luz, M42 é um dos laboratórios mais próximos de formação de estrelas massivas. As estrelas quentes do Trapézio ionizam o gás; seus ventos, os discos protoplanetários e as estrelas jovens revelam várias etapas do nascimento de um sistema estelar.",
    "zh-Hans":
      "M42距离我们约1350光年，是研究大质量恒星形成最近的天然实验室之一。猎户座四边形星团中的高温恒星使气体电离；它们的恒星风、原行星盘和年轻恒星，展现了恒星系统诞生过程中的多个阶段。",
    "zh-Hant":
      "M42 距離我們約 1,350 光年，是研究大質量恆星形成最近的天然實驗室之一。獵戶座四邊形星團的高溫恆星使氣體游離；它們的恆星風、原行星盤與年輕恆星，呈現了恆星系統誕生過程中的多個階段。",
    ru: "На расстоянии около 1\u00a0350\u00a0световых\u00a0лет M42 — одна из ближайших лабораторий массивного звездообразования. Горячие звёзды Трапеции ионизуют газ; их звёздные ветры, протопланетные диски и молодые звёзды позволяют увидеть несколько стадий рождения звёздной системы.",
  },
  M1: {
    fr: "M1 est le rémanent de l’explosion stellaire observée en 1054. Son pulsar central est l’étoile à neutrons laissée par la supernova ; le couple pulsar-nébuleuse permet d’étudier l’énergie injectée dans les filaments de gaz en expansion.",
    en: "M1 is the remnant of the stellar explosion observed in 1054. Its central pulsar is the neutron star left by the supernova; the pulsar-nebula system shows how energy is injected into expanding gas filaments.",
    ja: "M1は1054年に観測された恒星爆発の残骸です。中心のパルサーは超新星後に残った中性子星で、パルサーと星雲の系から、膨張するガスのフィラメントへエネルギーが注入される仕組みを調べられます。",
    de: "M1 ist der Überrest der Sternexplosion, die im Jahr 1054 beobachtet wurde. Sein zentraler Pulsar ist der von der Supernova zurückgelassene Neutronenstern; am System aus Pulsar und Nebel lässt sich ablesen, wie Energie in die expandierenden Gasfilamente eingespeist wird.",
    es: "M1 es el remanente de la explosión estelar observada en 1054. Su púlsar central es la estrella de neutrones que dejó la supernova; el sistema formado por el púlsar y la nebulosa muestra cómo se inyecta energía en los filamentos de gas en expansión.",
    it: "M1 è il resto dell’esplosione stellare osservata nel 1054. La sua pulsar centrale è la stella di neutroni lasciata dalla supernova; il sistema pulsar-nebulosa mostra come l’energia venga immessa nei filamenti di gas in espansione.",
    "pt-BR":
      "M1 é o remanescente da explosão estelar observada em 1054. Seu pulsar central é a estrela de nêutrons deixada pela supernova; o sistema pulsar-nebulosa mostra como a energia é injetada nos filamentos de gás em expansão.",
    "zh-Hans":
      "M1是1054年观测到的那次恒星爆发留下的遗迹。其中心的脉冲星是超新星爆发后留下的中子星；通过脉冲星与星云这一系统，可以研究能量如何注入不断膨胀的气体纤维。",
    "zh-Hant":
      "M1 是 1054 年觀測到的那次恆星爆發所留下的殘骸。其中心的脈衝星是超新星爆發後遺留的中子星；從脈衝星與星雲這個系統，可以研究能量如何注入不斷膨脹的氣體纖維。",
    ru: "M1 — остаток взрыва звезды, наблюдавшегося в 1054 году. Пульсар в центре — это нейтронная звезда, оставшаяся после сверхновой; система «пульсар — туманность» позволяет изучать, как энергия поступает в расширяющиеся газовые волокна.",
  },
  M45: {
    fr: "Les Pléiades sont un amas ouvert jeune, à environ 445 années-lumière. La nébulosité bleue visible sur les images est surtout de la poussière traversée par l’amas, qui diffuse la lumière des étoiles chaudes plutôt qu’un reste direct de leur nuage natal.",
    en: "The Pleiades are a young open cluster about 445 light-years away. The blue nebulosity in images is mainly dust the cluster is passing through, scattering light from hot stars rather than a direct remnant of their birth cloud.",
    ja: "プレアデス星団は約445光年先にある若い散開星団です。画像で見える青い星雲は主に星団が通過している塵であり、誕生時の母雲の直接の残骸ではなく、高温星の光を散乱しています。",
    de: "Die Plejaden sind ein junger offener Sternhaufen in rund 445 Lichtjahren Entfernung. Der blaue Nebel auf Aufnahmen ist vor allem Staub, den der Haufen durchquert und der das Licht heißer Sterne streut; er ist kein direkter Überrest ihrer Geburtswolke.",
    es: "Las Pléyades son un cúmulo abierto joven situado a unos 445 años luz. La nebulosidad azul de las imágenes es sobre todo polvo que el cúmulo está atravesando y que dispersa la luz de estrellas calientes; no es un remanente directo de su nube natal.",
    it: "Le Pleiadi sono un giovane ammasso aperto a circa 445 anni luce. La nebulosità blu visibile nelle immagini è soprattutto polvere attraversata dall’ammasso, che diffonde la luce delle stelle calde e non è un resto diretto della loro nube natale.",
    "pt-BR":
      "As Plêiades são um aglomerado aberto jovem a cerca de 445 anos-luz. A nebulosidade azul das imagens é principalmente poeira que o aglomerado está atravessando, espalhando a luz de estrelas quentes, e não um remanescente direto de sua nuvem natal.",
    "zh-Hans":
      "昴星团是一个年轻的疏散星团，距离约445光年。图像中可见的蓝色星云物质，主要是星团正在穿越的尘埃，它们散射了高温恒星的光，而不是恒星诞生时母云的直接残余。",
    "zh-Hant":
      "昴宿星團是一個年輕的疏散星團，距離約 445 光年。影像中可見的藍色星雲狀物質，主要是星團正穿越的塵埃，它們散射了高溫恆星的光，而不是恆星誕生時母雲的直接殘餘。",
    ru: "Плеяды — молодое рассеянное скопление на расстоянии около 445\u00a0световых\u00a0лет. Голубая туманность на снимках — это в основном пыль, сквозь которую проходит скопление: она рассеивает свет горячих звёзд, а не служит прямым остатком их родительского облака.",
  },
  M51: {
    fr: "M51 forme un système en interaction avec NGC 5195. Cette rencontre gravitationnelle souligne ses bras spiraux et déclenche des épisodes de formation stellaire ; elle en fait une référence pour étudier l’effet des marées sur les galaxies spirales.",
    en: "M51 forms an interacting system with NGC 5195. This gravitational encounter enhances its spiral arms and triggers episodes of star formation, making it a benchmark for studying tidal effects in spiral galaxies.",
    ja: "M51はNGC 5195と相互作用する系を作っています。この重力的な出会いが渦状腕を際立たせ、星形成を促しており、渦巻銀河に対する潮汐作用を研究する代表例です。",
    de: "M51 bildet mit NGC 5195 ein wechselwirkendes System. Diese gravitative Begegnung verstärkt ihre Spiralarme und löst Phasen der Sternentstehung aus; sie macht M51 zu einem Referenzobjekt für die Untersuchung von Gezeitenwirkungen in Spiralgalaxien.",
    es: "M51 forma un sistema en interacción con NGC 5195. Este encuentro gravitatorio refuerza sus brazos espirales y desencadena episodios de formación estelar, lo que la convierte en una referencia para estudiar los efectos de marea en galaxias espirales.",
    it: "M51 forma un sistema in interazione con NGC 5195. Questo incontro gravitazionale accentua i suoi bracci a spirale e innesca episodi di formazione stellare, rendendola un punto di riferimento per studiare gli effetti di marea nelle galassie a spirale.",
    "pt-BR":
      "M51 forma um sistema em interação com NGC 5195. Esse encontro gravitacional realça seus braços espirais e desencadeia episódios de formação de estrelas, tornando-a uma referência para estudar os efeitos de maré em galáxias espirais.",
    "zh-Hans":
      "M51与NGC 5195构成一个相互作用的星系系统。这次引力相遇使M51的旋臂更加醒目，并引发了数次恒星形成活动，使它成为研究旋涡星系中潮汐效应的典型例子。",
    "zh-Hant":
      "M51 與 NGC 5195 構成一個交互作用的星系系統。這次重力交會使 M51 的旋臂更為醒目，並引發數次恆星形成活動，使它成為研究螺旋星系中潮汐效應的典型範例。",
    ru: "M51 образует взаимодействующую систему с NGC 5195. Эта гравитационная встреча подчёркивает спиральные рукава и запускает эпизоды звездообразования, поэтому M51 — эталонный объект для изучения приливных эффектов в спиральных галактиках.",
  },
  M57: {
    fr: "À environ 2 300 années-lumière, M57 montre l’enveloppe expulsée par une étoile semblable au Soleil. Sa géométrie apparemment annulaire dépend de la ligne de visée, tandis que la naine blanche centrale illumine le gaz éjecté.",
    en: "At roughly 2,300 light-years, M57 shows the envelope expelled by a Sun-like star. Its apparently ring-like geometry depends on the viewing angle, while the central white dwarf illuminates the ejected gas.",
    ja: "約2,300光年先のM57は、太陽に似た星が放出した外層を示しています。リング状に見える形は視線方向にも左右され、中心の白色矮星が放出されたガスを照らしています。",
    de: "In rund 2300 Lichtjahren Entfernung zeigt M57 die Hülle, die ein sonnenähnlicher Stern abgestoßen hat. Ihre scheinbar ringförmige Gestalt hängt vom Blickwinkel ab, während der zentrale Weiße Zwerg das ausgestoßene Gas beleuchtet.",
    es: "A unos 2300 años luz, M57 muestra la envoltura expulsada por una estrella similar al Sol. Su geometría aparentemente anular depende del ángulo de visión, mientras que la enana blanca central ilumina el gas eyectado.",
    it: "A circa 2300 anni luce, M57 mostra l’involucro espulso da una stella simile al Sole. La sua geometria apparentemente ad anello dipende dalla direzione di osservazione, mentre la nana bianca centrale illumina il gas espulso.",
    "pt-BR":
      "A cerca de 2300 anos-luz, M57 mostra o envoltório expelido por uma estrela semelhante ao Sol. Sua geometria aparentemente em anel depende do ângulo de visada, enquanto a anã branca central ilumina o gás ejetado.",
    "zh-Hans":
      "M57距离我们约2300光年，展现了一颗类太阳恒星抛出的外壳。它看起来呈环状，这与观测方向有关，而中心的白矮星照亮了被抛出的气体。",
    "zh-Hant":
      "M57 距離我們約 2,300 光年，呈現了一顆類太陽恆星拋出的外殼。它看起來呈環狀，與觀測方向有關，而中心的白矮星照亮了被拋出的氣體。",
    ru: "На расстоянии около 2\u00a0300\u00a0световых\u00a0лет M57 показывает оболочку, сброшенную звездой, подобной Солнцу. Кажущаяся кольцевая форма зависит от угла зрения, а белый карлик в центре подсвечивает выброшенный газ.",
  },
  M81: {
    fr: "M81 appartient à un groupe voisin situé à environ 12 millions d’années-lumière. Son interaction passée avec M82 a redistribué du gaz dans le groupe et aide à expliquer les épisodes de formation stellaire observés chez ses voisines.",
    en: "M81 belongs to a nearby group around 12 million light-years away. Its past interaction with M82 redistributed gas through the group and helps explain episodes of star formation seen in its neighbours.",
    ja: "M81は約1,200万光年先の近傍銀河群に属します。M82との過去の相互作用は銀河群内のガスを再分配し、近隣銀河で見られる星形成の活発化を説明する手掛かりになります。",
    de: "M81 gehört zu einer nahen Galaxiengruppe in rund 12 Millionen Lichtjahren Entfernung. Ihre frühere Wechselwirkung mit M82 hat Gas in der Gruppe umverteilt und hilft zu erklären, warum bei ihren Nachbarn Phasen der Sternentstehung auftreten.",
    es: "M81 pertenece a un grupo cercano situado a unos 12 millones de años luz. Su interacción pasada con M82 redistribuyó gas por el grupo y ayuda a explicar los episodios de formación estelar observados en sus vecinas.",
    it: "M81 appartiene a un gruppo vicino a circa 12 milioni di anni luce. La sua passata interazione con M82 ha ridistribuito il gas nel gruppo e aiuta a spiegare gli episodi di formazione stellare osservati nelle galassie vicine.",
    "pt-BR":
      "M81 pertence a um grupo próximo a cerca de 12 milhões de anos-luz. Sua interação passada com M82 redistribuiu gás pelo grupo e ajuda a explicar os episódios de formação de estrelas vistos em suas vizinhas.",
    "zh-Hans":
      "M81属于一个邻近的星系群，距离约1200万光年。它过去与M82的相互作用使气体在星系群中重新分布，也有助于解释在其邻近星系中看到的恒星形成活动。",
    "zh-Hant":
      "M81 屬於一個鄰近的星系群，距離約 1,200 萬光年。它過去與 M82 的交互作用使氣體在星系群中重新分布，也有助於解釋在鄰近星系中看到的恆星形成活動。",
    ru: "M81 входит в близкую группу галактик на расстоянии около 12\u00a0млн\u00a0световых\u00a0лет. Её прошлое взаимодействие с M82 перераспределило газ внутри группы и помогает объяснить вспышки звездообразования у соседних галактик.",
  },
  M82: {
    fr: "M82 est une galaxie à sursaut de formation stellaire, où la naissance d’étoiles est particulièrement intense. Son interaction avec M81 a concentré du gaz vers son centre, où vents stellaires et supernovæ alimentent un vaste écoulement de matière.",
    en: "M82 is a starburst galaxy with unusually intense star formation. Its interaction with M81 concentrated gas toward the centre, where stellar winds and supernovae drive a large outflow of material.",
    ja: "M82は非常に活発な星形成を示すスターバースト銀河です。M81との相互作用がガスを中心へ集め、恒星風と超新星が大規模な物質流出を生み出しています。",
    de: "M82 ist eine Starburst-Galaxie mit ungewöhnlich intensiver Sternentstehung. Ihre Wechselwirkung mit M81 hat Gas zum Zentrum hin konzentriert, wo Sternwinde und Supernovae einen großen Materieausfluss antreiben.",
    es: "M82 es una galaxia con brote de formación estelar, de una intensidad inusual. Su interacción con M81 concentró gas hacia el centro, donde los vientos estelares y las supernovas impulsan un gran flujo de materia hacia el exterior.",
    it: "M82 è una galassia starburst con una formazione stellare insolitamente intensa. La sua interazione con M81 ha concentrato il gas verso il centro, dove i venti stellari e le supernove generano un grande flusso di materia verso l’esterno.",
    "pt-BR":
      "M82 é uma galáxia starburst, com formação de estrelas de intensidade incomum. Sua interação com M81 concentrou gás em direção ao centro, onde ventos estelares e supernovas impulsionam um grande fluxo de material para fora.",
    "zh-Hans":
      "M82是一个星暴星系，恒星形成异常活跃。它与M81的相互作用把气体聚集到中心，那里的恒星风和超新星驱动着大规模的物质外流。",
    "zh-Hant":
      "M82 是一個星爆星系，恆星形成異常活躍。它與 M81 的交互作用把氣體聚集到中心，那裡的恆星風與超新星驅動著大規模的物質外流。",
    ru: "M82 — галактика со вспышкой звездообразования: звёзды рождаются в ней необычайно интенсивно. Взаимодействие с M81 сосредоточило газ к центру, где звёздные ветры и сверхновые порождают мощный выброс вещества.",
  },
  M104: {
    fr: "La galaxie du Sombrero combine un bulbe lumineux, un disque mince et une bande de poussière particulièrement nette. Cette géométrie en fait une cible utile pour comparer la distribution des étoiles et du gaz dans les galaxies à grand bulbe.",
    en: "The Sombrero Galaxy combines a bright bulge, a thin disk and an especially sharp dust lane. This geometry makes it useful for comparing the distribution of stars and gas in galaxies with large bulges.",
    ja: "ソンブレロ銀河は明るいバルジ、薄い円盤、非常にくっきりした塵の帯を併せ持ちます。この形状は、大きなバルジを持つ銀河における恒星とガスの分布を比較するのに役立ちます。",
    de: "Die Sombrerogalaxie vereint einen hellen Bulge, eine dünne Scheibe und ein besonders scharf abgegrenztes Staubband. Diese Geometrie macht sie nützlich, um die Verteilung von Sternen und Gas in Galaxien mit großem Bulge zu vergleichen.",
    es: "La galaxia del Sombrero combina un bulbo brillante, un disco delgado y una banda de polvo especialmente nítida. Esta geometría la hace útil para comparar la distribución de estrellas y gas en galaxias de bulbo grande.",
    it: "La galassia Sombrero combina un bulbo luminoso, un disco sottile e una banda di polvere particolarmente netta. Questa geometria la rende utile per confrontare la distribuzione di stelle e gas nelle galassie con un grande bulbo.",
    "pt-BR":
      "A Galáxia do Sombreiro combina um bojo brilhante, um disco fino e uma faixa de poeira especialmente nítida. Essa geometria a torna útil para comparar a distribuição de estrelas e gás em galáxias de bojo grande.",
    "zh-Hans":
      "草帽星系兼具明亮的核球、薄薄的星系盘和格外清晰的尘埃带。这样的结构，便于比较大核球星系中恒星与气体的分布。",
    "zh-Hant":
      "草帽星系兼具明亮的核球、薄薄的星系盤，以及格外清晰的塵埃帶。這樣的結構，便於比較大核球星系中恆星與氣體的分布。",
    ru: "Галактика Сомбреро сочетает яркий балдж, тонкий диск и особенно чёткую пылевую полосу. Такая геометрия делает её удобной для сравнения распределения звёзд и газа в галактиках с массивным балджем.",
  },
  B033: {
    fr: "La Tête de cheval appartient au complexe moléculaire d’Orion, à environ 1 500 années-lumière. Elle se découpe devant l’émission rouge d’IC 434 ; son relief est modelé par le rayonnement des étoiles proches, notamment Sigma Orionis.",
    en: "The Horsehead belongs to the Orion molecular complex, about 1,500 light-years away. It is silhouetted against the red emission of IC 434; its shape is sculpted by radiation from nearby stars, notably Sigma Orionis.",
    ja: "馬頭星雲は約1,500光年先のオリオン分子雲複合体に属します。IC 434の赤い発光を背景にシルエットとして見え、近傍の恒星、とくにシグマ・オリオニスの放射がその形を作っています。",
    de: "Der Pferdekopfnebel gehört zum Orion-Molekülwolkenkomplex in rund 1500 Lichtjahren Entfernung. Er zeichnet sich als Silhouette vor der roten Emission von IC 434 ab; seine Form wird von der Strahlung benachbarter Sterne ausgeformt, vor allem von Sigma Orionis.",
    es: "La nebulosa Cabeza de Caballo pertenece al complejo molecular de Orión, a unos 1500 años luz. Se recorta en silueta contra la emisión roja de IC 434; su forma está esculpida por la radiación de estrellas cercanas, en particular Sigma Orionis.",
    it: "La Testa di Cavallo appartiene al complesso molecolare di Orione, a circa 1500 anni luce. Si staglia in silhouette contro l’emissione rossa di IC 434; la sua forma è scolpita dalla radiazione delle stelle vicine, in particolare Sigma Orionis.",
    "pt-BR":
      "A Nebulosa Cabeça de Cavalo pertence ao complexo molecular de Órion, a cerca de 1500 anos-luz. Ela se destaca em silhueta contra a emissão vermelha de IC 434; sua forma é esculpida pela radiação de estrelas próximas, em especial Sigma Orionis.",
    "zh-Hans":
      "马头星云属于猎户座分子云复合体，距离约1500光年。它以IC 434的红色发射为背景呈现剪影；附近恒星，尤其是猎户座σ星的辐射，塑造了它的形状。",
    "zh-Hant":
      "馬頭星雲屬於獵戶座分子雲複合體，距離約 1,500 光年。它以 IC 434 的紅色發射為背景呈現剪影；附近恆星，尤其是獵戶座 σ 星的輻射，塑造了它的形狀。",
    ru: "Конская Голова принадлежит молекулярному комплексу Ориона, расположенному на расстоянии около 1\u00a0500\u00a0световых\u00a0лет. Она выделяется силуэтом на фоне красного свечения IC 434; её форму лепит излучение соседних звёзд, прежде всего Сигмы Ориона.",
  },
  "NGC 1499": {
    fr: "La nébuleuse de Californie est un long filament d’hydrogène ionisé dans Persée. Son excitation est liée à l’étoile chaude Xi Persei ; sa très grande étendue apparente explique pourquoi les grands champs et les filtres à bande étroite la révèlent particulièrement bien.",
    en: "The California Nebula is a long filament of ionised hydrogen in Perseus. Its excitation is linked to the hot star Xi Persei; its very large apparent extent explains why wide fields and narrowband filters reveal it especially well.",
    ja: "カリフォルニア星雲は、ペルセウス座にある電離水素の長いフィラメントです。高温星クシー・ペルセイの影響で励起されており、非常に大きな見かけの広がりのため広写野とナローバンドフィルターで特によく写ります。",
    de: "Der Kaliforniennebel ist ein langes Filament aus ionisiertem Wasserstoff im Perseus. Seine Anregung hängt mit dem heißen Stern Xi Persei zusammen; seine sehr große scheinbare Ausdehnung erklärt, warum Weitfeldaufnahmen und Schmalbandfilter ihn besonders gut zeigen.",
    es: "La nebulosa de California es un largo filamento de hidrógeno ionizado en Perseo. Su excitación está ligada a la estrella caliente Xi Persei; su gran extensión aparente explica por qué los campos amplios y los filtros de banda estrecha la revelan especialmente bien.",
    it: "La nebulosa California è un lungo filamento di idrogeno ionizzato nel Perseo. La sua eccitazione è legata alla stella calda Xi Persei; la sua estensione apparente molto grande spiega perché i campi larghi e i filtri a banda stretta la rivelino particolarmente bene.",
    "pt-BR":
      "A Nebulosa da Califórnia é um longo filamento de hidrogênio ionizado em Perseu. Sua excitação está ligada à estrela quente Xi Persei; sua extensão aparente muito grande explica por que campos amplos e filtros de banda estreita a revelam especialmente bem.",
    "zh-Hans":
      "加州星云是英仙座中一条很长的电离氢细丝。它的激发与高温恒星英仙座ξ有关；它在天空中占据的范围非常大，因此大视场搭配窄带滤光片尤其能把它完整拍出来。",
    "zh-Hant":
      "加州星雲是英仙座中一條很長的游離氫細絲。它的激發與高溫恆星英仙座 ξ 有關；它在天空中占據的範圍非常大，因此大視野搭配窄頻濾鏡，特別能把它完整拍下來。",
    ru: "Туманность Калифорния — длинная нить ионизованного водорода в Персее. Её свечение связано с горячей звездой Кси Персея; из-за очень большого углового размера её особенно хорошо показывают широкие поля и узкополосные фильтры.",
  },
};

export function number(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

// German and Spanish group digits with a no-break space and only from five
// digits on (their glossaries: "43 279", "1280"), never with a point; the other
// locales keep the platform's grouping. German, Spanish, Italian and Brazilian
// Portuguese write a negative number with the true minus sign (U+2212).
const spacedGrouping = (locale) => locale === "de" || locale === "es";
const trueMinus = (locale) =>
  locale === "de" || locale === "es" || locale === "it" || locale === "pt-BR";

function formatNumber(value, locale, maximumFractionDigits = 1) {
  const text = spacedGrouping(locale)
    ? new Intl.NumberFormat(locale, {
        maximumFractionDigits,
        useGrouping: "min2",
      })
        .formatToParts(value)
        .map((part) => (part.type === "group" ? "\u00a0" : part.value))
        .join("")
    : new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  return trueMinus(locale) ? text.replace(/^-/, "\u2212") : text;
}

// The Chinese scripts (`zh-Hans`, `zh-Hant`): any tag of the language.
const isChinese = (locale) => String(locale).split("-")[0] === "zh";

// A distance or a size in light-years, written the Chinese way: 万/萬 for
// ten thousands, 亿/億 for hundred millions, never "million". Traditional
// text puts a space between a number and the character that follows it.
function chineseLightYears(lightYears, locale) {
  const traditional = locale === "zh-Hant";
  const gap = traditional ? " " : "";
  const wan = traditional ? "萬" : "万";
  const yi = traditional ? "億" : "亿";
  if (lightYears >= 100_000_000)
    return `${formatNumber(lightYears / 100_000_000, locale, 2)}${gap}${yi}光年`;
  if (lightYears >= 10_000)
    return `${formatNumber(lightYears / 10_000, locale, lightYears < 100_000 ? 1 : 0)}${gap}${wan}光年`;
  return `${formatNumber(lightYears, locale, 0)}${gap}光年`;
}

function angularSize(target, locale) {
  const [major, minor] = Array.isArray(target.apparentSizeArcmin)
    ? target.apparentSizeArcmin.map(number)
    : [];
  if (!Number.isFinite(major)) return null;
  const format = (value) => formatNumber(value, locale, value < 10 ? 1 : 0);
  if (locale === "ru")
    return Number.isFinite(minor) && Math.abs(major - minor) > 0.05
      ? `${format(major)}′ × ${format(minor)}′`
      : `${format(major)}′`;
  return Number.isFinite(minor) && Math.abs(major - minor) > 0.05
    ? `${format(major)} × ${format(minor)}′`
    : `${format(major)}′`;
}

function catalogueHistory(target, locale) {
  const catalogues = new Set(target.catalogues || []);
  const designation = target.designation;
  const icNumber = Number(String(designation).match(/^IC\s*(\d+)/i)?.[1]);
  const sentences = [];
  if (catalogues.has("Barnard")) {
    sentences.push({
      fr: "Son numéro Barnard vient du catalogue de 349 objets sombres publié par Edward Emerson Barnard en 1927.",
      en: "Its Barnard number comes from Edward Emerson Barnard’s 1927 catalogue of 349 dark objects.",
      ja: "Barnard 番号は、エドワード・エマーソン・バーナードが1927年に刊行した349の暗黒天体カタログに由来します。",
      de: "Die Barnard-Nummer stammt aus dem Katalog von 349 dunklen Objekten, den Edward Emerson Barnard 1927 veröffentlichte.",
      es: "Su número de Barnard procede del catálogo de 349 objetos oscuros que Edward Emerson Barnard publicó en 1927.",
      it: "Il suo numero Barnard deriva dal catalogo di 349 oggetti oscuri pubblicato da Edward Emerson Barnard nel 1927.",
      "pt-BR":
        "Seu número Barnard vem do catálogo de 349 objetos escuros publicado por Edward Emerson Barnard em 1927.",
      "zh-Hans":
        "其Barnard编号来自爱德华·爱默生·巴纳德1927年发表的星表，该星表收录了349个暗天体。",
      "zh-Hant":
        "其 Barnard 編號來自愛德華·愛默生·巴納德 1927年發表的星表，該星表收錄了 349 個暗天體。",
      ru: "Обозначение Barnard взято из каталога 349 тёмных объектов, опубликованного Эдвардом Эмерсоном Барнардом в 1927 году.",
    });
  }
  if (catalogues.has("Messier")) {
    sentences.push({
      fr: "Sa désignation Messier renvoie au relevé de Charles Messier, élaboré au XVIIIe siècle pour distinguer les objets diffus fixes des comètes.",
      en: "Its Messier designation refers to Charles Messier’s eighteenth-century survey, assembled to distinguish fixed diffuse objects from comets.",
      ja: "メシエ番号は、彗星と紛らわしい固定した淡い天体を区別するために18世紀にシャルル・メシエが編んだ観測リストに由来します。",
      de: "Die Messier-Bezeichnung verweist auf die Liste von Charles Messier aus dem 18. Jahrhundert, die angelegt wurde, um feststehende diffuse Objekte von Kometen zu unterscheiden.",
      es: "Su designación Messier remite a la lista de Charles Messier, elaborada en el siglo XVIII para distinguir los objetos difusos fijos de los cometas.",
      it: "La designazione Messier rimanda al catalogo di Charles Messier, compilato nel Settecento per distinguere gli oggetti diffusi fissi dalle comete.",
      "pt-BR":
        "Sua designação Messier remete ao levantamento de Charles Messier, elaborado no século XVIII para distinguir objetos difusos fixos de cometas.",
      "zh-Hans":
        "其梅西耶编号来自夏尔·梅西耶18世纪编制的天体表，编制目的是把位置固定的云雾状天体与彗星区分开来。",
      "zh-Hant":
        "其梅西耶編號來自夏爾·梅西耶十八世紀編製的天體表，編製目的是把位置固定的雲霧狀天體與彗星區分開來。",
      ru: "Обозначение Мессье восходит к списку Шарля Мессье, составленному в XVIII веке, чтобы отличать неподвижные туманные объекты от комет.",
    });
  }
  if (catalogues.has("NGC")) {
    sentences.push({
      fr: "La référence NGC l’inscrit dans le New General Catalogue publié par John L. E. Dreyer en 1888, qui rassemble des observations historiques de nombreux astronomes.",
      en: "Its NGC reference places it in John L. E. Dreyer’s New General Catalogue, published in 1888 and assembled from historical observations by many astronomers.",
      ja: "NGC番号は、1888年にジョン・L・E・ドレイヤーが多くの天文学者の歴史的観測をまとめて刊行した New General Catalogue に収録されていることを示します。",
      de: "Die NGC-Nummer führt das Objekt im New General Catalogue von John L. E. Dreyer auf, der 1888 erschien und aus historischen Beobachtungen vieler Astronomen zusammengestellt wurde.",
      es: "Su referencia NGC lo sitúa en el New General Catalogue de John L. E. Dreyer, publicado en 1888 a partir de observaciones históricas de muchos astrónomos.",
      it: "Il riferimento NGC lo inserisce nel New General Catalogue di John L. E. Dreyer, pubblicato nel 1888 e compilato a partire dalle osservazioni storiche di molti astronomi.",
      "pt-BR":
        "Sua referência NGC o inclui no New General Catalogue de John L. E. Dreyer, publicado em 1888 e reunido a partir de observações históricas de muitos astrônomos.",
      "zh-Hans":
        "NGC编号表明它被收录在约翰·L·E·德雷耶1888年出版的《星云星团新总表》（New General Catalogue）中，该星表汇集了许多天文学家的历史观测记录。",
      "zh-Hant":
        "NGC 編號表示它被收錄於約翰·L·E·德雷爾 1888年出版的《新總表》（New General Catalogue）中，該表彙整了許多天文學家的歷史觀測。",
      ru: "Номер NGC означает, что объект включён в «Новый общий каталог» (New General Catalogue) Джона Л. Э. Дрейера, изданный в 1888 году на основе исторических наблюдений многих астрономов.",
    });
  }
  if (catalogues.has("IC")) {
    const year = Number.isFinite(icNumber) && icNumber <= 1520 ? 1895 : 1908;
    sentences.push({
      fr: `La référence IC appartient au supplément Index Catalogue de Dreyer, publié en ${year}.`,
      en: `Its IC reference belongs to Dreyer’s Index Catalogue supplement, published in ${year}.`,
      ja: `IC番号は、ドレイヤーによる Index Catalogue の補遺（${year}年刊）に収録されていることを示します。`,
      de: `Die IC-Nummer gehört zum Index Catalogue, dem Nachtrag von Dreyer, der ${year} erschien.`,
      es: `Su referencia IC pertenece al suplemento Index Catalogue de Dreyer, publicado en ${year}.`,
      it: `Il riferimento IC appartiene al supplemento Index Catalogue di Dreyer, pubblicato nel ${year}.`,
      "pt-BR": `Sua referência IC pertence ao suplemento Index Catalogue de Dreyer, publicado em ${year}.`,
      "zh-Hans": `IC编号来自德雷耶编制的《索引星表》（Index Catalogue）补编，出版于${year}年。`,
      "zh-Hant": `IC 編號屬於德雷爾編製的《索引星表》（Index Catalogue）增補，出版於${year}年。`,
      ru: `Номер IC относится к дополнению Дрейера — «Индекс-каталогу» (Index Catalogue), изданному в ${year} году.`,
    });
  }
  if (catalogues.has("Caldwell")) {
    sentences.push({
      fr: "Son repère Caldwell provient de la liste d’observation proposée par Patrick Moore en 1995, et non d’une nouvelle désignation scientifique.",
      en: "Its Caldwell label comes from Patrick Moore’s 1995 observing list, not from a new scientific designation.",
      ja: "Caldwell 番号はパトリック・ムーアが1995年に提案した観測リストによるもので、新しい科学的な名称ではありません。",
      de: "Die Caldwell-Nummer stammt aus der Beobachtungsliste, die Patrick Moore 1995 vorschlug, und ist keine neue wissenschaftliche Bezeichnung.",
      es: "Su etiqueta Caldwell procede de la lista de observación que Patrick Moore propuso en 1995, y no de una nueva designación científica.",
      it: "L’indicazione Caldwell proviene dalla lista di osservazione proposta da Patrick Moore nel 1995, non da una nuova designazione scientifica.",
      "pt-BR":
        "Seu código Caldwell vem da lista de observação proposta por Patrick Moore em 1995, e não de uma nova designação científica.",
      "zh-Hans":
        "Caldwell编号来自帕特里克·摩尔1995年提出的观测列表，而不是新的科学命名。",
      "zh-Hant":
        "Caldwell 編號來自派屈克·摩爾 1995年提出的觀測列表，並非新的科學命名。",
      ru: "Обозначение Колдуэлла взято из списка для наблюдений, предложенного Патриком Муром в 1995 году, а не является новым научным названием.",
    });
  }
  if (!sentences.length) {
    sentences.push({
      fr: "Cette désignation est conservée dans le référentiel OpenNGC local ; la fiche distingue ce contexte de catalogue des attributions de découverte qui demanderaient une source historique propre à l’objet.",
      en: "This designation is retained in the local OpenNGC reference; the profile distinguishes this catalogue context from discovery attributions that would require an object-specific historical source.",
      ja: "この名称はローカルの OpenNGC 参照データに保持されています。このプロフィールでは、カタログ上の文脈と、天体ごとの歴史資料を必要とする発見者の帰属を区別しています。",
      de: "Diese Bezeichnung ist im lokalen OpenNGC-Referenzdatensatz enthalten; das Profil trennt diesen Katalogkontext von Entdeckungszuschreibungen, für die eine objektspezifische historische Quelle nötig wäre.",
      es: "Esta designación se conserva en la referencia local de OpenNGC; la ficha distingue este contexto de catálogo de las atribuciones de descubrimiento, que exigirían una fuente histórica propia del objeto.",
      it: "Questa designazione è conservata nel riferimento locale OpenNGC; la scheda distingue questo contesto di catalogo dalle attribuzioni di scoperta, che richiederebbero una fonte storica specifica per l’oggetto.",
      "pt-BR":
        "Esta designação é mantida na referência local do OpenNGC; a ficha distingue esse contexto de catálogo das atribuições de descoberta, que exigiriam uma fonte histórica específica do objeto.",
      "zh-Hans":
        "该编号保留在本地的OpenNGC参考数据中；此条目把这类星表信息与发现归属区分开来，后者需要有针对该天体的历史文献作依据。",
      "zh-Hant":
        "此編號保留在本機的 OpenNGC 參考資料中；此條目將這類星表資訊與發現歸屬區分開來，後者需要有針對該天體的歷史文獻作依據。",
      ru: "Это обозначение хранится в локальных справочных данных OpenNGC; в карточке каталожные сведения отделены от приписывания открытия, для которого нужен исторический источник по конкретному объекту.",
    });
  }
  // Chinese runs its sentences together; the other languages put a space.
  return sentences
    .map((sentence) => sentence[locale])
    .join(isChinese(locale) ? "" : " ");
}

// The sentences of the paragraphs that carry numbers, for the languages that
// are written independently of French and Japanese: one function per language
// so that each keeps its own word order, articles and number words. Every
// function returns the sentences of its paragraph; the caller joins them.
// `diameter` and `velocity` arrive formatted for the locale.
const distanceCopy = {
  de: ({ velocity, distance, diameter }) => [
    `Die veröffentlichte Radialgeschwindigkeit (${velocity}\u00a0km/s) ergibt mit einer Hubble-Konstante von 70\u00a0km/s/Mpc eine Entfernung in der Größenordnung von ${distance} Millionen Lichtjahren.`,
    diameter
      ? `Die scheinbare große Achse entspricht dann etwa ${diameter} Lichtjahren.`
      : null,
    "Diese auf der Rotverschiebung beruhende Schätzung reagiert empfindlich auf lokale Bewegungen.",
  ],
  es: ({ velocity, distance, diameter }) => [
    `La velocidad radial publicada (${velocity}\u00a0km/s), con una constante de Hubble de 70\u00a0km/s/Mpc, da una distancia del orden de ${distance} millones de años luz.`,
    diameter
      ? `Su eje mayor aparente equivale entonces a unos ${diameter} años luz.`
      : null,
    "Esta estimación basada en el desplazamiento al rojo sigue siendo sensible a los movimientos locales.",
  ],
  it: ({ velocity, distance, diameter }) => [
    `La velocità radiale pubblicata (${velocity}\u00a0km/s), con una costante di Hubble di 70\u00a0km/s/Mpc, dà una distanza dell’ordine di ${distance} milioni di anni luce.`,
    diameter
      ? `L’asse maggiore apparente corrisponde allora a circa ${diameter} anni luce.`
      : null,
    "Questa stima basata sullo spostamento verso il rosso resta sensibile ai moti locali.",
  ],
  "pt-BR": ({ velocity, distance, diameter }) => [
    `A velocidade radial publicada (${velocity}\u00a0km/s), com uma constante de Hubble de 70\u00a0km/s/Mpc, resulta em uma distância da ordem de ${distance} milhões de anos-luz.`,
    diameter
      ? `Seu eixo maior aparente corresponde então a cerca de ${diameter} anos-luz.`
      : null,
    "Essa estimativa baseada no desvio para o vermelho continua sensível aos movimentos locais.",
  ],
};

const lowVelocityCopy = {
  de: (velocity) =>
    `Die veröffentlichte Radialgeschwindigkeit (${velocity}\u00a0km/s) ist zu klein, um hier eine verlässliche Entfernung nach dem Hubble-Gesetz zu liefern: Lokale Bewegungen dominieren dann die beobachtete Verschiebung. Eine objektspezifische Entfernung aus der Fachliteratur ist vorzuziehen.`,
  es: (velocity) =>
    `La velocidad radial publicada (${velocity}\u00a0km/s) es demasiado baja para obtener aquí una distancia fiable con la ley de Hubble: los movimientos locales dominan el desplazamiento observado. Es preferible una distancia específica del objeto procedente de la literatura.`,
  it: (velocity) =>
    `La velocità radiale pubblicata (${velocity}\u00a0km/s) è troppo bassa per ricavare qui una distanza affidabile con la legge di Hubble: i moti locali dominano lo spostamento osservato. È preferibile una distanza specifica dell’oggetto tratta dalla letteratura.`,
  "pt-BR": (velocity) =>
    `A velocidade radial publicada (${velocity}\u00a0km/s) é pequena demais para fornecer aqui uma distância confiável pela lei de Hubble: os movimentos locais dominam o deslocamento observado. É preferível uma distância específica do objeto, obtida na literatura.`,
};

// The opening paragraph: what the object is, where, and the catalogue
// measurements. `size` and `magnitude` arrive formatted (or null).
const openingCopy = {
  de: ({ label, type, constellation, size, magnitude, morphology }) => {
    const measures = [
      size ? `eine scheinbare Ausdehnung von ${size}` : null,
      magnitude
        ? `eine integrierte Helligkeit von ${magnitude}\u00a0mag`
        : null,
    ].filter(Boolean);
    return [
      `${label} ist ${type}${constellation ? ` im Sternbild ${constellation}` : ""}.`,
      measures.length
        ? `OpenNGC nennt ${measures.join(" und ")}.`
        : "Die verfügbaren Messungen sind im lokalen Katalog hinterlegt.",
      morphology
        ? `Die dort angegebene Morphologie lautet ${morphology}.`
        : null,
    ];
  },
  es: ({ label, type, constellation, size, magnitude, morphology }) => {
    const measures = [
      size ? `una extensión aparente de ${size}` : null,
      magnitude ? `una magnitud integrada de ${magnitude}` : null,
    ].filter(Boolean);
    return [
      `${label} es ${type}${constellation ? ` en la constelación de ${constellation}` : ""}.`,
      measures.length
        ? `OpenNGC indica ${measures.join(" y ")}.`
        : "Las mediciones disponibles se conservan en el catálogo local.",
      morphology ? `Su morfología catalogada es ${morphology}.` : null,
    ];
  },
  it: ({ label, type, constellation, size, magnitude, morphology }) => {
    const measures = [
      size ? `un’estensione apparente di ${size}` : null,
      magnitude ? `una magnitudine integrata di ${magnitude}` : null,
    ].filter(Boolean);
    return [
      `${label} è ${type}${constellation ? ` nella costellazione di ${constellation}` : ""}.`,
      measures.length
        ? `OpenNGC riporta ${measures.join(" e ")}.`
        : "Le misure disponibili sono conservate nel catalogo locale.",
      morphology ? `La morfologia indicata è ${morphology}.` : null,
    ];
  },
  "pt-BR": ({ label, type, constellation, size, magnitude, morphology }) => {
    const measures = [
      size ? `uma extensão aparente de ${size}` : null,
      magnitude ? `uma magnitude integrada de ${magnitude}` : null,
    ].filter(Boolean);
    return [
      `${label} é ${type}${constellation ? ` na constelação de ${constellation}` : ""}.`,
      measures.length
        ? `O OpenNGC indica ${measures.join(" e ")}.`
        : "As medições disponíveis estão armazenadas no catálogo local.",
      morphology ? `Sua morfologia catalogada é ${morphology}.` : null,
    ];
  },
};

export function distanceEstimate(target) {
  if (target.typeKey !== "Galaxie") return null;
  // Where the curated table holds a published distance for this object, a
  // description built from its radial velocity would contradict the distance
  // the sheet shows (a Virgo galaxy at 1 100 km/s is not at 15 Mpc): the
  // sentence is dropped for that object.
  if ((target.distance ?? target.source?.distance)?.source === "published")
    return null;
  const radialVelocity = radialVelocityFor(target);
  if (!Number.isFinite(radialVelocity) || radialVelocity < 300) return null;
  const megaparsecs = radialVelocity / hubbleConstantKmPerSecondPerMegaparsec;
  const lightYears = megaparsecs * lightYearsPerMegaparsec;
  const majorArcmin = number(target.apparentSizeArcmin?.[0]);
  const physicalDiameterLightYears = Number.isFinite(majorArcmin)
    ? lightYears * majorArcmin * (Math.PI / (180 * 60))
    : null;
  return {
    radialVelocityKmS: radialVelocity,
    distanceLightYears: lightYears,
    physicalDiameterLightYears,
    method: "hubble-flow-estimate",
  };
}

function radialVelocityFor(target) {
  return number(target.source?.radialVelocityKmS ?? target.radialVelocityKmS);
}

function distanceParagraph(estimate, locale) {
  if (!estimate) return null;
  const distance = formatNumber(
    estimate.distanceLightYears / 1_000_000,
    locale,
    1,
  );
  const velocity = formatNumber(estimate.radialVelocityKmS, locale, 0);
  const diameter = estimate.physicalDiameterLightYears
    ? formatNumber(estimate.physicalDiameterLightYears / 1_000, locale, 0)
    : null;
  if (Object.hasOwn(distanceCopy, locale))
    return distanceCopy[locale]({
      velocity,
      distance,
      diameter: estimate.physicalDiameterLightYears
        ? formatNumber(
            Math.round(estimate.physicalDiameterLightYears / 1_000) * 1_000,
            locale,
            0,
          )
        : null,
    })
      .filter(Boolean)
      .join(" ");
  if (locale === "fr")
    return `La vitesse radiale publiée (${velocity} km/s) donne, avec une constante de Hubble de 70 km/s/Mpc, une distance d’ordre de ${distance} millions d’années-lumière. ${diameter ? `Son grand axe apparent correspond alors à environ ${diameter} milliers d’années-lumière.` : ""} Cette estimation par décalage vers le rouge reste sensible aux mouvements locaux.`;
  if (isChinese(locale)) {
    const traditional = locale === "zh-Hant";
    const gap = traditional ? " " : "";
    const rounded = Math.round(estimate.distanceLightYears / 100_000) * 100_000;
    const sized = estimate.physicalDiameterLightYears
      ? Math.round(estimate.physicalDiameterLightYears / 1_000) * 1_000
      : null;
    const away = chineseLightYears(rounded, locale);
    const across = sized !== null ? chineseLightYears(sized, locale) : null;
    return traditional
      ? `依已公布的視向速度（${velocity} km/s）與 70 km/s/Mpc 的哈伯常數計算，其距離約為${gap}${away}。${across ? `在這個距離上，其視長軸約相當於 ${across}。` : ""}這個以紅移為基礎的估算容易受到局部運動的影響。`
      : `按已公布的视向速度（${velocity} km/s）和70 km/s/Mpc的哈勃常数计算，其距离约为${away}。${across ? `在这一距离上，其视长轴约对应${across}。` : ""}这一基于红移的估算容易受到局部运动的影响。`;
  }
  if (locale === "ru")
    return `Опубликованная лучевая скорость (${velocity}\u00a0км/с) при постоянной Хаббла 70\u00a0км/с/Мпк даёт расстояние порядка ${distance}\u00a0млн\u00a0световых\u00a0лет. ${diameter ? `Видимая большая ось при этом соответствует примерно ${diameter}\u00a0тыс.\u00a0световых\u00a0лет. ` : ""}Эта оценка по красному смещению чувствительна к локальным движениям.`;
  if (locale === "ja")
    return `公開されている視線速度（${velocity} km/s）から、ハッブル定数を 70 km/s/Mpc とすると、距離はおよそ ${distance} 百万光年と見積もられます。${diameter ? `見かけの長径はこの距離で約 ${diameter} 千光年に相当します。` : ""} 赤方偏移に基づくこの値は局所的な運動の影響を受けます。`;
  return `The published radial velocity (${velocity} km/s), using a Hubble constant of 70 km/s/Mpc, gives a distance of roughly ${distance} million light-years. ${diameter ? `Its apparent major axis then corresponds to about ${diameter} thousand light-years.` : ""} This redshift-based estimate remains sensitive to local motions.`;
}

function galaxyDistanceParagraph(target, estimate, locale) {
  if (estimate) return distanceParagraph(estimate, locale);
  if (target.typeKey !== "Galaxie") return null;
  // A published distance is on the sheet; neither the redshift sentence nor
  // « too small, a distance from the literature is preferable » follows.
  if ((target.distance ?? target.source?.distance)?.source === "published")
    return null;
  const radialVelocity = radialVelocityFor(target);
  if (!Number.isFinite(radialVelocity)) return null;
  const velocity = formatNumber(radialVelocity, locale, 0);
  if (Object.hasOwn(lowVelocityCopy, locale))
    return lowVelocityCopy[locale](velocity);
  if (locale === "fr")
    return `La vitesse radiale publiée (${velocity} km/s) est trop faible pour fournir ici une distance fiable par loi de Hubble : les mouvements locaux dominent alors le décalage observé. Une distance individuelle issue de la littérature est préférable.`;
  if (locale === "zh-Hans")
    return `已公布的视向速度（${velocity} km/s）过小，无法在这里按哈勃定律得出可靠的距离：此时局部运动主导了观测到的红移。更好的做法是采用文献中针对该星系的单独距离。`;
  if (locale === "zh-Hant")
    return `已公布的視向速度（${velocity} km/s）過小，無法在此依哈伯定律得出可靠的距離：此時局部運動主導了觀測到的紅移。較好的做法是採用文獻中針對該星系的個別距離。`;
  if (locale === "ru")
    return `Опубликованная лучевая скорость (${velocity}\u00a0км/с) слишком мала, чтобы получить здесь надёжное расстояние по закону Хаббла: в этой области наблюдаемое смещение определяют локальные движения. Предпочтительнее расстояние для самого объекта, взятое из литературы.`;
  if (locale === "ja")
    return `公開されている視線速度（${velocity} km/s）は小さすぎるため、ここではハッブルの法則から信頼できる距離を出していません。この領域では局所的な運動が観測されたずれを支配するため、文献に基づく個別の距離が望まれます。`;
  return `The published radial velocity (${velocity} km/s) is too small to provide a reliable Hubble-law distance here: local motions dominate the observed shift. An object-specific distance from the literature is preferable.`;
}

function openingParagraph(target, locale) {
  const type =
    typeLabels[target.typeKey]?.[locale] || typeLabels["Ciel profond"][locale];
  const constellation = target.constellationKey
    ? taxonomyLabel(target.constellationKey, locale)
    : null;
  const localizedCommonName = localizedTargetCommonName(target, locale);
  const sourceAliases = new Set(
    (target.commonNames || []).map((name) => String(name).trim().toLowerCase()),
  );
  // OpenNGC aliases are predominantly English. In a translated paragraph,
  // show an alias only when it comes from our localized-name table; otherwise
  // the translated card title remains the proper place for the object name.
  const commonName =
    locale === "en" ||
    !sourceAliases.has(
      String(localizedCommonName || "")
        .trim()
        .toLowerCase(),
    )
      ? localizedCommonName
      : null;
  const size = angularSize(target, locale);
  const magnitude = number(target.magnitude);
  const morphology =
    target.typeKey === "Galaxie"
      ? String(target.source?.morphology || target.morphology || "").trim()
      : "";
  const label = commonName
    ? `${target.designation}, ${commonName}`
    : target.designation;
  if (Object.hasOwn(openingCopy, locale))
    return openingCopy[locale]({
      label,
      type,
      constellation,
      size,
      magnitude: Number.isFinite(magnitude)
        ? formatNumber(magnitude, locale, 1)
        : null,
      morphology,
    })
      .filter(Boolean)
      .join(" ");
  if (locale === "fr") {
    const location = constellation ? ` dans ${constellation}` : "";
    const measures = [
      size ? `une étendue apparente de ${size}` : null,
      Number.isFinite(magnitude)
        ? `une magnitude intégrée de ${formatNumber(magnitude, locale, 1)}`
        : null,
    ].filter(Boolean);
    return `${label} est ${type}${location}. ${measures.length ? `La fiche OpenNGC indique ${measures.join(" et ")}.` : "Les mesures disponibles sont conservées dans le catalogue local."}${morphology ? ` Sa morphologie y est notée ${morphology}.` : ""}`;
  }
  if (locale === "ja") {
    const location = constellation ? `${constellation}にある` : "";
    const measures = [
      size ? `見かけの大きさは ${size}` : null,
      Number.isFinite(magnitude)
        ? `統合等級は ${formatNumber(magnitude, locale, 1)}`
        : null,
    ].filter(Boolean);
    return `${label} は${location}${type}です。${measures.length ? `OpenNGC では${measures.join("、")}とされています。` : "利用可能な測定値はローカルカタログに保存されています。"}${morphology ? `形態分類は ${morphology} です。` : ""}`;
  }
  // Chinese and Russian show a common name only when it is written in that
  // language: the English name stays out of these sentences.
  const nativeName =
    commonName && commonName !== localizedTargetCommonName(target, "en")
      ? commonName
      : null;
  if (locale === "zh-Hans") {
    // The constellation arrives as a nominative (a Latin name until a Chinese
    // one exists), so it follows « 所在星座为 » instead of sitting in a phrase.
    const lead = nativeName
      ? `${target.designation}（${nativeName}）`
      : target.designation;
    const location = constellation ? `，所在星座为${constellation}` : "";
    const measures = [
      size ? `视大小为${size}` : null,
      Number.isFinite(magnitude)
        ? `总星等为${formatNumber(magnitude, locale, 1)}`
        : null,
    ].filter(Boolean);
    return `${lead}是${type}${location}。${measures.length ? `在OpenNGC中，${measures.join("，")}。` : "可用的测量值保存在本地星表中。"}${morphology ? `其形态分类为${morphology}。` : ""}`;
  }
  if (locale === "zh-Hant") {
    const lead = nativeName
      ? `${target.designation}（${nativeName}）`
      : `${target.designation} `;
    const location = constellation ? `，所在星座為 ${constellation}` : "";
    const measures = [
      size ? `角大小為 ${size}` : null,
      Number.isFinite(magnitude)
        ? `總星等為 ${formatNumber(magnitude, locale, 1)}`
        : null,
    ].filter(Boolean);
    return `${lead}是${type}${location}。${measures.length ? `在 OpenNGC 中，${measures.join("，")}。` : "可用的測量值保存在本機星表中。"}${morphology ? `其形態分類為 ${morphology}。` : ""}`;
  }
  if (locale === "ru") {
    // The constellation arrives as a nominative (Latin or English for now):
    // « Созвездие: X » needs no case agreement.
    const lead = nativeName
      ? `${target.designation} (${nativeName})`
      : target.designation;
    const location = constellation ? ` Созвездие: ${constellation}.` : "";
    const measures = [
      size ? `угловой размер — ${size}` : null,
      Number.isFinite(magnitude)
        ? `интегральная звёздная величина — ${formatNumber(magnitude, locale, 1)}m`
        : null,
    ].filter(Boolean);
    return `${lead}\u00a0— ${type}.${location} ${measures.length ? `По данным OpenNGC: ${measures.join(", ")}.` : "Доступные измерения хранятся в локальном каталоге."}${morphology ? ` Морфологический тип в каталоге: ${morphology}.` : ""}`;
  }
  const location = constellation ? ` in ${constellation}` : "";
  const measures = [
    size ? `an apparent extent of ${size}` : null,
    Number.isFinite(magnitude)
      ? `an integrated magnitude of ${formatNumber(magnitude, locale, 1)}`
      : null,
  ].filter(Boolean);
  return `${label} is ${type}${location}. ${measures.length ? `OpenNGC lists ${measures.join(" and ")}.` : "Available measurements are retained in the local catalogue."}${morphology ? ` Its listed morphology is ${morphology}.` : ""}`;
}

function simbadUrl(target) {
  return `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(target.designation)}`;
}

function sourcesFor(target) {
  const sources = [
    {
      label: "OpenNGC",
      url: "https://github.com/mattiaverga/OpenNGC",
    },
    { label: `SIMBAD — ${target.designation}`, url: simbadUrl(target) },
  ];
  for (const catalogue of target.catalogues || []) {
    const source = catalogueSources[catalogue];
    if (source && !sources.some((entry) => entry.url === source.url))
      sources.push(source);
  }
  return sources;
}

/**
 * Produces a conservative, source-linked profile for every curated target.
 * It deliberately calls a catalogue reference a catalogue reference rather
 * than inventing an individual discovery date when the source does not give
 * one. Distances are only supplied where the imported radial velocity supports
 * an explicitly labelled Hubble-flow estimate.
 */
/**
 * The languages a profile is written in: the shipped locales of the locale
 * registry that this module has words for (its general science context is
 * the one every paragraph needs). A shipped locale without them gets no
 * text here; the reader shows the English one, flagged as a fallback
 * (`knowledgeTextFor`, `portal/locale-content.js`), never a blank.
 */
export function targetResearchProfileLocales() {
  return shippedLocales().filter((locale) =>
    Object.hasOwn(scienceContext["Ciel profond"], locale),
  );
}

export function targetResearchProfile(target) {
  // English is the editorial source language. The other languages are
  // translations of the same structured facts and source-backed assertions;
  // no locale fetches or independently selected source material are used.
  const estimate = distanceEstimate(target);
  const content = Object.fromEntries(
    targetResearchProfileLocales().map((locale) => {
      const paragraphs = [
        openingParagraph(target, locale),
        notableContext[target.designation]?.[locale],
        catalogueHistory(target, locale),
        scienceContext[target.typeKey]?.[locale] ||
          scienceContext["Ciel profond"][locale],
        galaxyDistanceParagraph(target, estimate, locale),
      ].filter(Boolean);
      return [locale, { paragraphs }];
    }),
  );
  return {
    schemaVersion: 1,
    profileVersion: targetResearchProfileVersion,
    sourceLocale: "en",
    tier: target.isBest ? "essential" : "extended",
    content,
    facts: {
      commonNames: (target.commonNames || []).filter(Boolean),
      apparentSizeArcmin: Array.isArray(target.apparentSizeArcmin)
        ? target.apparentSizeArcmin
        : null,
      magnitude: number(target.magnitude),
      historicalCatalogues: (target.catalogues || []).filter(Boolean),
      distance: estimate,
      morphology:
        String(target.source?.morphology || target.morphology || "") || null,
    },
    sources: sourcesFor(target),
  };
}
