# SADEN Delivery — API partenaires (v1)

API REST pour les partenaires (Gafsa Mall, sites e-commerce, ERP) : création de commandes, suivi, mise à jour avant prise en charge, et webhooks de changement de statut.

- **Base URL** : `https://<votre-domaine>/api/v1` (ex. `https://saden-delivery.vercel.app/api/v1`)
- **Format** : JSON (`Content-Type: application/json`), dates ISO 8601 UTC, montants en TND (3 décimales).
- **Périmètre** : un partenaire ne voit **que ses propres commandes**. Le code OTP de livraison et les preuves (photo, signature) ne sont jamais exposés.

## Authentification

Les clés sont créées par l'administrateur SADEN (menu **API partenaires**). La clé complète n'est affichée **qu'une seule fois** ; SADEN n'en conserve que l'empreinte (SHA-256).

```
Authorization: Bearer sk_live_<votre_clé>
```
ou
```
X-Api-Key: sk_live_<votre_clé>
```

| Code | Signification |
|---|---|
| 200 / 201 | Succès (201 = commande créée) |
| 401 | Clé absente ou invalide |
| 403 | Clé désactivée |
| 404 | Commande introuvable (ou appartenant à un autre partenaire) |
| 409 | Action impossible dans l'état actuel (ex. modification après affectation) |
| 422 | Données invalides (message explicite dans `error`) |
| 429 | Trop de requêtes (limite par clé) |

Les erreurs ont la forme `{ "error": "message" }`.

