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
Iframe → `onFormat` → `showDiffAction` (affiche le bouton diff dans le header, timer pour le cacher) / si tout est revert : `onFormatReverted` → `hideDiffAction` + `setDirty(false)` + save forcé

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
