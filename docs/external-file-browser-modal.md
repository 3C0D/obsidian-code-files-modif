# External File Browser Modal

## Summary

Modal permettant d'ouvrir n'importe quel fichier extérieur au vault Obsidian dans l'éditeur Monaco. Utilise un explorateur de fichiers natif compatible Windows/Linux/macOS/mobile, démarre dans `.obsidian/`, applique les mêmes exclusions de taille et de type que les autres modals, et ouvre les fichiers dans une nouvelle vue Monaco.

---

## Fichiers à créer ou modifier (ordre alphabétique)

### Fichiers à créer

- `src/modals/externalFileBrowserModal.ts` — nouveau modal pour l'explorateur de fichiers externes

### Fichiers à modifier

- `src/ui/commands.ts` — ajout de la commande pour ouvrir le modal
- `src/ui/contextMenus.ts` — ajout du menu contextuel (optionnel)

---

## Implémentation

### 1. Modal: `externalFileBrowserModal.ts`

**Pattern à suivre**: `chooseHiddenFileModal.ts` (scan récursif, filtrage par taille/extension, suggester)

**Différences clés**:
- Démarre dans `.obsidian/` au lieu du vault root
- Scanne TOUS les fichiers (pas seulement les hidden)
- Pas de révélation temporaire (fichiers déjà accessibles via adapter)
- Ouvre via `openInMonacoLeaf()` directement

**Code structure**:

```typescript
export class ExternalFileBrowserModal extends SuggestModal<FileSuggestion> {
    private files: FileSuggestion[] = [];

    constructor(private plugin: CodeFilesPlugin) {
        super(plugin.app);
        this.setPlaceholder('Search files in .obsidian/...');
    }

    async onOpen(): Promise<void> {
        await this.scanFolder('.obsidian');
        this.inputEl.dispatchEvent(new Event('input'));
    }

    private async scanFolder(folderPath: string): Promise<void> {
        // Récursif, même logique que chooseHiddenFileModal
        // Filtrage: EXCLUDED_EXTENSIONS + maxFileSize
        // Exclusion des dossiers: .git, node_modules, .trash (depuis settings)
    }

    async onChooseSuggestion(item: FileSuggestion): Promise<void> {
        const { openInMonacoLeaf } = await import('../editor/codeEditorView/editorOpeners.ts');
        await openInMonacoLeaf(item.path, this.plugin, true); // Open in new tab for external files
    }
}
```

**Exclusions**:

- **Extensions**: Réutiliser `EXCLUDED_EXTENSIONS` de `chooseHiddenFileModal.ts`:
  ```typescript
  const EXCLUDED_EXTENSIONS = [
      'exe', 'dll', 'so', 'dylib', 'app', 'dmg', 'msi',  // Executables
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',      // Archives
      'db', 'sqlite', 'mdb',                              // Databases
      'doc', 'xls', 'ppt',                                // Office binary
      'ttf', 'otf', 'woff', 'woff2', 'eot'               // Fonts
  ];
  ```

- **Taille**: Utiliser `getMaxFileSize(plugin)` de `hiddenFiles/scan.ts`

- **Dossiers**: Utiliser `plugin.settings.excludedFolders` (`.git`, `node_modules`, `.trash`)

**Compatibilité mobile**: Le scan via `vault.adapter.list()` fonctionne sur toutes les plateformes (déjà testé dans `chooseHiddenFileModal.ts`)

---

### 2. Commande: `commands.ts`

**Ajout**:

```typescript
plugin.addCommand({
    id: 'open-external-file-browser',
    name: 'Browse External Files (.obsidian/)',
    callback: () => {
        new ExternalFileBrowserModal(plugin).open();
    }
});
```

**Position**: Après la commande `open-hidden-files-vault` (ligne ~95)

---

### 3. Menu contextuel (optionnel): `contextMenus.ts`

**Ajout possible** dans le menu file-explorer ou editor, mais pas nécessaire pour la première version.

---

## Comportement

### Ouverture du fichier

- Utilise `openInMonacoLeaf(path, plugin, true)` (ouvre dans une nouvelle tab)
- Ouvre dans une **nouvelle tab** (comportement identique aux CSS snippets)
- Pas de révélation dans le vault (fichiers restent externes)
- Pas de persistence dans `temporaryRevealedPaths` (pas nécessaire)

### Fermeture du fichier

- Aucune action spéciale (pas de cleanup de révélation)
- Le fichier reste accessible via adapter

---

## Cas d'usage

1. **Éditer des configs Obsidian**: `app.json`, `workspace.json`, `hotkeys.json`
2. **Éditer des configs de plugins**: `.obsidian/plugins/*/data.json`
3. **Éditer des thèmes**: `.obsidian/themes/*.css`
4. **Accès rapide**: Alternative à "Open snippets folder" pour tous les fichiers `.obsidian/`

---

## Limitations

