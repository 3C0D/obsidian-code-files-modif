# Monaco Initialization & Sync Flow

Ce document explique comment la fenêtre principale d'Obsidian se synchronise avec l'iframe isolée de Monaco pour garantir que l'éditeur est prêt avant toute interaction.

## Le Pattern : "Deferred Promise"

L'initialisation est asynchrone et traverse deux environnements isolés. Pour gérer cela, on utilise une promesse dont la résolution est déléguée au gestionnaire de messages.

### 1. Création (mountCodeEditor.ts)
Lorsqu'on monte un éditeur, on crée une promesse "en attente" et on capture sa fonction de résolution (`resolve`) :

```ts
let resolveReady: () => void = () => {};
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
```

### 2. Signal de l'Iframe (init.ts)
L'iframe charge Monaco. Une fois que Monaco est prêt dans son propre environnement, il envoie un signal :
`window.parent.postMessage({ type: 'ready' }, '*')`

**Note :** Ce message ne contient pas de `context` car à ce stade, l'iframe ne sait pas encore quel fichier elle édite.

### 3. Poignée de main (messageHandler.ts)
Le `messageHandler` reçoit le signal `'ready'` et effectue deux actions critiques :
1.  **Initialisation** : Il envoie les `initParams` (contenant le contexte/chemin du fichier) à l'iframe.
2.  **Résolution** : Il appelle `resolveReady()`. Grâce au mécanisme de **closure**, `onMessage` a toujours accès à la fonction `resolve` créée à l'étape 1.

### 4. Consommation (Parent)
L'appelant (ex: `CodeEditorView`) peut alors attendre la résolution complète :
```ts
const handle = await mountCodeEditor(...);
await handle.ready; 
// Ici, Monaco est initialisé, le contenu est chargé et le contexte est défini.
```

## Pourquoi attendre le `ready` ?

Il est crucial d'attendre `await handle.ready` pour toutes les commandes "Fire and Forget" qui doivent s'exécuter immédiatement après l'ouverture mais qui nécessitent que Monaco soit totalement opérationnel.

### Cas d'usage concrets :

- **Navigation inter-fichiers (Jump to line)** : 
  Dans `openInMonacoLeaf()`, on attend `ready` avant d'envoyer `scroll-to-position`. Si on l'envoyait avant, le message serait ignoré par l'iframe en cours de chargement.
  
- **Focus initial** : 
  S'assurer que l'éditeur prend le focus seulement après avoir fini de charger le texte.

- **Interactions externes** : 
  Tout plugin tiers souhaitant interagir avec une instance de Monaco doit attendre ce signal pour ne pas envoyer de messages dans le vide.

## Typage et Sécurité

Le type `IframeMessage` inclut `{ type: 'ready' }` sans propriété `context`. Le `messageHandler` utilise l'analyse du flux de contrôle (Control Flow Analysis) de TypeScript :
1. On cast le message en `IframeMessage`.
2. On traite le cas `ready` et on fait un `return`.
3. Pour le reste du code, TypeScript "sait" par élimination que le message n'est plus un `ready` et qu'il possède donc obligatoirement une propriété `context` valide.
