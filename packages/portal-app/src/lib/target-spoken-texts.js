// Hand-written spoken texts: the targets whose written description is
// hand-written rather than generated — the best-known showpieces of the
// research profile's "notable" layer and the solar-system bodies — get a
// spoken text written by hand, for the adult listener and for the children
// around the telescope, in the languages the spoken register is written for
// (`spokenTextLocales`, `target-spoken-register.js`).
//
// Register rules, the same as the generated path: sentences short enough to
// be said in one breath (25 words in English and French, 40 characters in
// Japanese), no parenthesis, no catalogue shorthand, numbers and names
// written as they are said. The children's text keeps the object's name and
// its kind and nothing else from the glossary, with concrete comparisons and
// no figure that needs a unit lesson.
//
// `adult` replaces the notable sentence of a showpiece inside its generated
// spoken text; for a solar-system body (`whole: true`) both texts are the
// whole spoken text. Keys: a designation's lookup key (`M31`, `NGC1499`,
// `B33`) or a solar-system target's id.

const solarSystem = {
  "solar-system-sun": {
    fr: {
      adult: [
        "Le Soleil est l’étoile au centre de notre système de planètes. Dans son cœur, la fusion des atomes produit l’énergie qui nous éclaire.",
        "Ses taches, ses protubérances et ses éruptions changent de jour en jour. Ne l’observez jamais sans un filtre solaire adapté, bien installé.",
      ],
      children: [
        "Le Soleil est une étoile, la plus proche de nous. Il est si grand qu’on pourrait y ranger plus d’un million de Terres.",
        "Attention : ne le regardez jamais directement, ni à l’œil, ni dans un télescope, sans une protection spéciale.",
      ],
    },
    en: {
      adult: [
        "The Sun is the star at the centre of our planetary system. In its core, the fusion of atoms makes the energy that lights our days.",
        "Its sunspots, prominences and flares change from day to day. Never observe it without a proper solar filter, correctly fitted.",
      ],
      children: [
        "The Sun is a star, the closest one to us. It is so big that more than a million Earths could fit inside.",
        "Careful: never look straight at it, with your eyes or a telescope, without special protection.",
      ],
    },
    ja: {
      adult: [
        "太陽は、惑星たちの中心にある恒星です。中心での核融合が、わたしたちを照らすエネルギーを生んでいます。",
        "黒点やプロミネンスは、日ごとに変わります。必ず専用の太陽フィルターを正しくつけて観察してください。",
      ],
      children: [
        "太陽は、わたしたちにいちばん近い星です。地球が100万個以上も入るほど大きいです。",
        "目でも望遠鏡でも、特別な道具なしで見てはいけません。",
      ],
    },
  },
  "solar-system-moon": {
    fr: {
      adult: [
        "La Lune est le seul satellite naturel de la Terre. Ses mers sombres sont d’anciennes coulées de lave, ses zones claires de vieux plateaux couverts de cratères.",
        "Le long de la limite entre le jour et la nuit, les ombres font ressortir le relief.",
      ],
      children: [
        "La Lune tourne autour de la Terre. Ses taches sombres sont de grandes plaines de lave refroidie.",
        "Regardez le bord de l’ombre : on y voit les cratères comme en relief.",
      ],
    },
    en: {
      adult: [
        "The Moon is Earth’s only natural satellite. Its dark seas are old lava flows, and its bright areas are ancient highlands full of craters.",
        "Along the line between day and night, shadows bring out the relief.",
      ],
      children: [
        "The Moon travels around the Earth. Its dark patches are wide plains of cooled lava.",
        "Look at the edge of the shadow: the craters seem to pop out.",
      ],
    },
    ja: {
      adult: [
        "月は、地球のただひとつの天然の衛星です。暗い海は昔の溶岩の流れで、明るい所はクレーターの多い高地です。",
        "昼と夜の境目では、影が地形をくっきり見せます。",
      ],
      children: [
        "月は、地球のまわりを回っています。黒っぽいもようは、冷えて固まった溶岩の平原です。",
        "影の境目を見ると、クレーターがうかびあがって見えます。",
      ],
    },
  },
  "solar-system-mercury": {
    fr: {
      adult: [
        "Mercure est la planète la plus proche du Soleil. Elle reste toujours près de lui dans le ciel : on la cherche bas, juste après le coucher ou avant le lever du Soleil.",
        "Comme la Lune, elle montre des phases.",
      ],
      children: [
        "Mercure est la planète la plus proche du Soleil, et la plus petite. Une année sur Mercure ne dure que quatre-vingt-huit jours !",
      ],
    },
    en: {
      adult: [
        "Mercury is the planet closest to the Sun. It always stays near the Sun in our sky: look for it low, just after sunset or before sunrise.",
        "Like the Moon, it shows phases.",
      ],
      children: [
        "Mercury is the planet closest to the Sun, and the smallest one. A year on Mercury lasts only eighty-eight days!",
      ],
    },
    ja: {
      adult: [
        "水星は、太陽にいちばん近い惑星です。空ではいつも太陽の近くにあり、日の入り直後か日の出前の低い空で探します。",
        "月のように満ち欠けします。",
      ],
      children: [
        "水星は、太陽にいちばん近くて、いちばん小さい惑星です。水星の1年は、たった88日です。",
      ],
    },
  },
  "solar-system-venus": {
    fr: {
      adult: [
        "Vénus est la planète la plus brillante du ciel, après la Lune. Ses nuages épais renvoient la lumière du Soleil et cachent entièrement sa surface.",
        "Dans un instrument, elle montre des phases, comme la Lune.",
      ],
      children: [
        "Vénus est si brillante qu’on l’appelle l’étoile du Berger, mais c’est une planète. Sous ses nuages, il fait plus chaud que dans un four !",
      ],
    },
    en: {
      adult: [
        "Venus is the brightest planet in the sky, after the Moon. Its thick clouds reflect sunlight and hide its surface completely.",
        "Through a telescope, it shows phases, like the Moon.",
      ],
      children: [
        "Venus is so bright that people call it the evening star, but it is a planet. Under its clouds, it is hotter than an oven!",
      ],
    },
    ja: {
      adult: [
        "金星は、月を除けば空でいちばん明るい天体です。厚い雲が太陽の光を反射し、地表をすっかりかくしています。",
        "望遠鏡では、月のように満ち欠けして見えます。",
      ],
      children: [
        "金星はとても明るく、よいの明星とも呼ばれます。雲の下は、オーブンよりも熱いのです。",
      ],
    },
  },
  "solar-system-earth": {
    fr: {
      adult: [
        "La Terre est la planète rocheuse, couverte d’océans, depuis laquelle nous observons. Son atmosphère et son champ magnétique nous protègent.",
      ],
      children: [
        "La Terre, c’est chez nous ! Pour la voir, il suffit de regarder autour de vous.",
      ],
    },
    en: {
      adult: [
        "The Earth is the rocky, ocean-covered planet we observe from. Its atmosphere and magnetic field protect us.",
      ],
      children: ["The Earth is our home! To see it, just look around you."],
    },
    ja: {
      adult: [
        "地球は、わたしたちが観測している、海におおわれた岩石の惑星です。大気と磁場が、わたしたちを守っています。",
      ],
      children: [
        "地球は、わたしたちのおうちです。見たいときは、まわりを見わたしてみましょう。",
      ],
    },
  },
  "solar-system-mars": {
    fr: {
      adult: [
        "Mars est une planète rocheuse et froide, rouge à cause de la rouille de ses poussières. Quand elle est au plus près de la Terre, on voit ses calottes polaires et ses régions sombres.",
      ],
      children: [
        "Mars est la planète rouge : sa poussière est pleine de rouille. Des robots roulent à sa surface et nous envoient des photos.",
      ],
    },
    en: {
      adult: [
        "Mars is a cold, rocky planet, red because its dust is full of rust. When it comes closest to Earth, its polar caps and dark regions show.",
      ],
      children: [
        "Mars is the red planet: its dust is full of rust. Robots drive across its surface and send us pictures.",
      ],
    },
    ja: {
      adult: [
        "火星は、冷たい岩石の惑星で、さびたちりのために赤く見えます。地球に近づくと、極冠や暗いもようが見えてきます。",
      ],
      children: [
        "火星は赤い惑星です。すなは、さびでいっぱいです。ロボットが走り回って、写真を送ってくれています。",
      ],
    },
  },
  "solar-system-jupiter": {
    fr: {
      adult: [
        "Jupiter est la plus grande planète du Système solaire, une géante de gaz. Ses bandes et ses tempêtes se voient même avec un petit instrument.",
        "Ses quatre grandes lunes changent de place d’heure en heure.",
      ],
      children: [
        "Jupiter est la plus grosse planète : plus de mille Terres tiendraient dedans. Regardez les petits points à côté : ce sont ses lunes, qui tournent autour d’elle.",
      ],
    },
    en: {
      adult: [
        "Jupiter is the largest planet in the Solar System, a giant made of gas. Its bands and storms show even in a small telescope.",
        "Its four large moons change places from hour to hour.",
      ],
      children: [
        "Jupiter is the biggest planet: more than a thousand Earths would fit inside. Look at the little dots beside it: they are its moons, going around it.",
      ],
    },
    ja: {
      adult: [
        "木星は、太陽系でいちばん大きなガスの惑星です。しまもようや嵐は、小さな望遠鏡でも見えます。",
        "4つの大きな衛星は、時間ごとに位置を変えます。",
      ],
      children: [
        "木星はいちばん大きな惑星で、地球が千個以上も入ります。横の小さな点は、木星のまわりを回る月たちです。",
      ],
    },
  },
  "solar-system-saturn": {
    fr: {
      adult: [
        "Saturne est une géante de gaz entourée d’anneaux de glace et de roche. Même un petit instrument montre ses anneaux.",
        "Leur inclinaison change d’une année à l’autre.",
      ],
      children: [
        "Saturne est la planète aux anneaux. Ses anneaux sont faits de milliards de morceaux de glace, petits comme des cailloux ou grands comme des maisons.",
      ],
    },
    en: {
      adult: [
        "Saturn is a gas giant circled by rings of ice and rock. Even a small telescope shows its rings.",
        "Their tilt changes from year to year.",
      ],
      children: [
        "Saturn is the planet with rings. Its rings are made of billions of pieces of ice, some as small as pebbles and some as big as houses.",
      ],
    },
    ja: {
      adult: [
        "土星は、氷と岩の環にかこまれたガスの惑星です。小さな望遠鏡でも環が見えます。",
        "環のかたむきは、年ごとに変わります。",
      ],
      children: [
        "土星は、わっかのある惑星です。わっかは、小石や家くらいの大きさの、たくさんの氷のかけらでできています。",
      ],
    },
  },
  "solar-system-uranus": {
    fr: {
      adult: [
        "Uranus est une géante de glace qui tourne presque couchée sur le côté. Dans un instrument, elle paraît comme un petit disque bleu-vert.",
      ],
      children: [
        "Uranus est une planète bleu-vert qui roule couchée sur le côté, comme une bille. Elle est si loin qu’un tour du Soleil lui prend quatre-vingt-quatre ans.",
      ],
    },
    en: {
      adult: [
        "Uranus is an ice giant that spins almost on its side. Through a telescope, it looks like a small blue-green disc.",
      ],
      children: [
        "Uranus is a blue-green planet that rolls on its side, like a marble. It is so far away that one trip around the Sun takes it eighty-four years.",
      ],
    },
    ja: {
      adult: [
        "天王星は、ほとんど横だおしで回る氷の惑星です。望遠鏡では、小さな青緑色の円盤に見えます。",
      ],
      children: [
        "天王星は、ビー玉のように横だおしで転がる青緑色の惑星です。太陽のまわりを1周するのに84年もかかります。",
      ],
    },
  },
  "solar-system-neptune": {
    fr: {
      adult: [
        "Neptune est la planète la plus lointaine. Son existence a été prédite par le calcul, avant qu’on la voie.",
        "Ses vents sont parmi les plus rapides du Système solaire.",
      ],
      children: [
        "Neptune est la planète la plus lointaine, toute bleue. On l’a d’abord trouvée avec des calculs, avant de la voir dans un télescope !",
      ],
    },
    en: {
      adult: [
        "Neptune is the most distant planet. Its existence was predicted by calculation before anyone saw it.",
        "Its winds are among the fastest in the Solar System.",
      ],
      children: [
        "Neptune is the most distant planet, deep blue. It was found with calculations first, before anyone saw it through a telescope!",
      ],
    },
    ja: {
      adult: [
        "海王星は、いちばん遠い惑星です。見つかる前に、計算によって存在が予言されました。",
        "その風は、太陽系でも最も速いものの一つです。",
      ],
      children: [
        "海王星は、いちばん遠くにある青い惑星です。望遠鏡で見つかる前に、計算で見つけられました。",
      ],
    },
  },
  "solar-system-pluto": {
    fr: {
      adult: [
        "Pluton est une planète naine de la ceinture de Kuiper, au-delà de Neptune. Sa découverte a aidé à préciser ce qu’est une planète.",
      ],
      children: [
        "Pluton est une petite planète naine, toute glacée, très loin au-delà de Neptune. En 2015, une sonde a photographié un grand cœur sur sa surface.",
      ],
    },
    en: {
      adult: [
        "Pluto is a dwarf planet in the Kuiper belt, beyond Neptune. Its discovery helped define what a planet is.",
      ],
      children: [
        "Pluto is a small, icy dwarf planet, far beyond Neptune. In twenty fifteen, a space probe photographed a big heart on its surface.",
      ],
    },
    ja: {
      adult: [
        "冥王星は、海王星の外側のカイパーベルトにある準惑星です。その発見は、惑星とは何かを決めるきっかけになりました。",
      ],
      children: [
        "冥王星は、海王星よりずっと遠くにある、氷の小さな準惑星です。2015年、探査機が表面の大きなハートのもようを写しました。",
      ],
    },
  },
};

