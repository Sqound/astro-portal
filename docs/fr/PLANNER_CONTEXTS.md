# Contextes du planificateur

Le planificateur partage une date et un lieu, puis propose des onglets nommés.
Chaque plan possède son mode, son matériel, ses filtres multiples, ses contraintes,
ses préférences de navigation, ses cibles et ses intervalles. Le lieu et la date
restent le contexte partagé de la nuit. Les étapes se lisent dans l'ordre de l'usage :
1 Lieu et date, qui contient la prévision astronomique et météo de la nuit ; 2 Matériel
(avec le choix Photo/Visuel) ; 3 Contraintes ; 4 Choisir les cibles, qui s'ouvre sur le
nombre de cibles adaptées et sur « Suggérer les meilleures cibles » ; puis Organiser la
nuit (étape 5, jusqu'à ce qu'elle devienne un panneau). Les onglets des plans suivent
l'étape 1.

## Persistance et migration

`planner-state.js` définit le format portable version 2. Les `nights[]` contiennent
des instantanés de lieu ; chaque entrée de `plans[]` référence un `nightId` et
contient tous ses réglages. La collection plate de plans et la projection des
réglages actifs préservent les interfaces des composants et des exports existants.
Un lieu possède un identifiant, une version, un nom, des coordonnées, un fuseau IANA
et un horizon. Modifier un lieu enregistré ne réécrit pas les nuits historiques.
Le supprimer de la bibliothèque ne supprime pas leurs instantanés.

Les invités conservent leurs plans dans le navigateur, avec une copie `:before-v2`
lors de la migration. Les utilisateurs connectés conservent la persistance SQLite
isolée par compte. La migration SQL 14 ajoute les réglages des plans et les contextes
de nuit sans remplacer les lignes des cibles. Les sauvegardes sont sérialisées.
Les documents invalides et les écritures d’anciens clients sont refusés avant toute
modification. L’import conserve les plans déjà présents.

Les anciens réglages non enregistrés sont signalés comme étant à vérifier. Un lieu
historique manquant n’est pas déduit du lieu courant ; les anciens horizons sans
coordonnées sont conservés pour une association explicite. De nouvelles contraintes
ne suppriment jamais silencieusement les cibles ou intervalles : les cibles devenues
incompatibles gardent leur courbe et un motif est affiché.

Le catalogue stocke l’ascension droite en heures, le planificateur et la carte en
degrés J2000. La conversion est effectuée à la sortie de l’API catalogue destinée
au planificateur. Un ancien instantané n’est corrigé que si ses deux coordonnées
correspondent exactement à l’ancienne représentation en heures du même objet.
La valeur initiale est conservée et le plan est signalé pour vérification.
Les centres des cadrages libres ne sont jamais convertis ni déplacés.

## Cartes, cadrages et filtres

Liste/Carte et Absolue/Horizon sont deux choix distincts. La carte absolue n’a pas
de curseur horaire : son ciel J2000 est indépendant de l’heure d’observation.
Elle conserve les couches, le zoom, le champ du matériel, le centrage, les cadrages
libres exacts et leurs instantanés de matériel. La carte horizon garde l’heure,
les projections linéaire/circulaire, la rotation et les étiquettes.
L’éditeur de lieu dessine les obstacles sans cibles astronomiques, car aucun
montage de plan n’est encore disponible à cette étape.

Les onglets de plans et les commandes de mode partagent les mêmes symboles
appareil photo/œil ; Liste/Carte et Absolue/Horizon conservent chacun leur paire
d’icônes explicites. Le compteur de cibles affichées reste sur la même ligne que
Liste/Carte. Tant qu’une
date et un lieu exploitable ne sont pas disponibles, le plan actif affiche un
message préalable bien visible au lieu d’échouer silencieusement. Les descriptions
de cibles sont rendues dans une couche de page, au-dessus des cartes et des fiches ;
sur écran étroit, cette couche devient un panneau plein écran refermable.

Les filtres sélectionnés sont des alternatives, pas une intersection. Si la
restriction matérielle est activée, une cible compatible avec au moins un filtre
reste proposée ; aucun filtre sélectionné signifie aucune restriction par filtre.
Une compatibilité inconnue n’est pas assimilée à une incompatibilité. Les familles
documentées dans le guide d’observation sont prioritaires ; à défaut, l’estimation
par type d’objet est explicitement indiquée comme indicative, sans inventer de
recommandation éditoriale. Les seuils lunaires propres aux filtres sont évalués
avec les filtres compatibles, indépendamment de leur ordre de sélection.
Les contraintes avancées de la monture sont évaluées pour chaque position
échantillonnée d’une cible. Si l’évitement du zénith est actif, la carte Horizon
trace sa limite d’altitude en orange et grise les cibles situées dans la zone exclue
à l’heure affichée. Le même évaluateur applique le zénith et le secteur de câbles
aux créneaux de recommandation : la carte représente donc le calcul, sans règle
visuelle parallèle.

## Services géographiques

Leaflet affiche les tuiles interactives OpenStreetMap avec attribution. La recherche
d’adresse et le géocodage inverse optionnel passent par Photon via
`/api/planner-location`, uniquement sur recherche explicite ou choix d’un point.
Les requêtes sont bornées, sérialisées et brièvement conservées en mémoire.
`ASTRO_PORTAL_GEOCODER_URL` permet une instance Photon auto-hébergée. Les recherches
et les coordonnées à géocoder sont transmises à ce service ; les tuiles révèlent
la zone consultée au fournisseur cartographique. Le fuseau est résolu localement
par `geo-tz`, jamais à partir de celui de l’ordinateur ou d’un décalage UTC fixe.
L’autorisation GPS est facultative : carte et coordonnées manuelles restent
utilisables. Une panne du géocodeur n’empêche pas d’enregistrer des coordonnées
valides. La disponibilité des services tiers n’est pas garantie.

