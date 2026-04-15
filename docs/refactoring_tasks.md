# Tâches de refactoring structurel — Code Files Plugin

Projet : `c:\Users\dd200\Documents\Mes_projets\Mes repo obsidian new\obsidian-code-files-modif`

> **Important** : après chaque fichier modifié, vérifier avec :
> - `npx tsc --noEmit 2>&1 | Select-String "^src/"` → doit retourner vide
> - `npx eslint src/` → doit retourner exit 0
> - `npm run build` → doit réussir

---

## ✅ Traité — refactoring terminé

| # | Problème | Solution | Date |
|---|---------|----------|------|
| **S1** | `mountCodeEditor.ts` connaît `EditorSettingsModal`, `ChooseThemeModal`, `RenameExtensionModal` — violation de la séparation des responsabilités. Les handlers `open-formatter-config`, `open-theme-picker`, `open-rename-extension` devraient être délégués au caller via callbacks | Ajout de 3 callbacks optionnels (`onOpenEditorConfig`, `onOpenThemePicker`, `onOpenRenameExtension`) à la signature de `mountCodeEditor`. Les callers (`codeEditorView.ts`, `fenceEditModal.ts`) fournissent maintenant les callbacks qui ouvrent les modaux. `mountCodeEditor.ts` ne connaît plus les classes de modaux. | 2025-01 |
| **S5** | `chooseCssFileModal.ts` et `chooseHiddenFileModal.ts` construisent un `TFile` manuellement avec `@ts-expect-error` | Le hack de construction de `TFile` a été déplacé dans `CodeEditorView.openExternalFile()`. Cette méthode accepte maintenant un `string` (path) au lieu d'un `TFile`. Les modaux passent simplement le chemin, et `openExternalFile` construit le pseudo-TFile en interne. | 2025-01 |

---

## 🚧 Non traité — refactoring lourd

Ces points restent dans l'audit car ils nécessitent une refonte plus importante :

| # | Problème | Complexité |
|---|---------|-----------|
| **S4** | `CodeEditorView.openFile` construit un `CodeEditorView` manuellement (bypass API Obsidian) pour les fichiers hors vault | Moyenne — nécessite une alternative API stable |