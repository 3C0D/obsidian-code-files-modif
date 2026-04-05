# 🔍 Audit complet — Code Files Plugin

Après lecture des 20 fichiers source, du HTML Monaco, du CSS et de la doc.

---

## 🔴 Bugs confirmés (à corriger maintenant)

### B1 — `codeFilesSettingsTab.ts` : même bug delete `'*'` que le modal

[codeFilesSettingsTab.ts:L152-153](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/ui/codeFilesSettingsTab.ts#L152-L153)

```typescript
if (val === DEFAULT_EDITOR_CONFIG.trim()) {
    delete this.plugin.settings.editorConfigs[selectedExt];
```

Ce code compare **toujours** contre `DEFAULT_EDITOR_CONFIG` (la config globale), même pour les overrides par extension. Si l'utilisateur tape la même chose que le default global dans une config `.json`, elle est supprimée. Et si `selectedExt === '*'`, la clé globale est supprimée — le même bug qu'on a corrigé dans le modal mais qui existe encore ici.

> [!CAUTION]
> Le settings tab n'utilise pas `buildMergedConfig` et a sa propre logique de sauvegarde inline dupliquée. C'est un vecteur de bugs indépendant du fix dans le modal.

### B2 — `commands.ts` L70 : `onFormatterSaved` ne fait pas le merge

[commands.ts:L66-71](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/ui/commands.ts#L66-L71)

```typescript
new EditorSettingsModal(
    plugin,
    view.file.extension,
    () => plugin.broadcastOptions(),
    () => plugin.broadcastEditorConfig(view.file!.extension)
).open();
```

Ici le callback `onFormatterSaved` appelle `broadcastEditorConfig` (qui fait le merge correctement), mais il **ignore** la config reçue en paramètre. Or dans le `onClose` du modal, `onFormatterSaved(mergedConfig)` est appelé avec la config mergée — mais ce callback la jette. Ce n'est pas un bug fonctionnel car le broadcast fait le bon merge, mais c'est une incohérence dans le contrat du callback.

### B3 — `getAllMonacoExtensions` utilise `staticMap` au lieu de `dynamicMap`

[getLanguage.ts:L150-154](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/utils/getLanguage.ts#L150-L154)

```typescript
/** Returns all extensions known to Monaco... */
export function getAllMonacoExtensions(excluded: string[]): string[] {
    const excluded = new Set(excludedExtensions);
    return Object.keys(staticMap).filter(...)
```

Le commentaire dit « all extensions known to Monaco » mais la fonction utilise `staticMap` (~98 entrées) au lieu de `dynamicMap` (~200+ entrées de Monaco). Résultat : en mode `allExtensions`, l'utilisateur obtient moins d'extensions que Monaco ne supporte réellement.

**Suggestion** : utiliser `dynamicMap` quand il est peuplé, avec fallback sur `staticMap`.

### B4 — `initExtensions` fail-all au lieu de fail-per-ext

[extensionUtils.ts:L102-111](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/utils/extensionUtils.ts#L102-L111)

```typescript
export function initExtensions(plugin: CodeFilesPlugin): void {
    const activeExts = getActiveExtensions(plugin.settings);
    try {
        plugin.registerExtensions(activeExts, viewType);
```

`registerExtensions([...], viewType)` d'Obsidian enregistre toutes les extensions en un seul appel. Si **une seule** est déjà prise par un autre plugin, **toutes** échouent. Le `try/catch` attrape l'erreur mais perd toutes les extensions, même celles qui étaient valides.

**Suggestion** : enregistrer une par une dans une boucle (comme `registerExtension` le fait individuellement).

### B5 — `ConfirmModal` callback peut être appelé deux fois

[confirmation.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/modals/confirmation.ts)

Si l'utilisateur appuie sur Enter (scope handler → `confirm(true)` → `close()`) puis le `onClose` de la modal re-call implicitement le flow, ou s'il clique le bouton confirm puis appuie sur Enter, le callback `resolve` est appelé deux fois. Ce n'est pas critique (la Promise ne resolve qu'une fois), mais c'est un code smell.

---

## 🟡 Incohérences logiques / structurelles

### S1 — Duplication massive de la logique d'ouverture de modaux dans `mountCodeEditor.ts`

[mountCodeEditor.ts:L175-242](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts#L175-L242)

`mountCodeEditor` est une **factory** pour créer des iframes Monaco. Elle ne devrait pas connaître `EditorSettingsModal`, `ChooseThemeModal` ni `RenameExtensionModal`. Ces handlers de message (`open-formatter-config`, `open-theme-picker`, `open-rename-extension`) devraient être délégués au **caller** (par ex. `codeEditorView.ts`) via un callback ou un event emitter.

L'impact : `mountCodeEditor` importe 3 modaux inutilement, et le même code de wrapping `onClose` + `iframe.focus()` est répété 3 fois.

### S2 — `codeEditorView.ts` et `mountCodeEditor.ts` dupliquent les handlers de modal

[codeEditorView.ts:L112-143](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts#L112-L143) vs [mountCodeEditor.ts:L175-242](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts#L175-L242)

Les icônes dans le header (`injectGearIcon`, `themeAction`, `renameAction`) ET les handlers postMessage dans `mountCodeEditor` font la même chose : ouvrir des modaux. Deux points d'entrée pour la même action.

### S3 — Pas de `onunload` dans le plugin

[main.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/main.ts)

`CodeFilesPlugin` n'a pas de méthode `onunload()`. Obsidian appelle `onunload` quand le plugin est désactivé. Sans ce cleanup :
- `ribbonIconEl` reste dans le DOM (mineur — Obsidian le nettoie probablement)
- Les extensions enregistrées ne sont pas explicitement dé-enregistrées

> [!NOTE]
> Obsidian nettoie automatiquement `registerView` et `registerExtensions` via le système de Plugin. Mais un `onunload` explicite serait plus propre.

### S4 — `CodeEditorView.openFile` contourne l'API Obsidian

[codeEditorView.ts:L218-234](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts#L218-L234)

```typescript
static openFile(file: TFile, plugin: CodeFilesPlugin): void {
    // ...
    } else {
        // Extension not registered — bypass Obsidian's file registry
        const view = new CodeEditorView(leaf, plugin);
        view.file = file;
        leaf.open(view);
        view.load();
        void view.onLoadFile(file);
    }
```

L'alternative (`else`) crée manuellement un `CodeEditorView` et appelle `onLoadFile` directement. C'est fragile : `view.file = file` assigne un `TFile` à une propriété qui devrait être gérée par Obsidian, et `view.load()` suivi de `onLoadFile` n'est pas le flux normal d'Obsidian. Si l'API interne change, ça casse silencieusement.

### S5 — `chooseCssFileModal.ts` : construction manuelle de `TFile`

[chooseCssFileModal.ts:L41-42](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/modals/chooseCssFileModal.ts#L41-L42)

```typescript
// @ts-expect-error - TFile is designed for vault files
CodeEditorView.openFile(new TFile(this.plugin.app.vault, path), this.plugin);
```

Construire un `TFile` manuellement est non-standard et fragile. Le constructeur de `TFile` est interne à Obsidian et pourrait changer.

### S6 — `editorSettingsModal.ts` : le scope switch global/ext ne rebind pas `this.extension`

Quand l'utilisateur est sur l'onglet global (`*`) et ferme le modal, `onClose` fait :

```typescript
this.onFormatterSaved(
    buildMergedConfig(this.plugin, this.extension)
);
```

`this.extension` est toujours l'extension du fichier (ex: `ts`), pas `'*'`. C'est correct (on veut le merge pour l'extension active), mais c'est subtil et mériterait un commentaire.

---

## 🟢 Améliorations de qualité de code

### Q1 — Commentaires à ajouter/améliorer

| Fichier | Ce qui manque |
|---------|--------------|
| [extensionUtils.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/utils/extensionUtils.ts) | `getActiveExtensions`, `addExtension`, `removeExtension` — aucun JSDoc. La logique `allExtensions` vs manuelle est non-évidente |
| [contextMenus.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/ui/contextMenus.ts) | `getItems()` n'a aucune doc. Pourquoi séparer l'explorateur du tab header ? |
| [main.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/main.ts) | Les méthodes one-liner n'ont pas de doc. Un commentaire global « Facade pattern — delegates to utils » serait utile |
| [mountCodeEditor.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts) | `resolveThemeParams` est correct mais `safeThemeId` vs `resolvedTheme` est confus — pourquoi deux variables ? |
| [fenceEditContext.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/utils/fenceEditContext.ts) | La JSDoc de classe est un pavé. La décomposer en doc par méthode |

### Q2 — Commentaires inutiles (style « la fonction save ça save »)

- [codeEditorView.ts:L184](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts#L184) : `/** Clears the Monaco editor content. */` sur `clear()` → trivial
- [codeEditorView.ts:L199](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts#L199) : `/** Returns the current Monaco editor content... */` sur `getViewData()` → trivial
- Les commentaires qui paraphrasent le code sans expliquer le « pourquoi » sont du bruit

### Q3 — Nommage incohérent

| Actuel | Suggestion | Raison |
|--------|-----------|--------|
| `editorConfigs` (settings) | OK | Cohérent avec `editorConfig` côté Monaco |
| `formatterConfig` (initParams) | `editorConfig` | C'est la même chose que les `editorConfigs` du côté parent, le nom « formatter » est trompeur — ça contient aussi `folding`, `minimap`, etc. |
| `onFormatterSaved` | `onConfigApplied` | Ce callback ne sauvegarde rien, il applique la config à l'iframe |
| `broadcastEditorConfig` | OK | Clair |
| `change-editor-config` (message) | OK | Cohérent |
| `formatterConfigs` (docs) vs `editorConfigs` (code) | Aligner la doc | [settings-refactor.md](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/docs/settings-refactor.md) utilise encore `formatterConfigs` |

### Q4 — Import `TFile` non utilisé dans `mountCodeEditor.ts`

[mountCodeEditor.ts:L1](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts#L1)

```typescript
import type { TFile } from 'obsidian';
```

`TFile` est importé mais n'est utilisé que dans le cast `file as TFile` à la ligne 232. C'est dans le handler `open-rename-extension` qui devrait être dans `codeEditorView.ts` (voir S1).

### Q5 — Classes CSS orphelines dans `styles.css`

Les classes `.code-files-formatter-section`, `.code-files-formatter-title`, `.code-files-formatter-editor`, `.code-files-settings-footer` sont définies dans le CSS mais je ne les ai pas vues utilisées dans le code. Le modal utilise des classes comme `code-files-editor-config-section` à la place. Vérifier si ces règles CSS sont mortes.

---

## 📋 Plan d'action par priorité

### 🔴 Critique (faire maintenant)

| # | Tâche | Fichier(s) |
|---|-------|-----------|
| B1 | Fix le `delete '*'` dans settings tab + utiliser `buildMergedConfig` | `codeFilesSettingsTab.ts` |
| B4 | `initExtensions` : boucler une extension à la fois | `extensionUtils.ts` |

### 🟡 Important (faire bientôt)

| # | Tâche | Fichier(s) |
|---|-------|-----------|
| B3 | `getAllMonacoExtensions` : utiliser `dynamicMap` quand disponible | `getLanguage.ts` |
| Q3 | Renommer `formatterConfig` → `editorConfig` dans initParams et HTML | `mountCodeEditor.ts`, `monacoEditor.html` |
| Q5 | Supprimer les classes CSS orphelines | `styles.css` |

### 🟢 Refactoring (délégable)

| # | Tâche | Fichier(s) |
|---|-------|-----------|
| S1 | Extraire les handlers de modal de `mountCodeEditor` vers le caller | `mountCodeEditor.ts`, `codeEditorView.ts` |
| Q1 | Ajouter les JSDoc manquants | Multiples |
| Q2 | Supprimer les commentaires triviaux | `codeEditorView.ts`, `fenceEditContext.ts` |
| S3 | Ajouter `onunload()` explicite | `main.ts` |

---

## 📝 Tâches déléguables à un LLM moins puissant

Les tâches suivantes sont mécaniques et sans risque, idéales pour un modèle plus léger :

1. **Q1 — JSDoc** : Ajouter des commentaires JSDoc aux fonctions sans doc dans `extensionUtils.ts`, `contextMenus.ts`, `main.ts`. Règle : expliquer le « pourquoi », pas le « quoi ».
2. **Q2 — Nettoyage commentaires** : Supprimer les JSDoc triviaux (qui paraphrasent le nom), raccourcir les pavés.
3. **Q5 — CSS mort** : Vérifier chaque classe dans `styles.css` contre le code source et supprimer les orphelines.
4. **Doc** : Mettre à jour `settings-refactor.md` pour utiliser `editorConfigs` au lieu de `formatterConfigs`.
5. **Nommage** : Renommer `onFormatterSaved` → `onConfigApplied` dans `editorSettingsModal.ts` et ses callers.
