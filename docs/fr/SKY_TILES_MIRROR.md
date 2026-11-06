# Miroir de tuiles du ciel

Le fond de ciel photographique du planificateur (tuiles HiPS) est servi
depuis un cache que cette instance conserve elle-même, en amont de la
distribution HiPS propre au CDS, plutôt que chaque client
téléchargeant les tuiles en masse directement depuis le CDS. C'est une
décision délibérée, pas un détail d'implémentation : un portail est
auto-hébergé, donc c'est la bande passante de cette instance et le budget de
politesse de cette instance qui sont dépensés, jamais ceux du CDS, une fois
qu'une tuile a été récupérée une fois. Définir
`ASTRO_PORTAL_SKY_TILE_MIRROR=off` désactive entièrement le miroir — voir
[Licences](#licences) pour les raisons qui justifieraient ce choix.

## Licences

Trois droits distincts sont en jeu, et ce miroir n'en résout aucun à la place
d'un opérateur :

- Le **tuilage HiPS lui-même** (la pyramide d'images pré-découpées et
  pré-projetées que publie le CDS) est distribué sous licence **ODbL-1.0**
  (Open Database License).
- L'**imagerie DSS** dont sont extraites les tuiles reste sous son propre
  copyright : **Caltech, AAO, SERC/PPARC, AURA**. Le Digitized Sky Survey
  n'est pas du domaine public.
- **L'opérateur de ce portail est responsable de l'usage qu'il fait des
  deux.** Miroiter des tuiles pour un usage personnel ou en petit groupe est
  une chose ; redistribuer une copie empaquetée de l'imagerie au public est
  une question différente, à laquelle ce document ne répond pas.

`ASTRO_PORTAL_SKY_TILE_MIRROR=off` est le levier pour une instance qui n'a
pas encore tranché cette question : il retire entièrement le composant
`sky-backdrop` de `GET /v1/offline-pack`, et chaque route sous
`/api/v1/sky-tiles/` répond `404`. Rien d'autre dans le portail n'est
affecté.

La table des relevés (`packages/portal/src/sky-tiles/surveys.js`) garde la
couche de tuiles indépendante d'un relevé donné : elle porte l'URL amont, la
chaîne d'attribution, la licence et son URL pour le relevé configuré, si bien
que basculer vers un relevé sous une licence différente plus tard est un
changement de table, pas une réécriture.

## Routes

```text
GET /api/v1/sky-tiles/{survey}/Norder{n}/Dir{d}/Npix{p}.{jpg|png}   une tuile miroir
GET /api/v1/sky-tiles/{survey}/Norder{n}/Chunk{c}/{pix}.tar         une archive agrégée
GET /api/v1/sky-tiles/{survey}/properties                          le fichier properties HiPS du relevé
```

`{survey}` est résolu **uniquement** dans la table serveur
`skyBackdropSurveys` — jamais concaténé depuis la requête — et `[...path]`
est entièrement validé par `parseSkyTileRequestPath`
(`packages/portal/src/sky-tiles/geometry.js`) avant que quoi que ce soit ne
touche le système de fichiers ou le réseau : traversée de chemin, ordre
au-delà du `maxOrder` du relevé, `pix` hors bornes pour son ordre, `Dir`
incohérent avec `pix`, extension ne correspondant pas au format du relevé, et
adresse d'archive malformée sont tous refusés en `404`
`sky_tiles_path_invalid`, sur le même modèle que la liste blanche par regex
de `packages/portal-app/src/routes/api/stellarium/milkyway/[...path]/route.js`.

### Agrégation en archives

Une archive contient toutes les tuiles d'ordre `n` sous une cellule ancêtre
`archiveChunkDelta` ordres plus haut (`4` par défaut) : `4^archiveChunkDelta`
tuiles, soit 256 pour le delta par défaut — le poids exact dépend de l'ordre
(voir [Taille moyenne de tuile par ordre](#taille-moyenne-de-tuile-par-ordre)
plus bas : les tuiles DSS colour grossissent aux ordres profonds, d'environ
14 Mio par archive de 256 tuiles à l'ordre 4 à environ 24 Mio à l'ordre 6).
Les ordres en dessous d'`archiveChunkDelta` (0 à 3 par défaut) n'ont pas
chacun leur propre archive par ordre ; ils sont regroupés dans **une seule
archive fixe et cumulative** (1 020 tuiles, ≈42,8 Mio pour DSS colour —
44 856 832 o mesurés), adressée via la même forme d'URL que
toute autre archive en fixant `order == chunkOrder == archiveChunkDelta - 1`
et `chunkPix == 0` — pour le delta par défaut de 4, cela donne
`Norder3/Chunk3/0.tar`. Cela garde un `archiveUrlTemplate` unique et
uniforme dans le manifeste du pack hors ligne plutôt qu'une URL à traiter
comme un cas particulier ; un client qui ignore ce cas particulier résout
tout de même une URL fonctionnelle rien qu'à partir d'`archiveChunkDelta` et
de la règle générale. Le manifeste énonce en plus cette adresse
explicitement, de façon additive, sous `sky-backdrop.lowOrderArchive`
(`{ order, chunkOrder, chunkPix, tiles }`), pour un client qui préférerait la
lire plutôt que la dériver.

Nombre de requêtes d'archives/tuiles par ordre maximal cumulé
(`archiveChunkDelta = 4`) — `standard` (additif) se place entre
`essential` et `comfort` :

| palier      | ordre max | tuiles cumulées | archives | requêtes d'archives |
| ----------- | --------: | --------------: | -------: | ------------------: |
| `essential` |         3 |           1 020 |        1 |                   1 |
| `standard`  |         4 |           4 092 |       13 |                  13 |
| `comfort`   |         5 |          16 380 |       61 |                  61 |
| `quality`   |         6 |          65 532 |      253 |                 253 |

### Taille moyenne de tuile par ordre

**Propre à DSS colour — ces chiffres ne se généralisent pas à un autre
relevé.** Une seule constante « taille moyenne de tuile » était autrefois
documentée, mesurée une fois à l'ordre 3 du ciel entier. Remplir le miroir
pour de vrai, ordre par ordre, a montré que c'était faux au-delà de l'ordre
3 : **la taille de tuile croît avec l'ordre**, si bien que cette constante
unique sous-estimait fortement `comfort` et `quality`.
`packages/portal/src/sky-tiles/surveys.js`'s `dssColourMeanTileBytesByOrder`
documente désormais une moyenne **par ordre** :

| ordre | octets moyens/tuile | comment mesuré                                   |
| ----: | ------------------: | ------------------------------------------------ |
|     0 |              48 467 | **exact** — recensement complet, 12/12 tuiles    |
|     1 |              43 093 | **exact** — recensement complet, 48/48 tuiles    |
|     2 |              41 740 | **exact** — recensement complet, 192/192 tuiles  |
|     3 |              43 507 | **exact** — recensement complet, 768/768 tuiles  |
|     4 |              54 519 | échantillon — 150 sur 3 072 tuiles, graine fixe  |
|     5 |              75 403 | échantillon — 150 sur 12 288 tuiles, graine fixe |
|     6 |              92 750 | échantillon — 150 sur 49 152 tuiles, graine fixe |

Tout mesuré contre le vrai miroir du CDS (via
`alaskybis.cds.unistra.fr`, 4 connexions simultanées). Le recensement des
ordres 0 à 3 vient du remplissage complet du palier `essential` (1 020
tuiles, 44 077 440 o de tuiles réelles, en 1 min 22 s) ; les ordres 4 à 6
viennent d'un échantillon aléatoire de 150 tuiles par ordre
(`prepare-sky-tile-pack.mjs --sample`, une graine fixe pour qu'une nouvelle
mesure soit reproductible et comparable) — pas un recensement complet, donc
la vraie moyenne du ciel entier pourrait différer légèrement. Les tuiles les
plus denses de l'échantillon, dans la Voie lactée, pesaient 166-232 Kio —
bien au-dessus même de la moyenne de l'ordre 6, donc le téléchargement réel
d'un appareil peut dépasser ce que ces moyennes seules prédisent. Un ordre
au-delà de cette table (7+ ; aucun palier actuel n'y va) n'a jamais été
mesuré — `dssColourMeanTileBytesForOrder` extrapole la même tendance de
croissance (ordre 5 → 6, ×1,230) plutôt que de supposer un plateau.

L'`estimatedBytes` de chaque palier (tant qu'il n'est pas `ready` — voir
[plus bas](#le-composant-sky-backdrop-du-manifeste-du-pack-hors-ligne)) vaut
Σ(nombre de tuiles à l'ordre × moyenne de cet ordre, pour chaque ordre
couvert par le palier) **plus le vrai surcoût de l'archive tar** : un en-tête
de 512 octets et un bourrage estimé à un demi-bloc par entrée de tuile (la
taille des images tombe de façon effectivement uniforme sur la frontière de
512 octets, donc un demi-bloc est le bourrage attendu — confirmé contre le
vrai surcoût de `Norder3/Chunk3/0.tar`, 779 392 o mesurés contre 784 384 o
prédits par cette formule, une marge de 0,6 %), plus un marqueur de fin à
deux blocs par fichier d'archive (`tarArchiveOverheadBytes`,
`packages/portal/src/sky-tiles/surveys.js`) — jamais un pourcentage deviné.

Tailles de palier qui en résultent (DSS colour, `archiveChunkDelta = 4`,
depuis la table ci-dessus) :

| palier      | ordre max | tuiles cumulées | archives | taille estimée        |
| ----------- | --------: | --------------: | -------: | --------------------- |
| `essential` |         3 |           1 020 |        1 | ≈ 42,8 Mio            |
| `standard`  |         4 |           4 092 |       13 | ≈ 204,8 Mio (0,2 Gio) |
| `comfort`   |         5 |          16 380 |       61 | ≈ 1,07 Gio            |
| `quality`   |         6 |          65 532 |      253 | ≈ 5,35 Gio            |

Une fois un palier réellement `ready` (toutes ses archives construites), sa
taille annoncée cesse d'être une estimation — voir
[plus bas](#le-composant-sky-backdrop-du-manifeste-du-pack-hors-ligne).

### Intégrité

Toute réponse binaire — une tuile, une archive, ou `properties` — porte un
`ETag: "sha256-<hex>"` fort (le sha-256 du corps exact de la réponse) et un
`Content-Length` ; un `If-None-Match` correspondant répond `304`. Il n'existe
pas de liste de sommes de contrôle figée, puisqu'une archive peut être
construite paresseusement à la première demande : le condensé est toujours
calculé contre les octets réels sur disque. Un client qui télécharge une
tuile ou une archive doit vérifier son propre sha-256 contre l'`ETag` reçu.

Les réponses sont diffusées en flux depuis le disque (`ReadableStream` sur un
`fs.ReadStream`), jamais entièrement chargées en mémoire — une archive peut
faire plusieurs dizaines de mégaoctets.

### Cache-Control

Une tuile HiPS est immuable — la garantie du relevé lui-même, un `Npix` donné
à un ordre donné est la même image pour toujours — elle est donc servie avec
`Cache-Control: public, max-age=31536000, immutable` et n'est **jamais
revalidée** contre l'amont une fois en cache. `properties` est la seule
exception : il peut légitimement changer dans le temps, il est donc revalidé
tous les 30 jours (`public, max-age=2592000`) et un amont indisponible
retombe sur la dernière copie valide plutôt que d'échouer franchement.

### Protocole de construction d'archive (`503`)

Construire une archive froide prend un temps réel : à la latence propre du
CDS (~0,9 s) et la politesse par défaut de ce miroir (4 connexions
simultanées), une archive de 256 tuiles prend environ une minute et
l'archive cumulative de 1 020 tuiles environ quatre minutes. Rien dans ce
miroir ne bloque jamais une requête là-dessus.

La **première** requête pour une archive absente du disque démarre sa
construction en arrière-plan (single-flight par archive — une deuxième,
troisième, … requête simultanée pour la même archive ne démarre jamais une
deuxième construction) et répond dès que la construction sait lesquelles de
ses tuiles sont déjà sur disque (au plus une seconde plus tard ; un `stat`
par tuile) :

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 37
Content-Type: application/json

{ "error": { "code": "sky_tiles_archive_building", "message": "…" },
  "code": "sky_tiles_archive_building", "retryAfterSeconds": 37,
  "done": 84, "total": 256,
  "progress": { "done": 84, "total": 256, "upstreamRemaining": 160 } }
```

`code`, `retryAfterSeconds`, `done` et `total` répètent, en tête du
corps, ce que disent l'enveloppe et `progress` : c'est là que le transport
d'un client les lit. `Retry-After` ne compte que les tuiles
qui doivent vraiment venir du CDS (`upstreamRemaining`), placées derrière
celles des constructions commencées avant celle-ci, au rythme que le CDS a
réellement tenu dans ce processus (moyenne glissante dès huit tuiles
récupérées, 0,9 s par tuile et par connexion avant cela), plus environ 10 ms
par tuile déjà sur disque. Une archive dont toutes les tuiles sont en cache —
une construction reprise après un redémarrage, puisque les tuiles récupérées
avant sont conservées — s'annonce en secondes, pas en minutes.

Chaque requête pendant que la construction est en cours reçoit la même
réponse, avec `progress` et `Retry-After` mis à jour selon l'état réel —
jamais de boucle serrée, jamais de deuxième construction. Une construction
perdue par un redémarrage ou une mise en veille laisse ses tuiles, et au pire
un fichier `.part` vide, que la construction suivante ignore et remplace. Une fois l'archive
complète sur disque, elle répond `200` comme n'importe quelle autre archive.
Si le relevé amont échoue durablement pendant la construction, le miroir
répond `503` `sky_tiles_upstream_unavailable` avec un délai `Retry-After`
plutôt que de relancer immédiatement.

Une tuile pas encore en cache est récupérée à la volée (pas d'état
`building` pour une seule tuile — récupérer une tuile est une seule requête,
pas des milliers) ; un amont qui échoue durablement répond le même
`sky_tiles_upstream_unavailable`.

Une archive est toujours construite à partir des tuiles déjà présentes dans
le cache du miroir lorsqu'elles y sont : parcourir la carte (qui récupère des
tuiles individuelles) puis télécharger une archive ne re-télécharge jamais ce
que la navigation a déjà mis en cache.

## Politesse envers le CDS

Tout ici est de la configuration, pas une constante figée :

- **Un sémaphore unique, global au processus**, partagé par chaque
  récupération de tuile et chaque construction d'archive —
  `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY` (défaut `4`). Une archive en
  cours de construction n'ouvre jamais plus de connexions vers le CDS que
  cette limite ne le permet, quel que soit le nombre de tuiles qu'il lui
  reste à récupérer ; une requête de tuile et une construction d'archive se
  partagent le même budget.
- Un **`User-Agent` auto-identifiant** :
  `astro-portal/<version> (self-hosted HiPS mirror; +<dépôt public de ce
projet>)` par défaut, surchargeable par `ASTRO_PORTAL_UPSTREAM_USER_AGENT`.
  Jamais d'adresse personnelle par défaut.
- Un **repli exponentiel borné** sur les réponses amont `429` et `5xx`
  (quelques tentatives, délai plafonné), et un délai d'attente par requête
  amont. Jamais de boucle de nouvelle tentative sans fin : un échec durable
  est rapporté à l'appelant en `503` avec un `Retry-After`, jamais retenté
  indéfiniment côté serveur.
- Les tuiles ne sont **jamais revalidées** une fois en cache (voir
  [Cache-Control](#cache-control) ci-dessus) — la plus grande réduction de
  requêtes sortantes que fait ce miroir, puisque le CDS n'est sollicité pour
  un `Npix` donné qu'une seule fois, à jamais, par instance.

## Racines amont en miroir

**Pourquoi une liste de racines.** L'hôte HiPS principal du CDS,
`alasky.cds.unistra.fr`, a un jour cessé d'accepter toute connexion — pas une réponse
lente ni une erreur, une connexion TCP qui n'aboutit jamais. Avant le
correctif de cette section, chaque requête de tuile payait encore la boucle
de nouvelles tentatives sur un seul hôte en entier (quatre tentatives à 15 s
de délai chacune, plus le repli exponentiel) avant de répondre `503` : des
dizaines de secondes pour une seule tuile. `alaskybis.cds.unistra.fr`, le
miroir de secours propre au CDS, répondait au même chemin exact en environ
une seconde tout du long.

L'entrée de table d'un relevé (`packages/portal/src/sky-tiles/surveys.js`)
porte désormais une liste ordonnée `upstreamRoots` plutôt qu'une racine
unique, essayées dans l'ordre jusqu'à ce que l'une réponde :

```js
upstreamRoot: "https://alasky.cds.unistra.fr/DSS/DSSColor/", // conservé : upstreamRoots[0]
upstreamRoots: [
  "https://alasky.cds.unistra.fr/DSS/DSSColor/",
  "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
  "https://skies.esac.esa.int/DSSColor/", // ESASky, le dernier recours
],
```

`upstreamRoot` est conservé, toujours égal à `upstreamRoots[0]`, pour un
lecteur (ou une version de schéma) antérieur à la liste ; `upstreamRoots` a
été ajouté à `GET /v1/offline-pack` et à
[son schéma](../../packages/astro-contracts/schemas/api/offline-pack.schema.json)
de façon additive, à ses côtés, jamais en remplacement.

**Comment le miroir a été vérifié, et une limite honnête.** Récupérer à la
main `https://alaskybis.cds.unistra.fr/DSS/DSSColor/properties`
renvoie un fichier `properties` pour le même relevé HiPS exact
(`creator_did = ivo://CDS/P/DSS2/color`, `hips_order`, `hips_frame`,
`hips_tile_width` et `hips_check_code` identiques) au même chemin exact — la
même vérification a été refaite pour DSS2 Red (`DSS/DSS2Merged/`) et pour
CTA-FRAM (`fzu.cz/fzu.cz_P_CTA-FRAM_survey_color/`), tous deux utilisés par le
planificateur (voir plus bas). Aucun de ces fichiers ne renseigne réellement de champ
`hips_service_url` actif pour _annoncer_ la relation de miroir : chacun de
ceux servis par le CDS l'a présent mais commenté, comme un gabarit
(`#hips_service_url = ex: http://yourHipsServer/…`). La vérification a donc
été faite en comparant directement le contenu servi au même chemin plutôt que
par ce champ — ce qui est la preuve la plus solide des deux de toute façon —
mais un réseau capable de joindre les deux hôtes devrait revérifier ceci
périodiquement, rien ne garantissant qu'un miroir le reste indéfiniment.

**ESASky, le dernier recours de `dss-colour`.** Le 29/10/2026, aucun des
deux hôtes du CDS n'acceptait de connexion pendant des heures, alors que le
miroir du même HiPS chez ESASky (ESA) répondait. Son `properties`
(`https://skies.esac.esa.int/DSSColor/properties`, lu ce jour-là) déclare
`creator_did = ivo://CDS/P/DSS2/color`, `hips_order = 9`,
`hips_tile_width = 512`, `hips_tile_format = jpeg` et
`hips_frame = equatorial` : les mêmes tuiles aux mêmes chemins. Il est plus
lent (environ 7 s par requête), d'où sa dernière place ; les disjoncteurs
ci-dessous écartent les deux hôtes morts du CDS après leurs trois premiers
échecs, et chaque tuile suivante va droit à ESASky.

**Le relevé DSS2 rouge (`dss2-red`) n'a pas de troisième racine.** Le relevé
du mode visuel (`CDS/P/DSS2/red`, `DSS/DSS2Merged/` sur les deux hôtes du
CDS, JPEG, ordre 9, tuiles de 512 px, mêmes attribution et licences que le
relevé couleur) figure aussi dans la table, pour les découpes du ciel (voir
[Découpes du ciel](#découpes-du-ciel)). ESASky n'en a pas de copie
(`https://skies.esac.esa.int/DSS2Merged/properties` répondait `404` le
29/10/2026) : tant que les deux hôtes du CDS sont muets, seules les tuiles
déjà dans le cache de ce miroir sont servies. Il n'entre jamais dans le pack
hors ligne : le composant `sky-backdrop` du pack ne nomme que
`defaultSkyBackdropSurveyId` (`dss-colour`), et rien ne parcourt toute la
table.

**Aucun relevé grand champ n'est mis en miroir.** CTA-FRAM (le relevé grand
champ du planificateur) reste hors de cette table : ses conditions de
redistribution ne sont pas tranchées, et les découpes n'en ont pas besoin.

**Deux délais indépendants**, tous deux configurables, parce qu'un hôte qui
ne répond jamais du tout et un hôte qui se connecte mais reste bloqué en
cours de réponse appellent des budgets différents :

| Variable                                   |  Défaut | Rôle                                                                                              |
| ------------------------------------------ | ------: | ------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS` |  `5000` | Délai d'attente d'une tentative pour obtenir _une_ réponse avant d'abandonner cette racine        |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`         | `20000` | Budget global de la même tentative, connexion **et** corps — un hôte qui répond mais reste bloqué |

Seul le délai de connexion s'applique au mode de panne d'un hôte injoignable (rien ne
répond jamais), c'est pourquoi il est le plus court : une racine qui ne
répond pas dans ce délai est traitée comme un **échec de connexion** et la
racine suivante configurée est essayée immédiatement, sans le repli par hôte
décrit plus bas.

**Une réponse `429`/`5xx` n'est pas un échec de connexion.** Un hôte qui
répond, même par une erreur, a prouvé qu'il est joignable — le repli
exponentiel borné déjà existant contre le _même_ hôte (quelques tentatives,
délai plafonné) est inchangé et s'applique toujours avant d'abandonner cet
hôte (le document de conception §5, « le repli sur 429/5xx reste par hôte »,
est une exigence délibérée, pas un oubli). Ce n'est qu'une fois les
tentatives de cet hôte épuisées, ou s'il n'a jamais répondu du tout, que le
miroir passe à la racine suivante. Un statut HTTP permanent (autre que
`429`/`5xx`) arrête la recherche immédiatement plutôt que d'essayer une autre
racine — chaque miroir sert exactement les mêmes octets au même chemin (voir
[Intégrité](#intégrité)), donc une ressource absente d'une racine ne
réapparaîtra pas non plus sur une autre.

**Un disjoncteur par hôte**, propre à une instance de miroir en cours
d'exécution (état au niveau du module, avec la même durée de vie que le
sémaphore de concurrence et les tables de construction d'archives
ci-dessus), pour qu'une requête ne paie jamais plus que nécessaire le délai
de connexion d'un hôte mort :

- Après **3 échecs de connexion consécutifs** contre un hôte (une origine —
  schéma, nom d'hôte et port — pas un relevé entier ; deux relevés miroirés
  sur le même hôte CDS partagent un seul disjoncteur), cet hôte est mis de
  côté d'emblée — aucune tentative réseau du tout — pour une durée de repos.
- La durée de repos démarre à **60 s** et **double à chaque nouvel échec**
  une fois rouvert, plafonnée à **15 min** — « 1 → 15 min ».
- **Tout succès referme entièrement le disjoncteur** et remet la durée de
  repos à 60 s, y compris la toute première tentative rejouée juste après
  l'expiration d'une durée de repos.
- Une réponse `429`/`5xx` ne compte pas contre ce disjoncteur (voir
  ci-dessus) ; une erreur réseau levée (connexion refusée, réinitialisée,
  échec DNS, échec TLS) le fait, exactement comme un délai dépassé.

**Le budget de politesse reste partagé, pas par hôte.** Le sémaphore de
concurrence unique et global au processus ci-dessus continue de plafonner
chaque connexion amont que ce miroir ouvre, cumulée sur toutes les racines
configurées — un relevé avec deux miroirs ne double jamais la charge qu'il
fait peser sur le CDS dans son ensemble.

**Pire cas de latence, avec les défauts documentés** (les chiffres
ci-dessous comptent les deux racines du CDS ; pour `dss-colour`, une requête
qui les trouve mortes toutes deux passe ensuite à ESASky, qui ajoute son
propre temps de réponse, environ 7 s) :

- **Le mode de panne d'un hôte injoignable** (une racine qui ne répond jamais) : un
  délai de connexion par racine morte avant d'essayer la suivante —
  `2 × 5 s = 10 s` la première fois qu'une requête tombe sur une racine
  principale fraîchement morte, puis, une fois le disjoncteur ouvert après
  trois requêtes de ce genre, effectivement **0 s** de surcoût pour chaque
  requête suivante (la racine principale est ignorée d'emblée). Cela remplace
  l'ancien pire cas à hôte unique d'environ `4 × 15 s` (tentatives)
  `+ 2,1 s` (repli) ≈ **62 s** pour une seule tuile.
- **Toutes les racines configurées en panne à la fois** répond `503`
  `sky_tiles_upstream_unavailable` (avec un `Retry-After`) en au plus
  `2 × 5 s = 10 s`, jamais l'ancien pire cas ci-dessus.
- **Un hôte qui répond mais renvoie `5xx` de façon persistante** n'est pas
  affecté par ce changement et garde son pire cas préexistant, borné par le
  nombre de tentatives (`4` tentatives × jusqu'à `20 s` chacune + ≈`2,1 s` de
  repli ≈ `82 s`, par hôte de ce genre) — un mode de panne d'une nature
  différente (l'hôte est vivant) de celui que corrige cette section, mentionné
  ici seulement pour être complet.

Chacun des délais, les trois constantes du disjoncteur et la politique de
nouvelles tentatives sont injectables dans `createSkyTileMirror(...)`, et
`packages/portal/tests/sky-tiles-mirror.test.mjs` exerce tout ce qui précède
— une connexion refusée, une connexion qui reste bloquée au-delà de son
délai, l'ouverture du disjoncteur, sa fermeture après une reprise simulée, et
toutes les racines en panne, ainsi que le plafond de concurrence partagé —
contre de vraies sockets locales, jamais le CDS, avec chaque délai injecté
pour que toute la suite s'exécute en quelques millisecondes.

## Cache disque

```text
<répertoire du miroir>/
├── tiles/<surveyId>/Norder{n}/Dir{d}/Npix{p}.{ext}
├── archives/<surveyId>/Norder{n}/Chunk{c}/{pix}.tar
├── properties/<surveyId>/properties
├── stats/<surveyId>.json          taille moyenne de tuile observée PAR ORDRE, pour le manifeste
└── archive-index/<surveyId>.json  { chemin d'archive -> taille exacte }, pour qu'un palier
                                   `ready` réponde par une petite lecture, pas un `stat` par archive
```

`stats/<surveyId>.json` et `archive-index/<surveyId>.json` sont tous deux un
état partagé et mutable qu'un processus de portail et le script
`prepare:sky-tile-pack` peuvent écrire en même temps, sur le même répertoire
— en toute sécurité : chaque écriture relit le fichier juste avant et
fusionne son propre delta (les octets d'une tuile de plus ; la taille d'une
archive de plus) plutôt que de l'écraser avec la vue en mémoire de ce
processus, nécessairement partielle, et l'écriture est atomique (un fichier
`.part` jumeau, renommé une fois complet). Avant cela, `stats/<surveyId>.json`
était un unique `{ count, totalBytes }` global écrasé en entier à chaque
écriture : une exécution de `prepare:sky-tile-pack` ayant compté 1 016
tuiles, suivie d'un processus serveur n'en ayant compté que 115 de son côté,
verrait l'écriture du serveur **remplacer** purement et simplement le total
du script — exactement l'incident que corrige ce changement de format. Les
deux fichiers lisent aussi un ancien format incompatible sans erreur (un
simple `{ count, totalBytes }` pour les statistiques, ou une forme non
reconnue pour l'index d'archives) — simplement ignoré, en repartant de zéro,
jamais un plantage.

Le répertoire suit le même ordre de résolution que les autres répertoires de
données générées de ce portail (`ASTRO_PORTAL_SERVICE_DIR` →
`ASTRO_PORTAL_RUNTIME_DIR`, voir
`packages/portal/src/planner/sky-quality.server.js` et
[STATIC_DATA.md](STATIC_DATA.md)) : `<runtime>/sky-tiles` par défaut,
surchargeable directement par `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`.

- **Plafonné, éviction LRU.** `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`
  (défaut 4 Gio) plafonne le cache _entier_, tuiles et archives ensemble ;
  une fois le plafond dépassé, les fichiers les moins récemment consultés
  sont supprimés en premier, jusqu'à 90 % du plafond. **Ce défaut est un
  engagement réel sur un petit hôte** : remplir le palier « Haute qualité »
  pour un seul appareil représente ≈5,35 Gio (DSS colour — voir
  [Taille moyenne de tuile par ordre](#taille-moyenne-de-tuile-par-ordre) ;
  un portail servant `quality` doit relever ce défaut) et 65 532 fichiers —
  un Raspberry Pi avec une petite carte SD se remplira silencieusement sans
  augmenter cette valeur, ou sans qu'un administrateur n'ait jamais lancé
  `prepare:sky-tile-pack` au-delà du palier qu'il compte réellement offrir.
  Les archives d'un palier [préparé en tâche de fond](#préparer-un-palier-en-tâche-de-fond)
  ne sont jamais évincées tant que la tâche vit, ni les tuiles d'une archive
  en construction ; un palier qui ne tiendrait pas sous le plafond est
  refusé plutôt que démarré.
- **Écritures atomiques.** Chaque fichier est écrit dans un fichier `.part`
  jumeau puis renommé une fois complet, si bien qu'un lecteur n'observe
  jamais une tuile ou une archive à moitié écrite.
- **Résilient aux arrêts brutaux.** Un fichier `.part` orphelin — reste d'un
  processus mort en cours d'écriture — est silencieusement ignoré puis
  supprimé la prochaine fois que ce chemin exact est redemandé ; il n'est
  jamais servi et ne bloque jamais une nouvelle récupération.

## Pré-remplir le cache

Un administrateur peut remplir le miroir par avance, avant qu'un appareil ne
le demande, pour que la première requête réelle reçoive un `200` immédiat
plutôt que de payer la latence propre du CDS :

```bash
npm run prepare:sky-tile-pack -- --survey dss-colour --max-order 3 \
  [--mirror-dir <répertoire>] [--concurrency <n>] [--sample <n>]
```

Il utilise exactement le même module de miroir qu'une requête réelle — le
même sémaphore, le même repli, le même `User-Agent` — il n'est donc pas plus
exigeant envers le CDS que le trafic ordinaire pour le même nombre de
tuiles. Il est entièrement reprenable : chaque tuile et chaque archive qu'il
demande sont d'abord vérifiées sur disque, exactement comme le ferait une
requête réelle, si bien que relancer la même commande après une interruption
reprend là où elle s'était arrêtée plutôt que de tout recommencer.
`--max-order` doit valoir au moins `archiveChunkDelta - 1` (`3` par défaut) :
l'archive des ordres bas est une unité unique et indivisible, et tout
`--max-order` en dessous récupérerait silencieusement plus que ce qui a été
demandé plutôt que de construire quelque chose de cohérent.

Mesuré contre le vrai miroir du CDS, à 4 connexions simultanées : remplir `essential` en entier (ordres 0 à 3, 1 020 tuiles) a
pris 1 min 22 s.

`--sample <n>`, ajouté aux côtés de la table de moyennes par ordre
([plus haut](#taille-moyenne-de-tuile-par-ordre)) : pour chaque ordre
strictement au-dessus de `--max-order` (jusqu'au `maxOrder` propre du
relevé), récupère `n` tuiles choisies avec une **graine fixe** — le même
triplet `(ordre, nombre de tuiles, n)` échantillonne toujours les mêmes
pixels, si bien qu'une nouvelle mesure des mois plus tard est directement
comparable à celle-ci — pour mesurer leur taille moyenne **sans construire
d'archive** pour cet ordre. C'est exactement ainsi que les entrées des
ordres 4 à 6 dans `dssColourMeanTileBytesByOrder` ont d'abord été mesurées à
la main, avant l'existence de cette option ; les tuiles échantillonnées
atterrissent quand même dans le cache disque ordinaire (et comptent donc
toujours vers le seuil propre à chaque ordre d'`observedMeanTileBytes`) —
« sans archive » n'est pas « sans cache ».

Le script affiche la progression par ordre (tuiles récupérées vs déjà en
cache, octets, octets moyens par tuile contre la table documentée par
ordre) au fur et à mesure qu'il remplit le cache de tuiles, puis construit
chaque archive dont le palier demandé a besoin, puis (avec `--sample`) les
ordres échantillonnés au-delà, et termine par un bilan du nombre total de
tuiles, des octets, de la durée, de la taille EXACTE combinée de chaque
fichier d'archive qu'il vient de construire, et — pour chaque palier que les
mesures de cette exécution atteignent — la taille que cela implique : exacte
pour un palier désormais entièrement construit, une estimation (les moyennes
observées par cette exécution, celles de `--sample` le cas échéant, la table
documentée au-delà) sinon.

## Préparer un palier en tâche de fond

Un miroir vide ne construit une archive que lorsqu'un client la demande —
environ une minute chacune depuis le CDS — et s'arrête dès que plus personne
ne demande. Un client qui télécharge un palier attend donc un
`503 sky_tiles_archive_building` après l'autre, et rien n'est construit tant
que personne n'est connecté.
`POST /v1/offline-pack/sky-backdrop/tiers/{tier}/prepare`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-backdrop/tiers/[tier]/prepare/route.js`,
la tâche elle-même dans `packages/portal/src/sky-tiles/prepare.js`) lance une
tâche qui construit toutes les archives manquantes du palier, l'une après
l'autre, dans l'ordre où un client les télécharge ; `GET` sur le même chemin
en donne l'avancement (`archives.ready` sur `archives.total`, l'archive en
cours avec ses tuiles, le temps restant, l'état). Les formats de requête et
de réponse sont dans
[la référence de l'API](../../packages/astro-contracts/schemas/api/v1.md#sky-backdrop-preparation) ;
ce qui suit décrit le comportement.

- **Une seule tâche à la fois, pour tout le service.** Une demande pour un
  palier que la tâche en cours couvre (les paliers sont cumulatifs) la
  rejoint ; un palier plus grand est mis en file et démarre tout seul. Rien
  d'une tâche n'est écrit sur le disque : après un redémarrage,
  `GET` lit ce qui est sur le disque (l'index des archives ; les tuiles
  d'une archive interrompue sont retrouvées et non récupérées deux fois),
  répond `idle`, et le `POST` suivant reprend.
- **Les demandes directes gardent la priorité.** La tâche passe par la même
  limite de connexions (`ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY`) et les
  mêmes disjoncteurs d'hôte que toute autre récupération, et ne demande que
  quelques tuiles d'avance sur celle qu'elle ajoute à l'archive
  (`backgroundBuildWindow`, le double de la concurrence) : une archive qu'un
  client demande directement — dont les tuiles sont demandées toutes en même
  temps — est construite avant celles de la tâche, non derrière le reste de
  son archive (`packages/portal/tests/sky-tiles-prepare.test.mjs` le fixe
  contre un faux CDS).
- **Jamais de boucle serrée.** Un CDS qui ne répond pas met la tâche en
  `waiting` (`upstream_unavailable`) : première nouvelle tentative après
  30 s, puis 60 s, en doublant jusqu'à 5 min, jamais avant que le
  disjoncteur de l'hôte n'autorise une connexion ; `nextAttemptAt` dit
  quand. Une tuile que le CDS refuse définitivement termine la tâche en
  `failed` jusqu'au `POST` suivant. Les minuteries ne retiennent pas le
  processus.
- **Le plafond de taille.** Un palier dont les archives (estimées d'après
  les tailles de tuile par ordre) plus les tuiles de l'archive en
  construction dépassent 90 % de `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`
  est refusé par `409 sky_backdrop_tier_exceeds_mirror_limit` : il
  évincerait ses propres archives au fil de l'eau et ne finirait jamais.
  Avec les 4 Gio par défaut, `quality` (≈5,8 Go d'archives, ≈6,4 Gio de
  plafond nécessaires) est refusé ; `comfort` (≈1,2 Go) ne l'est pas. Tant
  qu'une tâche vit, les archives de son palier sont protégées de
  l'éviction ; les tuiles des archives déjà construites partent en premier.
  Le manifeste le dit d'avance — `unavailable: true` sur un palier non
  construit qui serait refusé — par la même fonction
  (`packages/portal/src/sky-tiles/tier-fit.js`), jamais une seconde copie du
  calcul.
- **Interrogation.** Le client lit l'état toutes les `retryAfterSeconds`
  (15 s en cours de travail), et au plus tard une fois par minute, et
  redemande si le service a redémarré entre-temps.

## Le composant `sky-backdrop` du manifeste du pack hors ligne

`GET /v1/offline-pack` (voir
[la référence de l'API](../../packages/astro-contracts/schemas/api/v1.md#offline-pack-manifest),
ou [OFFLINE_PACKS.md](OFFLINE_PACKS.md) pour le format complet du manifeste,
les conditions de licence de ce composant, et comment intégrer un miroir déjà
construit à un pack fabriqué soi-même)
décrit ce que ce miroir pourrait servir — métadonnées du relevé, gabarits
d'URL, paliers et leurs tailles — sans que cette instance n'ait jamais rien
construit. Plusieurs champs sont **observés**, pas déclarés :

- `meanTileBytesByOrder` (additif) est une moyenne d'octets/tuile **par
  ordre HEALPix** — la constante documentée par ordre
  (`dssColourMeanTileBytesByOrder`, [plus haut](#taille-moyenne-de-tuile-par-ordre))
  jusqu'à ce que le miroir ait lui-même récupéré assez de tuiles À CET ORDRE
  depuis le véritable amont pour faire confiance à sa propre moyenne
  observée, ordre par ordre (`minimumObservedTilesForMean` tuiles vues à cet
  ordre exact). L'`estimatedBytes` de chaque palier non encore `exactBytes`
  est calculé à partir de cette table, ordre par ordre, plus le vrai
  surcoût de l'archive tar — jamais `tiles * meanTileBytes` contre une
  moyenne unique, ce qui est ce qui faisait sous-estimer fortement les
  estimations d'origine de `comfort`/`quality` une fois mesurées.
  `meanTileBytes` (au singulier) est conservé pour un lecteur antérieur à
  cette table : la moyenne pondérée par le nombre de tuiles sur les seuls
  ordres du palier `essential` (0 à 3).
- L'état (`state`, `ready` ou `on-demand`) de chaque palier reflète si
  _toutes_ les archives dont ce palier est composé existent déjà dans le
  cache de ce miroir. Un palier passe à `ready` exactement quand
  `prepare:sky-tile-pack` (ou le trafic organique) a fini de le construire,
  et l'`ETag` propre du manifeste change exactement quand cet état change et
  reste stable sinon — jamais sur un horodatage de génération.
- Le champ `archives` (additif) de chaque palier vaut `{ ready, total }` :
  combien de ses archives le miroir possède et combien il en faut, comptées
  depuis l'index des archives (`mirror.tierArchiveProgress`) — une petite
  lecture de fichier, jamais un parcours du disque. L'`ETag` du manifeste
  change avec lui, archive après archive, et reste stable tant que rien
  n'est construit. Les archives présentes
  sur disque sans entrée d'index sont cherchées une fois par processus et
  par palier, en arrière-plan, puis comptées. `prepareUrlTemplate` (additif)
  désigne la route de
  [préparation en tâche de fond](#préparer-un-palier-en-tâche-de-fond).
- Une fois un palier `ready`, son `estimatedBytes` cesse d'être une
  estimation : il devient la taille **exacte** combinée des fichiers
  d'archive réels de ce palier sur disque, signalée de façon additive par
  `exactBytes: true` pour qu'un client sache que ce n'est plus une
  projection. Calculer ce total exact impliquerait de faire un `stat` sur
  chaque archive dont un palier est composé (jusqu'à 253 aujourd'hui) à
  chaque requête de manifeste ; le miroir tient à la place un petit index
  sur disque (`archive-index/<surveyId>.json`, voir
  [Cache disque](#cache-disque)) depuis lequel la taille exacte d'un palier
  `ready` est lue en une seule petite lecture de fichier, se réparant de
  lui-même par un balayage `stat` réel la seule fois où il ne couvre pas
  encore toutes les archives dont un palier a besoin (archives d'une
  ancienne version du miroir, ou copiées directement).

## Découpes du ciel

```text
GET /api/v1/sky-cutout?survey=dss-colour|dss2-red&ra={deg}&dec={deg}&fov={deg}
```

Un JPEG carré de 640 px d'un relevé du miroir autour de (`ra`, `dec`), de
`fov` degrés de côté : la projection TAN de hips2fits, nord en haut et est à
gauche, découpée par le portail lui-même
(`packages/portal/src/sky-cutout/service.js`, avec `hipsCutout` de
`packages/portal/src/target-field-image/cutout.js`) dans les tuiles de ce
miroir, obtenues par `ensureTile` comme toute autre tuile. Les découpes
partagent donc le cache du miroir, ses racines amont (ESASky en dernier pour
`dss-colour`), ses disjoncteurs et son budget de politesse. Les pixels sont
ceux des tuiles : aucune courbe de tons. La section « Prévisualiser » de la
fiche d'une cible y découpe son ciel (photo : `dss-colour` au champ de la
photo ; visuel : `dss2-red` au champ vrai de l'oculaire).

- `survey` vaut `dss-colour` (par défaut) ou `dss2-red` ; `ra` de 0 à 360,
  `dec` de −90 à 90, `fov` de 0,02 à 20 ; tout le reste répond `400`
  `sky_cutout_request_invalid`.
- La clé du cache est quantifiée : le champ à trois chiffres significatifs,
  le centre à la puissance de dix inférieure ou égale à un pixel de sortie.
- Une découpe **complète** (toutes ses tuiles obtenues) est gardée sur disque
  sous `ASTRO_PORTAL_SKY_CUTOUT_DIR` (`<runtime>/sky-cutouts`) et servie
  `public, max-age=31536000, immutable` avec un `ETag` fort.
- Une découpe **partielle** (une tuile que le miroir n'a pas pu avoir) est
  servie avec `public, max-age=60` et jamais gardée.
- **Aucune tuile** répond `503` `sky_cutout_unavailable` avec `Retry-After`.
- Une découpe `dss2-red` sans aucune tuile (ses hôtes du CDS muets et rien en
  cache) se replie sur `dss-colour`, servie `public, max-age=300`.
- `X-Sky-Cutout-Survey` nomme le relevé réellement servi,
  `X-Sky-Cutout-Complete` dit `true` ou `false`.
- `ASTRO_PORTAL_SKY_TILE_MIRROR=off` coupe aussi cette route (`404`
  `sky_cutout_disabled`).

Le répertoire des découpes n'entre pas dans le budget d'octets du miroir ;
une découpe pèse environ 100 Ko.

## Géométrie HEALPix partagée

`packages/portal/src/sky-tiles/geometry.js` est l'unique endroit où vit
l'arithmétique HEALPix en schéma NESTED du miroir — le décalage d'ancêtre
utilisé pour remonter le quadtree de pixels, et le regroupement en `Dir{d}`
qu'un arbre HiPS applique aux tuiles. Les deux sont figés par une fixture
partagée (`packages/astro-contracts/fixtures/healpix-ancestor.json`), pour
que toute autre implémentation de la même arithmétique puisse être vérifiée
contre les mêmes valeurs.

## Variables d'environnement

| Variable                                   | Défaut                                                                                | Rôle                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_SKY_TILE_MIRROR`             | activé                                                                                | `off` désactive le miroir et retire `sky-backdrop` du manifeste du pack hors ligne                                     |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`         | `<runtime>/sky-tiles`                                                                 | Répertoire du cache disque (tuiles, archives, properties, statistiques de taille observée par ordre, index d'archives) |
| `ASTRO_PORTAL_SKY_CUTOUT_DIR`              | `<runtime>/sky-cutouts`                                                               | Cache disque des découpes du ciel complètes (voir [Découpes du ciel](#découpes-du-ciel))                               |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`   | `4294967296` (4 Gio)                                                                  | Plafond de taille du cache ; éviction LRU au-delà, archives comprises                                                  |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY` | `4`                                                                                   | Connexions amont simultanées, globales au processus, partagées par tuiles et archives, toutes racines confondues       |
| `ASTRO_PORTAL_UPSTREAM_USER_AGENT`         | `astro-portal/1.0 (self-hosted HiPS mirror; +https://github.com/sqound/astro-portal)` | Identification envoyée au relevé amont                                                                                 |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS` | `5000`                                                                                | Délai de connexion par tentative avant de basculer vers la racine `upstreamRoots` suivante                             |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`         | `20000`                                                                               | Délai global par tentative, connexion et corps — voir [Racines amont en miroir](#racines-amont-en-miroir)              |

Voir aussi [docs/fr/INSTALLATION.md](INSTALLATION.md) pour ces variables aux
côtés de toutes les autres variables d'environnement du portail.