// The showpieces of the research profile's notable layer: `adult` replaces
// the written notable sentence, `children` the generated comparison of the
// object's kind.
const showpieces = {
  M31: {
    fr: {
      adult: [
        "C’est la grande galaxie la plus proche de la nôtre, à environ deux millions et demi d’années-lumière. Elle se rapproche de la Voie lactée.",
        "Dans les années vingt, on y a repéré des étoiles variables : on a compris alors que c’était une autre galaxie.",
      ],
      children: [
        "C’est la grande voisine de notre galaxie. Sa lumière a voyagé deux millions et demi d’années pour arriver jusqu’à nos yeux.",
        "Par une nuit bien noire, on la voit même sans télescope, comme une petite tache floue.",
      ],
    },
    en: {
      adult: [
        "It is the nearest large galaxy to our own, about two and a half million light-years away. It is moving towards the Milky Way.",
        "In the nineteen-twenties, variable stars found inside it showed that it is a separate galaxy.",
      ],
      children: [
        "It is our galaxy’s big neighbour. Its light travelled for two and a half million years to reach our eyes.",
        "On a very dark night, you can even see it without a telescope, as a small fuzzy patch.",
      ],
    },
    ja: {
      adult: [
        "わたしたちの銀河に最も近い大きな銀河で、距離は約250万光年です。天の川銀河に近づいてきています。",
        "1920年代、その中の変光星の観測から、別の銀河だと分かりました。",
      ],
      children: [
        "わたしたちの銀河の、大きなおとなりさんです。その光は、250万年かけてここまで届きました。",
        "とても暗い夜なら、望遠鏡なしでもぼんやり見えます。",
      ],
    },
  },
  M42: {
    fr: {
      adult: [
        "Elle se trouve à environ 1350 années-lumière. C’est l’une des pouponnières d’étoiles massives les plus proches de nous.",
        "Au centre, les étoiles chaudes du Trapèze font briller le gaz. Autour des jeunes étoiles, des disques forment peut-être des planètes.",
      ],
      children: [
        "C’est une pouponnière d’étoiles : des milliers d’étoiles toutes neuves y naissent. Au milieu, quatre étoiles très chaudes, le Trapèze, éclairent le nuage.",
        "On la devine même sans télescope, sous la ceinture d’Orion.",
      ],
    },
    en: {
      adult: [
        "It lies about 1350 light-years away. It is one of the nearest places where massive stars are born.",
        "At its heart, the hot Trapezium stars make the gas glow. Discs around its young stars may be forming planets.",
      ],
      children: [
        "It is a star nursery: thousands of brand-new stars are being born there. In the middle, four very hot stars, the Trapezium, light up the cloud.",
        "You can even spot it without a telescope, below Orion’s belt.",
      ],
    },
    ja: {
      adult: [
        "距離は約1350光年です。大質量星が生まれる場所として、最も近いもののひとつです。",
        "中心のトラペジウムの高温の星が、ガスを光らせています。若い星のまわりの円盤では、惑星が生まれているかもしれません。",
      ],
      children: [
        "星の赤ちゃんが生まれる、星のゆりかごです。まんなかでは、とても熱い4つの星がガスを照らしています。",
        "オリオン座の三つ星の下に、目だけでもうっすら見えます。",
      ],
    },
  },
  M1: {
    fr: {
      adult: [
        "Ce sont les restes de l’explosion d’une étoile, observée en 1054. En son centre tourne un pulsar, l’étoile à neutrons laissée par l’explosion.",
        "Il fournit l’énergie qui fait briller les filaments en expansion.",
      ],
      children: [
        "C’est ce qui reste d’une étoile qui a explosé. Il y a presque mille ans, des astronomes chinois ont vu cette explosion, même en plein jour !",
        "Au centre, une toute petite étoile tourne sur elle-même trente fois par seconde.",
      ],
    },
    en: {
      adult: [
        "It is what remains of a star that exploded, seen from Earth in ten fifty-four. At its centre spins a pulsar, the neutron star left by the explosion.",
        "It powers the glow of the expanding filaments.",
      ],
      children: [
        "It is what is left of a star that exploded. Almost a thousand years ago, Chinese astronomers saw the explosion, even in daylight!",
        "In the middle, a tiny star spins around thirty times every second.",
      ],
    },
    ja: {
      adult: [
        "1054年に観測された、星の爆発の残骸です。中心にはパルサーがあり、爆発で残った中性子星です。",
        "そのエネルギーが、広がるガスの筋を光らせています。",
      ],
      children: [
        "爆発した星の、のこりかすです。千年ほど前、中国の天文学者が昼間でも見えたこの爆発を記録しました。",
        "まんなかでは、小さな星が1秒に30回もまわっています。",
      ],
    },
  },
  M45: {
    fr: {
      adult: [
        "Les Pléiades sont un jeune amas d’étoiles, à environ 445 années-lumière. Le voile bleu des photos est de la poussière que l’amas traverse.",
        "Elle renvoie la lumière des étoiles chaudes.",
      ],
      children: [
        "On les appelle aussi les Sept Sœurs. Ce sont de jeunes étoiles bleues, nées ensemble.",
        "Avec de bons yeux, on en compte six ou sept sans télescope.",
      ],
    },
    en: {
      adult: [
        "The Pleiades are a young star cluster, about 445 light-years away. The blue haze in photos is dust the cluster is passing through.",
        "It reflects the light of the hot stars.",
      ],
      children: [
        "They are also called the Seven Sisters. They are young blue stars, born together.",
        "With good eyes, you can count six or seven of them without a telescope.",
      ],
    },
    ja: {
      adult: [
        "プレアデス星団は、約445光年先の若い星団です。写真の青いもやは、星団が通り抜けているちりです。",
        "高温の星の光を反射しています。",
      ],
      children: [
        "日本ではすばると呼ばれています。いっしょに生まれた、若くて青い星たちです。",
        "目のいい人なら、望遠鏡なしで6つか7つ数えられます。",
      ],
    },
  },
  M51: {
    fr: {
      adult: [
        "Elle est en interaction avec une petite galaxie voisine, NGC 5195. Cette rencontre renforce ses bras spiraux et fait naître des étoiles.",
      ],
      children: [
        "C’est une galaxie en forme de tourbillon, qui tient la main d’une petite galaxie voisine.",
        "En passant tout près, la petite voisine a dessiné ses grands bras.",
      ],
    },
    en: {
      adult: [
        "It is interacting with a small neighbouring galaxy, NGC 5195. This encounter strengthens its spiral arms and triggers the birth of stars.",
      ],
      children: [
        "It is a galaxy shaped like a whirlpool, holding hands with a small neighbour.",
        "As it passed close by, the little neighbour drew its long arms.",
      ],
    },
    ja: {
      adult: [
        "小さな隣の銀河、エヌジーシー5195と影響し合っています。この出会いが渦巻きの腕を強め、星を生み出しています。",
      ],
      children: [
        "うずまきの形をした銀河で、小さな銀河と手をつないでいます。",
        "小さなおとなりがそばを通り、長い腕をえがきました。",
      ],
    },
  },
  M57: {
    fr: {
      adult: [
        "À environ 2300 années-lumière, c’est l’enveloppe rejetée par une étoile comme le Soleil. Sa forme d’anneau dépend de l’angle sous lequel on la voit.",
        "Au centre, une naine blanche éclaire le gaz.",
      ],
      children: [
        "Elle ressemble à un petit anneau de fumée dans le ciel. C’est la dernière bulle soufflée par une étoile comme le Soleil, à la fin de sa vie.",
      ],
    },
    en: {
      adult: [
        "About 2300 light-years away, it is the envelope cast off by a star like the Sun. Its ring shape depends on the angle we see it from.",
        "At its centre, a white dwarf lights up the gas.",
      ],
      children: [
        "It looks like a little smoke ring in the sky. It is the last bubble blown by a star like our Sun, at the end of its life.",
      ],
    },
    ja: {
      adult: [
        "約2300光年先にある、太陽に似た星が放った外層です。リングに見えるのは、見る向きのためでもあります。",
        "中心の白色矮星が、ガスを照らしています。",
      ],
      children: [
        "空にうかぶ、小さなけむりの輪のように見えます。太陽のような星が、最後にふきだしたガスの泡です。",
      ],
    },
  },
  M81: {
    fr: {
      adult: [
        "Elle appartient à un groupe de galaxies voisin, à environ douze millions d’années-lumière. Sa rencontre passée avec Messier 82 a remué le gaz de tout le groupe.",
      ],
      children: [
        "C’est une belle galaxie en spirale, qui a une voisine très agitée, Messier 82. Leur lumière a voyagé douze millions d’années pour arriver jusqu’à nous.",
      ],
    },
    en: {
      adult: [
        "It belongs to a nearby group of galaxies, about twelve million light-years away. Its past encounter with Messier 82 stirred up the gas of the whole group.",
      ],
      children: [
        "It is a beautiful spiral galaxy with a very restless neighbour, Messier 82. Their light travelled for twelve million years to reach us.",
      ],
    },
    ja: {
      adult: [
        "約1200万光年先の、近くの銀河群に属しています。メシエ82との過去の出会いが、銀河群のガスをかき回しました。",
      ],
      children: [
        "きれいなうずまき銀河で、となりには元気なメシエ82がいます。その光は、1200万年かけてここまで届きました。",
      ],
    },
  },
  M82: {
    fr: {
      adult: [
        "C’est une galaxie où les étoiles naissent à un rythme exceptionnel. Sa rencontre avec Messier 81 a poussé du gaz vers son centre.",
        "Des vents d’étoiles et des explosions en chassent maintenant la matière.",
      ],
      children: [
        "Dans cette galaxie, des étoiles naissent sans arrêt, beaucoup plus vite que chez nous. Elle souffle même de grands jets de gaz rouge, comme une cheminée.",
      ],
    },
    en: {
      adult: [
        "It is a galaxy where stars are born at an exceptional pace. Its encounter with Messier 81 pushed gas towards its centre.",
        "Stellar winds and explosions now drive matter out.",
      ],
      children: [
        "In this galaxy, stars are being born all the time, much faster than in ours. It even blows out huge plumes of red gas, like a chimney.",
      ],
    },
    ja: {
      adult: [
        "星が非常に速いペースで生まれている銀河です。メシエ81との出会いで、ガスが中心に集まりました。",
        "恒星風と爆発が、物質を外へ吹き出しています。",
      ],
      children: [
        "この銀河では、わたしたちの銀河よりずっと速く星が生まれています。えんとつのように、赤いガスをふき出しています。",
      ],
    },
  },
  M104: {
    fr: {
      adult: [
        "Elle associe un bulbe brillant, un disque mince et une bande de poussière très nette. Cette forme aide à comparer les étoiles et le gaz des galaxies à gros bulbe.",
      ],
      children: [
        "On l’appelle le Sombrero, parce qu’elle ressemble à un chapeau mexicain vu de côté. Une ligne sombre de poussière lui fait comme un ruban.",
      ],
    },
    en: {
      adult: [
        "It combines a bright bulge, a thin disc and a very sharp lane of dust. Its shape helps compare stars and gas in galaxies with large bulges.",
      ],
      children: [
        "It is called the Sombrero, because it looks like a Mexican hat seen from the side. A dark line of dust wraps around it like a ribbon.",
      ],
    },
    ja: {
      adult: [
        "明るいバルジ、薄い円盤、くっきりしたちりの帯を持つ銀河です。大きなバルジを持つ銀河の、星とガスを比べるのに役立ちます。",
      ],
      children: [
        "横から見たメキシコのぼうしに似ているので、ソンブレロと呼ばれます。黒いちりの線が、リボンのように巻いています。",
      ],
    },
  },
  B33: {
    fr: {
      adult: [
        "La Tête de cheval appartient au grand nuage d’Orion, à environ 1500 années-lumière. Elle se découpe devant la lueur rouge d’IC 434.",
        "Le rayonnement d’étoiles voisines, comme Sigma d’Orion, sculpte sa forme.",
      ],
      children: [
        "Regardez bien : ce nuage sombre a exactement la forme d’une tête de cheval ! Il se découpe sur un rideau de gaz rouge, comme une ombre chinoise.",
      ],
    },
    en: {
      adult: [
        "The Horsehead belongs to the great Orion cloud, about 1500 light-years away. It stands out against the red glow of IC 434.",
        "Light from nearby stars, such as Sigma Orionis, sculpts its shape.",
      ],
      children: [
        "Look closely: this dark cloud has exactly the shape of a horse’s head! It stands out against a curtain of red gas, like a shadow puppet.",
      ],
    },
    ja: {
      adult: [
        "馬頭星雲は、約1500光年先のオリオン座の大きな雲の一部です。アイシー434の赤い光を背景に、影のように見えます。",
        "シグマ・オリオニスなど近くの星の光が、形をけずっています。",
      ],
      children: [
        "よく見ると、この黒い雲は馬の頭の形をしています。赤いガスのカーテンの前で、影絵のようにうかんでいます。",
      ],
    },
  },
  NGC1499: {
    fr: {
      adult: [
        "C’est un long filament d’hydrogène qui brille. L’étoile très chaude Xi de Persée le fait briller.",
        "Il est si étendu que les grands champs le montrent le mieux.",
      ],
      children: [
        "Ce nuage de gaz rouge a la forme de la Californie, un État d’Amérique. Il est très grand dans le ciel, mais très pâle : il faut une photo pour bien le voir.",
      ],
    },
    en: {
      adult: [
        "It is a long filament of glowing hydrogen. The very hot star Xi Persei makes it shine.",
        "It is so large that wide fields show it best.",
      ],
      children: [
        "This cloud of red gas has the shape of California, a state in America. It is very big in the sky, but very faint: you need a photo to really see it.",
      ],
    },
    ja: {
      adult: [
        "光る水素の長い筋です。高温の星ペルセウス座クシー星が、これを光らせています。",
        "とても大きいので、広い範囲を写すと最もよく見えます。",
      ],
      children: [
        "アメリカのカリフォルニア州に形が似た、赤いガスの雲です。空ではとても大きいけれど、とても淡いので、写真で見るのがいちばんです。",
      ],
    },
  },
};

export const spokenHandTexts = Object.freeze({
  ...Object.fromEntries(
    Object.entries(solarSystem).map(([key, value]) => [
      key,
      { ...value, whole: true },
    ]),
  ),
  ...showpieces,
});
