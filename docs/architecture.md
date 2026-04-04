# Architecture — Code Files Plugin

## Vue d'ensemble

```
Obsidian
  ├── CodeEditorView          (TextFileView — un onglet = une instance)
  │     └── mountCodeEditor() → CodeEditorInstance
  │                                 ├── iframe  (blob URL → monacoEditor.html)
  │                                 ├── send()  (parent → iframe)
  │                                 └── onMessage handler (iframe → parent)
  │
  ├── FenceEditModal          (Modal — édition d'un code fence)
  │     └── mountCodeEditor()
  │
  └── EditorSettingsModal     (Modal — gear icon)
        └── mountCodeEditor() (Monaco embarqué pour éditer le JSON de config)
```

`mountCodeEditor` est le seul point d'entrée pour créer un éditeur Monaco. Il retourne un `CodeEditorInstance` qui encapsule l'iframe et son cycle de vie.

---

## Cycle de vie d'une iframe Monaco

### Ouverture

```
CodeEditorView.onLoadFile(file)
  └── mountCodeEditor(plugin, language, initialValue, codeContext, onChange, onSave)
        ├── 1. Fetch monacoEditor.html via app:// URL
        ├── 2. Patch ./vs → app:// URL absolue (sans timestamp)
        ├── 3. Fetch editor.main.css → inline dans le HTML
        ├── 4. Patch @font-face codicon → app:// URL du .ttf copié au build
        ├── 5. Intercepte appendChild pour bloquer les <link> dynamiques de Monaco
        ├── 6. Crée une blob URL → iframe.src
        └── 7. window.addEventListener('message', onMessage)
```

### Séquence d'initialisation (postMessage)

```
iframe                            parent (mountCodeEditor.ts)
  │                                     │
  │── ready ──────────────────────────► │  Monaco est chargé
  │                                     │── init (initParams) ──────────► │
  │                                     │── get-languages ───────────────► │
  │                                     │── change-value (initialValue) ──► │
  │                                     │
  │◄── languages (map ext→langId) ──────│  persisté dans data.json (une fois par session)
  │
  │  [l'utilisateur édite]
  │── change (value, context) ─────────► │  onChange?.()
  │── save-document (context) ──────────► │  onSave?.()
```

### Fermeture

```
CodeEditorView.onUnloadFile / onClose
  └── cleanup()
        └── codeEditor.destroy()
              ├── window.removeEventListener('message', onMessage)
              ├── URL.revokeObjectURL(blobUrl)
              └── iframe.remove()
```

---

## Protocole postMessage — référence complète

### Parent → iframe

| Type | Payload | Effet |
|------|---------|-------|
| `init` | `initParams` (voir ci-dessous) | Crée l'éditeur Monaco (une seule fois, guard `initialized`) |
| `change-value` | `{ value }` | Remplace le contenu de l'éditeur |
| `change-language` | `{ language }` | Change le langage de coloration |
| `change-theme` | `{ theme, themeData? }` | Applique un thème (defineTheme si custom) |
| `change-editor-config` | `{ config }` | Applique la config JSON (tabSize, formatOnSave, etc.) |
| `change-options` | `{ noSemanticValidation, noSyntaxValidation }` | Met à jour les diagnostics TS/JS |
| `change-word-wrap` | `{ wordWrap }` | Change le word wrap |
| `change-background` | `{ background, theme? }` | Change le fond de l'iframe |
| `get-languages` | — | Déclenche l'envoi de la map extension → langage |

### iframe → parent

| Type | Payload | Signification |
|------|---------|---------------|
| `ready` | — | Monaco est chargé, prêt à recevoir `init` |
| `languages` | `{ langs: [ext, langId][] }` | Map complète des langages Monaco |
| `change` | `{ value, context }` | Contenu modifié par l'utilisateur |
| `save-document` | `{ context }` | Ctrl+S pressé |
| `word-wrap-toggled` | `{ wordWrap, context }` | Alt+Z pressé |
| `open-rename-extension` | `{ context }` | Action "Rename Extension" déclenchée |
| `open-theme-picker` | `{ context }` | Action "Change Theme" déclenchée |
| `open-formatter-config` | `{ context }` | Action "Formatter Config" déclenchée |
| `open-settings` | `{ context }` | Ctrl+, pressé |
| `open-obsidian-palette` | `{ context }` | Ctrl+P pressé |

### `initParams` — détail