L’authentification, les images, l’hébergement des versions et les chemins des
données privées sont inchangés. Sauvegarder SQLite avant la migration additive.

## Lieux et interactions avec l’horizon

La nuit utilise un seul sélecteur de lieu. Il permet de retrouver un contexte
correspondant déjà enregistré pour cette date ; les anciens contextes restent
accessibles depuis les plans enregistrés. Deux boutons distincts ouvrent la
consultation seule de l’horizon ou l’éditeur de lieu. Celui-ci démarre en vue
circulaire. Réinitialiser signifie remettre tous les obstacles à zéro. Les nouveaux
profils enregistrés sont appliqués, sans case d’activation ni confirmation
supplémentaire à l’étape Horizon. Les instantanés historiques restent inchangés.

À l’enregistrement, le lieu à mettre à jour précède son nom modifiable. Si sa
position enregistrée se situe à plus de 10 km du point choisi, un avertissement
indique la distance calculée. Il n’interdit pas un déplacement volontaire du lieu.

La carte Horizon du plan affiche une heure compacte en haut à gauche. Les gestes horizontaux
font avancer ou reculer dans la nuit ; les gestes verticaux restent disponibles
pour faire défiler la page. Le curseur horaire classique est conservé pour le
clavier. Dans l’éditeur d’intervalle, les légendes sont placées après les actions,
sous l’axe des heures. Un croissant bleu identifie l’extrémité de la courbe lunaire ;
l’écart Lune–cible utilise des teintes pastel rose, pêche et menthe, distinctes du
remplissage ambre de l’interface.
La vue d’ensemble utilise une seule courbe lunaire pour toutes les bandes de cibles.
Ouvrir une cible conserve toutes les bandes visibles et déplace la courbe lunaire
dans l’éditeur détaillé. Si l’intervalle chevauche déjà une autre cible, déplacer
son début déplace l’intervalle entier en conservant sa durée. Les aperçus de carte
gardent de petites actions explicites d’ajout/retrait. Les vues Absolue et Horizon
utilisent la même action compacte dans la zone de détails, sans transformer toute
l’image en zone d’action involontaire.

## Requêtes météo

`/api/planner-weather` partage une prévision par lieu entre le calendrier et la nuit.
Modifier le matériel ou les contraintes ne redemande plus la météo. Le serveur
mutualise les requêtes simultanées et conserve les résultats Open-Meteo 20
minutes, pour au plus 64 lieux. Si Open-Meteo échoue, le serveur interroge
Locationforecast de MET Norway et respecte ses en-têtes de cache `Expires` et
`Last-Modified`, avec un minimum de 30 minutes. Si les deux fournisseurs
échouent, une prévision déjà reçue depuis moins de trois heures peut être
affichée avec son heure de réception et un avertissement explicite. Sans résultat
utilisable, l’interface nomme les deux fournisseurs indisponibles, maintient la
planification et propose de réessayer. Les erreurs 429 respectent `Retry-After` ;
les autres échecs temporaires imposent un délai avant nouvelle tentative. Une
donnée absente n’est pas convertie en zéro nuage, humidité, visibilité ou risque
de pluie. Le score de la nuit est repondéré sur les mesures réellement présentes.
La frise horaire distingue la couverture nuageuse, le risque de pluie,
l’humidité, le vent et la visibilité avec des icônes séparées. L’humidité et le
risque de pluie ne partagent donc jamais le même symbole de goutte.

Une nuit future située au-delà de la fenêtre de prévision affiche un encart
d’information spécifique, distinct d’une panne du fournisseur. Il précise que la
météo apparaîtra automatiquement à l’approche de la date et que les calculs
astronomiques restent disponibles. Une date passée n’affiche pas ce message destiné
aux dates futures.

Les fournisseurs publics possèdent des limites et ne garantissent pas leur
disponibilité : le cache ne peut pas supprimer un quota déjà atteint en amont.
Voir la [documentation Open-Meteo](https://open-meteo.com/en/docs), ses
[limites de service](https://open-meteo.com/en/pricing), ainsi que la
[documentation Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
et la [licence](https://docs.api.met.no/doc/License.html) de MET Norway.
L’interface signale quand MET Norway est actif et crédite ses données CC BY 4.0
adaptées. Elle précise aussi que les indicateurs indisponibles dans le secours
sont représentés par un tiret.

## Estimation de la pollution lumineuse

`/api/planner-sky-quality` échantillonne le service WMS compatible
LightPollutionMap configuré, une fois par lieu d’observation arrondi à trois
décimales. Le résumé initial de la prévision astronomique affiche l’équivalence
Bortle et le SQM modélisé à côté de la nuit astronomique et de l’illumination
lunaire. Les requêtes simultanées sont mutualisées ; le résultat de ce modèle
annuel est conservé 30 jours et une estimation existante peut servir de repli
pendant 370 jours. La réponse ne contient jamais les coordonnées. Cette valeur
issue de VIIRS est une aide à la planification, pas une mesure SQM effectuée sur
place.
