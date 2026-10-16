# Audit UI et graphisme — YouTube Downloader 4.0.8

Les neuf points ci-dessous ont été traités dans la version locale 4.0.9. Voir [les correctifs et leur vérification](CORRECTIFS_UI_2026-10-12.md). Ce document conserve les observations de la version 4.0.8.

Audit réalisé le 12 octobre 2026. La base visuelle est sobre et cohérente : les deux modes sont identifiables, les actions principales ressortent et les réglages de conversion suivent une progression compréhensible. Les améliorations les plus utiles concernent la lisibilité et les retours de tâche. Une refonte complète de la mise en page ne paraît pas nécessaire.

## Périmètre et méthode

- Parcours de l’interface locale avec le skill Playwright, dans une session Chrome isolée sur macOS.
- Écrans examinés : accueil, formats disponibles, téléchargement en cours et terminé, convertisseur vide et configuré, réussite, changement de réglages, annulation, erreur de dossier et erreur de conversion.
- Captures à 1200 × 820 et 1024 × 652, cette dernière représentant approximativement la zone de contenu à la taille minimale Electron, hors barre de titre.
- Contrôle complémentaire dans Electron réel, avec un profil temporaire : menu natif, raccourcis d’agrandissement et rendu du convertisseur vide à 200 %.
- Mesures des styles calculés, du focus clavier et des contrastes ; rapprochement avec les sources.

Les états de parcours Chrome utilisent un bridge de démonstration injecté uniquement dans cette session. Les chemins, titres, tailles et erreurs sont des fixtures ; aucune conversion ni aucun téléchargement réel n’a été lancé pour cet audit graphique. La miniature publique utilisée sert seulement d’illustration. L’audit ne constitue pas une certification WCAG. Le rendu natif Windows et un lecteur d’écran n’ont pas été testés.

Les sources de l’application n’ont pas été modifiées. Les preuves sont dans [le dossier de captures](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12).

## Synthèse des neuf points

P1 : à traiter en premier. P2 : amélioration importante de l’usage. P3 : finition et cohérence graphique.

| ID | Priorité | Observation | Correction proposée |
|---|---|---|---|
| UI-01 | P1 | Une erreur de dossier est masquée dans Convertir | Afficher les erreurs communes hors des panneaux masqués |
| UI-02 | P1 | Plusieurs contrastes de texte sont insuffisants | Assombrir les couleurs de texte concernées |
| UI-03 | P2 | Détails à 9,44 px et agrandissement natif indisponible dans le contrôle macOS | Relever les petites tailles et fournir un agrandissement accessible |
| UI-04 | P2 | Aucun bilan persistant de téléchargement dans l’application | Ajouter un résultat avec nom du fichier et action pour l’afficher |
| UI-05 | P2 | Le format reste modifiable pendant un téléchargement | Verrouiller cette sélection ou distinguer clairement la prochaine tâche |
| UI-06 | P2 | Annulation et échec conservent une présentation de progression | Présenter un état terminal explicite, avec fermeture et reprise adaptées |
| UI-07 | P2 | Le tableau mélange caractéristiques de source et résultat livré | Présenter d’abord la qualité du MP4 final ; réserver les détails techniques à un niveau secondaire |
| UI-08 | P2 | Le résultat de conversion n’identifie pas les réglages utilisés | Conserver le contexte du résultat et rendre son annonce accessible |
| UI-09 | P3 | Deux noms de produit et des pictogrammes de styles différents | Unifier l’identité et la famille d’icônes |

## UI-01 — Erreur de dossier invisible dans le mode Convertir

**Reproduction :** sélectionner une vidéo dans Convertir, puis provoquer un échec du choix du dossier via Modifier. Le message « Impossible d’ouvrir le dossier de destination » est bien créé, mais aucun message d’erreur n’est visible. Il apparaît lorsque l’on passe à Télécharger. Le relevé indique `visible: false` et `visibleAlerts: 0` dans le mode Convertir.

**Cause :** [App.tsx](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/App.tsx:81) écrit l’erreur dans l’état commun ; son affichage est confié à HeroPanel, placé dans le panneau Télécharger masqué. ConverterPanel reçoit la même action de dossier mais ne reçoit pas cette erreur.

**Impact :** l’utilisateur peut croire que Modifier ne fonctionne pas et ne sait pas comment reprendre l’opération. Afficher cette erreur à un endroit commun visible dans les deux modes, ou la renvoyer au panneau qui a déclenché l’action.

Preuves : [Convertir sans erreur visible](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/07-erreur-dossier-cachee.png), [message visible dans l’autre mode](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/08-erreur-dossier-autre-mode.png), [relevé](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/erreur-cachee.json).

## UI-02 — Contrastes à corriger

Les couleurs relevées dans les styles donnent les rapports suivants pour des textes de petite taille :

