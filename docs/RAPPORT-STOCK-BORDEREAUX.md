# Rapport — Logo, entrées en stock et bordereaux professionnels

Branche `feature/stock-bordereaux` (base : `main` @ `268d7c6`). **Non fusionnée, non poussée, non déployée** ;
la migration n'a été exécutée que sur la base locale PGlite. L'audit initial est dans `docs/AUDIT-STOCK-BORDEREAUX.md`.

## 1. Fonctionnalités créées

| Domaine | Ce qui est livré |
|---|---|
| **Logo** | Point de configuration unique `public/brand/` : `logo-source.*` + `npm run brand` génère `logo.png` (couleur, fond transparent), `logo-print.png` (N&B contrasté), favicons 32/64, icônes PWA 192/512/maskable. `brand.js` = nom, chemins, couleurs. Logo dans la barre (toutes les pages, dont le tableau de bord), la connexion, l'étiquette 10×15 et chaque PDF. |
| **Entrée en stock** | Écran Stock → Entrée en stock : douchette USB (saisie + Entrée), caméra, saisie manuelle. Catégories : en attente de réception, provenant des boutiques, transférés depuis une autre agence, retournés par les livreurs, retournés par les clients (échanges), anomalies de réception. Bon état / endommagé, motif de retour, signalement d'anomalie. Date, utilisateur et chemin sont tracés (mouvement de stock + journal). |
| **Présence physique** | `orders.in_stock` + `current_agency_id`. Un colis n'est présent qu'après confirmation de sa réception. Chaque entrée / sortie écrit un `stock_movements` dans la même transaction que le changement de statut (`changeStatus` → `syncStock`). Mise à jour conditionnelle avec verrou de ligne : double réception et double sortie impossibles. |
| **Tableau de bord stock** | Présents, disponibles pour livraison, en attente de traitement, retours, transferts sortants / entrants, anomalies ; filtres catégorie, statut, boutique, livreur, période, recherche. Onglets Stock actuel, Transferts entrants, Transferts sortants, Inventaires, Anomalies, Mouvements. |
| **Bordereaux (7 types)** | Une seule table `manifests` (`type`) : même numérotation (`EXP-`, `RET-`, `ECH-`, `BRD-`, `APL-`, `INV-`, `SLD-`), même historique, même scan, même PDF. |
| Expédition | Livreur (sélecteur), colis disponibles en stock uniquement, contrôle de compatibilité (en stock ici, statut, inter-villes → transfert obligatoire, agence de livraison), scan, validation, contrôle de chargement par scan, **remise confirmée** = affectation + sortie de stock. |
| Retour | Livreur, colis chez lui uniquement, motifs (client absent, injoignable, refus, adresse incorrecte, livraison reportée, retour demandé par la boutique, autre + commentaire obligatoire) ; **réintégration au stock seulement à la confirmation**. |
| Échange | Colis à livrer + colis à récupérer (commande « pickup » liée, sans frais, suivie séparément) ; remise au livreur ; résultat complet / partiel / échoué ; le récupéré entre en stock comme retour client. |
| Inter-agences | États *en attente / partielle / complète / avec anomalie* ; réception colis par colis (écran Stock ou bordereau) ; colis supplémentaires (même hors périmètre) et endommagés signalés ; manquants à la clôture (anomalies) ; clôture « sans réserve » ou « avec réserves » — dès qu'il y a une anomalie elle est toujours *avec réserves* (texte saisi à l'écran, sinon résumé automatique pour les appels API existants) ; jamais présent à destination avant confirmation. |
| Émission d'appel | Colis, agent, téléphone, motif, date / heure, résultat (client confirmé, injoignable, sans réponse, livraison reportée, adresse à confirmer, annulation demandée), commentaire. **Aucun changement de statut automatique.** |
| Inventaire | Session par agence (une seule ouverte), stock théorique figé à l'ouverture, comptage par scan, double comptage ignoré, supplémentaires, codes inconnus, manquants à la clôture → anomalies ; **corrections validées une par une** avec justification (jamais automatiques) ; historique des écarts. |
| Solde | Livreur ou boutique + période : commandes livrées, montants encaissés, frais, commissions, déjà versé, solde. Validation = **une écriture `cash_tx` liée** au bordereau (la Caisse existante en tient compte) ; écart justifié obligatoire ; une commande ne peut être soldée deux fois. Annulation = contre-passation. |
| **Sélecteur de livreur** | Livreurs de l'agence, recherche nom / n° / téléphone, disponibilité, colis en cours et en main, derniers bordereaux ; livreurs désactivés non sélectionnables ; livreur d'une autre agence refusé côté serveur. |
| **Brouillons / annulation** | Brouillon : ajout / retrait de colis, changement de livreur, suppression. Validé / clôturé : jamais supprimé ; « Annuler le bordereau » avec motif obligatoire, utilisateur et date, affiché **ANNULÉ** (écran et PDF) ; contre-mouvements contrôlés (colis remis non encore pris en charge → réintégrés ; contre-passation en caisse) ; ce qui n'est plus réversible est listé et laissé intact. Annulation d'un clôturé réservée à l'administrateur. |
| **Codes-barres / impression** | Encodeur Code 128 maison (jeux B et C), noir sur blanc, zones de silence de 10 modules, texte lisible dessous. Code du document (ouvre le bordereau après contrôle de périmètre) et un code par ligne. PDF A4 : logo N&B, en-tête, tableau, pagination « Page x / y », lignes jamais coupées, pied de page, signatures, filigrane ANNULÉ. Étiquette 10×15 : QR + Code 128. |
| **Menu** | Tableau de bord, Carte live, Commandes & colis, Stock, Bordereaux, Livreurs, Boutiques, Agences (admin), Caisse, Statistiques, Réclamations, Journal (admin), Paramètres (Comptes, Tarifs, Villes / Zones et API partenaires pour l'admin). Responsive, sans débordement horizontal en 390 px. |

## 2. Fonctionnalités améliorées (sans remplacement)

- **Scan « réception »** existant : passe par le même flux que l'entrée en stock (mouvement, livreur détaché du colis).
- **Inventaire « volatile »** du scanner : conservé, mais basé sur le stock réel (`in_stock`).
- **Bordereau inter-agences** : routes, actions de scan (`manifest_add`, `ship`, `arrival`) et numérotation inchangées ; ajout des états de réception, anomalies, réserves, contrôle de chargement, annulation.
- **Machine à états** : nouvelles transitions « retour livreur confirmé par l'agence » (incidents, accepté, en livraison, sur place → `en_agence`, rôle agence uniquement).
- **Transactions** : `tx()` est désormais transparent — `changeStatus`, les hooks (audit, notifications, webhooks) et l'audit s'exécutent sur la connexion de la transaction ; les webhooks partenaires émis dans une transaction partent par la file existante (pas d'appel réseau pendant que des lignes sont verrouillées).
- **Recherche globale** : affiche le type de bordereau ; un code-barres de bordereau scanné dans la recherche ouvre le document.

## 3. Fichiers modifiés

Créés : `lib/stock.js`, `lib/flows.js`, `lib/routes/stock.js`, `public/js/barcode.js`, `public/js/stock.js`,
`public/brand/*` (source, fichiers générés, `brand.js`), `scripts/brand.py`, `scripts/test-stock.js`,
`docs/AUDIT-STOCK-BORDEREAUX.md`, `docs/RAPPORT-STOCK-BORDEREAUX.md`.

Modifiés : `lib/db.js`, `lib/schema.js`, `lib/status.js`, `lib/domain.js`, `lib/partners.js`, `lib/api.js`,
`lib/routes/manifests.js` (réécrit, compatible), `lib/routes/scan.js`, `lib/routes/search.js`, `public/js/app.js`,
`public/js/manifests.js` (réécrit), `public/js/scan.js`, `public/js/search.js`, `public/index.html`, `public/sw.js`,
`public/manifest.webmanifest`, `public/icons/*`, `package.json`, `README.md`.

Supprimés : `scripts/icons.py` et `public/icons/icon.svg` (anciennes icônes « SD », remplacées par `npm run brand`).

## 4. Migration

`SCHEMA_VERSION = '2026-10-14.stock-bordereaux'` (bloc `STOCK` de `lib/schema.js`), idempotente, exécutée une fois
sous verrou consultatif comme les précédentes. **Uniquement additive** : aucune table, colonne ni ligne supprimée.

- `orders` : `in_stock`, `kind` (`delivery` / `pickup`), `related_order_id`.
- `manifests` : `type` (défaut `transfer` → les bordereaux existants restent des inter-agences), `shop_id`, période, `comment`, `result`, `reserves`, `totals`, `cash_tx_id`, `handed_at`, `validated_by`, `closed_by`, `cancelled_at / _by`, `cancel_reason`.
- `manifest_items` : `role`, `reason`, `comment`, `phone`, `call_result`, `called_at / _by`, `expected`, `scanned_at`, `anomaly`, `result`, `amount`, `confirmed_at / _by`.
- Nouvelles tables `stock_movements` et `stock_anomalies` (RLS activée, comme toutes les tables).
- `cash_tx.manifest_id`.
- Reprise de données : les colis existants en statut `en_agence`, `arrive`, `retour_agence`, `endommage` avec une agence courante sont marqués `in_stock` (état initial, sans ligne de mouvement).

## 5. Résultats des tests (base locale isolée)

Toutes les suites ont été exécutées sur une base PGlite locale, fraîchement seedée (`npm run seed`), jamais sur Supabase.

| Suite | Résultat |
|---|---|
| `npm run test:stock` (nouveau, API) | **101 / 101** — entrée boutique, double scan, endommagé + anomalie, retour livreur (motif déduit / exigé), bordereau de retour (motif « Autre » sans commentaire refusé, pas de stock avant confirmation, double confirmation refusée), sélecteur de livreurs, expédition (colis hors stock refusé, livreur d'une autre agence refusé, brouillon modifié / supprimé, colis déjà sur un bordereau actif refusé, contrôle par scan, remise, double remise refusée), annulation d'un clôturé (refusée au responsable, motif obligatoire, contre-mouvements, ANNULÉ, audit), échange (récupération liée, résultat partiel, entrée en stock du récupéré), inter-agences (sortie à l'expédition, absent à destination avant confirmation, réception partielle, endommagé, double scan, supplémentaire hors périmètre, manquant jamais présent, réserves, état « anomalie »), appel (aucun changement de statut, traçabilité), inventaire (session unique, théorique figé, double comptage, inconnu, supplémentaire, écarts, aucune correction automatique, correction validée), solde livreur (lignes = total, écart justifié, écriture de caisse unique, pas de double solde, contre-passation → caisse revenue à l'identique), solde boutique, permissions (autre agence, boutique, livreur, filtre d'agence, code-barres hors périmètre), cohérence mouvements ↔ présence et compteurs. |
| `npm run test:permissions` (existant) | **45 / 45** |
| Suites navigateur existantes (16) + nouvelle `t-stockui` | **17 / 17** — dont `t-stockui` (11 étapes : douchette USB simulée = frappe + Entrée, double scan, stock actuel, sélecteur de livreur, création / scan / validation / contrôle / remise d'une expédition, PDF, code-barres du bordereau dans la recherche → ouverture, annulation affichée « ANNULÉ »). Les suites existantes ont seulement été adaptées au nouveau menu (Tarifs, Villes / Zones, API sous Paramètres) et à la nouvelle zone de scan des bordereaux. |
| Lecture des codes-barres (ZXing sur PDF rendu par pdf.js à 300 dpi) | **36 / 36** codes relus sur les PDF des 7 types (code du document + chaque ligne, y compris un solde de 2 pages) ; étiquette 10×15 relue ; encodeur vérifié sur 7 cas limites (jeux B / C). |
| Écrans | 7 onglets Stock, 7 types de bordereaux, Boutiques, Paramètres, tableau de bord : aucune erreur JavaScript ; aucun débordement horizontal en 390 px ; PDF générés pour les 7 types (1 à 2 pages). |

Deux régressions trouvées par les suites existantes et corrigées : une clé de traduction `period` qui cassait la page
Statistiques, et l'audit de clôture d'un transfert qui ne conservait plus la liste des manquants.

## 6. Limites connues

- Les colis déjà chez un livreur avant la migration n'ont pas d'historique de mouvement : leur premier retour en crée un normalement.
- Un colis `affecte` resté dans l'agence (affectation automatique à l'arrivée) est compté « disponible » jusqu'à sa remise ; la remise par bordereau d'expédition est la sortie de stock de référence. Si un livreur prend un colis sans bordereau, la sortie se fait automatiquement au passage « en livraison ».
- « Déjà versé » d'un solde = écritures de caisse manuelles de la période (non rattachées à un bordereau) ; les versements partiels antérieurs ne sont pas ventilés par commande.
- L'annulation d'un bordereau inter-agences en transit est refusée (il faut réceptionner puis clôturer avec réserves) ; celle d'un inventaire ne défait pas les corrections déjà validées (chacune est tracée et réversible par une nouvelle anomalie).
- La page Boutiques calcule ses chiffres sur les 500 dernières commandes chargées ; le chiffre exact passe par un bordereau de solde.
- Lecture des codes-barres validée par décodeur logiciel (ZXing) sur PDF rendu à 300 dpi ; un essai avec la douchette USB réelle et l'imprimante de l'agence reste à faire sur site.
- Libellés arabes ajoutés pour tous les nouveaux écrans ; le PDF reste en français (polices standard jsPDF sans glyphes arabes).

## 7. Recommandations avant la production

1. Relire ce rapport, puis tester la branche sur un **déploiement Preview Vercel pointant vers une base de test** (pas Supabase de production), ou localement.
2. **Sauvegarder la base Supabase** (export) avant toute migration.
3. Avec votre autorisation seulement : fusionner dans `main` → la migration s'applique au premier appel (additive, idempotente).
4. Juste après : ouvrir Stock → Stock actuel dans chaque agence et lancer un **inventaire** pour valider l'état initial repris ; traiter les écarts par validation.
5. Imprimer un bordereau et une étiquette sur les imprimantes réelles et les scanner avec les douchettes USB des agences.
6. Remplacer le logo si besoin : `public/brand/logo-source.png` + `npm run brand`.
