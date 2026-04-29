Voici les grands chemins logiques de `CodeEditorView` :

---

**1. Ouverture d'un fichier**
`onLoadFile` → `mountAndRender` → `mountEditor` (crée l'iframe Monaco + enregistre `unregisterThemeHandler`) + `updateExtBadge` (badge `.ext` dans le header) + `injectHeaderActions` (icônes gear, palette, etc.)

---

**2. Modification du contenu**
L'iframe Monaco envoie un signal → `onContentChange` → compare `getValue()` vs `this.data` → si différent : `setDirty(true)` + `requestSave()` (debounced, ne passe que si autoSave=true) → sinon : `setDirty(false)`

---

**3. Sauvegarde manuelle (Ctrl+S)**
Iframe → `onCtrlS` → `forceSave=true` + `setSaving(true)` → `save()` (le flag bypasse le check autoSave) → `setDirty(false)` + `setSaving(false)`

---

**4. Formatage**
Iframe → `onFormat` → `showDiffAction` (affiche le bouton diff dans le header, timer pour le cacher) / si tout est revert : `onAllBlocksReverted` → `hideDiffAction` + `setDirty(false)` + save forcé

---

**5. Renommage du fichier**
`onRename` → `cleanup` (détruit Monaco + headers) → `contentEl.empty()` → `mountAndRender` (repart comme une ouverture fraîche)

---

**6. Fermeture**
`onUnloadFile` → gère la logique de révélation temporaire des dotfiles → `cleanup` / `onClose` → `cleanup`

`cleanup` fait toujours : `codeEditor.destroy` + `removeHeaderActions` + `unregisterThemeHandler`

---

**7. Changement de settings depuis l'extérieur**
`EditorSettingsModal` → toggle autoSave → appelle `view.save()` + `view.updateDirtyBadgeVisibility()` directement sur la vue (duck typing)

---

Le fil conducteur : `mountAndRender` est le point d'entrée de tout état "vivant", `cleanup` est son inverse strict. Entre les deux, tout passe par des callbacks injectés dans `mountCodeEditor` qui remontent les événements iframe vers les méthodes `on*` de la classe.

---

Exactement. Le cycle complet :

```
this.diffAction          → buildContext()  → context.diffAction
                                                    ↓
                                            showDiffAction() modifie context.diffAction
                                                    ↓
context.diffAction       → read back      → this.diffAction
```

`this.diffAction` n'est jamais utilisé directement pour appeler `.remove()` ou quoi que ce soit dans la classe. Son seul rôle c'est d'être injecté dans le prochain `buildContext()`, pour que la standalone ait la valeur à jour. C'est un aller-retour permanent entre la classe et les helpers via le context.

---

`setViewData` est un override d'une méthode abstraite de `TextFileView`. Obsidian l'appelle automatiquement dans deux situations :

**1. Chargement initial** : quand Obsidian lit le fichier sur disque, il appelle `setViewData(contenuDuFichier, true)`. À ce moment `codeEditor` n'existe pas encore (il est créé dans `onLoadFile` juste après), donc le `if (this.codeEditor)` est faux et on se contente de stocker dans `this.data`.

**2. Modification externe** : si le fichier est modifié sur disque pendant que la vue est ouverte (ex. un autre éditeur), Obsidian relit le fichier et rappelle `setViewData` avec le nouveau contenu. Là `codeEditor` existe. La comparaison :

```ts
if (this.codeEditor.getValue() !== data)
```

protège l'historique undo/redo de Monaco. Sans elle, chaque appel à `setViewData` effacerait l'historique même si le contenu n'a pas changé, ce qui rendrait Ctrl+Z inutilisable.

Donc `this.data` est le cache Obsidian du contenu disque, et `codeEditor.setValue()` est la synchronisation vers l'iframe Monaco.

---

`openState` ici est le **ephemeral state** (`eState`), le deuxième paramètre de `setViewState`.

Il sert à passer des données transitoires de navigation qui ne sont **pas persistées** dans le layout, contrairement au `state` principal. Typiquement :

```ts
interface OpenViewState {
    cursor?: EditorPosition   // position du curseur à l'ouverture
    scroll?: number           // position de scroll
    line?: number             // ligne cible
    match?: SearchMatchPart[] // correspondance à surligner (résultats de recherche)
    active?: boolean
    ...
}
```

Le flux complet :

```
workspace.openFile(file, openState)
  → setViewState({ type, state: { file: path }, active }, openState)
    → view.setState(state, result)   // result contient l'eState
      → editor.setCursor(...) / scrollTo(...)
```

Concrètement : quand tu ouvres un fichier depuis les résultats de recherche et qu'Obsidian saute directement à la ligne correspondante, c'est `openState` qui transporte cette info jusqu'au `setState` de la vue. Sans lui, le fichier s'ouvre mais le curseur reste en position par défaut.

---

`getState` et `setState` c'est le système de persistance du workspace Obsidian.

**Cycle de vie :**

```
Obsidian ferme / reload
  → getState()   appelé sur chaque vue ouverte
  → sérialise dans layout.json

Obsidian rouvre
  → setState()   appelé pour restaurer chaque vue
  → recharge le fichier depuis l'état sauvegardé
```

**Ce que contient `state` par défaut (via `super.getState()`) :**

```js
{ file: "path/to/file.md" }
```

C'est ce `file` que `setState` utilise pour retrouver le fichier dans le vault.

**Pourquoi tu ajoutes `state.reveal = true` :**

Pour les dotfiles et fichiers `.obsidian/`, Obsidian ne les trouve pas dans son index au redémarrage. Sans `reveal`, `setState` appelle `super.setState` qui cherche le fichier dans le vault, le trouve pas, et la vue reste vide. Avec `state.reveal = true`, ton `setState` les révèle d'abord avant de passer la main à `super.setState`.

---

