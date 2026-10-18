# Rapport — fonctionnalités de type JAX pour Saden Delivery

Branche `feature/jax-parity` (base : `main` @ `3778070`). **Non poussée, non fusionnée, non déployée.**
Les migrations n'ont été exécutées que sur la base locale PGlite. L'écart de départ est dans `docs/AUDIT-JAX.md`.
Seules les fonctionnalités du rapport JAX ont servi de cahier des charges : aucun code, texte ou design n'a été repris.

## 1. Ce qui a été ajouté

| Lot | Fonctionnalités |
|---|---|
| **A — Suivi colis** | **Tentatives** comptées automatiquement à chaque échec de livraison (absent, refus, reporté, numéro / adresse erronés) ; **file des problèmes** par agence (type, note, livreur, tentative), un seul problème ouvert par colis, clôture automatique à la livraison / annulation ; **appels** comptés avec leur résultat ; **traitement** motivé avec suite (nouvelle livraison, retour, annulation, aucune), **rendez-vous** → tâche datée, « **faux problème** » ; **historique des problèmes** ; **tâches** par agence (RDV, rappel, vérification…) avec **compteur dans la barre** ; **colis signalés** (motif, auteur), **suspects** (≥ 3 tentatives, ≥ 3 problèmes, client non sérieux), **en souffrance** (sans mouvement depuis N jours, gardés par un livreur depuis N jours) ; bandeau d'actions dans la fiche colis. |
| **B — Bordereaux** | **Enlèvement** : demande depuis l'espace boutique (ou par l'agence), livreur annoncé (« à enlever »), « enlevé », réception par scan → stock, les non enlevés reviennent « en attente » ; **retour à l'expéditeur** : retours en stock d'une boutique, remise avec **décharge signée** (photo / PDF) ou nom du signataire → « restitué », document consultable ; **inter-agences typé** (standard, pickup, retour, échange, adresse erronée) et **immatriculation** (aussi expédition / enlèvement) ; **rapport de fin de journée** par livreur (remis, livrés, échecs, retours, en main, encaissé, versé) + PDF ; **Générer échange** depuis la fiche colis (référence `E` + colis, `-2`, `-3`…). |
| **C — Liste « Colis »** | Pagination serveur, recherche, **filtres avancés** (statut, boutique, livreur, ville, agence actuelle, tentatives, CR min / max, dates de création et de livraison, stock, signalés, type, tri), **filtre par liste de codes collée** (codes introuvables signalés), **champs affichés** au choix (27 colonnes, mémorisés), sélection, **étiquettes en masse** 10×15 et A4 (4 par page), **fichier Zebra (ZPL)**, **mise à jour de statut en masse** (chaque colis passe par la machine à états ; rapport faits / refusés), **export Excel**, **matrice** statuts × agence / boutique / livreur / ville. |
| **D — Statistiques** | Onglet « Performance avancée » : livré au 1er passage, après plusieurs tentatives, jamais livrés (≥ 3), taux de retour et d'échange, problèmes et réclamations par type, performance par livreur, comparatif des agences (délai moyen de livraison), top 10 expéditeurs, répartition par gouvernorat, volume quotidien (90 jours par défaut ou période). |
| **E — Caisse** | **Clôture du jour** : solde d'ouverture, entrées, sorties, théorique, compté, écart (conforme / manque / surplus) justifié ; après clôture **aucun mouvement** ne peut être ajouté ce jour-là (caisse, soldes, contre-passations) ; **réouverture** motivée par l'administrateur, conservée dans l'**historique** ; **apport de fonds** ; **justificatif** joint à un mouvement. |
| **F — Tableau de bord** | Bandeau « Opérations » : demandes d'enlèvement, enlèvements en cours, retours à remettre, échanges à récupérer, colis en préparation, à livrer, en livraison, reçus aujourd'hui, problèmes, tâches (dont dues), colis actifs par tentative 0 / 1 / 2 / 3 / +3 — chaque tuile ouvre la liste correspondante. |

Nouveau menu : Tableau de bord, Carte live, Commandes & colis, **Colis**, **Suivi colis**, Stock, Bordereaux (9 types), Livreurs, Boutiques, Agences, Caisse, Statistiques, Réclamations, Journal, Paramètres.

## 1 bis. Espace expéditeur (second rapport JAX, côté boutique)

