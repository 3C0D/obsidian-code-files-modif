# Migration terminée : JS iframe Monaco → TypeScript bundle

## ✅ Migration accomplie

La migration des 4 fichiers `.js` séparés + code inline vers un bundle TypeScript unique est **terminée**. L'architecture finale est :

- **Bundle unique** : `monacoBundle.js` (~144KB) généré depuis `src/editor/monacoMain.ts`
- **Modules organisés** : Code split en `src/editor/iframe/` (types.ts, config.ts, init.ts, etc.)
- **Build IIFE** : Compatible avec l'environnement iframe (pas de require/import au runtime)
- **Globals déclarés** : `monaco`, `prettier`, etc. via `declare global` dans `types.ts`

## Contexte historique

L'iframe Monaco utilisait initialement **4 fichiers `.js` séparés** chargés comme `<script src="...">`,
plus une grosse section de code inline dans `monacoEditor.html`.

**Anciens fichiers concernés :**
| Fichier supprimé | Rôle |
|---|---|
| `src/editor/monacoHtml.js` | Variables de config (Prettier, diff) |
| `src/editor/monacoDiff.js` | Modal diff + widgets revert |
| `src/editor/monacoFormatters.js` | Providers de formatage |
| `src/editor/monacoActions.js` | Actions + raccourcis clavier |
| `<script>` inline dans `monacoEditor.html` | Init Monaco, `applyParams`, listener messages |

**Nouvelle architecture :** Un seul fichier `monacoBundle.js` généré par esbuild depuis `monacoMain.ts`.

---

## Contraintes importantes à respecter

> [!IMPORTANT]
> L'iframe Monaco **ne peut pas utiliser `import`/`require` au runtime** car Monaco utilise son
> propre loader AMD (`require(['vs/editor/editor.main'], callback)`). Le bundle esbuild doit donc
> être en **format IIFE** (Immediately Invoked Function Expression) ou **ESM inline**, pas en CJS.

> [!WARNING]
> Les variables `monaco`, `prettier`, `prettierPlugins`, `window.mermaidFormatter`, etc. sont
> des **globals injectées par les `<script>` qui précèdent**. Il faut les déclarer en TypeScript
> avec `declare const` — **ne pas essayer de les importer**.

> [!WARNING]
> `esbuild` a deux contextes distincts dans ce projet :
> - Le contexte **principal** : compile `src/main.ts` en CJS pour Obsidian (Node/Electron)
> - Le nouveau contexte **iframe** : doit compiler `src/editor/monacoMain.ts` en IIFE/ESM
>   pour le navigateur. Ce sont des configs **séparées** avec des options différentes.

---

## Étape 1 — Créer `src/editor/monacoMain.ts`

Ce fichier **remplace et réunit** les 4 fichiers `.js` + le code inline de l'HTML.

### 1.1 Structure recommandée

```
src/editor/
├── monacoMain.ts          ← nouveau point d'entrée unique (remplace les .js)
├── iframe/                ← sous-dossier optionnel pour organiser
│   ├── config.ts          ← contenu de monacoHtml.js
│   ├── diff.ts            ← contenu de monacoDiff.js  
│   ├── formatters.ts      ← contenu de monacoFormatters.js
│   ├── actions.ts         ← contenu de monacoActions.js
│   └── init.ts            ← le gros bloc inline de monacoEditor.html
└── iframe/types.ts        ← déclarations des globals Monaco/Prettier
```

### 1.2 Fichier `src/editor/iframe/types.ts` — Déclarer les globals

