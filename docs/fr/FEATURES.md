# Fonctionnalités

## Galerie

La page d’accueil est la galerie publique : les captures publiques de tous
les espaces, la nuit la plus récente d’abord, une carte par capture — sa
miniature, son tag générique et son télescope, sa cible, son intégration
quand elle est connue, le mois de la nuit (jamais le jour ni le lieu) et le
« Nom public » de l’espace comme signature. Filtres par tags génériques,
recherche, tri inversé et carte du ciel ; `/{locale}/gallery/<capture>`
ouvre une capture avec sa cible, son acquisition (qualité du ciel, mois de
la nuit), son équipement et ses liens.

Avec `ASTRO_PORTAL_GALLERY_SOURCE=files`, la page d’accueil est à la place la
galerie de fichiers de l’opérateur, décrite ci-dessous.

### La galerie de fichiers

Le serveur associe les fichiers détectés aux fiches JSON et construit une carte
par cible. Chaque carte présente l’image choisie comme référence de galerie, le
nombre de sessions distinctes, le type d’objet, le télescope ou l’instrument,
l’intégration, la date, le lieu lorsqu’il est publié et les tags.

Les tags sont entièrement issus des métadonnées : aucune marque ou configuration
matérielle n’est codée en dur. La recherche normalise les accents et porte sur
le titre et les identifiants astronomiques. Le tri peut être inversé entre les
prises les plus récentes et les plus anciennes.

## Fiche partageable

Une adresse `/image/<cible>/<version>` ouvre directement la bonne cible et la
bonne image après rechargement. Le retour à la galerie restaure la position de
défilement. Les flèches, la liste déroulante et les points du carrousel restent
synchronisés. La carte du ciel, lorsqu’elle existe, est toujours placée en
dernier.

Le panneau présente :

- objet, type, constellation et coordonnées J2000 ;
- champ, échelle et orientation lorsqu’une solution WCS existe ;
- acquisition et illumination lunaire calculée ;
- tableau des poses et du temps total par filtre ;
- rendu, courbe, pipeline et outils de traitement ;
- équipement ;
- description générale et description technique ;
- liens connexes, dont Stellarium Web.

## Variantes et progressions

Les variantes peuvent distinguer librement le rendu, la courbe de couleur et le
profil de traitement. Le portail connaît nativement les regroupements « rendu
naturel » et « rendu Vespera », mais accepte aussi tout libellé déclaré dans les
métadonnées.

Les fichiers placés dans un dossier `progression/` deviennent des étapes. Leurs
métadonnées peuvent préciser le palier, la période, le filtre et l’intégration.
Une lecture en boucle propose trois intervalles et affiche l’étape courante dans
un bandeau au-dessus de l’image.

## Plate solving

Le plate solving est facultatif. Lorsque les commandes Astrometry.net et les
index appropriés sont installés, une résolution est lancée en arrière-plan puis
mise en cache dans le dossier d’exécution. Les objets étendus reçoivent un
cercle ; les étoiles ont seulement un trait et une étiquette. Les seuils de
magnitude vont de 3,5 à 10, avec une option affichant toutes les étoiles du
catalogue HYG disponible.

Les traits et cartouches s’adaptent à la taille réelle de l’image et restent
dans le cadre en desktop comme en mobile.

## Planificateur d’observation

Le planificateur associe une date, un lieu connu et un profil matériel à des
recommandations de cibles, leurs courbes de hauteur, des créneaux éditables et
une synthèse météo astronomique à courte échéance. Ses cartes de plan offrent
des actions compactes et libellées pour le calendrier, la météo, l’impression,
le partage et l’export ; le contrôle de cible ouvre l’objet choisi dans
Stellarium Web.

Son onglet **Catalogue** est une bibliothèque locale et recherchable de ciel
profond. Elle est importée depuis [OpenNGC](https://github.com/mattiaverga/OpenNGC)
et conservée dans le dossier d’exécution privé, sans requête pendant l’usage.
Les cibles proposées par le planificateur et les objets déjà capturés réutilisent
son court contexte pédagogique localisé ; une aide compacte l’affiche sans
remplacer les notes propres à chaque image. L’interface indique l’attribution
OpenNGC CC BY-SA 4.0.
Sa section d’administration privée stocke le catalogue source local complet
dans SQLite et expose des fiches cible éditables, y compris les métadonnées
indépendantes DSS, photo premium et image visuelle. Elle démarre avec les
indicateurs éditables **Essentielles** et **Étendues**, deux listes disjointes,
chaque cible avec ses modes (visuel, photo ;
`sky-data/target-selection.json`).
Sa section d’administration **Initialisation** exporte les données de domaine
éditables dans un paquet JSON privé ; une autre instance peut ainsi être
initialisée sans copier sa base SQLite ni les octets des médias. Voir [Paquet de
données d’initialisation](STATIC_DATA.md).

Les modes **Photo** et **Visuel** du planificateur résolvent séparément les
images de cible : les références visuelles sont optionnelles et retombent sur
l’image photographique. En cadrage serré, le mode visuel utilise aussi un fond
DSS2 rouge monochrome et enregistre des aperçus de cadrage du même type. Les
crédits restent attachés à leur variante d’image. Voir [Mode visuel et images de
cadrage du planificateur](PLANNER_VISUAL_MODE.md) pour le contrat des sources,
les gestes mobiles et la checklist de vérification.
Une première sélection de 22 cibles emblématiques reçoit une photographie
NOIRLab locale avec droits suivis ; toutes les autres conservent le fallback
photographique DSS.

Lorsque la connexion privée est active, le planificateur demande clairement
de continuer en invité ou de se connecter. Les plans invités restent dans le
stockage local de ce navigateur. Les plans d’un utilisateur connecté
appartiennent à son organisation personnelle et sont sauvegardés automatiquement
sur le serveur, sans déplacer la mise en page de l’éditeur. Quand un
navigateur qui garde des plans d’invité se connecte, un serveur vide les
reçoit, un serveur qui contient déjà des plans demande d’abord, et ce qui est
emporté quitte le stockage du navigateur ; réessayer ne duplique jamais un plan.

Chaque plan conserve un historique local annuler/rétablir pour son titre, ses
éléments, son lieu, son matériel et sa préférence d’altitude. Ces contrôles
restaurent à la fois le plan et son contexte d’édition. Ils ne remplacent ni la
copie serveur authentifiée ni un historique en base.

Export de ses données : depuis les réglages de l’application et la page du
compte sur le web, « Exporter mes données » écrit
`planastro-export-<date>.zip` — un JSON par élément coché (plans, lieux et
horizons, matériel, cadrages, journal et bilans, fond de ciel mesuré) et un
README avec la version du format — qu’un portail privé peut charger. Gratuit ;
les images de la galerie restent dans l’espace.

## Responsive

Sur grand écran, le panneau est à droite et se rétracte latéralement. Sous
850 px, il passe sous l’image et se rétracte vers le bas. Chaque zone possède
son propre défilement afin d’éviter un scroll global parasite. La légende reste
visible même lorsque le panneau est masqué.

## Administration

La page `/admin` permet de sélectionner les fichiers détectés, définir la cible,
les objets, tags, descriptions et principales relations, puis éditer les blocs
JSON avancés. L’écriture est atomique et n’a lieu que dans le dossier de
métadonnées. L’accès est contrôlé côté serveur par l’adresse IP réelle transmise
par le serveur Node intégré.