| Module JAX | Dans Saden |
|---|---|
| Accueil | « L'essentiel » (colis livrés, reçus par l'expéditeur, chez Saden : nombre, montant, %), « Suivi détaillé » (en livraison, reçus à l'entrepôt, en préparation au retour, soldés, en attente), suivi rapide par code. |
| Créer des colis | Téléphone 2, case **colis d'échange** (colis `E` + code lié créé automatiquement), contrôle listant les champs manquants, **import Excel en masse** avec **modèle téléchargeable** (onglet des villes / zones) et rapport ligne par ligne. |
| Colis en attente | Sélection, **étiquettes en masse** au format choisi, **modification** tant que le colis est en attente (prix recalculé), annulation groupée (jamais de suppression), demande d'enlèvement de la sélection. |
| Historique | Même liste « Colis » que l'agence, limitée aux colis de la boutique : filtres (statut, gouvernorat / ville, tentatives, dates, **versé** oui / non), colonnes au choix dont **soldé**, téléphone 2, échange, réclamations, dates d'enlèvement / livraison / retour ; export Excel et **Outstanding** (livrés non soldés). Fiche colis : **parcours** (statut, date, employé), **problèmes**, **historique d'appels**, réclamer. |
| Réclamations | Assistant en 3 étapes (code **ou** téléphone du client — choix si plusieurs colis —, type, envoi), une réclamation en cours par colis, historique. |
| Échanges / Retours | Bordereaux d'échange et de retour de la boutique (colis, parcours, PDF, Excel) ; liste des colis d'échange. |
| Paiements | Bordereaux de solde validés : colis livrés, reçus par l'expéditeur, CR encaissé, **honoraires**, reste à payer, **retenue à la source**, déjà versé, **net à payer** ; détail des colis, PDF et Excel ; colis marqués « soldés ». |
| Expéditions | Demande d'enlèvement par **sélection** ou **scan** (douchette / caméra), historique (adresse, livreur, téléphone, statut), annulation tant que « à enlever », PDF. |
| Statistiques | Raccourcis de période + dates, livrés / reçus / en cours, **délais de livraison** (< 24 h, 24–48 h, 48–72 h, > 72 h), problèmes et réclamations par type, gouvernorats. |
| Paramètres | Profil (géré par l'agence), **format d'impression** des étiquettes (10×15 ou A4), **utilisateurs** de la boutique (administrateur / agent, activation) agissant au nom de la boutique. |

**Retenue à la source** : taux réglable par l'administrateur sur chaque boutique (0 % par défaut, donc inactif tant qu'il n'est pas
réglé), appliqué sur les honoraires (encaissé − dû à la boutique). La base exacte est **à valider avec votre comptable** avant usage.

Migration supplémentaire `2026-10-18.shop` (additive) : `users.parent_id`, `shop_role`, `print_format`, `rs_rate` ; `orders.client_phone2`.
Tests : `npm run test:shop` **47 / 47** ; parcours navigateur `t-shopui` (accueil, suivi rapide, création avec échange, import Excel,
étiquettes, modification, historique, réclamation, expédition par sélection puis annulation, paiements, retours, échanges,
statistiques, paramètres, mobile) ; les parcours existants qui passaient par l'ancienne page boutique ont été adaptés.
Comportement conservé : le montant contre-remboursement reste facultatif dans le formulaire (vide = 0), comme avant.

## 1 ter. Espace responsable d'agence, application livreur et nouvelle identité visuelle

**Responsable d'agence — page « Livreurs »** (API `/api/fleet/*`, limitée à son agence ; l'administrateur choisit l'agence) :

| Vue | Contenu |
|---|---|
| Équipe | Statut en direct (disponible, en livraison, pause, hors ligne), zone, batterie, dernière position ; missions, livrés et échecs du jour, colis en main, taux de réussite, caisse à reverser ; boutons fiche, appel, message. |
| Performance | Tableau **triable** sur 7 / 30 / 90 jours : colis traités, livrés, échecs, taux de réussite, livrés au 1er passage, durée moyenne de tournée, encaissé, problèmes, appels, note, réclamations. |
| Affectation | Colis sans livreur (en attente, reçus en agence, arrivés) avec recherche et filtre par zone, sélection multiple, choix du livreur avec sa charge ; chaque colis passe par la machine à états, les refus sont listés. |
| Fiche livreur | Aperçu (indicateurs + activité des 30 derniers jours livrés / échecs), missions (retrait d'un colis encore « affecté », motif facultatif), enlèvements, historique, caisse (encaissé, versé, à reverser, versements), avis clients. |
| Avis clients | Les anciennes cartes (note, dernier commentaire) sont conservées dans cet onglet. |

**Livreur — application mobile** (barre d'onglets en bas) :
Missions (en-tête : à livrer, livrés aujourd'hui, à encaisser, caisse en main ; colis à rapporter à l'agence), Enlèvements
(boutique, adresse, itinéraire, appel, progression ; chaque colis confirmé **par scan** ou d'un geste → « ramassé », bordereau
« enlevé » quand tout est pris), Scanner (ouvre la mission), Caisse (en main, encaissé aujourd'hui / total, versé, détail),
Historique (livrés / échecs, preuve, encaissé, par jour). Dans une mission : **Google Maps et Waze**, **appel, SMS, WhatsApp**,
2e numéro du client, **résultat d'appel noté** (visible par l'agence et la boutique), parcours de statuts et preuves
OTP / photo / signature inchangés.

**Synchronisation et permissions** : tout passe par les mêmes tables (statuts, appels, bordereaux, caisse, notifications). Le
responsable n'agit que sur les livreurs et colis de son agence ; le livreur ne voit et ne touche que ses colis ; la boutique n'a
pas accès à la flotte ; l'administrateur voit tout avec le filtre agence. Message du responsable → notification du livreur.

**Identité visuelle** remplacée : palette « minuit + orange Saden » (clair et sombre), police Plus Jakarta Sans, cartes à ombre
douce, boutons en dégradé, menu latéral groupé (Pilotage, Opérations, Réseau, Finance & analyse, Support) avec icônes vectorielles
(`public/js/icons.js`, plus d'emoji), en-têtes de page avec icône et sous-titre, tuiles statistiques avec icône et ton, page de
connexion illustrée, états vides illustrés, tableaux triables, animations discrètes (désactivées si « réduire les animations »).

Défauts du rapport JAX évités : téléphones contrôlés côté serveur (8 chiffres, y compris le 2e numéro), message explicite pour un
COD négatif, envoi de réclamation désactivé tant que les champs requis manquent, impossible de se désactiver soi-même, historique
du livreur incluant livrés **et** échecs, dates calculées dans le fuseau de Tunis.

Migration supplémentaire `2026-10-18.fleet` (additive) : table `order_calls` (journal d'appels du livreur, RLS activée).
Tests : `npm run test:fleet` **33 / 33** ; parcours navigateur `t-fleetui` (équipe, tri, affectation groupée, retrait, message,
application livreur : liens de navigation et de contact, appel noté, onglets, mode sombre).

## 2. Fichiers

Créés : `lib/problems.js`, `lib/cash.js`, `lib/routes/ops.js`, `lib/routes/parcels.js`, `public/js/ops.js`, `public/js/parcels.js`,
`public/js/stats-adv.js`, `public/js/shop.js`, `public/js/icons.js`, `public/js/fleet.js`, `public/js/driver-app.js`, `lib/routes/fleet.js`, `scripts/test-ops.js`, `scripts/test-shop.js`, `scripts/test-fleet.js`, `docs/AUDIT-JAX.md`, `docs/RAPPORT-JAX.md`.
Modifiés : `lib/schema.js`, `lib/status.js`, `lib/flows.js`, `lib/domain.js`, `lib/api.js`, `lib/routes/manifests.js`, `lib/routes/finance.js`,
`lib/routes/stats.js`, `lib/routes/shop.js`, `lib/routes/orders.js`, `lib/routes/accounts.js`, `lib/routes/pricing.js`, `lib/auth.js`, `lib/scope.js`, `public/js/app.js`, `public/js/parcels.js`, `public/js/manifests.js`, `public/js/cash.js`, `public/js/scan.js`, `public/index.html`, `public/sw.js`, `package.json`.

## 3. Migrations (uniquement additives)

`SCHEMA_VERSION = '2026-10-17.ops-c'` — trois blocs idempotents (`OPS`, `OPS_B`, `OPS_C`), aucune suppression :

- `orders` : `attempts`, `flagged_at / _by`, `flag_reason`, `rdv_at` ; reprise : tentatives recalculées depuis l'historique, problème ouvert pour chaque colis actuellement en incident.
- Tables `parcel_problems`, `problem_calls`, `tasks`, `cash_closings` (RLS activée).
- `manifests` : `vehicle_plate`, `transfer_kind`, `pickup_date`, `pickup_address`, `requested_by`, `collected_at`, `signed_doc`, `signer_name`, `signed_at`.
- `cash_tx.attachment`.

## 4. Tests (base locale fraîchement seedée)

| Suite | Résultat |
|---|---|
| `npm run test:ops` (nouveau, API) | **101 / 101** — tentatives et problème automatique, appels, traitement + RDV → tâche, faux problème, tâches et compteur, signalés / suspects / en souffrance, enlèvement de bout en bout (demande boutique, livreur, enlevé, réception par scan, non enlevés remis en attente), restitution avec décharge, transfert typé, rapport de fin de journée, générer échange, liste paginée, codes collés, filtres, export, étiquettes, mise à jour en masse (transitions refusées listées), matrice, statistiques avancées, clôture de caisse (écart justifié, double clôture, blocage, réouverture admin), tableau de bord ; permissions (autre agence, boutique) à chaque étape. |
| `npm run test:stock` (mission précédente) | **101 / 101** |
| `npm run test:permissions` | **45 / 45** |
| `npm run test:fleet` | **33 / 33** |
| `npm run test:shop` | **47 / 47** |
| Parcours navigateur | **23 / 23** (dont `t-shopui` et `t-fleetui`) ; historiquement **21 / 21** — les 17 existants + `t-opsui` (file des problèmes, appel, traitement, tâches, fiche colis), `t-lotbui` (demande d'enlèvement côté boutique puis traitement complet par l'agence, rapport de fin de journée, générer échange), `t-colisui` (codes collés, étiquettes 10×15 et A4, fichier ZPL, mise à jour en masse, export Excel, colonnes, matrice), `t-defui` (tableau de bord, statistiques avancées, clôture de caisse). Aucune erreur JavaScript, aucun débordement en 390 px. |

Les téléchargements des tests (Excel, ZPL, PDF) sont dirigés vers le dossier de test, jamais vers le dossier Téléchargements.

## 5. Limites

- **Pas de SMS ni de temps réel** (Pusher) : aucun fournisseur SMS n'est configuré ; les compteurs se rafraîchissent toutes les 20 s comme le reste de l'application. Les problèmes et tâches sont prêts pour un futur envoi de SMS (canal `notify`).
- **Rôles fins** (caissier, réception, dispatcher, relieur…) non créés : les écrans restent réservés à l'administrateur et aux responsables d'agence. À décider (voir recommandations).
- **Codes colis** : le format `SD-` est conservé (le changer casserait les étiquettes imprimées et l'API partenaires) ; les échanges utilisent `E` + code.
- Les **tentatives antérieures** sont reprises depuis l'historique des statuts ; les problèmes antérieurs ne le sont que pour les colis encore en incident.
- La **décharge signée** et les **justificatifs** sont stockés dans la base (3 Mo max) ; pour de gros volumes, un stockage de fichiers (Supabase Storage) serait préférable.
- L'export Excel est limité à 20 000 lignes ; la matrice et les statistiques avancées portent sur le périmètre de l'utilisateur.

## 5 bis. Point d'attention avant toute mise en ligne

L'environnement **Preview** de Vercel pointe aujourd'hui vers la **base de production** (vérifié le 13/10). Pousser cette branche
puis ouvrir son aperçu appliquerait ces migrations à la production. À corriger d'abord : retirer `DATABASE_URL` de l'environnement
Preview, ou la remplacer par un projet Supabase de test distinct.

## 6. Recommandations

1. Corriger la variable Preview (ci-dessus), puis tester l'aperçu sur une base de test.
2. Sauvegarder Supabase avant la fusion (export JSON fait le 13/10 dans `.backup-prod-2026-10-13/`, à refaire).
3. Décider des rôles fins à ajouter (au minimum « caissier » et « agent de réception »), et d'un fournisseur SMS pour les problèmes clients.
4. Former les agences au nouveau parcours : demande d'enlèvement → enlèvement → stock → expédition → problèmes / tâches → retour / restitution → solde → clôture de caisse.
