# Tâches de refactoring structurel — Code Files Plugin

Projet : `c:\Users\dd200\Documents\Mes_projets\Mes repo obsidian new\obsidian-code-files-modif`

> **Important** : après chaque fichier modifié, vérifier avec :
> - `npx tsc --noEmit 2>&1 | Select-String "^src/"` → doit retourner vide
> - `npx eslint src/` → doit retourner exit 0
> - `npm run build` → doit réussir

---

## Tâche 1 (S1) — Extraire les handlers de modaux de `mountCodeEditor`

### Contexte

`src/editor/mountCodeEditor.ts` est une factory qui crée une iframe Monaco et retourne un objet
de contrôle (`CodeEditorInstance`). Elle connaît actuellement 3 modaux qu'elle n'a pas à
connaître : `EditorSettingsModal`, `ChooseThemeModal`, `RenameExtensionModal`.

Ces modaux sont ouverts en réponse à des messages postMessage venant de l'iframe
(`open-formatter-config`, `open-theme-picker`, `open-rename-extension`). La factory gère
tout cela en interne, ce qui viole la séparation des responsabilités.

**Solution** : ajouter des callbacks optionnels à la signature de `mountCodeEditor`, que le
caller (`codeEditorView.ts`) va fournir. La factory se contente de les appeler ; le caller
reste responsable d'ouvrir les modaux.

### Étapes précises

#### 1. Modifier la signature de `mountCodeEditor` dans `src/editor/mountCodeEditor.ts`

Signature actuelle (lignes 53-60) :
```typescript
export const mountCodeEditor = async (
    plugin: CodeFilesPlugin,
    language: string,
    initialValue: string,
    codeContext: string,
    onChange?: () => void,
    onSave?: () => void
): Promise<CodeEditorInstance> => {
```

Nouvelle signature — ajouter 3 callbacks optionnels **après** `onSave` :
```typescript
export const mountCodeEditor = async (
    plugin: CodeFilesPlugin,
    language: string,
    initialValue: string,
    codeContext: string,
    onChange?: () => void,
    onSave?: () => void,
    onOpenEditorConfig?: (
        ext: string,
        send: (type: string, payload: Record<string, unknown>) => void,
        iframe: HTMLIFrameElement
    ) => void,
    onOpenThemePicker?: (
        send: (type: string, payload: Record<string, unknown>) => void,
        iframe: HTMLIFrameElement
    ) => void,
    onOpenRenameExtension?: (
        iframe: HTMLIFrameElement
    ) => void,
): Promise<CodeEditorInstance> => {
```

#### 2. Remplacer les 3 cases dans le switch de `onMessage`

Cas actuel `open-formatter-config` (lignes 175-195) :
```typescript
case 'open-formatter-config': {
    if (data.context === codeContext) {
        (document.activeElement as HTMLElement)?.blur();
        const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? '';
        const modal = new EditorSettingsModal(
            plugin,
            ext,
            () => plugin.broadcastOptions(),
            (config) => {
                send('change-editor-config', { config });
            }
        );
        const origOnClose = modal.onClose.bind(modal);
        modal.onClose = () => {
            origOnClose();
            iframe.focus();
        };
        modal.open();
    }
    break;
}
```

Remplacer par :
```typescript
case 'open-formatter-config': {
    if (data.context === codeContext) {
        (document.activeElement as HTMLElement)?.blur();
        const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? '';
        onOpenEditorConfig?.(ext, send, iframe);
    }
    break;
}
```

Cas actuel `open-theme-picker` (lignes 196-212) — remplacer par :
```typescript
case 'open-theme-picker': {
    if (data.context === codeContext) {
        (document.activeElement as HTMLElement)?.blur();
        onOpenThemePicker?.(send, iframe);
    }
    break;
}
```

Cas actuel `open-rename-extension` (lignes 227-242) — remplacer par :
```typescript
case 'open-rename-extension': {
    if (data.context === codeContext) {
        (document.activeElement as HTMLElement)?.blur();
        onOpenRenameExtension?.(iframe);
    }
    break;
}
```

#### 3. Supprimer les imports devenus inutiles dans `mountCodeEditor.ts`

Supprimer ces 3 lignes d'import (lignes 7-9) :
```typescript
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
```

Garder uniquement :
```typescript
import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import type { CodeEditorInstance } from '../types.ts';
import manifest from '../../manifest.json' with { type: 'json' };
import { registerAndPersistLanguages } from '../utils/getLanguage.ts';
import { buildMergedConfig } from '../utils/settingsUtils.ts';
```

#### 4. Mettre à jour l'appel dans `src/editor/codeEditorView.ts`

Chercher l'appel `await mountCodeEditor(` dans `codeEditorView.ts` (méthode `onLoadFile`).
Ajouter les 3 callbacks à la fin de l'appel :