```typescript
{
  context: string,               // identifiant de l'instance (path fichier ou "modal-editor.ext")
  lang: string,                  // langage Monaco
  theme: string,                 // id thème (caractères spéciaux remplacés par -)
  themeData?: string,            // JSON stringifié du thème custom (si non builtin)
  wordWrap: 'on' | 'off',
  folding: boolean,
  lineNumbers: boolean,
  minimap: boolean,
  noSemanticValidation: boolean,
  noSyntaxValidation: boolean,
  background?: 'transparent',   // présent si theme === 'default'
  formatterConfig: string,       // JSON mergé global(*) + per-ext
}
```

---

## Le `codeContext`

Chaque instance Monaco reçoit un `codeContext` unique à sa création. Il sert à deux choses :

1. **Filtrer les messages** — `onMessage` ignore tout message dont `data.context !== codeContext`. Plusieurs iframes peuvent être ouvertes simultanément (un fichier + un fence modal) ; sans ce filtre, leurs messages se croiseraient.

2. **Identifier la source d'une action** — quand Monaco envoie `open-theme-picker`, le parent sait quelle iframe en est à l'origine.

Valeurs typiques :
- Fichier ouvert : `"path/to/file.ts"` (via `file.path`)
- Fence modal : `"modal-editor.js"`
- Config JSON dans EditorSettingsModal : `"editor-settings-config.jsonc"`

**Attention :** si un fichier est renommé, l'ancien `codeContext` devient stale. `CodeEditorView.onRename` détruit l'iframe et en recrée une nouvelle avec le bon context.

---

## Système de langages

Deux sources, par ordre de priorité :

```
dynamicMap (Monaco) > staticMap (fallback) > 'plaintext'
```

- **`staticMap`** (`getLanguage.ts`) — liste statique d'environ 80 extensions courantes. Disponible immédiatement au démarrage, avant qu'une iframe soit ouverte.
- **`dynamicMap`** — rempli depuis `monaco.languages.getLanguages()` à la première ouverture d'un éditeur. Persisté dans `data.json` (clé `languageMap`). Rechargé au démarrage via `loadPersistedLanguages()`.

La persistance garantit que la coloration syntaxique fonctionne dès le premier onglet rouvert au démarrage, sans attendre qu'une iframe Monaco soit initialisée.

---

## Système d'extensions

Deux modes exclusifs contrôlés par `settings.allExtensions` :

| Mode | Source des extensions actives | Modifiable par |
|------|-------------------------------|----------------|
| Manuel (`allExtensions: false`) | `settings.extensions[]` | add/remove dans la liste |
| Étendu (`allExtensions: true`) | `getAllMonacoExtensions(excluded)` + `extraExtensions[]` | excluded/extra lists |

`getActiveExtensions()` retourne toujours la liste computée selon le mode actif.

`reregisterExtensions()` diff la liste précédente (`_registeredExts`) contre la nouvelle et appelle `registerExtension`/`unregisterExtension` uniquement pour les changements — évite de réenregistrer 80 extensions identiques à chaque save.

---

## Système de config éditeur

Deux niveaux de config JSON (JSONC supporté via `parseEditorConfig`) :

```
editorConfigs['*']     → config globale (DEFAULT_EDITOR_CONFIG)
editorConfigs['ts']    → override pour .ts uniquement
```

Merge à l'usage : `{ ...globalCfg, ...extCfg }`. Envoyé comme `formatterConfig` dans `initParams`, ou via `change-editor-config` pour une mise à jour à chaud.

`parseEditorConfig` strip les commentaires `//` et `/* */` et les virgules trailing avant le `JSON.parse`.

`broadcastEditorConfig(ext)` : si `ext === '*'`, rebroadcast le config mergé à **toutes** les vues ouvertes. Sinon, uniquement aux vues dont `file.extension === ext`.

---

## CSP — contraintes et solutions

La CSP d'Obsidian s'applique à toutes les frames enfants et ne peut pas être surchargée depuis l'iframe. Contraintes :

| Ressource | Bloqué | Solution |
|-----------|--------|----------|
| `<link rel="stylesheet">` dynamique | Oui | CSS inliné dans le HTML + patch `appendChild` |
| `data:` pour les polices | Oui | TTF copié au build, URL `app://` dans le CSS |
| `data:` pour les images | Non (autorisé dans `img-src`) | `img-src data:` dans le `<meta>` CSP de l'iframe |
| URLs relatives `./vs` | Cassées (timestamp) | Remplacées par URL `app://` absolue |
| `file://` | Bloqué par Electron | Blob URL comme `src` de l'iframe |
