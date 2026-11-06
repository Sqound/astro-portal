type Locale = "en" | "fr" | "ja" | "de" | "es" | "it" | "pt-BR";
type LocalizedParagraphs = Record<Locale, { paragraphs: readonly string[] }>;
type SolarSystemEntryInput = {
  id: string;
  designation: string;
  typeKey: string;
  apparentSizeArcmin?: readonly [number, number] | null;
  paragraphs: LocalizedParagraphs;
};

const nasaSolarSystemSource = {
  label: "NASA Solar System Exploration",
  url: "https://science.nasa.gov/solar-system/",
};

function entry({
  id,
  designation,
  typeKey,
  apparentSizeArcmin = null,
  paragraphs,
}: SolarSystemEntryInput) {
  return {
    id,
    designation,
    aliases: [designation],
    commonNames: [designation],
    typeKey,
    constellationKey: "Système solaire",
    apparentSizeArcmin,
    magnitude: null,
    surfaceBrightness: null,
    catalogues: ["Système solaire"],
    catalogue: "Système solaire",
    visibleFromNorthernHemisphere: true,
    visibleFromSouthernHemisphere: true,
    dssImage: solarSystemImageFor(id),
    editorial: {
      catalogueResearch: {
        schemaVersion: 1,
        sourceLocale: "en",
        content: paragraphs,
        sources: [nasaSolarSystemSource],
      },
    },
  };
}

