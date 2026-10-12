# SADEN Delivery

PWA logistique (agence, livreurs, boutiques, suivi client) — frontend statique `public/` + API Node `api/` + PostgreSQL. Déployable tel quel sur Vercel.

## Accès par rôle

| Rôle | Connexion | Interface |
|---|---|---|
| Admin (agence) | téléphone + mot de passe | tableau de bord, carte live, commandes, bordereaux, livreurs, caisse, stats, réclamations, **comptes** |
| Livreur | compte créé par l'admin | missions du jour, GPS, statuts, preuve de livraison (OTP / photo / signature) |
| Boutique | compte créé par l'admin | création de commandes, suivi de ses propres commandes, lien de suivi à partager |
| Client | sans compte : n° de colis + téléphone (ou lien `/?t=SD-xxxxx`) | suivi en direct, code de livraison, note + réclamation |

Au tout premier lancement (base vide), l'écran de connexion propose de **créer le compte administrateur**.

## Lancer en local

```bash
npm install
npm run seed   # optionnel : données de démo (mot de passe : saden123 — admin 20000000, livreur 21000001, boutique 22000001)
npm run dev    # http://localhost:3000
```

Sans `DATABASE_URL`, une base PostgreSQL embarquée (PGlite) est créée dans `.data/`. Avec `DATABASE_URL` dans `.env`, l'app utilise ce serveur PostgreSQL.

## Déployer sur Vercel

1. Pousser le dossier sur GitHub, puis **Vercel → Add New → Project** et importer le dépôt (aucun réglage de build nécessaire).
2. **Storage → Create Database → Neon (Postgres)** et la lier au projet : `DATABASE_URL` est ajoutée automatiquement.
3. **Settings → Environment Variables** : ajouter `JWT_SECRET` (chaîne longue aléatoire). Optionnel : `AGENCY_CITY`, `DELIVERY_FEE`, `DRIVER_SHARE`, `APP_TZ`.
4. Redéployer, ouvrir l'URL, créer le compte administrateur. Les tables sont créées automatiquement au premier appel.

Pour charger les données de démo dans la base de production : mettre la même `DATABASE_URL` dans `.env` puis `npm run seed`.

## Structure

```
public/index.html          application (vanilla JS, responsive, FR/AR + RTL, clair/sombre)
public/sw.js, manifest     PWA (installable, hors-ligne pour l'interface)
api/index.js               fonction Vercel unique → lib/api.js (routeur)
lib/api.js                 routes : auth, comptes, commandes, bordereaux, caisse, stats, suivi public
lib/db.js, lib/schema.js   connexion PostgreSQL + schéma (créé automatiquement)
scripts/dev.js, seed.js    serveur local, données de démo
```

## À savoir

- Le code OTP de livraison s'affiche sur la page de suivi du client (pas d'envoi SMS intégré).
- Les preuves photo/signature sont stockées compressées dans PostgreSQL.
- Pas de limitation du nombre d'essais sur la connexion et le suivi public : à ajouter avant une mise en production à grande échelle.
