# Réflexion — Centralisation des settings du plugin Code Files

## Contexte

Ce document décrit l'état actuel des settings du plugin et le plan de refonte validé.

---

## Structure actuelle de `data.json`

Tout est à plat dans un seul objet — **on garde cette structure** (pas de migration).

```json
{
  "extensions": ["ts", "tsx", "js", "jsx", "py"],

  "theme": "default",
  "overwriteBg": true,
  "recentThemes": ["Dracula", "Nord"],

  "showRibbonIcon": true,

  "folding": true,
  "lineNumbers": true,
  "minimap": true,
  "semanticValidation": true,
  "syntaxValidation": true,

  "autoSave": true,
  "wordWrap": "off",

  "formatterConfigs": {
    "ts": "{\n  \"tabSize\": 4,\n  \"insertSpaces\": true,\n  \"formatOnSave\": false,\n  \"formatOnType\": false\n}"
  }
}
```

**À ajouter :** `autoSave` (boolean) et `wordWrap` ("on" | "off").

---

## Répartition validée des surfaces d'interface

| Où | Quoi |
|---|---|
| Settings tab Obsidian | Extensions, Ribbon, Thème par défaut, OverwriteBg |
| Roue crantée (modal unifié) | AutoSave, WordWrap, Folding, LineNumbers, Minimap, SemanticValidation, SyntaxValidation + Formatter Config de l'extension active |
| Menu contextuel Monaco | Formatter Config (à supprimer après migration), Rename Extension |
| F1 / palette Monaco | Tout en doublon + Save |

---

## Le modal roue crantée — structure validée

Un seul modal avec deux sections :

**Section haute — toggles UI** (settings globaux) :
- AutoSave — toggle
- WordWrap — toggle
- Folding — toggle
- Line Numbers — toggle
- Minimap — toggle
- Semantic Validation — toggle
- Syntax Validation — toggle

**Section basse — éditeur JSON Monaco** (formatter config, contextuel à l'extension du fichier actif) :
- Titre : `Formatter — .ts` (extension du fichier courant)
- Même éditeur Monaco embarqué que l'actuel `FormatterConfigModal`
- Sauvegarde dans `formatterConfigs[ext]`
- Envoie `change-formatter-config` à l'iframe à chaud

Le modal `FormatterConfigModal` existant peut être supprimé une fois la migration faite, et l'entrée "Formatter Config" retirée du menu contextuel Monaco.

---

## AutoSave — comportement

Obsidian sauvegarde via `requestSave()` — debounce ~2s déclenché à chaque frappe. Si `autoSave: false` :
- `save()` est bloqué via override dans `CodeEditorView` : si `dirty` est false, la sauvegarde est ignorée
- Seul `Ctrl+S` met `dirty` à true et déclenche la sauvegarde
- Un indicateur visuel apparaît dès l'ouverture du fichier : un petit cercle après le badge d'extension. Cercle vide = rien à sauver, cercle plein blanc = modifications non sauvegardées. Disparaît si autoSave est réactivé.

## WordWrap — comportement

`Alt+Z` et le toggle dans la roue crantée mettent à jour le setting persisté (pas juste pour la session). L'iframe reçoit `change-formatter-config` ou un message dédié `change-word-wrap` pour appliquer à chaud.

---

## Roue crantée — implémentation

Inspirée de `leaf-icon-manager.ts` du plugin `Obsidian-Vault-Name-in-Status-Bar` :
- Injection dans `(leaf.view as FileView).actionsEl` via `actionsEl.prepend(iconEl)`
- Uniquement sur les vues `code-editor` (pas les notes Markdown)
- `setIcon(iconEl, 'settings')` pour l'icône roue crantée
- Nettoyage dans `onUnloadFile` / `onClose`
