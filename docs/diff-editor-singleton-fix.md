# Monaco Diff Editor — Singleton Pattern Fix

## Problème

Après avoir ajouté le formatage Prettier pour TypeScript/JavaScript, une erreur critique apparaissait :

```
Uncaught Error: InstantiationService has been disposed
```

**Déclencheur :** Ouvrir le diff modal (bouton diff après formatage), fermer le modal, puis faire un clic droit dans l'éditeur principal.

**Stack trace :**
```
at _onContextMenu (editor.api-CalNCsUg.js:52)
at emitContextMenu (editor.api-CalNCsUg.js:55)
at InstantiationService (editor.api-CalNCsUg.js:893)
```

---

## Cause racine

Monaco Editor utilise un **`StandaloneServices` singleton global** partagé entre toutes les instances d'éditeur dans le même contexte JavaScript (iframe). Ce singleton contient notamment l'`InstantiationService` qui gère la création des services internes de Monaco.

**L'approche initiale (bugguée) :**

```js
function openDiffModal(original, formatted) {
    var overlay = document.createElement('div');
    // ... création de l'overlay et du container
    
    var diffEditor = monaco.editor.createDiffEditor(container, options);
    diffEditor.setModel({ original, modified });
    
    closeBtn.onclick = function() {
        overlay.remove();
        diffEditor.dispose(); // ← PROBLÈME ICI
    };
}
```

**Pourquoi ça casse :**

1. `monaco.editor.createDiffEditor()` crée un diff editor qui **partage** le `StandaloneServices` avec l'éditeur principal
2. Quand on appelle `diffEditor.dispose()`, Monaco dispose **tous les services partagés**, y compris l'`InstantiationService`
3. L'éditeur principal se retrouve avec un `InstantiationService` mort
4. Au prochain clic droit, Monaco essaie d'utiliser ce service pour créer le menu contextuel → erreur

---

## Tentatives de fix (inefficaces)

### Tentative 1 : Disposer seulement les modèles

```js
closeBtn.onclick = function() {
    var model = diffEditor.getModel();
    if (model) {
        model.original?.dispose();
        model.modified?.dispose();
    }
    overlay.remove();
    diffEditor = null;
};
```

**Résultat :** Erreur persistante. Disposer les modèles alors qu'ils sont encore attachés à l'éditeur cause des problèmes internes.

### Tentative 2 : Ajouter `contextmenu: false`

```js
var DIFF_EDITOR_OPTIONS = {
    readOnly: true,
    renderSideBySide: true,
    automaticLayout: true,
    ignoreTrimWhitespace: false,
    contextmenu: false // ← inefficace
};
```

**Résultat :** Inefficace. Cette option désactive le menu contextuel de l'éditeur principal, mais le diff editor a son propre cycle d'instanciation et ignore cette option.

### Tentative 3 : Bloquer l'événement contextmenu au niveau DOM

```js
container.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
}, true);
```

**Résultat :** Inefficace. Le problème n'est pas le menu contextuel du diff editor, mais celui de l'éditeur principal après la fermeture du diff.

### Tentative 4 : Délai de 150ms avant d'ouvrir le diff

```js
case 'trigger-show-diff':
    if (lastFormatOriginal && lastFormatFormatted) {
        setTimeout(function() {
            openDiffModal(lastFormatOriginal, lastFormatFormatted);
        }, 150);
    }
    break;
```

**Résultat :** Inefficace. Le délai ne résout pas le problème de partage des services.

---

## Solution : Singleton Pattern

**Principe :** Créer le diff editor **une seule fois** au premier appel, puis le **réutiliser** pour tous les appels suivants. On ne dispose jamais l'éditeur lui-même, seulement ses modèles.

### Implémentation

