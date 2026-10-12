# SADEN Delivery

PWA logistique multi-agences (gouvernorats → villes → zones → agences) : super admin, responsables d'agence, livreurs, boutiques, suivi client et API partenaires (Gafsa Mall). Frontend vanilla JS (`public/`), une seule fonction Vercel (`api/index.js` → `lib/`), PostgreSQL (**Supabase**), PGlite en local.

## Rôles

| Rôle | Connexion | Accès |
|---|---|---|
| **Super admin** (`admin`) | e-mail ou téléphone | tout, avec filtre agence global ; agences, villes / zones, tarifs, comptes, API partenaires, journal |
| **Responsable d'agence** (`manager`) | e-mail ou téléphone | tableau de bord, commandes, bordereaux, livreurs, caisse, statistiques, réclamations, comptes livreurs / boutiques — **de son agence uniquement** |
| **Livreur** (`driver`) | téléphone | missions, scan, statuts et incidents (motif obligatoire), preuve OTP / photo / signature, GPS avec consentement |
| **Boutique** (`shop`) | téléphone | création de commandes (fiche complète + devis), suivi, annulation avant prise en charge, étiquettes |
| **Client** | sans compte : n° de colis + téléphone (lien `/?t=SD-…`) | suivi, code de livraison, note et réclamation |
| **Partenaire API** | clé `sk_live_…` | API `/api/v1` (voir [docs/API.md](docs/API.md)) |

Administrateur de production : **hachem.jaxdelivery@gmail.com** (création au premier lancement, réservée à `ADMIN_EMAIL`, ou `npm run create-admin`).

## Fonctionnalités (Cahier des charges V1 — Phase 1)

- **Multi-agences** : gouvernorats, villes, zones et agences gérés dans l'admin (sans code) ; colis inter-villes = ville de départ ≠ ville d'arrivée ; agence de destination déduite de la zone.
- **Périmètre** : un helper unique (`lib/scope.js` → `scopeWhere`) filtre chaque requête selon le rôle.
- **Tarification** (`lib/pricing.js`) : règles par agence / villes / zone / boutique / type / poids / distance ; la plus spécifique gagne, règle par défaut obligatoire ; montants figés sur la commande (frais, part livreur, revenu Saden, montant à reverser).
- **Fiche colis complète**, **QR + étiquette 10×15**, **scan caméra** (réception, bordereau, expédition, arrivée, retour, inventaire, livraison, ouverture de fiche).
- **Bordereaux** : brouillon → validé → en transit → arrivé → clôturé, composition manuelle, réception colis par colis, manquants, PDF.
- **Machine à états** serveur (`lib/status.js`) : transitions par rôle, motifs, annulation, flux retour, historique complet.
- **Affectation intelligente** (`lib/assign.js`) : score détaillé, mode automatique par agence.
- **Caisse par agence** : remises COD des livreurs, règlements boutiques, transferts liés.
- **Statistiques filtrables**, **recherche globale**, **journal d'audit**, **notifications in-app**, **limites d'essais**.

## Lancer en local

```bash
npm install
npm run seed              # données de démo dans .data/ (PGlite) — jamais dans Supabase sans --remote
npm run dev               # http://localhost:3000 (base locale si DATABASE_URL absent, ou avec DB=local)
npm run test:permissions  # 45 contrôles d'accès (serveur lancé)
```

Comptes de démo (mot de passe `saden123`) :

| Compte | Identifiant |
|---|---|
| Super admin | `20000000` |
| Responsable Agence Gafsa / Agence Sousse | `20000001` / `20000002` |
| Livreurs Gafsa / Sousse | `21000001`…`21000006` / `21000007`, `21000008` |
| Boutiques Gafsa / Sousse | `22000001`…`22000005` / `22000006` |
| Partenaire API « Gafsa Mall » | clé affichée une fois à la fin de `npm run seed` |

Avec un `.env` pointant vers Supabase, préfixez par `DB=local` (`DB=local npm run dev`) pour travailler en local sans toucher à la production.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URI PostgreSQL — Supabase : *Transaction pooler* (port 6543) |
| `JWT_SECRET` | secret des sessions (chaîne longue aléatoire) |
| `ADMIN_EMAIL` | seule adresse autorisée à créer l'administrateur au premier lancement |
| `APP_TZ` | fuseau des statistiques (défaut `Africa/Tunis`) |
| `DELIVERY_FEE`, `INTERCITY_FEE`, `DRIVER_SHARE` | **valeurs de départ** des règles tarifaires par défaut (créées une fois, puis gérées dans « Tarifs ») |
| `RL_LOGIN_ID`, `RL_LOGIN_IP`, `RL_TRACK_REF`, `RL_TRACK_IP`, `RL_REVIEW_REF`, `RL_API_MIN` | seuils des limites d'essais (optionnels) |

`AGENCY_CITY` n'est plus utilisé : les agences et villes sont des données. Une base existante est migrée automatiquement, sans perte : tout ce qui existait est rattaché à « Agence Gafsa ».

## Base de données Supabase

1. Supabase → **Project Settings → Database → Connection string → Transaction pooler** (port `6543`).
2. Remplacer `[YOUR-PASSWORD]`, mettre l'URI dans `DATABASE_URL` (`.env` en local, variables Vercel en production).

Schéma et migrations : `lib/schema.js`, versionnés (`SCHEMA_VERSION`) et exécutés une seule fois dans une transaction sous verrou (pas de course entre instances). **RLS activé sur toutes les tables** : l'API publique de Supabase (clé `anon`) n'a accès à rien.

## Déployer sur Vercel

1. Importer le dépôt `achrefmok/saden-delivery` (aucun réglage de build).
2. Variables : `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` (cocher Production **et** Preview si les déploiements de branche doivent fonctionner).
3. Redéployer : la migration s'applique au premier appel.

## Structure

```
public/index.html              coquille PWA (styles, thèmes, FR/AR + RTL)
public/js/app.js               cœur : état, i18n, rendu, admin, livreur, boutique, client, cartes
public/js/*.js                 modules : geo-admin, pricing, scan, manifests, partners, cash, stats,
                               search, journal, claims, notifications
api/index.js                   fonction Vercel unique → lib/api.js
lib/http.js                    routeur, contexte de requête, erreurs
lib/scope.js                   périmètre par rôle (scopeWhere)
lib/status.js                  machine à états + historique + hooks
lib/pricing.js, assign.js      tarification, affectation intelligente
lib/partners.js, notify.js     clés API + webhooks signés, notifications
lib/audit.js, ratelimit.js     journal d'audit, limites d'essais
lib/routes/*.js                routes par domaine (dont v1.js = API partenaires)
docs/API.md                    documentation de l'API partenaires
scripts/                       dev, seed, create-admin, test-permissions
```
