# Plate solving local

Le portail peut résoudre une image avec Astrometry.net, conserver le fichier WCS
et produire une surcouche interactive. Cette fonction est facultative : toutes
les autres pages fonctionnent sans les binaires ni les index.

## Dépendances

Les commandes suivantes doivent être accessibles dans `PATH` ou déclarées par
variable d’environnement :

- `solve-field` ;
- `wcsinfo` ;
- `plot-constellations`.

Le catalogue HYG v4.1 ajoute les noms et magnitudes d’étoiles. Placez son CSV à
l’emplacement donné par `ASTRO_PORTAL_HYG_CATALOG`. Sans HYG, les objets issus
d’Astrometry.net restent disponibles, mais les étoiles nommées ne sont pas
ajoutées.

## Index

Astrometry.net utilise des index adaptés à la taille apparente des motifs
stellaires. Installer uniquement une plage arbitraire peut faire échouer les
champs très larges ou très étroits. Conservez les index sous
`ASTRO_PORTAL_ASTROMETRY_INDEX_DIR` et ajustez `scaleLow/scaleHigh` par cible si
nécessaire.

## Indices par cible

```json
{
  "plateSolveHints": {
    "ra": 83.822,
    "dec": -5.391,
    "radius": 4,
    "scaleLow": 1,
    "scaleHigh": 4,
    "downsample": 2,
    "cpuLimit": 90
  }
}
```

RA/DEC sont facultatifs. Sans eux, la résolution est aveugle. `scaleLow` et
`scaleHigh` expriment la largeur du champ en degrés.

## Cycle d’une résolution

1. L’API calcule une clé stable cible/version.
2. `solve-field` écrit ses résultats dans `<runtime>/plate-solves/<clé>/`.
3. `plot-constellations` fournit les objets étendus.
4. Les étoiles HYG sont projetées avec la matrice WCS.
5. `annotations.json` est mis en cache et réutilisé.

En cas d’échec, `status.json` et `solve.log` restent dans ce dossier. Un nouvel
essai explicite peut être demandé avec `?retry=1` sur l’API de résolution.

Les fichiers runtime sont régénérables et ne doivent pas être publiés dans Git.
