# Remplir une nuit automatiquement

« Remplir la nuit » propose de quoi occuper une nuit pour le temps libre d’un
plan. C’est une proposition à relire, cible par cible, avant de l’appliquer ;
elle ne change jamais ce que le plan contient déjà.

Les règles sont écrites une seule fois dans le cœur ouvert
(`packages/planner/src/auto-fill.js`, `autoFillNight`) et figées par les
fixtures `auto-fill-night` et `auto-fill-free-slots`.
L’algorithme est déterministe : la même nuit, le même plan et le même matériel
donnent la même proposition sur tous les clients.

1. **Les candidates** sont le catalogue du planificateur pour le lieu, la nuit
   et le matériel du plan, sans les cibles déjà dans le plan, chacune avec son
   score de la nuit ([le score d’une cible](PLANNER_SCORE.md)).
2. **L’ordre** : la part du maximum propre au score, la plus haute d’abord
   (comparée par produit en croix, jamais un pourcentage arrondi) ; une cible
   sans score en dernier ; à égalité, la culmination la plus tôt, puis
   l’identifiant.
3. **Le placement** : dans la nuit du plan (la durée choisie quand il y en a
   une) et son temps libre, chaque candidate passe par la cascade de placement
   utilisée quand on ajoute une cible à la main (position idéale, créneau
   libre, créneau raccourci ; un chevauchement n’est jamais accepté). Un
   créneau dure le temps recommandé de la cible, entre **45 et 180 minutes** ;
   une cible que la cascade ne peut que raccourcir sous 45 minutes est écartée.
   Au plus **six** cibles sont proposées.
4. **Les raisons** : chaque cible dit pourquoi elle est là (elle passe au
   méridien à telle heure, elle culmine avant la rosée, elle est haute dès le
   début de la nuit, ou le meilleur créneau libre qu’elle a trouvé) ; chaque
   créneau libre de 15 minutes ou plus qui reste dit pourquoi il est vide
   (nuages, rosée, Lune, aucune cible au-dessus de la hauteur minimale, la
   limite de six, un créneau trop court).

Appliquer ajoute les cibles gardées au plan en **une seule** modification : un
seul « Annuler » les retire toutes. Les nombres 45, 180, 6 et 15 sont
`autoFillRule` ; en changer un change la règle et ses fixtures.

## Suggestions pour un nombre demandé

`suggestNight` (`packages/planner/src/suggest-night.js`) active le résultat
étendu d’`autoFillNight`. Le moteur de placement est unique ; un appel sans
nouvel argument de suggestion conserve le résultat historique et sa limite de
six cibles. `autoFillFreeSlots` ne change pas. Les suggestions font partie
du cœur ouvert.

Les entrées existantes restent les candidates, la nuit, sa plage, les éléments
du plan, la météo, la Lune, les filtres et le mode. S’y ajoutent :