```typescript
// Globals injected by <script> tags before monacoBundle.js
// Monaco is loaded by AMD loader, Prettier by standalone scripts

declare const monaco: typeof import('monaco-editor');

declare const prettier: {
    format(source: string, options: PrettierOptions): Promise<string>;
};

declare const prettierPlugins: {
    markdown: unknown;
    estree: unknown;
    typescript: unknown;
    babel: unknown;
    postcss: unknown;
    html: unknown;
    yaml: unknown;
    graphql: unknown;
};

interface PrettierOptions {
    parser: string;
    plugins: unknown[];
    printWidth?: number;
    tabWidth?: number;
    useTabs?: boolean;
    proseWrap?: string;
}

// Hotkey shape sent by the parent via postMessage
interface HotkeyConfig {
    key: string;
    modifiers: string[];
}

// Shape of a project file sent via 'load-project-files'
interface ProjectFile {
    path: string;
    content: string;
}

// Shape of the 'init' message params
interface InitParams {
    context: string;
    lang?: string;
    theme?: string;
    themeData?: string;
    folding?: boolean;
    lineNumbers?: boolean;
    minimap?: boolean;
    wordWrap?: string;
    editorConfig?: string;
    commandPaletteHotkey?: HotkeyConfig | null;
    settingsHotkey?: HotkeyConfig | null;
    deleteFileHotkey?: HotkeyConfig | null;
    noSemanticValidation?: boolean;
    noSyntaxValidation?: boolean;
    projectRootFolder?: string;
    isUnregisteredExtension?: boolean;
}

interface EditorConfig {
    tabSize?: number;
    insertSpaces?: boolean;
    formatOnSave?: boolean;
    printWidth?: number;
    [key: string]: unknown;
}

// Augment Window with custom properties used by the iframe
interface Window {
    _initialized?: boolean;
    _pendingProjectFiles?: ProjectFile[] | null;
    mermaidFormatter?: {
        formatMermaid(source: string): string;
        formatMarkdownMermaidBlocks(source: string): string;
    };
    clangFormatter?: {
        init(wasmUrl: string): Promise<void>;
        format(source: string): string;
    };
    ruffFormatter?: {
        init(wasmUrl: string): Promise<void>;
        format(source: string, filename: null, options: object): string;
    };
    gofmtFormatter?: {
        init(wasmUrl: string): Promise<void>;
        format(source: string): string;
    };
    __CLANG_WASM_URL__?: string;
    __RUFF_WASM_URL__?: string;
    __GOFMT_WASM_URL__?: string;
}
```

### 1.3 Fichier `src/editor/monacoMain.ts` — Point d'entrée

Le code s'exécute **dans le callback AMD de Monaco**, qui est déclenché depuis l'HTML.
La fonction principale `initMonacoApp()` est **appelée par l'HTML** après le chargement.

```typescript
// Entry point called from monacoEditor.html after require(['vs/editor/editor.main'])
// All types come from types.ts (declare const for globals)
import './iframe/types'; // not a real import — just for IDE reference
import { CONFIG } from './iframe/config';
import { registerFormatters } from './iframe/formatters';
import { registerActions } from './iframe/actions';
import { openDiffModal, closeDiffModal } from './iframe/diff';
import { initEditor, applyEditorConfig, handleMessage } from './iframe/init';

// Called by monacoEditor.html after require(['vs/editor/editor.main'], callback)
(window as Window & { initMonacoApp: () => void }).initMonacoApp = function () {
    initEditor({
        CONFIG,
        registerFormatters,
        registerActions,
        openDiffModal,
        closeDiffModal,
        handleMessage,
    });
};
```

> [!NOTE]
> Alternativement (plus simple), on peut garder le code d'init directement dans `monacoMain.ts`
> sans passer par une fonction exportée — voir section "Simplification" en fin de document.

---

## Étape 2 — Modifier `scripts/build/assets.ts`

Supprimer la copie des 4 anciens `.js` et ajouter la copie du nouveau bundle.

```typescript
// AVANT
export async function copyEditorFiles(
    pluginDir: string,
    buildPath: string
): Promise<void> {
    const files: [string, string][] = [
        ['src/editor/monacoEditor.html', 'monacoEditor.html'],
        ['src/editor/monacoHtml.js', 'monacoHtml.js'],      // ← supprimer
        ['src/editor/monacoFormatters.js', 'monacoFormatters.js'],  // ← supprimer
        ['src/editor/monacoDiff.js', 'monacoDiff.js'],      // ← supprimer
        ['src/editor/monacoActions.js', 'monacoActions.js'],// ← supprimer
        ['src/editor/monacoHtml.css', 'monacoHtml.css']
    ];
    for (const [src, dest] of files) {
        await copyFile(path.join(pluginDir, src), path.join(buildPath, dest));
    }
}

// APRÈS
export async function copyEditorFiles(
    pluginDir: string,
    buildPath: string
): Promise<void> {
    const files: [string, string][] = [
        ['src/editor/monacoEditor.html', 'monacoEditor.html'],
        ['src/editor/monacoHtml.css', 'monacoHtml.css']
        // monacoBundle.js is generated by esbuild — no copy needed
    ];
    for (const [src, dest] of files) {
        await copyFile(path.join(pluginDir, src), path.join(buildPath, dest));
    }
}
```

