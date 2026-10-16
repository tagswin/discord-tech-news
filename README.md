# Le Radar Tech — Discord

Projet Python gratuit : un récapitulatif à **9 h et 18 h, heure de Paris**, et une veille toutes les dix minutes via GitHub Actions. Aucun serveur à louer, aucun abonnement et aucune clé d'IA nécessaires.

Rubriques : IA, finance/fintech, cybersécurité, smartphones, informatique/logiciels, gaming et robotique/spatial. Une actualité par rubrique disponible ; les articles publiés depuis plus de 24 heures sont exclus.

## Installation, étape par étape

### 1. Rendre le dépôt public

Dans **Settings → General → Danger Zone → Change repository visibility**, choisir **Public**. Le code et l'historique des actualités seront publics. Aucun secret ne doit être ajouté aux fichiers.

Le workflow refuse d'utiliser un runner dans un dépôt privé : la veille toutes les dix minutes pourrait dépasser le quota gratuit d'un dépôt privé. Les runners standard sont gratuits pour les dépôts publics : https://docs.github.com/en/billing/concepts/product-billing/github-actions

### 2. Créer le webhook dans Discord

Sur ton serveur Discord, choisir le salon qui recevra les news, puis **Modifier le salon → Intégrations → Webhooks → Nouveau webhook**. Le nommer **Le Radar Tech** et copier son URL. Il faut disposer de la permission de gérer les webhooks.

### 3. Enregistrer le webhook comme secret GitHub

Dans ce dépôt : **Settings → Secrets and variables → Actions → New repository secret**.

- Name : `DISCORD_WEBHOOK_URL`
- Secret : coller l'URL du webhook Discord, puis enregistrer.

Ne pas coller cette URL dans le chat, dans un fichier, une issue ou un commit. Elle donne accès à la publication dans le salon.

### 4. Vérifier la connexion

Aller dans **Actions → Le Radar Tech → Run workflow**. Sélectionner **test-discord**, puis lancer. Un message « Le Radar Tech est connecté » doit apparaître dans Discord. Ce test ne modifie pas l'historique.

Le mode **preview** affiche dans les logs un récapitulatif des articles trouvés, sans envoyer ni modifier l'historique. Il fonctionne à toute heure.

### 5. Activer les horaires automatiques

Dans **Settings → Secrets and variables → Actions → Variables → New repository variable** :

- Name : `BOT_ENABLED`
- Value : `true`

Le prochain lancement programmé initialise l'historique. Les alertes ne portent que sur des articles parus après cette initialisation. Les récapitulatifs peuvent utiliser les articles des dernières 24 heures.

Pour mettre en pause, passer `BOT_ENABLED` à `false`. Les lancements manuels restent possibles. Un lancement manuel en mode **veille** suit les horaires et les règles d'alerte : ce n'est pas un envoi forcé.

## Contenu des messages

Cette version publie **le titre original en français, la rubrique, le média et le lien** vers l'article via Google Actualités. Elle ne génère pas de résumé : les flux Google ne fournissent pas de véritable résumé rédactionnel et le bot n'invente pas le contenu des articles. Les liens peuvent mener à des articles payants, mais le bot utilise uniquement les métadonnées publiques des flux.

Les rubriques sans article inédit sont omises. Si aucune nouvelle actualité n'est disponible, aucun message vide n'est envoyé. La sélection du récapitulatif privilégie la récence, pas un classement journalistique de l'importance.

L'historique des liens et titres est conservé sept jours dans `data/state.json`, puis nettoyé. Un rapprochement lexical limite les doublons entre médias et rubriques, sans garantir une détection parfaite. Les articles déjà envoyés en alerte sont aussi exclus du récapitulatif.

## Détection des actualités majeures

Une alerte exige : un titre correspondant à une règle d'impact dans `config.json`, un article de moins de trois heures paru après l'initialisation, et un titre similaire dans un second domaine de presse autorisé. Deux médias peuvent reprendre la même dépêche : ce recoupement automatique ne garantit pas la véracité. Le message l'indique et fournit les deux liens.

Maximum trois alertes sur 24 heures glissantes, espacées d'au moins deux heures. Une seule alerte peut partir par passage. Les annonces non reconnues par les règles peuvent être manquées ; cette version est volontairement prudente. Modifier `major_pattern` pour régler la sensibilité.

## Horaires et fiabilité

Le workflow se lance toutes les dix minutes ; Python décide si un récapitulatif de 9 h ou 18 h est dû, avec le fuseau `Europe/Paris` et le changement été/hiver. En cas de retard, un récapitulatif peut être rattrapé dans les deux heures suivant l'horaire prévu. Il n'est ensuite plus envoyé pour ce créneau.

GitHub peut retarder ou supprimer des lancements programmés : ce n'est donc pas un service à la minute près. Les workflows programmés d'un dépôt public peuvent être désactivés après 60 jours sans activité. Contrôler l'onglet Actions si le bot reste silencieux : https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

Les flux sont récupérés en parallèle, avec une limite de taille et de temps. Un flux indisponible est signalé dans les logs ; si tous les flux échouent, le passage échoue sans envoyer. Les lancements sont sérialisés. L'historique est enregistré après confirmation de Discord puis commité par Actions. Si l'envoi réussit mais que l'enregistrement ou le push échoue, un doublon reste possible au passage suivant. Ne pas modifier `data/state.json` pendant un lancement et surveiller les exécutions en erreur.

## Personnalisation

Dans `config.json` :

- `categories` : rubriques et recherches Google Actualités en français ; garder au maximum sept rubriques avec le format actuel.
- `allowed_domains` : domaines des médias acceptés ; les sources absentes sont ignorées.
- `excluded_pattern` : filtre des promotions et bons plans commerciaux.
- `digest_hours` : horaires en heure de Paris.
- `max_alerts_per_day` et `major_pattern` : fréquence et règles des alertes.

La rubrique finance inclut la fintech, les marchés et les banques centrales. Les domaines autorisés constituent une sélection initiale modifiable, pas une garantie de qualité de chaque article. Aucun ping `@everyone` ou rôle n'est envoyé.

## Vérification locale

Python 3.11+ suffit sous Linux. Sur Windows, installer les données de fuseaux avec `python -m pip install tzdata`.

```sh
python -m unittest discover -s tests -v
python bot.py --dry-run
```

Le mode dry-run ne nécessite aucun secret et ne poste jamais. Le webhook ne doit être fourni via la variable d'environnement `DISCORD_WEBHOOK_URL` que pour un véritable envoi.