## Créer une commande — `POST /v1/orders`

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `external_ref` | string | recommandé | Votre référence de commande — **clé d'idempotence** |
| `shop_name` | string | | Boutique expéditrice (si la clé n'est pas liée à une boutique précise) |
| `shop_phone`, `shop_address` | string | | Coordonnées de la boutique expéditrice |
| `client_name` | string | ✅ | Nom du destinataire |
| `client_phone` | string | ✅ | Téléphone (8 chiffres tunisiens, `+216` accepté) |
| `address` | string | ✅ | Adresse de livraison |
| `city` / `city_id` | string / int | ✅ | Ville de destination (nom exact d'une ville SADEN active ou son id) ; `governorate` pour lever une ambiguïté |
| `zone` / `zone_id` | string / int | | Zone de la ville |
| `lat`, `lng` | number | | Position GPS du destinataire |
| `items` | array | | Produits : `[{ "name": "Casque", "qty": 1, "price": 89.9 }]` |
| `amount` | number | | Valeur des marchandises (par défaut : somme des `items`) |
| `cod` | number | | Montant à encaisser à la livraison (0 si prépayé) |
| `payment_mode` | string | | `cod` (défaut), `prepaid`, `sender_pays` |
| `weight` | number | | Poids en kg |
| `parcel_type` | string | | `standard`, `fragile`, `document`, `volumineux`, `alimentaire` |
| `pieces` | int | | Nombre de pièces (défaut : quantité totale des `items`) |
| `description`, `notes` | string | | Description du colis, instructions au livreur |

Les frais de livraison sont calculés par SADEN (règles tarifaires) et renvoyés dans la réponse (`delivery_fee`, `amount_to_remit`).

**Idempotence** : renvoyer la même requête (même `external_ref`, ou même en-tête `Idempotency-Key`) ne crée pas de doublon. La réponse est alors `200` avec la commande existante, `"idempotent_replay": true` et l'en-tête `Idempotent-Replay: true`.

```bash
curl -X POST https://saden-delivery.vercel.app/api/v1/orders \
  -H "Authorization: Bearer $SADEN_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: gm-48213-1" \
  -d '{
    "external_ref": "GM-48213",
    "shop_name": "Électro Sud",
    "client_name": "Salma Khemiri",
    "client_phone": "+216 98 412 337",
    "address": "Rue Ibn Khaldoun",
    "city": "Gafsa",
    "zone": "Cité Ennour",
    "items": [{ "name": "Casque Bluetooth", "qty": 1, "price": 89 }, { "name": "Câble USB-C", "qty": 2, "price": 12.5 }],
    "cod": 114,
    "notes": "Appeler 10 min avant"
  }'
```

Réponse `201` :

```json
{
  "order": {
    "ref": "SD-24187", "external_ref": "GM-48213", "status": "attente",
    "client_name": "Salma Khemiri", "client_phone": "+216 98 412 337", "address": "Rue Ibn Khaldoun",
    "city": "Gafsa", "zone": "Cité Ennour", "cod": 114, "goods_value": 114, "payment_mode": "cod",
    "delivery_fee": 7, "amount_to_remit": 107, "pieces": 3,
    "items": [{ "name": "Casque Bluetooth", "qty": 1, "price": 89 }, { "name": "Câble USB-C", "qty": 2, "price": 12.5 }],
    "created_at": "2026-10-13T09:12:44.120Z", "updated_at": "2026-10-13T09:12:44.120Z",
    "tracking_url": "https://saden-delivery.vercel.app/?t=SD-24187"
  }
}
```

## Consulter — `GET /v1/orders/:ref`

`:ref` accepte la référence SADEN (`SD-24187`) ou votre `external_ref`.

```bash
curl https://saden-delivery.vercel.app/api/v1/orders/GM-48213 -H "Authorization: Bearer $SADEN_KEY"
```

## Statut — `GET /v1/orders/:ref/status`

```bash
curl https://saden-delivery.vercel.app/api/v1/orders/SD-24187/status -H "Authorization: Bearer $SADEN_KEY"
# { "ref": "SD-24187", "external_ref": "GM-48213", "status": "livraison", "updated_at": "…" }
```

## Suivi — `GET /v1/orders/:ref/tracking`

Historique des statuts (sans données internes) et lien de suivi public pour le client final.

```json
{ "ref": "SD-24187", "status": "livre", "tracking_url": "…/?t=SD-24187",
  "events": [{ "status": "cree", "at": "…" }, { "status": "attente", "at": "…" }, { "status": "affecte", "at": "…" }, { "status": "livre", "at": "…" }] }
```

## Modifier — `PATCH /v1/orders/:ref`

Uniquement **avant l'affectation à un livreur** (statut `cree` ou `attente`), sinon `409`. Champs modifiables : `client_name`, `client_phone`, `address`, `lat`, `lng`, `notes`, `description`, `cod` (les frais sont recalculés). Tout autre champ → `422`.

```bash
curl -X PATCH https://saden-delivery.vercel.app/api/v1/orders/GM-48213 \
  -H "Authorization: Bearer $SADEN_KEY" -H "Content-Type: application/json" \
  -d '{ "address": "Rue Ibn Khaldoun, immeuble B, 2e étage", "cod": 120 }'
```

## Statuts

| Statut | Signification |
|---|---|
| `cree`, `attente` | Commande reçue, en attente de prise en charge |
| `en_agence` | Colis reçu en agence |
| `affecte`, `accepte`, `ramasse` | Livreur affecté / a accepté / a récupéré le colis |
| `transit`, `arrive` | Inter-villes : en transit, arrivé à l'agence de destination |
| `livraison`, `sur_place` | Livreur en route / devant le client |
| `livre` | Livré (final) |
| `absent`, `refuse`, `reporte`, `numero_incorrect`, `adresse_incorrecte`, `endommage` | Incident de livraison (motif dans le webhook) |
| `perdu`, `annule` | Perdu, annulé (finaux) |
| `retour`, `retour_agence`, `restitue` | Retour vers l'expéditeur, reçu en agence, restitué (final) |

## Webhooks

Configurez l'URL (https) dans **API partenaires**. À chaque changement de statut d'une de vos commandes, SADEN envoie un `POST` JSON :

| Événement | Déclencheur |
|---|---|
| `order.received` | Commande reçue (statut `attente`) |
| `order.assigned` | Livreur affecté |
| `order.in_delivery` | Livreur en route |
| `order.delivered` | Livré |
| `order.refused` | Refusé par le client |
| `order.cancelled` | Annulé |
| `order.returned` | Retour vers l'expéditeur |
| `order.status_changed` | Tout autre changement de statut |

```json
{
  "id": 412,
  "event": "order.refused",
  "created_at": "2026-10-13T11:02:10.512Z",
  "data": { "ref": "SD-24187", "external_ref": "GM-48213", "status": "refuse", "previous_status": "sur_place", "reason": "Le client a refusé le colis" }
}
```

En-têtes : `X-Saden-Event`, `X-Saden-Delivery` (id de l'envoi) et **`X-Saden-Signature: sha256=<hex>`** = HMAC-SHA256 du corps brut avec votre *secret de webhook* (affiché une seule fois, régénérable).

Vérification (Node.js) :

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verify(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return header && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

Répondez `2xx` en moins de 4 secondes. En cas d'échec : **3 tentatives maximum** (immédiate, puis environ +2 min et +4 min), toutes visibles dans le journal des webhooks de l'admin, avec un bouton « Renvoyer ». Les envois sont identifiés par `id` : ignorez un `id` déjà traité.

## Limites

- Requêtes limitées par clé (voir code `429`) — espacez les appels de synchronisation, préférez les webhooks.
- `items` : 100 lignes max ; `description` : 300 caractères ; `notes` : 500 caractères.
