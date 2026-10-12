# Conformité au Cahier des Charges V1 — Phase 1 (MVP)

Branche `cdc-v1`, 19 commits (refactor + blocs 1 à 17 + seed / README). Légende : ✅ conforme · ⚠️ partiel · ❌ non traité.

> Les sections citées par la mission (§1, §5–§12, §14, §19–§25, §27–§30) sont évaluées précisément. Pour les autres numéros, le texte du cahier des charges n'était pas joint : l'intitulé indiqué est déduit du contexte et l'évaluation porte sur ce que l'application couvre réellement.

| § | Sujet | État | Ce qui est livré / ce qui manque |
|---|---|---|---|
| 1 | Multi-gouvernorats, villes, zones | ✅ | Tables `governorates`, `cities`, `zones`, `agencies`, `agency_zones` ; écrans « Agences » et « Villes / Zones » (CRUD, activer / désactiver) |
| 2 | Objectifs / périmètre (déduit) | ✅ | Plateforme multi-agences opérationnelle de bout en bout |
| 3 | Acteurs (déduit) | ✅ | Super admin, responsable d'agence, livreur, boutique, client, partenaire API |
| 4 | Parcours généraux (déduit) | ✅ | Création → affectation → livraison → suivi → avis, local et inter-villes |
| 5 | Agences | ✅ | Agence = ville + zones desservies + responsable + affectation auto ; agence de destination déduite de la zone |
| 6 | Zones / villes sans code | ✅ | Ajout d'une ville ou d'une zone depuis l'admin, listes Ville → Zone dans tous les formulaires |
| 7 | Rôles, responsable d'agence | ✅ | Rôle `manager` limité à son agence ; filtre agence global pour le super admin ; `scopeWhere()` unique |
| 8 | Fiche colis | ✅ | Expéditeur, destinataire, référence externe, description, pièces, poids, type, mode de paiement, notes, source, montants figés |
| 9 | QR / code-barres / scan | ✅ | QR sur la fiche, étiquette 10×15, scan caméra (BarcodeDetector / html5-qrcode) + saisie manuelle, 8 actions, inventaire, audit GPS |
| 10 | Bordereaux | ✅ | Brouillon → validé → en transit → arrivé → clôturé, composition manuelle, un bordereau actif par colis, réception par scan, manquants, PDF jsPDF, historique |
| 11 | Statuts | ✅ | 22 statuts (dont annulé, retour, numéro / adresse incorrects, endommagé, perdu), machine à états serveur par rôle |
| 12 | GPS et consentement | ✅ | Consentement explicite enregistré, transmission seulement Disponible / En livraison, indicateur |
| 13 | Interface livreur (déduit) | ✅ | Missions, deux modes (liste / guidé), incidents avec motif, preuve OTP / photo / signature, scan |
| 14 | Affectation intelligente | ✅ | Score détaillé (distance Haversine + position ancienne > 15 min, disponibilité, zone, charge, véhicule), mode automatique réel par agence |
| 15 | Preuve de livraison (déduit) | ✅ | OTP vérifié serveur, photo compressée, signature tactile, stockées et consultables |
| 16 | Suivi client (déduit) | ✅ | Page publique sans compte, code de livraison, position du livreur, ETA |
| 17 | Espace boutique (déduit) | ✅ | Création avec devis en direct, liste, annulation avant prise en charge, étiquettes, lien de suivi |
| 18 | Évaluation des livreurs (déduit) | ✅ | Note + commentaire liés à une livraison réelle, non modifiables par le livreur |
| 19 | API partenaires | ✅ | Clés hachées affichées une fois, `/api/v1` (POST idempotent, GET, PATCH limité, status, tracking), périmètre par partenaire, `docs/API.md` |
| 20 | Intégration Gafsa Mall | ✅ | Partenaire multi-boutiques, produits (`order_items`), webhooks HMAC-SHA256, 3 tentatives, renvoi manuel |
| 21 | Tarification | ✅ | `pricing_rules` + `computePrice()` (règle la plus spécifique, défaut obligatoire), écran Tarifs + simulateur, montants figés |
| 22 | Fiche financière du colis | ✅ | `delivery_fee`, `driver_share`, `saden_revenue`, `amount_to_remit` selon le mode de paiement |
| 23 | Caisse par agence | ✅ | Mouvements par agence, transferts à deux écritures liées, remises COD livreurs, règlements boutiques, revenu Saden |
| 24 | Statistiques | ✅ | Filtres from / to, agence, ville, livreur, boutique ; CA réel, retours ; performance par boutique / ville / zone ; notes par agence / ville |
| 25 | Notifications | ⚠️ | Phase 1 livrée (table, in-app, cloche, `notify()`). Push, SMS, WhatsApp, e-mail = Phase 2 |
| 26 | Interface client / avis (déduit) | ✅ | Note, commentaire, réclamation catégorisée depuis le suivi |
| 27 | Réclamations | ✅ | Bug du `% 4` corrigé, statuts sans retour arrière, réouverture tracée, note interne, historique |
| 28 | Recherche globale | ✅ | `/search` serveur selon le périmètre, résultats groupés, ouverture directe par ref / QR |
| 29 | Sécurité / permissions | ✅ | Périmètre sur toutes les routes, limites d'essais en base (login, suivi, avis, clés API), RLS, `test-permissions.js` (45 contrôles) |
| 30 | Historisation / audit | ✅ | `order_events` (ancien statut, utilisateur, motif), `audit_log` (avant / après, IP), écran Journal filtrable |
| 31 | PWA / responsive (déduit) | ✅ | Installable, hors ligne pour l'interface, mobile sans débordement, FR / AR + RTL, clair / sombre |
| 32 | Hébergement / déploiement (déduit) | ⚠️ | Code prêt pour Vercel + Supabase ; la variable `DATABASE_URL` de Vercel est encore à corriger (adresse pooler) |
| 33 | Performance / charge (déduit) | ⚠️ | Index sur les colonnes filtrées, requêtes bornées (LIMIT) ; pas de test de charge ni de pagination serveur des listes |
| 34 | Sauvegardes / exploitation (déduit) | ⚠️ | Sauvegardes gérées par Supabase ; pas de procédure de restauration documentée |
| 35 | Formation / documentation (déduit) | ⚠️ | README, docs/API.md ; pas de guide utilisateur par rôle |
| 36 | Planning / phases (déduit) | — | Phase 1 couverte ; voir ci-dessous |

