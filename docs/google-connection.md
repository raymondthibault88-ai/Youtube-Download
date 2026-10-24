# Configurer la connexion Google de la V5.2

Cette préparation est à faire une seule fois par le créateur de l’application. Avoir un compte Google ne suffit pas : Google demande aussi un projet et un client OAuth pour identifier le logiciel qui demande l’accès.

## Préparation dans Google Cloud

1. Ouvrir la [console Google Cloud](https://console.cloud.google.com/), créer ou sélectionner le projet de l’application.
2. Dans **API et services → Bibliothèque**, activer **YouTube Data API v3**.
3. Ouvrir **Google Auth Platform** (Plateforme d’authentification Google) et renseigner le nom de l’application, l’adresse de contact et les informations demandées dans **Branding**.
4. Dans **Audience**, choisir l’audience adaptée. Pour un essai avec un compte Google personnel, utiliser une application externe en mode test et ajouter son adresse dans **Utilisateurs tests**. Un compte Google Workspace peut être soumis aux restrictions de son administrateur.
5. Dans **Accès aux données / Data Access**, ajouter uniquement l’autorisation `https://www.googleapis.com/auth/youtube.readonly`. Elle permet de consulter le catalogue du compte ; elle ne permet pas de modifier les vidéos.
6. Dans **Clients**, créer un client OAuth de type **Application de bureau / Desktop app**, puis télécharger son fichier JSON. Une clé API ou un client de type application Web ne remplace pas ce fichier.

Le passage à une application publique demande les démarches de validation Google appropriées. En mode test externe, les autorisations peuvent expirer au bout de sept jours ; une demande de reconnexion est alors attendue.

## Dans la version test

1. Ouvrir **Bibliothèque → Compte YouTube**.
2. Cliquer sur **Configurer** et sélectionner le JSON Desktop téléchargé depuis Google. Le fichier est copié dans le dossier privé de configuration de l’application.
3. Cliquer sur **Connecter**. La connexion et le consentement s’effectuent dans le navigateur système, sur le site de Google.
4. Choisir le compte ou la chaîne voulu, puis autoriser l’accès en lecture seule. Revenir dans l’application lorsque la connexion est confirmée.

Ne pas transmettre le fichier JSON, les jetons de connexion ou un mot de passe dans le chat ou dans le dépôt Git. Aucun mot de passe n’est demandé dans l’application.

La bibliothèque peut consulter les vidéos de la chaîne et les playlists possédées par le compte. Les listes système « À regarder plus tard » et l’historique ne sont pas disponibles par cette API. L’accès aux métadonnées d’une vidéo privée ne connecte pas automatiquement le moteur de téléchargement à ce compte.

## Stockage et déconnexion

Les jetons restent dans le processus principal Electron. Le jeton permettant de renouveler la connexion est chiffré avec le stockage sécurisé du système ; il n’est pas exposé à l’interface. Si ce stockage est indisponible, l’application refuse l’enregistrement plutôt que d’utiliser un fichier en clair.

**Déconnecter** supprime les données de session locales et demande à Google de révoquer l’autorisation. Si Google est injoignable, la suppression locale reste effectuée et l’application indique comment retirer l’accès depuis les autorisations du compte Google.

Pour le développement, les variables `YOUTUBE_GOOGLE_CLIENT_ID` et, si nécessaire, `YOUTUBE_GOOGLE_CLIENT_SECRET` peuvent être utilisées à la place du JSON. Le fichier déjà sélectionné dans l’application est prioritaire. Aucun identifiant n’est embarqué par défaut dans la version test.

Références : [OAuth YouTube pour applications de bureau](https://developers.google.com/youtube/data/guides/auth/installed-apps), [configuration du consentement Google](https://developers.google.com/workspace/guides/configure-oauth-consent), [expiration des autorisations](https://developers.google.com/identity/protocols/oauth2#expiration).
