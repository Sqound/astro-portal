# Confidentialité

Les photographies astronomiques peuvent contenir plus d’informations qu’il n’y
paraît : lieu d’observation, coordonnées GPS EXIF, dates et heures, noms de
personnes, chemins de fichiers, identifiants d’instrument ou liens vers des
comptes externes.

## Avant une publication publique

1. Examiner tous les JSON du catalogue.
2. Examiner les EXIF des JPEG/TIFF publiés.
3. Vérifier les textes visibles dans les captures d’écran.
4. Ne jamais publier `.env`, le dossier runtime ou les journaux.
5. Tester l’URL depuis un appareil réellement extérieur au LAN.

`ASTRO_PORTAL_REDACT_LOCATIONS=true` retire récursivement les champs nommés
lieu, location, GPS ou coordonnées GPS de l’API et de l’interface de la
galerie de l’opérateur ; la qualité du ciel (`skyQuality`, une classe de
Bortle et une estimation de SQM, jamais une coordonnée) reste. Cette option ne
modifie pas les fichiers sources de l’opérateur et ne nettoie pas leurs EXIF :
si vous publiez directement un JPEG de cette galerie contenant du GPS, ces
données restent présentes dans le fichier téléchargé.

Les captures d’un espace sont servies autrement. Une capture rendue publique,
ou montrée dans une galerie privée, est servie depuis une **copie partagée**
écrite par le service : un JPEG sans métadonnées EXIF, XMP ni IPTC (ni
position GPS, ni nom de lieu, ni numéro de série d’appareil, ni commentaire),
de 4096 px au plus sur son grand côté. La copie est écrite avant que la
capture devienne publique ; si elle ne peut pas l’être, la capture reste
privée. L’original n’est jamais modifié et n’est servi qu’à son propriétaire.
Seule une image (JPEG, PNG, WebP, AVIF, TIFF) peut être publique ; un FITS, un
XISF ou un fichier brut d’appareil reste dans son espace. Rien du lieu d’une
capture n’est publié ; sa qualité du ciel peut l’être.

Aucune commande de ce dépôt n’envoie de coordonnées à un fournisseur de
qualité du ciel. Une surcharge d’estimations de qualité du ciel, là où une
installation en garde une, conserve les estimations et leur provenance, jamais
les coordonnées.

La pollution lumineuse estimée d’un lieu d’observation choisi est lue par le
serveur du portail dans le raster de qualité du ciel installé avec lui, au
moment de la requête : rien n’est envoyé pour cela à un fournisseur extérieur,
et la réponse est gardée en mémoire par lieu arrondi à trois décimales. Le
résultat ne contient qu’une estimation SQM/Bortle modélisée et sa provenance.
Ce n’est pas une mesure du ciel effectuée sur place. Rien dans ce dépôt
n’interroge un service WMS pour cela.

Le planificateur peut demander un aperçu de catalogue directement au service
CDS HiPS2FITS lorsqu’une cible ne possède pas d’image locale du portail. Cette
requête côté navigateur envoie les coordonnées publiques de la cible et
l’adresse IP du visiteur à CDS ; elle n’envoie ni le lieu choisi par
l’observateur, ni les données privées du catalogue. Un aperçu de capture locale
reste toujours prioritaire.

Les requêtes météo passent par le serveur du portail. Open-Meteo est interrogé
en premier ; seulement en cas d’échec, le serveur envoie les mêmes coordonnées,
arrondies à trois décimales, au service Locationforecast de MET Norway.
L’adresse IP du visiteur n’est donc envoyée directement à aucun de ces
fournisseurs par le navigateur. Définissez
`ASTRO_PORTAL_WEATHER_FALLBACK=disabled` pour empêcher la seconde requête.
Consultez les politiques de confidentialité et de journalisation des
fournisseurs avant d’exposer publiquement le planificateur.

Les lieux suggérés (points de vue, campings, parcs, aires de pique-nique,
voir [PLACES.md](PLACES.md)) sont lus dans OpenStreetMap par une instance
Overpass, par le serveur du portail, jamais par l’appareil : la source voit
le serveur, pas l’observateur. Le centre de la recherche est arrondi à 0,05°
(environ 5 km) par le client, puis de nouveau par le serveur avant toute
requête ; seuls ce centre, le rayon, les types de lieux et la langue sont
envoyés. Les réponses sont gardées en mémoire 30 minutes et jamais écrites
sur disque ; la distance à chaque lieu est calculée sur l’appareil, jamais
par le serveur. Un lieu ajouté depuis une suggestion n’enregistre qu’un lien
(`source`, `id`, `type`, `linkedAt`) ; ses détails sont relus quand ils sont
affichés. Réglez `ASTRO_PORTAL_PLACES=off` pour ne jamais interroger la
source.

