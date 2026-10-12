# SADEN Delivery

PWA logistique (agence, livreurs, boutiques, suivi client) — frontend statique `public/` + API Node `api/` + PostgreSQL (**Supabase**). Déployable tel quel sur Vercel.

## Accès par rôle

| Rôle | Connexion | Interface |
|---|---|---|
| Admin (agence) | e-mail ou téléphone + mot de passe | tableau de bord, carte live, commandes, bordereaux, livreurs, caisse, stats, réclamations, **comptes** |
| Livreur | compte créé par l'admin | missions du jour, GPS, statuts, preuve de livraison (OTP / photo / signature) |
| Boutique | compte créé par l'admin | création de commandes, suivi de ses propres commandes, lien de suivi à partager |
| Client | sans compte : n° de colis + téléphone (ou lien `/?t=SD-xxxxx`) | suivi en direct, code de livraison, note + réclamation |

Administrateur : **hachem.jaxdelivery@gmail.com**. Au tout premier lancement (base vide), l'écran de connexion propose de créer ce compte (seule l'adresse définie dans `ADMIN_EMAIL` est acceptée). Autre possibilité : `npm run create-admin -- hachem.jaxdelivery@gmail.com "Hachem"` crée le compte directement et affiche un mot de passe.

## Lancer en local

```bash
npm install
npm run seed   # optionnel : données de démo (mot de passe : saden123 — admin 20000000, livreur 21000001, boutique 22000001)
npm run dev    # http://localhost:3000
```

Sans `DATABASE_URL`, une base PostgreSQL embarquée (PGlite) est créée dans `.data/`. Avec `DATABASE_URL` dans `.env`, l'app utilise ce serveur PostgreSQL.

## Base de données Supabase

Projet : `https://igjbhbxjrktqjvqalnaq.supabase.co`

1. Supabase → **Project Settings → Database → Connection string** → onglet **Transaction pooler** (port `6543`, compatible Vercel/IPv4).
2. Copier l'URI et remplacer `[YOUR-PASSWORD]` par le mot de passe de la base (Database → *Reset database password* si oublié).
3. Mettre cette URI dans `DATABASE_URL` (fichier `.env` en local, variables d'environnement sur Vercel).

Les tables sont créées automatiquement au premier appel, avec **Row Level Security activé** : l'API publique de Supabase (clé `anon`) n'a accès à rien, seule l'application (connexion PostgreSQL) lit et écrit les données.

## Déployer sur Vercel

1. **Vercel → Add New → Project** et importer le dépôt GitHub `achrefmok/saden-delivery` (aucun réglage de build nécessaire).
2. **Settings → Environment Variables** :
   - `DATABASE_URL` = URI Supabase (Transaction pooler)
   - `JWT_SECRET` = chaîne longue aléatoire
   - `ADMIN_EMAIL` = `hachem.jaxdelivery@gmail.com`
   - optionnel : `AGENCY_CITY`, `DELIVERY_FEE`, `DRIVER_SHARE`, `APP_TZ`
3. Redéployer, ouvrir l'URL, créer le compte administrateur (ou utiliser `npm run create-admin`).

Pour charger les données de démo dans Supabase : mettre la même `DATABASE_URL` dans `.env` puis `npm run seed`.

## Structure

```
public/index.html          application (vanilla JS, responsive, FR/AR + RTL, clair/sombre)
public/sw.js, manifest     PWA (installable, hors-ligne pour l'interface)
api/index.js               fonction Vercel unique → lib/api.js (routeur)
lib/api.js                 routes : auth, comptes, commandes, bordereaux, caisse, stats, suivi public
lib/db.js, lib/schema.js   connexion PostgreSQL + schéma (créé automatiquement)
scripts/dev.js, seed.js    serveur local, données de démo
scripts/create-admin.js    crée / promeut un administrateur par e-mail
```

## À savoir

- Le code OTP de livraison s'affiche sur la page de suivi du client (pas d'envoi SMS intégré).
- Les preuves photo/signature sont stockées compressées dans PostgreSQL.
- Pas de limitation du nombre d'essais sur la connexion et le suivi public : à ajouter avant une mise en production à grande échelle.
