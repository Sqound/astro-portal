import { commonNamesMore } from "./locale-names-more.js";

// Local display labels for the named entries outside the curated planner list.
// OpenNGC's `Common names` are retained as searchable source aliases, but they
// are English-only and occasionally list several historical alternatives.
type LocalizedLabel = Record<string, string | undefined> & {
  fr: string;
  en: string;
  ja: string;
};
// One entry per designation: `[fr, en, ja]`, then optionally an object with
// the names of the other interface locales (`{ de, es, it, "pt-BR" }`, keyed
// by the registry's tag). A locale absent from that object reads the English
// name, never the French one.
type CommonNameEntry =
  | readonly [string, string, string]
  | readonly [string, string, string, Record<string, string>];
type CommonNameLabels = Record<string, CommonNameEntry>;
type NamedTarget = {
  designation?: string;
  aliases?: readonly string[];
  commonNames?: readonly string[];
};

export const targetCommonNameLabels: CommonNameLabels = {
  Sun: [
    "Soleil",
    "Sun",
    "太陽",
    { de: "Sonne", es: "Sol", it: "Sole", "pt-BR": "Sol" },
  ],
  Moon: [
    "Lune",
    "Moon",
    "月",
    { de: "Mond", es: "Luna", it: "Luna", "pt-BR": "Lua" },
  ],
  Mercury: [
    "Mercure",
    "Mercury",
    "水星",
    { de: "Merkur", es: "Mercurio", it: "Mercurio", "pt-BR": "Mercúrio" },
  ],
  Venus: [
    "Vénus",
    "Venus",
    "金星",
    { de: "Venus", es: "Venus", it: "Venere", "pt-BR": "Vênus" },
  ],
  Earth: [
    "Terre",
    "Earth",
    "地球",
    { de: "Erde", es: "Tierra", it: "Terra", "pt-BR": "Terra" },
  ],
  Mars: [
    "Mars",
    "Mars",
    "火星",
    { de: "Mars", es: "Marte", it: "Marte", "pt-BR": "Marte" },
  ],
  Jupiter: [
    "Jupiter",
    "Jupiter",
    "木星",
    { de: "Jupiter", es: "Júpiter", it: "Giove", "pt-BR": "Júpiter" },
  ],
  Saturn: [
    "Saturne",
    "Saturn",
    "土星",
    { de: "Saturn", es: "Saturno", it: "Saturno", "pt-BR": "Saturno" },
  ],
  Uranus: [
    "Uranus",
    "Uranus",
    "天王星",
    { de: "Uranus", es: "Urano", it: "Urano", "pt-BR": "Urano" },
  ],
  Neptune: [
    "Neptune",
    "Neptune",
    "海王星",
    { de: "Neptun", es: "Neptuno", it: "Nettuno", "pt-BR": "Netuno" },
  ],
  Pluto: [
    "Pluton",
    "Pluto",
    "冥王星",
    { de: "Pluto", es: "Plutón", it: "Plutone", "pt-BR": "Plutão" },
  ],
  "IC 348": [
    "Nuage d'Omicron Persei",
    "Omicron Persei Cloud",
    "ペルセウス座オミクロン星雲",
  ],
  "IC 349": [
    "Nébuleuse de Mérope de Barnard",
    "Barnard's Merope Nebula",
    "バーナードのメローペ星雲",
    {
      de: "Barnards Merope-Nebel",
      es: "Nebulosa de Mérope de Barnard",
      it: "Nebulosa Merope di Barnard",
      "pt-BR": "Nebulosa de Mérope de Barnard",
    },
  ],
  "IC 2220": [
    "Nébuleuse de la Cruche de Toby",
    "Toby Jug Nebula",
    "トビー・ジャグ星雲",
  ],
  "IC 2391": [
    "Amas d'Omicron de la Voile",
    "Omicron Velorum Cluster",
    "ほ座オミクロン星団",
  ],
  "IC2431 NED02": ["Browning", "Browning", "ブラウニング"],
  "IC 2574": [
    "Nébuleuse de Coddington",
    "Coddington's Nebula",
    "コディントン星雲",
    {
      de: "Coddingtons Nebel",
      es: "Nebulosa de Coddington",
      it: "Nebulosa di Coddington",
      "pt-BR": "Nebulosa de Coddington",
    },
  ],
  "IC 2602": [
    "Amas de Thêta de la Carène",
    "Theta Carinae Cluster",
    "りゅうこつ座シータ星団",
  ],
  "IC 2944": [
    "Nébuleuse de Lambda du Centaure",
    "Lambda Centauri Nebula",
    "ケンタウルス座ラムダ星雲",
  ],
  "IC 4604": [
    "Nébuleuse de Rho Ophiuchi",
    "Rho Ophiuchi Nebula",
    "へびつかい座ロー星雲",
  ],
  "IC 4703": [
    "Nébuleuse de l'Aigle",
    "Eagle Nebula",
    "わし星雲",
    {
      de: "Adlernebel",
      es: "Nebulosa del Águila",
      it: "Nebulosa Aquila",
      "pt-BR": "Nebulosa da Águia",
    },
  ],
  M24: [
    "Petit nuage stellaire du Sagittaire",
    "Small Sagittarius Star Cloud",
    "いて座小星雲",
    {
      de: "Kleine Sagittarius-Sternwolke",
      es: "Pequeña nube estelar de Sagitario",
      it: "Piccola nube stellare del Sagittario",
      "pt-BR": "Pequena nuvem estelar de Sagitário",
    },
  ],
  "IC 5070": [
    "Nébuleuse du Pélican",
    "Pelican Nebula",
    "ペリカン星雲",
    {
      de: "Pelikannebel",
      es: "Nebulosa del Pelícano",
      it: "Nebulosa Pellicano",
      "pt-BR": "Nebulosa do Pelicano",
    },
  ],
  "NGC 40": ["Nébuleuse du Nœud papillon", "Bow-Tie Nebula", "蝶ネクタイ星雲"],
  "NGC 104": [
    "Amas 47 du Toucan",
    "47 Tucanae Cluster",
    "きょしちょう座47球状星団",
  ],
  "NGC 292": [
    "Petit Nuage de Magellan",
    "Small Magellanic Cloud",
    "小マゼラン雲",
    {
      de: "Kleine Magellansche Wolke",
      es: "Pequeña Nube de Magallanes",
      it: "Piccola Nube di Magellano",
      "pt-BR": "Pequena Nuvem de Magalhães",
    },
  ],
  "NGC 457": [
    "Amas du Hibou",
    "Owl Cluster",
    "ふくろう星団",
    {
      de: "Eulenhaufen",
      es: "Cúmulo del Búho",
      it: "Ammasso del Gufo",
      "pt-BR": "Aglomerado da Coruja",
    },
  ],
  "NGC 869": [
    "Double amas de Persée",
    "Double Cluster in Perseus",
    "ペルセウス座二重星団",
    {
      de: "Doppelhaufen im Perseus",
      es: "Cúmulo doble de Perseo",
      it: "Doppio ammasso del Perseo",
      "pt-BR": "Aglomerado duplo de Perseu",
    },
  ],
  "NGC 884": [
    "Double amas de Persée",
    "Double Cluster in Perseus",
    "ペルセウス座二重星団",
    {
      de: "Doppelhaufen im Perseus",
      es: "Cúmulo doble de Perseo",
      it: "Doppio ammasso del Perseo",
      "pt-BR": "Aglomerado duplo de Perseu",
    },
  ],
  "NGC 1049": [
    "Amas 3 de la galaxie naine du Fourneau",
    "Fornax Dwarf Cluster 3",
    "ろ座矮小銀河第3球状星団",
  ],
  "NGC 1275": ["Persée A", "Perseus A", "ペルセウス座A"],
  "NGC 1316": ["Fourneau A", "Fornax A", "ろ座A"],
  "NGC 1317": ["Fourneau B", "Fornax B", "ろ座B"],
  "NGC 1432": [
    "Nébuleuse de Maia",
    "Maia Nebula",
    "マイア星雲",
    {
      de: "Maia-Nebel",
      es: "Nebulosa de Maia",
      it: "Nebulosa di Maia",
      "pt-BR": "Nebulosa de Maia",
    },
  ],
  "NGC 1435": [
    "Nébuleuse de Mérope",
    "Merope Nebula",
    "メローペ星雲",
    {
      de: "Merope-Nebel",
      es: "Nebulosa de Mérope",
      it: "Nebulosa di Merope",
      "pt-BR": "Nebulosa de Mérope",
    },
  ],
  "NGC 1555": [
    "Nébuleuse de Hind",
    "Hind's Nebula",
    "ハインド星雲",
    {
      de: "Hinds Nebel",
      es: "Nebulosa de Hind",
      it: "Nebulosa di Hind",
      "pt-BR": "Nebulosa de Hind",
    },
  ],
  "NGC 1909": [
    "Nébuleuse de la Tête de sorcière",
    "Witch Head Nebula",
    "魔女の横顔星雲",
    {
      de: "Hexenkopfnebel",
      es: "Nebulosa Cabeza de Bruja",
      it: "Nebulosa Testa di Strega",
      "pt-BR": "Nebulosa da Cabeça de Bruxa",
    },
  ],
  "NGC 1977": [
    "Nébuleuse de l'Homme qui court",
    "Running Man Nebula",
    "走る人星雲",
    {
      de: "Laufender-Mann-Nebel",
      es: "Nebulosa del Hombre Corriendo",
      "pt-BR": "Nebulosa do Homem Correndo",
    },
  ],
  "NGC 1980": [
    "Partie basse de l'Épée d'Orion",
    "Lower Sword",
    "オリオンの剣の下部",
    {
      de: "Unteres Schwert",
      es: "Espada inferior",
      it: "Spada inferiore",
      "pt-BR": "Espada inferior",
    },
  ],
  "NGC 1981": [
    "Partie haute de l'Épée d'Orion",
    "Upper Sword",
    "オリオンの剣の上部",
    {
      de: "Oberes Schwert",
      es: "Espada superior",
      it: "Spada superiore",
      "pt-BR": "Espada superior",
    },
  ],
  "NGC 1990": ["Alnilam", "Alnilam", "アルニラム"],
  "NGC 2070": [
    "Nébuleuse de la Tarentule",
    "Tarantula Nebula",
    "タランチュラ星雲",
    {
      de: "Tarantelnebel",
      es: "Nebulosa de la Tarántula",
      it: "Nebulosa Tarantola",
      "pt-BR": "Nebulosa da Tarântula",
    },
  ],
  "NGC 2238": [
    "Nébuleuse de la Rosette",
    "Rosette Nebula",
    "ばら星雲",
    {
      de: "Rosettennebel",
      es: "Nebulosa de la Roseta",
      it: "Nebulosa Rosetta",
      "pt-BR": "Nebulosa Roseta",
    },
  ],
  "NGC 2246": [
    "Nébuleuse de la Rosette",
    "Rosette Nebula",
    "ばら星雲",
    {
      de: "Rosettennebel",
      es: "Nebulosa de la Roseta",
      it: "Nebulosa Rosetta",
      "pt-BR": "Nebulosa Roseta",
    },
  ],
  "NGC 2261": [
    "Nébuleuse de Hubble",
    "Hubble's Nebula",
    "ハッブルの変光星雲",
    {
      de: "Hubbles Nebel",
      es: "Nebulosa de Hubble",
      it: "Nebulosa di Hubble",
      "pt-BR": "Nebulosa de Hubble",
    },
  ],
  "NGC 2301": ["Grand amas de l'Oiseau", "Great Bird Cluster", "大鳥星団"],
  "NGC 2360": ["Amas de Caroline", "Caroline's Cluster", "キャロライン星団"],
  "NGC 2392": [
    "Nébuleuse du Clown",
    "Clown Face Nebula",
    "NGC 2392",
    {
      de: "NGC 2392",
      es: "Nebulosa Cara de Payaso",
      it: "Nebulosa Clown",
      "pt-BR": "Nebulosa Cara de Palhaço",
    },
  ],
  "NGC 2537": ["Galaxie de la Patte d'ours", "Bear-Paw Galaxy", "熊の足跡銀河"],
  "NGC 2573": ["Polarissima Australis", "Polarissima Australis", "南極星"],
  M44: [
    "Amas de la Crèche",
    "Beehive Cluster",
    "プレセペ星団",
    {
      de: "Krippe",
      es: "Cúmulo de la Colmena",
      it: "Presepe",
      "pt-BR": "Aglomerado da Colmeia",
    },
  ],
  "NGC 2685": ["Galaxie de l'Hélice", "Helix Galaxy", "らせん銀河"],
  "NGC 2736": [
    "Nébuleuse du Crayon",
    "Pencil Nebula",
    "鉛筆星雲",
    {
      de: "Bleistiftnebel",
      es: "Nebulosa del Lápiz",
      it: "Nebulosa Matita",
      "pt-BR": "Nebulosa do Lápis",
    },
  ],
  "NGC 3115": [
    "Galaxie du Fuseau",
    "Spindle Galaxy",
    "紡錘銀河",
    {
      de: "Spindelgalaxie",
      es: "Galaxia del Huso",
      it: "Galassia Fuso",
      "pt-BR": "Galáxia do Fuso",
    },
  ],
  "NGC 3132": ["Nébuleuse des Huit Éclats", "Eight-Burst Nebula", "八裂星雲"],
  "NGC 3172": ["Polarissima Borealis", "Polarissima Borealis", "北極星"],
  "NGC 3242": ["Fantôme de Jupiter", "Jupiter's Ghost Nebula", "木星状星雲"],
  "NGC 3372": [
    "Nébuleuse de la Carène",
    "Carina Nebula",
    "りゅうこつ座大星雲",
    {
      de: "Carinanebel",
      es: "Nebulosa de Carina",
      it: "Nebulosa della Carena",
      "pt-BR": "Nebulosa de Carina",
    },
  ],
  "NGC 3532": [
    "Amas du Puits aux souhaits",
    "Wishing Well Cluster",
    "願いの井戸星団",
  ],
  "NGC 3561": ["La Guitare", "The Guitar", "ギター"],
  "NGC 3766": ["Amas de la Perle", "Pearl Cluster", "真珠星団"],
  "NGC 3918": [
    "Nébuleuse planétaire bleue",
    "Blue Planetary Nebula",
    "青い惑星状星雲",
    {
      de: "Blauer planetarischer Nebel",
      es: "Nebulosa planetaria azul",
      it: "Nebulosa planetaria blu",
      "pt-BR": "Nebulosa planetária azul",
    },
  ],
  "NGC 3928": [
    "Spirale miniature",
    "Miniature Spiral",
    "ミニチュア渦巻銀河",
    {
      de: "Miniaturspirale",
      es: "Espiral en miniatura",
      it: "Spirale in miniatura",
      "pt-BR": "Espiral em miniatura",
    },
  ],
  "NGC 4038": [
    "Galaxies des Antennes",
    "Antennae Galaxies",
    "アンテナ銀河",
    {
      de: "Antennengalaxien",
      es: "Galaxias de las Antenas",
      it: "Galassie delle Antenne",
      "pt-BR": "Galáxias das Antenas",
    },
  ],
  "NGC 4039": [
    "Galaxies des Antennes",
    "Antennae Galaxies",
    "アンテナ銀河",
    {
      de: "Antennengalaxien",
      es: "Galaxias de las Antenas",
      it: "Galassie delle Antenne",
      "pt-BR": "Galáxias das Antenas",
    },
  ],
  M99: [
    "Moulinet de la Chevelure",
    "Coma Pinwheel Galaxy",
    "かみのけ座回転花火銀河",
  ],
  "NGC 4435": ["Les Yeux", "The Eyes Galaxies", "目玉銀河"],
  "NGC 4438": ["Les Yeux", "The Eyes Galaxies", "目玉銀河"],
  "NGC 4567": [
    "Galaxies Papillon",
    "Butterfly Galaxies",
    "蝶々銀河",
    {
      de: "Schmetterlingsgalaxien",
      es: "Galaxias Mariposa",
      it: "Galassie Farfalla",
      "pt-BR": "Galáxias Borboleta",
    },
  ],
  "NGC 4568": [
    "Galaxies Papillon",
    "Butterfly Galaxies",
    "蝶々銀河",
    {
      de: "Schmetterlingsgalaxien",
      es: "Galaxias Mariposa",
      it: "Galassie Farfalla",
      "pt-BR": "Galáxias Borboleta",
    },
  ],
  "NGC 4609": ["Amas du Sac de charbon", "Coalsack Cluster", "石炭袋星団"],
  "NGC 4651": [
    "Galaxie du Parapluie",
    "Umbrella Galaxy",
    "傘銀河",
    {
      de: "Regenschirmgalaxie",
      es: "Galaxia del Paraguas",
      it: "Galassia Ombrello",
      "pt-BR": "Galáxia do Guarda-Chuva",
    },
  ],
  "NGC 4676": [
    "Galaxies des Souris",
    "Mice Galaxies",
    "ねずみ銀河",
    {
      de: "Mäusegalaxien",
      es: "Galaxias de los Ratones",
      it: "Galassie dei Topi",
      "pt-BR": "Galáxias dos Ratos",
    },
  ],
  "NGC 4755": [
    "Boîte à bijoux de Herschel",
    "Herschel's Jewel Box",
    "宝石箱星団",
    {
      de: "Herschels Schmuckkästchen",
      es: "Joyero de Herschel",
      it: "Scrigno di Gioielli di Herschel",
      "pt-BR": "Caixa de Joias de Herschel",
    },
  ],
  "NGC 4990": ["Galaxie du Cocon", "Cocoon Galaxy", "繭銀河"],
  "NGC 5128": ["Centaure A", "Centaurus A", "ケンタウルス座A"],
  "NGC 5139": ["Oméga du Centaure", "Omega Centauri", "オメガ星団"],
  M83: [
    "Moulinet austral",
    "Southern Pinwheel Galaxy",
    "南の回転花火銀河",
    {
      de: "Südliche Feuerradgalaxie",
      es: "Galaxia del Molinillo Austral",
      it: "Galassia Girandola Australe",
      "pt-BR": "Galáxia do Catavento do Sul",
    },
  ],
  "NGC 6087": ["Amas de S de la Règle", "S Normae Cluster", "じょうぎ座S星団"],
  "NGC 6188": ["Nébuleuse du Rebord", "Rim Nebula", "縁星雲"],
  "NGC 6302": ["Nébuleuse de l'Insecte", "Bug Nebula", "虫星雲"],
  "NGC 6309": ["Nébuleuse de la Boîte", "Box Nebula", "箱星雲"],
  "NGC 6357": [
    "Nébuleuse de la Guerre et de la Paix",
    "War and Peace Nebula",
    "戦争と平和星雲",
    {
      de: "Krieg-und-Frieden-Nebel",
      es: "Nebulosa Guerra y Paz",
      it: "Nebulosa Guerra e Pace",
      "pt-BR": "Nebulosa Guerra e Paz",
    },
  ],
  "NGC 6369": [
    "Petit Fantôme",
    "Little Ghost Nebula",
    "小さな幽霊星雲",
    {
      de: "Kleiner Geisternebel",
      es: "Nebulosa del Pequeño Fantasma",
      it: "Nebulosa Piccolo Fantasma",
      "pt-BR": "Nebulosa do Pequeno Fantasma",
    },
  ],
  "NGC 6445": [
    "Petite Gemme",
    "Little Gem Nebula",
    "小さな宝石星雲",
    {
      de: "Kleiner Edelsteinnebel",
      es: "Nebulosa de la Pequeña Gema",
      it: "Nebulosa Piccola Gemma",
      "pt-BR": "Nebulosa da Pequena Gema",
    },
  ],
  "NGC 6537": [
    "Nébuleuse de l'Araignée rouge",
    "Red Spider Nebula",
    "赤い蜘蛛星雲",
    {
      de: "Roter Spinnennebel",
      es: "Nebulosa de la Araña Roja",
      it: "Nebulosa Ragno Rosso",
      "pt-BR": "Nebulosa da Aranha Vermelha",
    },
  ],
  "NGC 6741": ["Traînée fantôme", "Phantom Streak Nebula", "幻の筋星雲"],
  "NGC 6818": [
    "Petite Gemme",
    "Little Gem Nebula",
    "小さな宝石星雲",
    {
      de: "Kleiner Edelsteinnebel",
      es: "Nebulosa de la Pequeña Gema",
      it: "Nebulosa Piccola Gemma",
      "pt-BR": "Nebulosa da Pequena Gema",
    },
  ],
  "NGC 6819": [
    "Amas de la Tête de renard",
    "Foxhead Cluster",
    "キツネの頭星団",
  ],
  "NGC 6822": [
    "Galaxie de Barnard",
    "Barnard's Galaxy",
    "バーナード銀河",
    {
      de: "Barnards Galaxie",
      es: "Galaxia de Barnard",
      it: "Galassia di Barnard",
      "pt-BR": "Galáxia de Barnard",
    },
  ],
  "NGC 6826": [
    "Nébuleuse Clignotante",
    "Blinking Planetary Nebula",
    "点滅惑星状星雲",
    {
      de: "Blinkender planetarischer Nebel",
      es: "Nebulosa planetaria parpadeante",
      it: "Nebulosa planetaria intermittente",
      "pt-BR": "Nebulosa planetária piscante",
    },
  ],
  "NGC 6905": [
    "Nébuleuse de l'Éclair bleu",
    "Blue Flash Nebula",
    "青い閃光星雲",
  ],
  "NGC 6946": [
    "Galaxie du Feu d'artifice",
    "Fireworks Galaxy",
    "花火銀河",
    {
      de: "Feuerwerksgalaxie",
      es: "Galaxia de los Fuegos Artificiales",
      it: "Galassia dei Fuochi d’Artificio",
      "pt-BR": "Galáxia dos Fogos de Artifício",
    },
  ],
  "NGC 6960": [
    "Dentelles du Cygne occidentales",
    "Western Veil Nebula",
    "西の網状星雲",
    {
      de: "Westlicher Schleiernebel",
      es: "Nebulosa del Velo occidental",
      it: "Nebulosa Velo occidentale",
      "pt-BR": "Nebulosa do Véu ocidental",
    },
  ],
  "NGC 6992": [
    "Dentelles du Cygne orientales",
    "Eastern Veil Nebula",
    "東の網状星雲",
    {
      de: "Östlicher Schleiernebel",
      es: "Nebulosa del Velo oriental",
      it: "Nebulosa Velo orientale",
      "pt-BR": "Nebulosa do Véu oriental",
    },
  ],
  "NGC 6995": [
    "Dentelles du Cygne orientales",
    "Eastern Veil Nebula",
    "東の網状星雲",
    {
      de: "Östlicher Schleiernebel",
      es: "Nebulosa del Velo oriental",
      it: "Nebulosa Velo orientale",
      "pt-BR": "Nebulosa do Véu oriental",
    },
  ],
  "NGC 7009": [
    "Nébuleuse de Saturne",
    "Saturn Nebula",
    "土星状星雲",
    {
      de: "Saturnnebel",
      es: "Nebulosa de Saturno",
      it: "Nebulosa Saturno",
      "pt-BR": "Nebulosa de Saturno",
    },
  ],
  "NGC 7114": [
    "Nova Cygni de Schmidt",
    "Schmidt's Nova Cygni",
    "シュミットのはくちょう座新星",
  ],
  "NGC 7662": [
    "Boule de neige bleue de Copeland",
    "Copeland's Blue Snowball",
    "コープランドの青い雪玉星雲",
    {
      de: "Copelands Blauer Schneeball",
      es: "Bola de Nieve Azul de Copeland",
      it: "Palla di Neve Blu di Copeland",
      "pt-BR": "Bola de Neve Azul de Copeland",
    },
  ],
  B033: [
    "Nébuleuse de la Tête de cheval",
    "Horsehead Nebula",
    "馬頭星雲",
    {
      de: "Pferdekopfnebel",
      es: "Nebulosa Cabeza de Caballo",
      it: "Nebulosa Testa di Cavallo",
      "pt-BR": "Nebulosa Cabeça de Cavalo",
    },
  ],
  C009: [
    "Nébuleuse de la Grotte",
    "Cave Nebula",
    "洞窟星雲",
    {
      de: "Höhlennebel",
      es: "Nebulosa de la Cueva",
      it: "Nebulosa Grotta",
      "pt-BR": "Nebulosa da Caverna",
    },
  ],
  C014: [
    "Double amas de Persée",
    "Double Cluster",
    "ペルセウス座二重星団",
    {
      de: "Doppelhaufen",
      es: "Cúmulo doble",
      it: "Doppio ammasso",
      "pt-BR": "Aglomerado duplo",
    },
  ],
  C041: [
    "Hyades",
    "Hyades",
    "ヒアデス星団",
    { de: "Hyaden", es: "Híades", it: "Iadi", "pt-BR": "Híades" },
  ],
  C099: [
    "Nébuleuse du Sac de charbon",
    "Coalsack Nebula",
    "石炭袋星雲",
    {
      de: "Kohlensack",
      es: "Nebulosa Saco de Carbón",
      it: "Nebulosa Sacco di Carbone",
      "pt-BR": "Nebulosa do Saco de Carvão",
    },
  ],
  Cl399: [
    "Amas de Brocchi",
    "Brocchi's Cluster",
    "ブロッキ星団",
    {
      de: "Brocchis Haufen",
      es: "Cúmulo de Brocchi",
      it: "Ammasso di Brocchi",
      "pt-BR": "Aglomerado de Brocchi",
    },
  ],
  "ESO056-115": [
    "Grand Nuage de Magellan",
    "Large Magellanic Cloud",
    "大マゼラン雲",
    {
      de: "Große Magellansche Wolke",
      es: "Gran Nube de Magallanes",
      it: "Grande Nube di Magellano",
      "pt-BR": "Grande Nuvem de Magalhães",
    },
  ],
  "ESO097-013": [
    "Galaxie du Compas",
    "Circinus Galaxy",
    "コンパス座銀河",
    {
      de: "Circinus-Galaxie",
      es: "Galaxia del Compás",
      it: "Galassia del Compasso",
      "pt-BR": "Galáxia do Compasso",
    },
  ],
  "ESO270-017": [
    "Fourcade-Figueroa",
    "Fourcade-Figueroa",
    "フルカデ＝フィゲロア銀河",
  ],
  "ESO351-030": [
    "Galaxie naine elliptique du Sculpteur",
    "Sculptor Dwarf Elliptical",
    "ちょうこくしつ座矮小楕円銀河",
    {
      de: "Elliptische Zwerggalaxie im Bildhauer",
      es: "Galaxia enana elíptica del Escultor",
      it: "Galassia nana ellittica dello Scultore",
      "pt-BR": "Galáxia anã elíptica do Escultor",
    },
  ],
  "ESO356-004": [
    "Galaxie naine sphéroïdale du Fourneau",
    "Fornax Dwarf Spheroidal",
    "ろ座矮小楕円銀河",
    {
      de: "Sphäroidale Zwerggalaxie in Fornax",
      es: "Galaxia enana esferoidal de Fornax",
      it: "Galassia nana sferoidale della Fornace",
      "pt-BR": "Galáxia anã esferoidal de Fornax",
    },
  ],
  HCG079: [
    "Sextette de Seyfert",
    "Seyfert's Sextet",
    "セイファートの六つ子銀河",
    {
      de: "Seyferts Sextett",
      es: "Sexteto de Seyfert",
      it: "Sestetto di Seyfert",
      "pt-BR": "Sexteto de Seyfert",
    },
  ],
  HCG092: [
    "Quintette de Stephan",
    "Stephan's Quintet",
    "ステファンの五つ子銀河",
    {
      de: "Stephans Quintett",
      es: "Quinteto de Stephan",
      it: "Quintetto di Stephan",
      "pt-BR": "Quinteto de Stephan",
    },
  ],
  Mel111: [
    "Amas de la Chevelure de Bérénice",
    "Coma Star Cluster",
    "かみのけ座星団",
    {
      de: "Coma-Sternhaufen",
      es: "Cúmulo de la Cabellera de Berenice",
      it: "Ammasso della Chioma di Berenice",
      "pt-BR": "Aglomerado da Cabeleira de Berenice",
    },
  ],
  PGC000143: [
    "Galaxie de Wolf-Lundmark-Melotte",
    "Wolf-Lundmark-Melotte Galaxy",
    "ウルフ・ルンドマルク・メロッテ銀河",
    {
      de: "Wolf-Lundmark-Melotte-Galaxie",
      es: "Galaxia de Wolf-Lundmark-Melotte",
      it: "Galassia di Wolf-Lundmark-Melotte",
      "pt-BR": "Galáxia de Wolf-Lundmark-Melotte",
    },
  ],
  PGC029653: ["Sextant A", "Sextans A", "ろくぶんぎ座A"],
  PGC088608: [
    "Galaxie naine sphéroïdale du Sextant",
    "Sextans Dwarf Spheroidal",
    "ろくぶんぎ座矮小楕円銀河",
    {
      de: "Sphäroidale Zwerggalaxie in Sextans",
      es: "Galaxia enana esferoidal de Sextans",
      it: "Galassia nana sferoidale del Sestante",
      "pt-BR": "Galáxia anã esferoidal de Sextans",
    },
  ],
  UGC05373: ["Sextant B", "Sextans B", "ろくぶんぎ座B"],
  UGC05470: ["Lion I", "Leo I", "しし座I"],
};