---

## Étape 3 — Modifier `scripts/esbuild.config.ts`

Ajouter un **second contexte esbuild** pour le bundle iframe, avec des options différentes.

### Options cruciales pour le bundle iframe

| Option | Valeur | Raison |
|---|---|---|
| `format` | `'iife'` | Pas de `require`/`import` au runtime |
| `platform` | `'browser'` | APIs navigateur, pas Node |
| `bundle` | `true` | Bundle tout en un seul fichier |
| `globalName` | _(non nécessaire en IIFE sans export)_ | — |
| `external` | `['monaco-editor']` | Monaco est injecté par AMD, pas bundlé |
| `outfile` | `buildPath/monacoBundle.js` | Fichier de sortie unique |
| `minify` | `isProd` | Même logique que le build principal |
| `sourcemap` | `isProd ? false : 'inline'` | Idem |
| `treeShaking` | `true` | Supprimer le code mort |

### Modification dans `createBuildContext` ou dans `main()`

```typescript
// In main(), after creating the main context:

const monacoBundlePath = path.join(pluginDir, 'src/editor/monacoMain.ts');
const monacoBundleOut = path.join(buildPath, 'monacoBundle.js');

const monacoContext = await esbuild.context({
    entryPoints: [monacoBundlePath],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    // Monaco is a global injected by AMD loader — don't bundle it
    external: ['monaco-editor'],
    minify: isProd,
    sourcemap: isProd ? false : 'inline',
    treeShaking: true,
    outfile: monacoBundleOut,
    logLevel: 'info',
});

if (isProd) {
    await monacoContext.rebuild();
    monacoContext.dispose();
} else {
    await monacoContext.watch();
}
```

> [!IMPORTANT]
> Il faut appeler **`monacoContext.dispose()`** après `rebuild()` en mode prod pour éviter
> que le processus reste suspendu.

---

## Étape 4 — Modifier `src/editor/monacoEditor.html`

Remplacer les 4 balises `<script src="...">` par une seule.

```html
<!-- AVANT -->
<script src="./monacoHtml.js"></script>
<script src="./monacoDiff.js"></script>
<script src="./monacoFormatters.js"></script>
<script src="./monacoActions.js"></script>

<!-- APRÈS -->
<script src="./monacoBundle.js"></script>
```

Le code inline dans `<script>` qui suit le `require([...], function() {...})` doit être
**simplifié** : il n'a plus besoin de définir les variables globales car elles seront
gérées dans le module TS. Il appelle simplement `initMonacoApp()`.

```html
<script>
    require(['vs/editor/editor.main'], function () {
        // All initialization is handled by monacoBundle.js
        initMonacoApp();
    });
</script>
```

---

## Approche simplifiée recommandée (sans réorganisation en sous-dossier)

Si on veut éviter de trop restructurer, on peut garder les fichiers séparés mais les
**renommer en `.ts`** et les importer depuis un unique `monacoMain.ts` :

```
src/editor/
├── monacoMain.ts        ← point d'entrée (nouveau)
├── monacoHtml.ts        ← renommé de monacoHtml.js
├── monacoDiff.ts        ← renommé de monacoDiff.js
├── monacoFormatters.ts  ← renommé de monacoFormatters.js
├── monacoActions.ts     ← renommé de monacoActions.js
├── monacoTypes.ts       ← nouveau (déclarations de types globals)
└── monacoEditor.html    ← simplifié
```

`monacoMain.ts` importe tout et orchestre l'init :
```typescript
import { CONFIG, ... } from './monacoHtml';
import { registerFormatters } from './monacoFormatters';
// etc.
```

Cette approche minimise les changements de structure tout en activant TypeScript.

---

## Points d'attention spécifiques

### Gestion des globals partagés entre fichiers — Module State

Les variables autrefois globales (`editor`, `context`, etc.) sont regroupées dans un
fichier `src/editor/monacoState.ts`. Chaque module l'importe directement.