```typescript
this.codeEditor = await mountCodeEditor(
    this.plugin,
    getLanguage(file.extension),
    data,
    file.path,
    () => this.requestSave(),
    () => this.forcedSave(),
    // onOpenEditorConfig — open EditorSettingsModal
    // and restore iframe focus on close
    (ext, send, iframe) => {
        const modal = new EditorSettingsModal(
            this.plugin,
            ext,
            () => this.plugin.broadcastOptions(),
            (config) => send('change-editor-config', { config })
        );
        const orig = modal.onClose.bind(modal);
        modal.onClose = () => { orig(); iframe.focus(); };
        modal.open();
    },
    // onOpenThemePicker — apply theme live, restore on cancel
    async (send, iframe) => {
        const applyTheme = async (t: string): Promise<void> => {
            const params = await resolveThemeParams(this.plugin, t);
            send('change-theme', params);
        };
        const modal = new ChooseThemeModal(
            this.plugin, applyTheme, applyTheme
        );
        const orig = modal.onClose.bind(modal);
        modal.onClose = () => { orig(); iframe.focus(); };
        modal.open();
    },
    // onOpenRenameExtension
    (iframe) => {
        const f = this.plugin.app.vault
            .getAbstractFileByPath(file.path);
        if (f && 'extension' in f) {
            const modal = new RenameExtensionModal(
                this.plugin, f as TFile
            );
            const orig = modal.onClose.bind(modal);
            modal.onClose = () => { orig(); iframe.focus(); };
            modal.open();
        }
    }
);
```

Ajouter les imports manquants en tête de `codeEditorView.ts` si pas déjà présents :
```typescript
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { resolveThemeParams } from './mountCodeEditor.ts';
```

#### 5. Mettre à jour l'import dans `src/modals/fenceEditModal.ts`

`fenceEditModal.ts` appelle aussi `mountCodeEditor` directement. Il passe déjà ses propres
callbacks pour `open-formatter-config` et `open-theme-picker` en ligne, dans le corps de
`onOpen`. Ces callbacks sont déjà corrects — il suffit de les passer en 7e/8e argument de
`mountCodeEditor` au lieu d'être dans le message handler interne.

Chercher dans `fenceEditModal.ts` l'appel :
```typescript
this.codeEditor = await mountCodeEditor(
    this.plugin,
    this.language,
    this.code,
    `modal-editor.${this.langKey}`
);
```

Remplacer par (en reprenant les callbacks déjà définis dans `onOpen`) :
```typescript
this.codeEditor = await mountCodeEditor(
    this.plugin,
    this.language,
    this.code,
    `modal-editor.${this.langKey}`,
    undefined,
    undefined,
    // onOpenEditorConfig — same as gear button above
    (ext, send, iframe) => {
        const modal = new EditorSettingsModal(
            this.plugin,
            ext,
            () => this.plugin.broadcastOptions(),
            (config) => send('change-editor-config', { config })
        );
        const orig = modal.onClose.bind(modal);
        modal.onClose = () => { orig(); iframe.focus(); };
        modal.open();
    },
    // onOpenThemePicker — same as palette button above
    async (send, iframe) => {
        const applyTheme = async (t: string): Promise<void> => {
            const params = await resolveThemeParams(this.plugin, t);
            send('change-theme', params);
        };
        const modal = new ChooseThemeModal(
            this.plugin, applyTheme, applyTheme
        );
        const orig = modal.onClose.bind(modal);
        modal.onClose = () => { orig(); iframe.focus(); };
        modal.open();
    }
    // onOpenRenameExtension: undefined (fences don't have a file path)
);
```

Une fois cela fait, les boutons `gearEl` et `paletteEl` dans `fenceEditModal.onOpen` font
doublon — ils peuvent rester pour l'UX dans le titre du modal, mais le handler postMessage
n'est plus nécessaire.

---

## Tâche 2 (S4 + S5) — Éliminer la construction manuelle de TFile

### Contexte

`TFile` est une classe interne de l'API Obsidian conçue pour représenter des fichiers
indexés dans le vault. Son constructeur (`new TFile(vault, path)`) est non-documenté et
fragile.

Deux endroits l'utilisent de façon non-standard :

1. **`src/editor/codeEditorView.ts`** — branche `else` de `openFile` (lignes 236-240) :
   crée manuellement une vue pour les fichiers hors vault.
2. **`src/modals/chooseCssFileModal.ts`** — ligne 42 : construit un `TFile` factice pour
   les snippets CSS dans `.obsidian/snippets/`.

### Solution S4 — `codeEditorView.ts`

Le problème : pour les fichiers hors vault (CSS snippets), `leaf.openFile(file)` ne
fonctionne pas car Obsidian ne connaît pas ce fichier.

