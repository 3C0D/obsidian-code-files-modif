# Ajouter une commande Monaco — Guide et pièges

## Les deux surfaces d'exposition

Monaco propose deux mécanismes pour exposer une action utilisateur :

### `editor.addCommand(keybinding, handler)`
Enregistre uniquement un raccourci clavier. L'action **n'apparaît pas** dans le menu contextuel ni dans la palette de commandes Monaco (F1). À utiliser uniquement pour des raccourcis sans UI visible.

### `editor.addAction(descriptor)`
Enregistre une action complète. Avec `contextMenuGroupId` renseigné, elle apparaît **à la fois** dans le menu contextuel et dans la palette F1. C'est la méthode à privilégier.

```javascript
editor.addAction({
  id: 'code-files-mon-action',        // identifiant unique
  label: 'Mon Action',                 // texte affiché
  contextMenuGroupId: 'navigation',    // groupe dans le menu contextuel
  contextMenuOrder: 1.9,               // ordre dans le groupe
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyX], // optionnel
  run: function() {
    window.parent.postMessage({ type: 'mon-action', context: context }, '*');
  }
});
```

---

## Flux complet d'une commande contextuelle

Le flux pour une commande qui ouvre un modal Obsidian depuis Monaco :

```
Monaco (iframe)
  └─ addAction.run() → postMessage { type: 'mon-action', context }
       ↓
mountCodeEditor.ts (window.addEventListener 'message')
  └─ case 'mon-action': → ouvre le modal Obsidian
```

### 1. Dans `monacoEditor.html`

```javascript
editor.addAction({
  id: 'code-files-mon-action',
  label: 'Mon Action',
  contextMenuGroupId: 'navigation',
  contextMenuOrder: 1.9,
  run: function() {
    window.parent.postMessage({ type: 'mon-action', context: context }, '*');
  }
});
```

### 2. Dans `mountCodeEditor.ts`

```typescript
case 'mon-action': {
  if (data.context === codeContext) {
    (document.activeElement as HTMLElement)?.blur(); // obligatoire — voir ci-dessous
    const modal = new MonModal(plugin, ...);
    const origOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      origOnClose();
      iframe.focus(); // rend le focus à Monaco après fermeture
    };
    modal.open();
  }
  break;
}
```

---

## Piège 1 — `n.instanceOf is not a function` à la fermeture du modal

**Cause :** Obsidian sauvegarde `document.activeElement` à l'ouverture d'un modal pour restaurer le focus à la fermeture. Quand le modal est ouvert depuis l'iframe Monaco, l'élément actif est un élément interne de l'iframe qui n'hérite pas du patch `instanceOf` qu'Obsidian injecte sur `Node.prototype`. Le code minifié crashe à la fermeture.

**Solution obligatoire :** appeler `(document.activeElement as HTMLElement)?.blur()` juste avant `modal.open()`. Le focus retombe sur le `body` d'Obsidian qui possède `instanceOf`.

**Restauration du focus :** monkey-patcher `modal.onClose` pour rappeler `iframe.focus()` après fermeture, sinon l'utilisateur perd le focus sur l'éditeur.

---

## Piège 2 — La commande ne s'exécute qu'une seule fois

**Symptôme :** la première exécution fonctionne, les suivantes sont ignorées silencieusement.

**Cause :** le `codeContext` de l'iframe ne correspond plus au fichier actuel. Cela arrive typiquement après un rename d'extension — l'iframe garde l'ancien `codeContext` (ex. `script.py`) alors que le fichier s'appelle maintenant `script.js`. Le filtre `if (data.context === codeContext)` dans `mountCodeEditor.ts` rejette tous les messages suivants.

**Solution :** implémenter `onRename(file: TFile)` dans `CodeEditorView` pour détruire l'ancienne iframe et en monter une nouvelle avec le bon `codeContext` :

```typescript
async onRename(file: TFile): Promise<void> {
  super.onRename(file);
  this.codeEditor?.destroy();
  this.contentEl.empty();
  this.codeEditor = await mountCodeEditor(
    this.plugin,
    getLanguage(file.extension),
    this.data,
    this.getContext(file),
    () => this.requestSave(),
    () => this.save()
  );
  this.contentEl.append(this.codeEditor.iframe);
}
```

---

## Piège 3 — Mettre à jour la config à chaud

Les paramètres envoyés via `initParams` à l'init ne sont pas automatiquement mis à jour si les settings changent. Il faut envoyer un message dédié depuis `mountCodeEditor.ts` et le gérer dans `monacoEditor.html`.

Exemple avec `change-formatter-config` :

**Dans `mountCodeEditor.ts`** — après sauvegarde de la config :
```typescript
send('change-formatter-config', { config: newConfigJson });
```

**Dans `monacoEditor.html`** — dans le `switch` des messages :
```javascript
case 'change-formatter-config':
  if (editor) {
    var cfg = JSON.parse(data.config);
    editor.getModel().updateOptions({ tabSize: cfg.tabSize, insertSpaces: cfg.insertSpaces });
    editor.updateOptions({ formatOnType: !!cfg.formatOnType });
    formatOnSave = !!cfg.formatOnSave;
  }
  break;
```

Le même pattern s'applique pour `change-theme`, `change-language`, etc.