## Lieux, recherche d’adresse et ce que le service garde

L’application mobile et le planificateur web interrogent le serveur du portail
sur les lieux que la personne choisit, connectée ou non (un invité n’envoie
aucun jeton, ou son identité anonyme d’appareil ; ni l’un ni l’autre ne change
ce qui est envoyé). Sur le service hébergé, ce serveur est celui de Sqound.

- **Coordonnées.** `GET /v1/weather`, `/v1/weather/history`,
  `/v1/sky-quality`, `/v1/sky-quality/direction`, `/v1/places/resolve`,
  `/v1/places/climate-trend` et `/v1/places/suggested` portent les coordonnées
  du lieu choisi. Le serveur les arrondit avant toute consultation : 0,001°
  pour la prévision, la météo passée et la qualité du ciel, 0,01° pour le ciel
  par direction, 0,05° pour la tendance climatique et les lieux suggérés.
  `places/resolve` fait exception : il emploie les coordonnées telles que
  choisies, pour le fuseau horaire (calculé par le serveur), l’altitude
  (Open-Meteo, seulement quand l’application n’en a pas) et le nom de la
  localité (Photon, seulement après une position GPS ou un appui sur la carte,
  jamais après un choix parmi des résultats d’adresse).
- **La position du téléphone.** L’écran Lieux lit la position du téléphone à
  son ouverture (l’autorisation du système y est demandée si elle ne l’était
  pas encore) et la prend pour référence de ses distances et de « Autour de ». Cette position elle-même part alors vers `GET /v1/sky-quality`
  (arrondie à 0,001° par l’application, pour la qualité du ciel de la
  référence) et vers `GET /v1/places/suggested` (arrondie à 0,05°). La visée de
  la carte du ciel et l’horizon en réalité augmentée lisent la position sur l’appareil pour centrer ou orienter la
  vue ; rien n’est envoyé pour cela, hormis les tuiles du fond de carte de la
  zone affichée (ci-dessous).
- **Classement des cibles.** La requête de catalogue qui classe les cibles
  proposées pour le lieu d’une nuit porte la latitude de ce lieu **arrondie au
  degré entier**, jamais une longitude (`GET /v1/targets` ou son index
  compact).

- **Recherche d’adresse.** `GET /v1/places/search` porte le texte tapé (de 2 à
  240 caractères) et la langue. Le serveur les transmet au géocodeur, Photon
  par défaut (`https://photon.komoot.io/`, remplaçable par
  `ASTRO_PORTAL_GEOCODER_URL`), qui voit le serveur et le texte, pas
  l’appareil. La recherche ne démarre que lorsque la personne la valide, jamais
  pendant la frappe, et le serveur espace ses appels de 1,1 seconde.
- **Ce qui est gardé.** Aucune de ces routes n’écrit les coordonnées ni le
  texte dans la base de données, dans le journal de l’application ou dans la
  console : les lignes de console de la météo (`weather.fetch`) comptent des
  issues et nomment un fournisseur, jamais un lieu. Ce qui persiste est
  partagé et rattaché à aucun espace ni appareil : la dernière prévision d’un
  lieu arrondi à 0,001° (`weather_forecasts`, 7 jours, 1 000 lieux au plus) et
  la tendance météo d’un lieu arrondi à 0,05° (`place_climate_trends`, trois
  ans, 5 000 lieux au plus). En mémoire seulement, perdus au redémarrage : les
  estimations de qualité du ciel, les réponses du géocodeur (30 minutes, par
  requête, texte compris, 250 entrées au plus), les altitudes (24 heures) et
  les lieux suggérés (30 minutes).
- **Adresse réseau.** Les limiteurs en mémoire comptent les requêtes par
  appareil anonyme et par origine réseau et ne contiennent aucun lieu. La
  plateforme qui héberge le service reçoit les requêtes comme tout hébergeur ;
  ce document ne décrit pas ses propres journaux.

## Images souvenir

« Garder une image » (l’écran de pointage) empile les images que le pointage a
déjà prises en une seule image, écrite dans le dossier propre de l’application,
sur l’appareil. Sans espace, elle y reste. Connecté à un espace, chaque fichier
passe par la file d’envoi comme une capture de « Mes captures ». Elle n’est
ajoutée à la photothèque du téléphone que si la personne a activé
« Enregistrer dans la galerie photo du téléphone » (Réglages, désactivé par
défaut) et que le système a accordé le droit ; ce droit est demandé quand
l’interrupteur est activé, jamais pendant une nuit.