La solution correcte est de faire lire le contenu directement via l'adapter, et de monter
la vue avec une approche différente. Cependant, **la branche `else` actuelle fonctionne**
en pratique — la vraie fragilité est que `leaf.open(view)` + `view.load()` +
`view.onLoadFile(file)` n'est pas le flux officiel d'Obsidian.

**Refactoring recommandé** : transformer `openFile` en deux méthodes distinctes :

Dans `codeEditorView.ts`, remplacer la méthode statique `openFile` par :

```typescript
/**
 * Opens a vault file in a new tab using Obsidian's
 * standard leaf.openFile() API.
 */
static async openVaultFile(
    file: TFile,
    plugin: CodeFilesPlugin
): Promise<void> {
    const leaf = plugin.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    plugin.app.workspace.revealLeaf(leaf);
}

/**
 * Opens a file that is outside the vault (e.g. CSS
 * snippets in .obsidian/snippets/) by reading it
 * directly via the adapter and mounting a view manually.
 *
 * This bypasses Obsidian's file registry intentionally —
 * vault.create() cannot index files outside the vault
 * root, but adapter.read() can access them.
 */
static openExternalFile(
    file: TFile,
    plugin: CodeFilesPlugin
): void {
    const leaf = plugin.app.workspace.getLeaf(true);
    // Manual mount — required for non-vault paths.
    // leaf.open() sets the active view on the leaf;
    // view.load() initialises the view's DOM;
    // onLoadFile() triggers the Monaco editor setup.
    const view = new CodeEditorView(leaf, plugin);
    view.file = file;
    leaf.open(view);
    view.load();
    void view.onLoadFile(file);
    plugin.app.workspace.revealLeaf(leaf);
}

/**
 * Opens any file: uses the standard API for vault files,
 * falls back to manual mount for external files (e.g.
 * CSS snippets).
 */
static openFile(file: TFile, plugin: CodeFilesPlugin): void {
    if (
        plugin.getActiveExtensions().includes(file.extension) &&
        plugin.app.vault.getAbstractFileByPath(file.path)
    ) {
        void CodeEditorView.openVaultFile(file, plugin);
    } else {
        CodeEditorView.openExternalFile(file, plugin);
    }
}
```

> **Note** : cela ne change pas le comportement — c'est un refactoring de lisibilité qui
> sépare les deux cas et documente clairement le bypass intentionnel.

### Solution S5 — `chooseCssFileModal.ts`

Problème (ligne 41-42) :
```typescript
// @ts-expect-error - TFile is designed for vault files
CodeEditorView.openFile(new TFile(this.plugin.app.vault, path), this.plugin);
```

Construire un `TFile` manuellement est non-standard. Obsidian fournit
`vault.getFileByPath()` pour obtenir un `TFile` existant — mais les snippets CSS ne sont
pas indexés dans le vault (ils sont dans `.obsidian/`), donc cette API retourne `null`.

**Solution** : puisqu'on sait que le fichier est externe au vault, appeler directement
`CodeEditorView.openExternalFile()` après avoir créé un objet compatible. Mais comme
`TFile` reste nécessaire (signature de `openExternalFile`), la solution propre est
d'utiliser `app.vault.getAbstractFileByPath()` pour les snippets déjà existants ou de
garder le contournement documenté mais explicite :

Remplacer dans `chooseCssFileModal.ts` :
```typescript
// @ts-expect-error - TFile is designed for vault files
CodeEditorView.openFile(new TFile(this.plugin.app.vault, path), this.plugin);
```

Par :
```typescript
// CSS snippets live in .obsidian/snippets/ which is
// outside the vault root — getAbstractFileByPath()
// returns null for them. We construct a minimal TFile
// shell so CodeEditorView.openExternalFile() can
// read the path; the vault reference is only used for
// adapter access (not for indexing).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pseudoFile = new (this.plugin.app.vault as any)
    .fileClass(this.plugin.app.vault, path) as TFile;
CodeEditorView.openExternalFile(pseudoFile, this.plugin);
```

> **Alternative plus simple** : si `fileClass` n'est pas accessible, garder le `@ts-expect-error`
> mais remplacer `openFile` par `openExternalFile` pour être explicite :
> ```typescript
> // Snippets are outside the vault — use external mount.
> // TFile is constructed manually because the adapter
> // path is not indexed in the vault.
> // @ts-expect-error: TFile constructor is internal API
> const pseudoFile = new TFile(this.plugin.app.vault, path);
> CodeEditorView.openExternalFile(pseudoFile, this.plugin);
> ```
> Cette variante est meilleure que l'actuelle car elle appelle explicitly `openExternalFile`
> et documente l'intention.

---

## Vérification finale

Après les deux tâches :
```pwsh
npx tsc --noEmit 2>&1 | Select-String "^src/"  # doit être vide
npx eslint src/                                  # exit 0
npm run build                                    # doit réussir
```
