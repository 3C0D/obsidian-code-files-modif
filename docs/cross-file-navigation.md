# Navigation Inter-Fichiers (Cross-File Navigation)

Ce document explique comment la navigation inter-fichiers a été implémentée dans le plugin Code Files pour permettre le Ctrl+Clic sur les imports TypeScript/JavaScript.

---

## Vue d'ensemble

La navigation inter-fichiers permet de :
- **Ctrl+Clic** sur un import pour ouvrir le fichier source dans Obsidian
- Naviguer vers la **position exacte** (ligne + colonne) de la définition
- Résoudre les imports relatifs TypeScript/JavaScript entre fichiers d'un même projet

---

## Architecture

### 1. Configuration du projet

**Fichier :** `src/types/types.ts`
- Ajout du champ `projectRootFolder: string` dans `MyPluginSettings`
- Permet de définir le dossier racine du projet pour la résolution des imports

**Fichier :** `src/modals/editorSettingsModal.ts`
- Champ "Project Root Folder" dans le panneau Editor Settings (⚙️)
- Autocomplete avec `FolderSuggest` pour sélectionner un dossier du vault

**Fichier :** `src/ui/folderSuggest.ts`
- Composant de suggestion de dossiers basé sur `AbstractInputSuggest`
- Liste tous les dossiers du vault avec filtrage

---

### 2. Chargement des fichiers du projet

**Fichier :** `src/editor/mountCodeEditor.ts`

**Fonction `loadProjectFiles` :**
```typescript
async function loadProjectFiles(send) {
    const root = plugin.settings.projectRootFolder;
    if (!root) return;
    
    const files = [];
    for (const file of plugin.app.vault.getFiles()) {
        if (!file.path.startsWith(root + '/')) continue;
        if (!['ts', 'tsx', 'js', 'jsx'].includes(file.extension)) continue;
        files.push({ path: file.path, content: await plugin.app.vault.cachedRead(file) });
    }
    send('load-project-files', { files });
}
```

- Charge tous les fichiers TS/JS du dossier projet
- Envoie les fichiers à Monaco via postMessage
- Appelé après `ready` dans le handler de messages

---

### 3. Configuration TypeScript dans Monaco

**Fichier :** `src/editor/monacoEditor.html`

**Création du modèle avec URI `file:///` :**
```javascript
// CRITIQUE : Le fichier courant doit avoir un URI file:/// pour que TypeScript
// puisse matcher les imports avec les extra libs
var modelUri = monaco.Uri.parse('file:///' + context);
var existingModel = monaco.editor.getModel(modelUri);
var model = existingModel || monaco.editor.createModel('', params.lang || 'plaintext', modelUri);
opts.model = model;
```

**Configuration des compilerOptions :**
```javascript
if (params.projectRootFolder) {
    var compilerOptions = {
        baseUrl: 'file:///' + params.projectRootFolder,  // URI complet, pas chemin relatif
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        allowJs: true,
        checkJs: false,
        paths: {}
    };
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
}
```

**Chargement des extra libs :**
```javascript
case 'load-project-files':
    if (!window._initialized) {
        // Différer si init n'est pas encore traité
        window._pendingProjectFiles = data.files;
    } else {
        for (var i = 0; i < data.files.length; i++) {
            var file = data.files[i];
            var uri = monaco.Uri.parse('file:///' + file.path);
            monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, uri.toString());
            monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, uri.toString());
            if (!monaco.editor.getModel(uri)) {
                monaco.editor.createModel(file.content, undefined, uri);
            }
        }
    }
    break;
```

---

### 4. Interception de la navigation

**Fichier :** `src/editor/monacoEditor.html`

**Enregistrement de l'opener :**
```javascript
monaco.editor.registerEditorOpener({
    openCodeEditor: function(_source, resource, selectionOrPosition) {
        // Extraire la position (ligne + colonne)
        var position = null;
        if (selectionOrPosition && 'startLineNumber' in selectionOrPosition) {
            position = {
                lineNumber: selectionOrPosition.startLineNumber,
                column: selectionOrPosition.startColumn
            };
        } else if (selectionOrPosition && 'lineNumber' in selectionOrPosition) {
            position = {
                lineNumber: selectionOrPosition.lineNumber,
                column: selectionOrPosition.column
            };
        }
        
        // Envoyer à Obsidian
        window.parent.postMessage({
            type: 'open-file',
            path: resource.path.replace(/^\//, ''),  // vault-relative path
            position: position,
            context: context
        }, '*');
        
        return true;  // "handled, don't open inline"
    }
});
```

---

### 5. Ouverture du fichier dans Obsidian

**Fichier :** `src/editor/mountCodeEditor.ts`

**Handler `open-file` :**
```typescript
case 'open-file': {
    if (data.context !== codeContext) break;
    const vaultPath = data.path as string;
    const position = data.position as { lineNumber: number; column: number } | null;
    const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) break;

    // Look for an existing leaf in the main editor area (no sidebars, no popout windows)
    const existingLeaf = plugin.app.workspace.getLeavesOfType('code-editor').find((l) => {
        // Must be in the main window
        if (l.view.containerEl.win !== window) return false;
        // Must be in the root split (editor area), not left/right sidebar
        const root = plugin.app.workspace.rootSplit;
        let el: Element | null = l.containerEl;
        while (el && el !== root.containerEl) el = el.parentElement;
        if (!el) return false;
        // File must match
        return l.view instanceof CodeEditorView && l.view.file?.path === vaultPath;
    });

    const leaf = existingLeaf ?? plugin.app.workspace.getLeaf('tab');
    if (!existingLeaf) await leaf.openFile(file);
    plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

    if (position) {
        setTimeout(() => {
            if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
                leaf.view.editor.send('scroll-to-position', { position });
            }
        }, existingLeaf ? 0 : 150);
    }
    break;
}
```