## Packs hors ligne

L’application mobile télécharge ses packs hors ligne (voir
[OFFLINE_PACKS.md](OFFLINE_PACKS.md)) de façon anonyme depuis
`planastro.space`, même lorsque l’app est configurée sur un serveur privé.
Aucune donnée personnelle n’est envoyée avec ces requêtes. La lecture à voix haute (`read-aloud`) est de l’audio statique généré une fois par l’opérateur à partir des textes publics du portail : un fichier est le même pour tout le monde et sa requête ne dit rien de la personne.

## Captures téléversées

`POST /v1/uploads` (tâche 6.5) stocke les octets originaux d’une capture
inchangés, hors base de données, sous `ASTRO_PORTAL_CAPTURES_DIR`. Une capture
reste privée tant que son propriétaire ne la rend pas publique ; ses octets
d’origine ne sont servis qu’à lui, et les galeries ne servent que sa copie
partagée sans métadonnées (plus haut). Après chaque envoi, le service écrit
une miniature (WebP, sans métadonnées) et lance la vérification automatique
sur le serveur lui-même, sans aucun service extérieur ; ni l’une ni l’autre
ne bloque, ne cache ni ne publie jamais une capture. Un serveur privé ne lance
aucune vérification : toute capture compte pour le ciel, et son propriétaire
décide seul de ce qui est public. Le chemin du fichier stocké dérive
uniquement du SHA-256 de ses octets, jamais du nom de fichier d’origine, qui
n’est conservé — borné, assaini — que dans la fiche en base. Ne publiez jamais
`ASTRO_PORTAL_CAPTURES_DIR` aux côtés du dossier runtime ou des journaux, pour
la même raison que la base de données elle-même.

## Fond de ciel mesuré

Astro Sync mesure le fond de ciel d’une nuit sur vos propres poses, sur votre
ordinateur (voir [PLACES.md](PLACES.md), « Le ciel que vous avez mesuré »).
Les poses sont seulement lues, jamais envoyées. `POST /v1/place-sky-measures`
reçoit un nombre par nuit — la médiane en mag/arcsec², le nombre de poses
dont elle est la médiane, la version de la méthode et l’heure médiane — avec
la session à laquelle il appartient et la position des poses ; tout autre
champ est refusé. La position sert seulement à trouver lequel de vos lieux
la nuit concerne (à moins de 500 m) et n’est jamais gardée ; la valeur est
gardée avec ce lieu et effacée avec votre espace. La liste d’étoiles de
référence dont il a besoin (Tycho-2, environ 25 Mo) est téléchargée une fois
depuis le CDS (VizieR), seulement quand vous appuyez sur le bouton placé sous
le texte qui la nomme ; aucun fichier de vous ne part avec cette requête.

## Le jeu de calibration du projet

Sur le service hébergé, et seulement si vous l’activez dans la section
« Calibration du ciel » de votre espace (désactivé par défaut), le projet
garde une fiche anonymisée de chaque valeur de fond de ciel que votre espace
détient — mesurée ou saisie — pour affiner son estimation de la qualité du
ciel : la valeur, sa bande, le niveau du raster de qualité du ciel au lieu, la
région de calibration, l’année et la version de la méthode ; jamais le lieu,
ses coordonnées, son nom, votre adresse ni un identifiant de votre espace ou
de vos appareils. Seul un registre séparé relie votre espace à ses fiches,
pour que « Retirer mes contributions » et la suppression de votre espace
puissent les effacer ; le jeu publié l’est sous licence CC BY 4.0
(attribution, usage commercial permis), et une version déjà publiée ne peut
pas être rappelée. Un serveur privé ne contribue jamais. Les règles :
[CONTRIBUTION_RULES.md](CONTRIBUTION_RULES.md).

## La version que fait tourner un appareil

L’application mobile et Astro Sync envoient, à chaque requête vers leur
portail et vers personne d’autre, le nom de leur version et du système sur
lequel ils tournent (`X-PlanAstro-Client: planastro-ios/1.0.4+126 (iOS 18.1)`,
`api/v1.md`, « Client identity »). Le service garde la version et le système
qu’un appareil a nommés en dernier, sur la ligne de cet appareil, avec l’heure
où il a été vu ; ils partent avec l’appareil. L’en-tête ne porte ni
identifiant, ni modèle, ni langue.

## L’écoute de la bêta fermée