const localized = (
  value: CommonNameEntry,
  designation: string,
): LocalizedLabel => ({
  ...(value.length > 3 ? value[3] : {}),
  fr: value[0],
  en: value[1],
  ja: value[2],
  ...commonNamesMore[designation],
});

function lookupFor(
  labels: CommonNameLabels | null | undefined,
): Map<string, LocalizedLabel> {
  return new Map(
    Object.entries(labels || {}).map(([designation, value]) => [
      designation.replaceAll(/\s+/g, "").toUpperCase(),
      localized(value, designation),
    ]),
  );
}

const lookup = lookupFor(targetCommonNameLabels);

// The merged lookup for one instance label document, built once per document
// object: a catalogue page presents a thousand targets against the same
// labels, and rebuilding this map for each of them cost ≈0.2 s per page.
const mergedLookups = new WeakMap<object, Map<string, LocalizedLabel>>();

function mergedLookupFor(
  labels: CommonNameLabels | null | undefined,
): Map<string, LocalizedLabel> {
  if (!labels || labels === targetCommonNameLabels) return lookup;
  let merged = mergedLookups.get(labels);
  if (!merged) {
    merged = lookupFor({ ...targetCommonNameLabels, ...labels });
    mergedLookups.set(labels, merged);
  }
  return merged;
}

export function localizedTargetCommonName(
  target: NamedTarget,
  locale = "en",
  labels: CommonNameLabels = targetCommonNameLabels,
): string | null {
  const keys = [target.designation, ...(target.aliases || [])]
    .filter(Boolean)
    .map((value) => String(value).replaceAll(/\s+/g, "").toUpperCase());
  // Instance data can contain an older, partial version of this reference
  // document.  Keep it authoritative where it has an entry, while retaining
  // the built-in labels for records added in a later application release
  // (notably the solar-system catalogue).
  const values = mergedLookupFor(labels);
  const label = keys.map((key) => values.get(key)).find(Boolean);
  return label?.[locale] || label?.en || target.commonNames?.[0] || null;
}
