# Inscription Thinks — règlement, questionnaire et rôle Discord

Application séparée du bot de news, prévue pour **Cloudflare Workers Free + D1 Free**. Pas de processus Discord connecté en permanence : les requêtes HTTP attribuent le rôle lorsque le formulaire est validé.

## Parcours livré

1. Le nouveau membre rejoint le serveur et voit le salon `#inscription`.
2. Il ouvre le lien de l’application, lit le règlement et coche son acceptation.
3. Il connecte son propre compte Discord (permission OAuth `identify` uniquement).
4. Il remplit les six questions obligatoires et la septième facultative.
5. Le serveur enregistre les réponses privées et attribue le rôle `Membre` au compte authentifié.

L’application vérifie que la personne est déjà membre de Thinks et ne lui attribue aucun rôle si Discord la considère encore en attente d’acceptation de son règlement natif (`pending`). Le règlement affiché sur le site permet d’exiger une acceptation même si le réglage natif n’est pas disponible dans l’interface Discord. Il ne faut pas annoncer que les salons sont cachés tant que leurs permissions n’ont pas été configurées et testées.

Les réponses ne décident pas de l’admission : toutes les tranches d’âge et de budget proposées sont acceptées. L’accès est conditionné au règlement et à la complétude, pas à la situation financière.

## Questionnaire

Le contenu est dans `src/worker.mjs`, constante `QUESTIONS`. Les questions 1 à 4 et 6 sont à choix unique. La question 5 accepte plusieurs réponses, sauf « Rien pour l’instant » qui doit être sélectionné seul. La question 7 est un texte facultatif de 1 000 caractères maximum.

Les tranches de budget ont été rendues non chevauchantes : 0 €, 1–50 €, 51–200 €, 201–499 €, 500 € et plus. Les cinq règles proposées dans `RULES` sont à relire et adapter avant publication ; changer `RULES_VERSION` à chaque modification du règlement.

## Configuration Discord

### 1. Rôle et salons

- Créer un rôle `Membre` sans permission d’administration.
- Dans les catégories réservées à la communauté, refuser **Voir le salon** à `@everyone` et l’autoriser à `Membre` ; synchroniser les salons de ces catégories et examiner les autres rôles susceptibles de donner accès.
- Laisser `#bienvenue`, `#règlement` et `#inscription` visibles à `@everyone`. `#inscription` peut rester en lecture seule, avec le lien du formulaire.
- Le processus d’accueil natif existant affiche des salons publics par défaut. Il ne réalise pas ce verrouillage. Adapter les catégories et l’accueil pour que les salons privés ne soient pas accessibles avant le formulaire ; un questionnaire natif devenu redondant peut être retiré après vérification du nouveau parcours.
- Les membres déjà présents sans rôle `Membre` perdraient aussi l’accès si l’on applique le verrouillage. Préparer leur migration avant de changer les permissions.

### 2. Application Discord

Dans https://discord.com/developers/applications :

1. Créer une application `Thinks Accueil`.
2. Dans **Bot**, récupérer le token et le garder dans le gestionnaire de secrets Cloudflare uniquement.
3. Dans **OAuth2**, relever l’Application/Client ID et le Client Secret.
4. Ajouter comme Redirect URI l’URL exacte `https://TON-WORKER.workers.dev/auth/callback`.
5. Inviter le bot sur Thinks avec uniquement **Gérer les rôles** (`268435456`). Exemple d’URL à compléter : `https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&scope=bot&permissions=268435456&guild_id=1498690479288483932&disable_guild_select=true`.
6. Placer le rôle du bot **au-dessus du rôle Membre**, et sous les rôles de modération. Ne pas donner Administrateur.

Le code utilise l’API REST pour un membre précis ; il ne lit pas les messages, ne demande pas d’intent privilégié et ne stocke pas les jetons OAuth des utilisateurs.

Activer le mode développeur Discord dans les paramètres utilisateur, puis clic droit sur le rôle `Membre` → copier son identifiant. L’ID du serveur Thinks a été repris de l’interface fournie : `1498690479288483932`.

## Déploiement Cloudflare

Rester sur **Workers Free** et **D1 Free**. Les quotas s’appliquent : https://developers.cloudflare.com/workers/platform/limits/ et https://developers.cloudflare.com/d1/platform/pricing/. Il n’est pas nécessaire de passer à une formule payante pour ce projet.

Depuis le dossier `onboarding`, avec Node.js 24 et npm :

```sh
npx wrangler@4 login
npx wrangler@4 d1 create thinks-inscription
```

Reporter le `database_id` retourné dans `wrangler.jsonc`. Compléter `DISCORD_CLIENT_ID` et `DISCORD_MEMBER_ROLE_ID`. Les trois identifiants sont publics ; les secrets ne doivent jamais figurer dans ce fichier.

Configurer les deux secrets (saisie masquée dans le terminal) :

```sh
npx wrangler@4 secret put DISCORD_CLIENT_SECRET
npx wrangler@4 secret put DISCORD_BOT_TOKEN
npx wrangler@4 d1 migrations apply thinks-inscription --remote
npx wrangler@4 deploy
```

Reporter ensuite l’URL publique retournée dans `APP_ORIGIN` (origine HTTPS seule, sans chemin ni slash final), enregistrer son `/auth/callback` dans les redirections OAuth Discord, puis redéployer avec `npx wrangler@4 deploy`.

Le premier déploiement sert à obtenir l’URL ; ne pas partager le lien aux membres avant la configuration de l’origine, de la redirection, des permissions et le test complet. Aucun token ni secret n’est à copier dans le chat ou GitHub. Le webhook du bot de news n’est pas un token de bot et ne peut pas être réutilisé ici.

## Réponses privées

Les réponses sont dans la base **Cloudflare D1 → thinks-inscription → table applications**, accessible aux personnes autorisées sur le compte Cloudflare. Il n’y a pas de liste publique des réponses ni de rôles qui exposeraient l’âge, le budget ou les blocages.

- `answers_json` contient le questionnaire.
- `rules_accepted_at` et `rules_version` indiquent l’acceptation.
- `role_granted_at` indique si l’attribution a été confirmée ; un champ vide signale une tentative à terminer.
- Un nettoyage quotidien supprime les réponses de plus de 90 jours (sans retirer le rôle Discord). Cette durée se règle dans la fonction `scheduled` et dans le texte du formulaire.
- Les administrateurs peuvent supprimer une réponse sur demande, par son `user_id`. Les sauvegardes gérées par la plateforme peuvent avoir leur propre durée de conservation.

Les règles et la notice d’information doivent correspondre aux pratiques réelles de l’équipe avant l’ouverture aux membres. Aucun consentement à la prospection commerciale n’est demandé ou supposé.

## Vérifications

```sh
node --test tests/worker.test.mjs
```

Tests d’intégration avec SQLite en mémoire et API Discord simulée : état OAuth à usage unique, cookies, origine et CSRF, session expirée, réponses invalides, membre absent ou en attente, échec d’enregistrement, échec d’attribution et nouvelle tentative, nettoyage des données et échappement HTML.

Après déploiement, utiliser un **compte membre de test sans privilèges** : vérifier les salons visibles avant acceptation, remplir le formulaire, vérifier le rôle puis les salons débloqués et la ligne privée en D1. Un compte administrateur ne convient pas pour tester le verrouillage, car il contourne les permissions des salons.

Le code préparé et les tests locaux ne prouvent pas que le bot est installé sur le serveur : la validation réelle nécessite les identifiants, secrets, invitations et permissions configurés dans Discord et Cloudflare.