## Reste pour les Phases 2 et 3

- **Phase 2** : canaux push (Web Push / FCM), SMS (envoi de l'OTP), WhatsApp, e-mail via `notify()` ; file de webhooks par tâche planifiée (Vercel Cron) plutôt qu'au fil des appels ; pagination serveur des listes ; polygones de zones dessinés sur la carte (le champ `polygon` existe) ; signature des PDF ; guide utilisateur.
- **Phase 3** : optimisation de tournées multi-colis, application native, facturation et exports comptables, tableau de bord temps réel par WebSocket, multi-devises / multi-pays.

## Rapport de tests

Environnement : `npm run seed` sur une base PGlite neuve, puis `npm run dev` (base locale forcée, Supabase jamais touchée). Tests navigateur avec Chrome headless (puppeteer-core) et appels HTTP directs.

| Suite | Contenu | Résultat |
|---|---|---|
| Migration d'une base existante | 141 commandes, comptes, bordereau et caisse rattachés à « Agence Gafsa », zones et villes texte → lignes | ✅ sans perte |
| `t-flow` (parcours complet) | boutique crée (UI) → responsable affecte → livreur accepte / livre avec OTP (mobile) → client suit et note → admin ; responsable Sousse isolé ; arabe RTL mobile sans débordement | ✅ 6 étapes |
| `t-geo` (blocs 1-2) | création gouvernorat / ville / zones / agence depuis l'UI, responsable, routage inter-villes, filtre agence, isolation du responsable (404 / 403) | ✅ 7 |
| `t-pricing` (3) | règle de zone prioritaire, commission COD, mode « frais payés expéditeur », montants figés après modification, règle par défaut protégée (409), devis en direct | ✅ 5 |
| `t-parcel` (4) | fiche complète saisie par une boutique, détail et page de suivi | ✅ 3 |
| `t-status` (7) | annulation boutique (OK / 409), transitions interdites (409), motif obligatoire (400), flux retour complet, historique, fenêtre motif | ✅ 4 |
| `t-scan` (5) | QR + étiquette 10×15, réception, référence inconnue, inventaire (manquants / non attendus), ouverture de mission livreur | ✅ 5 |
| `t-brd` (6) | composition par sélection et par scan, bordereau actif unique, cycle complet, réception par scan, manquants à la clôture, PDF, historique | ✅ 7 |
| `t-assign` (8) | classement serveur et score détaillé, position ancienne, livreur d'une autre agence refusé, mode automatique | ✅ 3 |
| `t-api` (9) | clé affichée une fois, 401, idempotence (external_ref et Idempotency-Key), 422, périmètre partenaire, PATCH avant / après affectation, webhooks signés, échec → renvoi | ✅ 6 |
| `t-cash` (10) | remise COD livreur (UI), règlement boutique, transfert à deux écritures, caisse du responsable limitée à son agence | ✅ 5 |
| `t-stats` (11) | période personnalisée + filtre boutique dans l'UI ; API : préréglages, filtres ville / livreur / boutique, période invalide | ✅ |
| `t-search` (12) | téléphone avec espaces, ref externe exacte, groupes, entrée type injection, boutique refusée (403), Entrée et QR ouvrent la fiche | ✅ 2 |
| `t-audit` (13) | création / désactivation / mot de passe / annulation / tarifs journalisés (avant / après, IP), mot de passe jamais stocké, filtres, 403 boutique | ✅ 2 |
| `t-gps` (14) | 428 sans consentement, fenêtre de consentement, 409 en pause, suivi navigateur arrêté, consentement journalisé | ✅ 3 |
| `t-claims` (15) | ancien `/advance` supprimé, retour arrière refusé, réouverture avec motif, historique, notes par agence / ville | ✅ 2 |
| `t-notif` (17) | nouvelle commande → responsable, affectation → livreur, statut → boutique, cloche, ouverture et lecture | ✅ 3 |
| `npm run test:permissions` (16) | boutique, livreur, responsable, partenaire API, suivi public (dont 429 + Retry-After) | ✅ 45 / 45 |
| Limite de connexion | 8 échecs puis 429 + `Retry-After: 900` ; un autre compte reste utilisable | ✅ |

Anomalies trouvées et corrigées pendant les tests : statut initial d'une commande (`cree`), décodage d'un code contenant `%`, message d'erreur base de données trompeur, erreur Leaflet à la déconnexion, ordre de chargement des modules, téléphone de test à 7 chiffres.