- **Scope**: Limité à `.obsidian/` (pas d'accès au système de fichiers complet)
- **Taille**: Fichiers > `maxFileSize` (défaut 10MB) exclus
- **Types**: Extensions binaires exclues (voir `EXCLUDED_EXTENSIONS`)
- **Performance**: Scan récursif peut être lent sur de gros dossiers (acceptable pour `.obsidian/`)

---

## Alternatives considérées

### Option 1: Explorateur système natif
- **Avantage**: Interface familière
- **Inconvénient**: Pas de filtrage automatique, nécessite API Electron (desktop only)

### Option 2: Suggester avec path complet
- **Avantage**: Simple, réutilise le pattern existant
- **Inconvénient**: Pas de navigation par dossier (choisi pour cette implémentation)

### Option 3: Tree view custom
- **Avantage**: Navigation hiérarchique
- **Inconvénient**: Complexité élevée, pas de pattern existant dans le plugin

---

## Code touché par module

### `src/modals/externalFileBrowserModal.ts` (nouveau)

```typescript
/**
 * Modal for browsing and opening external files in .obsidian/ folder.
 * Recursively scans .obsidian/, filters by size and extension,
 * and opens selected files in Monaco Editor.
 */
import { SuggestModal, normalizePath, Notice } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';
import { getMaxFileSize } from '../utils/hiddenFiles/index.ts';

interface FileSuggestion {
    name: string;
    path: string;
    size: number;
}

const EXCLUDED_EXTENSIONS = [
    'exe', 'dll', 'so', 'dylib', 'app', 'dmg', 'msi',
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    'db', 'sqlite', 'mdb',
    'doc', 'xls', 'ppt',
    'ttf', 'otf', 'woff', 'woff2', 'eot'
];

export class ExternalFileBrowserModal extends SuggestModal<FileSuggestion> {
    private files: FileSuggestion[] = [];

    constructor(private plugin: CodeFilesPlugin) {
        super(plugin.app);
        this.setPlaceholder('Search files in .obsidian/...');
    }

    async onOpen(): Promise<void> {
        super.onOpen();
        await this.loadFiles();
        this.inputEl.dispatchEvent(new Event('input'));
    }

    private async loadFiles(): Promise<void> {
        try {
            const obsidianPath = normalizePath('.obsidian');
            await this.scanFolder(obsidianPath);

            if (this.files.length === 0) {
                new Notice('No files found in .obsidian/');
                this.close();
            }
        } catch (error) {
            new Notice('Failed to load files');
            console.error('Error loading files:', error);
            this.close();
        }
    }

    private async scanFolder(folderPath: string): Promise<void> {
        const listed = await this.plugin.app.vault.adapter.list(folderPath);

        // Scan files
        for (const filePath of listed.files) {
            const fileName = filePath.split('/').pop() ?? '';
            const ext = fileName.includes('.')
                ? (fileName.split('.').pop()?.toLowerCase() ?? '')
                : '';

            // Skip excluded extensions
            if (EXCLUDED_EXTENSIONS.includes(ext)) continue;

            try {
                const stat = await this.plugin.app.vault.adapter.stat(filePath);
                if (!stat || stat.size > getMaxFileSize(this.plugin)) continue;

                this.files.push({
                    name: fileName,
                    path: filePath,
                    size: stat.size
                });
            } catch {
                continue;
            }
        }

        // Scan subfolders
        for (const subFolder of listed.folders) {
            const folderName = subFolder.split('/').pop() ?? '';
            
            // Skip excluded folders from settings
            if (this.plugin.settings.excludedFolders.includes(folderName)) {
                continue;
            }

            await this.scanFolder(subFolder);
        }
    }

    getSuggestions(query: string): FileSuggestion[] {
        return this.files.filter((file) =>
            file.path.toLowerCase().includes(query.toLowerCase())
        );
    }

    async onChooseSuggestion(item: FileSuggestion): Promise<void> {
        await openInMonacoLeaf(item.path, this.plugin, true); // Open in new tab for external files
    }

    renderSuggestion(item: FileSuggestion, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'suggestion-content' });
        container.createDiv({ text: item.path, cls: 'suggestion-title' });

        const sizeKB = (item.size / 1024).toFixed(1);
        container.createDiv({
            text: `${sizeKB} KB`,
            cls: 'suggestion-note'
        });
    }
}
```

---

### `src/ui/commands.ts` (modification)

**Ajout après la commande `open-hidden-files-vault`** (ligne ~95):

```typescript
import { ExternalFileBrowserModal } from '../modals/externalFileBrowserModal.ts';

// ... existing commands ...

plugin.addCommand({
    id: 'open-external-file-browser',
    name: 'Browse External Files (.obsidian/)',
    callback: () => {
        new ExternalFileBrowserModal(plugin).open();
    }
});
```

---

## Tests à effectuer

1. **Scan**: Vérifier que tous les fichiers `.obsidian/` sont listés
2. **Filtrage**: Vérifier que les fichiers > maxFileSize sont exclus
3. **Exclusions**: Vérifier que les extensions binaires sont exclues
4. **Ouverture**: Vérifier que le fichier s'ouvre dans Monaco
5. **Mobile**: Tester sur mobile (si possible)
6. **Performance**: Tester avec un gros dossier `.obsidian/` (>1000 fichiers)

---

## Notes

- **Nom du modal**: `ExternalFileBrowserModal` (clair et descriptif)
- **Nom de la commande**: "Browse External Files (.obsidian/)" (indique le scope)
- **Pattern réutilisé**: `chooseHiddenFileModal.ts` (scan + suggester)
- **Pas de nouvelle dépendance**: Utilise uniquement les APIs Obsidian existantes
