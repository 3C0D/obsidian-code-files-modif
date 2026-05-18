# Projet Test Sample

Ce dossier contient un petit projet TypeScript avec 3 modules pour tester la navigation inter-fichiers dans Monaco Editor.

## Structure

- **utils.ts** — Module utilitaire avec des fonctions de base (add, multiply, formatMessage) et une classe Calculator
- **service.ts** — Module service qui importe et utilise les fonctions de utils.ts
- **main.ts** — Module principal qui importe et utilise les fonctions de service.ts et utils.ts

## Test de navigation

Pour tester la navigation inter-fichiers (Ctrl+Clic) :

1. Ouvrez `main.ts` dans Monaco Editor
2. Maintenez **Ctrl** et cliquez sur :
   - `MathService` (ligne 3) → devrait naviguer vers service.ts
   - `processNumbers` (ligne 3) → devrait naviguer vers service.ts
   - `add` (ligne 4) → devrait naviguer vers utils.ts
   - `Calculator` (ligne 4) → devrait naviguer vers utils.ts

3. Ouvrez `service.ts` dans Monaco Editor
4. Maintenez **Ctrl** et cliquez sur :
   - `add` (ligne 3) → devrait naviguer vers utils.ts
   - `multiply` (ligne 3) → devrait naviguer vers utils.ts
   - `formatMessage` (ligne 3) → devrait naviguer vers utils.ts
   - `Calculator` (ligne 3) → devrait naviguer vers utils.ts

## Note

La navigation inter-fichiers dans Monaco nécessite que Monaco puisse résoudre les chemins relatifs des imports. Cela dépend de la configuration TypeScript et de la façon dont Monaco gère les fichiers dans Obsidian.