**Réutilisation des tabs existants :**
- Cherche d'abord si le fichier est déjà ouvert dans un tab de l'éditeur principal
- Exclut les sidebars et les fenêtres popout
- Si le fichier est déjà ouvert, réutilise le tab existant au lieu d'en créer un nouveau
- Le délai pour le scroll est de 0ms si le tab existait déjà (Monaco prêt), 150ms pour un nouveau fichier

**Handler `scroll-to-position` dans l'iframe :**
```javascript
case 'scroll-to-position':
    if (editor && data.position) {
        editor.setPosition(data.position);
        editor.revealPositionInCenter(data.position);
    }
    break;
```

---

### 6. Getter public pour l'editor

**Fichier :** `src/editor/codeEditorView.ts`

```typescript
/** Public getter for editor instance (used by mountCodeEditor for scroll-to-position) */
get editor(): CodeEditorInstance | undefined {
    return this.codeEditor;
}
```

---

## Diagnostic : Vérifier les URIs

Pour vérifier que les URIs sont correctement configurés :

1. **Ouvrir DevTools** (F12)
2. **Aller dans Console**
3. **Sélectionner l'iframe Monaco** :
   - Cliquer sur le dropdown "top" en haut de la console
   - Survoler les entrées jusqu'à ce que la feuille active s'éclaire
   - Sélectionner l'iframe (ressemble à `blob:app://obsidian.md/21436132-fdd0-4a72-8f5c...`)
4. **Taper dans la console** :
   ```javascript
   monaco.editor.getModels().map(m => m.uri.toString())
   ```
5. **Vérifier le résultat** :
   - ✅ Tous les URIs doivent être en `file:///templates/projet-test-sample/...`
   - ❌ Si tu vois `inmemory://model/1`, le modèle n'a pas été créé avec l'URI correct

---

## Problèmes courants

### TypeScript ne résout pas les imports

**Cause :** Mismatch d'URI entre le fichier courant et les extra libs.

**Solution :**
- Vérifier que le modèle du fichier courant utilise `monaco.Uri.parse('file:///' + context)`
- Vérifier que `baseUrl` est `'file:///' + projectRootFolder` (pas un chemin relatif)
- Vérifier que tous les extra libs utilisent des URIs `file:///`

### La navigation ne fonctionne pas

**Cause :** `registerEditorOpener` n'est pas appelé ou le postMessage n'arrive pas.

**Solution :**
- Vérifier que `registerEditorOpener` est appelé après `monaco.editor.create`
- Vérifier dans la console que le postMessage `open-file` est envoyé
- Vérifier que le handler `open-file` dans `mountCodeEditor.ts` est bien déclenché

### Plusieurs tabs s'ouvrent pour le même fichier

**Cause :** La logique de réutilisation des tabs ne trouve pas le tab existant.

**Solution :**
- Vérifier que le fichier est bien ouvert dans l'éditeur principal (pas dans une sidebar ou popout)
- Le check remonte l'arbre DOM jusqu'à `rootSplit.containerEl` pour exclure les sidebars
- Si la structure interne d'Obsidian change dans une future version, ce check peut nécessiter un ajustement

### Le scroll vers la position ne fonctionne pas

**Cause :** Le fichier s'ouvre mais le curseur ne se positionne pas.

**Solution :**
- Vérifier que `position` est bien extrait de `selectionOrPosition`
- Vérifier que le `setTimeout` de 100ms est suffisant pour que Monaco soit prêt
- Vérifier que `leaf.view instanceof CodeEditorView` est vrai

---

## Projet de test

Un projet exemple est disponible dans `templates/projet-test-sample/` avec 3 fichiers TypeScript :

- **utils.ts** — Fonctions utilitaires (add, multiply, Calculator)
- **service.ts** — Service qui importe utils.ts
- **main.ts** — Point d'entrée qui importe service.ts et utils.ts

**Pour tester :**
1. Copier `templates/projet-test-sample/` dans ton vault
2. Ouvrir un fichier TS dans Monaco
3. Cliquer sur ⚙️ (gear) dans le tab header
4. Configurer "Project Root Folder" → `templates/projet-test-sample`
5. Ouvrir `main.ts`
6. Ctrl+Clic sur `MathService` → ouvre `service.ts` à la ligne de la classe
7. Ctrl+Clic sur `add` → ouvre `utils.ts` à la ligne de la fonction

---

## Fichiers modifiés

- `src/types/types.ts` — Ajout `projectRootFolder`
- `src/ui/folderSuggest.ts` — Nouveau composant
- `src/modals/editorSettingsModal.ts` — Champ Project Root Folder
- `src/editor/mountCodeEditor.ts` — `loadProjectFiles` + handlers
- `src/editor/monacoEditor.html` — Configuration TypeScript + opener
- `src/editor/codeEditorView.ts` — Getter public `editor`
- `templates/projet-test-sample/` — Projet de test
