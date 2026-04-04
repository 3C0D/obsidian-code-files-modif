# Ajouter une feature — Guide pratique

## 1. Nouveau toggle dans les settings

### a. Déclarer le champ

`types.ts` — ajouter dans `MyPluginSettings` :
```typescript
/** Description courte */
myOption: boolean;
```

Ajouter la valeur par défaut dans `DEFAULT_SETTINGS` :
```typescript
myOption: true,
```

### b. Exposer dans la roue crantée

`editorSettingsModal.ts` — dans `onOpen()`, après les toggles existants :
```typescript
new Setting(toggleSection)
    .setName('My Option')
    .setDesc('Description.')
    .addToggle((t) =>
        t.setValue(this.plugin.settings.myOption).onChange(async (v) => {
            this.plugin.settings.myOption = v;
            await this.plugin.saveSettings();
            this.onSettingsChanged(); // déclenche broadcastOptions() côté appelant
        })
    );
```

### c. Envoyer à Monaco si applicable

Si l'option affecte l'éditeur Monaco, l'inclure dans `broadcastOptions()` (`main.ts`) :
```typescript
view.codeEditor?.send('change-options', {
    // ... existants
    myOption: this.settings.myOption,
});
```

Et dans `initParams` (`mountCodeEditor.ts`) :
```typescript
myOption: plugin.settings.myOption,
```

Et gérer côté `monacoEditor.html` dans `applyParams` ou le `switch` des messages.

---

## 2. Nouvelle commande Monaco (menu contextuel + F1)

### a. Déclarer l'action dans `monacoEditor.html`

Dans `applyParams`, après les actions existantes :
```javascript
editor.addAction({
    id: 'code-files-mon-action',
    label: '🔖 Mon Action',
    contextMenuGroupId: 'code-files',   // groupe dans le menu contextuel
    contextMenuOrder: 4,                 // ordre dans le groupe
    run: function () {
        window.parent.postMessage(
            { type: 'open-mon-action', context: context },
            '*'
        );
    }
});
```

> Pour un raccourci clavier uniquement (sans entrée dans le menu) : `editor.addCommand(keybinding, handler)`.

### b. Gérer le message dans `mountCodeEditor.ts`

Dans le `switch` de `onMessage` :
```typescript
case 'open-mon-action': {
    if (data.context === codeContext) {
        (document.activeElement as HTMLElement)?.blur(); // OBLIGATOIRE — voir ci-dessous
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

### c. Pourquoi le `blur()` est obligatoire

Monaco tourne dans une iframe isolée. Son DOM ne possède pas le patch `instanceOf` qu'Obsidian injecte sur `Node.prototype`. Quand Obsidian ouvre un modal, il sauvegarde `document.activeElement` pour le restaurer à la fermeture — si cet élément appartient à l'iframe, la restauration crashe avec :

```
Uncaught TypeError: n.instanceOf is not a function
```

Le `blur()` force le focus sur le `body` d'Obsidian avant l'ouverture du modal. Le `iframe.focus()` dans `onClose` le rend ensuite à Monaco.

Cette règle s'applique **sans exception** à toutes les ouvertures de modal ou de fenêtre Obsidian déclenchées depuis Monaco.

---

## 3. Nouveau message postMessage (parent → iframe)

### a. Envoyer depuis le parent

```typescript
// via send() retourné par mountCodeEditor
codeEditor.send('mon-message', { maValeur: 42 });

// ou depuis CodeEditorView
this.codeEditor?.send('mon-message', { maValeur: 42 });
```

### b. Gérer dans `monacoEditor.html`

Dans le `switch` du `window.addEventListener('message', ...)` :
```javascript
case 'mon-message':
    if (editor) {
        // utiliser data.maValeur
    }
    break;
```

---

## 4. Nouvelle surface d'UI (modal, SuggestModal)

Pas de spécificité liée au plugin — suivre les patterns Obsidian standard. Regarder `ChooseThemeModal` pour un `SuggestModal` avec preview, `RenameExtensionModal` pour un modal simple avec input + bouton.

Si le modal est ouvert depuis Monaco (via postMessage), appliquer le pattern `blur()` + `iframe.focus()` décrit en section 2.

---

## Checklist récapitulative

**Nouveau toggle setting :**
- [ ] Champ dans `MyPluginSettings` + `DEFAULT_SETTINGS`
- [ ] Toggle dans `EditorSettingsModal` (roue crantée)
- [ ] Optionnel : dans `CodeFilesSettingsTab` si pertinent globalement
- [ ] Si applicable à Monaco : dans `initParams` + `broadcastOptions()` + gérer dans `monacoEditor.html`

**Nouvelle commande Monaco :**
- [ ] `editor.addAction()` dans `monacoEditor.html` (dans `applyParams`)
- [ ] `case` dans le `switch` de `onMessage` dans `mountCodeEditor.ts`
- [ ] `blur()` avant tout `modal.open()`
- [ ] `iframe.focus()` dans le monkey-patch `onClose`

**Nouveau message parent → iframe :**
- [ ] `send('type', payload)` côté parent
- [ ] `case 'type':` dans le `switch` de `monacoEditor.html`