```js
// Variables globales dans l'iframe
var diffEditorInstance = null;
var diffOverlayEl = null;

function closeDiffModal() {
    if (diffOverlayEl) diffOverlayEl.style.display = 'none';
}

function openDiffModal(original, formatted) {
    // Création lazy : une seule fois
    if (!diffOverlayEl) {
        diffOverlayEl = document.createElement('div');
        diffOverlayEl.className = 'diff-overlay';

        var toolbar = document.createElement('div');
        toolbar.className = 'diff-toolbar';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close';
        closeBtn.className = 'diff-close-btn';
        closeBtn.onclick = closeDiffModal; // ← Juste cacher, pas détruire
        toolbar.appendChild(closeBtn);

        var container = document.createElement('div');
        container.className = 'diff-container';

        diffOverlayEl.appendChild(toolbar);
        diffOverlayEl.appendChild(container);
        document.body.appendChild(diffOverlayEl);

        // Créé une seule fois, jamais disposé
        diffEditorInstance = monaco.editor.createDiffEditor(container, DIFF_EDITOR_OPTIONS);
    }

    // Afficher l'overlay
    diffOverlayEl.style.display = 'block';

    // Détacher les anciens modèles AVANT de les disposer
    var oldModel = diffEditorInstance.getModel();
    if (oldModel) {
        diffEditorInstance.setModel(null); // ← CRITIQUE : détacher d'abord
        oldModel.original?.dispose();
        oldModel.modified?.dispose();
    }

    // Attacher les nouveaux modèles
    diffEditorInstance.setModel({
        original: monaco.editor.createModel(original, currentLang),
        modified: monaco.editor.createModel(formatted, currentLang)
    });

    // Layout après affichage
    requestAnimationFrame(function() {
        var container = diffOverlayEl.querySelector('.diff-container');
        diffEditorInstance.layout({
            width: container.clientWidth,
            height: container.clientHeight
        });
    });
}
```

### CSS associé

```css
.diff-overlay {
    display: none; /* Caché par défaut, affiché via JS */
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
}
```

---

## Points clés de la solution

### 1. Création unique

Le diff editor est créé **une seule fois** lors du premier appel à `openDiffModal()`. Les appels suivants réutilisent la même instance.

### 2. Affichage/masquage via CSS

Au lieu de créer/détruire l'overlay à chaque fois, on utilise `display: block/none`. L'overlay reste dans le DOM.

### 3. Ordre critique pour les modèles

```js
diffEditorInstance.setModel(null);  // 1. Détacher d'abord
oldModel.original?.dispose();        // 2. Puis disposer
oldModel.modified?.dispose();
```

**Pourquoi cet ordre ?** Disposer un modèle alors qu'il est encore attaché à un éditeur cause des erreurs internes Monaco. Il faut d'abord détacher avec `setModel(null)`.

### 4. Pas de dispose du diff editor

Le diff editor n'est **jamais** disposé. Il reste en mémoire pour toute la durée de vie de l'iframe. Seuls les modèles (le contenu texte) sont disposés et recréés à chaque ouverture.

### 5. Stabilité du StandaloneServices

En gardant le diff editor vivant, le `StandaloneServices` singleton reste stable. L'éditeur principal conserve ses services intacts et le menu contextuel fonctionne normalement.

---

## Avantages

1. **Pas d'erreur InstantiationService** — le singleton n'est jamais corrompu
2. **Performance** — pas de recréation du diff editor à chaque ouverture
3. **Simplicité** — moins de logique de création/destruction
4. **Pas de fuite mémoire** — les modèles sont correctement disposés

---

## Fichiers modifiés

- **`src/editor/monacoEditor.html`** — implémentation du singleton pattern dans `openDiffModal()`
- **`src/types/monacoHtml.css`** — ajout de `display: none` sur `.diff-overlay`

---

## Leçon apprise

**Monaco Editor partage ses services internes entre toutes les instances d'éditeur dans le même contexte JavaScript.** Créer puis détruire des éditeurs (surtout des diff editors) peut corrompre ce singleton partagé.

**Solution générale :** Pour tout éditeur secondaire (diff, modal, etc.), préférer le **singleton pattern** : créer une fois, réutiliser, ne jamais disposer l'éditeur lui-même.