| Entrée            | Sens                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`           | Maximum entier positif, ou `"all"` sans limite de six ; 6 par défaut.                                                                                                                                                                                                                                                     |
| `kept`            | Créneaux cochés `{ id, startMinute, endMinute }`, ou éléments du résultat précédent ; positions et champs fournis conservés. Ils comptent dans le maximum demandé.                                                                                                                                                        |
| `excluded`        | Identifiants déjà proposés à écarter.                                                                                                                                                                                                                                                                                     |
| `history`         | `{ id, date, outcome, mode?, acquiredMinutes?, plannedMinutes?, noteThen? }`, une ligne par cible et par nuit ; `done` signifie capturée en photo, `done` et `observed` en visuel. `partial` et `abandoned` ne signifient jamais capturée ; une ligne `partial` compte, pour ce qui a été fait, dans le malus ci-dessous. |
| `continuing`      | `{ id, acquiredMinutes, goalMinutes, projectName }` ; objectifs inachevés d’abord, classés entre eux par score.                                                                                                                                                                                                           |
| `excludeCaptured` | Faux par défaut : une cible capturée reste dans le pool et paie un malus (ci-dessous). Vrai écarte les cibles capturées et classe sans malus.                                                                                                                                                                             |
| `noteNow`         | Note de ce soir (0 à 100) pour la nuit, le lieu et le créneau suggérés ; absente ou inconnue, le ciel de ce soir n’apporte aucun crédit.                                                                                                                                                                                  |
| `date`            | Date civile de la nuit, pour compter l’ancienneté de la dernière fois ; par défaut, la date du début de la nuit.                                                                                                                                                                                                          |
| `tier`            | Numéro positif de la dizaine ; 1 par défaut. Position affichable : 1–10, 11–20, etc.                                                                                                                                                                                                                                      |
| `seed`            | Graine facultative ; absente pour la première liste stricte de la feuille.                                                                                                                                                                                                                                                |
| `only`            | Sélection à appliquer : ces identifiants seuls sont replacés dans l’ordre strict du classement, sans remplacement.                                                                                                                                                                                                        |
| `layout`          | `"night"` par défaut, ou `"list"` pour dix suggestions indépendantes à l’accueil.                                                                                                                                                                                                                                         |

Le pool écarte les cibles du plan, les créneaux cochés et les exclusions ; avec
`excludeCaptured`, il écarte aussi les cibles capturées. Chaque cible capturée
rencontrée dans ce pool revient avec sa dernière date de capture, quel que soit
l’interrupteur. Les
objectifs à poursuivre portent `group: "continue"` et `progress` ; les autres
portent `group: "night"`. Un objectif atteint n’est pas prioritaire.

**Le malus d’une cible déjà faite.** Une cible qui a une dernière fois (sa
ligne `done`, `partial` ou, en visuel, `observed` la plus récente) paie
`40 × fait × ancienneté × (1 − remontée)` points, au dixième, retirés de son
pourcentage d’adéquation ce soir pour la classer (jamais sous 0). `fait` est ce
qui a été fait, de 0 à 1 (photo : les minutes acquises sur l’intégration
recommandée de la cible, sinon sur les minutes du plan, sinon complet ; visuel :
minutes sur 20) ; `ancienneté` vaut `0,5 ^ (jours / demi-vie)`, la demi-vie
étant de 270 jours en photo et de 45 en visuel, et le malus est nul sous 0,05 ;
`remontée` est ce que ce soir apporte de plus que cette fois,
`(noteNow − noteThen) / 30` entre 0 et 1, au plus 0,5 quand `noteThen` vaut 64
ou plus, 0 quand une note est inconnue. Les constantes forment une table
(`suggestionMalusRule`) et la fonction `suggestionMalus` est rejouée par la
fixture partagée `suggestion-malus`. La comparaison reste le produit en croix
exact du score tant qu’aucune des deux cibles ne paie de malus. Le groupe à
poursuivre et une demande avec `only` sont exemptés ; chaque cible classée qui a
une dernière fois porte `previous: { date, outcome, noteThen, noteNow, malus }`.

Pour le reste, le classement strict par part du score reste inchangé. La variété reporte la
quatrième cible d’un même type connu à la dizaine suivante ; un type inconnu
n’est pas plafonné. Les cibles cochées comptent dans le plafond ; un pool peu
varié ne remplit pas une feuille avec plus de trois cibles d’un type par dix
cibles sélectionnées. Une dizaine peut donc être incomplète. Dans chaque
dizaine, une graine trie par part du score sur 100 avec un décalage dans
**[−3, +3]** ; les objectifs à poursuivre restent premiers et les cibles sans
score dernières. Aucun membre ne change de dizaine. À partir de la deuxième,
`lowered` est vrai et le score reste disponible.

`suggestionSeed({ date, latitude, longitude, tier })` construit
`YYYY-MM-DD|latitude|longitude`, coordonnées à deux décimales ; `tier` ajoute
`|tier` pour le renouvellement. `hashSuggestionSeed` utilise FNV-1a sur les
unités UTF-16 (état initial 2166136261, multiplicateur 16777619). Le générateur
xorshift32 décale à gauche de 13, à droite sans signe de 17, à gauche de 5 ;
son état entier non signé sur 32 bits est divisé par 4294967296. Un hash nul
prend l’état 1. Ces règles et les fixtures rendent la suite reproductible
bit pour bit dans n’importe quel langage.

En photo, les durées recommandées restent **45–180 min**, plancher **45 min**.
En visuel, **20 min**, jamais raccourcies. Une cible qui ne tient pas est
sautée. Rien dans le plan ni dans les créneaux cochés ne bouge. Décocher est
une modification de la sélection côté appelant, qui laisse libre le créneau
affiché ; l’appel avec `only` au moment d’appliquer recalcule le placement.
Toutes les nouvelles cibles passent par `plannedItemPlacement` et son repli
avec chevauchement est refusé.

L’estimation prend les créneaux libres avant ajout des propositions, chacun
au moins aussi long que le plancher du mode. Leur durée totale divisée par
`slotMinutes`, arrondie vers le bas, donne le nombre. En photo, la durée est
la médiane basse des durées recommandées des dix premières cibles du
classement strict, arrondie à 15 min (demi vers le haut) ; en visuel, 20 min.
Le nombre est une estimation, pas une garantie de placement.

Le résultat étendu ajoute `requested`, `placed`, `position`, `estimate`,
`captured` et `shortfall`. Les éléments ajoutent `score: { total, max }` (ou
null), `type`, `group`, `progress`, `tier`, `lowered` et `kept`. Les éléments de
la nuit sont chronologiques. Si moins de cibles tiennent, `shortfall` reprend
la raison du plus long créneau libre restant au moins aussi long que le
plancher, le premier en cas d’égalité, avec `start`, `startMinute` et `minutes`.
Sans tel créneau : `{ kind: "short", freeMinutes, minimumMinutes }`, avec tout
le temps restant, y compris les intervalles sous le seuil d’affichage de
15 min. Si assez de cibles tiennent, ou avec `count: "all"`, il vaut null.
Les raisons sont des genres et des données, jamais des phrases.

Avec `layout: "list"`, le plan ne retire que ses identifiants de cibles.
Chacune des dix suggestions est placée seule sur la nuit vide ; `bestWindow`
est sa plus longue fenêtre de visibilité à l’intérieur de la plage de nuit,
la première en cas d’égalité, et `maxAltitude` est lu dans cette fenêtre.
Les créneaux de liste peuvent se chevaucher ; ils ne forment pas un plan.
Appliquer les identifiants choisis avec `layout: "night"` produit le plan.
Une nuit illisible donne null dans les deux dispositions.
