# Fonctionnalité de Rechargement Automatique d'Obsidian

## Vue d'ensemble

Cette fonctionnalité permet de déclencher automatiquement la commande "Recharger l'application sans enregistrer" dans Obsidian après chaque installation du plugin via `yarn real`.

## Contexte et Motivation

Lors du développement d'un plugin Obsidian, il est nécessaire de recharger l'application après chaque modification du code pour que les changements prennent effet. Cette opération manuelle répétitive devient rapidement fastidieuse.

La solution implémentée utilise l'API REST locale d'Obsidian pour automatiser ce processus.

## Architecture Technique

### Composants Implémentés

1. **Module de rechargement** (`scripts/build/reload.ts`)
   - Fonction `reloadObsidian()` qui appelle l'API REST
   - Gestion des erreurs et authentification
   - Intégration dans le processus de build

2. **Configuration d'environnement** (`.env`)
   - Stockage sécurisé de la clé API
   - Instructions détaillées pour la configuration

3. **Intégration dans le build** (`scripts/esbuild.config.ts`)
   - Appel automatique après installation réussie en mode `real`

### Flux de Fonctionnement

```
yarn real → build → copy to vault → reloadObsidian() → API call → Obsidian reload
```

## Prérequis

### Plugin Obsidian Requis

- **Local REST API** : Plugin community obligatoire
- Installation via la marketplace d'Obsidian

### Configuration Requise

1. **Activer le serveur HTTP** :
   - Dans Obsidian : Paramètres → Local REST API
   - Cocher "Enable Non-encrypted (HTTP) Server"

2. **Récupérer la clé API** :
   - Dans les paramètres du plugin Local REST API
   - Copier la clé générée automatiquement

3. **Configurer l'environnement** :
   ```bash
   # Dans .env
   OBSIDIAN_REST_API_KEY=votre_clé_api_ici
   ```

## Implémentation Détaillée

### Endpoint API Utilisé

- **URL** : `http://localhost:27123/commands/app:reload`
- **Méthode** : `POST`
- **Authentification** : Header `Authorization: Bearer <api_key>`

### Gestion des Erreurs

- **Plugin non installé** : Erreur de connexion (ECONNREFUSED)
- **Clé API invalide** : HTTP 401 Unauthorized
- **Commande introuvable** : HTTP 404 Not Found
- **Succès** : HTTP 204 No Content

### Sécurité

- Clé API stockée dans `.env` (fichier ignoré par Git)
- Utilisation du mode HTTP local uniquement (pas d'exposition réseau)
- Pas de transmission de données sensibles

## Choix de Conception

### Pourquoi HTTP au lieu de HTTPS ?

Le plugin Local REST API propose deux modes :
- **HTTPS** : Avec certificat auto-signé (complexe à gérer)
- **HTTP** : Plus simple pour usage local

**Décision** : Mode HTTP pour éviter les complications de certificats SSL dans un environnement de développement local.

### Pourquoi pas de prompt interactif pour la clé API ?

**Problématique** :
- L'utilisateur pourrait ne pas avoir encore installé/configuré le plugin
- Difficile de guider l'utilisateur à travers l'installation + configuration en une seule session
- Risque de confusion si les étapes ne sont pas faites dans l'ordre

**Solution choisie** :
- Configuration manuelle via `.env`
- Instructions détaillées dans le fichier
- Possibilité de configurer plus tard sans bloquer le développement

### Gestion du fichier .env

- **Création automatique** : Si `.env` n'existe pas, il est créé avec les chemins de vault
- **Sécurité** : `.env` ajouté au `.gitignore` pour éviter de committer les clés API
- **Évolutivité** : Structure permettant d'ajouter d'autres variables d'environnement

## Tests et Validation

### Tests Réalisés

1. **Connexion sans plugin** : Gestion gracieuse de l'erreur ECONNREFUSED
2. **API sans authentification** : Erreur 401 gérée
3. **Commande invalide** : Erreur 404 gérée
4. **Configuration valide** : Rechargement automatique fonctionnel

### Métriques de Succès

- ✅ Build `yarn real` réussi
- ✅ Rechargement automatique d'Obsidian
- ✅ Gestion d'erreur robuste
- ✅ Configuration sécurisée

## Maintenance et Évolutions

### Points d'Amélioration Potentiels

1. **Configuration interactive** : Prompts guidés si le plugin est détecté
2. **Validation de configuration** : Vérification que l'API répond avant utilisation
3. **Mode HTTPS** : Support du mode encrypté avec gestion automatique des certificats
4. **Retry logic** : Nouvelle tentative en cas d'échec temporaire

### Monitoring

- Logs détaillés en cas d'erreur
- Messages informatifs sur le statut de la fonctionnalité
- Compatibilité vérifiée avec différentes versions du plugin Local REST API

## Fichiers Modifiés

- `scripts/build/reload.ts` : Nouvelle fonctionnalité
- `scripts/build/constants.ts` : Port de l'API
- `scripts/esbuild.config.ts` : Intégration dans le build
- `scripts/utils.ts` : Template du .env mis à jour
- `.env` : Configuration de l'API
- `.gitignore` : Exclusion du .env

## Conclusion

Cette fonctionnalité améliore significativement l'expérience développeur en automatisant une tâche répétitive. L'approche choisie privilégie la simplicité et la robustesse plutôt que la complexité d'une configuration interactive.

La solution est sécurisée, documentée, et facilement maintenable pour les évolutions futures.