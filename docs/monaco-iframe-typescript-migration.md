# Migration TypeScript Iframe Monaco - TERMINÉE

## Résumé

Les 4 fichiers JavaScript de l'iframe Monaco ont été migrés vers TypeScript et bundlés en un seul fichier `monacoBundle.js`.

## Structure finale

```
src/editor/
├── monacoMain.ts          # Point d'entrée du bundle
├── iframe/
│   ├── types.ts           # Déclarations globales (monaco, prettier)
│   ├── config.ts          # Configuration Prettier/Diff
│   ├── init.ts            # Initialisation Monaco + message handler
│   ├── formatters.ts      # Providers de formatage
│   ├── diff.ts            # Modal diff + revert widgets
│   └── actions.ts         # Actions Monaco + raccourcis
└── monacoEditor.html      # Charge monacoBundle.js
```

## Build

- **Format** : IIFE (pas de require/import au runtime)
- **Platform** : browser
- **External** : monaco-editor (chargé par AMD)
- **Output** : monacoBundle.js (~20KB)

## Notes techniques

1. **@ts-nocheck** : Utilisé dans les fichiers iframe car les types Monaco importés ne correspondent pas aux globals AMD
2. **Extensions .js** : Tous les imports relatifs utilisent `.js` (requis par tsconfig)
3. **Globals** : `monaco`, `prettier`, `prettierPlugins` déclarés dans `types.ts` avec `declare global`

## Fichiers supprimés

- ❌ `src/editor/monacoHtml.js`
- ❌ `src/editor/monacoDiff.js`
- ❌ `src/editor/monacoFormatters.js`
- ❌ `src/editor/monacoActions.js`
