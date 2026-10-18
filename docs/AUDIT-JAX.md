# Écart fonctionnel JAX Delivery → Saden Delivery

Référence : rapport d'analyse en lecture seule de admin.jax-delivery.com (14/10/2026). Base Saden : `main` @ `3778070`.
Branche de travail : `feature/jax-parity`. Rien n'est copié de JAX (code, textes, design) : seules les **fonctionnalités** servent de cahier des charges.

## Tableau d'écart

| Fonctionnalité JAX | Saden avant | Décision |
|---|---|---|
| Entrée stock par scan | ✅ (Stock → Entrée en stock) | — |
| Bordereau d'expédition + livreur | ✅ | + immatriculation, **rapport de fin de journée** |
| Retour livreur → agence | ✅ | — |
| **Bordereau d'enlèvement** (demande de ramassage boutique) | ❌ | **Créer** : demande par la boutique ou l'agence, livreur, à enlever → enlevé → reçu à l'agence |
| **Retour à l'expéditeur** (restitution boutique, décharge signée) | ⚠️ statut `restitue` seul | **Créer** : bordereau de restitution, photo / décharge, « reçu par l'expéditeur » |
| Échange (colis E… lié) | ✅ (récupération liée) | + bouton **Générer échange** depuis la fiche colis |
| Inter-agence (relieur, types pickup / retour / échange / adresse erronée) | ✅ | + type de transfert + immatriculation |
| Vérification / émission d'appel | ✅ | — |
| Inventaire | ✅ | — |
| Solde livreur (payé, reçu PDF) | ✅ | — |
| **Tentatives** (compteur, KPI 0 / 1 / 2 / 3 / +3) | ❌ | **Créer** : compteur automatique à chaque échec de livraison, filtre, KPI |
| **Problèmes colis** (types, appels, traité / faux problème, RDV) | ⚠️ statuts d'incident + motif | **Créer** : file des problèmes, appels comptés, RDV, traitement, historique |
| **Tâches** (agents, RDV, badge temps réel) | ❌ | **Créer** : tâches liées au colis, compteur dans la barre, traitement |
| **Colis signalés / suspects** | ❌ | **Créer** : signalement manuel + règle automatique (≥ 3 tentatives, problèmes répétés) |
| **Outstanding** (colis en souffrance / retard livreur) | ❌ | **Créer** : colis bloqués (sans mouvement depuis N jours, chez un livreur depuis trop longtemps) |
| Liste colis : colonnes au choix, filtres avancés, filtre par liste collée | ⚠️ filtres simples | **Améliorer** |
| Export Excel | ❌ | **Créer** (XLSX) |
| Étiquettes en masse A4 / A6, **Zebra (ZPL)** | ⚠️ étiquette unitaire | **Créer** |
| **Mise à jour de statut en masse** | ❌ | **Créer** (même machine à états, colis par colis, rapport) |
| **Matrice** statuts × agences | ❌ | **Créer** |
| Statistiques avancées (1er passage, ≥ 3 tentatives, taux retour / échange, problèmes par type, top expéditeurs, gouvernorats, comparatif agences) | ⚠️ statistiques de base | **Améliorer** |
| **Clôture de caisse journalière** (compté vs théorique, manque / surplus), apports de fonds, solde initial, justificatifs | ⚠️ mouvements + transferts | **Créer** |
| Tableau de bord type JAX (enlèvements, retours, à livrer, tentatives…) | ⚠️ | **Améliorer** |
| Réclamations, paiements boutiques, portail boutique, suivi public | ✅ | — |
| Rôles fins (caissier, réception, dispatcher, relieur…) | ⚠️ admin / responsable / livreur / boutique | À valider avec vous (voir rapport) |
| Codes colis par gouvernorat (GAF…) | `SD-` | Conservé (changer le format casserait les étiquettes déjà imprimées et l'API partenaires) |
| SMS, temps réel (Pusher), prestataires | ❌ | Hors périmètre de ce lot (pas de fournisseur SMS configuré ; actualisation toutes les 20 s conservée) |

## Espace expéditeur (second rapport)

| Fonctionnalité JAX | Saden avant | Décision |
|---|---|---|
| Accueil (l'essentiel, suivi détaillé, suivi rapide) | ⚠️ 4 indicateurs | **Créer** |
| Création : téléphone 2, colis d'échange, contrôle, import Excel + modèle | ⚠️ formulaire unitaire | **Créer** |
| Colis en attente : étiquettes en masse, modifier, supprimer | ❌ | **Créer** (annulation au lieu de suppression) |
| Historique : filtres, colonnes, export, outstanding, parcours / problèmes / appels | ⚠️ liste simple | **Créer** (liste « Colis » partagée) |
| Réclamations (assistant 3 étapes) | ⚠️ depuis le suivi public uniquement | **Créer** |
| Échanges, retours, paiements (honoraires, RS 3 %, net) | ❌ côté boutique | **Créer** |
| Expéditions (sélection / scan, historique, annulation) | ⚠️ demande « tout » | **Améliorer** |
| Statistiques boutique (délais < 24 / 48 / 72 h…) | ❌ | **Créer** |
| Paramètres : format d'impression, utilisateurs multiples | ❌ | **Créer** |
