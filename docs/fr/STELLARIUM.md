# Stellarium Web Engine

L’atlas interactif embarque une copie construite localement de
[Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine),
sous licence GNU AGPL v3 ou licence commerciale de ses auteurs. Astro Portal
Core utilise l’option GNU AGPL v3.

## Éléments inclus

`public/vendor/stellarium/` contient les fichiers JavaScript et WebAssembly
générés, non modifiés, ainsi que le sous-ensemble requis des données de ciel
compactes : étoiles jusqu’à la magnitude 7, index et illustrations de la
culture céleste occidentale, objets du ciel profond et relevé de la Voie
lactée.

Les illustrations des constellations de la culture céleste occidentale sont
des dessins de Johan Meuris, sous [licence Art Libre](https://artlibre.org/) ;
les textes et les données de la culture céleste sont sous CC BY-SA. Le
catalogue les crédite ainsi partout où l’image d’une constellation est
montrée : « Dessins des constellations : Johan Meuris (Stellarium), licence
Art Libre ». Les images des étoiles brillantes et des constellations de
`examples/sky-culture-images/` sont des rendus de la carte du ciel de
l’application faits à partir de ces éléments (voir le CREDITS.md du dossier).

Ils proviennent de la révision amont
`e7201246bdf7289c50a3ec59e98f69f0f9383b05`, construite avec Emscripten
1.39.17 et `make js-es6`. La procédure complète de reconstruction, les sommes
SHA-256 et le code source correspondant sont décrits dans la
[notice anglaise](../STELLARIUM.md).

## Liens vers une cible

Les liens du planificateur et des fiches ouvrent la route publique de
Stellarium Web avec l’identifiant de la cible et le champ souhaité. Ce sont
volontairement de simples liens Web : un navigateur ne peut pas déterminer de
façon fiable si Stellarium Desktop est installé ni le lancer avec un contrat de
lien portable.

Le lien public de Stellarium Web accepte le cadrage de la cible, mais n’expose
pas de paramètre URL documenté pour imposer les lignes, libellés ou dessins des
constellations. Ces choix restent à l’utilisateur dans Stellarium Web. Une
future intégration embarquée et contrôlée pourrait régler les propriétés du
moteur ; le portail ne dépend ni du service Remote Control local ni de la
modification des préférences Stellarium du visiteur.

## Relevés du planificateur et cadrages

La carte embarquée du planificateur est indépendante des liens sortants vers
Stellarium Web. Elle commence par le relevé large couleur CTA-FRAM, puis passe
à un fond DSS détaillé au champ de 18°. Le mode photo utilise DSS couleur ; le
mode visuel utilise le relevé HiPS DSS2 rouge monochrome. Ce dernier est une
couche distincte, et non un filtre appliqué à tout le canvas WebGL : les
constellations et overlays du planificateur restent donc inchangés.

Les aperçus des cadrages sauvegardés utilisent la source HiPS qui correspond au
mode de leur création : DSS2 couleur en photo et DSS2 rouge en visuel. Le
contrat complet des variantes d’image, crédits, gestes mobiles et vérifications
de release est décrit dans [Mode visuel et images de cadrage du planificateur](PLANNER_VISUAL_MODE.md).