Sur le service hébergé seulement. Le questionnaire de la bêta fermée peut
faire entendre, dans la langue du testeur, quelques courts extraits de la
lecture à voix haute (les mêmes pour tous ; ils ne portent aucune donnée du
testeur et sont publics en lecture). Le testeur peut dire, pour chacun, s’il
sonne juste et, sinon, ce qui sonne faux (280 caractères au plus). Ces
réponses sont des données du programme bêta, conservées avec les cinq
réponses du questionnaire et l’adresse du testeur accepté, montrées à
l’administration du projet sans l’adresse (par langue et par extrait, avec
les explications) et exportées dans un fichier qui alimente la table de
prononciation. Elles sont effacées avec les autres réponses de la bêta, au
plus tard trente jours après sa fin, ou sur demande. Les extraits eux-mêmes
sont déposés pour la bêta et retirés après elle.

## Les diagnostics de l’application

« Envoyer les diagnostics de l’application », dans les Réglages → « Données »
de l’application, est **activé par défaut pour une installation neuve** (une
installation qui a déjà choisi garde son choix) ; la personne l’éteint là, et
plus rien n’est alors envoyé, et ce qui attendait sur le téléphone est effacé.
Rien n’est affiché au premier lancement : les Réglages disent, en une phrase
sous l’interrupteur, ce qui quitte le téléphone, avec un « En savoir plus » qui
ouvre la page de confidentialité du site à son ancre `#diagnostics`
(`https://www.planastro.space/<lang>/privacy/#diagnostics`), où tout le détail
est écrit. L’interrupteur couvre trois choses : les erreurs de l’application,
les incidents des appareils reliés, et la sonde de résolution d’image. Le tout
est **anonyme**, avec ou sans compte.

**Erreurs de l’application.** Quand l’application rencontre une erreur (une
erreur non rattrapée, un échec du client d’un télescope intelligent, un
lancement d’exécution refusé ou mal relu), elle envoie une entrée au service :
l’écran et le chemin de la route, la version et le build de l’application, la
plateforme et la version du système, le modèle matériel brut (« iPhone17,1 »),
la langue, l’état du réseau, le message et la pile de l’erreur, et un fil
d’Ariane des dernières navigations, actions et étapes de lancement (le modèle
de l’appareil et l’état relu). Les entrées sont gardées 30 jours, rattachées à
aucun espace (elles ne sont pas effacées avec lui : elles expirent avec l’âge).

**Incidents des appareils reliés.** Quand un télescope intelligent (Seestar,
Vespera, DWARF) ou une monture (LX200, dont ZWO AM en Wi-Fi ou en Bluetooth,
SynScan, iOptron, NexStar, ASCOM Alpaca, INDI) refuse ou rate une commande
(pointage, empilement, programmation, initialisation, connexion, Sync, GoTo,
mouvement, lien perdu, silence), l’application envoie au service un incident
toute seule, dès qu’il a lieu, sans geste de la personne. Sans réseau, les
incidents attendent sur le téléphone (100 entrées au plus) et partent au retour
du réseau. Un incident contient : le type et la famille de l’appareil, son
modèle, son firmware et la version de l’application du fabricant quand
l’appareil les donne ; le genre de liaison (Wi-Fi du télescope, réseau,
Bluetooth), jamais son nom ni son adresse ; la commande envoyée et ses
paramètres nettoyés ; la réponse de l’appareil (code, texte brut, délai ou
silence) ; l’état avant et après ; une soixantaine de lignes d’échanges avec
l’appareil autour de l’incident (le début de la connexion, les derniers
échanges, les quelques secondes qui suivent) ; et, comme pour une erreur, la
version de l’application et du système, le modèle du téléphone et la langue.
Les incidents sont gardés **90 jours**, puis supprimés.

**Ce qui ne part jamais.** Ni pour une erreur ni pour un incident : l’adresse
e-mail ; un lieu ou ses coordonnées, même arrondies ; l’altitude du site ; la
hauteur ou l’azimut d’une cible ; les trames de lieu et d’heure qu’une monture
reçoit ; le nom d’un lieu ou d’un plan ; un nom de réseau Wi-Fi, une adresse IP
ou MAC, un nom d’hôte ; un numéro de série, un identifiant d’appareil, de
client ou de compte, un nom donné à l’appareil ; une clé, un mot de passe ou un
jeton (dont le jeton Bluetooth d’une monture) ; tout texte libre. Le téléphone
les retire avant de mettre l’entrée en file et la revérifie avant l’envoi, et le
service vérifie chaque entrée une troisième fois et refuse tout le lot à la
première trouvaille.