| Texte | Couleurs texte / fond | Contraste |
|---|---|---|
| Placeholder de l’URL | #9ba6b7 / #ffffff | 2,46:1 |
| Libellé de réglage sélectionné | #087ff5 / #e9f3ff | 3,49:1 |
| Badge Direct | #168a4a / #e9f8ef | 4,01:1 |
| Texte secondaire sur panneau gris | #69758a / #f7f9fc | 4,41:1 |
| Texte secondaire sur sélection bleue | #69758a / #e9f3ff | 4,15:1 |

Ces valeurs sont sous le seuil de 4,5:1 applicable au texte courant dans le [critère WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Le même gris sur fond blanc atteint 4,65:1 : le problème dépend bien du fond. Les contrôles désactivés n’ont pas été utilisés pour déclarer ces défauts.

Le contraste des textes sur le bouton à dégradé bleu mérite également un contrôle précis ; l’estimation au milieu du dégradé est proche de 4,21:1. Cette estimation n’est pas traitée comme une mesure pixel exacte.

**Correction :** conserver les fonds doux, mais employer un bleu et un vert plus foncés pour les textes, renforcer le gris secondaire et le placeholder. Vérifier les différents états sélectionnés et les dégradés.

Sources : [styles.css — sélection](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/styles.css:140), [badge](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/styles.css:185), [calculs](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/contrastes.json).

## UI-03 — Lisibilité et agrandissement

Les détails de codec, badges et descriptions de réglage sont à **9,44 px**, les libellés secondaires à environ 10–11 px, et les boutons principaux à 12,64 px. Ils se lisent sur les captures, mais demandent un effort disproportionné pour une application utilisée sur des écrans de tailles et de résolutions différentes. La petite taille n’est pas à elle seule une violation WCAG ; c’est un constat de confort de lecture.

Dans Electron sur macOS, le menu de l’application est `null`. Les raccourcis testés ⌘= et ⌘⇧= ne modifient pas le facteur de zoom, qui reste à 1. Un zoom à 2 appliqué par le contrôle de diagnostic fonctionne ; le convertisseur vide passe alors à une largeur CSS de 600 px sans débordement horizontal.

**Correction :** viser des détails utiles d’au moins 12 px et des textes/actions courants de 14–16 px, puis proposer un agrandissement via le menu natif ou un réglage de l’application. Ce sont des cibles de conception, pas des tailles minimales imposées par WCAG. Vérifier ensuite tous les états à 200 %, conformément à l’objectif du [critère Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

Sources : [styles.css](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/styles.css:142), [menu Electron](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/window.cjs:5), [relevé natif](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/native-zoom.json).

## UI-04 — Fin de téléchargement peu lisible

Lorsque la tâche se termine, la barre disparaît et le bouton Télécharger redevient disponible. Le panneau des formats reste affiché, sans confirmation persistante, nom du fichier obtenu ni bilan de taille. Le code ouvre automatiquement le fichier dans le gestionnaire de fichiers, ce qui fournit un retour externe, mais l’application elle-même ne conserve pas de résultat visible.

**Correction :** afficher un panneau « Téléchargement terminé », avec le nom et le dossier du fichier, puis une action Afficher le fichier. Conserver ce résultat jusqu’à la prochaine opération et prévoir son annonce accessible.

Sources : [condition d’affichage des tâches dans App](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/App.tsx:138), [retour de téléchargement](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/hooks/useDownloadFlow.ts:137), [capture après réussite](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/04-fin-telechargement.png).

## UI-05 — Sélection de qualité modifiable pendant une tâche

Après avoir lancé le téléchargement avec 1080p sélectionné, la sélection 2160p reste cliquable et le résumé du format change pendant que la barre indique une tâche en cours. L’affichage ne distingue pas les paramètres de la tâche active des paramètres choisis pour une action suivante.

**Correction :** désactiver les lignes/radios pendant le téléchargement, ou conserver un résumé immuable de la tâche active et identifier clairement la sélection destinée à la prochaine action.

Sources : [FormatRow](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ui/FormatRow.tsx:27), [FormatsTable](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ui/FormatsTable.tsx:64), [capture](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/03-format-modifiable-pendant-tache.png).

## UI-06 — États terminaux à distinguer

Après annulation ou échec, la barre conserve « Conversion 37 % » et la progression bleue. Aucun bouton ne permet de fermer cette barre. L’annulation volontaire affiche aussi un message rouge dans le panneau, comme une erreur. En cas d’échec, le message apparaît à la fois dans la barre et dans le panneau ; celui de la barre est tronqué sur une ligne. Le message complet reste disponible dans le panneau d’origine, parfois sous la ligne de flottaison à la taille minimale.

**Correction :** afficher « Conversion annulée » dans un état neutre, et « Conversion échouée » dans un état d’erreur. Retirer les indications de progression active, fournir une fermeture et des actions de reprise adaptées, et conserver un accès au message complet. Éviter la répétition du même long message.

Sources : [JobBar](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/JobBar.tsx:20), [captures et relevés](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/etats-erreur-annulation.json).

## UI-07 — Choix des formats trop technique

Le tableau présente les formats de source WEBM/MP4, les codecs, « Vidéo seule », « Direct » et « Réencodage ». Une ligne peut afficher « H.264 + AAC · Vidéo seule », alors que l’application ajoute le son et livre un MP4 compatible. Le résumé utilise aussi « Conversion directe » pour une source pouvant nécessiter une fusion audio. Ces informations sont techniquement utiles, mais leur relation avec le fichier obtenu n’est pas assez explicite.

**Correction :** donner la priorité à 2160p/1080p/720p, au poids estimé et au résultat « MP4 avec audio ». Décrire le traitement en langage concret : son ajouté, conversion nécessaire, durée potentiellement plus longue. Conserver codecs et conteneur source dans une vue détaillée. Préciser si le poids affiché est celui de la source ou une estimation de la sortie.

Sources : [FormatRow](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ui/FormatRow.tsx:13), [fusion demandée par le téléchargement](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/hooks/useDownloadFlow.ts:128), [capture des formats](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/02-formats.png).

## UI-08 — Résultat de conversion sans contexte suffisant

Après une conversion réussie, le résultat vert reste affiché lorsque l’on change la résolution ou le profil. Il montre les tailles et Afficher le fichier, mais pas le nom, la résolution ou le profil utilisés pour ce résultat. Le résumé « Sortie prévue » décrit les nouveaux réglages, ce qui peut faire confondre résultat précédent et prochaine conversion.

Le panneau de succès n’a pas de rôle `status` ni de région `aria-live` ; son annonce à un lecteur d’écran n’a pas été vérifiée. Le [critère Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) fournit le cadre à appliquer.

**Correction :** conserver le nom du fichier et les réglages réellement utilisés dans le résultat, l’identifier comme résultat de la dernière conversion, et annoncer sa disponibilité sans déplacer brutalement le focus.

Sources : [ConverterPanel](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ConverterPanel.tsx:138), [capture après changement de résolution](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/11-reglages-changes-resultat-persiste.png).

## UI-09 — Identité et finition graphique

L’en-tête affiche Video Studio, tandis que le titre de fenêtre, le splash et les paquets portent YouTube Downloader. Le logo rouge de lecture et les pictogrammes Unicode de dossier/tâche ne forment pas une famille graphique homogène avec les cartes bleues.

**Recommandation de conception :** choisir un nom de produit et l’appliquer aux différents points d’entrée, puis utiliser une petite famille d’icônes SVG cohérente. Le statut technique des moteurs et leurs versions gagneraient à être accessibles dans une zone À propos/Diagnostic ; garder dans les parcours uniquement les états nécessaires pour agir.

Sources : [AppHeader](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/AppHeader.tsx:15), [splash et titre](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/index.html:9).

## Ce qui fonctionne bien

- Deux modes clairement séparés ; action principale identifiable.
- Organisation Résolution → Priorité → Sortie prévue, avec états sélectionnés `aria-pressed`.
- Palette, arrondis et espacements globalement cohérents ; aucun besoin évident d’ajouter des illustrations décoratives.
- Mise en page sans débordement horizontal observé à 1024 × 652, avec les cinq résolutions de démonstration.
- Focus clavier visible sur le sélecteur de mode : contour bleu relevé dans Chrome. Les radios des formats sont des contrôles natifs nommés par leur résolution.
- Erreurs locales de conversion avec `role="alert"`, barre de tâche avec `aria-live="polite"` et progression nommée.
- Résultat de conversion avec réduction de poids et action Afficher le fichier.
- Les chemins longs sont tronqués proprement et le dossier de sortie dispose d’un titre donnant son chemin complet au survol.

## Ordre de correction conseillé

1. Rendre les erreurs communes visibles dans les deux modes et corriger les contrastes.
2. Relever la typographie, restaurer l’agrandissement et rendre les états de réussite/annulation/échec explicites.
3. Stabiliser le contexte des tâches et des résultats, puis simplifier les formats autour du MP4 obtenu.
4. Harmoniser le nom du produit et les pictogrammes.

## Captures principales

### Formats et densité des informations

![Formats de démonstration](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/02-formats.png)

### Convertisseur à la taille minimale testée

![Convertisseur 1024 × 652](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/09-convertisseur-petite-fenetre.png)

### Présentation actuelle d’un échec

![Erreur de conversion simulée](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/audit-ui-2026-10-12/13-erreur-conversion.png)

Les autres captures, mesures JSON, snapshots et fixtures de reproduction sont conservés dans le dossier de preuves.
