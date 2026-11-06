# Politique de sécurité

Merci de ne pas publier une vulnérabilité exploitable dans une issue publique.
Utilisez la fonction privée « Report a vulnerability » de GitHub lorsque celle-ci
est activée sur le dépôt, ou contactez le mainteneur par un canal privé connu.

Indiquez la version, la route concernée, les conditions d’exploitation et une
reproduction minimale sans donnée personnelle.

## Modèle de sécurité

- la galerie est destinée à être lisible par tous les visiteurs autorisés par
  le réseau ou le tunnel ;
- l’administration est locale ou limitée par IP et toujours bloquée via
  Cloudflare ;
- les chemins média sont confinés à leurs racines configurées ;
- les TIFF sont privés au LAN dans le scénario Cloudflare pris en charge ;
- aucune authentification utilisateur complète n’est fournie.

Une adresse IP n’est pas une authentification adaptée à Internet. Si vous
exposez l’administration par un autre reverse proxy, ajoutez une authentification
forte au niveau du proxy et bloquez les routes d’administration par défaut.