**Anonymat et identifiant.** Tout part sous le **jeton de diagnostic** (un
nombre aléatoire né à l’installation, tiré de nouveau quand l’app est
réinstallée ou ses données effacées, jamais dérivé de l’appareil ni de
l’espace), et ni l’espace ni l’appareil. Rien sur le service ne lie un jeton à
une personne, sauf un retour que la personne envoie avec lui : l’écran d’un
échec n’affiche que « Signaler ce problème », qui ouvre un retour
prérempli portant l’identifiant (les 8 premiers caractères du jeton, visible
aussi dans Réglages › Données) ; il ne sert qu’à donner cet identifiant et un mot sur ce que la
personne faisait, et un retour qui porte le jeton est relié aux incidents. La
personne peut aussi donner le jeton (Réglages → « Copier », ou la case « Joindre
mon jeton de diagnostic » du rapport de problème, cochée par défaut). Un
téléphone sans espace les envoie aussi, au service qu’il utilise, sous son
identité anonyme. Ils sont lus par le seul administrateur.

**Effacement.** Sur demande : la personne écrit avec l’identifiant et les
incidents de cet identifiant sont effacés. Avec l’espace : les incidents
reliés aux retours de la personne sont effacés quand l’espace l’est.

**Un serveur privé.** Il ne les reçoit que si son exploitant le dit
(`ASTRO_PORTAL_APP_LOGS=accept`) ; l’application le demande d’abord. Sqound
n’en reçoit aucun.

Avec le même interrupteur, le plate solving de l’application (écran de visée,
mise en station polaire, aide au pointage) envoie une entrée par capture, avec
sa source : les chiffres de la capture (objectif, pose, ISO, mise au point,
alignement, verdict du solveur) et son journal technique, jamais une image ni
une position — ni le lieu ni l’endroit du ciel visé par le téléphone — au plus
une par minute tant que son verdict ne change pas.

**Aide à l’intégration d’un appareil (DEVICE-TRACE-CONSENT-01).** Un
consentement **distinct** de l’interrupteur général, donné **par modèle** :
quand la personne choisit un télescope ou une monture que le banc n’a pas
prouvé (étiquette « Non vérifié » : Seestar S50, S30, S30 Pro, DWARF II,
DWARF 3, la gamme Vespera hors Vespera II, la Stellina ; les six pilotes de
monture OnStep, 10Micron, Celestron NexStar, iOptron, Alpaca, INDI), la feuille
« Matériel non vérifié » porte le bloc « Aider l’intégration de cet appareil ».
Son interrupteur est **allumé par défaut** sur la feuille ; « Continuer » donne
le consentement ; éteint, il reste éteint et n’est jamais rallumé. Grisé quand
l’interrupteur général est coupé ; absent sur un serveur privé. Ce qui part,
pendant l’utilisation de l’appareil : les lignes du journal d’appareil déjà
rédigées (commandes et réponses, modèle, micrologiciel, version de
l’application du fabricant, instants à la seconde, délais), lues comme celles
d’un incident (aucun lieu même arrondi), plus la règle de la trace : images,
aperçus et champs binaires « [image retirée] », nom du Wi-Fi d’un télescope
« [réseau] », suite base64 ou hexadécimale longue « [secret] », texte de plus de
120 caractères « [texte retiré · n car.] » ; puis la liste de refus stricte (une
ligne qui la casse part vide). Ce qui ne part jamais : images, position même
approchée, nom de réseau ou adresse, identifiants, numéros de série, clés,
mots de passe, jetons, noms de lieux ou de plans. File sur le téléphone bornée
à **25 Mo** (le plus ancien part d’abord, perte comptée), gardée 7 jours au plus
hors réseau ; envoi gzip (`POST /v1/device-traces`) sous le jeton de
diagnostic, jamais l’espace ni l’appareil ; au plus **25 Mo par 24 heures**
(`429` respecté). Gardé **30 jours** par le service (90 au plus pour un modèle épinglé dans l’administration). Réglages › Données ›
« Appareils que vous aidez à intégrer » : « Arrêter » coupe tout de suite,
« Effacer aussi ce qui est parti » appelle `DELETE /v1/device-traces?token=`.
Le registre `GET /v1/verified-devices` retire le badge et l’aide d’un modèle
vérifié sans mise à jour de l’application, et laisse une carte « Merci ! ».

## TIFF

Le blocage TIFF repose sur la présence des en-têtes Cloudflare. Il protège le
cas prévu d’un tunnel Cloudflare vers le serveur. Avec un autre proxy public,
configurez ce proxy pour bloquer `/download/` et `/api/admin/`, ou adaptez la
fonction `isExternalRequest` à ses en-têtes fiables.
