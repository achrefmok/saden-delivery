# Audit avant la mission « Logo, entrée en stock, bordereaux » — branche `feature/stock-bordereaux`

État du code au commit `268d7c6` (main), avant toute modification.

## Ce qui existe déjà

| Domaine | Existant | Fichiers |
|---|---|---|
| Identité visuelle | Pas de logo : carré orange + texte « SADEN » dans la barre, la connexion, l'étiquette et le PDF ; icônes PWA générées (« SD » sur fond orange) | `public/js/app.js`, `public/icons/*`, `scripts/icons.py` |
| Statuts / machine à états | 22 statuts, transitions par rôle (`lib/status.js`), `en_agence`, `retour_agence`, `arrive`, motifs obligatoires, hooks audit / notifications / webhooks | `lib/status.js` |
| Emplacement physique | `orders.current_agency_id` mis à jour à la réception (scan) et à l'arrivée d'un transfert ; pas de notion « en stock / sorti du stock » ni de mouvements de stock | `lib/routes/scan.js`, `lib/routes/manifests.js` |
| Scan | Couche caméra (BarcodeDetector → html5-qrcode) + saisie manuelle ; actions : réception, retour, inventaire, ajout bordereau, chargement, arrivée, ouverture de fiche, livraison (livreur) | `public/js/scan.js`, `lib/routes/scan.js` |
| Codes | **QR uniquement** (fiche, étiquette 10×15) ; aucun code-barres linéaire, rien sur le PDF | `public/js/scan.js` |
| Bordereaux | **Un seul type** : transfert inter-agences ; brouillon → validé → en transit → arrivé → clôturé ; composition manuelle (sélection / scan), un bordereau actif par colis, réception colis par colis, manquants à la clôture, PDF jsPDF (sans logo ni code-barres), historique (audit_log) ; `driver_id` stocké mais pas de vrai sélecteur | `lib/routes/manifests.js`, `public/js/manifests.js` |
| Inventaire | Inventaire « volatile » dans le scanner : liste attendue + rapport enregistré dans `audit_log` ; pas de session persistante, pas de correction validée | `lib/routes/scan.js` |
| Livreurs / affectation | Affectation colis par colis avec score (`lib/assign.js`), historique dans `order_events` | `lib/assign.js`, `lib/routes/orders.js` |
| Caisse | Écritures par agence, remises COD livreurs, règlements boutiques, transferts liés (`cash_tx`) | `lib/routes/finance.js`, `public/js/cash.js` |
| Permissions | `scopeWhere()` / `scopeAgency()` sur toutes les routes, audit, limites d'essais | `lib/scope.js`, `lib/audit.js` |
| Dépendances | jsPDF 2.5.1 (CDN, chargé à la demande), qrcode-generator 1.4.4, html5-qrcode 2.3.8 ; aucune librairie de code-barres | `public/js/scan.js` |

## Tableau demandé

| Fonctionnalité | Existe | À améliorer | À créer |
|---|---|---|---|
| Logo | ❌ (carré orange) | — | Emplacement unique `public/brand/`, logo barre / connexion / tableau de bord / PDF / étiquettes, version N&B, favicon et icônes PWA générés |
| Entrée en stock | ⚠️ action de scan « réception » isolée | Réutiliser la logique de réception (machine à états) | Écran Stock (entrée, stock actuel, transferts entrants / sortants), notion « en stock », mouvements de stock, anomalies, anti double réception |
| Expédition (remise au livreur) | ❌ | — | Type de bordereau `dispatch` : livreur, colis éligibles en stock, affectation, remise confirmée (sortie de stock) |
| Retour (livreur → agence) | ⚠️ scan « retour » (statut `retour` seulement) | — | Type `return` : motifs, vérification colis par colis, réintégration au stock après confirmation |
| Échange | ❌ | — | Type `exchange` : colis à livrer + colis à récupérer (commande « pickup » liée), suivi séparé, résultat complet / partiel / échoué |
| Inter-agences | ✅ | États de réception (attente / partielle / complète / anomalie), colis supplémentaires, endommagés, clôture avec réserves, logo + codes-barres | — |
| Émission d'appel | ❌ | — | Type `call` : colis, agent, motif, résultat, commentaire, horodatage — sans changement de statut automatique |
| Inventaire | ⚠️ volatile | Rattacher le scanner à une session | Type `inventory` : session persistante, stock théorique figé, écarts, anomalies, corrections validées une par une |
| Solde | ⚠️ vues de caisse (remises / règlements) | — | Type `settlement` : livreur ou boutique + période, montants calculés depuis les commandes et `cash_tx`, validation = écriture de caisse liée, annulation = contrepassation |
| Sélection livreur | ⚠️ simple liste | — | Sélecteur réutilisable : livreurs de l'agence, recherche, disponibilité, colis en cours |
| Annulation bordereau | ❌ | — | Suppression du brouillon, annulation motivée après validation (« ANNULÉ »), contre-mouvements contrôlés |
| Codes-barres PDF | ❌ | PDF existant à refondre | Code 128 (encodeur maison, SVG + jsPDF), A4 paginé, logo, signatures, étiquette 10×15 avec Code 128 |

## Choix d'architecture

- **Une seule table `manifests`** avec une colonne `type` (`transfer`, `dispatch`, `return`, `exchange`, `call`, `inventory`, `settlement`) : même numérotation, même historique (`audit_log`), même scan, même PDF. Les bordereaux inter-agences existants deviennent `type = 'transfer'` sans changement.
- **`manifest_items`** complétée (rôle, motif, résultat d'appel, commentaire, attendu / scanné, anomalie).
- **Stock** : `orders.in_stock` + `orders.current_agency_id` (déjà présent) = présence physique ; chaque entrée / sortie écrit une ligne `stock_movements` dans la même transaction que le changement d'état ; un colis ne peut pas entrer deux fois (mise à jour conditionnelle atomique).
- **Anomalies** : table `stock_anomalies` (manquant, supplémentaire, endommagé, autre) commune à l'entrée en stock, aux transferts et aux inventaires, résolue explicitement.
- **Finances** : le solde réutilise `cash_tx` (aucune comptabilité parallèle) ; l'annulation passe par une écriture de contrepassation.