**`src/editor/monacoState.ts`** :
```typescript
// Shared mutable state for the Monaco iframe bundle.
// Imported by formatters, actions, diff, and init modules.
import type * as monacoEditor from 'monaco-editor';

export const state: {
    editor: monacoEditor.editor.IStandaloneCodeEditor | null;
    diffEditorInstance: monacoEditor.editor.IStandaloneDiffEditor | null;
    context: string;
    currentLang: string;
    formatOnSave: boolean;
    initialized: boolean;
    lastFormatOriginal: string | null;
    lastFormatFormatted: string | null;
    editorDefaults: monacoEditor.editor.IStandaloneEditorConstructionOptions;
    currentCommandPaletteHotkey: HotkeyConfig | null;
    currentSettingsHotkey: HotkeyConfig | null;
    currentDeleteFileHotkey: HotkeyConfig | null;
} = {
    editor: null,
    diffEditorInstance: null,
    context: '',
    currentLang: 'plaintext',
    formatOnSave: false,
    initialized: false,
    lastFormatOriginal: null,
    lastFormatFormatted: null,
    editorDefaults: {},
    currentCommandPaletteHotkey: null,
    currentSettingsHotkey: null,
    currentDeleteFileHotkey: null,
};
```

**Utilisation dans les autres modules** :
```typescript
// Dans monacoFormatters.ts
import { state } from './monacoState';

// Lire
const lang = state.currentLang;

// Écrire
state.lastFormatOriginal = original;
state.lastFormatFormatted = formatted;
```

> [!NOTE]
> L'objet `state` est un objet **mutable partagé par référence** — tous les modules
> qui l'importent voient les mêmes données. C'est l'équivalent propre des anciennes
> variables globales `var`.

### Le pattern AMD de Monaco

Le code actuel dans l'HTML est :
```javascript
require(['vs/editor/editor.main'], function () {
    // Init code ici
});
```

En TypeScript, la fonction callback sera `initMonacoApp` définie dans le bundle.
La déclaration AMD `require` doit rester dans l'HTML (elle est injectée par Monaco).

### Types Monaco

Si le package `@types/monaco-editor` est installé, les types sont disponibles directement.
Sinon, utiliser `declare const monaco: typeof import('monaco-editor')` dans `types.ts`.

Vérifier dans `package.json` :
```json
"@types/monaco-editor": "..."  // Ou "monaco-editor" qui inclut ses propres types
```

---

## Résumé des fichiers à créer/modifier

| Action | Fichier |
|---|---|
| 🆕 Créer | `src/editor/monacoMain.ts` |
| 🆕 Créer | `src/editor/monacoTypes.ts` (ou `iframe/types.ts`) |
| 🔄 Renommer `.js` → `.ts` | `monacoHtml`, `monacoDiff`, `monacoFormatters`, `monacoActions` |
| ✏️ Modifier | `scripts/build/assets.ts` (supprimer copie des .js) |
| ✏️ Modifier | `scripts/esbuild.config.ts` (ajouter contexte iframe) |
| ✏️ Modifier | `src/editor/monacoEditor.html` (une seule balise `<script>`) |
| 🗑️ Supprimer | `src/editor/monacoHtml.js` (après migration) |
| 🗑️ Supprimer | `src/editor/monacoDiff.js` (après migration) |
| 🗑️ Supprimer | `src/editor/monacoFormatters.js` (après migration) |
| 🗑️ Supprimer | `src/editor/monacoActions.js` (après migration) |

---

## Ordre d'exécution recommandé pour le LLM

1. Créer `monacoTypes.ts` avec les déclarations de globals
2. Renommer `monacoHtml.js` → `monacoHtml.ts` et ajouter les types
3. Renommer `monacoDiff.js` → `monacoDiff.ts` et typer les variables
4. Renommer `monacoFormatters.js` → `monacoFormatters.ts` et typer
5. Renommer `monacoActions.js` → `monacoActions.ts` et typer
6. Créer `monacoMain.ts` qui importe tout et expose `initMonacoApp`
7. Modifier `monacoEditor.html` (simplifier les `<script>`)
8. Modifier `scripts/build/assets.ts`
9. Modifier `scripts/esbuild.config.ts`
10. Tester le build avec `npm run dev`
11. Supprimer les anciens `.js` si tout fonctionne