// These bodies have no fixed J2000 coordinate in the local deep-sky library.
// They are catalogue records with rich context; the planner's ephemeris remains
// authoritative for their live position and visibility.
export const solarSystemCatalogueTargets = [
  entry({
    id: "solar-system-sun",
    designation: "Sun",
    typeKey: "Soleil",
    apparentSizeArcmin: [32, 32],
    paragraphs: {
      en: {
        paragraphs: [
          "The Sun is the star at the centre of our planetary system. Nuclear fusion in its core supplies the energy that shapes the climates, atmospheres and orbits of the worlds around it.",
          "Its visible surface, the photosphere, is only one layer of a restless magnetic atmosphere. Sunspots, prominences and flares reveal activity that changes from day to day. Observe it only with dedicated, correctly installed solar equipment.",
        ],
      },
      fr: {
        paragraphs: [
          "Le Soleil est l’étoile au centre de notre système planétaire. La fusion nucléaire de son cœur fournit l’énergie qui façonne les climats, atmosphères et orbites des mondes qui l’entourent.",
          "Sa surface visible, la photosphère, n’est qu’une couche d’une atmosphère magnétique très active. Taches, protubérances et éruptions révèlent une activité qui change de jour en jour. Ne l’observez qu’avec un matériel solaire dédié et correctement installé.",
        ],
      },
      ja: {
        paragraphs: [
          "太陽は惑星系の中心にある恒星です。中心部の核融合が、周囲の世界の気候・大気・軌道を形づくるエネルギーを供給しています。",
          "目に見える光球は、活発な磁気的大気の一層にすぎません。黒点、プロミネンス、フレアは日ごとに変わる活動を示します。必ず専用で正しく装着した太陽観測機材だけで観察してください。",
        ],
      },
      de: {
        paragraphs: [
          "Die Sonne ist der Stern im Zentrum unseres Planetensystems. Die Kernfusion in ihrem Inneren liefert die Energie, die Klima, Atmosphären und Bahnen der Welten um sie herum prägt.",
          "Ihre sichtbare Oberfläche, die Photosphäre, ist nur eine Schicht einer unruhigen magnetischen Atmosphäre. Sonnenflecken, Protuberanzen und Flares zeigen eine Aktivität, die sich von Tag zu Tag ändert. Beobachte sie ausschließlich mit eigens dafür gebauter, korrekt angebrachter Sonnenbeobachtungsausrüstung.",
        ],
      },
      es: {
        paragraphs: [
          "El Sol es la estrella situada en el centro de nuestro sistema planetario. La fusión nuclear de su núcleo suministra la energía que modela los climas, las atmósferas y las órbitas de los mundos que lo rodean.",
          "Su superficie visible, la fotosfera, es solo una capa de una atmósfera magnética inquieta. Las manchas solares, las protuberancias y las erupciones revelan una actividad que cambia de un día para otro. Obsérvelo únicamente con equipo solar específico e instalado correctamente.",
        ],
      },
      it: {
        paragraphs: [
          "Il Sole è la stella al centro del nostro sistema planetario. La fusione nucleare nel suo nucleo fornisce l’energia che plasma i climi, le atmosfere e le orbite dei mondi che lo circondano.",
          "La sua superficie visibile, la fotosfera, è solo uno strato di un’atmosfera magnetica in continua agitazione. Macchie solari, protuberanze e brillamenti rivelano un’attività che cambia di giorno in giorno. Lo osservi solo con attrezzatura solare specifica e montata correttamente.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "O Sol é a estrela no centro do nosso sistema planetário. A fusão nuclear em seu núcleo fornece a energia que molda os climas, as atmosferas e as órbitas dos mundos ao seu redor.",
          "Sua superfície visível, a fotosfera, é apenas uma camada de uma atmosfera magnética inquieta. Manchas solares, protuberâncias e erupções revelam uma atividade que muda de um dia para o outro. Observe-o somente com equipamento solar específico e instalado corretamente.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-moon",
    designation: "Moon",
    typeKey: "Lune",
    apparentSizeArcmin: [31, 31],
    paragraphs: {
      en: {
        paragraphs: [
          "Earth’s Moon is a rocky companion whose familiar phases come from changing illumination, not from Earth’s shadow. Its synchronous rotation keeps nearly the same face pointed toward us.",
          "The terminator, where lunar day meets night, is often the best place to observe relief. Low sunlight makes crater rims, rilles and mountain chains stand out in sharp shadow.",
        ],
      },
      fr: {
        paragraphs: [
          "La Lune est le compagnon rocheux de la Terre. Ses phases familières viennent de l’éclairage changeant du Soleil, et non de l’ombre de notre planète. Sa rotation synchrone nous présente presque toujours la même face.",
          "Le terminateur, frontière entre le jour et la nuit lunaires, est souvent la meilleure zone à observer. La lumière rasante y fait ressortir en ombres nettes les bords des cratères, rainures et chaînes de montagnes.",
        ],
      },
      ja: {
        paragraphs: [
          "月は地球の岩石質の伴天体です。おなじみの満ち欠けは地球の影ではなく、太陽に照らされる向きの変化によって生じます。自転と公転が同期しているため、ほぼ同じ面をこちらに向けています。",
          "月の昼夜の境界であるターミネーターは地形観察に最適です。低い太陽光がクレーター縁、谷筋、山脈を鋭い影で浮かび上がらせます。",
        ],
      },
      de: {
        paragraphs: [
          "Der Mond ist ein felsiger Begleiter der Erde; seine vertrauten Phasen entstehen durch die wechselnde Beleuchtung, nicht durch den Schatten der Erde. Dank seiner gebundenen Rotation zeigt er uns nahezu immer dieselbe Seite.",
          "Der Terminator, wo der Mondtag in die Mondnacht übergeht, ist oft der beste Ort, um Relief zu beobachten. Das flach einfallende Sonnenlicht lässt Kraterränder, Rillen und Gebirgszüge in scharfen Schatten hervortreten.",
        ],
      },
      es: {
        paragraphs: [
          "La Luna es el compañero rocoso de la Tierra: sus fases conocidas se deben a la iluminación cambiante, no a la sombra de la Tierra. Su rotación sincrónica hace que nos muestre casi siempre la misma cara.",
          "El terminador, donde el día lunar se encuentra con la noche, suele ser el mejor lugar para observar el relieve. La luz solar rasante hace destacar los bordes de los cráteres, las rimas y las cadenas montañosas con sombras nítidas.",
        ],
      },
      it: {
        paragraphs: [
          "La Luna è il compagno roccioso della Terra: le sue note fasi dipendono dall’illuminazione mutevole, non dall’ombra della Terra. La rotazione sincrona fa sì che ci mostri quasi sempre la stessa faccia.",
          "Il terminatore, dove il giorno lunare incontra la notte, è spesso il punto migliore per osservare il rilievo. La luce solare radente fa risaltare con ombre nette i bordi dei crateri, le rime e le catene montuose.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "A Lua é o companheiro rochoso da Terra; suas fases familiares vêm da mudança de iluminação, e não da sombra da Terra. Sua rotação sincronizada faz com que ela nos mostre quase sempre a mesma face.",
          "O terminador, onde o dia lunar encontra a noite, costuma ser o melhor lugar para observar o relevo. A luz solar rasante faz as bordas das crateras, as rimas e as cadeias de montanhas se destacarem em sombras nítidas.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-mercury",
    designation: "Mercury",
    typeKey: "Planète",
    apparentSizeArcmin: [0.2, 0.2],
    paragraphs: {
      en: {
        paragraphs: [
          "Mercury is the smallest and innermost planet. Its heavily cratered surface preserves a long record of impacts and a remarkably large iron-rich core.",
          "It never strays far from the Sun in our sky, so it is usually seen low in bright twilight. The challenge is not only its small apparent disk but also observing safely near the Sun.",
        ],
      },
      fr: {
        paragraphs: [
          "Mercure est la plus petite planète et la plus proche du Soleil. Sa surface très cratérisée conserve un long registre d’impacts et abrite un noyau remarquablement riche en fer.",
          "Elle ne s’éloigne jamais beaucoup du Soleil dans notre ciel et se voit donc bas dans un crépuscule lumineux. La difficulté vient autant de son petit disque apparent que de l’observation en sécurité près du Soleil.",
        ],
      },
      ja: {
        paragraphs: [
          "水星は最小で、太陽に最も近い惑星です。クレーターだらけの表面には長い衝突の記録が残り、非常に大きな鉄に富む核を持ちます。",
          "空では太陽からあまり離れないため、明るい薄明の低空に見えます。小さな視直径だけでなく、太陽の近くを安全に観察することも難しさです。",
        ],
      },
      de: {
        paragraphs: [
          "Merkur ist der kleinste und innerste Planet. Seine stark verkraterte Oberfläche bewahrt eine lange Einschlagsgeschichte, und er besitzt einen bemerkenswert großen, eisenreichen Kern.",
          "An unserem Himmel entfernt er sich nie weit von der Sonne und ist deshalb meist tief in der hellen Dämmerung zu sehen. Die Schwierigkeit liegt nicht nur in seiner kleinen scheinbaren Scheibe, sondern auch darin, in Sonnennähe sicher zu beobachten.",
        ],
      },
      es: {
        paragraphs: [
          "Mercurio es el planeta más pequeño y el más interno. Su superficie, muy craterizada, conserva un largo registro de impactos y un núcleo notablemente grande y rico en hierro.",
          "En nuestro cielo nunca se aleja mucho del Sol, por lo que suele verse bajo, en un crepúsculo todavía luminoso. La dificultad no es solo su pequeño disco aparente, sino también observar con seguridad cerca del Sol.",
        ],
      },
      it: {
        paragraphs: [
          "Mercurio è il pianeta più piccolo e più interno. La sua superficie, ricca di crateri, conserva una lunga storia di impatti; il pianeta ha inoltre un nucleo ricco di ferro straordinariamente grande.",
          "Nel nostro cielo non si allontana mai molto dal Sole, quindi di solito si vede basso, nel crepuscolo ancora luminoso. La difficoltà sta non solo nel suo piccolo disco apparente, ma anche nell’osservare in sicurezza vicino al Sole.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Mercúrio é o menor planeta e o mais interno. Sua superfície muito craterizada guarda um longo registro de impactos, e ele tem um núcleo rico em ferro notavelmente grande.",
          "No nosso céu ele nunca se afasta muito do Sol e, por isso, costuma ser visto baixo, no crepúsculo ainda claro. A dificuldade não está apenas no seu pequeno disco aparente, mas também em observar com segurança perto do Sol.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-venus",
    designation: "Venus",
    typeKey: "Planète",
    apparentSizeArcmin: [0.8, 0.8],
    paragraphs: {
      en: {
        paragraphs: [
          "Venus is Earth’s near neighbour in size, but its dense carbon-dioxide atmosphere and sulfuric-acid clouds create an extreme greenhouse climate.",
          "Through a telescope it shows phases like the Moon, a key observation in the history of heliocentrism. Its cloud deck hides the surface in visible light, so the changing crescent is the main visual feature.",
        ],
      },
      fr: {
        paragraphs: [
          "Vénus est voisine de la Terre par sa taille, mais son atmosphère dense de dioxyde de carbone et ses nuages d’acide sulfurique créent un effet de serre extrême.",
          "Au télescope, elle montre des phases comme la Lune, observation importante dans l’histoire de l’héliocentrisme. Sa couverture nuageuse masque la surface en lumière visible : le croissant changeant est donc son principal spectacle.",
        ],
      },
      ja: {
        paragraphs: [
          "金星は大きさでは地球に近い隣人ですが、濃い二酸化炭素大気と硫酸の雲が極端な温室環境を生み出しています。",
          "望遠鏡では月のような満ち欠けを示し、地動説の歴史で重要な観察となりました。可視光では雲が表面を隠すため、変化する三日月形が主な見どころです。",
        ],
      },
      de: {
        paragraphs: [
          "Venus ähnelt der Erde in ihrer Größe, doch ihre dichte Kohlendioxid-Atmosphäre und ihre Wolken aus Schwefelsäure erzeugen ein extremes Treibhausklima.",
          "Im Teleskop zeigt sie Phasen wie der Mond – eine Beobachtung, die in der Geschichte des heliozentrischen Weltbilds eine Schlüsselrolle spielte. Ihre Wolkendecke verbirgt im sichtbaren Licht die Oberfläche; die sich wandelnde Sichel ist daher das wichtigste visuelle Merkmal.",
        ],
      },
      es: {
        paragraphs: [
          "Venus tiene un tamaño parecido al de la Tierra, pero su densa atmósfera de dióxido de carbono y sus nubes de ácido sulfúrico crean un clima de efecto invernadero extremo.",
          "Con un telescopio muestra fases como la Luna, una observación clave en la historia del heliocentrismo. Su capa de nubes oculta la superficie en luz visible, así que el creciente cambiante es su principal rasgo visual.",
        ],
      },
      it: {
        paragraphs: [
          "Venere ha dimensioni simili a quelle della Terra, ma la sua densa atmosfera di anidride carbonica e le sue nubi di acido solforico creano un clima da effetto serra estremo.",
          "Al telescopio mostra le fasi come la Luna, un’osservazione chiave nella storia dell’eliocentrismo. La coltre di nubi nasconde la superficie nella luce visibile, perciò la falce mutevole è il suo principale tratto visivo.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Vênus tem tamanho próximo ao da Terra, mas sua densa atmosfera de dióxido de carbono e suas nuvens de ácido sulfúrico criam um clima de efeito estufa extremo.",
          "No telescópio, mostra fases como a Lua, uma observação decisiva na história do heliocentrismo. A camada de nuvens esconde a superfície na luz visível; por isso, o crescente em mudança é sua principal característica visual.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-earth",
    designation: "Earth",
    typeKey: "Planète",
    paragraphs: {
      en: {
        paragraphs: [
          "Earth is the ocean-covered rocky planet from which this catalogue is being read. Its atmosphere, magnetic field and active geology make it a particularly lively place to run an observatory.",
          "Open your eyes: you should be able to spot it. A remote portrait from another world may have to wait for a future mission.",
        ],
      },
      fr: {
        paragraphs: [
          "La Terre est la planète rocheuse couverte d’océans depuis laquelle ce catalogue est consulté. Son atmosphère, son champ magnétique et sa géologie active en font un lieu particulièrement vivant pour installer un observatoire.",
          "Ouvrez les yeux : vous devriez l’apercevoir. Pour son portrait depuis un autre monde, il faudra peut-être attendre une prochaine mission.",
        ],
      },
      ja: {
        paragraphs: [
          "地球は、このカタログを読んでいる海に覆われた岩石惑星です。大気、磁場、活発な地質活動は、観測所を置くにはとても生き生きとした場所にしています。",
          "目を開ければ、たぶん見つかります。別の世界からの肖像写真は、次のミッションまで待つことになるかもしれません。",
        ],
      },
      de: {
        paragraphs: [
          "Die Erde ist der von Ozeanen bedeckte Gesteinsplanet, von dem aus dieser Katalog gelesen wird. Ihre Atmosphäre, ihr Magnetfeld und ihre aktive Geologie machen sie zu einem besonders lebendigen Ort für den Betrieb einer Sternwarte.",
          "Öffne die Augen: Du solltest sie entdecken können. Ein Porträt aus der Ferne, von einer anderen Welt aus, muss vielleicht auf eine künftige Mission warten.",
        ],
      },
      es: {
        paragraphs: [
          "La Tierra es el planeta rocoso cubierto de océanos desde el que se consulta este catálogo. Su atmósfera, su campo magnético y su geología activa la convierten en un lugar especialmente animado para instalar un observatorio.",
          "Abra los ojos: debería poder divisarla. Un retrato a distancia, desde otro mundo, quizá tenga que esperar a una futura misión.",
        ],
      },
      it: {
        paragraphs: [
          "La Terra è il pianeta roccioso ricoperto di oceani da cui viene letto questo catalogo. L’atmosfera, il campo magnetico e la geologia attiva ne fanno un luogo particolarmente vivace in cui gestire un osservatorio.",
          "Apra gli occhi: dovrebbe riuscire a scorgerla. Un ritratto a distanza, da un altro mondo, forse dovrà attendere una futura missione.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "A Terra é o planeta rochoso coberto de oceanos a partir do qual este catálogo está sendo lido. Sua atmosfera, seu campo magnético e sua geologia ativa fazem dela um lugar especialmente movimentado para manter um observatório.",
          "Abra os olhos: você deve conseguir avistá-la. Um retrato à distância, tirado de outro mundo, talvez tenha de esperar por uma missão futura.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-mars",
    designation: "Mars",
    typeKey: "Planète",
    apparentSizeArcmin: [0.4, 0.4],
    paragraphs: {
      en: {
        paragraphs: [
          "Mars is a cold rocky world whose iron-rich dust gives it its red colour. Giant volcanoes, deep canyons and polar caps record a complex geological past.",
          "Its apparent disk is small except near opposition, when patient high-resolution observing can reveal dark albedo markings, polar caps and occasional dust storms.",
        ],
      },
      fr: {
        paragraphs: [
          "Mars est un monde rocheux froid dont les poussières riches en fer donnent la couleur rouge. Volcans géants, canyons profonds et calottes polaires témoignent d’une histoire géologique complexe.",
          "Son disque apparent reste petit sauf près de l’opposition. Avec de la patience et une bonne résolution, on peut alors distinguer des marques sombres, les calottes polaires et parfois des tempêtes de poussière.",
        ],
      },
      ja: {
        paragraphs: [
          "火星は、鉄に富む塵が赤い色を与える冷たい岩石世界です。巨大な火山、深い峡谷、極冠は複雑な地質史を物語ります。",
          "衝の前後以外では見かけの円盤が小さく、高解像度の観察には忍耐が必要です。条件がよければ暗い模様、極冠、ときには砂嵐も見えてきます。",
        ],
      },
      de: {
        paragraphs: [
          "Mars ist eine kalte Gesteinswelt, deren eisenreicher Staub ihr die rote Farbe verleiht. Riesige Vulkane, tiefe Canyons und Polkappen zeugen von einer vielschichtigen geologischen Vergangenheit.",
          "Seine scheinbare Scheibe ist klein, außer in der Nähe der Opposition; dann können geduldige hochauflösende Beobachtungen dunkle Albedostrukturen, die Polkappen und gelegentlich Staubstürme zeigen.",
        ],
      },
      es: {
        paragraphs: [
          "Marte es un mundo rocoso y frío cuyo polvo rico en hierro le da su color rojo. Volcanes gigantes, cañones profundos y casquetes polares dan testimonio de un pasado geológico complejo.",
          "Su disco aparente es pequeño salvo cerca de la oposición, cuando una observación paciente y de alta resolución puede revelar marcas oscuras de albedo, casquetes polares y, en ocasiones, tormentas de polvo.",
        ],
      },
      it: {
        paragraphs: [
          "Marte è un mondo roccioso e freddo, la cui polvere ricca di ferro gli dà il colore rosso. Vulcani giganteschi, canyon profondi e calotte polari testimoniano un passato geologico complesso.",
          "Il suo disco apparente è piccolo, tranne in prossimità dell’opposizione, quando un’osservazione paziente e ad alta risoluzione può rivelare scure macchie di albedo, le calotte polari e, a volte, tempeste di polvere.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Marte é um mundo rochoso e frio cuja poeira rica em ferro lhe dá a cor vermelha. Vulcões gigantes, cânions profundos e calotas polares registram um passado geológico complexo.",
          "Seu disco aparente é pequeno, exceto perto da oposição, quando uma observação paciente e de alta resolução pode revelar marcas escuras de albedo, as calotas polares e, de vez em quando, tempestades de poeira.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-jupiter",
    designation: "Jupiter",
    typeKey: "Planète",
    apparentSizeArcmin: [0.8, 0.8],
    paragraphs: {
      en: {
        paragraphs: [
          "Jupiter is the Solar System’s largest planet, a gas giant with a deep, rapidly rotating atmosphere. Its belts, zones and long-lived storms are visible even in modest instruments.",
          "The four bright Galilean moons and their moving shadows offer a changing scene from one hour to the next. The Great Red Spot is a vast storm whose visibility depends on its current rotation and contrast.",
        ],
      },
      fr: {
        paragraphs: [
          "Jupiter est la plus grande planète du Système solaire, une géante gazeuse à l’atmosphère profonde et en rotation rapide. Ses bandes, zones et tempêtes durables sont visibles même avec un instrument modeste.",
          "Les quatre lunes galiléennes brillantes et leurs ombres mobiles composent une scène qui change d’heure en heure. La Grande Tache rouge est une immense tempête dont la visibilité dépend de sa rotation et de son contraste du moment.",
        ],
      },
      ja: {
        paragraphs: [
          "木星は太陽系最大の惑星で、深く高速に回転する大気を持つ巨大ガス惑星です。縞模様、帯、長寿命の嵐は小型の機材でも見えます。",
          "明るいガリレオ衛星4個とその移動する影は、時間ごとに景色を変えます。大赤斑は巨大な嵐で、見え方は自転位相とその時々のコントラストに左右されます。",
        ],
      },
      de: {
        paragraphs: [
          "Jupiter ist der größte Planet des Sonnensystems, ein Gasriese mit einer tiefen, schnell rotierenden Atmosphäre. Seine Wolkenbänder, Zonen und langlebigen Stürme sind schon in bescheidenen Instrumenten sichtbar.",
          "Die vier hellen Galileischen Monde und ihre wandernden Schatten bieten von Stunde zu Stunde ein wechselndes Bild. Der Große Rote Fleck ist ein gewaltiger Sturm, dessen Sichtbarkeit von seiner aktuellen Rotationsstellung und seinem Kontrast abhängt.",
        ],
      },
      es: {
        paragraphs: [
          "Júpiter es el mayor planeta del Sistema Solar, un gigante gaseoso con una atmósfera profunda y de rotación rápida. Sus bandas, zonas y tormentas de larga vida son visibles incluso con instrumentos modestos.",
          "Las cuatro brillantes lunas galileanas y sus sombras en movimiento ofrecen una escena que cambia de una hora a la siguiente. La Gran Mancha Roja es una tormenta inmensa cuya visibilidad depende de su rotación y de su contraste en cada momento.",
        ],
      },
      it: {
        paragraphs: [
          "Giove è il pianeta più grande del Sistema solare, un gigante gassoso con un’atmosfera profonda e in rapida rotazione. Le sue fasce, le zone e le tempeste di lunga durata sono visibili anche con strumenti modesti.",
          "I quattro luminosi satelliti galileiani e le loro ombre in movimento offrono una scena che cambia da un’ora all’altra. La Grande Macchia Rossa è un’immensa tempesta la cui visibilità dipende dalla rotazione e dal contrasto del momento.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Júpiter é o maior planeta do Sistema Solar, um gigante gasoso com uma atmosfera profunda e de rotação rápida. Suas faixas, zonas e tempestades duradouras são visíveis até em instrumentos modestos.",
          "As quatro brilhantes luas galileanas e suas sombras em movimento oferecem uma cena que muda de uma hora para a seguinte. A Grande Mancha Vermelha é uma tempestade enorme, cuja visibilidade depende da rotação e do contraste do momento.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-saturn",
    designation: "Saturn",
    typeKey: "Planète",
    apparentSizeArcmin: [0.5, 0.5],
    paragraphs: {
      en: {
        paragraphs: [
          "Saturn is a gas giant surrounded by a broad ring system made mostly of water-ice particles. The rings are extraordinarily thin compared with their width, and their tilt changes over Saturn’s long orbit.",
          "Even a small telescope separates the planet from its rings. Larger apertures and steady air can reveal the Cassini Division, cloud belts and Titan, its largest moon.",
        ],
      },
      fr: {
        paragraphs: [
          "Saturne est une géante gazeuse entourée d’un vaste système d’anneaux composé surtout de particules de glace d’eau. Les anneaux sont extraordinairement minces par rapport à leur largeur et leur inclinaison change au cours de la longue orbite de Saturne.",
          "Même un petit télescope sépare la planète de ses anneaux. Une ouverture plus grande et une atmosphère stable peuvent révéler la division de Cassini, des bandes nuageuses et Titan, sa plus grande lune.",
        ],
      },
      ja: {
        paragraphs: [
          "土星は主に水の氷粒子からなる広大な環を持つ巨大ガス惑星です。環は幅に比べて驚くほど薄く、土星の長い公転に伴って見かけの傾きが変化します。",
          "小型望遠鏡でも惑星本体と環を分離して見ることができます。より大きな口径と安定した大気なら、カッシーニの間隙、雲の帯、最大の衛星タイタンも狙えます。",
        ],
      },
      de: {
        paragraphs: [
          "Saturn ist ein Gasriese, umgeben von einem breiten Ringsystem, das überwiegend aus Wassereisteilchen besteht. Die Ringe sind im Verhältnis zu ihrer Breite außerordentlich dünn, und ihre Neigung ändert sich im Lauf von Saturns langem Umlauf.",
          "Schon ein kleines Teleskop trennt den Planeten von seinen Ringen. Größere Öffnungen und ruhige Luft können die Cassinische Teilung, Wolkenbänder und Titan, seinen größten Mond, zeigen.",
        ],
      },
      es: {
        paragraphs: [
          "Saturno es un gigante gaseoso rodeado por un amplio sistema de anillos formado sobre todo por partículas de hielo de agua. Los anillos son extraordinariamente delgados en comparación con su anchura, y su inclinación cambia a lo largo de la larga órbita de Saturno.",
          "Incluso un telescopio pequeño separa el planeta de sus anillos. Aperturas mayores y un aire estable pueden revelar la división de Cassini, las bandas de nubes y Titán, su luna más grande.",
        ],
      },
      it: {
        paragraphs: [
          "Saturno è un gigante gassoso circondato da un ampio sistema di anelli formato soprattutto da particelle di ghiaccio d’acqua. Gli anelli sono straordinariamente sottili rispetto alla loro larghezza e la loro inclinazione cambia durante la lunga orbita di Saturno.",
          "Anche un piccolo telescopio separa il pianeta dai suoi anelli. Aperture maggiori e un’aria stabile possono rivelare la divisione di Cassini, le fasce nuvolose e Titano, il suo satellite più grande.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Saturno é um gigante gasoso cercado por um amplo sistema de anéis formado principalmente por partículas de gelo de água. Os anéis são extraordinariamente finos em comparação com sua largura, e sua inclinação muda ao longo da longa órbita de Saturno.",
          "Mesmo um telescópio pequeno separa o planeta de seus anéis. Aberturas maiores e ar estável podem revelar a Divisão de Cassini, as faixas de nuvens e Titã, sua maior lua.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-uranus",
    designation: "Uranus",
    typeKey: "Planète",
    apparentSizeArcmin: [0.1, 0.1],
    paragraphs: {
      en: {
        paragraphs: [
          "Uranus is an ice giant with an axis tilted almost onto its side, producing extreme seasonal geometry over its long year. It was the first planet discovered with a telescope.",
          "At the eyepiece it usually appears as a small blue-green disk rather than a star at sufficient magnification. Its faint rings and many moons require far more demanding observing conditions.",
        ],
      },
      fr: {
        paragraphs: [
          "Uranus est une géante de glace dont l’axe est presque couché sur le plan de son orbite, créant une géométrie saisonnière extrême au cours de sa longue année. C’est la première planète découverte au télescope.",
          "À l’oculaire, elle apparaît généralement comme un petit disque bleu-vert plutôt que comme une étoile avec un grossissement suffisant. Ses anneaux ténus et ses nombreuses lunes demandent des conditions bien plus exigeantes.",
        ],
      },
      ja: {
        paragraphs: [
          "天王星は自転軸がほぼ横倒しになった氷の巨星で、長い一年の中で極端な季節の幾何を生みます。望遠鏡によって初めて発見された惑星でもあります。",
          "十分な倍率では恒星ではなく小さな青緑色の円盤として見えます。淡い環や多くの衛星を見るには、はるかに厳しい条件が必要です。",
        ],
      },
      de: {
        paragraphs: [
          "Uranus ist ein Eisriese, dessen Achse fast auf die Seite gekippt ist, was über sein langes Jahr eine extreme Jahreszeitengeometrie hervorbringt. Er war der erste Planet, der mit einem Teleskop entdeckt wurde.",
          "Im Okular erscheint er bei ausreichender Vergrößerung meist als kleine blaugrüne Scheibe und nicht als Stern. Seine schwachen Ringe und viele Monde erfordern weitaus anspruchsvollere Beobachtungsbedingungen.",
        ],
      },
      es: {
        paragraphs: [
          "Urano es un gigante helado con el eje inclinado casi hasta quedar tumbado, lo que produce una geometría estacional extrema a lo largo de su largo año. Fue el primer planeta descubierto con un telescopio.",
          "En el ocular suele verse, con aumento suficiente, como un pequeño disco azul verdoso y no como una estrella. Sus tenues anillos y sus numerosas lunas exigen condiciones de observación mucho más exigentes.",
        ],
      },
      it: {
        paragraphs: [
          "Urano è un gigante di ghiaccio con l’asse inclinato quasi fino a giacere su un fianco, il che produce una geometria stagionale estrema nel corso del suo lungo anno. È stato il primo pianeta scoperto con un telescopio.",
          "All’oculare, con un ingrandimento sufficiente, appare di solito come un piccolo disco blu-verde e non come una stella. I suoi deboli anelli e i numerosi satelliti richiedono condizioni di osservazione molto più impegnative.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Urano é um gigante de gelo com o eixo inclinado quase até ficar deitado de lado, o que produz uma geometria sazonal extrema ao longo de seu longo ano. Foi o primeiro planeta descoberto com um telescópio.",
          "Na ocular, com aumento suficiente, costuma aparecer como um pequeno disco azul-esverdeado, e não como uma estrela. Seus anéis tênues e suas muitas luas exigem condições de observação muito mais rigorosas.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-neptune",
    designation: "Neptune",
    typeKey: "Planète",
    apparentSizeArcmin: [0.05, 0.05],
    paragraphs: {
      en: {
        paragraphs: [
          "Neptune is the most distant major planet, an ice giant whose existence was predicted from gravitational disturbances before it was observed. Its atmosphere hosts some of the fastest winds measured in the Solar System.",
          "It is a tiny blue disk in amateur instruments, but identifying it is rewarding because of its remoteness. Triton, its large retrograde moon, is often the most accessible companion target.",
        ],
      },
      fr: {
        paragraphs: [
          "Neptune est la planète majeure la plus lointaine, une géante de glace dont l’existence a été prédite à partir de perturbations gravitationnelles avant son observation. Son atmosphère abrite parmi les vents les plus rapides mesurés dans le Système solaire.",
          "Elle n’est qu’un minuscule disque bleu dans les instruments amateurs, mais son identification est gratifiante par son éloignement. Triton, sa grande lune rétrograde, est souvent son compagnon le plus accessible.",
        ],
      },
      ja: {
        paragraphs: [
          "海王星は最も遠い主要惑星で、観測前に重力擾乱から存在が予測された氷の巨星です。その大気には太陽系で測定された最速級の風が吹いています。",
          "アマチュア機材ではごく小さな青い円盤にすぎませんが、その遠さゆえに同定は魅力的です。大きな逆行衛星トリトンは、しばしば最も狙いやすい伴天体です。",
        ],
      },
      de: {
        paragraphs: [
          "Neptun ist der entfernteste große Planet, ein Eisriese, dessen Existenz aus Gravitationsstörungen vorhergesagt wurde, bevor man ihn beobachtete. In seiner Atmosphäre wehen einige der schnellsten im Sonnensystem gemessenen Winde.",
          "In Amateurinstrumenten ist er eine winzige blaue Scheibe, doch ihn zu identifizieren ist wegen seiner Entfernung besonders lohnend. Triton, sein großer rückläufiger Mond, ist oft das am leichtesten zugängliche Begleiterziel.",
        ],
      },
      es: {
        paragraphs: [
          "Neptuno es el planeta mayor más lejano, un gigante helado cuya existencia se predijo a partir de perturbaciones gravitatorias antes de que fuera observado. En su atmósfera soplan algunos de los vientos más rápidos medidos en el Sistema Solar.",
          "En instrumentos de aficionado es un diminuto disco azul, pero identificarlo resulta gratificante por su lejanía. Tritón, su gran luna retrógrada, suele ser el acompañante más accesible.",
        ],
      },
      it: {
        paragraphs: [
          "Nettuno è il pianeta maggiore più lontano, un gigante di ghiaccio la cui esistenza fu prevista dalle perturbazioni gravitazionali prima che venisse osservato. Nella sua atmosfera soffiano alcuni dei venti più veloci misurati nel Sistema solare.",
          "Con strumenti amatoriali è un minuscolo disco blu, ma identificarlo è gratificante proprio per la sua lontananza. Tritone, il suo grande satellite retrogrado, è spesso il compagno più facile da raggiungere.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Netuno é o planeta principal mais distante, um gigante de gelo cuja existência foi prevista a partir de perturbações gravitacionais antes de ser observado. Sua atmosfera abriga alguns dos ventos mais rápidos já medidos no Sistema Solar.",
          "Em instrumentos amadores é um minúsculo disco azul, mas identificá-lo é gratificante por causa de sua distância. Tritão, sua grande lua retrógrada, costuma ser o companheiro mais acessível.",
        ],
      },
    },
  }),
  entry({
    id: "solar-system-pluto",
    designation: "Pluto",
    typeKey: "Planète naine",
    apparentSizeArcmin: [0.002, 0.002],
    paragraphs: {
      en: {
        paragraphs: [
          "Pluto is a dwarf planet in the Kuiper Belt, a distant region of icy bodies beyond Neptune. Its discovery expanded the known Solar System; later discoveries helped refine the modern definition of a planet.",
          "The New Horizons flyby revealed mountains of water ice, nitrogen-ice plains and a bright heart-shaped region. It is far beyond ordinary visual observing, but remains a remarkable catalogue destination.",
        ],
      },
      fr: {
        paragraphs: [
          "Pluton est une planète naine de la ceinture de Kuiper, région lointaine de corps glacés au-delà de Neptune. Sa découverte a élargi le Système solaire connu ; d’autres découvertes ont ensuite contribué à préciser la définition moderne d’une planète.",
          "Le survol de New Horizons a révélé des montagnes de glace d’eau, des plaines d’azote glacé et une région claire en forme de cœur. Elle dépasse largement l’observation visuelle ordinaire, mais reste une destination remarquable du catalogue.",
        ],
      },
      ja: {
        paragraphs: [
          "冥王星は、海王星の外側に広がる氷天体の領域カイパーベルトにある準惑星です。その発見は既知の太陽系を広げ、その後の発見は現代の惑星定義を洗練させることにつながりました。",
          "ニュー・ホライズンズの接近観測は、水の氷の山、窒素氷の平原、明るいハート形の領域を明らかにしました。通常の眼視観測の範囲を大きく超えますが、カタログでは魅力的な行き先です。",
        ],
      },
      de: {
        paragraphs: [
          "Pluto ist ein Zwergplanet im Kuipergürtel, einer fernen Region eisiger Körper jenseits von Neptun. Seine Entdeckung erweiterte das bekannte Sonnensystem; spätere Entdeckungen trugen dazu bei, die heutige Definition eines Planeten zu schärfen.",
          "Der Vorbeiflug von New Horizons enthüllte Berge aus Wassereis, Ebenen aus Stickstoffeis und eine helle, herzförmige Region. Er liegt weit jenseits gewöhnlicher visueller Beobachtung, bleibt aber ein bemerkenswertes Katalogziel.",
        ],
      },
      es: {
        paragraphs: [
          "Plutón es un planeta enano del cinturón de Kuiper, una región lejana de cuerpos helados más allá de Neptuno. Su descubrimiento amplió el Sistema Solar conocido; hallazgos posteriores ayudaron a precisar la definición moderna de planeta.",
          "El sobrevuelo de New Horizons reveló montañas de hielo de agua, llanuras de hielo de nitrógeno y una región brillante con forma de corazón. Está muy lejos del alcance de la observación visual corriente, pero sigue siendo un destino notable del catálogo.",
        ],
      },
      it: {
        paragraphs: [
          "Plutone è un pianeta nano della fascia di Kuiper, una regione lontana di corpi ghiacciati oltre Nettuno. La sua scoperta ampliò il Sistema solare conosciuto; scoperte successive hanno contribuito a precisare la definizione moderna di pianeta.",
          "Il sorvolo della sonda New Horizons ha rivelato montagne di ghiaccio d’acqua, pianure di ghiaccio d’azoto e una luminosa regione a forma di cuore. È ben oltre la portata della comune osservazione visuale, ma resta una destinazione notevole del catalogo.",
        ],
      },
      "pt-BR": {
        paragraphs: [
          "Plutão é um planeta anão do Cinturão de Kuiper, uma região distante de corpos gelados além de Netuno. Sua descoberta ampliou o Sistema Solar conhecido; descobertas posteriores ajudaram a refinar a definição moderna de planeta.",
          "A passagem da sonda New Horizons revelou montanhas de gelo de água, planícies de gelo de nitrogênio e uma região clara em forma de coração. Está muito além da observação visual comum, mas continua sendo um destino notável do catálogo.",
        ],
      },
    },
  }),
];
import { solarSystemImageFor } from "./solar-system-image-sources.js";
